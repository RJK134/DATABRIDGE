/**
 * Salesforce Education Cloud source adapter.
 *
 * Stub-fallback pattern: when `secrets.get(clientSecretKey)` returns
 * empty or throws, `tryBuildClient()` returns undefined and the adapter
 * yields deterministic empty/stub data matching the contract. This
 * mirrors the workday-raas / techone reference adapters.
 *
 * Live HTTP path delegates to {@link SalesforceClient}. Tests inject a
 * fake `httpClientFactory` to exercise live behaviour without a real
 * Salesforce org.
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

import { SalesforceEduConfigSchema, type SalesforceEduConfig } from "./config.js";
import { SalesforceClient, type SalesforceClientOptions, type DescribeResponse } from "./http.js";
import {
  RESOURCE_TO_SOBJECT,
  RESOURCE_TO_PK,
  RESOURCE_TO_SELECT,
  SUPPORTED_RESOURCES,
  isSupportedResource,
  type SupportedResource,
} from "./resource-map.js";
import { buildDictionary, describeToDictionary } from "./dictionary.js";

export interface SalesforceEduAdapterOptions {
  /** Factory for the HTTP client. Tests inject a fake. */
  httpClientFactory?: (
    args: Pick<SalesforceClientOptions, "config" | "clientSecret" | "logger" | "signal">
  ) => SalesforceClient;
}

export class SalesforceEduAdapter implements SourceAdapter {
  readonly id = "salesforce-edu";
  readonly displayName = "Salesforce Education Cloud";
  readonly capabilities: AdapterCapabilities = {
    supportsIncremental: true,
    supportsDictionary: true,
    supportsSampling: true,
    supportsCodeLists: true,
    preferredAuth: "oauth2",
    rateLimitHintRps: 10,
  };

  private readonly config: SalesforceEduConfig;
  private readonly httpClientFactory: NonNullable<SalesforceEduAdapterOptions["httpClientFactory"]>;
  private readonly describeCache = new Map<string, DescribeResponse>();

  constructor(rawConfig: unknown, options: SalesforceEduAdapterOptions = {}) {
    this.config = SalesforceEduConfigSchema.parse(rawConfig);
    this.httpClientFactory =
      options.httpClientFactory ??
      ((args) =>
        new SalesforceClient({
          config: args.config,
          clientSecret: args.clientSecret,
          logger: args.logger,
          signal: args.signal,
        }));
  }

  getConfig(): Readonly<SalesforceEduConfig> {
    return this.config;
  }

  async healthCheck(ctx: AdapterContext): Promise<HealthCheckResult> {
    const start = Date.now();
    const client = await this.tryBuildClient(ctx);
    if (!client) {
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "stub healthCheck — no Salesforce client secret available",
        details: { mode: "stub", resources: SUPPORTED_RESOURCES.length },
      };
    }
    try {
      await client.getAccessToken();
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        message: "Salesforce reachable",
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
    ctx.logger.debug("salesforce-edu: discoverSchema");
    return {
      adapter: this.id,
      generatedAt: new Date().toISOString(),
      resources: SUPPORTED_RESOURCES.map((name) => ({
        name,
        kind: "endpoint" as const,
        description: `${this.displayName} resource: ${RESOURCE_TO_SOBJECT[name]}`,
        fields: this.fieldsFor(name),
      })),
    };
  }

  private fieldsFor(name: SupportedResource): SchemaDescriptor["resources"][number]["fields"] {
    switch (name) {
      case "Contact":
        return [
          { name: "Id", type: "string", nullable: false, isKey: true },
          { name: "FirstName", type: "string", nullable: true, isKey: false },
          { name: "LastName", type: "string", nullable: false, isKey: false },
          { name: "Email", type: "string", nullable: true, isKey: false },
          { name: "Birthdate", type: "date", nullable: true, isKey: false },
          { name: "AccountId", type: "string", nullable: true, isKey: false },
        ];
      case "Account":
        return [
          { name: "Id", type: "string", nullable: false, isKey: true },
          { name: "Name", type: "string", nullable: false, isKey: false },
          { name: "Type", type: "string", nullable: true, isKey: false },
        ];
      case "ProgramPlan":
        return [
          { name: "Id", type: "string", nullable: false, isKey: true },
          { name: "Name", type: "string", nullable: false, isKey: false },
          { name: "hed__Status__c", type: "string", nullable: true, isKey: false },
          { name: "hed__Start_Date__c", type: "date", nullable: true, isKey: false },
          { name: "hed__End_Date__c", type: "date", nullable: true, isKey: false },
        ];
      case "Affiliation":
        return [
          { name: "Id", type: "string", nullable: false, isKey: true },
          { name: "hed__Contact__c", type: "string", nullable: false, isKey: false },
          { name: "hed__Account__c", type: "string", nullable: false, isKey: false },
          { name: "hed__Status__c", type: "string", nullable: true, isKey: false },
          { name: "hed__Primary__c", type: "boolean", nullable: true, isKey: false },
        ];
      case "CourseEnrollment":
        return [
          { name: "Id", type: "string", nullable: false, isKey: true },
          { name: "hed__Contact__c", type: "string", nullable: false, isKey: false },
          { name: "hed__Course_Offering__c", type: "string", nullable: true, isKey: false },
          { name: "hed__Status__c", type: "string", nullable: true, isKey: false },
          { name: "hed__Grade__c", type: "string", nullable: true, isKey: false },
        ];
      case "Course":
        return [
          { name: "Id", type: "string", nullable: false, isKey: true },
          { name: "Name", type: "string", nullable: false, isKey: false },
          { name: "hed__Account__c", type: "string", nullable: true, isKey: false },
          { name: "hed__Credit_Hours__c", type: "decimal", nullable: true, isKey: false },
        ];
    }
  }

  async sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]> {
    this.requireSupported(args.resource);
    const client = await this.tryBuildClient(ctx);
    if (!client) return [];
    const r = args.resource as SupportedResource;
    const sObject = RESOURCE_TO_SOBJECT[r];
    const select = RESOURCE_TO_SELECT[r];
    const soql = `SELECT ${select} FROM ${sObject} LIMIT ${Math.max(0, args.limit)}`;
    const page = await client.query<Record<string, unknown>>(soql);
    return page.records.map(toSampledRow);
  }

  async *streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage> {
    this.requireSupported(args.resource);
    const client = await this.tryBuildClient(ctx);
    if (!client) {
      yield { rows: [], totalRows: 0 };
      return;
    }
    const r = args.resource as SupportedResource;
    const sObject = RESOURCE_TO_SOBJECT[r];
    const select = RESOURCE_TO_SELECT[r];
    const where = args.sinceTimestamp ? ` WHERE SystemModstamp >= ${args.sinceTimestamp}` : "";
    const soql = `SELECT ${select} FROM ${sObject}${where}`;
    for await (const page of client.queryAll<Record<string, unknown>>(soql)) {
      yield { rows: page.records.map(toSampledRow), totalRows: page.totalSize };
    }
  }

  async getCodeLists(ctx: AdapterContext): Promise<CodeList[]> {
    ctx.logger.debug("salesforce-edu: getCodeLists");
    const client = await this.tryBuildClient(ctx);
    if (!client) return [];
    const out: CodeList[] = [];
    for (const r of SUPPORTED_RESOURCES) {
      const sObject = RESOURCE_TO_SOBJECT[r];
      let describe = this.describeCache.get(sObject);
      if (!describe) {
        try {
          describe = await client.describe(sObject);
          this.describeCache.set(sObject, describe);
        } catch (err) {
          ctx.logger.warn("salesforce-edu: describe failed", {
            sObject,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }
      }
      for (const f of describe.fields) {
        if (!f.picklistValues || f.picklistValues.length === 0) continue;
        out.push({
          id: `SALESFORCE-EDU.${sObject}.${f.name}`,
          name: `${sObject}.${f.name} picklist`,
          source: "salesforce-edu",
          snapshotAt: new Date().toISOString(),
          entries: f.picklistValues.map((v) => ({
            code: v.value,
            description: v.label ?? v.value,
            isActive: v.active !== false,
          })),
        });
      }
    }
    return out;
  }

  async getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]> {
    ctx.logger.debug("salesforce-edu: getDictionary");
    const client = await this.tryBuildClient(ctx);
    if (!client) return [];
    return buildDictionary(client, SUPPORTED_RESOURCES, this.describeCache);
  }

  async getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null> {
    this.requireSupported(args.resource);
    const client = await this.tryBuildClient(ctx);
    if (!client) return null;
    const r = args.resource as SupportedResource;
    const fields = RESOURCE_TO_SELECT[r].split(",").map((s) => s.trim());
    const row = await client.getRecord<Record<string, unknown>>(
      RESOURCE_TO_SOBJECT[r],
      args.id,
      fields
    );
    return row ? toSampledRow(row) : null;
  }

  static primaryKeyFor(resource: SupportedResource): string {
    return RESOURCE_TO_PK[resource];
  }

  static describeToDictionary = describeToDictionary;

  private requireSupported(resource: string): void {
    if (!isSupportedResource(resource)) {
      throw new Error(`salesforce-edu: resource "${resource}" not supported`);
    }
  }

  private async tryBuildClient(ctx: AdapterContext): Promise<SalesforceClient | undefined> {
    let secret: string | undefined;
    try {
      const v = await ctx.secrets.get(this.config.clientSecretKey);
      if (typeof v === "string" && v.length > 0) secret = v;
    } catch (err) {
      ctx.logger.warn("salesforce-edu: secret resolve failed", {
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
    if (k === "attributes") continue; // Salesforce SOQL meta-block
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
