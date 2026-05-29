import { z } from "zod";

export const SitsOracleConfigSchema = z.object({
  /** Oracle connection string e.g. "hostname:1521/SITS" */
  connectString: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  /** Connection pool size. Defaults to 4. */
  poolMax: z.number().int().min(1).max(20).default(4),
  poolMin: z.number().int().min(0).default(1),
  /** Query timeout in milliseconds. Default 30s. */
  queryTimeoutMs: z.number().int().positive().default(30_000),
  /** SITS schema owner prefix. Usually blank or 'SITS'. */
  schemaPrefix: z.string().default(""),
});

export type SitsOracleConfig = z.infer<typeof SitsOracleConfigSchema>;
