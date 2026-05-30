/**
 * BannerLoadPlanWriter — same shape as SitsLoadPlanWriter but tables are
 * Banner-side (SPRIDEN, SGBSTDN, SHRTGPA, …) and the operations describe
 * what a downstream Banner write target would execute.
 */
import type { SampledRow } from "@databridge/adapter-spec";

export interface LoadPlanRow {
  op: "upsert" | "insert" | "update";
  payload: SampledRow;
  sourceRowId?: string;
}

export interface LoadPlan {
  byTable: Map<string, LoadPlanRow[]>;
  rowsTotal: number;
  createdAt: string;
}

export class BannerLoadPlanWriter {
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

  get tables(): readonly string[] {
    return [...this.byTable.keys()];
  }

  get totalRows(): number {
    return this.rowsTotal;
  }
}
