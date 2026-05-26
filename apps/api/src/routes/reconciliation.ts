/**
 * Cross-system reconciliation route (Phase I4).
 *
 *   POST /reconciliation/report
 *     body: { systemA, systemB, sourceA[], sourceB[], policy }
 *     200:  ReconciliationReport
 *
 * Stateless. Heavy lifting is delegated to @databridge/reconciliation-report.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  buildReconciliationReport,
} from "@databridge/reconciliation-report";
import type {
  MatchPolicy,
  PersonRecord,
  SourceSystemTag,
} from "@databridge/identity-reconciler";

type PersonRecordInput = {
  [K in keyof PersonRecord]: PersonRecord[K] | undefined;
};

const SourceSystemTagZ = z.enum([
  "sits", "banner", "workday", "techone", "sjms5", "hesa", "ucas", "other",
]);

const AltIdZ = z.object({
  system: z.string(),
  type: z.string(),
  value: z.string(),
});

const PersonRecordZ = z.object({
  system: SourceSystemTagZ,
  sourceId: z.string().min(1),
  canonicalId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleNames: z.string().optional(),
  dateOfBirth: z.string().optional(),
  email: z.string().optional(),
  postcode: z.string().optional(),
  husid: z.string().optional(),
  ucasPid: z.string().optional(),
  ownStuId: z.string().optional(),
  altIds: z.array(AltIdZ).optional(),
}) satisfies z.ZodType<PersonRecordInput>;

const MatchPolicyZ = z.object({
  kind: z.enum(["exact", "fuzzy", "institutional"]),
  threshold: z.number().min(0).max(1).optional(),
  institutionalFields: z.array(z.string()).optional(),
  fuzzyNameDistance: z.number().int().nonnegative().optional(),
});

const ReportBodyZ = z.object({
  systemA: SourceSystemTagZ,
  systemB: SourceSystemTagZ,
  sourceA: z.array(PersonRecordZ).max(10_000),
  sourceB: z.array(PersonRecordZ).max(10_000),
  policy: MatchPolicyZ,
});

export async function reconciliationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/reconciliation/report", async (req, reply) => {
    const parsed = ReportBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const { systemA, systemB, sourceA, sourceB, policy } = parsed.data;
    return buildReconciliationReport({
      systemA: systemA as SourceSystemTag,
      systemB: systemB as SourceSystemTag,
      sourceA: sourceA as readonly PersonRecord[],
      sourceB: sourceB as readonly PersonRecord[],
      policy: policy as MatchPolicy,
    });
  });
}
