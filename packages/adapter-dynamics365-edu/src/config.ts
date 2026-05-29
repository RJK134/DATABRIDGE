import { z } from "zod";

/**
 * Config for the Dynamics 365 Education source adapter.
 *
 * Auth: Azure AD OAuth2 client-credentials against
 * `https://login.microsoftonline.com/<tenantId>/oauth2/v2.0/token`,
 * scope = `<dataverseUrl>/.default`.
 *
 * Application user (service principal) must have a security role on the
 * Dataverse environment with read access to the Education entities.
 */
export const Dynamics365EduConfigSchema = z.object({
  /** Dataverse environment URL, e.g. https://acme.crm4.dynamics.com */
  dataverseUrl: z.string().url(),
  /** Entra (Azure AD) tenant id. */
  tenantId: z.string().min(1),
  /** App registration client id. */
  clientId: z.string().min(1),
  /** Secrets-vault key for the app-registration client secret. */
  clientSecretKey: z.string().min(1),
  /** API version, e.g. v9.2. */
  apiVersion: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v9.2"),
  /** Request timeout ms. */
  timeoutMs: z.number().int().positive().default(60_000),
});

export type Dynamics365EduConfig = z.infer<typeof Dynamics365EduConfigSchema>;
