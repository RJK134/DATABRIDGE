import type { RuleDefinition } from '@databridge/rule-core';

/**
 * H01 — HUSID validation rules.
 * HUSID is the HESA Unique Student Identifier — a 13-digit number
 * with a mod-11 check digit in position 13.
 */

function isValidHusid(husid: unknown): boolean {
  if (typeof husid !== 'string') return false;
  if (!/^\d{13}$/.test(husid)) return false;
  // Mod-11 check digit validation
  const digits = husid.split('').map(Number);
  const weights = [0, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0];
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (weights[i + 1] ?? 0), 0);
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  if (checkDigit === 10) return false; // invalid — would need two digits
  return digits[12] === checkDigit;
}

export const H01_RULES: RuleDefinition[] = [
  {
    id: 'H01-001',
    family: 'H01',
    entity: 'Student',
    field: 'husid',
    severity: 'ERROR',
    ucisa_benchmark_ref: 'HESA-STU-HUSID',
    description: 'HUSID must be present on every Student record',
    evaluate: (record: Record<string, unknown>) => {
      if (!record['husid']) {
        return { pass: false, message: 'HUSID is missing. Every student must have a HESA Unique Student Identifier.' };
      }
      return { pass: true };
    },
  },
  {
    id: 'H01-002',
    family: 'H01',
    entity: 'Student',
    field: 'husid',
    severity: 'ERROR',
    ucisa_benchmark_ref: 'HESA-STU-HUSID-FORMAT',
    description: 'HUSID must be exactly 13 digits with a valid mod-11 check digit',
    evaluate: (record: Record<string, unknown>) => {
      const husid = record['husid'];
      if (!husid) return { pass: true }; // H01-001 covers missing
      if (!isValidHusid(husid)) {
        return {
          pass: false,
          message: `HUSID "${husid}" is invalid. Must be 13 digits with a valid mod-11 check digit.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: 'H01-003',
    family: 'H01',
    entity: 'Student',
    field: 'husid',
    severity: 'ERROR',
    ucisa_benchmark_ref: 'HESA-STU-HUSID-UNIQUE',
    description: 'HUSID must be unique within the submission',
    evaluate: (record: Record<string, unknown>, context?: { allRecords?: Record<string, unknown>[] }) => {
      if (!context?.allRecords) return { pass: true };
      const husid = record['husid'];
      if (!husid) return { pass: true };
      const duplicates = context.allRecords.filter(
        r => r !== record && r['husid'] === husid
      );
      if (duplicates.length > 0) {
        return {
          pass: false,
          message: `HUSID "${husid}" appears on more than one Student record. HUSIDs must be unique within the submission.`,
        };
      }
      return { pass: true };
    },
  },
];
