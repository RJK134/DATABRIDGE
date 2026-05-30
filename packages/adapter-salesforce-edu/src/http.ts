/**
 * Salesforce Education Cloud HTTP client.
 *
 * Auth: OAuth2 client-credentials → `services/oauth2/token`. The token is
 * cached in-process and refreshed when within 60 seconds of expiry.
 *
 * Endpoints used:
 *   - GET  /services/data/<version>/sobjects/<SObject>/describe
 *   - GET  /services/data/<version>/query/?q=<SOQL>
 *   - GET  /services/data/<version>/query/<locator>  (paging)
 *   - GET  /services/data/<version>/sobjects/<SObject>/<id>
 *
 * Retry: 429 / 5xx are retried with exponential backoff + jitter.
 */
import type { AdapterLogger } from "@databridge/adapter-spec";
import type { SalesforceEduConfig } from "./config.js";

/** Minimal `fetch` shape (testable). */
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

export interface SalesforceClientOptions {
  config: SalesforceEduConfig;
  /** Resolved client secret from the platform secrets accessor. */
  clientSecret: string;
  logger: AdapterLogger;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  baseBackoffMs?: number;
  /** Inject a fixed `now()` for cache-expiry tests. */
  now?: () => number;
}

interface TokenCache {
  accessToken: string;
  instanceUrl: string;
  /** Epoch ms when the token expires. */
  expiresAt: number;
}

export interface SoqlResponse<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export interface DescribeResponse {
  name: string;
  fields: Array<{
    name: string;
    label?: string;
    type: string;
    nillable?: boolean;
    custom?: boolean;
    referenceTo?: string[];
    picklistValues?: Array<{ value: string; label?: string; active?: boolean }>;
  }>;
}

export class SalesforceClient {
  private cache?: TokenCache;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: SalesforceClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
    if (!this.fetchImpl) {
      throw new Error("SalesforceClient: no fetch implementation available");
    }
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 250;
    this.now = opts.now ?? Date.now;
  }

  /** Acquire (or refresh) the OAuth2 client-credentials access token. */
  async getAccessToken(): Promise<TokenCache> {
    if (this.cache && this.cache.expiresAt - 60_000 > this.now()) {
      return this.cache;
    }
    const url = `${trimTrailing(this.opts.config.instanceUrl)}/services/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.opts.config.clientId,
      client_secret: this.opts.clientSecret,
    });
    if (this.opts.config.audience) body.set("audience", this.opts.config.audience);

    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: this.opts.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `salesforce: OAuth2 token request failed: ${resp.status} ${resp.statusText} — ${text}`
      );
    }
    const json = (await resp.json()) as {
      access_token: string;
      instance_url: string;
      expires_in?: number;
    };
    if (typeof json.access_token !== "string" || typeof json.instance_url !== "string") {
      throw new Error("salesforce: OAuth2 token response missing access_token/instance_url");
    }
    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
    this.cache = {
      accessToken: json.access_token,
      instanceUrl: json.instance_url,
      expiresAt: this.now() + expiresIn * 1000,
    };
    this.opts.logger.debug("salesforce: token acquired", {
      expiresIn,
      instanceUrl: json.instance_url,
    });
    return this.cache;
  }

  /** GET helper that respects the token + retry + abort signal. */
  async get<T = unknown>(pathOrUrl: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${trimTrailing(token.instanceUrl)}${ensureLeading(pathOrUrl)}`;
    return this.doWithRetry<T>(url, token.accessToken);
  }

  private async doWithRetry<T>(url: string, accessToken: string): Promise<T> {
    let attempt = 0;
    for (;;) {
      const resp = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: this.opts.signal,
      });
      if (resp.ok) {
        return (await resp.json()) as T;
      }
      const retryable = resp.status === 429 || resp.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        const text = await safeText(resp);
        throw new Error(
          `salesforce: GET ${url} failed: ${resp.status} ${resp.statusText} — ${text}`
        );
      }
      const retryAfter = parseRetryAfter(resp.headers.get("retry-after"));
      const wait = retryAfter ?? this.baseBackoffMs * Math.pow(2, attempt) * (0.5 + Math.random());
      this.opts.logger.warn("salesforce: retrying request", {
        attempt: attempt + 1,
        status: resp.status,
        wait,
      });
      await delay(wait);
      attempt += 1;
    }
  }

  /** Issue a SOQL query and return the first page. */
  async query<T = Record<string, unknown>>(soql: string): Promise<SoqlResponse<T>> {
    const path = `/services/data/${this.opts.config.apiVersion}/query/?q=${encodeURIComponent(
      soql
    )}`;
    return this.get<SoqlResponse<T>>(path);
  }

  /** Iterate all pages of a SOQL query. */
  async *queryAll<T = Record<string, unknown>>(soql: string): AsyncIterable<SoqlResponse<T>> {
    let page = await this.query<T>(soql);
    yield page;
    while (!page.done && page.nextRecordsUrl) {
      page = await this.get<SoqlResponse<T>>(page.nextRecordsUrl);
      yield page;
    }
  }

  /** SObject describe (cached at the caller layer if needed). */
  async describe(sObject: string): Promise<DescribeResponse> {
    const path = `/services/data/${this.opts.config.apiVersion}/sobjects/${sObject}/describe`;
    return this.get<DescribeResponse>(path);
  }

  /** Fetch a single SObject record by id. */
  async getRecord<T = Record<string, unknown>>(
    sObject: string,
    id: string,
    fields?: readonly string[]
  ): Promise<T | null> {
    const fieldClause = fields && fields.length > 0 ? `?fields=${fields.join(",")}` : "";
    const path = `/services/data/${this.opts.config.apiVersion}/sobjects/${sObject}/${id}${fieldClause}`;
    try {
      return await this.get<T>(path);
    } catch (err) {
      if (err instanceof Error && /\b404\b/.test(err.message)) return null;
      throw err;
    }
  }
}

function trimTrailing(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function ensureLeading(s: string): string {
  return s.startsWith("/") ? s : `/${s}`;
}

async function safeText(resp: { text(): Promise<string> }): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "<unreadable>";
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
