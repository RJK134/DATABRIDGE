/**
 * @databridge/dictionary-sits
 *
 * SITS:Vision dictionary reader. Composes Tribal's metadata tables
 * (men_ent / men_fld / men_lkp / men_lkd / men_udf) into canonical
 * `DictionaryEntry[]` + `CodeList[]` shapes.
 */
export * from "./types.js";
export {
  buildDictionaryEntries,
  buildCodeLists,
  readSitsDictionary,
  findUnregisteredUdfs,
} from "./reader.js";
