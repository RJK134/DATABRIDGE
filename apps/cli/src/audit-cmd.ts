/**
 * `databridge audit` — offline audit runner.
 *
 * Loads a profile by id, runs all its rules through AuditEngine, and writes
 * the resulting AuditReport to stdout (or a file via --out). Designed for
 * CI use and one-off audits without standing up the API.
 *
 * The CLI deliberately mirrors the apps/api /audits/run wiring: when
 * DATABASE_URL is set it uses PgSqlExecutor, otherwise NoopSqlExecutor.
 * Fn rules without a source adapter are reported as warnings — full
 * source wiring is a follow-up.
 */

import { writeFile } from "node:fs/promises";
import {
  AuditEngine,
  PgSqlExecutor,
  type AuditRule,
  type FnAuditRule,
  type RuleEvalContext,
  type SqlExecutor,
  type FieldStats,
  type AuditReport,
} from "@databridge/rule-core";

import { resolveProfile, listKnownProfileIds } from "./profile-loader.js";
import { instantiateAdapter, makeAdapterContext, listKnownAdapterIds } from "./adapter-loader.js";

/* ----------------------------- argv parsing ------------------------------- */

export interface AuditCmdArgs {
  profileId: string;
  tenantId: string;
  out?: string;
  maxFindingsPerRule?: number;
  maxFindingsTotal?: number;
  /** Pretty-print JSON (default true for tty, false otherwise). */
  pretty?: boolean;
  /** Optional adapter wiring — enables Fn rules. */
  adapterId?: string;
  /** Adapter config as a JSON string parsed at command time. */
  adapterConfig?: Record<string, unknown>;
  /** Resource → entity map, as a JSON string parsed at command time. */
  resourceMap?: Record<string, string>;
}

export function parseAuditArgs(argv: string[]): AuditCmdArgs {
  const args: Partial<AuditCmdArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const eat = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      i++;
      return v;
    };
    switch (flag) {
      case "--profile":
      case "-p":
        args.profileId = eat();
        break;
      case "--tenant":
      case "-t":
        args.tenantId = eat();
        break;
      case "--out":
      case "-o":
        args.out = eat();
        break;
      case "--max-findings-per-rule":
        args.maxFindingsPerRule = Number(eat());
        break;
      case "--max-findings-total":
        args.maxFindingsTotal = Number(eat());
        break;
      case "--pretty":
        args.pretty = true;
        break;
      case "--no-pretty":
        args.pretty = false;
        break;
      case "--adapter":
      case "-a":
        args.adapterId = eat();
        break;
      case "--adapter-config": {
        const raw = eat();
        try {
          args.adapterConfig = JSON.parse(raw) as Record<string, unknown>;
        } catch (err) {
          throw new Error(`--adapter-config: invalid JSON (${(err as Error).message})`);
        }
        break;
      }
      case "--resource-map": {
        const raw = eat();
        try {
          args.resourceMap = JSON.parse(raw) as Record<string, string>;
        } catch (err) {
          throw new Error(`--resource-map: invalid JSON (${(err as Error).message})`);
        }
        break;
      }
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  if (!args.profileId) throw new Error("required: --profile <id>");
  if (!args.tenantId) throw new Error("required: --tenant <id>");
  return args as AuditCmdArgs;
}

/* ----------------------------- executor wiring ---------------------------- */

class NoopSqlExecutor implements SqlExecutor {
  async query(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async queryCodelistViolations(): Promise<Record<string, unknown>[]> {
    return [];
  }
  async queryFieldStats(): Promise<FieldStats> {
    return { nullPct: 0, cardinality: 0, topValues: [] };
  }
}

function makeExecutor(): SqlExecutor {
  const url = process.env["DATABASE_URL"];
  if (url) return new PgSqlExecutor({ connectionString: url });
  return new NoopSqlExecutor();
}

/* ------------------------------ run() ------------------------------------- */

export async function runAuditCmd(
  args: AuditCmdArgs,
  io: {
    stdout?: (s: string) => void;
    stderr?: (s: string) => void;
  } = {}
): Promise<{ report: AuditReport; exitCode: number }> {
  const stdout = io.stdout ?? ((s) => process.stdout.write(s));
  const stderr = io.stderr ?? ((s) => process.stderr.write(s));

  const profile = resolveProfile(args.profileId);
  if (!profile) {
    stderr(
      `databridge audit: unknown profile '${args.profileId}'.\n` +
        `known: ${listKnownProfileIds().join(", ")}\n`
    );
    return { report: emptyReport(args), exitCode: 2 };
  }
  const rules = (profile as { rules?: (AuditRule | FnAuditRule)[] }).rules ?? [];

  const engineOpts = {
    ...(args.maxFindingsPerRule !== undefined
      ? { maxFindingsPerRule: args.maxFindingsPerRule }
      : {}),
    ...(args.maxFindingsTotal !== undefined ? { maxFindingsTotal: args.maxFindingsTotal } : {}),
  };
  const engine = new AuditEngine(makeExecutor(), engineOpts);

  const ctx: RuleEvalContext = {
    tenantId: args.tenantId,
    connectionId: `cli:${args.profileId}`,
    codeLists: new Map(),
    signal: new AbortController().signal,
  };

  // Adapter wiring is optional. If absent and the profile has Fn rules,
  // AuditEngine will record a warning rather than fail.
  let source: ReturnType<typeof instantiateAdapter> | undefined;
  if (args.adapterId) {
    const made = instantiateAdapter(args.adapterId, args.adapterConfig ?? {});
    if ("error" in made) {
      stderr(
        `databridge audit: adapter '${args.adapterId}' failed to init: ${made.error}\n` +
          `known adapters: ${listKnownAdapterIds().join(", ")}\n`
      );
      return { report: emptyReport(args), exitCode: 2 };
    }
    source = made;
  }

  const adapterCtx = source
    ? makeAdapterContext(args.tenantId, `cli:${args.profileId}`, new AbortController().signal)
    : undefined;

  const report = await engine.runAudit({
    tenantId: args.tenantId,
    rules,
    resourceMap: args.resourceMap ?? {},
    ...(source && !("error" in source) ? { source } : {}),
    ...(adapterCtx !== undefined ? { adapterCtx } : {}),
    ctx,
  });

  const pretty = args.pretty ?? !args.out;
  const serialized = pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);

  if (args.out) {
    await writeFile(args.out, serialized + "\n", "utf8");
    stderr(`databridge audit: wrote ${report.findingsTotal} findings to ${args.out}\n`);
  } else {
    stdout(serialized + "\n");
  }

  // Exit code policy: 0 if no ERROR/CRITICAL findings, 1 otherwise.
  // INFO/WARN do not fail the run — CI authors can tighten as needed.
  const failing =
    (report.findingsBySeverity["ERROR"] ?? 0) + (report.findingsBySeverity["CRITICAL"] ?? 0);
  return { report, exitCode: failing > 0 ? 1 : 0 };
}

function emptyReport(args: AuditCmdArgs): AuditReport {
  const now = new Date().toISOString();
  return {
    auditId: "",
    tenantId: args.tenantId,
    startedAt: now,
    completedAt: now,
    rulesTotal: 0,
    rulesSql: 0,
    rulesFn: 0,
    rowsScanned: 0,
    findingsTotal: 0,
    findingsBySeverity: {},
    findings: [],
    warnings: [],
  };
}
