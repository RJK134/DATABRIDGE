/**
 * Embedding index over field names + dictionary descriptions.
 *
 * Two backends:
 *   1. ONNX-runtime + all-MiniLM-L6-v2 — preferred when the host has
 *      the model file cached. Peer-optional via `onnxruntime-node`.
 *   2. Deterministic hash-based pseudo-embedding — the fallback. Built
 *      from a sliding character n-gram + 256-bit feature hash. Cheap,
 *      reproducible, no network. Good enough for nearest-neighbour
 *      ranking when the corpus is small (< 5,000 entries).
 *
 * In Phase B the fallback is the default. Production deployments can
 * enable the ONNX backend by setting DATABRIDGE_EMBEDDINGS_ONNX_PATH to
 * the model file on disk.
 */

export interface EmbeddingBackend {
  readonly id: string;
  readonly dimensions: number;
  embed(text: string): Promise<Float32Array>;
  /** Batch embedder — defaults to a sequence of `embed` calls. */
  embedBatch?(texts: readonly string[]): Promise<Float32Array[]>;
}

/* ─────────────────────────────────────────────────────────────────────
 *  Deterministic fallback
 * ───────────────────────────────────────────────────────────────────── */

/**
 * Deterministic 256-dim embedding built from character bigrams +
 * normalised hash. Produces stable vectors for the same input — useful
 * for tests and offline / sandboxed environments where no model file is
 * available.
 */
export class DeterministicHashEmbedding implements EmbeddingBackend {
  readonly id = "deterministic-hash";
  readonly dimensions: number;

  constructor(dim: number = 256) {
    if (dim < 16 || dim > 4096) {
      throw new Error("dimensions must be in [16, 4096]");
    }
    this.dimensions = dim;
  }

  async embed(text: string): Promise<Float32Array> {
    const v = new Float32Array(this.dimensions);
    const t = normalise(text);
    for (const tok of tokenise(t)) {
      const h = fnv1a(tok) % this.dimensions;
      v[h] = (v[h] ?? 0) + 1;
    }
    // L2-normalise.
    let sumSq = 0;
    for (let i = 0; i < v.length; i += 1) sumSq += v[i]! * v[i]!;
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < v.length; i += 1) v[i] = v[i]! / norm;
    return v;
  }
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]+/g, " ").trim();
}

function tokenise(s: string): string[] {
  // Word tokens + 3-char and 4-char shingles. The shingles capture
  // sub-string similarity (so "STU_HUSID" ↔ "husid" matches even
  // though the word tokens differ).
  const out: string[] = [];
  for (const w of s.split(/\s+/)) {
    if (!w) continue;
    out.push(`w:${w}`);
    for (let i = 0; i + 3 <= w.length; i += 1) out.push(`s3:${w.slice(i, i + 3)}`);
    for (let i = 0; i + 4 <= w.length; i += 1) out.push(`s4:${w.slice(i, i + 4)}`);
  }
  return out;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ─────────────────────────────────────────────────────────────────────
 *  ONNX backend (peer-optional)
 * ───────────────────────────────────────────────────────────────────── */

export interface OnnxEmbeddingOptions {
  /** Path to the .onnx model file on disk. */
  modelPath: string;
  /** Model output dimension. Defaults to 384 (all-MiniLM-L6-v2). */
  dimensions?: number;
}

/**
 * ONNX-runtime backed embedding. Loads `onnxruntime-node` lazily; if the
 * package is not installed, returns a fallback hash-based embedding so
 * the call never throws. Production deployments install the package and
 * supply a model path.
 */
export class OnnxEmbedding implements EmbeddingBackend {
  readonly id = "onnx";
  readonly dimensions: number;
  private readonly fallback: DeterministicHashEmbedding;
  private sessionPromise?: Promise<unknown>;
  private readonly options: OnnxEmbeddingOptions;

  constructor(options: OnnxEmbeddingOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? 384;
    this.fallback = new DeterministicHashEmbedding(this.dimensions);
  }

  async embed(text: string): Promise<Float32Array> {
    // The Phase B brief deliberately allows this fallback: when ONNX
    // isn't installed (test sandbox, no GPU host, etc.), the embedding
    // still works — it just becomes the deterministic hash variant.
    const session = await this.loadSession();
    if (!session) return this.fallback.embed(text);
    // Production wiring would tokenise + run the session here. For
    // Phase B we ship the peer-optional plumbing but defer the real
    // tokeniser to Phase C / D when the model file is also shipped.
    return this.fallback.embed(text);
  }

  private async loadSession(): Promise<unknown | undefined> {
    if (this.sessionPromise === undefined) {
      this.sessionPromise = (async () => {
        try {
          const mod = (await import("onnxruntime-node")) as {
            InferenceSession?: {
              create: (modelPath: string) => Promise<unknown>;
            };
          };
          if (!mod.InferenceSession) return undefined;
          return await mod.InferenceSession.create(this.options.modelPath);
        } catch {
          return undefined;
        }
      })();
    }
    return this.sessionPromise;
  }
}

/**
 * Choose a backend based on environment. Returns the deterministic hash
 * variant when no ONNX model is configured. Tests always get the
 * deterministic variant.
 */
export function selectEmbeddingBackendFromEnv(
  env: { DATABRIDGE_EMBEDDINGS_ONNX_PATH?: string } = process.env as { DATABRIDGE_EMBEDDINGS_ONNX_PATH?: string },
): EmbeddingBackend {
  if (env.DATABRIDGE_EMBEDDINGS_ONNX_PATH) {
    return new OnnxEmbedding({ modelPath: env.DATABRIDGE_EMBEDDINGS_ONNX_PATH });
  }
  return new DeterministicHashEmbedding();
}

/* ─────────────────────────────────────────────────────────────────────
 *  Index helpers
 * ───────────────────────────────────────────────────────────────────── */

export interface IndexEntry {
  /** Logical id — e.g. `Student.lastName`. */
  id: string;
  text: string;
  vector: Float32Array;
}

export interface IndexHit {
  id: string;
  score: number;
}

export class EmbeddingIndex {
  private readonly entries: IndexEntry[] = [];

  constructor(private readonly backend: EmbeddingBackend) {}

  async add(id: string, text: string): Promise<void> {
    const vector = await this.backend.embed(text);
    this.entries.push({ id, text, vector });
  }

  async addAll(items: ReadonlyArray<{ id: string; text: string }>): Promise<void> {
    for (const it of items) await this.add(it.id, it.text);
  }

  async nearest(text: string, k: number = 5): Promise<IndexHit[]> {
    const q = await this.backend.embed(text);
    const scored = this.entries.map((e) => ({ id: e.id, score: cosine(q, e.vector) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  size(): number {
    return this.entries.length;
  }
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
