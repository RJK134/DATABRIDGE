import type { Rule, RuleDefinition } from "@databridge/rule-core";
import { husidFormatRule } from "./husid-format";
import { codingFrameConformanceRules } from "./coding-frame-conformance";
import { temporalConsistencyRules } from "./temporal-consistency";
import { crossEntityIntegrityRules } from "./cross-entity-integrity";
import { stuloadModeConsistencyRule } from "./stuload-mode-consistency";
import { H01_RULES } from "./h01-husid";
import { H02_RULES } from "./h02-coding-frames";
import { H03_RULES } from "./h03-mandatory-fields";
import { H04_RULES } from "./h04-temporal";
import { H05_RULES } from "./h05-cross-entity";
import { H06_RULES } from "./h06-hecos";
import { H07_RULES } from "./h07-fee-consistency";

/**
 * Inline-style HESA TDP rules (legacy shape — single rule or rule arrays
 * authored as plain Rule objects with a `evaluate({ value, record, ... })`
 * signature).
 */
export const HESA_TDP_RULES: Rule[] = [
  husidFormatRule,
  ...codingFrameConformanceRules,
  ...temporalConsistencyRules,
  ...crossEntityIntegrityRules,
  stuloadModeConsistencyRule,
];

/**
 * Canonical H01-H07 family rule set. RuleDefinition is a back-compat alias
 * for FnAuditRule in rule-core.
 */
export const ALL_HESA_RULES: RuleDefinition[] = [
  ...H01_RULES,
  ...H02_RULES,
  ...H03_RULES,
  ...H04_RULES,
  ...H05_RULES,
  ...H06_RULES,
  ...H07_RULES,
];

export { H01_RULES, H02_RULES, H03_RULES, H04_RULES, H05_RULES, H06_RULES, H07_RULES };
