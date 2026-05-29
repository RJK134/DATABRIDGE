#!/usr/bin/env node
/**
 * @databridge/demo — scripted end-to-end demo runner.
 *
 * Sequence:
 *   1. Detect Docker; print bring-up instructions for Postgres + api + web.
 *   2. Load the four fixtures from `fixtures/`.
 *   3. Run the source-native audit pack against each fixture.
 *   4. Run Banner→SITS and SITS→Banner migrations (dry-run by default).
 *   5. Generate CRM integration-prep reports (SITS → Salesforce, SITS → Dynamics).
 *   6. Print URLs the presenter should open in the browser.
 *
 * The orchestrator does not actually start Docker — Phase A is demo-grade.
 * It prints the exact shell commands the presenter should run, so the
 * presenter can copy/paste from the terminal.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SALESFORCE_EDU_NATIVE_RULES } from "@databridge/audit-pack-salesforce-edu-native";
import { DYNAMICS365_EDU_NATIVE_RULES } from "@databridge/audit-pack-dynamics365-edu-native";
import { generateIntegrationPrepReport } from "@databridge/findings-integration-prep";
import { verifyCanonical, type CanonicalRecord } from "@databridge/parallel-run-verifier";

import { runFixtureAudit, type FixtureAuditReport } from "./audit.js";
import {
  runLlmWalkthrough,
  SCRIPTED_PROMPTS,
  type ScriptedPromptResult,
} from "./llm-walkthrough.js";

interface CliOptions {
  fixturesDir: string;
  dryRun: boolean;
  json: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = {
    fixturesDir: defaultFixturesDir(),
    dryRun: true,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--fixtures" || a === "-f") {
      const next = argv[i + 1];
      if (!next) throw new Error("--fixtures requires a path");
      opts.fixturesDir = next;
      i += 1;
    } else if (a === "--commit") {
      opts.dryRun = false;
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else if (a && a.startsWith("--")) {
      throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

function defaultFixturesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "fixtures");
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage: databridge-demo [options]",
      "",
      "Options:",
      "  -f, --fixtures <path>   Path to the fixtures directory (defaults to ../fixtures)",
      "      --commit            Execute migrations (default: dry-run)",
      "      --json              Emit a single JSON report on stdout instead of human-readable text",
      "  -h, --help              Show this help",
      "",
      "After running, open: http://localhost:3000 (api) and http://localhost:5173 (web).",
      "",
    ].join("\n")
  );
}

interface DemoFixture {
  name: string;
  source: string;
  rows: Array<Record<string, string | number | boolean | null>>;
}

interface DemoReport {
  generatedAt: string;
  fixtures: Array<{
    fixture: string;
    source: string;
    rows: number;
    audit: FixtureAuditReport;
  }>;
  migrations: {
    bannerToSits: { rowsRead: number; planTables: string[] };
    sitsToBanner: { rowsRead: number; planTables: string[] };
  };
  integrationPrep: {
    sitsToSalesforce: { create: number; update: number; skip: number; reject: number };
    sitsToDynamics: { create: number; update: number; skip: number; reject: number };
  };
  parallelRun: {
    bannerSitsDhp: number;
    drift: number;
  };
  /** Phase B — LLM walkthrough output. */
  llm: {
    prompts: ScriptedPromptResult[];
    narrative?: {
      headline: string;
      actionsCount: number;
    };
  };
  urls: { api: string; web: string; queryBar: string };
}

async function loadFixture(file: string): Promise<DemoFixture> {
  const raw = await fs.readFile(file, "utf8");
  const data = JSON.parse(raw) as DemoFixture;
  return data;
}

async function loadAllFixtures(dir: string): Promise<DemoFixture[]> {
  const entries = await fs.readdir(dir);
  const out: DemoFixture[] = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".json")) continue;
    out.push(await loadFixture(path.join(dir, name)));
  }
  return out;
}

function projectCanonical(fix: DemoFixture, source: "banner" | "sits"): CanonicalRecord[] {
  return fix.rows
    .filter((r) => "studentId" in r)
    .map((r) => ({
      entity: "Student",
      id: String(r["studentId"]),
      fields: { ...r, source },
    }));
}

async function main(argv: readonly string[]): Promise<void> {
  const opts = parseArgs(argv);
  const fixtures = await loadAllFixtures(opts.fixturesDir);
  if (fixtures.length === 0) {
    throw new Error(`No fixtures found under ${opts.fixturesDir}`);
  }

  const auditByFixture: DemoReport["fixtures"] = [];
  for (const fix of fixtures) {
    const audit = runFixtureAudit(fix, [
      ...SALESFORCE_EDU_NATIVE_RULES,
      ...DYNAMICS365_EDU_NATIVE_RULES,
    ]);
    auditByFixture.push({
      fixture: fix.name,
      source: fix.source,
      rows: fix.rows.length,
      audit,
    });
  }

  // Synthesise the bidirectional migration summary from the Banner +
  // SITS fixtures (rows-read is fed from the fixture row count). The
  // actual migrations live in @databridge/migration-banner-to-sits and
  // @databridge/migration-sits-to-banner — Phase A only emits load
  // plans, not real writes, so the demo simulates a 1:1 outcome.
  const bannerFix = fixtures.find((f) => f.source === "banner");
  const sitsFix = fixtures.find((f) => f.source === "sits");
  const banner2sitsRows = bannerFix?.rows.length ?? 0;
  const sits2bannerRows = sitsFix?.rows.length ?? 0;

  const parallelA = bannerFix ? projectCanonical(bannerFix, "banner") : [];
  const parallelB = sitsFix ? projectCanonical(sitsFix, "sits") : [];
  // Strip the divergent `source` field for the verifier so we measure
  // canonical-row drift, not provenance.
  const stripSource = (rs: CanonicalRecord[]): CanonicalRecord[] =>
    rs.map((r) => ({
      entity: r.entity,
      id: r.id,
      fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => k !== "source")),
    }));
  const parallel = verifyCanonical(stripSource(parallelA), stripSource(parallelB));

  // CRM integration-prep — SITS source vs Salesforce / Dynamics fixtures.
  const sfFix = fixtures.find((f) => f.source === "salesforce-edu");
  const dvFix = fixtures.find((f) => f.source === "dynamics365-edu");
  const sfPrep =
    sitsFix && sfFix
      ? generateIntegrationPrepReport({
          source: sitsFix.rows,
          target: sfFix.rows,
          sourceLabel: "SITS",
          targetLabel: "Salesforce Education Cloud",
          options: {
            sourceKey: "studentId",
            targetKey: "External_Id__c",
            compareFields: ["lastName", "email"],
          },
        })
      : undefined;
  const dvPrep =
    sitsFix && dvFix
      ? generateIntegrationPrepReport({
          source: sitsFix.rows,
          target: dvFix.rows,
          sourceLabel: "SITS",
          targetLabel: "Dynamics 365 Education",
          options: {
            sourceKey: "studentId",
            targetKey: "msdyn_externalstudentid",
            compareFields: ["lastName", "email"],
          },
        })
      : undefined;

  const report: DemoReport = {
    generatedAt: new Date().toISOString(),
    fixtures: auditByFixture,
    migrations: {
      bannerToSits: { rowsRead: banner2sitsRows, planTables: ["STU", "POS", "SCE", "STA"] },
      sitsToBanner: {
        rowsRead: sits2bannerRows,
        planTables: ["SPRIDEN", "STVMAJR", "SGBSTDN", "SHRTGPA"],
      },
    },
    integrationPrep: {
      sitsToSalesforce: {
        create: sfPrep?.totals.create ?? 0,
        update: sfPrep?.totals.update ?? 0,
        skip: sfPrep?.totals.skip ?? 0,
        reject: sfPrep?.totals.reject ?? 0,
      },
      sitsToDynamics: {
        create: dvPrep?.totals.create ?? 0,
        update: dvPrep?.totals.update ?? 0,
        skip: dvPrep?.totals.skip ?? 0,
        reject: dvPrep?.totals.reject ?? 0,
      },
    },
    parallelRun: {
      bannerSitsDhp: parallel.overallDhp,
      drift: parallel.diffs.length,
    },
    llm: { prompts: [] },
    urls: {
      api: "http://localhost:3001",
      web: "http://localhost:3000",
      queryBar: "http://localhost:3000/query",
    },
  };

  // Phase B LLM walkthrough — runs 5 scripted NL prompts against the
  // bundled fixtures through the deterministic mock provider.
  const fixturesByName: Record<string, ReadonlyArray<Record<string, unknown>>> = {};
  for (const f of fixtures) fixturesByName[f.name] = f.rows;
  const walkthrough = await runLlmWalkthrough({ fixturesByName });
  report.llm.prompts = walkthrough.prompts;
  if (walkthrough.narrative !== undefined) {
    report.llm.narrative = {
      headline: walkthrough.narrative.headline,
      actionsCount: walkthrough.narrative.actionsCount,
    };
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  printHumanReport(report, opts);
}

function printHumanReport(report: DemoReport, opts: CliOptions): void {
  const lines: string[] = [];
  lines.push("DataBridge demo run");
  lines.push("===================");
  lines.push(`generated at: ${report.generatedAt}`);
  lines.push(`mode:         ${opts.dryRun ? "DRY-RUN" : "COMMIT"}`);
  lines.push("");
  lines.push("Bring up the stack (in a separate terminal):");
  lines.push("  docker compose -f apps/demo/docker-compose.yml up -d");
  lines.push("");
  lines.push("Fixtures + audits:");
  for (const f of report.fixtures) {
    lines.push(
      `  - ${f.fixture} (${f.source}): ${f.rows} rows, ${f.audit.findingsTotal} findings (${f.audit.bySeverity["ERROR"] ?? 0} errors)`
    );
  }
  lines.push("");
  lines.push("Bidirectional migration (load-plan only):");
  lines.push(
    `  Banner → SITS: ${report.migrations.bannerToSits.rowsRead} rows → tables [${report.migrations.bannerToSits.planTables.join(", ")}]`
  );
  lines.push(
    `  SITS → Banner: ${report.migrations.sitsToBanner.rowsRead} rows → tables [${report.migrations.sitsToBanner.planTables.join(", ")}]`
  );
  lines.push("");
  lines.push("CRM integration-prep:");
  lines.push(
    `  SITS → Salesforce: create=${report.integrationPrep.sitsToSalesforce.create} update=${report.integrationPrep.sitsToSalesforce.update} skip=${report.integrationPrep.sitsToSalesforce.skip} reject=${report.integrationPrep.sitsToSalesforce.reject}`
  );
  lines.push(
    `  SITS → Dynamics:   create=${report.integrationPrep.sitsToDynamics.create} update=${report.integrationPrep.sitsToDynamics.update} skip=${report.integrationPrep.sitsToDynamics.skip} reject=${report.integrationPrep.sitsToDynamics.reject}`
  );
  lines.push("");
  lines.push("Parallel-run verifier (Banner vs SITS canonical projections):");
  lines.push(
    `  DHP: ${report.parallelRun.bannerSitsDhp.toFixed(3)}, drift rows: ${report.parallelRun.drift}`
  );
  lines.push("");
  lines.push("LLM walkthrough (NL → rule → findings, deterministic-mock provider):");
  for (const p of report.llm.prompts) {
    lines.push(
      `  ${p.id} [${p.fixture}] "${p.nl}" → rule=${p.ruleId} severity=${p.severity}, ${p.findings}/${p.rowsScanned} flagged (latency ${p.latencyMs}ms, prompt-sha256=${p.promptHashPrefix}…)`
    );
  }
  if (report.llm.narrative) {
    lines.push("");
    lines.push("LLM narrative summary (templated, slot-validated):");
    lines.push(`  headline: ${report.llm.narrative.headline}`);
    lines.push(`  recommended actions: ${report.llm.narrative.actionsCount}`);
  }
  lines.push("");
  lines.push("Open in the browser:");
  lines.push(`  API:        ${report.urls.api}`);
  lines.push(`  Web UI:     ${report.urls.web}`);
  lines.push(`  Query bar:  ${report.urls.queryBar}`);
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** Public — used by the apps/web query bar wiring and tests. */
export { SCRIPTED_PROMPTS };

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    const invoked = new URL(`file://${process.argv[1]}`).href;
    return import.meta.url === invoked;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`databridge-demo: ${msg}\n`);
    process.exit(1);
  });
}

export { main, parseArgs, loadAllFixtures, type DemoReport, type DemoFixture };
