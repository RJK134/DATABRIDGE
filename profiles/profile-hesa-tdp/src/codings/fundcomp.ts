import type { CodingFrame } from '@databridge/platform';

/**
 * HESA FUNDCOMP — Completion of funding.
 * Indicates whether the funding period for the student's engagement is complete.
 */
export const FUNDCOMP: CodingFrame = {
  id: 'FUNDCOMP',
  label: 'Completion of funding',
  hesaRef: 'FUNDCOMP',
  values: [
    { code: '1', label: 'Funding has been completed' },
    { code: '2', label: 'Student has transferred to another provider' },
    { code: '3', label: 'Student has withdrawn from the course' },
    { code: '4', label: 'Student is dormant for the reporting period' },
    { code: '9', label: 'Funding not applicable / self-funded' },
  ],
};
