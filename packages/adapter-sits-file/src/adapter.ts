/**
 * SITS file extracts (CSV/XML)
 * Read adapter implementing the SourceAdapter contract from @databridge/adapter-spec.
 * Reads scheduled CSV/XML extracts from SITS (no live connectivity).
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

import { SitsFileConfigSchema, type SitsFileConfig } from "./config.js";

export const SUPPORTED_RESOURCES = ["STU", "ENG", "MOD", "CRS", "AOS"] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

export class SitsFileAdapter implements SourceAdapter {
  readonly id = "sits-file";
  readonly displayName = "SITS file extracts (CSV/XML)";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: false,
    supportsSampling: true,
    supportsCodeLists: true,
    preferredAuth: "file",
    rateLimitHintRps: 0,
  };

  private readonly config: SitsFileConfig;

  constructor(rawConfig: unknown) {
    this.config = SitsFileConfigSchema.parse(rawConfig);
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    ctx.logger.debug("sits-file: healthCheck invoked");
    // Stub: real impl probes the source. Return optimistic shape so platform
    // wiring + tests can exercise the contract.
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      message: "stub healthCheck — replace with live probe",
      details: { resources: SUPPORTED_RESOURCES.length },
    };
  }

  async discoverSchema(ctx: AdapterContext): Promise<SchemaDescriptor> {
    ctx.logger.debug("sits-file: discoverSchema invoked");
    return {
      adapter: this.id,
      generatedAt: new Date().toISOString(),
      resources: SUPPORTED_RESOURCES.map((name) => ({
        name,
        kind: "endpoint" as const,
        description: `${this.displayName} resource: ${name}`,
        fields: [
          { name: "id", type: "string", nullable: false, isKey: true },
          { name: "createdAt", type: "datetime", nullable: true, isKey: false },
        ],
      })),
    };
  }

  async sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]> {
    ctx.logger.debug("sits-file: sampleTable", { resource: args.resource, limit: args.limit });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`sits-file: resource "${args.resource}" not supported`);
    }
    // Stub: return zero rows. Live impl pulls N rows via source-specific client.
    return [];
  }

  async *streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
    ctx.logger.debug("sits-file: streamRows", { resource: args.resource });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`sits-file: resource "${args.resource}" not supported`);
    }
    // Stub: yield a single empty page so the contract type-checks and tests pass.
    yield { rows: [], totalRows: 0 };
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("sits-file: getCodeLists invoked");
    return [];
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("sits-file: getDictionary invoked");
    return [];
  }

  async getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null> {
    ctx.logger.debug("sits-file: getRecordById", { resource: args.resource, id: args.id });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`sits-file: resource "${args.resource}" not supported`);
    }
    return null;
  }
}
