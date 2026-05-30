/**
 * SJMS5 resource → relation mapping.
 *
 * Each supported resource maps to a relation in the SJMS5 Postgres schema
 * along with a deterministic order-by key used for cursor pagination, plus
 * an optional incremental column (e.g. updated_at) used when
 * StreamRowsArgs.sinceTimestamp is supplied.
 *
 * Keep this purely declarative — the adapter consumes these descriptors to
 * compose SQL with parameter binding. No SQL fragments are user-controlled.
 */

export interface ResourceDescriptor {
  /** Public resource name exposed via SourceAdapter. */
  readonly resource: string;
  /** Relation name in the SJMS5 schema (table or view). */
  readonly relation: string;
  /** Primary key column used for cursor pagination + getRecordById. */
  readonly pkColumn: string;
  /** Optional column used for incremental sync. */
  readonly incrementalColumn?: string;
  /** Columns to project. */
  readonly columns: ReadonlyArray<string>;
}

export const SJMS5_RESOURCES: Readonly<Record<string, ResourceDescriptor>> = {
  Student: {
    resource: "Student",
    relation: "students",
    pkColumn: "id",
    incrementalColumn: "updated_at",
    columns: [
      "id",
      "student_number",
      "given_names",
      "family_name",
      "date_of_birth",
      "email",
      "created_at",
      "updated_at",
    ],
  },
  Enrolment: {
    resource: "Enrolment",
    relation: "enrolments",
    pkColumn: "id",
    incrementalColumn: "updated_at",
    columns: [
      "id",
      "student_id",
      "programme_id",
      "academic_year",
      "status",
      "start_date",
      "end_date",
      "created_at",
      "updated_at",
    ],
  },
  Module: {
    resource: "Module",
    relation: "modules",
    pkColumn: "id",
    incrementalColumn: "updated_at",
    columns: [
      "id",
      "code",
      "title",
      "credits",
      "level",
      "department_id",
      "created_at",
      "updated_at",
    ],
  },
  Programme: {
    resource: "Programme",
    relation: "programmes",
    pkColumn: "id",
    incrementalColumn: "updated_at",
    columns: [
      "id",
      "code",
      "title",
      "level",
      "duration_months",
      "department_id",
      "created_at",
      "updated_at",
    ],
  },
};

export const SJMS5_RESOURCE_NAMES = Object.keys(SJMS5_RESOURCES) as ReadonlyArray<string>;

/** Quote a Postgres identifier (table or column name). */
export function quoteIdent(name: string): string {
  // Allowlist guard: identifiers come from this file (not user input), but
  // still strict-check for safety in case the map is ever extended at runtime.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`adapter-sjms5: refusing to quote unsafe identifier '${name}'`);
  }
  return `"${name}"`;
}
