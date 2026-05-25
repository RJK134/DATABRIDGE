import { z } from "zod";

/**
 * Config for the Banner Oracle (native) adapter.
 * Reads from standard Banner tables: SPRIDEN, SHRTGPA, SGBSTDN, SCBCRSE, SSBSECT.
 */
export const BannerOracleConfigSchema = z.object({
  /** Oracle connect string e.g. "banner.uni.ac.uk:1521/BNRPRD" */
  connectString: z.string().min(1),
  /** Secrets-vault key for the DB user. */
  userSecretKey: z.string().min(1),
  /** Secrets-vault key for the DB password. */
  passwordSecretKey: z.string().min(1),
  /** Banner schema owner. */
  schemaOwner: z.string().default("BANINST1"),
  /** Connection pool max. */
  poolMax: z.number().int().min(1).max(20).default(4),
  /** Query timeout ms. */
  queryTimeoutMs: z.number().int().positive().default(60_000),
});

export type BannerOracleConfig = z.infer<typeof BannerOracleConfigSchema>;
