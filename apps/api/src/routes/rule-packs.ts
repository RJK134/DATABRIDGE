import type { FastifyInstance } from "fastify";
import {
  describeRulePack,
  listRulePackSummaries,
} from "../rule-pack-registry.js";

/**
 * Rule-pack routes (Phase H):
 *   GET /rule-packs        — list source-native audit packs with rule counts
 *   GET /rule-packs/:id    — full rule list for one pack
 */
export async function rulePackRoutes(app: FastifyInstance): Promise<void> {
  app.get("/rule-packs", async () => ({ rulePacks: listRulePackSummaries() }));

  app.get<{ Params: { id: string } }>("/rule-packs/:id", async (req, reply) => {
    const detail = describeRulePack(req.params.id);
    if (!detail) {
      return reply.code(404).send({ error: "rule_pack_not_found", id: req.params.id });
    }
    return detail;
  });
}
