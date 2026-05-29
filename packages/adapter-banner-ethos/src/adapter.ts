/**
 * Banner Ellucian Ethos (REST)
 * Read adapter implementing the SourceAdapter contract from @databridge/adapter-spec.
 * Ethos Data Model resources mapped onto canonical entities (persons → Student, etc.).
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

import { BannerEthosConfigSchema, type BannerEthosConfig } from "./config.js";

export const SUPPORTED_RESOURCES = [
  "persons",
  "students",
  "academic-credentials",
  "sections",
  "courses",
  "student-academic-programs",
] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

export class BannerEthosAdapter implements SourceAdapter {
  readonly id = "banner-ethos";
  readonly displayName = "Banner Ellucian Ethos (REST)";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: true,
    supportsSampling: true,
    supportsCodeLists: true,
    preferredAuth: "oauth2",
    rateLimitHintRps: 20,
  };

  private readonly config: BannerEthosConfig;

  constructor(rawConfig: unknown) {
    this.config = BannerEthosConfigSchema.parse(rawConfig);
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    ctx.logger.debug("banner-ethos: healthCheck invoked");
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
    ctx.logger.debug("banner-ethos: discoverSchema invoked");
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
    ctx.logger.debug("banner-ethos: sampleTable", { resource: args.resource, limit: args.limit });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`banner-ethos: resource "${args.resource}" not supported`);
    }
    // Stub: return zero rows. Live impl pulls N rows via source-specific client.
    return [];
  }

  async *streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
    ctx.logger.debug("banner-ethos: streamRows", { resource: args.resource });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`banner-ethos: resource "${args.resource}" not supported`);
    }
    // Stub: yield a single empty page so the contract type-checks and tests pass.
    yield { rows: [], totalRows: 0 };
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("banner-ethos: getCodeLists invoked");
    return [];
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("banner-ethos: getDictionary invoked");
    return [];
  }

  async getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null> {
    ctx.logger.debug("banner-ethos: getRecordById", { resource: args.resource, id: args.id });
    if (!SUPPORTED_RESOURCES.includes(args.resource as SupportedResource)) {
      throw new Error(`banner-ethos: resource "${args.resource}" not supported`);
    }
    return null;
  }
}
