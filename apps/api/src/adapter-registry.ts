/**
 * Adapter registry — keeps a single in-memory map of source adapter classes
 * keyed by their id. The registry exposes the list of adapter classes and
 * their declared capabilities; the API layer uses it to drive
 *   GET /adapters
 *   GET /adapters/:id
 * routes without needing to know about each adapter package directly.
 */
import type { SourceAdapter } from "@databridge/adapter-spec";
import { SitsApiAdapter } from "@databridge/adapter-sits-api";
import { SitsFileAdapter } from "@databridge/adapter-sits-file";
import { BannerEthosAdapter } from "@databridge/adapter-banner-ethos";
import { BannerOracleAdapter } from "@databridge/adapter-banner-oracle";
import { WorkdayRaasAdapter } from "@databridge/adapter-workday-raas";
import { Sjms5Adapter } from "@databridge/adapter-sjms5";

/**
 * An entry in the registry. We store the class itself (so callers can
 * `new entry.Adapter(config)`) plus a small descriptor with stable metadata.
 */
export interface AdapterRegistryEntry {
  id: string;
  displayName: string;
  preferredAuth: string;
  supportsIncremental: boolean;
  supportsSampling: boolean;
  supportsCodeLists: boolean;
  supportsDictionary: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Adapter: new (config: unknown) => SourceAdapter;
}

function describe(
  Adapter: new (config: unknown) => SourceAdapter,
  // Use a permissive zero-config so we can introspect capabilities at registry
  // build time. Adapters with required config throw on validation; we instead
  // grab the static fields from a single sample instance constructed with a
  // throwaway config — but since constructors validate, we collect statics by
  // hand for now (no need to instantiate).
  meta: Omit<AdapterRegistryEntry, "Adapter">
): AdapterRegistryEntry {
  return { Adapter, ...meta };
}

export const ADAPTER_REGISTRY: ReadonlyArray<AdapterRegistryEntry> = [
  describe(SitsApiAdapter, {
    id: "sits-api",
    displayName: "SITS Web Services (REST)",
    preferredAuth: "bearer",
    supportsIncremental: true,
    supportsSampling: true,
    supportsCodeLists: true,
    supportsDictionary: true,
  }),
  describe(SitsFileAdapter, {
    id: "sits-file",
    displayName: "SITS file extracts (CSV/XML)",
    preferredAuth: "file",
    supportsIncremental: true,
    supportsSampling: true,
    supportsCodeLists: true,
    supportsDictionary: false,
  }),
  describe(BannerEthosAdapter, {
    id: "banner-ethos",
    displayName: "Banner Ellucian Ethos (REST)",
    preferredAuth: "oauth2",
    supportsIncremental: true,
    supportsSampling: true,
    supportsCodeLists: true,
    supportsDictionary: true,
  }),
  describe(BannerOracleAdapter, {
    id: "banner-oracle",
    displayName: "Banner Oracle (native)",
    preferredAuth: "db-credentials",
    supportsIncremental: true,
    supportsSampling: true,
    supportsCodeLists: true,
    supportsDictionary: false,
  }),
  describe(WorkdayRaasAdapter, {
    id: "workday-raas",
    displayName: "Workday RaaS (Reports)",
    preferredAuth: "basic",
    supportsIncremental: true,
    supportsSampling: true,
    supportsCodeLists: true,
    supportsDictionary: false,
  }),
  describe(Sjms5Adapter, {
    id: "sjms5",
    displayName: "SJMS 5 (Prisma/Postgres)",
    preferredAuth: "db-credentials",
    supportsIncremental: true,
    supportsSampling: true,
    supportsCodeLists: false,
    supportsDictionary: false,
  }),
];

export function findAdapter(id: string): AdapterRegistryEntry | undefined {
  return ADAPTER_REGISTRY.find((entry) => entry.id === id);
}
