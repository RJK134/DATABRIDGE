#!/usr/bin/env node
/**
 * `databridge` CLI entrypoint.
 *
 * Subcommands:
 *   audit   — run an audit profile against the canonical store (or against
 *             a noop SQL executor when DATABASE_URL is absent)
 *
 * Usage:
 *   databridge audit --profile sits --tenant t1
 *   databridge audit --profile hesa-tdp --tenant t1 --out report.json
 */

import { parseAuditArgs, runAuditCmd } from "./audit-cmd.js";
import { listKnownProfileIds } from "./profile-loader.js";
import { listKnownAdapterIds } from "./adapter-loader.js";

const HELP = `databridge — DataBridge command-line interface

Usage:
  databridge <command> [options]

Commands:
  audit     Run an audit profile

Run \`databridge <command> --help\` for command-specific options.
`;

const AUDIT_HELP = `databridge audit — run an audit profile

Required:
  -p, --profile <id>           Profile id (one of: ${listKnownProfileIds().join(", ")})
  -t, --tenant <id>            Tenant id stamped on every finding

Optional:
  -o, --out <path>             Write report JSON to a file instead of stdout
      --max-findings-per-rule  Cap on findings emitted per rule
      --max-findings-total     Cap on total Fn-runner findings
      --pretty | --no-pretty   Force pretty-printed JSON
  -a, --adapter <id>           Source adapter (one of: ${listKnownAdapterIds().join(", ")})
      --adapter-config <json>  Adapter config as a JSON object string
      --resource-map <json>    Resource→entity map as a JSON object string
  -h, --help                   Show this help

Environment:
  DATABASE_URL   If set, SQL-family rules run against Postgres via pg.
                 If absent, SQL rules run through a no-op executor.

Exit codes:
   0  No ERROR or CRITICAL findings
   1  At least one ERROR/CRITICAL finding
   2  Bad arguments / unknown profile / unknown adapter
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    return 0;
  }

  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === "audit") {
    if (rest.includes("--help") || rest.includes("-h")) {
      process.stdout.write(AUDIT_HELP);
      return 0;
    }
    try {
      const args = parseAuditArgs(rest);
      const { exitCode } = await runAuditCmd(args);
      return exitCode;
    } catch (err) {
      process.stderr.write(`databridge audit: ${(err as Error).message}\n\n${AUDIT_HELP}`);
      return 2;
    }
  }

  process.stderr.write(`databridge: unknown command '${cmd}'\n\n${HELP}`);
  return 2;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`databridge: ${(err as Error).stack ?? err}\n`);
    process.exit(1);
  }
);
