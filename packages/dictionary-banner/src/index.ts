/**
 * @databridge/dictionary-banner
 *
 * Banner validation-table reader. Composes STV / GTV / FTV rows into
 * canonical `CodeList[]` for the audit engine and `/dictionary` API.
 */
export * from "./types.js";
export {
  buildBannerCodeLists,
  readBannerDictionary,
  PRIORITY_BANNER_TABLES,
  findMissingPriorityTables,
} from "./reader.js";
