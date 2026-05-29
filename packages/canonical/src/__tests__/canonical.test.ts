import { describe, it, expect } from "vitest";
import {
  CANONICAL_ENTITY_NAMES,
  CANONICAL_SCHEMAS,
  StudentZ,
  EngagementZ,
  StudentCourseSessionZ,
  InstanceZ,
  StudyLocationZ,
  DisabilityZ,
  QualificationAwardedZ,
  SupervisorAllocationZ,
  TermtimeAccommodationZ,
  SesZ,
} from "../index.js";

describe("canonical registry", () => {
  it("exports the Phase F entity set plus Phase G additions", () => {
    // Phase F set is the original 14; Phase G adds 23. Keep the test
    // structural rather than count-anchored so future entity additions
    // do not require a numeric flip.
    expect(CANONICAL_ENTITY_NAMES.length).toBeGreaterThanOrEqual(14);
    for (const phaseF of [
      "Student",
      "Engagement",
      "StudentCourseSession",
      "Module",
      "ModuleInstance",
      "Leaver",
      "EntryProfile",
      "Instance",
      "StudyLocation",
      "SES",
      "Disability",
      "QualificationAwarded",
      "SupervisorAllocation",
      "TermtimeAccommodation",
    ]) {
      expect(CANONICAL_ENTITY_NAMES).toContain(phaseF);
    }
  });

  it("every entity name has a matching schema", () => {
    for (const name of CANONICAL_ENTITY_NAMES) {
      expect(CANONICAL_SCHEMAS[name], `${name} missing from CANONICAL_SCHEMAS`).toBeTruthy();
    }
  });
});

describe("Student schema", () => {
  it("accepts a minimal valid record", () => {
    const result = StudentZ.safeParse({
      id: "00000000-0000-0000-0000-000000000001",
      sourceId: "STU001",
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1815-12-10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid HUSID", () => {
    const result = StudentZ.safeParse({
      id: "00000000-0000-0000-0000-000000000001",
      sourceId: "STU001",
      husid: "not-a-husid",
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1815-12-10",
    });
    expect(result.success).toBe(false);
  });
});

describe("Engagement schema", () => {
  it("requires ukprn", () => {
    const result = EngagementZ.safeParse({
      id: "00000000-0000-0000-0000-000000000002",
      sourceId: "ENG001",
      studentId: "00000000-0000-0000-0000-000000000001",
      startDate: "2024-09-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("StudentCourseSession schema", () => {
  it("accepts valid academic year format", () => {
    const result = StudentCourseSessionZ.safeParse({
      id: "00000000-0000-0000-0000-000000000003",
      sourceId: "SCS001",
      engagementId: "00000000-0000-0000-0000-000000000002",
      academicYear: "2024/25",
      commencementDate: "2024-09-23",
      mode: "1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed academic year", () => {
    const result = StudentCourseSessionZ.safeParse({
      id: "00000000-0000-0000-0000-000000000003",
      sourceId: "SCS001",
      engagementId: "00000000-0000-0000-0000-000000000002",
      academicYear: "2024-2025",
      commencementDate: "2024-09-23",
      mode: "1",
    });
    expect(result.success).toBe(false);
  });
});

describe("HESA Data Futures extension entities", () => {
  const validUuid = "00000000-0000-0000-0000-000000000010";
  const engagementId = "00000000-0000-0000-0000-000000000002";
  const studentId = "00000000-0000-0000-0000-000000000001";
  const instanceId = "00000000-0000-0000-0000-000000000003";

  it("Instance accepts a valid minimal record", () => {
    const result = InstanceZ.safeParse({
      id: validUuid,
      sourceId: "INS001",
      engagementId,
      academicYear: "2024/25",
    });
    expect(result.success).toBe(true);
  });

  it("Instance rejects out-of-range STULOAD", () => {
    const result = InstanceZ.safeParse({
      id: validUuid,
      sourceId: "INS001",
      engagementId,
      academicYear: "2024/25",
      stuload: 150,
    });
    expect(result.success).toBe(false);
  });

  it("StudyLocation requires LOCSDY and proportion", () => {
    const ok = StudyLocationZ.safeParse({
      id: validUuid,
      sourceId: "SL001",
      instanceId,
      locsdy: "UKMAIN",
      proportionPct: 100,
    });
    expect(ok.success).toBe(true);

    const bad = StudyLocationZ.safeParse({
      id: validUuid,
      sourceId: "SL001",
      instanceId,
      locsdy: "UKMAIN",
    });
    expect(bad.success).toBe(false);
  });

  it("Disability accepts code 00 (no known disability)", () => {
    const result = DisabilityZ.safeParse({
      id: validUuid,
      sourceId: "DIS001",
      studentId,
      disableCode: "00",
    });
    expect(result.success).toBe(true);
  });

  it("QualificationAwarded requires awardDate", () => {
    const result = QualificationAwardedZ.safeParse({
      id: validUuid,
      sourceId: "QA001",
      instanceId,
      qualCode: "H",
    });
    expect(result.success).toBe(false);
  });

  it("SupervisorAllocation enum role rejects invalid value", () => {
    const result = SupervisorAllocationZ.safeParse({
      id: validUuid,
      sourceId: "SA001",
      instanceId,
      supervisorSourceId: "SUP001",
      role: "principal",
      startDate: "2024-09-01",
    });
    expect(result.success).toBe(false);
  });

  it("TermtimeAccommodation accepts a valid record", () => {
    const result = TermtimeAccommodationZ.safeParse({
      id: validUuid,
      sourceId: "TT001",
      instanceId,
      accommodationType: "01",
    });
    expect(result.success).toBe(true);
  });

  it("SES accepts SOC2020 with 4-digit format", () => {
    const result = SesZ.safeParse({
      id: validUuid,
      sourceId: "SES001",
      engagementId,
      soc2020: "2314",
    });
    expect(result.success).toBe(true);
  });
});
