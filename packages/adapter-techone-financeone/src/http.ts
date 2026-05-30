/**
 * TechOne Connect HTTP client.
 *
 * Implements the slice of the Connect REST API the adapter actually uses:
 *
 *   - OAuth2 client-credentials token mint (cached + auto-refreshed)
 *   - Authenticated GET against /connect/api/v1/* with retry/backoff
 *   - 429 / 5xx retry honoring `Retry-After`
 *   - Cursor-based pagination (`pageNumber` + `pageSize`)
 *
 * The implementation is dependency-free — it uses the platform `fetch`
 * (Node 20+) so the package stays light and the runtime is the same as
 * the rest of the workspace.
 *
 * Tests inject a fake fetch via {@link TechOneConnectClient.constructor}
 * `fetchImpl` option. The default uses the global `fetch`.
 *
 * Reference: docs/TECHONE_DATA_STRUCTURES.md §14 ("Connect REST API"),
 * §18 ("Auth + rate limits").
 */
import type { AdapterLogger } from "@databridge/adapter-spec";
import type { TechOneFinanceOneConfig } from "./config.js";

/** Minimal `fetch` shape we actually depend on — keeps tests easy to stub. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface TechOneConnectClientOptions {
  /** Resolved adapter config. */
  config: TechOneFinanceOneConfig;
  /** Resolved client secret (already pulled from the secrets vault). */
  clientSecret: string;
  /** Logger for diagnostic events. */
  logger: AdapterLogger;
  /** Abort signal — propagated to every request. */
  signal: AbortSignal;
  /** Override `fetch` (tests inject a fake). Defaults to the global. */
  fetchImpl?: FetchLike;
  /**
   * Override the system clock — only used by tests. Returns ms since
   * epoch. Defaults to {@link Date.now}.
   */
  now?: () => number;
  /** Max retry attempts for 429/5xx (excluding the initial try). Default 3. */
  maxRetries?: number;
  /** Base backoff (ms) — doubled per attempt, jittered. Default 250. */
  baseBackoffMs?: number;
}

/** Bearer token with absolute expiry. */
interface TokenState {
  token: string;
  expiresAtMs: number;
}

export interface ConnectListResponse<T = Record<string, unknown>> {
  data: T[];
  pageNumber: number;
  pageSize: number;
  /** Connect returns `totalRecords` in list payloads — used to derive pagination. */
  totalRecords: number;
}

export interface ConnectGetOptions {
  /** Path segment after `/connect/api/v1/`, e.g. `financials/customers`. */
  path: string;
  /** Query string params. */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Live HTTP client for the TechOne Connect REST API.
 *
 * Stateful only in the auth-token cache. All retry / pagination logic
 * is pure. The adapter holds one instance per AdapterContext invocation.
 */
export class TechOneConnectClient {
  private readonly config: TechOneFinanceOneConfig;
  private readonly clientSecret: string;
  private readonly logger: AdapterLogger;
  private readonly signal: AbortSignal;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  private token: TokenState | undefined;

  constructor(opts: TechOneConnectClientOptions) {
    this.config = opts.config;
    this.clientSecret = opts.clientSecret;
    this.logger = opts.logger;
    this.signal = opts.signal;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.now = opts.now ?? (() => Date.now());
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 250;
  }

  /** Currently cached token — exposed for diagnostics + tests. */
  getCachedToken(): Readonly<TokenState> | undefined {
    return this.token;
  }

  /**
   * OAuth2 client-credentials grant. The Connect tenant exposes
   * `/connect/api/v1/oauth2/token` with the standard form-encoded
   * client_credentials flow.
   *
   * Tokens are cached until 60s before expiry to absorb clock skew.
   */
  async getAccessToken(): Promise<string> {
    const cushionMs = 60_000;
    if (this.token && this.token.expiresAtMs > this.now() + cushionMs) {
      return this.token.token;
    }

    const url = `${this.stripTrailingSlash(this.config.tenantUrl)}/connect/api/v1/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.clientSecret,
    }).toString();

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      signal: this.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `techone-connect: token mint failed: ${res.status} ${res.statusText} — ${text}`
      );
    }

    const json = (await res.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
      throw new Error("techone-connect: token response missing access_token/expires_in");
    }
    this.token = {
      token: json.access_token,
      expiresAtMs: this.now() + json.expires_in * 1000,
    };
    this.logger.debug("techone-connect: minted new token", {
      expiresInSec: json.expires_in,
    });
    return this.token.token;
  }

  /**
   * Authenticated GET. Retries on 429 (honoring `Retry-After`) and on
   * transient 5xx. Returns parsed JSON on 2xx.
   */
  async get<T = unknown>(opts: ConnectGetOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const token = await this.getAccessToken();
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        signal: this.signal,
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      // 401 — token invalid/expired despite cushion. Force-refresh once.
      if (res.status === 401 && attempt === 0) {
        this.token = undefined;
        attempt++;
        continue;
      }

      // 429 / 5xx — backoff and retry.
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const retryAfter = this.parseRetryAfter(res.headers.get("retry-after"));
        const backoff = retryAfter ?? this.computeBackoff(attempt);
        const text = await res.text().catch(() => "");
        this.logger.warn("techone-connect: retrying", {
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

      // Non-retryable.
      const text = await res.text().catch(() => "");
      throw new Error(
        `techone-connect: ${res.status} ${res.statusText} on ${url} — ${text.slice(0, 500)}`
      );
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`techone-connect: exhausted retries on ${url}`);
  }

  /**
   * List endpoint pagination — yields each page in order. Caller can
   * `break` to stop early. Pages use the configured `pageSize`.
   */
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
    path: string,
    query: Record<string, string | number | boolean | undefined> | undefined
  ): string {
    const base = `${this.stripTrailingSlash(this.config.tenantUrl)}/connect/api/v1/${this.stripLeadingSlash(path)}`;
    if (!query) return base;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    const tail = qs.toString();
    return tail ? `${base}?${tail}` : base;
  }

  private parseRetryAfter(header: string | null): number | undefined {
    if (!header) return undefined;
    // Spec allows seconds OR HTTP-date.
    const asInt = Number.parseInt(header, 10);
    if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - this.now());
    return undefined;
  }

  private computeBackoff(attempt: number): number {
    // 250ms · 2^attempt with ±20% jitter. Cap at 30s.
    const exp = Math.min(this.baseBackoffMs * 2 ** attempt, 30_000);
    const jitter = exp * (0.8 + Math.random() * 0.4);
    return Math.round(jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(), ms);
      // Dispose timer if aborted.
      if (this.signal.aborted) clearTimeout(t);
    });
  }

  private stripTrailingSlash(s: string): string {
    return s.endsWith("/") ? s.slice(0, -1) : s;
  }

  private stripLeadingSlash(s: string): string {
    return s.startsWith("/") ? s.slice(1) : s;
  }
}
