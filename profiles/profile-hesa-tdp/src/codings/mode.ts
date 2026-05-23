import type { CodingFrame } from '@databridge/platform';

export const MODE: CodingFrame = {
  id: 'MODE',
  label: 'Mode of study',
  hesaRef: 'MODE',
  values: [
    { code: '1', label: 'Full-time' },
    { code: '2', label: 'Part-time' },
    { code: '31', label: 'Writing-up (full-time)' },
    { code: '32', label: 'Writing-up (part-time)' },
    { code: '33', label: 'Dormant (full-time)' },
    { code: '34', label: 'Dormant (part-time)' },
    { code: '35', label: 'Sabbatical' },
    { code: '36', label: 'Placement year (full-time)' },
    { code: '37', label: 'Placement year (part-time)' },
    { code: '38', label: 'Year abroad (full-time)' },
    { code: '39', label: 'Year abroad (part-time)' },
    { code: '44', label: 'Changes to registered mode during year' },
    { code: '64', label: 'Flexible (full-time)' },
    { code: '65', label: 'Flexible (part-time)' },
  ],
};
