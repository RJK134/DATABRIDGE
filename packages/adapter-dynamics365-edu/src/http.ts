/**
 * Dataverse Web API HTTP client.
 *
 * Endpoints:
 *   - POST https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token
 *     scope=<dataverseUrl>/.default (Azure AD client_credentials)
 *   - GET  <dataverseUrl>/api/data/<version>/<entitySet>?$select=...$filter=...
 *   - GET  <dataverseUrl>/api/data/<version>/EntityDefinitions(LogicalName='<logical>')?$expand=Attributes
 *   - GET  <dataverseUrl>/api/data/<version>/<entitySet>(<id>)?$select=...
 *
 * Paging: Dataverse returns `@odata.nextLink` for additional pages.
 * Retry: 429 / 5xx with exponential backoff + jitter; Retry-After honoured.
 */
import type { AdapterLogger } from "@databridge/adapter-spec";
import type { Dynamics365EduConfig } from "./config.js";

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

export interface DataverseClientOptions {
  config: Dynamics365EduConfig;
  clientSecret: string;
  logger: AdapterLogger;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
  maxRetries?: number;
  baseBackoffMs?: number;
  now?: () => number;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export interface ODataPage<T = Record<string, unknown>> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

export interface AttributeMetadata {
  LogicalName: string;
  DisplayName?: { UserLocalizedLabel?: { Label?: string } };
  AttributeType?: string;
  RequiredLevel?: { Value?: string };
  IsCustomAttribute?: boolean;
  Targets?: string[];
  OptionSet?: {
    Options?: Array<{
      Value: number;
      Label?: { UserLocalizedLabel?: { Label?: string } };
    }>;
  };
}

export interface EntityDefinition {
  LogicalName: string;
  EntitySetName?: string;
  Attributes: AttributeMetadata[];
}

export class DataverseClient {
  private cache?: TokenCache;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: DataverseClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
    if (!this.fetchImpl) {
      throw new Error("DataverseClient: no fetch implementation available");
    }
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseBackoffMs = opts.baseBackoffMs ?? 250;
    this.now = opts.now ?? Date.now;
  }

  async getAccessToken(): Promise<TokenCache> {
    if (this.cache && this.cache.expiresAt - 60_000 > this.now()) return this.cache;
    const url = `https://login.microsoftonline.com/${this.opts.config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.opts.config.clientId,
      client_secret: this.opts.clientSecret,
      scope: `${trimTrailing(this.opts.config.dataverseUrl)}/.default`,
    });
    const resp = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: this.opts.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `dataverse: OAuth2 token request failed: ${resp.status} ${resp.statusText} — ${text}`
      );
    }
    const json = (await resp.json()) as { access_token: string; expires_in?: number };
    if (typeof json.access_token !== "string") {
      throw new Error("dataverse: OAuth2 token response missing access_token");
    }
    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
    this.cache = {
      accessToken: json.access_token,
      expiresAt: this.now() + expiresIn * 1000,
    };
    this.opts.logger.debug("dataverse: token acquired", { expiresIn });
    return this.cache;
  }

  async get<T = unknown>(pathOrUrl: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${trimTrailing(this.opts.config.dataverseUrl)}/api/data/${this.opts.config.apiVersion}${ensureLeading(pathOrUrl)}`;
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
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: "odata.include-annotations=*",
        },
        signal: this.opts.signal,
      });
      if (resp.ok) return (await resp.json()) as T;
      const retryable = resp.status === 429 || resp.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        const text = await safeText(resp);
        throw new Error(
          `dataverse: GET ${url} failed: ${resp.status} ${resp.statusText} — ${text}`
        );
      }
      const retryAfter = parseRetryAfter(resp.headers.get("retry-after"));
      const wait = retryAfter ?? this.baseBackoffMs * Math.pow(2, attempt) * (0.5 + Math.random());
      this.opts.logger.warn("dataverse: retrying", {
        attempt: attempt + 1,
        status: resp.status,
        wait,
      });
      await delay(wait);
      attempt += 1;
    }
  }

  /** Issue an OData query (single page). */
  async query<T = Record<string, unknown>>(
    entitySet: string,
    options: { select?: string; filter?: string; top?: number } = {}
  ): Promise<ODataPage<T>> {
    const parts: string[] = [];
    if (options.select) parts.push(`$select=${options.select}`);
    if (options.filter) parts.push(`$filter=${encodeURIComponent(options.filter)}`);
    if (options.top) parts.push(`$top=${options.top}`);
    const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
    return this.get<ODataPage<T>>(`/${entitySet}${qs}`);
  }

  async *queryAll<T = Record<string, unknown>>(
    entitySet: string,
    options: { select?: string; filter?: string } = {}
  ): AsyncIterable<ODataPage<T>> {
    let page = await this.query<T>(entitySet, options);
    yield page;
    while (page["@odata.nextLink"]) {
      page = await this.get<ODataPage<T>>(page["@odata.nextLink"]);
      yield page;
    }
  }

  async describe(logicalName: string): Promise<EntityDefinition> {
    const path = `/EntityDefinitions(LogicalName='${logicalName}')?$expand=Attributes`;
    return this.get<EntityDefinition>(path);
  }

  async getRecord<T = Record<string, unknown>>(
    entitySet: string,
    id: string,
    select?: string
  ): Promise<T | null> {
    const qs = select ? `?$select=${select}` : "";
    try {
      return await this.get<T>(`/${entitySet}(${id})${qs}`);
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
  const d = Date.parse(value);
  if (Number.isFinite(d)) return Math.max(0, d - Date.now());
  return undefined;
}
function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
