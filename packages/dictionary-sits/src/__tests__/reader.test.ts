import { describe, it, expect } from "vitest";
import {
  buildDictionaryEntries,
  buildCodeLists,
  findUnregisteredUdfs,
  readSitsDictionary,
} from "../reader.js";
import type {
  MenEntRow,
  MenFldRow,
  MenLkdRow,
  MenLkpRow,
  MenUdfRow,
  SitsDictionarySource,
} from "../types.js";

const entities: MenEntRow[] = [
  { ent_code: "STU", ent_name: "Student", ent_desc: "Student record", ent_inus: "Y" },
  {
    ent_code: "SCJ",
    ent_name: "Student Course Join",
    ent_desc: "Course attachment",
    ent_inus: "Y",
  },
];

const fields: MenFldRow[] = [
  {
    fld_ent: "STU",
    fld_code: "STU_SURN",
    fld_name: "Surname",
    fld_desc: "Family name",
    fld_type: "VARCHAR2(60)",
    fld_mand: "Y",
    fld_idxd: "Y",
  },
  {
    fld_ent: "STU",
    fld_code: "STU_NATN",
    fld_name: "Nationality",
    fld_type: "VARCHAR2(3)",
    fld_lkp: "NAT",
    fld_linked_ent: "NAT",
    fld_linked_fld: "NAT_CODE",
  },
  {
    fld_ent: "STU",
    fld_code: "STU_UDF3",
    fld_name: "UDF3",
    fld_type: "VARCHAR2(100)",
  },
  // Orphan field whose entity doesn't exist — must be dropped
  {
    fld_ent: "ZZZ",
    fld_code: "ZZZ_BAD",
    fld_name: "Orphan",
  },
];

const lookups: MenLkpRow[] = [
  { lkp_code: "NAT", lkp_name: "Nationality", lkp_desc: "ISO 3166 / HESA NATN" },
  { lkp_code: "ETHN", lkp_name: "Ethnicity", lkp_desc: "HESA ethnicity codeset" },
];

const lookupDetails: MenLkdRow[] = [
  {
    lkd_lkp: "NAT",
    lkd_code: "GB",
    lkd_desc: "United Kingdom",
    lkd_sdesc: "UK",
    lkd_inus: "Y",
    lkd_seq: 1,
  },
  { lkd_lkp: "NAT", lkd_code: "FR", lkd_desc: "France", lkd_inus: "Y", lkd_seq: 2 },
  { lkd_lkp: "NAT", lkd_code: "ZZ", lkd_desc: "Retired", lkd_inus: "N", lkd_seq: 99 },
  { lkd_lkp: "ETHN", lkd_code: "10", lkd_desc: "White - British" },
];

const udfs: MenUdfRow[] = [
  {
    udf_ent: "STU",
    udf_col: "STU_UDF1",
    udf_name: "Pronouns",
    udf_desc: "Institutionally tracked pronouns",
    udf_type: "VARCHAR2(20)",
  },
];

describe("buildDictionaryEntries", () => {
  it("emits one entry per known (entity, field) plus one per UDF registration", () => {
    const entries = buildDictionaryEntries({ entities, fields, udfs });
    // 3 known STU fields + 1 UDF registration = 4 (ZZZ orphan dropped)
    expect(entries).toHaveLength(4);
    const codes = entries.map((e) => `${e.entityCode}.${e.fieldCode}`);
    expect(codes).toContain("STU.STU_SURN");
    expect(codes).toContain("STU.STU_NATN");
    expect(codes).toContain("STU.STU_UDF3");
    expect(codes).toContain("STU.STU_UDF1");
  });

  it("maps mandatory/indexed/codelist FK metadata onto entries", () => {
    const entries = buildDictionaryEntries({ entities, fields, udfs });
    const surn = entries.find((e) => e.fieldCode === "STU_SURN");
    expect(surn?.isMandatory).toBe(true);
    expect(surn?.isIndexed).toBe(true);
    const natn = entries.find((e) => e.fieldCode === "STU_NATN");
    expect(natn?.codeListRef).toBe("NAT");
    expect(natn?.linkedEntity).toBe("NAT");
  });

  it("UDF registrations carry decoded business name", () => {
    const entries = buildDictionaryEntries({ entities, fields, udfs });
    const udf1 = entries.find((e) => e.fieldCode === "STU_UDF1");
    expect(udf1?.udfDecoded).toBe("Pronouns");
    expect(udf1?.businessName).toBe("Pronouns");
  });

  it("drops fields whose owning entity is unknown", () => {
    const entries = buildDictionaryEntries({ entities, fields, udfs });
    expect(entries.find((e) => e.entityCode === "ZZZ")).toBeUndefined();
  });
});

describe("buildCodeLists", () => {
  it("emits one CodeList per lookup with id SITS.<lkp_code>", () => {
    const lists = buildCodeLists({
      lookups,
      details: lookupDetails,
      snapshotAt: "2026-01-01T00:00:00.000Z",
    });
    expect(lists.map((l) => l.id)).toEqual(["SITS.ETHN", "SITS.NAT"]);
  });

  it("populates entries with isActive derived from lkd_inus", () => {
    const lists = buildCodeLists({
      lookups,
      details: lookupDetails,
      snapshotAt: "2026-01-01T00:00:00.000Z",
    });
    const nat = lists.find((l) => l.id === "SITS.NAT")!;
    expect(nat.entries).toHaveLength(3);
    const retired = nat.entries.find((e) => e.code === "ZZ");
    expect(retired?.isActive).toBe(false);
    const gb = nat.entries.find((e) => e.code === "GB");
    expect(gb?.isActive).toBe(true);
    expect(gb?.shortDescription).toBe("UK");
    expect(gb?.sortOrder).toBe(1);
  });

  it("defaults isActive to true when lkd_inus is absent", () => {
    const lists = buildCodeLists({
      lookups,
      details: lookupDetails,
      snapshotAt: "2026-01-01T00:00:00.000Z",
    });
    const ethn = lists.find((l) => l.id === "SITS.ETHN")!;
    expect(ethn.entries[0]?.isActive).toBe(true);
  });
});

describe("findUnregisteredUdfs", () => {
  it("returns UDF columns present in men_fld but missing from men_udf", () => {
    const unregistered = findUnregisteredUdfs({ fields, udfs });
    expect(unregistered).toEqual([{ entityCode: "STU", fieldCode: "STU_UDF3" }]);
  });
});

describe("readSitsDictionary (end-to-end)", () => {
  it("fans out to all five source callbacks and merges results", async () => {
    const source: SitsDictionarySource = {
      fetchEntities: async () => entities,
      fetchFields: async () => fields,
      fetchLookups: async () => lookups,
      fetchLookupDetails: async () => lookupDetails,
      fetchUdfRegistrations: async () => udfs,
    };
    const result = await readSitsDictionary(source, { snapshotAt: "2026-01-01T00:00:00.000Z" });
    expect(result.entries.length).toBe(4);
    expect(result.codeLists.length).toBe(2);
  });
});
