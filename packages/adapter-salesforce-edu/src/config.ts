import { z } from "zod";

/**
 * Config for the Salesforce Education Cloud source adapter.
 *
 * Auth: OAuth2 client-credentials against `<instanceUrl>/services/oauth2/token`.
 * The client id is held in config, the client secret is resolved via the
 * platform secrets accessor at call time.
 */
export const SalesforceEduConfigSchema = z.object({
  /** Tenant root, e.g. https://acme-edu.my.salesforce.com */
  instanceUrl: z.string().url(),
  /** Connected-App consumer key (client_id). */
  clientId: z.string().min(1),
  /** Secrets-vault key for the connected-app consumer secret. */
  clientSecretKey: z.string().min(1),
  /** API version. Default v60.0. */
  apiVersion: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v60.0"),
  /** Request timeout in ms. */
  timeoutMs: z.number().int().positive().default(60_000),
  /** OAuth audience override — needed when the org uses a custom domain. */
  audience: z.string().url().optional(),
});

export type SalesforceEduConfig = z.infer<typeof SalesforceEduConfigSchema>;
