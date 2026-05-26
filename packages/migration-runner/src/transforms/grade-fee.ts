/**
 * Grade-scheme (slot 6) and fee-status (slot 8) transforms.
 *
 * Both delegate to a CodesetMapRegistry; both honour the on-missing
 * policy (warn / fail / skip) or the defaultToUnknown flag.
 */
import type {
  GradeSchemePolicy,
  FeeStatusPolicy,
} from "@databridge/migration-policy";
import { translateCode, type CodesetMapRegistry } from "@databridge/codeset-mapper";
import type { ProvenanceEntry } from "../types.js";

export interface CodesetTranslateOutcome {
  value: string | null;
  warn?: string;
  fail?: string;
  provenance: ProvenanceEntry;
}

/** Translate a Banner letter grade via the configured map. */
export function translateGrade(
  registry: CodesetMapRegistry,
  policy: GradeSchemePolicy,
  letter: string,
  tenantId?: string,
): CodesetTranslateOutcome {
  const args: Parameters<typeof translateThroughMapId>[1] = {
    mapId: policy.mapId,
    sourceCode: letter,
    slot: "gradeScheme",
    onMissing: policy.onMissing,
  };
  if (tenantId !== undefined) args.tenantId = tenantId;
  return translateThroughMapId(registry, args);
}

/** Translate a Banner residency code via the configured map. */
export function translateFeeStatus(
  registry: CodesetMapRegistry,
  policy: FeeStatusPolicy,
  resd: string,
  tenantId?: string,
): CodesetTranslateOutcome {
  const args: Parameters<typeof translateThroughMapId>[1] = {
    mapId: policy.mapId,
    sourceCode: resd,
    slot: "feeStatus",
    onMissing: policy.defaultToUnknown ? "skip" : "fail",
  };
  if (tenantId !== undefined) args.tenantId = tenantId;
  const outcome = translateThroughMapId(registry, args);
  if (outcome.value === null && policy.defaultToUnknown) {
    return {
      value: "99",
      provenance: {
        slot: "feeStatus",
        strategy: "defaultToUnknown",
        note: `unmapped code ${resd} → 99`,
        inputValue: resd,
        outputValue: "99",
      },
    };
  }
  return outcome;
}

function translateThroughMapId(
  registry: CodesetMapRegistry,
  args: {
    mapId: string;
    sourceCode: string;
    slot: string;
    onMissing: "fail" | "warn" | "skip";
    tenantId?: string;
  },
): CodesetTranslateOutcome {
  // Map-id format: "<codelist-pair>@<version>" — resolve via codelists from registry.
  const map = registry.get(args.mapId);
  if (!map) {
    return {
      value: null,
      fail: `codeset map not registered: ${args.mapId}`,
      provenance: {
        slot: args.slot,
        strategy: "lookup-miss",
        note: `map ${args.mapId} not registered`,
        inputValue: args.sourceCode,
        outputValue: null,
      },
    };
  }
  const translateArgs: Parameters<typeof translateCode>[1] = {
    sourceCodelist: map.sourceCodelist,
    targetCodelist: map.targetCodelist,
    sourceCode: args.sourceCode,
  };
  if (args.tenantId !== undefined) translateArgs.tenantId = args.tenantId;
  const result = translateCode(registry, translateArgs);
  if (result.ok && result.targetCode !== undefined) {
    return {
      value: result.targetCode,
      provenance: {
        slot: args.slot,
        strategy: "codeset-lookup",
        note: `${map.sourceCodelist}:${args.sourceCode} → ${map.targetCodelist}:${result.targetCode}`,
        inputValue: args.sourceCode,
        outputValue: result.targetCode,
      },
    };
  }
  const outcome: CodesetTranslateOutcome = {
    value: null,
    provenance: {
      slot: args.slot,
      strategy: "codeset-lookup",
      note: result.unmappedReason ?? "no mapping",
      inputValue: args.sourceCode,
      outputValue: null,
    },
  };
  if (args.onMissing === "fail") outcome.fail = `no mapping for ${args.sourceCode}`;
  if (args.onMissing === "warn") outcome.warn = `no mapping for ${args.sourceCode}`;
  return outcome;
}
