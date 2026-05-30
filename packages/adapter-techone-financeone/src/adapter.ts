/**
 * Technology One Finance One — source adapter.
 *
 * Read adapter implementing the SourceAdapter contract. Targets the
 * TechOne Connect REST API (§14, §18 of docs/TECHONE_DATA_STRUCTURES.md)
 * as the primary integration. Each canonical "resource" maps to a
 * Connect API entity.
 *
 * Live HTTP path: the adapter delegates to {@link TechOneConnectClient}
 * for healthCheck / sampleTable / streamRows / getRecordById whenever
 * it can resolve the OAuth2 client secret. When the secret cannot be
 * resolved (e.g. local dev or contract tests with a stub secrets
 * accessor returning `undefined`) the adapter falls back to a
 * deterministic stub path so contract tests stay hermetic. The fallback
 * path matches the v1.0.0 behaviour exactly.
 *
 * Tests can also inject a fake HTTP client via the `httpClientFactory`
 * constructor option to exercise the live path without a real tenant.
 */
import type {
  SourceAdapter,
  AdapterCapabilities,
  AdapterContext,
  HealthCheckResult,
  SampleTableArgs,
  SampledRow,
  StreamRowsArgs,
  StreamRowsPage,
  GetRecordByIdArgs,
} from "@databridge/adapter-spec";
import type { SchemaDescriptor, CodeList, DictionaryEntry } from "@databridge/adapter-spec";

import { TechOneFinanceOneConfigSchema, type TechOneFinanceOneConfig } from "./config.js";
import {
  TechOneConnectClient,
  type TechOneConnectClientOptions,
  type ConnectListResponse,
} from "./http.js";
import { CONNECT_RESOURCE_PATH, CONNECT_RESOURCE_PK } from "./resource-map.js";

/**
 * Logical resource names exposed by this adapter. These are CANONICAL
 * names, not raw T1 table names — the adapter handles the mapping to
 * `T1_AR_CUSTOMER`, `T1_AR_TRANSACTION`, etc. internally.
 *
 * See docs/TECHONE_DATA_STRUCTURES.md §5–§13.
 */
export const SUPPORTED_RESOURCES = [
  "Customers",
  "Sponsors",
  "Products",
  "PriceLists",
  "Invoices",
  "CreditNotes",
  "Receipts",
  "Allocations",
  "GlPostings",
  "ExchangeRates",
  "WorkflowInstances",
  "ImportStaging",
] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

/**
 * Optional adapter wiring — tests use this to inject a fake HTTP client
 * (and therefore exercise the live path) without a real tenant.
 */
export interface TechOneFinanceOneAdapterOptions {
  /**
   * Factory invoked once per AdapterContext-bearing call when the
   * adapter needs HTTP. Receives the resolved client secret + the
   * adapter context. Default: instantiates a real
   * {@link TechOneConnectClient} backed by `globalThis.fetch`.
   */
  httpClientFactory?: (
    args: Pick<TechOneConnectClientOptions, "config" | "clientSecret" | "logger" | "signal">
  ) => TechOneConnectClient;
}

export class TechOneFinanceOneAdapter implements SourceAdapter {
  readonly id = "techone-financeone";
  readonly displayName = "Technology One — Finance One";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: true,
    supportsSampling: true,
    supportsCodeLists: true,
    preferredAuth: "oauth2",
    rateLimitHintRps: 16, // ~1000/min hard limit on Connect API
  };

  private readonly config: TechOneFinanceOneConfig;
  private readonly httpClientFactory: NonNullable<
    TechOneFinanceOneAdapterOptions["httpClientFactory"]
  >;

  constructor(rawConfig: unknown, options: TechOneFinanceOneAdapterOptions = {}) {
    this.config = TechOneFinanceOneConfigSchema.parse(rawConfig);
    this.httpClientFactory =
      options.httpClientFactory ??
      ((args) =>
        new TechOneConnectClient({
          config: args.config,
          clientSecret: args.clientSecret,
          logger: args.logger,
          signal: args.signal,
        }));
  }

  /** Resolved config (read-only) — exposed for tests and diagnostics. */
  getConfig(): Readonly<TechOneFinanceOneConfig> {
    return this.config;
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    ctx.logger.debug("techone-financeone: healthCheck invoked");

    const client = await this.tryBuildClient(ctx);
    if (!client) {
      // No secret available — return the optimistic stub used by
      // contract tests and local dev environments.
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "stub healthCheck — no client secret available",
        details: {
          resources: SUPPORTED_RESOURCES.length,
          ledgerEntity: this.config.ledgerEntity,
          ciaFallback: this.config.enableCiaFallback,
          mode: "stub",
        },
      };
    }

    try {
      // Connect exposes /connect/api/v1/metadata/health.
      await client.get({ path: "metadata/health" });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "Connect API reachable",
        details: {
          resources: SUPPORTED_RESOURCES.length,
          ledgerEntity: this.config.ledgerEntity,
          mode: "live",
        },
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err),
        details: { mode: "live" },
      };
    }
  }

  async discoverSchema(ctx: AdapterContext): Promise<SchemaDescriptor> {
    ctx.logger.debug("techone-financeone: discoverSchema invoked");
    return {
      adapter: this.id,
      generatedAt: new Date().toISOString(),
      resources: SUPPORTED_RESOURCES.map((name) => ({
        name,
        kind: "endpoint" as const,
        description: `${this.displayName} resource: ${name}`,
        fields: this.fieldsFor(name),
      })),
    };
  }

  private fieldsFor(name: SupportedResource): SchemaDescriptor["resources"][number]["fields"] {
    // Minimum-viable field set per resource. Live impl fetches from
    // /connect/api/v1/metadata/entity/{name} and merges site-specific UDFs.
    switch (name) {
      case "Customers":
      case "Sponsors":
        return [
          { name: "CustomerCode", type: "string", nullable: false, isKey: true },
          { name: "CustomerName", type: "string", nullable: false, isKey: false },
          { name: "CustomerTypeCode", type: "string", nullable: false, isKey: false },
          { name: "StatusCode", type: "string", nullable: false, isKey: false },
          { name: "DateLastModified", type: "datetime", nullable: true, isKey: false },
        ];
      case "Invoices":
      case "CreditNotes":
      case "Receipts":
        return [
          { name: "TransactionId", type: "string", nullable: false, isKey: true },
          { name: "TransactionNumber", type: "string", nullable: false, isKey: false },
          { name: "TransactionTypeCode", type: "string", nullable: false, isKey: false },
          { name: "CustomerCode", type: "string", nullable: false, isKey: false },
          { name: "Amount", type: "decimal", nullable: false, isKey: false },
          { name: "CurrencyCode", type: "string", nullable: false, isKey: false },
          { name: "TransactionDate", type: "datetime", nullable: false, isKey: false },
          { name: "SourceSystem", type: "string", nullable: true, isKey: false },
          { name: "SourceReference", type: "string", nullable: true, isKey: false },
        ];
      case "GlPostings":
        return [
          { name: "GlTransactionId", type: "string", nullable: false, isKey: true },
          { name: "AccountCode", type: "string", nullable: false, isKey: false },
          { name: "Entity", type: "string", nullable: false, isKey: false },
          { name: "CostCentre", type: "string", nullable: true, isKey: false },
          { name: "Project", type: "string", nullable: true, isKey: false },
          { name: "Amount", type: "decimal", nullable: false, isKey: false },
        ];
      default:
        return [
          { name: "id", type: "string", nullable: false, isKey: true },
          { name: "createdAt", type: "datetime", nullable: true, isKey: false },
        ];
    }
  }

  async sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]> {
    ctx.logger.debug("techone-financeone: sampleTable", {
      resource: args.resource,
      limit: args.limit,
    });
    this.requireSupported(args.resource);

    const client = await this.tryBuildClient(ctx);
    if (!client) return [];

    const path = CONNECT_RESOURCE_PATH[args.resource as SupportedResource];
    const page = await client.get<ConnectListResponse>({
      path,
      query: {
        pageNumber: 1,
        pageSize: Math.max(1, Math.min(args.limit, this.config.pageSize)),
        ledgerEntity: this.config.ledgerEntity,
      },
    });
    return page.data.slice(0, args.limit).map(toSampledRow);
  }

  async *streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
    ctx.logger.debug("techone-financeone: streamRows", { resource: args.resource });
    this.requireSupported(args.resource);

    const client = await this.tryBuildClient(ctx);
    if (!client) {
      yield { rows: [], totalRows: 0 };
      return;
    }

    const path = CONNECT_RESOURCE_PATH[args.resource as SupportedResource];
    const query: Record<string, string | number | boolean | undefined> = {
      ledgerEntity: this.config.ledgerEntity,
    };
    if (args.sinceTimestamp) query["modifiedSince"] = args.sinceTimestamp;

    let yielded = 0;
    for await (const page of client.paginate<Record<string, unknown>>({ path, query })) {
      const rows = page.data.map(toSampledRow);
      yielded += rows.length;
      const out: StreamRowsPage = {
        rows,
        totalRows: page.totalRecords,
      };
      if (yielded < page.totalRecords) {
        out.nextCursor = String(page.pageNumber + 1);
      }
      yield out;
    }
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("techone-financeone: getCodeLists invoked");
    return [];
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("techone-financeone: getDictionary invoked");
    return [];
  }

  async getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null> {
    ctx.logger.debug("techone-financeone: getRecordById", {
      resource: args.resource,
      id: args.id,
    });
    this.requireSupported(args.resource);

    const client = await this.tryBuildClient(ctx);
    if (!client) return null;

    const resource = args.resource as SupportedResource;
    const path = `${CONNECT_RESOURCE_PATH[resource]}/${encodeURIComponent(args.id)}`;
    try {
      const record = await client.get<Record<string, unknown>>({ path });
      return toSampledRow(record);
    } catch (err) {
      // 404 → null. Other errors propagate.
      if (err instanceof Error && /\b404\b/.test(err.message)) return null;
      throw err;
    }
  }

  /** Resource canonical PK name. Useful for downstream consumers. */
  static primaryKeyFor(resource: SupportedResource): string {
    return CONNECT_RESOURCE_PK[resource];
  }

  private requireSupported(resource: string): void {
    if (!SUPPORTED_RESOURCES.includes(resource as SupportedResource)) {
      throw new Error(`techone-financeone: resource "${resource}" not supported`);
    }
  }

  /**
   * Resolve the OAuth2 client secret from the platform secrets accessor
   * and instantiate the HTTP client. Returns `undefined` if the secret
   * cannot be resolved — callers fall back to the stub path. This
   * preserves the v1.0.0 contract for hermetic environments.
   */
  private async tryBuildClient(ctx: AdapterContext): Promise<TechOneConnectClient | undefined> {
    let secret: string | undefined;
    try {
      const v = await ctx.secrets.get(this.config.clientSecretKey);
      if (typeof v === "string" && v.length > 0) secret = v;
    } catch (err) {
      ctx.logger.warn("techone-financeone: failed to resolve client secret", {
        key: this.config.clientSecretKey,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
    if (!secret) return undefined;

    return this.httpClientFactory({
      config: this.config,
      clientSecret: secret,
      logger: ctx.logger,
      signal: ctx.signal,
    });
  }
}

/** Coerce an opaque JSON record into the SampledRow value shape. */
function toSampledRow(record: Record<string, unknown>): SampledRow {
  const out: SampledRow = {};
  for (const [k, v] of Object.entries(record)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    // Nested objects/arrays → JSON. Adapter contract is flat scalars.
    out[k] = JSON.stringify(v);
  }
  return out;
}
