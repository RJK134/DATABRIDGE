/**
 * SITS dictionary reader.
 *
 * Composes the five dictionary tables (men_ent / men_fld / men_lkp /
 * men_lkd / men_udf) into the canonical adapter-spec shape consumed by
 * the audit engine and the apps/api `/dictionary` endpoints.
 *
 * Pure transform — receives a `SitsDictionarySource` (six async row
 * fetchers) and emits `DictionaryEntry[]` + `CodeList[]`.
 */
import type { CodeList, DictionaryEntry } from "@databridge/adapter-spec";
import type {
  MenEntRow,
  MenFldRow,
  MenLkdRow,
  MenLkpRow,
  MenUdfRow,
  SitsDictionarySource,
} from "./types.js";

const truthy = (v: string | null | undefined): boolean =>
  typeof v === "string" && v.trim().toUpperCase() === "Y";

/**
 * Build canonical `DictionaryEntry[]` from raw SITS rows.
 *
 * One DictionaryEntry per (entity × field) pair from `men_fld`, plus
 * one DictionaryEntry per registered UDF from `men_udf` carrying the
 * institution-specific decoded name in `udfDecoded`.
 */
export function buildDictionaryEntries(input: {
  entities: MenEntRow[];
  fields: MenFldRow[];
  udfs: MenUdfRow[];
}): DictionaryEntry[] {
  const entityIndex = new Map<string, MenEntRow>();
  for (const e of input.entities) entityIndex.set(e.ent_code, e);

  const out: DictionaryEntry[] = [];

  // Field entries
  for (const f of input.fields) {
    // Skip fields whose owning entity is unknown (corrupt dictionary).
    if (!entityIndex.has(f.fld_ent)) continue;
    const entry: DictionaryEntry = {
      entityCode: f.fld_ent,
      fieldCode: f.fld_code,
      businessName: f.fld_name,
    };
    if (f.fld_desc) entry.description = f.fld_desc;
    if (f.fld_type) entry.dataType = f.fld_type;
    if (f.fld_mand !== null && f.fld_mand !== undefined) {
      entry.isMandatory = truthy(f.fld_mand);
    }
    if (f.fld_idxd !== null && f.fld_idxd !== undefined) {
      entry.isIndexed = truthy(f.fld_idxd);
    }
    if (f.fld_lkp) entry.codeListRef = f.fld_lkp;
    if (f.fld_linked_ent) entry.linkedEntity = f.fld_linked_ent;
    if (f.fld_linked_fld) entry.linkedField = f.fld_linked_fld;
    out.push(entry);
  }

  // UDF registration entries — surface institutional UDF semantics as
  // first-class dictionary rows (SITS §4).
  for (const u of input.udfs) {
    const entry: DictionaryEntry = {
      entityCode: u.udf_ent,
      fieldCode: u.udf_col,
      businessName: u.udf_name,
      udfDecoded: u.udf_name,
    };
    if (u.udf_desc) entry.description = u.udf_desc;
    if (u.udf_type) entry.dataType = u.udf_type;
    if (u.udf_lkp) entry.codeListRef = u.udf_lkp;
    out.push(entry);
  }

  // Stable order: entity, then field
  out.sort((a, b) => {
    if (a.entityCode !== b.entityCode) return a.entityCode < b.entityCode ? -1 : 1;
    return a.fieldCode < b.fieldCode ? -1 : a.fieldCode > b.fieldCode ? 1 : 0;
  });

  return out;
}

/**
 * Build canonical `CodeList[]` from raw SITS lookup rows.
 *
 * One CodeList per `men_lkp` row, populated with active+retired entries
 * from `men_lkd`.
 */
export function buildCodeLists(input: {
  lookups: MenLkpRow[];
  details: MenLkdRow[];
  snapshotAt?: string;
}): CodeList[] {
  const snapshotAt = input.snapshotAt ?? new Date().toISOString();
  const detailsByLkp = new Map<string, MenLkdRow[]>();
  for (const d of input.details) {
    const arr = detailsByLkp.get(d.lkd_lkp);
    if (arr) arr.push(d);
    else detailsByLkp.set(d.lkd_lkp, [d]);
  }

  const out: CodeList[] = [];
  for (const lkp of input.lookups) {
    const rawEntries = detailsByLkp.get(lkp.lkp_code) ?? [];
    // Sort by seq when present, then by code.
    rawEntries.sort((a, b) => {
      const aSeq = a.lkd_seq ?? Number.POSITIVE_INFINITY;
      const bSeq = b.lkd_seq ?? Number.POSITIVE_INFINITY;
      if (aSeq !== bSeq) return aSeq - bSeq;
      return a.lkd_code < b.lkd_code ? -1 : a.lkd_code > b.lkd_code ? 1 : 0;
    });

    const entries = rawEntries.map((d) => {
      const e: CodeList["entries"][number] = {
        code: d.lkd_code,
        description: d.lkd_desc,
        isActive:
          d.lkd_inus === null || d.lkd_inus === undefined
            ? true
            : truthy(d.lkd_inus),
      };
      if (d.lkd_sdesc) e.shortDescription = d.lkd_sdesc;
      if (typeof d.lkd_seq === "number") e.sortOrder = d.lkd_seq;
      return e;
    });

    const list: CodeList = {
      id: `SITS.${lkp.lkp_code}`,
      name: lkp.lkp_name,
      source: "sits",
      entries,
      snapshotAt,
    };
    if (lkp.lkp_desc) list.description = lkp.lkp_desc;
    out.push(list);
  }

  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/** Top-level reader: pull all five tables in parallel, compose results. */
export async function readSitsDictionary(
  source: SitsDictionarySource,
  options: { snapshotAt?: string } = {},
): Promise<{ entries: DictionaryEntry[]; codeLists: CodeList[] }> {
  const [entities, fields, lookups, details, udfs] = await Promise.all([
    source.fetchEntities(),
    source.fetchFields(),
    source.fetchLookups(),
    source.fetchLookupDetails(),
    source.fetchUdfRegistrations(),
  ]);

  const entries = buildDictionaryEntries({ entities, fields, udfs });
  const codeListsArgs: { lookups: MenLkpRow[]; details: MenLkdRow[]; snapshotAt?: string } = {
    lookups,
    details,
  };
  if (options.snapshotAt) codeListsArgs.snapshotAt = options.snapshotAt;
  const codeLists = buildCodeLists(codeListsArgs);

  return { entries, codeLists };
}

/**
 * Discover UDF columns that carry institution-specific data but are NOT
 * registered in `men_udf`. Used by SITS-NAT-10 (GDPR/PII leakage hook).
 */
export function findUnregisteredUdfs(input: {
  fields: MenFldRow[];
  udfs: MenUdfRow[];
}): Array<{ entityCode: string; fieldCode: string }> {
  const registered = new Set(
    input.udfs.map((u) => `${u.udf_ent.toUpperCase()}.${u.udf_col.toUpperCase()}`),
  );
  return input.fields
    .filter((f) => /_UDF\d+$/i.test(f.fld_code))
    .filter(
      (f) => !registered.has(`${f.fld_ent.toUpperCase()}.${f.fld_code.toUpperCase()}`),
    )
    .map((f) => ({ entityCode: f.fld_ent, fieldCode: f.fld_code }));
}
