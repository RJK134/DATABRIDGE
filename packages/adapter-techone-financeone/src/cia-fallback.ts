/**
 * TechOne CIA cube fallback.
 *
 * Connect REST is the primary integration but enforces a hard 1000/min
 * rate limit. During large reconciliation windows tenants hit the limit
 * for tens of minutes at a time — the Connect API returns sustained
 * 429s and the adapter stalls.
 *
 * The CIA (Core Integration & Analytics) cube is a separate read path
 * exposed by TechOne for analytics workloads. In production it is
 * typically reached via ODBC + a dblink to the cube schema, but T1
 * also exposes a REST shim under `/cia/cube/v1/*` that returns the
 * same row shape with a more generous rate limit (analytics, not
 * transactional). For v1.2 we model the fallback against the REST
 * shim — production sites with ODBC swap in their own client via
 * dependency injection without changing the adapter contract.
 *
 * Activation: the fallback only fires when
 *   1. `config.enableCiaFallback === true` AND
 *   2. the {@link CiaFallbackController} observes sustained 429s on
 *      the Connect path within a configurable window.
 *
 * Once activated, every subsequent read for the active resource flows
 * through the cube client until the cooldown lapses. The Connect path
 * resumes for new resources / new requests after the cooldown.
 *
 * Reference: docs/TECHONE_DATA_STRUCTURES.md §14 ("Connect REST API"),
 * §17 ("CIA cube"), §18 ("Auth + rate limits").
 */
import type { AdapterLogger } from "@databridge/adapter-spec";
import type { TechOneFinanceOneConfig } from "./config.js";
import type { FetchLike, ConnectGetOptions, ConnectListResponse } from "./http.js";

/* -------------------------------- client ---------------------------------- */

export interface CiaCubeClientOptions {
  config: TechOneFinanceOneConfig;
  /** Auth token for the cube REST shim — usually the same OAuth2 token. */
  bearerToken: string;
  logger: AdapterLogger;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  baseBackoffMs?: number;
}

/**
 * Read-only client for the CIA cube REST shim.
 *
 * The cube returns the same `ConnectListResponse` shape as Connect for
 * the fact tables we care about (`Customers`, `Invoices`, `Receipts`,
 * `GlPostings`). Path mapping:
 *
 *   /connect/api/v1/financials/ar/customers     ↔ /cia/cube/v1/customers
 *   /connect/api/v1/financials/ar/invoices      ↔ /cia/cube/v1/invoices
 *   /connect/api/v1/financials/ar/receipts      ↔ /cia/cube/v1/receipts
 *   /connect/api/v1/financials/gl/postings      ↔ /cia/cube/v1/gl_postings
 *
 * Resources not modelled in the cube fall back to an empty result set —
 * the adapter logs a warning and the caller can decide whether to
 * surface this.
 */
export class CiaCubeClient {
  private readonly config: TechOneFinanceOneConfig;
  private readonly bearerToken: string;
  private readonly logger: AdapterLogger;
  private readonly signal: AbortSignal;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(opts: CiaCubeClientOptions) {
    this.config = opts.config;
    this.bearerToken = opts.bearerToken;
    this.logger = opts.logger;
    this.signal = opts.signal;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 250;
  }

  /**
   * Translate a Connect path to its CIA cube equivalent. Returns
   * undefined when the resource is not modelled in the cube — callers
   * fall back to an empty page in that case.
   */
  static cubePathFor(connectPath: string): string | undefined {
    const map: Record<string, string> = {
      "financials/ar/customers": "customers",
      "financials/ar/invoices": "invoices",
      "financials/ar/receipts": "receipts",
      "financials/gl/postings": "gl_postings",
    };
    // `connectPath` may have trailing segments (e.g. /<id>) — normalise.
    const normalised = connectPath.replace(/^\/+/, "");
    for (const [k, v] of Object.entries(map)) {
      if (normalised === k) return v;
      if (normalised.startsWith(`${k}/`)) {
        return `${v}/${normalised.slice(k.length + 1)}`;
      }
    }
    return undefined;
  }

  /**
   * Authenticated GET against the cube. Same retry semantics as Connect
   * but tuned for analytics workloads (longer backoff cap).
   */
  async get<T = unknown>(opts: ConnectGetOptions): Promise<T> {
    const cubePath = CiaCubeClient.cubePathFor(opts.path);
    if (!cubePath) {
      throw new Error(`cia-fallback: resource not modelled in cube: ${opts.path}`);
    }
    const url = this.buildUrl(cubePath, opts.query);
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.bearerToken}`,
          accept: "application/json",
        },
        signal: this.signal,
      });

      if (res.ok) return (await res.json()) as T;

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const backoff = this.computeBackoff(attempt);
        const text = await res.text().catch(() => "");
        this.logger.warn("cia-fallback: retrying", {
          status: res.status,
          attempt,
          backoffMs: backoff,
          body: text.slice(0, 200),
        });
        lastError = new Error(`HTTP ${res.status} on ${url}`);
        await this.sleep(backoff);
        attempt++;
        continue;
      }

      const text = await res.text().catch(() => "");
      throw new Error(
        `cia-fallback: ${res.status} ${res.statusText} on ${url} — ${text.slice(0, 500)}`
      );
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`cia-fallback: exhausted retries on ${url}`);
  }

  /** Cube pagination matches Connect's pageNumber/pageSize shape. */
  async *paginate<T = Record<string, unknown>>(
    opts: ConnectGetOptions
  ): AsyncIterable<ConnectListResponse<T>> {
    let pageNumber = 1;
    while (true) {
      const page = await this.get<ConnectListResponse<T>>({
        path: opts.path,
        query: {
          ...opts.query,
          pageNumber,
          pageSize: this.config.pageSize,
        },
      });
      yield page;
      const seen = pageNumber * page.pageSize;
      if (seen >= page.totalRecords || page.data.length === 0) return;
      pageNumber++;
    }
  }

  private buildUrl(
    cubePath: string,
    query: Record<string, string | number | boolean | undefined> | undefined
  ): string {
    const base = `${this.config.tenantUrl.replace(/\/$/, "")}/cia/cube/v1/${cubePath}`;
    if (!query) return base;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    const tail = qs.toString();
    return tail ? `${base}?${tail}` : base;
  }

  private computeBackoff(attempt: number): number {
    const exp = Math.min(this.baseBackoffMs * 2 ** attempt, 60_000);
    const jitter = exp * (0.8 + Math.random() * 0.4);
    return Math.round(jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(), ms);
      if (this.signal.aborted) clearTimeout(t);
    });
  }
}

/* ------------------------------- controller ------------------------------- */

export interface CiaFallbackControllerOptions {
  /**
   * Max consecutive 429s on a single (resource, request) before we
   * trip the breaker and switch to the cube. Default: 3.
   */
  threshold?: number;
  /**
   * How long the breaker stays open once tripped (ms). After this
   * window the next call goes back through Connect. Default: 5 minutes.
   */
  cooldownMs?: number;
  /** Override the system clock — tests inject a deterministic now(). */
  now?: () => number;
  /** Optional logger. */
  logger?: AdapterLogger;
}

/**
 * Tracks sustained-429 events and exposes a per-resource breaker.
 *
 * The controller is intentionally simple: per-resource counter + a
 * per-resource open-until timestamp. No global state, no exponential
 * decay — production deployments can swap a richer policy in via the
 * DI seam if needed.
 */
export class CiaFallbackController {
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly logger: AdapterLogger | undefined;

  private readonly counts = new Map<string, number>();
  private readonly openUntil = new Map<string, number>();

  constructor(opts: CiaFallbackControllerOptions = {}) {
    this.threshold = opts.threshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 5 * 60_000;
    this.now = opts.now ?? (() => Date.now());
    this.logger = opts.logger;
  }

  /** Whether the breaker is open for the given resource. */
  shouldFallback(resource: string): boolean {
    const until = this.openUntil.get(resource);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.openUntil.delete(resource);
      this.counts.delete(resource);
      return false;
    }
    return true;
  }

  /**
   * Record a 429 against a resource. When the threshold is hit, the
   * breaker trips and {@link shouldFallback} returns true until the
   * cooldown lapses.
   */
  recordRateLimit(resource: string): void {
    const next = (this.counts.get(resource) ?? 0) + 1;
    this.counts.set(resource, next);
    if (next >= this.threshold) {
      const until = this.now() + this.cooldownMs;
      this.openUntil.set(resource, until);
      this.logger?.warn("cia-fallback: breaker tripped", {
        resource,
        consecutive429s: next,
        cooldownUntilMs: until,
      });
    }
  }

  /** Reset on success — successful Connect calls clear the count. */
  recordSuccess(resource: string): void {
    if (this.counts.has(resource)) this.counts.delete(resource);
  }

  /** Manual override for tests / runbooks. */
  reset(resource?: string): void {
    if (resource) {
      this.counts.delete(resource);
      this.openUntil.delete(resource);
    } else {
      this.counts.clear();
      this.openUntil.clear();
    }
  }

  /** Diagnostic snapshot — exposed for tests + status endpoints. */
  snapshot(): { counts: Record<string, number>; openUntil: Record<string, number> } {
    return {
      counts: Object.fromEntries(this.counts),
      openUntil: Object.fromEntries(this.openUntil),
    };
  }
}
