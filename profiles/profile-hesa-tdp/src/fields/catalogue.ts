/**
 * HESA Data Futures C25061 field catalogue.
 * Each field maps a DataBridge canonical field to its HESA Data Futures equivalent.
 */

import type { CodingFrameName } from '../codings';
import type { HesaEntityName } from '../entities';

export interface HesaFieldDef {
  id: string;
  hesaFieldRef: string;      // HESA field reference code e.g. HUSID, ETHNIC
  hesaEntity: HesaEntityName;
  dataBridgeField: string;   // DataBridge canonical field name
  label: string;
  type: 'string' | 'date' | 'integer' | 'decimal' | 'boolean';
  maxLength?: number;
  mandatory: boolean;
  codingFrame?: CodingFrameName;
  hesaDescription: string;
}

export const HESA_FIELD_CATALOGUE: HesaFieldDef[] = [
  // =========================================================================
  // Student entity
  // =========================================================================
  {
    id: 'STU-001',
    hesaFieldRef: 'HUSID',
    hesaEntity: 'Student',
    dataBridgeField: 'husid',
    label: 'HESA Unique Student Identifier',
    type: 'string',
    maxLength: 13,
    mandatory: true,
    hesaDescription: '13-digit unique identifier assigned by HESA. Mod-11 check digit required.',
  },
  {
    id: 'STU-002',
    hesaFieldRef: 'OWNSTU',
    hesaEntity: 'Student',
    dataBridgeField: 'studentId',
    label: 'Provider student identifier',
    type: 'string',
    maxLength: 20,
    mandatory: true,
    hesaDescription: 'Unique identifier used by the provider for this student.',
  },
  {
    id: 'STU-003',
    hesaFieldRef: 'SURNAME',
    hesaEntity: 'Student',
    dataBridgeField: 'lastName',
    label: 'Surname',
    type: 'string',
    maxLength: 100,
    mandatory: true,
    hesaDescription: 'Family name of the student.',
  },
  {
    id: 'STU-004',
    hesaFieldRef: 'FNAMES',
    hesaEntity: 'Student',
    dataBridgeField: 'firstName',
    label: 'First/given names',
    type: 'string',
    maxLength: 100,
    mandatory: true,
    hesaDescription: 'Forenames or given names of the student.',
  },
  {
    id: 'STU-005',
    hesaFieldRef: 'BIRTHDTE',
    hesaEntity: 'Student',
    dataBridgeField: 'dateOfBirth',
    label: 'Date of birth',
    type: 'date',
    mandatory: true,
    hesaDescription: 'Date of birth in ISO 8601 format (YYYY-MM-DD).',
  },
  {
    id: 'STU-006',
    hesaFieldRef: 'SEXID',
    hesaEntity: 'Student',
    dataBridgeField: 'genderId',
    label: 'Gender identity',
    type: 'string',
    maxLength: 1,
    mandatory: true,
    codingFrame: 'SEXID',
    hesaDescription: 'Gender identity of the student. Uses SEXID coding frame (C25061 replaces SEX).',
  },
  {
    id: 'STU-007',
    hesaFieldRef: 'ETHNIC',
    hesaEntity: 'Student',
    dataBridgeField: 'ethnicity',
    label: 'Ethnicity',
    type: 'string',
    maxLength: 2,
    mandatory: true,
    codingFrame: 'ETHNIC',
    hesaDescription: 'Ethnic origin of the student. Uses ETHNIC coding frame.',
  },
  {
    id: 'STU-008',
    hesaFieldRef: 'DISABLE',
    hesaEntity: 'Student',
    dataBridgeField: 'disability',
    label: 'Disability',
    type: 'string',
    maxLength: 2,
    mandatory: true,
    codingFrame: 'DISABLE',
    hesaDescription: 'Whether the student has a disability. Uses DISABLE coding frame.',
  },
  {
    id: 'STU-009',
    hesaFieldRef: 'DOMICILE',
    hesaEntity: 'Student',
    dataBridgeField: 'domicile',
    label: 'Domicile',
    type: 'string',
    maxLength: 2,
    mandatory: true,
    codingFrame: 'DOMICILE',
    hesaDescription: 'Country of domicile prior to entry. Uses DOMICILE coding frame.',
  },
  {
    id: 'STU-010',
    hesaFieldRef: 'NATION',
    hesaEntity: 'Student',
    dataBridgeField: 'nationality',
    label: 'Nationality',
    type: 'string',
    maxLength: 3,
    mandatory: true,
    hesaDescription: 'Nationality of the student. ISO 3166-1 numeric country code.',
  },
  {
    id: 'STU-011',
    hesaFieldRef: 'UCASPERID',
    hesaEntity: 'Student',
    dataBridgeField: 'ucasPersonalId',
    label: 'UCAS personal identifier',
    type: 'string',
    maxLength: 10,
    mandatory: false,
    hesaDescription: 'UCAS personal ID. Required if student applied through UCAS.',
  },
  {
    id: 'STU-012',
    hesaFieldRef: 'NIN',
    hesaEntity: 'Student',
    dataBridgeField: 'nationalInsuranceNumber',
    label: 'National Insurance number',
    type: 'string',
    maxLength: 9,
    mandatory: false,
    hesaDescription: 'UK National Insurance number. Encrypted at rest.',
  },

  // =========================================================================
  // Engagement entity
  // =========================================================================
  {
    id: 'ENG-001',
    hesaFieldRef: 'ENGDATE',
    hesaEntity: 'Engagement',
    dataBridgeField: 'engagementStartDate',
    label: 'Engagement start date',
    type: 'date',
    mandatory: true,
    hesaDescription: 'Date the student first engaged with the provider.',
  },
  {
    id: 'ENG-002',
    hesaFieldRef: 'ENDDATE',
    hesaEntity: 'Engagement',
    dataBridgeField: 'engagementEndDate',
    label: 'Expected end date',
    type: 'date',
    mandatory: true,
    hesaDescription: 'Expected end date of the engagement.',
  },
  {
    id: 'ENG-003',
    hesaFieldRef: 'RSNEND',
    hesaEntity: 'Engagement',
    dataBridgeField: 'reasonForEnding',
    label: 'Reason for ending engagement',
    type: 'string',
    maxLength: 2,
    mandatory: false,
    codingFrame: 'RSNEND',
    hesaDescription: 'Reason the engagement ended. Required when engagement has actually ended.',
  },

  // =========================================================================
  // StudentCourseSession entity
  // =========================================================================
  {
    id: 'SCS-001',
    hesaFieldRef: 'COURSEAIM',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'qualificationAim',
    label: 'Course qualification aim',
    type: 'string',
    maxLength: 3,
    mandatory: true,
    hesaDescription: 'The qualification aim of the course. E.g. H11 = First degree.',
  },
  {
    id: 'SCS-002',
    hesaFieldRef: 'HECOS1',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'hecosSubject1',
    label: 'HECoS subject 1 (cost centre)',
    type: 'string',
    maxLength: 6,
    mandatory: true,
    hesaDescription: 'Primary HECoS subject code. 6-digit code from HESA HECoS vocabulary.',
  },
  {
    id: 'SCS-003',
    hesaFieldRef: 'HECOS2',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'hecosSubject2',
    label: 'HECoS subject 2',
    type: 'string',
    maxLength: 6,
    mandatory: false,
    hesaDescription: 'Secondary HECoS subject code (joint honours).',
  },
  {
    id: 'SCS-004',
    hesaFieldRef: 'HECOS3',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'hecosSubject3',
    label: 'HECoS subject 3',
    type: 'string',
    maxLength: 6,
    mandatory: false,
    hesaDescription: 'Tertiary HECoS subject code (combined honours).',
  },
  {
    id: 'SCS-005',
    hesaFieldRef: 'MODE',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'modeOfStudy',
    label: 'Mode of study',
    type: 'string',
    maxLength: 2,
    mandatory: true,
    codingFrame: 'MODE',
    hesaDescription: 'Mode of study. Uses MODE coding frame.',
  },
  {
    id: 'SCS-006',
    hesaFieldRef: 'YRSTU',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'yearOfStudy',
    label: 'Year of student on course',
    type: 'integer',
    mandatory: true,
    hesaDescription: 'Year the student is in on their course. 1 = first year.',
  },
  {
    id: 'SCS-007',
    hesaFieldRef: 'FUNDCOMP',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'completionOfFunding',
    label: 'Completion of funding year',
    type: 'string',
    maxLength: 1,
    mandatory: true,
    codingFrame: 'FUNDCOMP',
    hesaDescription: 'Whether the student completed the funding year.',
  },
  {
    id: 'SCS-008',
    hesaFieldRef: 'FUNDLEV',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'fundingLevel',
    label: 'Level of funding',
    type: 'string',
    maxLength: 2,
    mandatory: true,
    hesaDescription: 'The level at which the student is being funded.',
  },
  {
    id: 'SCS-009',
    hesaFieldRef: 'GROSSFEE',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'grossFee',
    label: 'Gross fee',
    type: 'integer',
    mandatory: false,
    hesaDescription: 'Gross tuition fee charged to the student (pence).',
  },
  {
    id: 'SCS-010',
    hesaFieldRef: 'NETFEE',
    hesaEntity: 'StudentCourseSession',
    dataBridgeField: 'netFee',
    label: 'Net fee',
    type: 'integer',
    mandatory: false,
    hesaDescription: 'Net tuition fee after bursaries/waivers (pence).',
  },

  // =========================================================================
  // Module entity
  // =========================================================================
  {
    id: 'MOD-001',
    hesaFieldRef: 'MODID',
    hesaEntity: 'Module',
    dataBridgeField: 'moduleCode',
    label: 'Module identifier',
    type: 'string',
    maxLength: 20,
    mandatory: true,
    hesaDescription: 'Provider-assigned module identifier.',
  },
  {
    id: 'MOD-002',
    hesaFieldRef: 'MODNAME',
    hesaEntity: 'Module',
    dataBridgeField: 'moduleTitle',
    label: 'Module name',
    type: 'string',
    maxLength: 100,
    mandatory: true,
    hesaDescription: 'Title of the module.',
  },
  {
    id: 'MOD-003',
    hesaFieldRef: 'MODHOURS',
    hesaEntity: 'Module',
    dataBridgeField: 'creditValue',
    label: 'Module credit value',
    type: 'integer',
    mandatory: true,
    hesaDescription: 'Credit value of the module in UK credits.',
  },
  {
    id: 'MOD-004',
    hesaFieldRef: 'MODLEV',
    hesaEntity: 'Module',
    dataBridgeField: 'creditLevel',
    label: 'Module credit level',
    type: 'string',
    maxLength: 1,
    mandatory: true,
    hesaDescription: 'FHEQ level of the module (4=Year 1 UG, 5=Year 2 UG, 6=Year 3 UG, 7=PGT).',
  },
  {
    id: 'MOD-005',
    hesaFieldRef: 'MODHECOS',
    hesaEntity: 'Module',
    dataBridgeField: 'hecosSubject',
    label: 'HECoS subject code for module',
    type: 'string',
    maxLength: 6,
    mandatory: true,
    hesaDescription: '6-digit HECoS subject code for the module.',
  },

  // =========================================================================
  // StudentModuleInstance entity
  // =========================================================================
  {
    id: 'SMI-001',
    hesaFieldRef: 'SMIMARK',
    hesaEntity: 'StudentModuleInstance',
    dataBridgeField: 'moduleResult',
    label: 'Module result/mark',
    type: 'string',
    maxLength: 6,
    mandatory: false,
    hesaDescription: 'Mark or result achieved by the student for this module.',
  },
  {
    id: 'SMI-002',
    hesaFieldRef: 'CRDTPTS',
    hesaEntity: 'StudentModuleInstance',
    dataBridgeField: 'creditsAchieved',
    label: 'Credit points achieved',
    type: 'integer',
    mandatory: false,
    hesaDescription: 'Number of credit points achieved by the student for this module.',
  },

  // =========================================================================
  // EntryProfile entity
  // =========================================================================
  {
    id: 'ENP-001',
    hesaFieldRef: 'QUALENT3',
    hesaEntity: 'EntryProfile',
    dataBridgeField: 'highestEntryQualification',
    label: 'Highest qualification on entry',
    type: 'string',
    maxLength: 1,
    mandatory: false,
    codingFrame: 'QUALENT3',
    hesaDescription: 'Highest qualification held by the student at entry. Uses QUALENT3 coding frame.',
  },
  {
    id: 'ENP-002',
    hesaFieldRef: 'PCOLAB',
    hesaEntity: 'EntryProfile',
    dataBridgeField: 'entryTariffPoints',
    label: 'UCAS tariff points on entry',
    type: 'integer',
    mandatory: false,
    hesaDescription: 'UCAS tariff points accumulated from qualifications at entry.',
  },
];

export const MANDATORY_HESA_FIELDS = HESA_FIELD_CATALOGUE.filter(f => f.mandatory);
export const FIELDS_BY_ENTITY = HESA_FIELD_CATALOGUE.reduce<Record<string, HesaFieldDef[]>>(
  (acc, f) => {
    if (!acc[f.hesaEntity]) acc[f.hesaEntity] = [];
    acc[f.hesaEntity].push(f);
    return acc;
  },
  {}
);
