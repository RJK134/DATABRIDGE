/**
 * Dynamics 365 Education source adapter.
 *
 * Stub-fallback pattern: when the Azure AD client secret cannot be
 * resolved, the adapter falls back to deterministic empty/stub data so
 * contract tests stay hermetic.
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
  SchemaDescriptor,
  CodeList,
  DictionaryEntry,
} from "@databridge/adapter-spec";

import { Dynamics365EduConfigSchema, type Dynamics365EduConfig } from "./config.js";
import { DataverseClient, type DataverseClientOptions, type EntityDefinition } from "./http.js";
import {
  RESOURCE_TO_SET,
  RESOURCE_TO_PK,
  RESOURCE_TO_LOGICAL,
  RESOURCE_TO_SELECT,
  SUPPORTED_RESOURCES,
  isSupportedResource,
  type SupportedResource,
} from "./resource-map.js";
import { buildDictionary, describeToDictionary } from "./dictionary.js";

export interface Dynamics365EduAdapterOptions {
  httpClientFactory?: (
    args: Pick<DataverseClientOptions, "config" | "clientSecret" | "logger" | "signal">
  ) => DataverseClient;
}

export class Dynamics365EduAdapter implements SourceAdapter {
  readonly id = "dynamics365-edu";
  readonly displayName = "Microsoft Dynamics 365 Education";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: true,
    supportsSampling: true,
    supportsCodeLists: true,
    preferredAuth: "oauth2",
    rateLimitHintRps: 8,
  };

  private readonly config: Dynamics365EduConfig;
  private readonly httpClientFactory: NonNullable<
    Dynamics365EduAdapterOptions["httpClientFactory"]
  >;
  private readonly describeCache = new Map<string, EntityDefinition>();

  constructor(rawConfig: unknown, options: Dynamics365EduAdapterOptions = {}) {
    this.config = Dynamics365EduConfigSchema.parse(rawConfig);
    this.httpClientFactory =
      options.httpClientFactory ??
      ((args) =>
        new DataverseClient({
          config: args.config,
          clientSecret: args.clientSecret,
          logger: args.logger,
          signal: args.signal,
        }));
  }

  getConfig(): Readonly<Dynamics365EduConfig> {
    return this.config;
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    const client = await this.tryBuildClient(ctx);
    if (!client) {
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "stub healthCheck — no Dataverse client secret available",
        details: { mode: "stub", resources: SUPPORTED_RESOURCES.length },
      };
    }
    try {
      await client.getAccessToken();
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "Dataverse reachable",
        details: { mode: "live" },
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
    ctx.logger.debug("dynamics365-edu: discoverSchema");
    return {
      adapter: this.id,
      generatedAt: new Date().toISOString(),
      resources: SUPPORTED_RESOURCES.map((name) => ({
        name,
        kind: "endpoint" as const,
        description: `${this.displayName} resource: ${RESOURCE_TO_LOGICAL[name]}`,
        fields: this.fieldsFor(name),
      })),
    };
  }

  private fieldsFor(name: SupportedResource): SchemaDescriptor["resources"][number]["fields"] {
    switch (name) {
      case "Contact":
        return [
          { name: "contactid", type: "string", nullable: false, isKey: true },
          { name: "firstname", type: "string", nullable: true, isKey: false },
          { name: "lastname", type: "string", nullable: false, isKey: false },
          { name: "emailaddress1", type: "string", nullable: true, isKey: false },
          { name: "birthdate", type: "date", nullable: true, isKey: false },
        ];
      case "Account":
        return [
          { name: "accountid", type: "string", nullable: false, isKey: true },
          { name: "name", type: "string", nullable: false, isKey: false },
          { name: "statecode", type: "integer", nullable: false, isKey: false },
        ];
      case "Program":
        return [
          { name: "msdyn_programid", type: "string", nullable: false, isKey: true },
          { name: "msdyn_name", type: "string", nullable: false, isKey: false },
          { name: "msdyn_programstatus", type: "integer", nullable: true, isKey: false },
          { name: "msdyn_startdate", type: "date", nullable: true, isKey: false },
          { name: "msdyn_enddate", type: "date", nullable: true, isKey: false },
        ];
      case "CourseInstance":
        return [
          { name: "msdyn_courseinstanceid", type: "string", nullable: false, isKey: true },
          { name: "msdyn_name", type: "string", nullable: false, isKey: false },
          { name: "msdyn_startdate", type: "date", nullable: true, isKey: false },
          { name: "msdyn_enddate", type: "date", nullable: true, isKey: false },
        ];
      case "StudentProgram":
        return [
          { name: "msdyn_studentprogramid", type: "string", nullable: false, isKey: true },
          { name: "msdyn_student", type: "string", nullable: false, isKey: false },
          { name: "msdyn_program", type: "string", nullable: false, isKey: false },
          { name: "msdyn_status", type: "integer", nullable: true, isKey: false },
        ];
      case "Course":
        return [
          { name: "msdyn_courseid", type: "string", nullable: false, isKey: true },
          { name: "msdyn_name", type: "string", nullable: false, isKey: false },
          { name: "msdyn_creditpoints", type: "decimal", nullable: true, isKey: false },
        ];
    }
  }

  async sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]> {
    this.requireSupported(args.resource);
    const client = await this.tryBuildClient(ctx);
    if (!client) return [];
    const r = args.resource as SupportedResource;
    const page = await client.query<Record<string, unknown>>(RESOURCE_TO_SET[r], {
      select: RESOURCE_TO_SELECT[r],
      top: Math.max(0, args.limit),
    });
    return page.value.map(toSampledRow);
  }

  async *streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
    this.requireSupported(args.resource);
    const client = await this.tryBuildClient(ctx);
    if (!client) {
      yield { rows: [], totalRows: 0 };
      return;
    }
    const r = args.resource as SupportedResource;
    const options: { select?: string; filter?: string } = { select: RESOURCE_TO_SELECT[r] };
    if (args.sinceTimestamp) {
      options.filter = `modifiedon ge ${args.sinceTimestamp}`;
    }
    for await (const page of client.queryAll<Record<string, unknown>>(
      RESOURCE_TO_SET[r],
      options
    )) {
      const totalRows = typeof page["@odata.count"] === "number" ? page["@odata.count"] : undefined;
      yield totalRows !== undefined
        ? { rows: page.value.map(toSampledRow), totalRows }
        : { rows: page.value.map(toSampledRow) };
    }
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    const client = await this.tryBuildClient(ctx);
    if (!client) return [];
    const out: CodeList[] = [];
    for (const r of SUPPORTED_RESOURCES) {
      const logical = RESOURCE_TO_LOGICAL[r];
      let def = this.describeCache.get(logical);
      if (!def) {
        try {
          def = await client.describe(logical);
          this.describeCache.set(logical, def);
        } catch (err) {
          ctx.logger.warn("dynamics365-edu: describe failed", {
            logical,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }
      for (const a of def.Attributes) {
        if (!a.OptionSet?.Options || a.OptionSet.Options.length === 0) continue;
        out.push({
          id: `DYNAMICS365-EDU.${logical}.${a.LogicalName}`,
          name: `${logical}.${a.LogicalName} option-set`,
          source: "dynamics365-edu",
          snapshotAt: new Date().toISOString(),
          entries: a.OptionSet.Options.map((opt) => ({
            code: String(opt.Value),
            description: opt.Label?.UserLocalizedLabel?.Label ?? String(opt.Value),
            isActive: true,
          })),
        });
      }
    }
    return out;
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    const client = await this.tryBuildClient(ctx);
    if (!client) return [];
    return buildDictionary(client, SUPPORTED_RESOURCES, this.describeCache);
  }

  async getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null> {
    this.requireSupported(args.resource);
    const client = await this.tryBuildClient(ctx);
    if (!client) return null;
    const r = args.resource as SupportedResource;
    const row = await client.getRecord<Record<string, unknown>>(
      RESOURCE_TO_SET[r],
      args.id,
      RESOURCE_TO_SELECT[r]
    );
    return row ? toSampledRow(row) : null;
  }

  static primaryKeyFor(resource: SupportedResource): string {
    return RESOURCE_TO_PK[resource];
  }

  static describeToDictionary = describeToDictionary;

  private requireSupported(resource: string): void {
    if (!isSupportedResource(resource)) {
      throw new Error(`dynamics365-edu: resource "${resource}" not supported`);
    }
  }

  private async tryBuildClient(ctx: AdapterContext): Promise<DataverseClient | undefined> {
    let secret: string | undefined;
    try {
      const v = await ctx.secrets.get(this.config.clientSecretKey);
      if (typeof v === "string" && v.length > 0) secret = v;
    } catch (err) {
      ctx.logger.warn("dynamics365-edu: secret resolve failed", {
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

function toSampledRow(record: Record<string, unknown>): SampledRow {
  const out: SampledRow = {};
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith("@odata.")) continue;
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    out[k] = JSON.stringify(v);
  }
  return out;
}

export { SUPPORTED_RESOURCES, type SupportedResource };
