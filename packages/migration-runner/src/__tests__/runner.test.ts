import { describe, it, expect } from "vitest";
import { BannerTargetAdapter, InMemoryTransport, SitsTargetAdapter } from "@databridge/target-adapters";
import { buildDefaultPolicy, parsePartialPolicy } from "@databridge/migration-policy";
import { createDefaultRegistry } from "@databridge/codeset-mapper";

import { MigrationRunner } from "../runner.js";
import { CrnGeneratorState } from "../transforms/crn.js";
import { ScjAttemptAllocator } from "../transforms/scj-attempt.js";
import { convertCreditHoursToCats } from "../transforms/credit-hour.js";
import { termToAyr } from "../transforms/term-to-ayr.js";
import { translateGrade, translateFeeStatus } from "../transforms/grade-fee.js";
import { makeTestContext } from "./test-context.js";

describe("CrnGeneratorState", () => {
  it("allocates monotonic CRNs padded to width", () => {
    const state = new CrnGeneratorState({ strategy: "monotonic", start: 10000, width: 5 });
    const a = state.allocate({ subject: "X", section: "1", term: "202410" });
    const b = state.allocate({ subject: "X", section: "2", term: "202410" });
    expect(a.crn).toBe("10000");
    expect(b.crn).toBe("10001");
  });

  it("hash strategy is deterministic per tuple", () => {
    const a = new CrnGeneratorState({ strategy: "hash", bucketSize: 99999 });
    const b = new CrnGeneratorState({ strategy: "hash", bucketSize: 99999 });
    const r1 = a.allocate({ subject: "CS", section: "01", term: "202410" });
    const r2 = b.allocate({ subject: "CS", section: "01", term: "202410" });
    expect(r1.crn).toBe(r2.crn);
  });

  it("preserve-existing returns supplied CRN", () => {
    const state = new CrnGeneratorState({ strategy: "preserve-existing", fallback: "monotonic" });
    const r = state.allocate({ subject: "X", section: "1", term: "T", existingCrn: "99999" });
    expect(r.crn).toBe("99999");
  });
});

describe("ScjAttemptAllocator", () => {
  it("monotonic increments per student", () => {
    const a = new ScjAttemptAllocator({ strategy: "monotonic", startAt: 1 });
    expect(a.allocate({ studentId: "S1" }).scjCode).toBe("1");
    expect(a.allocate({ studentId: "S1" }).scjCode).toBe("2");
    expect(a.allocate({ studentId: "S2" }).scjCode).toBe("1");
  });

  it("source-preserved passes through upstream code", () => {
    const a = new ScjAttemptAllocator({ strategy: "source-preserved" });
    expect(a.allocate({ studentId: "S1", sourceAttempt: "7" }).scjCode).toBe("7");
  });
});

describe("convertCreditHoursToCats", () => {
  it("4 credit-hours → 15 CATS at 3.75 factor", () => {
    const r = convertCreditHoursToCats(4, { catsPerCreditHour: 3.75, rounding: "nearest" });
    expect(r.cats).toBe(15);
  });

  it("rounds per policy", () => {
    expect(convertCreditHoursToCats(1, { catsPerCreditHour: 3.7, rounding: "floor" }).cats).toBe(3);
    expect(convertCreditHoursToCats(1, { catsPerCreditHour: 3.7, rounding: "ceil" }).cats).toBe(4);
  });
});

describe("termToAyr", () => {
  it("regex strategy parses Banner-style codes", () => {
    const r = termToAyr(
      "202410",
      { strategy: "regex", pattern: "^(\\d{4})(\\d{2})$", yearGroup: 1, termGroup: 2, ayrFormat: "YYYY/Y" },
    );
    expect(r.ayr).toBe("2024/5");
  });

  it("stvterm-driven uses the supplied table", () => {
    const r = termToAyr("202410", { strategy: "stvterm-driven" }, { "202410": "2024/5" });
    expect(r.ayr).toBe("2024/5");
  });
});

describe("translateGrade / translateFeeStatus", () => {
  const registry = createDefaultRegistry();

  it("translates Banner letter grade via STVGRDE map", () => {
    const r = translateGrade(
      registry,
      { mapId: "banner-stvgrde-to-numeric@1.0.0", onMissing: "warn" },
      "B+",
    );
    expect(r.value).toBe("78");
  });

  it("defaults unmapped fee-status code to 99 when configured", () => {
    const r = translateFeeStatus(
      registry,
      { mapId: "banner-stvresd-to-hesa-feestatus@1.0.0", defaultToUnknown: true },
      "ZZZ",
    );
    expect(r.value).toBe("99");
  });
});

describe("MigrationRunner — end-to-end", () => {
  it("dry-run produces a diff with all rows marked 'skip' (dry-run)", async () => {
    const policy = parsePartialPolicy({
      id: "dryrun@1",
      sourceSystem: "banner",
      targetSystem: "sits",
      termToAcademicYear: {
        strategy: "regex",
        pattern: "^(\\d{4})(\\d{2})$",
        yearGroup: 1,
        termGroup: 2,
        ayrFormat: "YYYY/Y",
      },
    });
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const runner = new MigrationRunner({
      policy,
      targetAdapter: adapter,
      codesetRegistry: createDefaultRegistry(),
      migrationRunId: "run-dry",
    });
    const report = await runner.run({
      ctx: makeTestContext(),
      dryRun: true,
      rows: [
        {
          entity: "ssbsect",
          data: {
            subject: "CS",
            seq_number: "01",
            term: "202410",
            credit_hours: 4,
            // SITS section entity requires crn + ayr + sub + sec_no — but
            // adapter requires only "crs" etc for required-field check.
          },
        },
      ],
    });
    expect(report.dryRun).toBe(true);
    expect(report.diffs.length).toBe(1);
    expect(report.diffs[0]!.payload["crn"]).toBe("10000");
    expect(report.diffs[0]!.payload["cats"]).toBe(15);
    expect(report.diffs[0]!.payload["ayr"]).toBe("2024/5");
    // Source entity ssbsect is not in SITS required-field list (it'd be 'crs'),
    // so the runner passes it through with no validation errors.
    expect(transport.store.size).toBe(0); // dry-run: no writes
  });

  it("non-dry-run writes through the InMemoryTransport and records rollback log", async () => {
    const policy = buildDefaultPolicy({
      id: "live@1",
      sourceSystem: "banner",
      targetSystem: "sits",
    });
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const runner = new MigrationRunner({
      policy,
      targetAdapter: adapter,
      migrationRunId: "run-live",
    });
    const report = await runner.run({
      ctx: makeTestContext(),
      dryRun: false,
      rows: [
        // Use entity "stu" which requires stu_code + stu_surn + stu_fnm1
        {
          entity: "stu",
          data: { stu_code: "S0001", stu_surn: "Smith", stu_fnm1: "Alex" },
        },
      ],
    });
    expect(report.totals.created).toBe(1);
    expect(report.rollbackLog.length).toBe(1);
    expect(transport.store.get("stu")?.size).toBe(1);
  });

  it("validation errors produce skip diffs, runner does NOT write them", async () => {
    const policy = buildDefaultPolicy({
      id: "validate@1",
      sourceSystem: "banner",
      targetSystem: "sits",
    });
    const transport = new InMemoryTransport();
    const adapter = new SitsTargetAdapter(transport);
    const runner = new MigrationRunner({
      policy,
      targetAdapter: adapter,
      migrationRunId: "run-validate",
    });
    const report = await runner.run({
      ctx: makeTestContext(),
      dryRun: false,
      rows: [
        // Missing required stu_surn and stu_fnm1 for SITS adapter
        { entity: "stu", data: { stu_code: "S0001" } },
      ],
    });
    expect(report.totals.skipped).toBe(1);
    expect(report.totals.validationErrors).toBeGreaterThan(0);
    expect(report.diffs[0]!.op).toBe("skip");
    expect(report.diffs[0]!.reason).toBe("validation-error");
    expect(transport.store.size).toBe(0);
  });

  it("classification-gap policy queues finalists with no classification", async () => {
    const policy = parsePartialPolicy({
      id: "queue@1",
      sourceSystem: "banner",
      targetSystem: "sits",
      classificationGap: { strategy: "queue-for-registry" },
    });
    const transport = new InMemoryTransport();
    const adapter = new BannerTargetAdapter(transport);
    const runner = new MigrationRunner({
      policy,
      targetAdapter: adapter,
      migrationRunId: "run-queue",
    });
    const report = await runner.run({
      ctx: makeTestContext(),
      dryRun: true,
      rows: [
        {
          entity: "scj",
          data: { pidm: "P1", finalist: true, classification: null },
          sourceId: "scj-row-1",
        },
      ],
    });
    expect(report.operationalQueue.length).toBe(1);
    expect(report.operationalQueue[0]!.entity).toBe("scj");
    expect(report.operationalQueue[0]!.sourceId).toBe("scj-row-1");
  });
});
