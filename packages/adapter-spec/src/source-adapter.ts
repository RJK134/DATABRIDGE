import type { SecretAccessor } from "@databridge/platform";
import type { SchemaDescriptor } from "./schema-descriptor.js";
import type { CodeList } from "./code-list.js";
import type { DictionaryEntry } from "./dictionary.js";

/**
 * SourceAdapter — the single interface all upstream connectors must implement.
 * Defined in Section 5.1 of DESIGN.md.
 */
export interface SourceAdapter {
  /** Unique adapter id, e.g. "sits-oracle", "banner-ethos". */
  readonly id: string;
  /** Human-readable name used in UI. */
  readonly displayName: string;
  /** Static capability declaration evaluated at connection-registration time. */
  readonly capabilities: AdapterCapabilities;

  /** Verify reachability, auth, and minimal grants. */
  healthCheck(ctx: AdapterContext): Promise<HealthCheckResult>;

  /** Enumerate available tables/resources and their fields. */
  discoverSchema(ctx: AdapterContext): Promise<SchemaDescriptor>;

  /** Pull N rows for profiling or UI preview. */
  sampleTable(ctx: AdapterContext, args: SampleTableArgs): Promise<SampledRow[]>;

  /**
   * Stream rows for full ingestion.
   * Pagination handled via cursor; incremental sync supported where
   * capabilities.supportsIncremental === true.
   */
  streamRows(ctx: AdapterContext, args: StreamRowsArgs): AsyncIterable<StreamRowsPage>;

  /** Code-list / lookup table snapshots (e.g. STVMAJR, HESA ETHNIC codes). */
  getCodeLists(ctx: AdapterContext): Promise<CodeList[]>;

  /** Data-dictionary export (e.g. SITS men_ent/men_fld). */
  getDictionary(ctx: AdapterContext): Promise<DictionaryEntry[]>;

  /** Fetch a single record by source-system id (for drill-down in UI). */
  getRecordById(ctx: AdapterContext, args: GetRecordByIdArgs): Promise<SampledRow | null>;
}

export interface AdapterCapabilities {
  supportsIncremental: boolean;
  supportsDictionary: boolean;
  supportsSampling: boolean;
  supportsCodeLists: boolean;
  preferredAuth: "bearer" | "basic" | "oauth2" | "db-credentials" | "file";
  rateLimitHintRps?: number;
}

/**
 * AdapterContext is injected by the platform for every adapter call.
 * Adapters must never access process.env directly.
 */
export interface AdapterContext {
  tenantId: string;
  connectionId: string;
  secrets: SecretAccessor;
  logger: AdapterLogger;
  signal: AbortSignal;
}

export interface AdapterLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export type SampledRow = Record<string, string | number | boolean | null>;

export interface SampleTableArgs {
  resource: string;
  limit: number;
  orderBy?: string;
}

export interface StreamRowsArgs {
  resource: string;
  cursor?: string;
  pageSize?: number;
  sinceTimestamp?: string;
}

export interface StreamRowsPage {
  rows: SampledRow[];
  nextCursor?: string;
  totalRows?: number;
}

export interface GetRecordByIdArgs {
  resource: string;
  id: string;
}
