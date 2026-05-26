/**
 * Row shapes for the SITS dictionary tables consumed by this reader.
 * These mirror the Tribal SITS:Vision schema described in
 * SITS_DATA_STRUCTURES §3 ("Master/Dictionary tables").
 */

/** Row of `men_ent` (entity catalogue). */
export interface MenEntRow {
  /** `ent_code` — entity code, e.g. "STU", "SCJ", "SCE". */
  ent_code: string;
  /** `ent_name` — business name of the entity. */
  ent_name: string;
  /** `ent_desc` — long description. */
  ent_desc?: string | null;
  /** `ent_inus` — in use flag ("Y"/"N"). */
  ent_inus?: string | null;
}

/** Row of `men_fld` (field catalogue). */
export interface MenFldRow {
  /** `fld_ent` — owning entity code. */
  fld_ent: string;
  /** `fld_code` — field/column code, e.g. "STU_SURN". */
  fld_code: string;
  /** `fld_name` — business name of the field. */
  fld_name: string;
  /** `fld_desc` — long description. */
  fld_desc?: string | null;
  /** `fld_type` — data type as configured in SITS. */
  fld_type?: string | null;
  /** `fld_mand` — "Y"/"N" mandatory flag. */
  fld_mand?: string | null;
  /** `fld_idxd` — "Y"/"N" indexed flag. */
  fld_idxd?: string | null;
  /** `fld_lkp`  — id of lookup table this field FKs to (men_lkp). */
  fld_lkp?: string | null;
  /** `fld_linked_ent` — entity this field links to (for FK fields). */
  fld_linked_ent?: string | null;
  /** `fld_linked_fld` — field on the linked entity. */
  fld_linked_fld?: string | null;
}

/** Row of `men_lkp` (lookup definition). */
export interface MenLkpRow {
  /** `lkp_code` — lookup id, e.g. "MST", "NAT", "ETHN". */
  lkp_code: string;
  /** `lkp_name` — lookup name. */
  lkp_name: string;
  /** `lkp_desc` — description. */
  lkp_desc?: string | null;
}

/** Row of `men_lkd` (lookup detail / individual code values). */
export interface MenLkdRow {
  /** `lkd_lkp` — owning lookup code (FK to `men_lkp.lkp_code`). */
  lkd_lkp: string;
  /** `lkd_code` — the code value itself. */
  lkd_code: string;
  /** `lkd_desc` — long description. */
  lkd_desc: string;
  /** `lkd_sdesc` — short description (optional). */
  lkd_sdesc?: string | null;
  /** `lkd_inus` — in-use flag ("Y"/"N"); when "N" the code is retired. */
  lkd_inus?: string | null;
  /** `lkd_seq` — sort sequence. */
  lkd_seq?: number | null;
}

/** Row of `men_udf` (user-defined field registration). */
export interface MenUdfRow {
  /** `udf_ent` — owning entity (e.g. "STU"). */
  udf_ent: string;
  /** `udf_col` — physical UDF column, e.g. "STU_UDF1". */
  udf_col: string;
  /** `udf_name` — business name the institution gave the UDF. */
  udf_name: string;
  /** `udf_desc` — description. */
  udf_desc?: string | null;
  /** `udf_type` — data type. */
  udf_type?: string | null;
  /** `udf_lkp` — optional FK to a lookup (codeset) governing this UDF. */
  udf_lkp?: string | null;
}

/**
 * Adapter-agnostic row source. The SITS Oracle adapter (or any test
 * harness) supplies these six callbacks; the reader composes them into
 * canonical DictionaryEntry[] and CodeList[] outputs.
 */
export interface SitsDictionarySource {
  fetchEntities: () => Promise<MenEntRow[]>;
  fetchFields: () => Promise<MenFldRow[]>;
  fetchLookups: () => Promise<MenLkpRow[]>;
  fetchLookupDetails: () => Promise<MenLkdRow[]>;
  fetchUdfRegistrations: () => Promise<MenUdfRow[]>;
}
