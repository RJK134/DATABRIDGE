/**
 * Rule-pack registry — exposes the source-native audit packs that the
 * API can describe alongside the canonical-side profiles.
 *
 * Today: SITS native (audit-pack-sits-native) + Banner native
 * (audit-pack-banner-native). Both ship in Phase H.
 */
import type { AuditRule, RuleSeverity } from "@databridge/rule-core";
import { SITS_NATIVE_AUDIT_PACK } from "@databridge/audit-pack-sits-native";
import { BANNER_NATIVE_AUDIT_PACK } from "@databridge/audit-pack-banner-native";

export interface RulePackSummary {
  id: string;
  version: string;
  label: string;
  description?: string;
  family: string;
  ruleCount: number;
  severityCounts: Record<RuleSeverity, number>;
}

export interface RulePackDetail extends RulePackSummary {
  rules: Array<{
    id: string;
    name: string;
    description: string;
    severity: string;
    family: string;
    ucisaBenchmarkRef?: string;
    tags?: string[];
  }>;
}

interface RegistryEntry {
  id: string;
  version: string;
  label: string;
  description: string;
  family: string;
  rules: ReadonlyArray<AuditRule>;
}

const REGISTRY: ReadonlyArray<RegistryEntry> = [
  {
    id: SITS_NATIVE_AUDIT_PACK.id,
    version: SITS_NATIVE_AUDIT_PACK.version,
    label: SITS_NATIVE_AUDIT_PACK.label,
    description: SITS_NATIVE_AUDIT_PACK.description,
    family: SITS_NATIVE_AUDIT_PACK.family,
    rules: SITS_NATIVE_AUDIT_PACK.rules,
  },
  {
    id: BANNER_NATIVE_AUDIT_PACK.id,
    version: BANNER_NATIVE_AUDIT_PACK.version,
    label: BANNER_NATIVE_AUDIT_PACK.label,
    description: BANNER_NATIVE_AUDIT_PACK.description,
    family: BANNER_NATIVE_AUDIT_PACK.family,
    rules: BANNER_NATIVE_AUDIT_PACK.rules,
  },
];

function severityCounts(rules: ReadonlyArray<AuditRule>): Record<RuleSeverity, number> {
  const out: Record<RuleSeverity, number> = { CRITICAL: 0, ERROR: 0, WARN: 0, INFO: 0 };
  for (const r of rules) {
    const sev = (r.severity === "WARNING" ? "WARN" : r.severity) as RuleSeverity;
    out[sev] = (out[sev] ?? 0) + 1;
  }
  return out;
}

function summarize(e: RegistryEntry): RulePackSummary {
  const summary: RulePackSummary = {
    id: e.id,
    version: e.version,
    label: e.label,
    family: e.family,
    ruleCount: e.rules.length,
    severityCounts: severityCounts(e.rules),
  };
  if (e.description) summary.description = e.description;
  return summary;
}

export function listRulePackSummaries(): RulePackSummary[] {
  return REGISTRY.map(summarize);
}

export function describeRulePack(id: string): RulePackDetail | undefined {
  const entry = REGISTRY.find((e) => e.id === id);
  if (!entry) return undefined;
  const summary = summarize(entry);
  return {
    ...summary,
    rules: entry.rules.map((r) => {
      // FnAuditRule.name is optional; fall back to label/id when absent.
      const fallbackLabel =
        "label" in r && typeof (r as { label?: unknown }).label === "string"
          ? (r as { label: string }).label
          : undefined;
      const out: RulePackDetail["rules"][number] = {
        id: r.id,
        name: r.name ?? fallbackLabel ?? r.id,
        description: r.description,
        severity: String(r.severity),
        family: String(r.family),
      };
      if (typeof r.ucisa_benchmark_ref === "string" && r.ucisa_benchmark_ref.length > 0) {
        out.ucisaBenchmarkRef = r.ucisa_benchmark_ref;
      }
      if (r.tags) out.tags = r.tags;
      return out;
    }),
  };
}

export function getAllNativeRules(): AuditRule[] {
  return REGISTRY.flatMap((e) => [...e.rules]);
}
