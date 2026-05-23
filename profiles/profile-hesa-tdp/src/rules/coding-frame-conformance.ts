import type { Rule } from '@databridge/rule-core';
import { ETHNIC, DISABLE, MODE, RSNEND, QUALENT3, SEXID } from '../codings';

function codingRule(
  ruleId: string,
  entity: string,
  field: string,
  frame: { values: { code: string }[] },
): Rule {
  const validCodes = new Set(frame.values.map((v) => v.code));
  return {
    id: ruleId,
    family: 'CODING',
    severity: 'ERROR',
    entity,
    field,
    label: `${field} coding frame conformance`,
    description: `Value must be a valid ${field} code.`,
    ucisa_benchmark_ref: null,
    evaluate({ value }: { value: unknown }) {
      const val = String(value ?? '');
      if (!validCodes.has(val)) {
        return { pass: false, message: `"${val}" is not a valid ${field} code` };
      }
      return { pass: true };
    },
  };
}

export const codingFrameConformanceRules: Rule[] = [
  codingRule('HESA-TDP-010', 'Student', 'ETHNIC', ETHNIC),
  codingRule('HESA-TDP-011', 'Student', 'SEXID', SEXID),
  codingRule('HESA-TDP-012', 'StudentCourseSession', 'MODE', MODE),
  codingRule('HESA-TDP-013', 'Leaver', 'RSNEND', RSNEND),
  codingRule('HESA-TDP-014', 'EntryProfile', 'QUALENT3', QUALENT3),
];
