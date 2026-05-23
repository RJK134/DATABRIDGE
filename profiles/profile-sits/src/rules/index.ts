import type { AuditRule } from "@databridge/rule-core";
import { F01_completeness } from "./f01-completeness.js";
import { F02_referential_integrity } from "./f02-referential-integrity.js";
import { F03_codelist_conformance } from "./f03-codelist-conformance.js";
import { F04_temporal_consistency } from "./f04-temporal-consistency.js";
import { F05_hesa_statutory } from "./f05-hesa-statutory.js";
import { F06_husid_uniqueness } from "./f06-husid-uniqueness.js";
import { F07_finance_consistency } from "./f07-finance-consistency.js";
import { F08_duplicate_detection } from "./f08-duplicate-detection.js";
import { F09_programme_structure } from "./f09-programme-structure.js";
import { F10_award_integrity } from "./f10-award-integrity.js";
import { F11_disability_equality } from "./f11-disability-equality.js";
import { F12_agent_compliance } from "./f12-agent-compliance.js";
import { F13_legacy_scars } from "./f13-legacy-scars.js";

export const rules: AuditRule[] = [
  ...F01_completeness,
  ...F02_referential_integrity,
  ...F03_codelist_conformance,
  ...F04_temporal_consistency,
  ...F05_hesa_statutory,
  ...F06_husid_uniqueness,
  ...F07_finance_consistency,
  ...F08_duplicate_detection,
  ...F09_programme_structure,
  ...F10_award_integrity,
  ...F11_disability_equality,
  ...F12_agent_compliance,
  ...F13_legacy_scars,
];
