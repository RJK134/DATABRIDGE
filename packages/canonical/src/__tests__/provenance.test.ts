import { describe, it, expect } from 'vitest';
import {
  StudentZ,
  ProgrammeEnrolmentZ,
  ModuleEnrolmentZ,
  VisaRecordZ,
  ProvenanceFieldsZ,
  AltIdZ,
  SourceKeysZ,
  EffectiveDatingZ,
  CANONICAL_ENTITY_NAMES,
  CANONICAL_SCHEMAS,
} from '../entities/index.js';

describe('Provenance primitives — zod schemas', () => {
  it('AltIdZ accepts a well-formed alt id', () => {
    const parsed = AltIdZ.parse({
      system: 'banner-oracle',
      type: 'pidm',
      value: '82045',
      firstSeenAt: '2024-06-01T00:00:00Z',
      current: true,
    });
    expect(parsed.value).toBe('82045');
  });

  it('AltIdZ rejects empty value', () => {
    expect(() => AltIdZ.parse({ system: 'banner-oracle', type: 'pidm', value: '' })).toThrow();
  });

  it('SourceKeysZ accepts nested string maps', () => {
    const parsed = SourceKeysZ.parse({ banner: { pidm: '82045', crn: '10243' } });
    expect(parsed['banner']?.['crn']).toBe('10243');
  });

  it('EffectiveDatingZ accepts all six patterns', () => {
    const patterns = [
      'activity-dated',
      'term-keyed',
      'from-to-dated',
      'change-indicator',
      'status-driven',
      'snapshot',
    ] as const;
    for (const pattern of patterns) {
      const parsed = EffectiveDatingZ.parse({ pattern, isCurrent: true });
      expect(parsed.pattern).toBe(pattern);
    }
  });

  it('ProvenanceFieldsZ accepts all three primitives together', () => {
    const parsed = ProvenanceFieldsZ.parse({
      altIds: [{ system: 'banner-oracle', type: 'pidm', value: '1' }],
      sourceKeys: { banner: { pidm: '1' } },
      effectiveDating: { pattern: 'snapshot', isCurrent: true },
    });
    expect(parsed.altIds).toHaveLength(1);
  });
});

describe('Provenance on Student / ProgrammeEnrolment / ModuleEnrolment', () => {
  it('Student accepts altIds + sourceKeys', () => {
    const parsed = StudentZ.parse({
      id: '11111111-1111-1111-1111-111111111111',
      sourceId: 'STU-1',
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: '1999-03-15',
      altIds: [
        { system: 'banner-oracle', type: 'pidm', value: '82045' },
        { system: 'sits-oracle', type: 'mst-code', value: '23123456' },
      ],
      sourceKeys: { banner: { pidm: '82045' }, sits: { stuCode: '23123456' } },
    });
    expect(parsed.altIds).toHaveLength(2);
    expect(parsed.sourceKeys?.['banner']?.['pidm']).toBe('82045');
  });

  it('ProgrammeEnrolment validates status + attemptNumber + effective dating', () => {
    const parsed = ProgrammeEnrolmentZ.parse({
      id: '22222222-2222-2222-2222-222222222222',
      personId: '11111111-1111-1111-1111-111111111111',
      programmeId: '33333333-3333-3333-3333-333333333333',
      startDate: '2023-09-25',
      status: 'ACTIVE',
      mode: 'FULL_TIME',
      attemptNumber: 1,
      effectiveDating: {
        pattern: 'status-driven',
        isCurrent: true,
      },
    });
    expect(parsed.attemptNumber).toBe(1);
    expect(parsed.effectiveDating?.isCurrent).toBe(true);
  });

  it('ModuleEnrolment allows credit-unit to be declared', () => {
    const parsed = ModuleEnrolmentZ.parse({
      id: '44444444-4444-4444-4444-444444444444',
      personId: '11111111-1111-1111-1111-111111111111',
      moduleInstanceId: '55555555-5555-5555-5555-555555555555',
      status: 'COMPLETED_PASS',
      creditsAttempted: 4,
      creditUnit: 'credit-hour',
    });
    expect(parsed.creditUnit).toBe('credit-hour');
  });
});

describe('VisaRecord discriminated union', () => {
  it('parses a CAS visa', () => {
    const parsed = VisaRecordZ.parse({
      kind: 'CAS',
      id: '66666666-6666-6666-6666-666666666666',
      personId: '11111111-1111-1111-1111-111111111111',
      casNumber: 'CAS-9999',
    });
    expect(parsed.kind).toBe('CAS');
  });

  it('parses a SEVIS visa', () => {
    const parsed = VisaRecordZ.parse({
      kind: 'SEVIS',
      id: '77777777-7777-7777-7777-777777777777',
      personId: '11111111-1111-1111-1111-111111111111',
      sevisNumber: 'N00123456',
      visaType: 'F-1',
    });
    expect(parsed.kind).toBe('SEVIS');
  });

  it('rejects a row with no discriminator', () => {
    expect(() =>
      VisaRecordZ.parse({
        id: '88888888-8888-8888-8888-888888888888',
        personId: '11111111-1111-1111-1111-111111111111',
      }),
    ).toThrow();
  });
});

describe('Canonical registry growth from Phase G', () => {
  it('includes the new entities in CANONICAL_ENTITY_NAMES', () => {
    const expected = [
      'Address',
      'EmailAddress',
      'Phone',
      'Programme',
      'ProgrammeEnrolment',
      'AcademicYearEnrolment',
      'ModuleEnrolment',
      'ModuleResult',
      'AssessmentResult',
      'Application',
      'ApplicationDecision',
      'VisaRecord',
      'StudentAccount',
      'Charge',
      'Payment',
      'Sponsor',
      'Hold',
      'Advisor',
      'TransferCredit',
      'RecognisedPriorLearning',
      'TermGPA',
      'TestScore',
      'StatutoryReturn',
    ];
    for (const name of expected) {
      expect(CANONICAL_ENTITY_NAMES).toContain(name);
    }
  });

  it('CANONICAL_SCHEMAS has a zod schema for every name', () => {
    for (const name of CANONICAL_ENTITY_NAMES) {
      expect(CANONICAL_SCHEMAS[name]).toBeDefined();
    }
  });
});
