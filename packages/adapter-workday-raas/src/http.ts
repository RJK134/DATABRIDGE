/**
 * Workday RaaS (Reports-as-a-Service) HTTP client.
 *
 * Workday RaaS is a REST-style endpoint per published Custom Report — a
 * single GET against `<tenantUrl>/<reportName>?format=json` returns the
 * full report payload. The shape is:
 *
 *   {
 *     "Report_Entry": [ { ...rowFields }, ... ]
 *   }
 *
 * RaaS supports two pagination strategies depending on tenant config:
 *   1. None — the report returns the full set in one response. This is
 *      the common case for reference data.
 *   2. Date-window prompts — large fact reports take `Effective_Date`
 *      and `Last_Modified_Since` prompts the caller drives.
 *
 * Auth is HTTP Basic with an Integration System User (ISU). Workday
 * accepts the credentials on every request — there is no token mint /
 * refresh dance like Connect REST. The adapter resolves the password
 * via the platform secrets accessor and passes it to this client.
 *
 * Retries: Workday returns 503 / 429 under load. We honour
 * `Retry-After` and back off with jitter, capped at `maxRetries`.
 *
 * Reference: docs/WORKDAY_RAAS_INTEGRATION.md §3 (auth) and §5 (paging).
 */
import type { AdapterLogger } from "@databridge/adapter-spec";
import type { WorkdayRaasConfig } from "./config.js";

/** Minimal `fetch` shape we depend on — keeps tests easy to stub. */
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

export interface WorkdayRaasClientOptions {
  /** Resolved adapter config. */
  config: WorkdayRaasConfig;
  /** Resolved ISU password (already pulled from the secrets vault). */
  password: string;
  /** Logger for diagnostic events. */
  logger: AdapterLogger;
  /** Abort signal — propagated to every request. */
  signal: AbortSignal;
  /** Override `fetch` (tests inject a fake). Defaults to the global. */
  fetchImpl?: FetchLike;
  /** Max retry attempts for 429/5xx (excluding the initial try). Default 3. */
  maxRetries?: number;
  /** Base backoff (ms) — doubled per attempt, jittered. Default 250. */
  baseBackoffMs?: number;
}

export interface RaasReportResponse<T = Record<string, unknown>> {
  /** Workday wraps result rows under `Report_Entry`. */
  Report_Entry?: T[];
  /** Some reports use the inner key only. We tolerate either shape. */
  [key: string]: unknown;
}

export interface RaasGetOptions {
  /** Report name as published in Workday — the path segment after tenantUrl. */
  reportName: string;
  /** Query string params (prompts, format override, etc.). */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * Live HTTP client for Workday RaaS reports.
 *
 * Stateless — Basic auth header is computed per request from the
 * configured ISU username + resolved password. Retry / extraction logic
 * is pure.
 */
export class WorkdayRaasClient {
  private readonly config: WorkdayRaasConfig;
  private readonly password: string;
  private readonly logger: AdapterLogger;
  private readonly signal: AbortSignal;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;

  constructor(opts: WorkdayRaasClientOptions) {
    this.config = opts.config;
    this.password = opts.password;
    this.logger = opts.logger;
    this.signal = opts.signal;
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 250;
  }

  /** Build the HTTP Basic header value for the configured ISU. */
  authHeader(): string {
    // btoa is available in modern Node + browsers; fall back to Buffer.
    const raw = `${this.config.username}:${this.password}`;
    const b64 =
      typeof btoa === "function" ? btoa(raw) : Buffer.from(raw, "utf8").toString("base64");
    return `Basic ${b64}`;
  }

  /**
   * Authenticated GET against `<tenantUrl>/<reportName>?format=...`.
   * Retries 429/5xx honouring `Retry-After`. Returns the parsed JSON
   * report payload.
   */
  async get<T = Record<string, unknown>>(opts: RaasGetOptions): Promise<RaasReportResponse<T>> {
    const url = this.buildUrl(opts.reportName, opts.query);
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.maxRetries) {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: this.authHeader(),
          accept: "application/json",
        },
        signal: this.signal,
      });

      if (res.ok) {
        const json = (await res.json()) as RaasReportResponse<T>;
        return json;
      }

      // 429 / 5xx — backoff and retry.
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const retryAfter = this.parseRetryAfter(res.headers.get("retry-after"));
        const backoff = retryAfter ?? this.computeBackoff(attempt);
        const text = await res.text().catch(() => "");
        this.logger.warn("workday-raas: retrying", {
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
        `workday-raas: ${res.status} ${res.statusText} on ${url} — ${text.slice(0, 500)}`
      );
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`workday-raas: exhausted retries on ${url}`);
  }

  /**
   * Extract `Report_Entry` rows from a RaaS payload. RaaS sometimes
   * returns a top-level array, sometimes wraps under `Report_Entry`.
   * This normaliser accepts both.
   */
  static extractRows<T = Record<string, unknown>>(payload: RaasReportResponse<T> | T[]): T[] {
    if (Array.isArray(payload)) return payload;
    const wrapped = payload?.Report_Entry;
    if (Array.isArray(wrapped)) return wrapped;
    return [];
  }

  /**
   * Pagination shim — RaaS itself is rarely paginated, but for large
   * reports the tenant publishes a `Last_Modified_Since` cursor. The
   * adapter passes a cursor through here; we yield once if cursorless.
   */
  async *paginate<T = Record<string, unknown>>(
    opts: RaasGetOptions
  ): AsyncIterable<{ rows: T[]; total: number; cursor?: string }> {
    // Workday RaaS returns whole payload; we do one pass.
    const payload = await this.get<T>(opts);
    const rows = WorkdayRaasClient.extractRows<T>(payload);
    yield { rows, total: rows.length };
  }

  private buildUrl(
    reportName: string,
    query: Record<string, string | number | boolean | undefined> | undefined
  ): string {
    const base = `${this.stripTrailingSlash(this.config.tenantUrl)}/${this.stripLeadingSlash(reportName)}`;
    const qs = new URLSearchParams();
    qs.set("format", this.config.format);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        qs.set(k, String(v));
      }
    }
    return `${base}?${qs.toString()}`;
  }

  private parseRetryAfter(header: string | null): number | undefined {
    if (!header) return undefined;
    const asInt = Number.parseInt(header, 10);
    if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
    return undefined;
  }

  private computeBackoff(attempt: number): number {
    const exp = Math.min(this.baseBackoffMs * 2 ** attempt, 30_000);
    const jitter = exp * (0.8 + Math.random() * 0.4);
    return Math.round(jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(), ms);
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
