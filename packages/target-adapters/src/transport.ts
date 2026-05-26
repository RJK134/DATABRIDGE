/**
 * TargetTransport — pluggable backend for a TargetAdapter.
 *
 * Real deployments inject an Oracle / Ethos / REST transport here.
 * Tests inject an `InMemoryTransport` and assert against its captured
 * state. The TargetAdapter implementations themselves stay pure-ish:
 * they validate, batch, and gate dry-run, but never speak HTTP / SQL
 * directly.
 */
import type { SampledRow } from "@databridge/adapter-spec";

export interface WrittenRow {
  entity: string;
  /** Row index inside the staged batch (preserved through commit). */
  rowIndex: number;
  /** Surrogate id produced by the transport on insert. */
  targetId: string;
  /** Full row payload as written. */
  payload: SampledRow;
}

export interface TargetTransport {
  /** Persist a single row; return the assigned target id. */
  write(entity: string, row: SampledRow): Promise<string>;
  /** Reverse the write for a previously-assigned target id. */
  remove(entity: string, targetId: string): Promise<void>;
  /** Optional pre-flight (used by J5). */
  hasField?(table: string, field: string): Promise<boolean>;
}

/**
 * InMemoryTransport — captures every write into a Map keyed by target id.
 * Suitable for the verification harness, tests, and `dryRun=false`
 * runs in local development.
 */
export class InMemoryTransport implements TargetTransport {
  private nextId = 1;
  /** entity → Map<targetId, payload>. Exposed read-only for assertions. */
  readonly store = new Map<string, Map<string, SampledRow>>();
  /** Optional schema map used by hasField. */
  readonly schema = new Map<string, Set<string>>();

  /** Seed the in-memory schema for hasField checks (used by J5). */
  declareField(table: string, field: string): void {
    let fields = this.schema.get(table);
    if (!fields) {
      fields = new Set();
      this.schema.set(table, fields);
    }
    fields.add(field);
  }

  async write(entity: string, row: SampledRow): Promise<string> {
    const id = `${entity}-${this.nextId++}`;
    let bucket = this.store.get(entity);
    if (!bucket) {
      bucket = new Map();
      this.store.set(entity, bucket);
    }
    bucket.set(id, { ...row });
    return id;
  }

  async remove(entity: string, targetId: string): Promise<void> {
    this.store.get(entity)?.delete(targetId);
  }

  async hasField(table: string, field: string): Promise<boolean> {
    return this.schema.get(table)?.has(field) ?? false;
  }
}
