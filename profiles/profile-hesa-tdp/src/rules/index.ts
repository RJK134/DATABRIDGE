import type { Rule } from '@databridge/rule-core';
import { husidFormatRule } from './husid-format';
import { codingFrameConformanceRules } from './coding-frame-conformance';
import { temporalConsistencyRules } from './temporal-consistency';
import { crossEntityIntegrityRules } from './cross-entity-integrity';
import { stuloadModeConsistencyRule } from './stuload-mode-consistency';

export const HESA_TDP_RULES: Rule[] = [
  husidFormatRule,
  ...codingFrameConformanceRules,
  ...temporalConsistencyRules,
  ...crossEntityIntegrityRules,
  stuloadModeConsistencyRule,
];
