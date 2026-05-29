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
    expect(() => parseAuditArgs(["--profile", "sits", "--tenant", "t1", "--frobnicate"])).toThrow(
      /unknown flag/
    );
  });

  it("parses --adapter and JSON --adapter-config / --resource-map", () => {
    const a = parseAuditArgs([
      "-p",
      "hesa-tdp",
      "-t",
      "t1",
      "--adapter",
      "sits-file",
      "--adapter-config",
      '{"rootPath":"/tmp/x"}',
      "--resource-map",
      '{"STU":"Student"}',
    ]);
    expect(a.adapterId).toBe("sits-file");
    expect(a.adapterConfig).toEqual({ rootPath: "/tmp/x" });
    expect(a.resourceMap).toEqual({ STU: "Student" });
  });

  it("supports short -a for --adapter", () => {
    const a = parseAuditArgs(["-p", "hesa-tdp", "-t", "t1", "-a", "sits-file"]);
    expect(a.adapterId).toBe("sits-file");
  });

  it("throws helpfully on invalid --adapter-config JSON", () => {
    expect(() =>
      parseAuditArgs(["-p", "hesa-tdp", "-t", "t1", "--adapter-config", "{not json}"])
    ).toThrow(/--adapter-config: invalid JSON/);
  });

  it("throws helpfully on invalid --resource-map JSON", () => {
    expect(() =>
      parseAuditArgs(["-p", "hesa-tdp", "-t", "t1", "--resource-map", "not-json"])
    ).toThrow(/--resource-map: invalid JSON/);
  });
});

describe("runAuditCmd", () => {
  it("returns exitCode 0 and prints JSON for sits profile", async () => {
    const h = makeIo();
    const { report, exitCode } = await runAuditCmd({ profileId: "sits", tenantId: "t1" }, h.io);
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
      h.io
    );
    expect(exitCode).toBe(0);
    const written = await readFile(outPath, "utf8");
    const parsed = JSON.parse(written) as { tenantId: string };
    expect(parsed.tenantId).toBe("t1");
    expect(h.getErr()).toContain("wrote 0 findings");
  });

  it("emits warnings when running hesa-tdp without a source", async () => {
    const h = makeIo();
    const { report, exitCode } = await runAuditCmd({ profileId: "hesa-tdp", tenantId: "t2" }, h.io);
    expect(exitCode).toBe(0); // no ERRORs because Fn rules were skipped
    expect(report.rulesFn).toBeGreaterThan(0);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("returns exitCode 2 on unknown profile and prints to stderr", async () => {
    const h = makeIo();
    const { exitCode } = await runAuditCmd({ profileId: "totally-fake", tenantId: "t1" }, h.io);
    expect(exitCode).toBe(2);
    expect(h.getErr()).toContain("unknown profile");
  });

  it("returns exitCode 2 on unknown adapter", async () => {
    const h = makeIo();
    const { exitCode } = await runAuditCmd(
      {
        profileId: "hesa-tdp",
        tenantId: "t1",
        adapterId: "made-up-adapter",
      },
      h.io
    );
    expect(exitCode).toBe(2);
    expect(h.getErr()).toMatch(/adapter 'made-up-adapter' failed to init/);
  });

  it("runs hesa-tdp with sits-file adapter — no 'no source' warnings", async () => {
    const h = makeIo();
    const { report, exitCode } = await runAuditCmd(
      {
        profileId: "hesa-tdp",
        tenantId: "t3",
        adapterId: "sits-file",
        adapterConfig: { rootPath: "/tmp/databridge-cli-test" },
        resourceMap: { STU: "Student" },
      },
      h.io
    );
    expect(exitCode).toBe(0);
    expect(report.rulesFn).toBeGreaterThan(0);
    // Sanity: with a source wired, the engine should not emit the "no source"
    // warning that hesa-tdp normally produces in the unwired case.
    const noSourceWarnings = report.warnings.filter((w) => /no source/i.test(w));
    expect(noSourceWarnings).toHaveLength(0);
  });
});
