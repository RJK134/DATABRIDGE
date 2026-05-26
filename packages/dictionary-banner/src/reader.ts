/**
 * Banner dictionary reader.
 *
 * Composes Banner STV / GTV / FTV validation rows into canonical
 * `CodeList[]`. One CodeList per validation table.
 *
 * Pure transform — receives a `BannerDictionarySource` (one async row
 * fetcher across all validation tables) and emits `CodeList[]`.
 */
import type { CodeList, CodeListEntry } from "@databridge/adapter-spec";
import type {
  BannerDictionarySource,
  BannerValidationPrefix,
  BannerValidationRow,
} from "./types.js";

/**
 * Human-readable names for the validation tables we know about.
 * Anything not listed here falls back to the table code itself.
 * Names track BANNER_DATA_STRUCTURES §9.
 */
const TABLE_NAMES: Partial<Record<string, string>> = {
  TERM: "Term codes",
  MAJR: "Major / programme of study",
  LEVL: "Level (UG/PG/PHD)",
  DEGC: "Degree codes",
  COLL: "College",
  DEPT: "Department",
  CAMP: "Campus",
  RESD: "Residency / fee status",
  STYP: "Student type",
  ADMT: "Admit type",
  RSTS: "Registration status",
  ATTS: "Attendance",
  ESTS: "Enrolment status",
  ASTD: "Academic standing",
  CLAS: "Class",
  GMOD: "Grade mode",
  GRDE: "Grade",
  HLDD: "Hold type",
  NATN: "Nation",
  ETHN: "Ethnicity (legacy)",
  RACE: "Race",
  CITZ: "Citizenship",
  CNTY: "County",
  HOUS: "Housing",
  SCHD: "Schedule type",
  SSTS: "Section status",
  CSTS: "Course status",
  MTYP: "Meeting type",
  STST: "Student status",
  APDC: "Admissions decision",
  ZIPC: "Postcode",
  SDAX: "Crosswalk values (GTVSDAX)",
  DUNT: "Duration units",
  NTYP: "Name type",
  EMAL: "Email type",
  TELE: "Telephone type",
  ACCT: "Account code",
  FUND: "Fund code",
  ORGN: "Organisation code",
  PROG: "Programme code (finance)",
  ACTV: "Activity code",
  LOCN: "Location code",
};

function partition(rows: BannerValidationRow[]): Map<string, BannerValidationRow[]> {
  const out = new Map<string, BannerValidationRow[]>();
  for (const r of rows) {
    const key = `${r.prefix}${r.table}`;
    const arr = out.get(key);
    if (arr) arr.push(r);
    else out.set(key, [r]);
  }
  return out;
}

function describeSource(prefix: BannerValidationPrefix): string {
  switch (prefix) {
    case "STV":
      return "banner-student-validation";
    case "GTV":
      return "banner-general-validation";
    case "FTV":
      return "banner-finance-validation";
  }
}

/**
 * Build canonical `CodeList[]` from raw Banner validation rows.
 * One CodeList per (prefix, table) pair.
 */
export function buildBannerCodeLists(input: {
  rows: BannerValidationRow[];
  snapshotAt?: string;
}): CodeList[] {
  const snapshotAt = input.snapshotAt ?? new Date().toISOString();
  const grouped = partition(input.rows);
  const out: CodeList[] = [];

  for (const [tableName, rows] of grouped) {
    if (rows.length === 0) continue;
    const first = rows[0]!;
    const prefix = first.prefix;
    const tableCode = first.table;

    // Sort rows by displaySeq then by code.
    rows.sort((a, b) => {
      const aSeq = a.displaySeq ?? Number.POSITIVE_INFINITY;
      const bSeq = b.displaySeq ?? Number.POSITIVE_INFINITY;
      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
    });

    const entries: CodeListEntry[] = rows.map((r) => {
      // A row is considered active unless explicitly system-required-N AND
      // its desc text marks it inactive — we don't trust either signal in
      // isolation, so we default to true and let extras carry the truth.
      const entry: CodeListEntry = {
        code: r.code,
        description: r.desc,
        isActive: true,
      };
      if (typeof r.displaySeq === "number") entry.sortOrder = r.displaySeq;
      if (r.extras && Object.keys(r.extras).length > 0) {
        // Project extras into the `attributes` (string-only) map.
        const attrs: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.extras)) {
          if (v === null || v === undefined) continue;
          attrs[k] = String(v);
        }
        if (r.sysReqInd) attrs["sysReqInd"] = r.sysReqInd;
        if (r.activityDate) attrs["activityDate"] = r.activityDate;
        entry.attributes = attrs;
      } else {
        const attrs: Record<string, string> = {};
        if (r.sysReqInd) attrs["sysReqInd"] = r.sysReqInd;
        if (r.activityDate) attrs["activityDate"] = r.activityDate;
        if (Object.keys(attrs).length > 0) entry.attributes = attrs;
      }
      return entry;
    });

    const list: CodeList = {
      id: `BANNER.${tableName}`,
      name: TABLE_NAMES[tableCode] ?? tableName,
      source: describeSource(prefix),
      entries,
      snapshotAt,
    };
    out.push(list);
  }

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

export async function readBannerDictionary(
  source: BannerDictionarySource,
  options: { snapshotAt?: string } = {},
): Promise<{ codeLists: CodeList[] }> {
  const rows = await source.fetchValidationRows();
  const args: { rows: BannerValidationRow[]; snapshotAt?: string } = { rows };
  if (options.snapshotAt) args.snapshotAt = options.snapshotAt;
  const codeLists = buildBannerCodeLists(args);
  return { codeLists };
}

/** The list of "must-have" Banner validation tables for a healthy install. */
export const PRIORITY_BANNER_TABLES: ReadonlyArray<{ prefix: BannerValidationPrefix; table: string }> = [
  { prefix: "STV", table: "TERM" },
  { prefix: "STV", table: "MAJR" },
  { prefix: "STV", table: "DEGC" },
  { prefix: "STV", table: "RESD" },
  { prefix: "STV", table: "STST" },
  { prefix: "STV", table: "CAMP" },
  { prefix: "STV", table: "LEVL" },
  { prefix: "STV", table: "GRDE" },
  { prefix: "STV", table: "NATN" },
];

/** Returns any priority table absent from the supplied codeset list. */
export function findMissingPriorityTables(codeLists: CodeList[]): string[] {
  const present = new Set(codeLists.map((c) => c.id));
  return PRIORITY_BANNER_TABLES.map((t) => `BANNER.${t.prefix}${t.table}`).filter(
    (id) => !present.has(id),
  );
}
