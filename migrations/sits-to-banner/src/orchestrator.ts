/**
 * SitsToBannerOrchestrator — SITS source → canonical → Banner load plan.
 *
 * Symmetric counterpart of BannerToSitsOrchestrator.
 */
import type { AdapterContext, SampledRow, SourceAdapter } from "@databridge/adapter-spec";
import { SitsToBannerConfigSchema, type SitsToBannerConfig } from "./config.js";
import { BannerLoadPlanWriter } from "./banner-load-plan-writer.js";
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
  sitsResource: string;
  bannerTable: string;
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

export interface SitsToBannerRunReport {
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

export class SitsToBannerOrchestrator {
  private readonly config: SitsToBannerConfig;

  constructor(
    rawConfig: unknown,
    private readonly sourceAdapter: SourceAdapter,
    private readonly codesetRegistry?: CodesetMapRegistry
  ) {
    this.config = SitsToBannerConfigSchema.parse(rawConfig);
    if (!this.sourceAdapter.id.startsWith("sits-")) {
      throw new Error(
        `SitsToBannerOrchestrator: expected a SITS source adapter, got "${this.sourceAdapter.id}"`
      );
    }
  }

  static readonly SUPPORTED_ENTITIES = [
    "Student",
    "Programme",
    "Enrolment",
    "TermGpa",
    "CourseRegistration",
    "Award",
  ] as const;

  static readonly ENTITY_TO_SITS_RESOURCE: Record<string, string> = {
    Student: "STU",
    Programme: "POS",
    Enrolment: "SCE",
    TermGpa: "STA",
    CourseRegistration: "SMR",
    Award: "AWD",
  };

  static readonly ENTITY_TO_BANNER_TABLE: Record<string, string> = {
    Student: "SPRIDEN",
    Programme: "STVMAJR",
    Enrolment: "SGBSTDN",
    TermGpa: "SHRTGPA",
    CourseRegistration: "SFRSTCR",
    Award: "SHRDGMR",
  };

  async run(ctx: AdapterContext): Promise<SitsToBannerRunReport> {
    const runId = `sits-to-banner-${Date.now()}`;
    const startedAt = new Date().toISOString();

    const entities =
      this.config.entities.length > 0
        ? this.config.entities
        : [...SitsToBannerOrchestrator.SUPPORTED_ENTITIES];

    ctx.logger.info("sits-to-banner: starting run", {
      runId,
      source: this.config.source,
      entities,
      dryRun: this.config.dryRun,
    });

    const writer = new BannerLoadPlanWriter();
    const outcomes: EntityOutcome[] = [];

    for (const entity of entities) {
      const resource = SitsToBannerOrchestrator.ENTITY_TO_SITS_RESOURCE[entity];
      const table = SitsToBannerOrchestrator.ENTITY_TO_BANNER_TABLE[entity];
      if (!resource || !table) {
        ctx.logger.warn("sits-to-banner: skipping entity without mapping", { entity });
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
    sitsResource: string,
    bannerTable: string,
    writer: BannerLoadPlanWriter
  ): Promise<EntityOutcome> {
    let rowsRead = 0;
    let rowsValid = 0;
    let rowsInvalid = 0;
    let rowsStaged = 0;
    const errors: ValidationError[] = [];

    for await (const page of this.sourceAdapter.streamRows(ctx, {
      resource: sitsResource,
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
          writer.stage(bannerTable, "upsert", projected);
          rowsStaged += 1;
        }
      }
    }

    return {
      entity,
      sitsResource,
      bannerTable,
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
      tryTranslate(
        out,
        "STU_FESC",
        "SGBSTDN_RESD_CODE",
        "FEESTATUS",
        "BANNER.STVRESD",
        this.codesetRegistry,
        this.config.tenantId
      );
      tryTranslate(
        out,
        "SCE_CAM",
        "SGBSTDN_CAMP_CODE",
        "SITS.CAM",
        "BANNER.STVCAMP",
        this.codesetRegistry,
        this.config.tenantId
      );
      tryTranslate(
        out,
        "SCE_STYP",
        "SGBSTDN_STYP_CODE",
        "SITS.STYP",
        "BANNER.STVSTYP",
        this.codesetRegistry,
        this.config.tenantId
      );
    }
    return out;
  }
}

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
      requireField("STU_CODE", "SITS-MIG-01");
      requireField("STU_SURN", "SITS-MIG-02");
      break;
    case "Programme":
      requireField("POS_CODE", "SITS-MIG-03");
      break;
    case "Enrolment":
      requireField("SCE_STUC", "SITS-MIG-04");
      requireField("SCE_AYR", "SITS-MIG-05");
      break;
    case "TermGpa":
      requireField("STA_STUC", "SITS-MIG-06");
      requireField("STA_AYR", "SITS-MIG-07");
      break;
    case "CourseRegistration":
      requireField("SMR_STUC", "SITS-MIG-08");
      requireField("SMR_MOD", "SITS-MIG-09");
      break;
    case "Award":
      requireField("AWD_STUC", "SITS-MIG-10");
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
