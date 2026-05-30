/**
 * Lightweight in-process audit runner used by the demo harness.
 *
 * Evaluates every FnAuditRule whose `enabledByDefault !== false` against
 * the fixture rows, with rule-specific context built up from a single
 * scan of the rows (so duplicate-email / orphan / etc. rules can share
 * their side-channel state).
 */
import type { AuditRule, FnAuditRule, RuleSeverity } from "@databridge/rule-core";

export interface FixtureAuditFinding {
  ruleId: string;
  severity: string;
  message: string;
}

export interface FixtureAuditReport {
  rulesEvaluated: number;
  findingsTotal: number;
  bySeverity: Partial<Record<RuleSeverity | "WARNING", number>>;
  findings: FixtureAuditFinding[];
}

interface DemoFixtureRow {
  [key: string]: string | number | boolean | null;
}

interface DemoFixtureLike {
  rows: DemoFixtureRow[];
}

interface SharedContext {
  seenEmails: Set<string>;
  enrollmentsByProgrammePlan: Set<string>;
  affiliationContactIds: Set<string>;
  contactToProgrammePlan: Set<string>;
  programmePlanStatus: Record<string, string>;
  studentsByProgram: Set<string>;
  studentprogramContactIds: Set<string>;
  programStatus: Record<string, number | string>;
  contactsInMarketingList: Set<string>;
  contactToProgram: Set<string>;
}

function buildSharedContext(rows: readonly DemoFixtureRow[]): SharedContext {
  const ctx: SharedContext = {
    seenEmails: new Set(),
    enrollmentsByProgrammePlan: new Set(),
    affiliationContactIds: new Set(),
    contactToProgrammePlan: new Set(),
    programmePlanStatus: {},
    studentsByProgram: new Set(),
    studentprogramContactIds: new Set(),
    programStatus: {},
    contactsInMarketingList: new Set(),
    contactToProgram: new Set(),
  };
  for (const r of rows) {
    if (typeof r["hed__Program_Plan__c"] === "string") {
      ctx.enrollmentsByProgrammePlan.add(r["hed__Program_Plan__c"]);
    }
    if (typeof r["hed__Contact__c"] === "string") {
      ctx.affiliationContactIds.add(r["hed__Contact__c"]);
    }
    if (typeof r["Id"] === "string" && typeof r["hed__Program_Plan__c"] === "string") {
      ctx.contactToProgrammePlan.add(r["Id"]);
    }
    if (typeof r["hed__Status__c"] === "string" && typeof r["Id"] === "string") {
      ctx.programmePlanStatus[r["Id"]] = r["hed__Status__c"];
    }
    if (typeof r["msdyn_program"] === "string") {
      ctx.studentsByProgram.add(r["msdyn_program"]);
    }
    if (typeof r["contactid"] === "string" && typeof r["msdyn_program"] === "string") {
      ctx.studentprogramContactIds.add(r["contactid"]);
      ctx.contactToProgram.add(r["contactid"]);
    }
    if (typeof r["msdyn_programid"] === "string" && r["msdyn_programstatus"] !== undefined) {
      const s = r["msdyn_programstatus"];
      if (typeof s === "number" || typeof s === "string") {
        ctx.programStatus[r["msdyn_programid"]] = s;
      }
    }
    if (typeof r["contactid"] === "string" && r["onMarketingList"] === true) {
      ctx.contactsInMarketingList.add(r["contactid"]);
    }
  }
  return ctx;
}

export function runFixtureAudit(
  fixture: DemoFixtureLike,
  rules: readonly AuditRule[]
): FixtureAuditReport {
  const ctx = buildSharedContext(fixture.rows);
  const findings: FixtureAuditFinding[] = [];
  let rulesEvaluated = 0;

  const fnRules = rules.filter((r) => isFn(r));
  for (const r of fnRules) {
    if (r.enabledByDefault === false) continue;
    rulesEvaluated += 1;
    for (const row of fixture.rows) {
      const result = r.evaluate({ record: row }, ctx);
      if (!result.pass) {
        findings.push({
          ruleId: r.id,
          severity: String(r.severity),
          message: result.message ?? `${r.id} failed`,
        });
      }
    }
  }

  const bySeverity: FixtureAuditReport["bySeverity"] = {};
  for (const f of findings) {
    const sev = f.severity as keyof FixtureAuditReport["bySeverity"];
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
  }

  return {
    rulesEvaluated,
    findingsTotal: findings.length,
    bySeverity,
    findings,
  };
}

function isFn(r: AuditRule): r is FnAuditRule {
  return (r as FnAuditRule).evaluate !== undefined;
}
