/**
 * Workday RaaS (Reports)
 *
 * Read adapter implementing the SourceAdapter contract. Targets the
 * Workday RaaS endpoint exposed by published Custom Reports (§4 of
 * docs/WORKDAY_RAAS_INTEGRATION.md). Each canonical entity is sourced
 * from a distinct report endpoint configured per-tenant.
 *
 * Live HTTP path: the adapter delegates to {@link WorkdayRaasClient}
 * for healthCheck / sampleTable / streamRows / getRecordById whenever
 * it can resolve the ISU password from the platform secrets accessor.
 * When the secret cannot be resolved (e.g. local dev or contract tests
 * with a stub secrets accessor returning `undefined`) the adapter falls
 * back to a deterministic stub path so contract tests stay hermetic.
 * The fallback path matches the v1.0.0 behaviour exactly.
 *
 * Tests can also inject a fake HTTP client via the `httpClientFactory`
 * constructor option to exercise the live path without a real tenant.
 * This mirrors the TechOne adapter's wiring.
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

import { WorkdayRaasConfigSchema, type WorkdayRaasConfig } from "./config.js";
import { WorkdayRaasClient, type WorkdayRaasClientOptions } from "./http.js";
import { RAAS_REPORT_NAME, RAAS_REPORT_PK } from "./resource-map.js";

export const SUPPORTED_RESOURCES = [
  "Students",
  "Academic_Programs_of_Study",
  "Course_Sections",
  "Academic_Periods",
] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

/**
 * Optional adapter wiring — tests use this to inject a fake HTTP client
 * (and therefore exercise the live path) without a real Workday tenant.
 */
export interface WorkdayRaasAdapterOptions {
  /**
   * Factory invoked once per AdapterContext-bearing call when the
   * adapter needs HTTP. Receives the resolved password + the adapter
   * context. Default: instantiates a real {@link WorkdayRaasClient}
   * backed by `globalThis.fetch`.
   */
  httpClientFactory?: (
    args: Pick<WorkdayRaasClientOptions, "config" | "password" | "logger" | "signal">
  ) => WorkdayRaasClient;
}

export class WorkdayRaasAdapter implements SourceAdapter {
  readonly id = "workday-raas";
  readonly displayName = "Workday RaaS (Reports)";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: false,
    supportsSampling: true,
    supportsCodeLists: true,
    preferredAuth: "basic",
    rateLimitHintRps: 5,
  };

  private readonly config: WorkdayRaasConfig;
  private readonly httpClientFactory: NonNullable<WorkdayRaasAdapterOptions["httpClientFactory"]>;

  constructor(rawConfig: unknown, options: WorkdayRaasAdapterOptions = {}) {
    this.config = WorkdayRaasConfigSchema.parse(rawConfig);
    this.httpClientFactory =
      options.httpClientFactory ??
      ((args) =>
        new WorkdayRaasClient({
          config: args.config,
          password: args.password,
          logger: args.logger,
          signal: args.signal,
        }));
  }

  /** Resolved config (read-only) — exposed for tests and diagnostics. */
  getConfig(): Readonly<WorkdayRaasConfig> {
    return this.config;
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    ctx.logger.debug("workday-raas: healthCheck invoked");

    const client = await this.tryBuildClient(ctx);
    if (!client) {
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "stub healthCheck — no ISU password available",
        details: { resources: SUPPORTED_RESOURCES.length, mode: "stub" },
      };
    }

    try {
      // RaaS doesn't expose a dedicated health endpoint; we probe the
      // smallest report (Academic_Periods is reference data — small and
      // cached server-side).
      await client.get({ reportName: RAAS_REPORT_NAME["Academic_Periods"] });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "RaaS reachable",
        details: { resources: SUPPORTED_RESOURCES.length, mode: "live" },
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
    ctx.logger.debug("workday-raas: discoverSchema invoked");
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
    switch (name) {
      case "Students":
        return [
          { name: "Student_ID", type: "string", nullable: false, isKey: true },
          { name: "Legal_Name", type: "string", nullable: false, isKey: false },
          { name: "Date_Of_Birth", type: "date", nullable: true, isKey: false },
          { name: "Active_Status", type: "string", nullable: false, isKey: false },
          { name: "Last_Modified", type: "datetime", nullable: true, isKey: false },
        ];
      case "Academic_Programs_of_Study":
        return [
          { name: "Program_of_Study_ID", type: "string", nullable: false, isKey: true },
          { name: "Program_Name", type: "string", nullable: false, isKey: false },
          { name: "Award_Level", type: "string", nullable: false, isKey: false },
        ];
      case "Course_Sections":
        return [
          { name: "Course_Section_ID", type: "string", nullable: false, isKey: true },
          { name: "Course_ID", type: "string", nullable: false, isKey: false },
          { name: "Academic_Period_ID", type: "string", nullable: false, isKey: false },
        ];
      case "Academic_Periods":
        return [
          { name: "Academic_Period_ID", type: "string", nullable: false, isKey: true },
          { name: "Period_Name", type: "string", nullable: false, isKey: false },
          { name: "Start_Date", type: "date", nullable: false, isKey: false },
          { name: "End_Date", type: "date", nullable: false, isKey: false },
        ];
    }
  }

  async sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]> {
    ctx.logger.debug("workday-raas: sampleTable", {
      resource: args.resource,
      limit: args.limit,
    });
    this.requireSupported(args.resource);

    const client = await this.tryBuildClient(ctx);
    if (!client) return [];

    const reportName = RAAS_REPORT_NAME[args.resource as SupportedResource];
    const payload = await client.get({ reportName });
    const rows = WorkdayRaasClient.extractRows(payload);
    return rows.slice(0, Math.max(0, args.limit)).map(toSampledRow);
  }

  async *streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
    ctx.logger.debug("workday-raas: streamRows", { resource: args.resource });
    this.requireSupported(args.resource);

    const client = await this.tryBuildClient(ctx);
    if (!client) {
      yield { rows: [], totalRows: 0 };
      return;
    }

    const reportName = RAAS_REPORT_NAME[args.resource as SupportedResource];
    const query: Record<string, string | number | boolean | undefined> = {};
    if (args.sinceTimestamp) query["Last_Modified_Since"] = args.sinceTimestamp;

    for await (const page of client.paginate({ reportName, query })) {
      const rows = page.rows.map(toSampledRow);
      yield { rows, totalRows: page.total };
    }
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("workday-raas: getCodeLists invoked");
    return [];
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("workday-raas: getDictionary invoked");
    return [];
  }

  async getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null> {
    ctx.logger.debug("workday-raas: getRecordById", {
      resource: args.resource,
      id: args.id,
    });
    this.requireSupported(args.resource);

    const client = await this.tryBuildClient(ctx);
    if (!client) return null;

    const resource = args.resource as SupportedResource;
    const reportName = RAAS_REPORT_NAME[resource];
    const pk = RAAS_REPORT_PK[resource];
    const payload = await client.get({
      reportName,
      query: { [pk]: args.id },
    });
    const rows = WorkdayRaasClient.extractRows(payload);
    if (rows.length === 0) return null;
    // RaaS may return >1 if the prompt isn't a strict equality — pick
    // the row whose PK exactly matches.
    const exact = rows.find((r) => String(r[pk]) === args.id) ?? rows[0];
    return exact ? toSampledRow(exact) : null;
  }

  /** Resource canonical PK name. */
  static primaryKeyFor(resource: SupportedResource): string {
    return RAAS_REPORT_PK[resource];
  }

  private requireSupported(resource: string): void {
    if (!SUPPORTED_RESOURCES.includes(resource as SupportedResource)) {
      throw new Error(`workday-raas: resource "${resource}" not supported`);
    }
  }

  /**
   * Resolve the ISU password from the platform secrets accessor and
   * instantiate the HTTP client. Returns `undefined` if the secret
   * cannot be resolved — callers fall back to the stub path. This
   * preserves the v1.0.0 contract for hermetic environments.
   */
  private async tryBuildClient(ctx: AdapterContext): Promise<WorkdayRaasClient | undefined> {
    let secret: string | undefined;
    try {
      const v = await ctx.secrets.get(this.config.passwordSecretKey);
      if (typeof v === "string" && v.length > 0) secret = v;
    } catch (err) {
      ctx.logger.warn("workday-raas: failed to resolve ISU password", {
        key: this.config.passwordSecretKey,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
    if (!secret) return undefined;

    return this.httpClientFactory({
      config: this.config,
      password: secret,
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
    out[k] = JSON.stringify(v);
  }
  return out;
}
