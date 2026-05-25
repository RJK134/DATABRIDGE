/**
 * Tests for the `databridge audit` CLI subcommand.
 *
 * No real Postgres — DATABASE_URL is unset in tests, so the executor falls
 * back to NoopSqlExecutor. We exercise:
 *   - argv parsing (happy + error paths)
 *   - end-to-end run against the sits profile (SQL-family rules → 0 findings)
 *   - end-to-end run against hesa-tdp (Fn rules → warnings, 0 findings)
 *   - exit-code policy (0 on clean, 1 on error-severity findings, 2 on bad args)
 */
import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, mkdtemp } from "node:fs/promises";

import { parseAuditArgs, runAuditCmd } from "../audit-cmd.js";

function makeIo() {
  let out = "";
  let err = "";
  return {
    io: {
      stdout: (s: string) => {
        out += s;
      },
      stderr: (s: string) => {
        err += s;
      },
    },
    getOut: () => out,
    getErr: () => err,
  };
}

describe("parseAuditArgs", () => {
  it("parses required flags", () => {
    expect(parseAuditArgs(["--profile", "sits", "--tenant", "t1"])).toEqual({
      profileId: "sits",
      tenantId: "t1",
    });
  });

  it("supports short flags", () => {
    expect(parseAuditArgs(["-p", "sits", "-t", "t1"])).toEqual({
      profileId: "sits",
      tenantId: "t1",
    });
  });

  it("parses optional flags", () => {
    const a = parseAuditArgs([
      "-p",
      "sits",
      "-t",
      "t1",
      "--out",
      "x.json",
      "--max-findings-per-rule",
      "10",
      "--max-findings-total",
      "100",
      "--pretty",
    ]);
    expect(a.out).toBe("x.json");
    expect(a.maxFindingsPerRule).toBe(10);
    expect(a.maxFindingsTotal).toBe(100);
    expect(a.pretty).toBe(true);
  });

  it("throws when profile is missing", () => {
    expect(() => parseAuditArgs(["--tenant", "t1"])).toThrow(/--profile/);
  });

  it("throws on unknown flag", () => {
    expect(() =>
      parseAuditArgs(["--profile", "sits", "--tenant", "t1", "--frobnicate"]),
    ).toThrow(/unknown flag/);
  });
});

describe("runAuditCmd", () => {
  it("returns exitCode 0 and prints JSON for sits profile", async () => {
    const h = makeIo();
    const { report, exitCode } = await runAuditCmd(
      { profileId: "sits", tenantId: "t1" },
      h.io,
    );
    expect(exitCode).toBe(0);
    expect(report.tenantId).toBe("t1");
    expect(report.findingsTotal).toBe(0);
    expect(report.rulesSql).toBeGreaterThan(0);
    // Pretty-printed JSON on stdout
    expect(h.getOut()).toContain('"tenantId": "t1"');
  });

  it("writes to --out file and reports the count on stderr", async () => {
    const dir = await mkdtemp(join(tmpdir(), "databridge-cli-"));
    const outPath = join(dir, "report.json");
    const h = makeIo();
    const { exitCode } = await runAuditCmd(
      { profileId: "sits", tenantId: "t1", out: outPath },
      h.io,
    );
    expect(exitCode).toBe(0);
    const written = await readFile(outPath, "utf8");
    const parsed = JSON.parse(written) as { tenantId: string };
    expect(parsed.tenantId).toBe("t1");
    expect(h.getErr()).toContain("wrote 0 findings");
  });

  it("emits warnings when running hesa-tdp without a source", async () => {
    const h = makeIo();
    const { report, exitCode } = await runAuditCmd(
      { profileId: "hesa-tdp", tenantId: "t2" },
      h.io,
    );
    expect(exitCode).toBe(0); // no ERRORs because Fn rules were skipped
    expect(report.rulesFn).toBeGreaterThan(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("returns exitCode 2 on unknown profile and prints to stderr", async () => {
    const h = makeIo();
    const { exitCode } = await runAuditCmd(
      { profileId: "totally-fake", tenantId: "t1" },
      h.io,
    );
    expect(exitCode).toBe(2);
    expect(h.getErr()).toContain("unknown profile");
  });
});
