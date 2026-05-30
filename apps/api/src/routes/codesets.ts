import type { FastifyInstance } from "fastify";
import { describeCodeset, listCodesetBundles, listCodesetSummaries } from "../codeset-registry.js";

/**
 * Codeset routes (Phase H):
 *   GET /codesets          — list every CodeList from every seed bundle
 *   GET /codesets/bundles  — list seed bundles (SITS / Banner / HESA) + counts
 *   GET /codesets/:id      — full CodeList (entries) for one id, e.g. "HESA.SEXID"
 */
export async function codesetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/codesets", async () => ({ codesets: listCodesetSummaries() }));
  app.get("/codesets/bundles", async () => ({ bundles: listCodesetBundles() }));

  app.get<{ Params: { id: string } }>("/codesets/:id", async (req, reply) => {
    const list = describeCodeset(req.params.id);
    if (!list) {
      return reply.code(404).send({ error: "codeset_not_found", id: req.params.id });
    }
    return list;
  });
}
