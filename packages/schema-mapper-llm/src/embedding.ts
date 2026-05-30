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
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .trim();
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

/** Token ids + attention mask for one encoded string. */
export interface TokeniserEncoding {
  inputIds: number[];
  attentionMask: number[];
}

/** A WordPiece/BPE tokeniser for the sentence-transformer model. */
export interface OnnxTokeniser {
  encode(text: string): TokeniserEncoding;
}

/** Minimal ONNX tensor shape (matches `onnxruntime-node`'s Tensor). */
export interface OnnxTensorLike {
  data: ArrayLike<number> | ArrayLike<bigint>;
  dims: readonly number[];
}

/** Minimal ONNX session surface — the subset we invoke. */
export interface OnnxSessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, OnnxTensorLike>>;
}

export interface OnnxEmbeddingOptions {
  /** Path to the .onnx model file on disk. */
  modelPath: string;
  /** Model output dimension. Defaults to 384 (all-MiniLM-L6-v2). */
  dimensions?: number;
  /**
   * Tokeniser. Defaults to a lightweight hashing tokeniser — a stand-in
   * that keeps the pipeline runnable. A faithful WordPiece tokeniser with
   * the model's `vocab.txt` should be supplied for production parity (see
   * the install procedure in the package README).
   */
  tokeniser?: OnnxTokeniser;
  /** Test/custom seam — build a session without `onnxruntime-node`. */
  sessionFactory?: (modelPath: string) => Promise<OnnxSessionLike | undefined>;
  /** Name of the model output to mean-pool. Defaults to "last_hidden_state". */
  outputName?: string;
  /** Vocab size used by the default hashing tokeniser. Defaults to 30522. */
  vocabSize?: number;
}

/**
 * Lightweight stand-in tokeniser: maps word/sub-word tokens to ids in
 * `[0, vocabSize)` via FNV-1a, with [CLS]/[SEP] sentinels and an all-ones
 * attention mask. Deterministic and dependency-free. Not vocabulary-faithful
 * to all-MiniLM — supply a real WordPiece tokeniser for production parity.
 */
export class HashingTokeniser implements OnnxTokeniser {
  constructor(private readonly vocabSize: number = 30522) {}

  encode(text: string): TokeniserEncoding {
    const CLS = 101;
    const SEP = 102;
    const ids: number[] = [CLS];
    for (const tok of tokenise(normalise(text))) {
      ids.push((fnv1a(tok) % (this.vocabSize - 103)) + 103);
    }
    ids.push(SEP);
    return { inputIds: ids, attentionMask: ids.map(() => 1) };
  }
}

/**
 * Mean-pool a `[1, seqLen, hidden]` model output over the attention mask
 * and L2-normalise — the standard sentence-transformer pooling.
 */
export function meanPool(
  data: ArrayLike<number>,
  dims: readonly number[],
  attentionMask: readonly number[],
): Float32Array {
  const seqLen = dims[1] ?? 0;
  const hidden = dims[2] ?? 0;
  const out = new Float32Array(hidden);
  let counted = 0;
  for (let t = 0; t < seqLen; t += 1) {
    if ((attentionMask[t] ?? 1) === 0) continue;
    counted += 1;
    const base = t * hidden;
    for (let h = 0; h < hidden; h += 1) {
      out[h] = (out[h] ?? 0) + Number(data[base + h] ?? 0);
    }
  }
  const denom = counted || 1;
  for (let h = 0; h < hidden; h += 1) out[h] = (out[h] ?? 0) / denom;
  return l2normalise(out);
}

function l2normalise(v: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < v.length; i += 1) sumSq += v[i]! * v[i]!;
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < v.length; i += 1) v[i] = v[i]! / norm;
  return v;
}

interface OnnxRuntimeModuleLike {
  InferenceSession?: { create: (modelPath: string) => Promise<OnnxSessionLike> };
  Tensor?: new (type: string, data: unknown, dims: readonly number[]) => unknown;
}

/**
 * ONNX-runtime backed embedding. Loads `onnxruntime-node` lazily; when the
 * package or the model file is absent it falls back to the deterministic
 * hash embedding so the call never throws. When a session is available it
 * runs the real pipeline: tokenise → session.run → mean-pool → normalise.
 *
 * Production deployments install `onnxruntime-node`, set
 * `DATABRIDGE_EMBEDDINGS_ONNX_PATH` to the model file, and supply a faithful
 * WordPiece tokeniser. See the package README for the install procedure.
 */
export class OnnxEmbedding implements EmbeddingBackend {
  readonly id = "onnx";
  readonly dimensions: number;
  private readonly fallback: DeterministicHashEmbedding;
  private readonly tokeniser: OnnxTokeniser;
  private readonly outputName: string;
  private sessionPromise?: Promise<OnnxSessionLike | undefined>;
  private tensorCtor:
    | (new (type: string, data: unknown, dims: readonly number[]) => unknown)
    | undefined;
  private readonly options: OnnxEmbeddingOptions;

  constructor(options: OnnxEmbeddingOptions) {
    this.options = options;
    this.dimensions = options.dimensions ?? 384;
    this.fallback = new DeterministicHashEmbedding(this.dimensions);
    this.tokeniser = options.tokeniser ?? new HashingTokeniser(options.vocabSize);
    this.outputName = options.outputName ?? "last_hidden_state";
  }

  async embed(text: string): Promise<Float32Array> {
    const session = await this.loadSession();
    if (!session) return this.fallback.embed(text);
    try {
      const enc = this.tokeniser.encode(text);
      const outputs = await session.run(this.buildFeeds(enc));
      const tensor = outputs[this.outputName] ?? Object.values(outputs)[0];
      if (!tensor) return this.fallback.embed(text);
      return meanPool(
        tensor.data as ArrayLike<number>,
        tensor.dims,
        enc.attentionMask,
      );
    } catch {
      // Any inference error degrades gracefully to the deterministic path.
      return this.fallback.embed(text);
    }
  }

  /**
   * Build session feeds. Uses the runtime's `Tensor` when available (live
   * path); otherwise emits plain `{ type, data, dims }` objects that an
   * injected fake session can consume.
   */
  private buildFeeds(enc: TokeniserEncoding): Record<string, unknown> {
    const len = enc.inputIds.length;
    const T = this.tensorCtor;
    if (T) {
      const toI64 = (xs: number[]): BigInt64Array =>
        BigInt64Array.from(xs.map((x) => BigInt(x)));
      return {
        input_ids: new T("int64", toI64(enc.inputIds), [1, len]),
        attention_mask: new T("int64", toI64(enc.attentionMask), [1, len]),
        token_type_ids: new T("int64", toI64(enc.inputIds.map(() => 0)), [1, len]),
      };
    }
    return {
      input_ids: { type: "int64", data: enc.inputIds, dims: [1, len] },
      attention_mask: { type: "int64", data: enc.attentionMask, dims: [1, len] },
    };
  }

  private async loadSession(): Promise<OnnxSessionLike | undefined> {
    if (this.sessionPromise === undefined) {
      this.sessionPromise = (async () => {
        if (this.options.sessionFactory) {
          return this.options.sessionFactory(this.options.modelPath);
        }
        try {
          const mod = (await import("onnxruntime-node")) as OnnxRuntimeModuleLike;
          if (!mod.InferenceSession) return undefined;
          if (mod.Tensor) this.tensorCtor = mod.Tensor;
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
  env: { DATABRIDGE_EMBEDDINGS_ONNX_PATH?: string } = process.env as {
    DATABRIDGE_EMBEDDINGS_ONNX_PATH?: string;
  }
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
