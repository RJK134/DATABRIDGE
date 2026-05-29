/**
 * Effective-dating route (Phase I3).
 *
 *   POST /effective-dating/resolve
 *     body: { pattern, rows, at?, statusArgs? }
 *     200:  { resolved: ResolvedRow | null }
 *
 * Stateless — the caller hands rows + pattern + observation date in, the
 * server picks the right resolver and returns the winning row plus
 * normalised `EffectiveDating` metadata.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  resolveActivityDated,
  resolveChangeIndicator,
  resolveFromToDated,
  resolveSnapshot,
  resolveStatusDriven,
  resolveTermKeyed,
} from "@databridge/effective-dating";

const PatternZ = z.enum([
  "activity-dated",
  "term-keyed",
  "from-to-dated",
  "change-indicator",
  "status-driven",
  "snapshot",
]);

const ResolveBodyZ = z.object({
  pattern: PatternZ,
  rows: z.array(z.record(z.unknown())).max(10_000),
  at: z.string().min(1).optional(),
  statusArgs: z
    .object({
      activeStatuses: z.array(z.string()).min(1),
      currentAyr: z.string().min(1),
    })
    .optional(),
});

export async function effectiveDatingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/effective-dating/resolve", async (req, reply) => {
    const parsed = ResolveBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const { pattern, rows, at, statusArgs } = parsed.data;
    if (
      (pattern === "activity-dated" || pattern === "term-keyed" || pattern === "from-to-dated") &&
      !at
    ) {
      return reply.code(400).send({ error: "missing_at_date", pattern });
    }
    if (pattern === "status-driven" && !statusArgs) {
      return reply.code(400).send({ error: "missing_status_args", pattern });
    }

    let resolved: unknown;
    switch (pattern) {
      case "activity-dated":
        resolved = resolveActivityDated(rows as Array<{ activityDate: string }>, at!);
        break;
      case "term-keyed":
        resolved = resolveTermKeyed(rows as Array<{ termEffectiveDate: string }>, at!);
        break;
      case "from-to-dated":
        resolved = resolveFromToDated(rows as Array<{ validFrom: string; validTo?: string }>, at!);
        break;
      case "change-indicator":
        resolved = resolveChangeIndicator(rows as Array<{ changeIndicator?: string | null }>);
        break;
      case "status-driven":
        resolved = resolveStatusDriven(rows as Array<{ status: string; ayr: string }>, statusArgs!);
        break;
      case "snapshot":
        resolved = resolveSnapshot(rows);
        break;
    }
    return { resolved: resolved ?? null };
  });
}
