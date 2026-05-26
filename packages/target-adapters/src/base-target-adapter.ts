/**
 * BaseTargetAdapter — shared validate / stage / commit / rollback logic
 * for concrete TargetAdapter implementations.
 *
 * Each concrete adapter overrides:
 *
 *   - `id` / `displayName` / `capabilities`
 *   - `requiredFields(entity)` to declare per-entity must-be-non-null
 *     fields used during `validate`
 *   - `transport` (constructor argument)
 *
 * Everything else (batching, staging map, commit recording, rollback)
 * is shared.
 */
import type {
  AdapterContext,
  RowOutcome,
  SampledRow,
  TargetAdapter,
  TargetAdapterCapabilities,
  TargetCommitArgs,
  TargetCommitResult,
  TargetRollbackArgs,
  TargetStageArgs,
  TargetStageResult,
  TargetValidateArgs,
  TargetValidationError,
  TargetValidationResult,
} from "@databridge/adapter-spec";
import type { TargetTransport, WrittenRow } from "./transport.js";

interface StagedBatch {
  batchId: string;
  entity: string;
  rows: SampledRow[];
  dryRun: boolean;
  /** When committed, the per-row written ids appear here. */
  committed: WrittenRow[];
  committedAt?: Date;
}

export abstract class BaseTargetAdapter implements TargetAdapter {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: TargetAdapterCapabilities;

  protected readonly transport: TargetTransport;
  private readonly batches = new Map<string, StagedBatch>();
  private batchSeq = 1;

  constructor(transport: TargetTransport) {
    this.transport = transport;
  }

  /** Per-entity required-field declaration. */
  protected abstract requiredFields(entity: string): readonly string[];

  /** Optional per-entity custom validation hook. */
  protected validateRow(
    entity: string,
    row: SampledRow,
    rowIndex: number,
  ): TargetValidationError[] {
    const errors: TargetValidationError[] = [];
    for (const field of this.requiredFields(entity)) {
      const v = row[field];
      if (v === undefined || v === null || v === "") {
        errors.push({
          rowIndex,
          field,
          message: `required field "${field}" missing for entity "${entity}"`,
          severity: "error",
        });
      }
    }
    return errors;
  }

  async validate(
    _ctx: AdapterContext,
    args: TargetValidateArgs,
  ): Promise<TargetValidationResult> {
    let valid = 0;
    let invalid = 0;
    const errors: TargetValidationError[] = [];
    args.rows.forEach((row, i) => {
      const rowErrors = this.validateRow(args.entity, row, i);
      if (rowErrors.length === 0) {
        valid += 1;
      } else {
        invalid += 1;
        errors.push(...rowErrors);
      }
    });
    return { valid, invalid, errors };
  }

  async stage(
    _ctx: AdapterContext,
    args: TargetStageArgs,
  ): Promise<TargetStageResult> {
    const limit = this.capabilities.batchSizeLimit;
    if (args.rows.length > limit) {
      throw new Error(
        `batch size ${args.rows.length} exceeds adapter limit ${limit}`,
      );
    }
    const batchId = `${this.id}-${args.migrationRunId}-${this.batchSeq++}`;
    this.batches.set(batchId, {
      batchId,
      entity: args.entity,
      rows: args.rows.map((r) => ({ ...r })),
      dryRun: args.dryRun,
      committed: [],
    });
    return {
      batchId,
      stagedCount: args.rows.length,
      estimatedDurationMs: args.rows.length * 5,
    };
  }

  async commit(
    _ctx: AdapterContext,
    args: TargetCommitArgs,
  ): Promise<TargetCommitResult> {
    const batch = this.batches.get(args.batchId);
    if (!batch) {
      throw new Error(`unknown batchId: ${args.batchId}`);
    }
    if (batch.committedAt) {
      throw new Error(`batchId ${args.batchId} already committed`);
    }
    const outcomes: RowOutcome[] = [];
    if (batch.dryRun) {
      // Dry-run: never call transport; emit "skipped" outcomes.
      batch.rows.forEach((_row, i) => {
        outcomes.push({ rowIndex: i, status: "skipped" });
      });
      batch.committedAt = args.approvedAt;
      return { committed: 0, failed: 0, outcomes };
    }

    let committed = 0;
    let failed = 0;
    for (let i = 0; i < batch.rows.length; i++) {
      const row = batch.rows[i]!;
      try {
        const targetId = await this.transport.write(batch.entity, row);
        batch.committed.push({
          entity: batch.entity,
          rowIndex: i,
          targetId,
          payload: row,
        });
        outcomes.push({ rowIndex: i, targetId, status: "created" });
        committed += 1;
      } catch (err) {
        failed += 1;
        outcomes.push({
          rowIndex: i,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    batch.committedAt = args.approvedAt;
    return { committed, failed, outcomes };
  }

  async rollback(
    _ctx: AdapterContext,
    args: TargetRollbackArgs,
  ): Promise<void> {
    if (!this.capabilities.supportsRollback) {
      throw new Error(`${this.id} does not support rollback`);
    }
    const batch = this.batches.get(args.batchId);
    if (!batch) throw new Error(`unknown batchId: ${args.batchId}`);
    for (const w of batch.committed) {
      await this.transport.remove(w.entity, w.targetId);
    }
    batch.committed = [];
  }

  /** Test helper — read-only access to the staged batches. */
  inspectBatch(batchId: string): Readonly<StagedBatch> | undefined {
    return this.batches.get(batchId);
  }
}
