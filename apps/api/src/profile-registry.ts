/**
 * Profile registry — exposes the available source/target profiles that the
 * API can describe and validate against.
 */
import type { Profile } from "@databridge/platform";
import { HESA_TDP_PROFILE } from "@databridge/profile-hesa-tdp";
// profile-sits exposes a different shape; import its descriptor lazily.
import * as profileSits from "@databridge/profile-sits";

export interface ProfileSummary {
  id: string;
  version: string;
  label: string;
  description?: string;
  entityCount: number;
  fieldCount: number;
  ruleCount: number;
  metadata?: Record<string, unknown>;
}

/** Adapt a Profile (or profile-sits export) into the summary shape. */
function summarize(p: Profile | Record<string, unknown>, fallbackId: string): ProfileSummary {
  const profile = p as Profile;
  const entities = (profile.entities ?? []) as unknown[];
  const fields = (profile.fields ?? []) as unknown[];
  const rules = (profile.rules ?? []) as unknown[];
  const summary: ProfileSummary = {
    id: profile.id ?? fallbackId,
    version: profile.version ?? "0.0.0",
    label: profile.label ?? fallbackId,
    entityCount: Array.isArray(entities) ? entities.length : 0,
    fieldCount: Array.isArray(fields) ? fields.length : 0,
    ruleCount: Array.isArray(rules) ? rules.length : 0,
  };
  if (profile.description !== undefined) summary.description = profile.description;
  if (profile.metadata !== undefined) summary.metadata = profile.metadata;
  return summary;
}

export const PROFILE_REGISTRY: ReadonlyArray<{
  id: string;
  profile: Profile | Record<string, unknown>;
}> = [
  { id: "hesa-tdp", profile: HESA_TDP_PROFILE },
  // profile-sits export name is best-effort; fall back to the namespace itself.
  {
    id: "sits",
    profile:
      (profileSits as Record<string, unknown>)["SITS_PROFILE"] !== undefined
        ? ((profileSits as Record<string, unknown>)["SITS_PROFILE"] as Profile)
        : (profileSits as unknown as Record<string, unknown>),
  },
];

export function listProfileSummaries(): ProfileSummary[] {
  return PROFILE_REGISTRY.map((p) => summarize(p.profile, p.id));
}

export function findProfile(
  id: string
): { id: string; profile: Profile | Record<string, unknown> } | undefined {
  return PROFILE_REGISTRY.find((p) => p.id === id);
}

export function describeProfile(id: string): ProfileSummary | undefined {
  const entry = findProfile(id);
  return entry ? summarize(entry.profile, entry.id) : undefined;
}
