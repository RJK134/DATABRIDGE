/**
 * MigrationRunner — Phase J3.
 *
 * Drives policy-configured transforms over a stream of source rows and
 * delegates persistence to a `TargetAdapter`. Emits per-row provenance,
 * a rollback log, and a dry-run diff that can be inspected before the
 * commit decision.
 *
 * The runner is deliberately stateless across runs — it constructs
 * fresh per-policy allocators (CRN, SCJ-attempt) inside its
 * constructor so a single instance services a single run.
 */
import type {
  AdapterContext,
  RowOutcome,
  SampledRow,
  TargetAdapter,
} from "@databridge/adapter-spec";
import type { MigrationPolicy } from "@databridge/migration-policy";
import type { CodesetMapRegistry } from "@databridge/codeset-mapper";

import { CrnGeneratorState } from "./transforms/crn.js";
import { ScjAttemptAllocator } from "./transforms/scj-attempt.js";
import { convertCreditHoursToCats } from "./transforms/credit-hour.js";
import { termToAyr } from "./transforms/term-to-ayr.js";
import { translateGrade, translateFeeStatus } from "./transforms/grade-fee.js";
import type {
  DryRunDiff,
  MigrationRunReport,
  ProvenanceEntry,
  RollbackEntry,
  SourceRow,
  TransformedRow,
} from "./types.js";

export interface RunnerOptions {
  policy: MigrationPolicy;
  targetAdapter: TargetAdapter;
  codesetRegistry?: CodesetMapRegistry;
  /** STVTERM lookup for the term-to-ayr stvterm-driven strategy. */
  stvtermAyr?: Record<string, string>;
  /** Run id for the TargetAdapter stage call. */
  migrationRunId: string;
  /** Approver id for commit. Defaults to "system". */
  approvedBy?: string;
}

export interface RunArgs {
  /** Input rows. The runner does NOT batch across entities — call
   *  `run` once per entity if you need entity-level batching. */
  rows: SourceRow[];
  /** Adapter context to forward to the target adapter. */
  ctx: AdapterContext;
  /** When true, no writes are performed; the runner still records what
   *  would have been written and returns it as a diff. */
  dryRun: boolean;
}

export class MigrationRunner {
  private readonly crn: CrnGeneratorState;
  private readonly scj: ScjAttemptAllocator;

  constructor(private readonly opts: RunnerOptions) {
    this.crn = new CrnGeneratorState(opts.policy.crnGenerator);
    this.scj = new ScjAttemptAllocator(opts.policy.scjAttempt);
  }

  async run(args: RunArgs): Promise<MigrationRunReport> {
    const { policy } = this.opts;
    const diffs: DryRunDiff[] = [];
    const rollbackLog: RollbackEntry[] = [];
    const operationalQueue: MigrationRunReport["operationalQueue"] = [];
    let validationErrors = 0;

    // 1. Transform each row policy-side.
    const transformed: TransformedRow[] = [];
    for (const src of args.rows) {
      const out = this.transformRow(src, operationalQueue);
      transformed.push(out);
    }

    // 2. Group by target entity for staging.
    const byEntity = new Map<string, TransformedRow[]>();
    for (const t of transformed) {
      let bucket = byEntity.get(t.targetEntity);
      if (!bucket) {
        bucket = [];
        byEntity.set(t.targetEntity, bucket);
      }
      bucket.push(t);
    }

    const adapter = this.opts.targetAdapter;
    let createdTotal = 0;
    let updatedTotal = 0;
    let skippedTotal = 0;
    let failedTotal = 0;

    for (const [entity, rows] of byEntity) {
      const payloads: SampledRow[] = rows.map((r) => r.payload);

      // 2a. Validate
      const validation = await adapter.validate(args.ctx, {
        entity,
        rows: payloads,
      });
      validationErrors += validation.errors.length;
      const invalidIndexes = new Set<number>();
      const perRowErrors = new Map<number, { field: string; message: string }[]>();
      for (const err of validation.errors) {
        invalidIndexes.add(err.rowIndex);
        let list = perRowErrors.get(err.rowIndex);
        if (!list) {
          list = [];
          perRowErrors.set(err.rowIndex, list);
        }
        list.push({ field: err.field, message: err.message });
      }

      // 2b. Stage only the valid subset
      const validRows: SampledRow[] = [];
      const validOriginalIdx: number[] = [];
      payloads.forEach((p, i) => {
        if (!invalidIndexes.has(i)) {
          validRows.push(p);
          validOriginalIdx.push(i);
        }
      });

      let outcomes: RowOutcome[] = [];
      if (validRows.length > 0) {
        const stage = await adapter.stage(args.ctx, {
          migrationRunId: this.opts.migrationRunId,
          entity,
          rows: validRows,
          dryRun: args.dryRun,
        });
        const commit = await adapter.commit(args.ctx, {
          batchId: stage.batchId,
          approvedBy: this.opts.approvedBy ?? "system",
          approvedAt: new Date(),
        });
        outcomes = commit.outcomes;
      }

      // 2c. Build diff entries
      rows.forEach((r, originalIdx) => {
        const errors = perRowErrors.get(originalIdx);
        if (errors && errors.length > 0) {
          skippedTotal += 1;
          const diff: DryRunDiff = {
            entity,
            rowIndex: originalIdx,
            op: "skip",
            reason: "validation-error",
            payload: r.payload,
            errors,
            provenance: r.provenance,
          };
          diffs.push(diff);
          return;
        }
        // Find the matching outcome (commit returns rowIndex within the validRows array).
        const validIdx = validOriginalIdx.indexOf(originalIdx);
        const outcome = validIdx >= 0 ? outcomes[validIdx] : undefined;
        if (!outcome) {
          skippedTotal += 1;
          diffs.push({
            entity,
            rowIndex: originalIdx,
            op: "skip",
            reason: "no-outcome",
            payload: r.payload,
            provenance: r.provenance,
          });
          return;
        }
        let op: DryRunDiff["op"];
        switch (outcome.status) {
          case "created":
            op = "create";
            createdTotal += 1;
            break;
          case "updated":
            op = "update";
            updatedTotal += 1;
            break;
          case "skipped":
            op = "skip";
            skippedTotal += 1;
            break;
          case "failed":
          default:
            op = "skip";
            failedTotal += 1;
            break;
        }
        const diff: DryRunDiff = {
          entity,
          rowIndex: originalIdx,
          op,
          reason:
            outcome.status === "skipped" && args.dryRun
              ? "dry-run"
              : outcome.status === "failed"
                ? `commit-failed: ${outcome.error ?? "unknown"}`
                : outcome.status,
          payload: r.payload,
          provenance: r.provenance,
        };
        diffs.push(diff);
        if (outcome.status === "created" && outcome.targetId) {
          rollbackLog.push({
            entity,
            rowIndex: originalIdx,
            targetId: outcome.targetId,
            policyId: policy.id,
            committedAt: new Date().toISOString(),
          });
        }
      });
    }

    return {
      policyId: policy.id,
      migrationRunId: this.opts.migrationRunId,
      sourceSystem: policy.sourceSystem,
      targetSystem: policy.targetSystem,
      dryRun: args.dryRun,
      totals: {
        sourceRowCount: args.rows.length,
        created: createdTotal,
        updated: updatedTotal,
        skipped: skippedTotal,
        failed: failedTotal,
        validationErrors,
      },
      diffs,
      rollbackLog,
      operationalQueue,
    };
  }

  /**
   * Policy-driven transform of a single source row. Pure — no I/O.
   *
   * Recognises a handful of entity names and applies the most relevant
   * policy slots. Unknown entities are passed through as-is so the
   * runner remains useful for non-academic entities (audit-trail rows,
   * lookup tables, etc.).
   */
  private transformRow(
    src: SourceRow,
    opQueue: MigrationRunReport["operationalQueue"]
  ): TransformedRow {
    const { policy } = this.opts;
    const provenance: ProvenanceEntry[] = [];
    const payload: SampledRow = { ...src.data };

    switch (src.entity) {
      case "ssbsect":
      case "crs":
      case "section": {
        const subject = String(payload["subject"] ?? payload["SUBJ_CODE"] ?? "");
        const sectionNo = String(payload["seq_number"] ?? payload["SEQ_NUMBER"] ?? "");
        const term = String(payload["term"] ?? payload["TERM_CODE"] ?? "");
        const existing = payload["crn"] ?? payload["CRN"];
        const allocation = this.crn.allocate({
          subject,
          section: sectionNo,
          term,
          existingCrn: existing == null ? null : String(existing),
        });
        payload["crn"] = allocation.crn;
        provenance.push(allocation.provenance);

        // creditHour → cats when source carries credit_hours
        const ch = Number(payload["credit_hours"] ?? payload["CREDIT_HRS"]);
        if (Number.isFinite(ch)) {
          const c = convertCreditHoursToCats(ch, policy.creditHour);
          payload["cats"] = c.cats;
          provenance.push(c.provenance);
        }
        // term → ayr
        if (term) {
          const t = termToAyr(term, policy.termToAcademicYear, this.opts.stvtermAyr);
          if (t.ayr) payload["ayr"] = t.ayr;
          provenance.push(t.provenance);
        }
        break;
      }
      case "sgbstdn":
      case "scj":
      case "enrolment": {
        const studentId = String(payload["pidm"] ?? payload["PIDM"] ?? payload["student_id"] ?? "");
        const ayr = (payload["ayr"] as string) ?? null;
        const sourceAttempt = payload["scj_code"] as string | number | null | undefined;
        const a = this.scj.allocate({
          studentId,
          ayr,
          sourceAttempt: sourceAttempt ?? null,
        });
        payload["scj_code"] = a.scjCode;
        provenance.push(a.provenance);

        // fee status if a residency code is present
        const resd = payload["resd_code"] ?? payload["RESD_CODE"];
        if (resd && this.opts.codesetRegistry) {
          const f = translateFeeStatus(
            this.opts.codesetRegistry,
            policy.feeStatus,
            String(resd),
            policy.tenantId
          );
          if (f.value !== null) payload["fee_status"] = f.value;
          provenance.push(f.provenance);
        }

        // classification gap — when classification is missing for a finalist
        const isFinalist = payload["finalist"] === true || payload["finalist"] === "Y";
        const classification = payload["classification"];
        if (
          isFinalist &&
          (classification === null || classification === undefined || classification === "")
        ) {
          this.applyClassificationGap(payload, src, provenance, opQueue);
        }
        break;
      }
      case "mab":
      case "shrtckg":
      case "grade": {
        const grade = payload["grade"] ?? payload["GRDE_CODE"];
        if (grade && this.opts.codesetRegistry) {
          const g = translateGrade(
            this.opts.codesetRegistry,
            policy.gradeScheme,
            String(grade),
            policy.tenantId
          );
          if (g.value !== null) payload["numeric_grade"] = g.value;
          provenance.push(g.provenance);
        }
        // Component-mark policy
        if (policy.componentMark.strategy === "discard-components") {
          delete payload["component_mark"];
          provenance.push({
            slot: "componentMark",
            strategy: "discard-components",
            note: "component_mark stripped on write",
          });
        } else if (
          policy.componentMark.strategy === "preserve-in-canonical" &&
          policy.componentMark.projectOnWrite
        ) {
          provenance.push({
            slot: "componentMark",
            strategy: "preserve-in-canonical",
            note: "component_mark preserved; projectOnWrite=true",
          });
        }
        break;
      }
      default:
        // pass-through
        break;
    }

    return {
      targetEntity: src.entity,
      payload,
      provenance,
    };
  }

  private applyClassificationGap(
    payload: SampledRow,
    src: SourceRow,
    provenance: ProvenanceEntry[],
    opQueue: MigrationRunReport["operationalQueue"]
  ): void {
    const policy = this.opts.policy.classificationGap;
    if (policy.strategy === "skip") {
      provenance.push({
        slot: "classificationGap",
        strategy: "skip",
        note: "no classification computed; skipped",
      });
    } else if (policy.strategy === "default-band") {
      payload["classification"] = policy.band;
      provenance.push({
        slot: "classificationGap",
        strategy: "default-band",
        note: `defaulted to ${policy.band}`,
        outputValue: policy.band,
      });
    } else {
      // queue-for-registry
      const entry: { entity: string; field: string; sourceId?: string; reason: string } = {
        entity: src.entity,
        field: "classification",
        reason: "no UK classification computable",
      };
      if (src.sourceId !== undefined) entry.sourceId = src.sourceId;
      opQueue.push(entry);
      provenance.push({
        slot: "classificationGap",
        strategy: "queue-for-registry",
        note: "added to operational-input queue for Registry follow-up",
      });
    }
  }
}
