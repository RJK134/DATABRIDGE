import { z } from "zod";

/**
 * Config for the Ellucian Ethos REST adapter.
 * https://resources.elluciancloud.com/bundle/ethos_integration/page/c_ethos_integration_overview.html
 */
export const BannerEthosConfigSchema = z.object({
  /** Ethos API root, e.g. https://integrate.elluciancloud.com */
  apiRoot: z.string().url().default("https://integrate.elluciancloud.com"),
  /** Application API key stored in secrets vault (used in the token exchange). */
  apiKeySecretKey: z.string().min(1),
  /** Token TTL in seconds. Default 5 minutes. */
  tokenTtlSeconds: z.number().int().positive().default(300),
  /** API version header. */
  acceptVersion: z.string().default("application/vnd.hedtech.integration.v16+json"),
  /** Pagination page size. Default 100, max 500 per Ethos. */
  pageSize: z.number().int().min(1).max(500).default(100),
});

export type BannerEthosConfig = z.infer<typeof BannerEthosConfigSchema>;
