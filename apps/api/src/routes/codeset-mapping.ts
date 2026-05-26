/**
 * Codeset-mapping routes (Phase I2).
 *
 *   GET  /codeset-maps                 — list bundled-default maps
 *   GET  /codeset-maps/:id             — fetch one map with all entries
 *   POST /codeset-maps/translate       — translate one code
 *     body: { sourceCodelist, targetCodelist, sourceCode, tenantId?, at? }
 *
 * The registry is built once at module load from the bundled JSON seeds.
 * Tenant overrides are out of scope for Phase I and will land in a
 * follow-up tenant-config phase.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createDefaultRegistry,
  translateCode,
  type CodesetMap,
} from "@databridge/codeset-mapper";

const registry = createDefaultRegistry();

const TranslateBodyZ = z.object({
  sourceCodelist: z.string().min(1),
  targetCodelist: z.string().min(1),
  sourceCode: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  at: z.string().min(1).optional(),
});

function summarise(map: CodesetMap) {
  return {
    id: map.id,
    name: map.name,
    sourceCodelist: map.sourceCodelist,
    targetCodelist: map.targetCodelist,
    version: map.version,
    description: map.description,
    entryCount: map.entries.length,
  };
}

export async function codesetMappingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/codeset-maps", async () => ({
    maps: registry.list().map(summarise),
  }));

  app.get<{ Params: { id: string } }>("/codeset-maps/:id", async (req, reply) => {
    const map = registry.get(req.params.id);
    if (!map) return reply.code(404).send({ error: "map_not_found", id: req.params.id });
    return map;
  });

  app.post("/codeset-maps/translate", async (req, reply) => {
    const parsed = TranslateBodyZ.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", issues: parsed.error.issues });
    }
    const { sourceCodelist, targetCodelist, sourceCode, tenantId, at } = parsed.data;
    const args: Parameters<typeof translateCode>[1] = {
      sourceCodelist,
      targetCodelist,
      sourceCode,
    };
    if (tenantId !== undefined) args.tenantId = tenantId;
    if (at !== undefined) args.at = at;
    return translateCode(registry, args);
  });
}
