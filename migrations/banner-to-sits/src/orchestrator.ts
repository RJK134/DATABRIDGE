/**
 * BannerToSitsOrchestrator — Banner source → canonical → SITS load plan.
 *
 * Demo-grade: validates per-entity row counts, runs each row through the
 * canonical projection + codeset translations, and stages the result on
 * a `SitsLoadPlanWriter`. The SITS write itself is left to downstream
 * tooling.
 *
 * Designed to mirror SitsToHesaTdpOrchestrator so the two are interchangeable
 * from the demo harness perspective.
 */
import type { AdapterContext, SampledRow, SourceAdapter } from "@databridge/adapter-spec";
import { BannerToSitsConfigSchema, type BannerToSitsConfig } from "./config.js";
import { SitsLoadPlanWriter } from "./sits-load-plan-writer.js";
import { translateCode, type CodesetMapRegistry } from "@databridge/codeset-mapper";

export interface ValidationError {
  ruleId: string;
  field?: string;
  message: string;
  rowIndex: number;
  severity: "warn" | "error";
}

export interface EntityOutcome {
  entity: string;
  bannerResource: string;
  sitsTable: string;
  rowsRead: number;
  rowsValid: number;
  rowsInvalid: number;
  rowsStaged: number;
  errors: ValidationError[];
}

export interface LoadPlanEntry {
  table: string;
  rows: number;
}

export interface BannerToSitsRunReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  source: string;
  outcomes: EntityOutcome[];
  totalRowsRead: number;
  totalRowsValid: number;
  totalRowsInvalid: number;
  loadPlan: LoadPlanEntry[];
}

export class BannerToSitsOrchestrator {
  private readonly config: BannerToSitsConfig;

  constructor(
    rawConfig: unknown,
    private readonly sourceAdapter: SourceAdapter,
    private readonly codesetRegistry?: CodesetMapRegistry
  ) {
    this.config = BannerToSitsConfigSchema.parse(rawConfig);
    if (!this.sourceAdapter.id.startsWith("banner-")) {
      throw new Error(
        `BannerToSitsOrchestrator: expected a Banner source adapter, got "${this.sourceAdapter.id}"`
      );
    }
  }

  /** Canonical entities this orchestrator supports. */
  static readonly SUPPORTED_ENTITIES = [
    "Student",
    "Programme",
    "Enrolment",
    "TermGpa",
    "CourseRegistration",
    "Award",
  ] as const;

  /** Canonical entity → Banner adapter resource name. */
  static readonly ENTITY_TO_BANNER_RESOURCE: Record<string, string> = {
    Student: "SPRIDEN",
    Programme: "STVMAJR",
    Enrolment: "SGBSTDN",
    TermGpa: "SHRTGPA",
    CourseRegistration: "SFRSTCR",
    Award: "SHRDGMR",
  };

  /** Canonical entity → SITS load-plan table name. */
  static readonly ENTITY_TO_SITS_TABLE: Record<string, string> = {
    Student: "STU",
    Programme: "POS",
    Enrolment: "SCE",
    TermGpa: "STA",
    CourseRegistration: "SMR",
    Award: "AWD",
  };

  async run(ctx: AdapterContext): Promise<BannerToSitsRunReport> {
    const runId = `banner-to-sits-${Date.now()}`;
    const startedAt = new Date().toISOString();

    const entities =
      this.config.entities.length > 0
        ? this.config.entities
        : [...BannerToSitsOrchestrator.SUPPORTED_ENTITIES];

    ctx.logger.info("banner-to-sits: starting run", {
      runId,
      source: this.config.source,
      entities,
      dryRun: this.config.dryRun,
    });

    const writer = new SitsLoadPlanWriter();
    const outcomes: EntityOutcome[] = [];

    for (const entity of entities) {
      const resource = BannerToSitsOrchestrator.ENTITY_TO_BANNER_RESOURCE[entity];
      const table = BannerToSitsOrchestrator.ENTITY_TO_SITS_TABLE[entity];
      if (!resource || !table) {
        ctx.logger.warn("banner-to-sits: skipping entity without mapping", { entity });
        continue;
      }
      outcomes.push(await this.runEntity(ctx, entity, resource, table, writer));
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

    const plan = writer.build();
    const loadPlan: LoadPlanEntry[] = [...plan.byTable.entries()].map(([t, rows]) => ({
      table: t,
      rows: rows.length,
    }));

    return {
      runId,
      startedAt,
      completedAt,
      dryRun: this.config.dryRun,
      source: this.config.source,
      outcomes,
      totalRowsRead: totals.read,
      totalRowsValid: totals.valid,
      totalRowsInvalid: totals.invalid,
      loadPlan,
    };
  }

  private async runEntity(
    ctx: AdapterContext,
    entity: string,
    bannerResource: string,
    sitsTable: string,
    writer: SitsLoadPlanWriter
  ): Promise<EntityOutcome> {
    let rowsRead = 0;
    let rowsValid = 0;
    let rowsInvalid = 0;
    let rowsStaged = 0;
    const errors: ValidationError[] = [];

    for await (const page of this.sourceAdapter.streamRows(ctx, {
      resource: bannerResource,
      pageSize: this.config.batchSize,
    })) {
      for (const row of page.rows) {
        rowsRead += 1;
        const validation = validateRow(entity, row, rowsRead);
        if (validation.length > 0) {
          rowsInvalid += 1;
          errors.push(...validation);
          continue;
        }
        rowsValid += 1;
        if (!this.config.dryRun) {
          const projected = this.projectRow(entity, row);
          writer.stage(sitsTable, "upsert", projected);
          rowsStaged += 1;
        }
      }
    }

    return {
      entity,
      bannerResource,
      sitsTable,
      rowsRead,
      rowsValid,
      rowsInvalid,
      rowsStaged,
      errors,
    };
  }

  private projectRow(entity: string, row: SampledRow): SampledRow {
    const out: SampledRow = { ...row };
    if (this.codesetRegistry) {
      // Translate common Banner codes to SITS-side equivalents inline.
      tryTranslate(
        out,
        "SGBSTDN_RESD_CODE",
        "STU_FESC",
        "BANNER.STVRESD",
        "FEESTATUS",
        this.codesetRegistry,
        this.config.tenantId
      );
      tryTranslate(
        out,
        "SGBSTDN_CAMP_CODE",
        "SCE_CAM",
        "BANNER.STVCAMP",
        "SITS.CAM",
        this.codesetRegistry,
        this.config.tenantId
      );
      tryTranslate(
        out,
        "SGBSTDN_STYP_CODE",
        "SCE_STYP",
        "BANNER.STVSTYP",
        "SITS.STYP",
        this.codesetRegistry,
        this.config.tenantId
      );
    }
    return out;
  }
}

/** Lightweight per-entity row validation. */
function validateRow(entity: string, row: SampledRow, rowIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const requireField = (field: string, ruleId: string): void => {
    const v = row[field];
    if (v === undefined || v === null || v === "") {
      errors.push({
        ruleId,
        field,
        message: `${entity}: required field "${field}" missing`,
        rowIndex,
        severity: "error",
      });
    }
  };
  switch (entity) {
    case "Student":
      requireField("SPRIDEN_PIDM", "BANNER-MIG-01");
      requireField("SPRIDEN_ID", "BANNER-MIG-02");
      break;
    case "Programme":
      requireField("STVMAJR_CODE", "BANNER-MIG-03");
      break;
    case "Enrolment":
      requireField("SGBSTDN_PIDM", "BANNER-MIG-04");
      requireField("SGBSTDN_TERM_CODE_EFF", "BANNER-MIG-05");
      break;
    case "TermGpa":
      requireField("SHRTGPA_PIDM", "BANNER-MIG-06");
      requireField("SHRTGPA_TERM_CODE", "BANNER-MIG-07");
      break;
    case "CourseRegistration":
      requireField("SFRSTCR_PIDM", "BANNER-MIG-08");
      requireField("SFRSTCR_CRN", "BANNER-MIG-09");
      break;
    case "Award":
      requireField("SHRDGMR_PIDM", "BANNER-MIG-10");
      break;
  }
  return errors;
}

function tryTranslate(
  row: SampledRow,
  sourceField: string,
  targetField: string,
  sourceCodelist: string,
  targetCodelist: string,
  registry: CodesetMapRegistry,
  tenantId: string | undefined
): void {
  const v = row[sourceField];
  if (typeof v !== "string" || v.length === 0) return;
  const args =
    tenantId !== undefined
      ? { sourceCodelist, targetCodelist, sourceCode: v, tenantId }
      : { sourceCodelist, targetCodelist, sourceCode: v };
  const r = translateCode(registry, args);
  if (r.ok && r.targetCode !== undefined) {
    row[targetField] = r.targetCode;
  }
}
