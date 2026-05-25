import { z } from "zod";

/**
 * Config for the SITS file-extract adapter.
 * Reads CSV/XML exports produced by SITS scheduled extract jobs.
 */
export const SitsFileConfigSchema = z.object({
  /** Root directory where SITS extract files land (mounted via storage adapter). */
  rootPath: z.string().min(1),
  /** File format. Defaults to csv. */
  format: z.enum(["csv", "xml"]).default("csv"),
  /** Filename pattern with {entity} placeholder, e.g. "SITS_{entity}_*.csv". */
  filenamePattern: z.string().default("SITS_{entity}_*.csv"),
  /** Field delimiter for CSV. Default ",". */
  delimiter: z.string().length(1).default(","),
  /** Treat first row as header. Default true. */
  hasHeader: z.boolean().default(true),
  /** Source character encoding. */
  encoding: z.enum(["utf-8", "latin1", "utf-16le"]).default("utf-8"),
});

export type SitsFileConfig = z.infer<typeof SitsFileConfigSchema>;
