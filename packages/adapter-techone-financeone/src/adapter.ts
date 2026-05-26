/**
 * Technology One Finance One — source adapter.
 *
 * Read adapter implementing the SourceAdapter contract. Targets the
 * TechOne Connect REST API (§14, §18 of docs/TECHONE_DATA_STRUCTURES.md)
 * as the primary integration. Each canonical "resource" maps to a
 * Connect API entity or, where relevant, a CIA cube view.
 *
 * The runtime HTTP client is left as a stub so the contract type-checks
 * and integration tests can run without a live tenant — same pattern as
 * adapter-workday-raas. Live impl drops into the marked methods.
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

  constructor(rawConfig: unknown) {
    this.config = TechOneFinanceOneConfigSchema.parse(rawConfig);
  }

  /** Resolved config (read-only) — exposed for tests and diagnostics. */
  getConfig(): Readonly<TechOneFinanceOneConfig> {
    return this.config;
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    ctx.logger.debug("techone-financeone: healthCheck invoked");
    // Stub: live impl issues GET /connect/api/v1/metadata/health with the
    // OAuth2 bearer token. Returns optimistic shape for contract tests.
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      message: "stub healthCheck — replace with live Connect API probe",
      details: {
        resources: SUPPORTED_RESOURCES.length,
        ledgerEntity: this.config.ledgerEntity,
        ciaFallback: this.config.enableCiaFallback,
      },
    };
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
    return [];
  }

  async *streamRows(
    ctx: AdapterContext,
    args: StreamRowsArgs,
  ): AsyncIterable<StreamRowsPage> {
    ctx.logger.debug("techone-financeone: streamRows", { resource: args.resource });
    this.requireSupported(args.resource);
    yield { rows: [], totalRows: 0 };
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("techone-financeone: getCodeLists invoked");
    return [];
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("techone-financeone: getDictionary invoked");
    return [];
  }

  async getRecordById(
    ctx: AdapterContext,
    args: GetRecordByIdArgs,
  ): Promise<SampledRow | null> {
    ctx.logger.debug("techone-financeone: getRecordById", {
      resource: args.resource,
      id: args.id,
    });
    this.requireSupported(args.resource);
    return null;
  }

  private requireSupported(resource: string): void {
    if (!SUPPORTED_RESOURCES.includes(resource as SupportedResource)) {
      throw new Error(`techone-financeone: resource "${resource}" not supported`);
    }
  }
}
