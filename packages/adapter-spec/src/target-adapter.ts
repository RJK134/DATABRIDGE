import type { AdapterContext, SampledRow } from "./source-adapter.js";

/**
 * TargetAdapter — write-side interface for migration and integration targets.
 * Implements the human-in-the-loop pattern: propose then commit/rollback.
 */
export interface TargetAdapter {
  readonly id: string;
  readonly displayName: string;

  /** Validate a batch of rows against the target schema. Returns validation errors. */
  validate(ctx: AdapterContext, args: TargetValidateArgs): Promise<TargetValidationResult>;

  /** Stage rows for writing (dry-run mode: validate + count, no write). */
  stage(ctx: AdapterContext, args: TargetStageArgs): Promise<TargetStageResult>;

  /**
   * Commit a previously staged batch.
   * Returns per-row outcomes for lineage recording.
   */
  commit(ctx: AdapterContext, args: TargetCommitArgs): Promise<TargetCommitResult>;

  /**
   * Rollback a committed batch within the rollback window.
   * Not all targets support rollback (capabilities.supportsRollback).
   */
  rollback(ctx: AdapterContext, args: TargetRollbackArgs): Promise<void>;

  /** Adapter capabilities. */
  readonly capabilities: TargetAdapterCapabilities;
}

export interface TargetAdapterCapabilities {
  supportsRollback: boolean;
  supportsUpsert: boolean;
  supportsPartialUpdate: boolean;
  batchSizeLimit: number;
}

export interface TargetValidateArgs {
  entity: string;
  rows: SampledRow[];
}

export interface TargetValidationResult {
  valid: number;
  invalid: number;
  errors: TargetValidationError[];
}

export interface TargetValidationError {
  rowIndex: number;
  field: string;
  message: string;
  severity: "warn" | "error";
}

export interface TargetStageArgs {
  migrationRunId: string;
  entity: string;
  rows: SampledRow[];
  dryRun: boolean;
}

export interface TargetStageResult {
  stagedCount: number;
  batchId: string;
  estimatedDurationMs?: number;
}

export interface TargetCommitArgs {
  batchId: string;
  approvedBy: string;
  approvedAt: Date;
}

export interface TargetCommitResult {
  committed: number;
  failed: number;
  outcomes: RowOutcome[];
}

export interface RowOutcome {
  rowIndex: number;
  targetId?: string;
  status: "created" | "updated" | "skipped" | "failed";
  error?: string;
}

export interface TargetRollbackArgs {
  batchId: string;
  reason: string;
}
