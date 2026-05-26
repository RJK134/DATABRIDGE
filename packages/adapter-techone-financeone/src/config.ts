import { z } from "zod";

/**
 * Config for the Technology One Finance One adapter.
 *
 * Primary integration is the TechOne Connect REST API
 * (`/connect/api/v1/financials/*`). Fallback paths (CIA cube via ODBC,
 * direct Oracle DB read) live behind feature flags.
 *
 * See docs/TECHONE_DATA_STRUCTURES.md §14 and §18.
 */
export const TechOneFinanceOneConfigSchema = z.object({
  /** Tenant base URL, e.g. https://customer.techoneglobal.com */
  tenantUrl: z.string().url(),
  /** OAuth2 client-credentials client id (Connect API). */
  clientId: z.string().min(1),
  /** Secrets-vault key for the OAuth2 client secret. */
  clientSecretKey: z.string().min(1),
  /** Ledger entity to scope reads to (e.g. "01" for the main HE ledger). */
  ledgerEntity: z.string().min(1).default("01"),
  /**
   * UDF name on T1_AR_CUSTOMER that carries the SIS student number.
   * §4 — opaque without inspecting T1_SY_UDF_DEFINITION.
   */
  sisStudentNumberUdf: z.string().min(1).default("StudentID"),
  /** Request timeout ms. Connect API can be slow during cube refresh windows. */
  timeoutMs: z.number().int().positive().default(60_000),
  /** Page size for streamed reads. Max 1000. */
  pageSize: z.number().int().positive().max(1000).default(500),
  /**
   * If true, the adapter will attempt the CIA cube via ODBC when the
   * Connect API returns 429 sustained. Off by default — requires ODBC
   * driver and dblink, both deployment-specific.
   */
  enableCiaFallback: z.boolean().default(false),
});

export type TechOneFinanceOneConfig = z.infer<typeof TechOneFinanceOneConfigSchema>;
