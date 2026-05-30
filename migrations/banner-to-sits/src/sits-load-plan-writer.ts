/**
 * SitsLoadPlanWriter — thin "writer" target that captures rows into a
 * structured load plan rather than executing them against SITS. The
 * demo-grade replacement for a production SITS write path.
 *
 * The plan groups rows by SITS table (e.g. STU, SCE, SMR) and records
 * the operation (`upsert`) plus the payload. Downstream tooling can
 * convert the plan into IMP feed files, REST calls, or SQL DML — but
 * that translation is out of scope for the demo.
 */
import type { SampledRow } from "@databridge/adapter-spec";

export interface LoadPlanRow {
  op: "upsert" | "insert" | "update";
  payload: SampledRow;
  sourceRowId?: string;
}

export interface LoadPlan {
  /** SITS table → operations to apply. */
  byTable: Map<string, LoadPlanRow[]>;
  rowsTotal: number;
  createdAt: string;
}

export class SitsLoadPlanWriter {
  private readonly byTable = new Map<string, LoadPlanRow[]>();
  private rowsTotal = 0;

  stage(table: string, op: LoadPlanRow["op"], payload: SampledRow, sourceRowId?: string): void {
    let bucket = this.byTable.get(table);
    if (!bucket) {
      bucket = [];
      this.byTable.set(table, bucket);
    }
    const entry: LoadPlanRow =
      sourceRowId !== undefined ? { op, payload, sourceRowId } : { op, payload };
    bucket.push(entry);
    this.rowsTotal += 1;
  }

  build(): LoadPlan {
    return {
      byTable: this.byTable,
      rowsTotal: this.rowsTotal,
      createdAt: new Date().toISOString(),
    };
  }

  /** Inspect the plan without finalising. */
  get tables(): readonly string[] {
    return [...this.byTable.keys()];
  }

  get totalRows(): number {
    return this.rowsTotal;
  }
}
