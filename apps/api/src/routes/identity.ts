/**
 * Identity reconciliation route (Phase I1).
 *
 *   POST /identity/reconcile
 *     body: { incoming: PersonRecord[], existing: PersonRecord[], policy }
 *     200:  { candidates: MatchCandidate[] }
 *
 * The handler is pure — no DB writes. Persisting merges is the caller's
 * job; this endpoint only computes candidate matches.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  reconcile,
  type MatchPolicy,
  type PersonRecord,
} from "@databridge/identity-reconciler";

// PersonRecord under exactOptionalPropertyTypes does not accept explicit
// `undefined` values produced by `z.optional()`; the type below is
// structurally compatible at runtime and the reconciler treats absent
// and undefined identically.
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

const ReconcileBodyZ = z.object({
  incoming: z.array(PersonRecordZ).max(10_000),
  existing: z.array(PersonRecordZ).max(10_000),
  policy: MatchPolicyZ,
});

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  app.post("/identity/reconcile", async (req, reply) => {
    const parsed = ReconcileBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const { incoming, existing, policy } = parsed.data;
    const candidates = reconcile(
      incoming as readonly PersonRecord[],
      existing as readonly PersonRecord[],
      policy as MatchPolicy,
    );
    return { candidates, counts: { generated: candidates.length, incoming: incoming.length, existing: existing.length } };
  });
}
