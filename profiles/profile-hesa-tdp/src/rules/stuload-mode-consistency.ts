import type { Rule } from '@databridge/rule-core';

// Full-time students (MODE=1) should have STULOAD >= 0.5
export const stuloadModeConsistencyRule: Rule = {
  id: 'HESA-TDP-040',
  family: 'CONSISTENCY',
  severity: 'WARNING',
  entity: 'StudentCourseSession',
  field: 'STULOAD',
  label: 'STULOAD/MODE consistency',
  description:
    'Full-time students (MODE=1) are expected to have a STULOAD of 0.5 or greater.',
  ucisa_benchmark_ref: null,
  evaluate({ record }: { record: Record<string, unknown> }) {
    const mode = String(record['MODE'] ?? '');
    const stuload = Number(record['STULOAD']);
    if (mode === '1' && !isNaN(stuload) && stuload < 0.5) {
      return {
        pass: false,
        message: `Full-time student has STULOAD ${stuload} — expected ≥ 0.5`,
      };
    }
    return { pass: true };
  },
};
