/**
 * Banner validation-table row shapes.
 *
 * Banner validation tables follow a uniform naming pattern:
 *   <PREFIX>xxxx_CODE          — the code value (primary key)
 *   <PREFIX>xxxx_DESC          — long description
 *   <PREFIX>xxxx_ACTIVITY_DATE — last-modified timestamp
 *   <PREFIX>xxxx_USER_ID       — last-modified user
 *
 * (BANNER_DATA_STRUCTURES §9.)
 *
 * Some tables also expose:
 *   <PREFIX>xxxx_SYS_REQ_IND   — system-required ('Y'/'N')
 *   <PREFIX>xxxx_VR_MSG_NO     — message number for VR validation
 *   ... plus table-specific extra columns we surface verbatim under
 *   the `extras` map so audit rules can read them.
 *
 * Prefixes:
 *   STV — Student validation
 *   GTV — General validation
 *   FTV — Finance validation
 */
export type BannerValidationPrefix = "STV" | "GTV" | "FTV";

/**
 * One row of a Banner validation table.
 * `code` / `desc` are mandatory; everything else is best-effort.
 */
export interface BannerValidationRow {
  /** STV/GTV/FTV table name without the prefix, e.g. "TERM" for STVTERM. */
  table: string;
  /** The Banner prefix. */
  prefix: BannerValidationPrefix;
  /** xxxx_CODE value. */
  code: string;
  /** xxxx_DESC long description. */
  desc: string;
  /** Activity date — ISO string. */
  activityDate?: string | null;
  /** System-required indicator ('Y' = system-protected). */
  sysReqInd?: string | null;
  /** Display sequence if the table carries one. */
  displaySeq?: number | null;
  /** Verbatim extra columns (table-specific). */
  extras?: Record<string, string | number | boolean | null>;
}

/** Adapter-agnostic row source. */
export interface BannerDictionarySource {
  /**
   * Return ALL validation rows the adapter is willing to surface,
   * across STV/GTV/FTV tables. The reader will partition them by
   * (prefix, table) into individual CodeList[].
   */
  fetchValidationRows: () => Promise<BannerValidationRow[]>;
}
