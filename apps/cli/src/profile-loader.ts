/**
 * Profile loader for the CLI.
 *
 * Mirrors apps/api/profile-registry but kept local so the CLI can be used
 * without pulling in the full API package. Adding new profile packs only
 * requires extending the KNOWN array.
 */

import { HESA_TDP_PROFILE } from "@databridge/profile-hesa-tdp";
import * as profileSits from "@databridge/profile-sits";

interface KnownProfile {
  id: string;
  load(): unknown;
}

const KNOWN: KnownProfile[] = [
  {
    id: "hesa-tdp",
    load: () => HESA_TDP_PROFILE,
  },
  {
    id: "sits",
    load: () => {
      const m = profileSits as Record<string, unknown>;
      if (m["SITS_PROFILE"]) return m["SITS_PROFILE"];
      return profileSits as unknown;
    },
  },
];

export function resolveProfile(id: string): unknown | undefined {
  const entry = KNOWN.find((k) => k.id === id);
  return entry ? entry.load() : undefined;
}

export function listKnownProfileIds(): string[] {
  return KNOWN.map((k) => k.id);
}
