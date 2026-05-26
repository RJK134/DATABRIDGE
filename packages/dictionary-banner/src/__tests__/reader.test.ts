import { describe, it, expect } from "vitest";
import {
  buildBannerCodeLists,
  findMissingPriorityTables,
  PRIORITY_BANNER_TABLES,
  readBannerDictionary,
} from "../reader.js";
import type { BannerDictionarySource, BannerValidationRow } from "../types.js";

const rows: BannerValidationRow[] = [
  {
    table: "TERM",
    prefix: "STV",
    code: "202410",
    desc: "Autumn 2024/25",
    activityDate: "2024-08-01T00:00:00.000Z",
    sysReqInd: "N",
    displaySeq: 1,
  },
  {
    table: "TERM",
    prefix: "STV",
    code: "202420",
    desc: "Spring 2024/25",
    sysReqInd: "N",
    displaySeq: 2,
  },
  {
    table: "MAJR",
    prefix: "STV",
    code: "CS",
    desc: "Computer Science",
    extras: { collCode: "ENG", hesaSubject: "100366" },
  },
  {
    table: "ZIPC",
    prefix: "GTV",
    code: "OX1 3PW",
    desc: "Oxford OX1 3PW",
  },
];

describe("buildBannerCodeLists", () => {
  it("emits one CodeList per (prefix, table) pair", () => {
    const lists = buildBannerCodeLists({ rows, snapshotAt: "2026-01-01T00:00:00.000Z" });
    expect(lists.map((l) => l.id).sort()).toEqual([
      "BANNER.GTVZIPC",
      "BANNER.STVMAJR",
      "BANNER.STVTERM",
    ]);
  });

  it("uses human-readable names where known and falls back otherwise", () => {
    const lists = buildBannerCodeLists({ rows, snapshotAt: "2026-01-01T00:00:00.000Z" });
    expect(lists.find((l) => l.id === "BANNER.STVTERM")?.name).toBe("Term codes");
    expect(lists.find((l) => l.id === "BANNER.STVMAJR")?.name).toBe(
      "Major / programme of study",
    );
    expect(lists.find((l) => l.id === "BANNER.GTVZIPC")?.name).toBe("Postcode");
  });

  it("sorts entries by displaySeq when provided", () => {
    const lists = buildBannerCodeLists({ rows, snapshotAt: "2026-01-01T00:00:00.000Z" });
    const term = lists.find((l) => l.id === "BANNER.STVTERM")!;
    expect(term.entries.map((e) => e.code)).toEqual(["202410", "202420"]);
  });

  it("projects extras + activityDate + sysReqInd into attributes", () => {
    const lists = buildBannerCodeLists({ rows, snapshotAt: "2026-01-01T00:00:00.000Z" });
    const majr = lists.find((l) => l.id === "BANNER.STVMAJR")!;
    const cs = majr.entries.find((e) => e.code === "CS")!;
    expect(cs.attributes?.["collCode"]).toBe("ENG");
    expect(cs.attributes?.["hesaSubject"]).toBe("100366");
    const term = lists.find((l) => l.id === "BANNER.STVTERM")!;
    const t1 = term.entries.find((e) => e.code === "202410")!;
    expect(t1.attributes?.["activityDate"]).toBe("2024-08-01T00:00:00.000Z");
    expect(t1.attributes?.["sysReqInd"]).toBe("N");
  });

  it("tags source by prefix", () => {
    const lists = buildBannerCodeLists({ rows, snapshotAt: "2026-01-01T00:00:00.000Z" });
    expect(lists.find((l) => l.id === "BANNER.STVTERM")?.source).toBe("banner-student-validation");
    expect(lists.find((l) => l.id === "BANNER.GTVZIPC")?.source).toBe("banner-general-validation");
  });
});

describe("findMissingPriorityTables", () => {
  it("flags absent priority tables", () => {
    const lists = buildBannerCodeLists({ rows, snapshotAt: "2026-01-01T00:00:00.000Z" });
    const missing = findMissingPriorityTables(lists);
    // Present: TERM, MAJR. Missing: DEGC, RESD, STST, CAMP, LEVL, GRDE, NATN.
    expect(missing).toContain("BANNER.STVDEGC");
    expect(missing).toContain("BANNER.STVRESD");
    expect(missing).not.toContain("BANNER.STVTERM");
  });

  it("priority list covers admissions/programme/finance/visa essentials", () => {
    const ids = PRIORITY_BANNER_TABLES.map((t) => `${t.prefix}${t.table}`);
    expect(ids).toContain("STVTERM");
    expect(ids).toContain("STVRESD");
    expect(ids).toContain("STVSTST");
  });
});

describe("readBannerDictionary (end-to-end)", () => {
  it("invokes the row source and returns code lists", async () => {
    const source: BannerDictionarySource = {
      fetchValidationRows: async () => rows,
    };
    const result = await readBannerDictionary(source, { snapshotAt: "2026-01-01T00:00:00.000Z" });
    expect(result.codeLists).toHaveLength(3);
  });
});
