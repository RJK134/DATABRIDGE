/**
 * Phase K3 — severity-by-surface dashboard aggregator.
 *
 * Audits emit a flat stream of findings. A registrar / data-quality
 * lead wants to see them carved by business *surface*:
 *
 *   - admissions  (UCAS, applications, decisions)
 *   - programmes  (course / module structure)
 *   - enrolments  (student-on-programme attachments)
 *   - results     (marks, grades, classification)
 *   - awards      (qualifications conferred, HEAR)
 *   - finance     (fees, sponsors, bursaries)
 *   - visa        (CAS, sponsorship, ATAS)
 *   - other       (catch-all for anything we couldn't classify)
 *
 * The mapping from a finding's `entityType` (canonical model name) to a
 * surface is encoded in `DEFAULT_SURFACE_MAP`. Callers can extend or
 * override with a custom map. Rule-id and rule-name patterns are also
 * consulted as a fallback for findings that fire on entities like
 * `Codeset` which aren't naturally tied to one surface.
 *
 * Output shape mirrors what a UI dashboard would render: a flat list of
 * (surface, severity, count) tuples, plus per-surface roll-ups and a
 * global summary.
 */
import type { AuditFinding, RuleSeverity } from "@databridge/rule-core";

export const SURFACES = [
  "admissions",
  "programmes",
  "enrolments",
  "results",
  "awards",
  "finance",
  "visa",
  "other",
] as const;
export type Surface = (typeof SURFACES)[number];

export const SEVERITIES: readonly RuleSeverity[] = ["CRITICAL", "ERROR", "WARN", "INFO"];

/**
 * Default canonical-entity → surface mapping. Based on the SITS/Banner
 * crosswalk §6–§11 entity inventory.
 */
export const DEFAULT_SURFACE_MAP: Readonly<Record<string, Surface>> = {
  // Admissions
  Application: "admissions",
  ApplicationDecision: "admissions",
  Applicant: "admissions",
  UcasApplication: "admissions",

  // Programmes / curriculum
  Programme: "programmes",
  Course: "programmes",
  Module: "programmes",
  ModuleDelivery: "programmes",
  Pathway: "programmes",
  AcademicYear: "programmes",

  // Enrolments
  Student: "enrolments",
  Enrolment: "enrolments",
  StudentOnProgramme: "enrolments",
  ModuleEnrolment: "enrolments",
  StudyAttempt: "enrolments",

  // Results / assessment
  Mark: "results",
  Grade: "results",
  Assessment: "results",
  AssessmentResult: "results",
  Classification: "results",
  ProgressionDecision: "results",

  // Awards
  Award: "awards",
  Qualification: "awards",
  HEAR: "awards",
  GraduationCeremony: "awards",

  // Finance
  Fee: "finance",
  FeeAssessment: "finance",
  Sponsor: "finance",
  Bursary: "finance",
  Invoice: "finance",
  Payment: "finance",

  // Visa / international
  CAS: "visa",
  StudentSponsorship: "visa",
  ATAS: "visa",
  RightToStudyCheck: "visa",
};

/**
 * Pattern fallbacks — when entityType doesn't map directly, we look at
 * the ruleId/ruleName for tokens.
 */
const RULE_PATTERNS: Array<{ pattern: RegExp; surface: Surface }> = [
  { pattern: /admission|ucas|applicant|application/i, surface: "admissions" },
  { pattern: /programme|module|course|curriculum/i, surface: "programmes" },
  { pattern: /enrol|student-on-prog|sop/i, surface: "enrolments" },
  { pattern: /mark|grade|result|assess|classification/i, surface: "results" },
  { pattern: /award|qualification|hear|graduation/i, surface: "awards" },
  { pattern: /fee|invoice|payment|sponsor|bursary|finance/i, surface: "finance" },
  { pattern: /visa|cas|atas|sponsorship/i, surface: "visa" },
];

export interface CellCount {
  surface: Surface;
  severity: RuleSeverity;
  count: number;
}

export interface SurfaceRollup {
  surface: Surface;
  total: number;
  bySeverity: Record<RuleSeverity, number>;
  /** A weighted severity score: CRITICAL=8, ERROR=4, WARN=2, INFO=1. */
  weight: number;
}

export interface SeverityBySurfaceReport {
  cells: readonly CellCount[];
  surfaces: readonly SurfaceRollup[];
  totals: {
    findings: number;
    bySeverity: Record<RuleSeverity, number>;
    bySurface: Record<Surface, number>;
  };
  computedAt: string;
}

const SEVERITY_WEIGHT: Record<RuleSeverity, number> = {
  CRITICAL: 8,
  ERROR: 4,
  WARN: 2,
  INFO: 1,
};

export interface AggregateOptions {
  /** Override the entity→surface map. Falls back to default. */
  surfaceMap?: Readonly<Record<string, Surface>>;
  /** Override clock. */
  clock?: () => string;
  /** Override pattern fallbacks. */
  patterns?: ReadonlyArray<{ pattern: RegExp; surface: Surface }>;
}

/**
 * Decide which surface a finding belongs to.
 *   1. Direct entityType match in the supplied map (or DEFAULT_SURFACE_MAP).
 *   2. Pattern match on ruleId then ruleName.
 *   3. Fallback to "other".
 */
export function classifySurface(finding: AuditFinding, options: AggregateOptions = {}): Surface {
  const map = options.surfaceMap ?? DEFAULT_SURFACE_MAP;
  const direct = map[finding.entityType];
  if (direct) return direct;
  const patterns = options.patterns ?? RULE_PATTERNS;
  for (const { pattern, surface } of patterns) {
    if (pattern.test(finding.ruleId) || pattern.test(finding.ruleName)) {
      return surface;
    }
  }
  return "other";
}

export function aggregateSeverityBySurface(
  findings: readonly AuditFinding[],
  options: AggregateOptions = {}
): SeverityBySurfaceReport {
  const clock = options.clock ?? (() => new Date().toISOString());

  // (surface, severity) → count
  const cellMap = new Map<string, number>();
  const bySurface = mkSurfaceZero();
  const bySeverity = mkSeverityZero();
  const surfaceSev = new Map<Surface, Record<RuleSeverity, number>>();
  for (const s of SURFACES) surfaceSev.set(s, mkSeverityZero());

  let total = 0;
  for (const f of findings) {
    const surf = classifySurface(f, options);
    const key = `${surf}::${f.severity}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + 1);
    bySurface[surf]++;
    bySeverity[f.severity]++;
    surfaceSev.get(surf)![f.severity]++;
    total++;
  }

  const cells: CellCount[] = [];
  for (const surface of SURFACES) {
    for (const severity of SEVERITIES) {
      const count = cellMap.get(`${surface}::${severity}`) ?? 0;
      if (count > 0) cells.push({ surface, severity, count });
    }
  }

  const surfaces: SurfaceRollup[] = SURFACES.map((surface) => {
    const sev = surfaceSev.get(surface)!;
    let weight = 0;
    for (const s of SEVERITIES) weight += sev[s] * SEVERITY_WEIGHT[s];
    return {
      surface,
      total: bySurface[surface],
      bySeverity: { ...sev },
      weight,
    };
  });

  return {
    cells,
    surfaces,
    totals: {
      findings: total,
      bySeverity,
      bySurface,
    },
    computedAt: clock(),
  };
}

/**
 * Render the report as a markdown table — surface rows × severity
 * columns, plus a totals row.
 */
export function reportToMd(report: SeverityBySurfaceReport): string {
  const cols = SEVERITIES;
  const lines: string[] = [];
  lines.push(`| surface | ${cols.join(" | ")} | total |`);
  lines.push(`| --- | ${cols.map(() => "---:").join(" | ")} | ---: |`);
  for (const sr of report.surfaces) {
    if (sr.total === 0) continue;
    const cells = cols.map((c) => String(sr.bySeverity[c]));
    lines.push(`| ${sr.surface} | ${cells.join(" | ")} | ${sr.total} |`);
  }
  const totalsRow = cols.map((c) => String(report.totals.bySeverity[c]));
  lines.push(`| **total** | ${totalsRow.join(" | ")} | ${report.totals.findings} |`);
  return lines.join("\n");
}

function mkSeverityZero(): Record<RuleSeverity, number> {
  return { CRITICAL: 0, ERROR: 0, WARN: 0, INFO: 0 };
}
function mkSurfaceZero(): Record<Surface, number> {
  return {
    admissions: 0,
    programmes: 0,
    enrolments: 0,
    results: 0,
    awards: 0,
    finance: 0,
    visa: 0,
    other: 0,
  };
}
