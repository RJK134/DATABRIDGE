#!/usr/bin/env tsx
/**
 * Fixture generator for the demo harness.
 *
 * Emits four JSON fixtures under apps/demo/fixtures/:
 *   - banner-r2t-2024.json
 *   - sits-southcoast-2024.json
 *   - salesforce-edu-westmidlands.json
 *   - dynamics365-edu-northpennines.json
 *
 * Each fixture seeds 2,000–3,000 rows of synthetic-but-realistic data
 * plus the deliberate data-quality failure modes catalogued in
 * docs/DATABRIDGE_DELIVERY_PLAN.md §7:
 *   - codeset drift
 *   - effective-dating gaps
 *   - identity collisions (duplicate email)
 *   - historic truncation
 *   - structural integrity breaks (orphan FKs)
 *
 * Re-run with `pnpm --filter @databridge/demo exec tsx scripts/generate-fixtures.ts`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface FixtureFile {
  name: string;
  source: string;
  description: string;
  rows: Array<Record<string, string | number | boolean | null>>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(here, "..", "fixtures");

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const FIRST_NAMES = [
  "Alice",
  "Bob",
  "Carol",
  "David",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Ivy",
  "Jack",
  "Kate",
  "Liam",
  "Mia",
  "Noah",
  "Olivia",
  "Pat",
  "Quinn",
  "Ruby",
  "Sam",
  "Tara",
  "Uma",
  "Vince",
  "Wendy",
  "Xander",
  "Yael",
  "Zara",
];
const LAST_NAMES = [
  "Smith",
  "Jones",
  "Williams",
  "Brown",
  "Taylor",
  "Davies",
  "Evans",
  "Wilson",
  "Thomas",
  "Roberts",
  "Johnson",
  "Lewis",
  "Walker",
  "Robinson",
  "Wood",
  "Thompson",
  "White",
  "Watson",
  "Jackson",
  "Wright",
  "Green",
  "Harris",
  "Cooper",
  "King",
  "Lee",
  "Martin",
];
const PROGRAMME_CODES = [
  "CS",
  "EE",
  "BUS",
  "HIST",
  "MATH",
  "BIO",
  "CHEM",
  "PHYS",
  "ECON",
  "LAW",
  "ENG",
  "MED",
];
const CAMPUSES_BANNER = ["MAIN", "NORTH", "WEST", "BUSINESS", "DISTANCE", "OVS"];
const CAMPUSES_SITS = ["M", "N", "W", "B", "D", "O"];
const MODES_BANNER = ["FT", "PT", "SW", "OL", "BL", "DR"];
const RESIDENCY_BANNER = ["H", "E", "O", "I", "U"];
const ETHNICITIES = ["WB", "WI", "WO", "MW", "MA", "AI", "BC", "BA", "ND"];

function makeName(rnd: () => number): { first: string; last: string } {
  const fi = Math.floor(rnd() * FIRST_NAMES.length);
  const li = Math.floor(rnd() * LAST_NAMES.length);
  return { first: FIRST_NAMES[fi]!, last: LAST_NAMES[li]! };
}

function buildBannerFixture(): FixtureFile {
  const rnd = seededRandom(101);
  const rows: FixtureFile["rows"] = [];
  const total = 2400;
  for (let i = 0; i < total; i += 1) {
    const name = makeName(rnd);
    const pidm = 100_000 + i;
    const programmeIdx = Math.floor(rnd() * PROGRAMME_CODES.length);
    const campusIdx = Math.floor(rnd() * CAMPUSES_BANNER.length);
    const modeIdx = Math.floor(rnd() * MODES_BANNER.length);
    const resdIdx = Math.floor(rnd() * RESIDENCY_BANNER.length);
    const ethIdx = Math.floor(rnd() * ETHNICITIES.length);

    // Seeded data-quality issues:
    //  - 1% rows have a SGBSTDN_MAJR_CODE_1 that doesn't appear in STVMAJR (codeset drift)
    //  - 0.5% rows have NULL SPRIDEN_LAST_NAME (historic truncation)
    //  - 1% rows reference a non-existent CAMPUS code (structural integrity break)
    //  - 0.8% rows have effective-from > effective-to (effective-dating gap)
    const codesetDrift = i % 100 === 7;
    const truncated = i % 200 === 13;
    const badCampus = i % 100 === 17;
    const dateGap = i % 125 === 5;

    const studentId = `S${String(pidm).padStart(7, "0")}`;
    const row: FixtureFile["rows"][number] = {
      studentId,
      SPRIDEN_PIDM: pidm,
      SPRIDEN_ID: studentId,
      SPRIDEN_LAST_NAME: truncated ? null : name.last,
      SPRIDEN_FIRST_NAME: name.first,
      SPRIDEN_BIRTH_DATE: `2002-${pad2(1 + Math.floor(rnd() * 12))}-${pad2(1 + Math.floor(rnd() * 28))}`,
      SGBSTDN_PIDM: pidm,
      SGBSTDN_TERM_CODE_EFF: "202410",
      SGBSTDN_STYP_CODE: ["F", "C", "R", "T"][Math.floor(rnd() * 4)]!,
      SGBSTDN_MAJR_CODE_1: codesetDrift ? "XX_LEGACY" : PROGRAMME_CODES[programmeIdx]!,
      SGBSTDN_CAMP_CODE: badCampus ? "ZZZ" : CAMPUSES_BANNER[campusIdx]!,
      SGBSTDN_RESD_CODE: RESIDENCY_BANNER[resdIdx]!,
      SGBSTDN_MODE_CODE: MODES_BANNER[modeIdx]!,
      programmeCode: PROGRAMME_CODES[programmeIdx]!,
      termCode: "202410",
      campusCode: badCampus ? "ZZZ" : CAMPUSES_BANNER[campusIdx]!,
      feeStatus: RESIDENCY_BANNER[resdIdx]!,
      ethnicity: ETHNICITIES[ethIdx]!,
      effectiveFrom: "2024-09-01",
      effectiveTo: dateGap ? "2024-08-01" : "2025-08-31",
      lastName: truncated ? null : name.last,
      email: `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${pidm}@uni.example`,
    };
    rows.push(row);
  }
  return {
    name: "banner-r2t-2024",
    source: "banner",
    description:
      "Round 2 Trent-style Banner extract — 2,400 students with seeded data-quality issues (codeset drift, historic truncation, integrity breaks, effective-dating gaps).",
    rows,
  };
}

function buildSitsFixture(): FixtureFile {
  const rnd = seededRandom(202);
  const rows: FixtureFile["rows"] = [];
  const total = 2200;
  for (let i = 0; i < total; i += 1) {
    const name = makeName(rnd);
    const studentId = `S${String(100_000 + i).padStart(7, "0")}`;
    const programmeIdx = Math.floor(rnd() * PROGRAMME_CODES.length);
    const campusIdx = Math.floor(rnd() * CAMPUSES_SITS.length);
    const ethIdx = Math.floor(rnd() * ETHNICITIES.length);

    // Issues:
    //  - 1% rows missing STU_HUSID (identity collision risk)
    //  - 1% duplicate emails (identity collision)
    //  - 0.5% rows missing STU_SURN
    //  - 1% campus codes that don't appear in the sits CAM table
    const missingHusid = i % 100 === 11;
    const duplicateEmail = i % 100 === 23;
    const missingSurn = i % 200 === 17;
    const codesetDrift = i % 100 === 29;
    const husid = missingHusid ? null : `${1_000_000_000 + i}`;

    const row: FixtureFile["rows"][number] = {
      studentId,
      STU_CODE: studentId,
      STU_SURN: missingSurn ? null : name.last,
      STU_FORE: name.first,
      STU_HUSID: husid,
      STU_DOB: `2002-${pad2(1 + Math.floor(rnd() * 12))}-${pad2(1 + Math.floor(rnd() * 28))}`,
      STU_FESC: ["01", "02", "03"][Math.floor(rnd() * 3)]!,
      SCE_AYR: "2024/25",
      SCE_POS: PROGRAMME_CODES[programmeIdx]!,
      SCE_CAM: codesetDrift ? "ZZ" : CAMPUSES_SITS[campusIdx]!,
      SCE_STYP: ["FT", "CT", "RT", "TR"][Math.floor(rnd() * 4)]!,
      programmeCode: PROGRAMME_CODES[programmeIdx]!,
      termCode: "2024/25",
      campusCode: codesetDrift ? "ZZ" : CAMPUSES_SITS[campusIdx]!,
      feeStatus: ["01", "02", "03"][Math.floor(rnd() * 3)]!,
      ethnicity: ETHNICITIES[ethIdx]!,
      lastName: missingSurn ? null : name.last,
      email: duplicateEmail
        ? "shared@uni.example"
        : `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${i}@uni.example`,
    };
    rows.push(row);
  }
  return {
    name: "sits-southcoast-2024",
    source: "sits",
    description:
      "SITS:Vision South Coast University style extract — 2,200 students with HUSID gaps, duplicate emails, codeset drift, and historic truncation.",
    rows,
  };
}

function buildSalesforceFixture(): FixtureFile {
  const rnd = seededRandom(303);
  const rows: FixtureFile["rows"] = [];
  const total = 2000;
  for (let i = 0; i < total; i += 1) {
    const name = makeName(rnd);
    const sfid = `001${String(i).padStart(9, "0")}A`;
    const externalId = `S${String(100_000 + i).padStart(7, "0")}`;

    // Issues:
    //  - 1% duplicate Email (identity collision — SALESFORCE-EDU-01)
    //  - 1% Affiliations with no Account (SALESFORCE-EDU-02)
    //  - 1% Programme Plan = Current but no enrollments (SALESFORCE-EDU-03)
    //  - 1% Contacts with FERPA=Withheld + HasOptedOutOfEmail=false (SALESFORCE-EDU-06)
    //  - 1% Enrolments with no hed__Course_Offering__c (SALESFORCE-EDU-05)
    const duplicateEmail = i % 100 === 41;
    const orphanAff = i % 100 === 19;
    const stalePlan = i % 100 === 5;
    const ferpaBug = i % 100 === 73;
    const orphanEnrol = i % 100 === 61;

    const row: FixtureFile["rows"][number] = {
      Id: sfid,
      External_Id__c: externalId,
      studentId: externalId,
      FirstName: name.first,
      LastName: name.last,
      lastName: name.last,
      Email: duplicateEmail
        ? "shared.contact@uni.example"
        : `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${i}@uni.example`,
      email: duplicateEmail
        ? "shared.contact@uni.example"
        : `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${i}@uni.example`,
      hed__Account__c: orphanAff ? null : `001Acc${String(i % 50).padStart(4, "0")}`,
      hed__Contact__c: sfid,
      hed__Program_Plan__c: `001PP${String(i % 80).padStart(4, "0")}`,
      hed__Status__c: stalePlan ? "Current" : i % 5 === 0 ? "Closed" : "Current",
      hed__Course_Offering__c: orphanEnrol ? null : `001CO${String(i % 120).padStart(4, "0")}`,
      hed__FERPA__c: ferpaBug ? "Withheld" : "Granted",
      HasOptedOutOfEmail: ferpaBug ? false : true,
      LeadSource: i % 3 === 0 ? "Web" : null,
    };
    rows.push(row);
  }
  return {
    name: "salesforce-edu-westmidlands",
    source: "salesforce-edu",
    description:
      "West Midlands University-style Salesforce Education Cloud extract — 2,000 Contact / Affiliation / Programme Plan rows with seeded duplicate emails, orphan affiliations, FERPA mismatches, and orphan enrolments.",
    rows,
  };
}

function buildDynamicsFixture(): FixtureFile {
  const rnd = seededRandom(404);
  const rows: FixtureFile["rows"] = [];
  const total = 2100;
  for (let i = 0; i < total; i += 1) {
    const name = makeName(rnd);
    const contactid = `cnt-${String(i).padStart(6, "0")}`;
    const externalId = `S${String(100_000 + i).padStart(7, "0")}`;

    // Issues mirror Salesforce:
    //  - duplicate emailaddress1 (DYNAMICS365-EDU-01)
    //  - orphan msdyn_studentprogram (DYNAMICS365-EDU-02)
    //  - active program without students (DYNAMICS365-EDU-03)
    //  - opt-out + on marketing list (DYNAMICS365-EDU-06)
    //  - missing course on courseinstance (DYNAMICS365-EDU-05)
    const duplicateEmail = i % 100 === 37;
    const orphanSp = i % 100 === 23;
    const privacyBug = i % 100 === 79;
    const orphanCi = i % 100 === 67;

    const row: FixtureFile["rows"][number] = {
      contactid,
      msdyn_externalstudentid: externalId,
      studentId: externalId,
      firstname: name.first,
      lastname: name.last,
      lastName: name.last,
      emailaddress1: duplicateEmail
        ? "shared.contact@uni.example"
        : `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${i}@uni.example`,
      email: duplicateEmail
        ? "shared.contact@uni.example"
        : `${name.first.toLowerCase()}.${name.last.toLowerCase()}.${i}@uni.example`,
      msdyn_studentid: i % 25 === 0 ? null : externalId,
      msdyn_studentprogramid: `sp-${String(i).padStart(6, "0")}`,
      msdyn_program: orphanSp ? null : `prog-${String(i % 60).padStart(4, "0")}`,
      msdyn_courseinstanceid: `ci-${String(i).padStart(6, "0")}`,
      msdyn_course: orphanCi ? null : `course-${String(i % 90).padStart(4, "0")}`,
      msdyn_programid: `prog-${String(i % 60).padStart(4, "0")}`,
      msdyn_programstatus: i % 5 === 0 ? 2 : 1,
      donotbulkemail: privacyBug,
      donotemail: privacyBug,
      onMarketingList: privacyBug,
      originatingleadid: i % 4 === 0 ? `lead-${i}` : null,
    };
    rows.push(row);
  }
  return {
    name: "dynamics365-edu-northpennines",
    source: "dynamics365-edu",
    description:
      "North Pennines College-style Dynamics 365 Education extract — 2,100 contact / msdyn_studentprogram / msdyn_courseinstance rows with seeded duplicate emails, orphan studentprograms, privacy mismatches, and orphan course-instances.",
    rows,
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

async function main(): Promise<void> {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const fixtures = [
    buildBannerFixture(),
    buildSitsFixture(),
    buildSalesforceFixture(),
    buildDynamicsFixture(),
  ];
  for (const f of fixtures) {
    const file = path.join(FIXTURES_DIR, `${f.name}.json`);
    await fs.writeFile(file, JSON.stringify(f, null, 2));
    process.stdout.write(`wrote ${file} (${f.rows.length} rows)\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`generate-fixtures: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
