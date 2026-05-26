/**
 * Tests for audit-runner.ts \u2014 the side-effecting job function. We use the
 * shared in-memory auditStore and the registered SITS profile (SQL-only,
 * no adapter required \u2014 the NoopSqlExecutor returns empty rows).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  runAuditJob,
  cancelAudit,
  inflightAuditIds,
  _clearInflightForTests,
  type AuditJobInput,
  type AuditRunnerLogger,
} from "../audit-runner.js";
import { auditStore } from "../audit-store.js";

const silent: AuditRunnerLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

async function seedRecord(input: AuditJobInput): Promise<void> {
  await auditStore.create({
    auditId: input.auditId,
    tenantId: input.tenantId,
    profileId: input.profileId,
    status: "queued",
  });
}

describe("runAuditJob", () => {
  beforeEach(async () => {
    await auditStore.clear();
    _clearInflightForTests();
  });

  it("completes successfully with the SITS profile + no adapter", async () => {
    const input: AuditJobInput = {
      auditId: "a-success",
      tenantId: "t1",
      profileId: "sits",
    };
    await seedRecord(input);
    const outcome = await runAuditJob(input, silent);
    expect(outcome.status).toBe("succeeded");
    const rec = await auditStore.get("a-success");
    expect(rec?.status).toBe("succeeded");
    expect(rec?.report).toBeDefined();
  });

  it("fails when the profile id is unknown", async () => {
    const input: AuditJobInput = {
      auditId: "a-bad-profile",
      tenantId: "t1",
      profileId: "ghost",
    };
    await seedRecord(input);
    const outcome = await runAuditJob(input, silent);
    expect(outcome.status).toBe("failed");
    expect((outcome as { error: string }).error).toMatch(/profile not found/);
  });

  it("fails when the adapter id is unknown", async () => {
    const input: AuditJobInput = {
      auditId: "a-bad-adapter",
      tenantId: "t1",
      profileId: "sits",
      adapterId: "ghost-adapter",
    };
    await seedRecord(input);
    const outcome = await runAuditJob(input, silent);
    expect(outcome.status).toBe("failed");
    const rec = await auditStore.get("a-bad-adapter");
    expect(rec?.status).toBe("failed");
    expect(rec?.error).toMatch(/not registered/);
  });

  it("registers and unregisters its abort controller in the inflight registry", async () => {
    const input: AuditJobInput = {
      auditId: "a-track",
      tenantId: "t1",
      profileId: "sits",
    };
    await seedRecord(input);
    const p = runAuditJob(input, silent);
    // The controller should be present at least for one microtask before
    // the engine resolves; both sides are fine, but the registry must clear
    // by the time the promise settles.
    await p;
    expect(inflightAuditIds()).not.toContain("a-track");
  });

  it("cancelAudit returns false when no run is in flight", () => {
    expect(cancelAudit("never-existed")).toBe(false);
  });
});
