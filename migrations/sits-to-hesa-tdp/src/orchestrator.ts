import type { AdapterContext, SourceAdapter } from "@databridge/adapter-spec";
import { SitsToHesaTdpConfigSchema, type SitsToHesaTdpConfig } from "./config.js";

/**
 * Result of validating a single canonical entity batch against the HESA TDP profile.
 */
export interface EntityValidationOutcome {
  entity: string;
  rowsRead: number;
  rowsValid: number;
  rowsInvalid: number;
  errors: ValidationError[];
}

export interface ValidationError {
  ruleId: string;
  field?: string;
  message: string;
  rowIndex: number;
  severity: "warn" | "error";
}

export interface MigrationRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  outcomes: EntityValidationOutcome[];
  totalRowsRead: number;
  totalRowsValid: number;
  totalRowsInvalid: number;
}

/**
 * SitsToHesaTdpOrchestrator
 *
 * Wires a SITS source adapter to the HESA TDP target profile, marshalling
 * rows through the canonical model. The orchestrator does NOT itself write to
 * HESA — that is the responsibility of a downstream TargetAdapter. In its
 * current scaffold form, it validates and emits per-entity outcomes only.
 */
export class SitsToHesaTdpOrchestrator {
  private readonly config: SitsToHesaTdpConfig;

  constructor(
    rawConfig: unknown,
    private readonly sourceAdapter: SourceAdapter
  ) {
    this.config = SitsToHesaTdpConfigSchema.parse(rawConfig);
    if (!this.sourceAdapter.id.startsWith("sits-")) {
      throw new Error(
        `SitsToHesaTdpOrchestrator: expected a SITS source adapter, got "${this.sourceAdapter.id}"`
      );
    }
  }

  /** Entities the orchestrator knows how to migrate. */
  static readonly SUPPORTED_ENTITIES = [
    "Student",
    "Engagement",
    "Module",
    "Leaver",
    "EntryProfile",
  ] as const;

  /** Mapping from canonical entity name to the SITS resource it sources from. */
  static readonly ENTITY_TO_SITS_RESOURCE: Record<string, string> = {
    Student: "STU",
    Engagement: "ENG",
    Module: "MOD",
    Leaver: "STU",
    EntryProfile: "STU",
  };

  /**
   * Execute the migration run. In dry-run mode (the default), no rows are
   * written downstream — only validated.
   */
  async run(ctx: AdapterContext): Promise<MigrationRunResult> {
    const runId = `sits-to-hesa-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const entities =
      this.config.entities.length > 0
        ? this.config.entities
        : [...SitsToHesaTdpOrchestrator.SUPPORTED_ENTITIES];

    ctx.logger.info("orchestrator: starting run", {
      runId,
      source: this.config.source,
      entities,
      dryRun: this.config.dryRun,
    });

    const outcomes: EntityValidationOutcome[] = [];
    for (const entity of entities) {
      const resource = SitsToHesaTdpOrchestrator.ENTITY_TO_SITS_RESOURCE[entity];
      if (!resource) {
        ctx.logger.warn("orchestrator: skipping entity without resource mapping", {
          entity,
        });
        continue;
      }
      outcomes.push(await this.runEntity(ctx, entity, resource));
    }

    const completedAt = new Date().toISOString();
    const totals = outcomes.reduce(
      (acc, o) => {
        acc.read += o.rowsRead;
        acc.valid += o.rowsValid;
        acc.invalid += o.rowsInvalid;
        return acc;
      },
      { read: 0, valid: 0, invalid: 0 }
    );

    return {
      runId,
      startedAt,
      completedAt,
      dryRun: this.config.dryRun,
      outcomes,
      totalRowsRead: totals.read,
      totalRowsValid: totals.valid,
      totalRowsInvalid: totals.invalid,
    };
  }

  private async runEntity(
    ctx: AdapterContext,
    entity: string,
    resource: string
  ): Promise<EntityValidationOutcome> {
    let rowsRead = 0;
    const errors: ValidationError[] = [];
    for await (const page of this.sourceAdapter.streamRows(ctx, {
      resource,
      pageSize: this.config.batchSize,
    })) {
      rowsRead += page.rows.length;
      // Stub: validation against HESA_TDP_RULES will plug in once
      // @databridge/rule-core engine wiring lands here. For now the
      // orchestrator marks all rows valid.
    }
    return {
      entity,
      rowsRead,
      rowsValid: rowsRead,
      rowsInvalid: 0,
      errors,
    };
  }
}
