export * from './h01-husid';
export * from './h02-coding-frames';
export * from './h03-mandatory-fields';
export * from './h04-temporal';
export * from './h05-cross-entity';
export * from './h06-hecos';
export * from './h07-fee-consistency';

import { H01_RULES } from './h01-husid';
import { H02_RULES } from './h02-coding-frames';
import { H03_RULES } from './h03-mandatory-fields';
import { H04_RULES } from './h04-temporal';
import { H05_RULES } from './h05-cross-entity';
import { H06_RULES } from './h06-hecos';
import { H07_RULES } from './h07-fee-consistency';
import type { RuleDefinition } from '@databridge/rule-core';

export const ALL_HESA_RULES: RuleDefinition[] = [
  ...H01_RULES,
  ...H02_RULES,
  ...H03_RULES,
  ...H04_RULES,
  ...H05_RULES,
  ...H06_RULES,
  ...H07_RULES,
];
