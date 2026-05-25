/**
 * HESA Data Futures C25061 entity registry.
 * Maps DataBridge canonical entities to HESA Data Futures entity names.
 * Reference: https://www.hesa.ac.uk/collection/c25061
 */

export type HesaEntityName =
  | 'Student'
  | 'Engagement'
  | 'StudentCourseSession'
  | 'Module'
  | 'StudentModuleInstance'
  | 'Leaver'
  | 'EntryProfile'
  | 'InstancePeriod';

export interface HesaEntity {
  name: HesaEntityName;
  hesaRef: string;          // HESA Data Futures entity reference code
  description: string;
  mandatory: boolean;        // Must be present in every submission
  migrationOrder: number;    // Load order (lower = load first)
  dataBridgeEntity: string; // Canonical DataBridge entity name
  collectionVersion: 'C25061' | 'C24061';
}

export const HESA_ENTITIES: HesaEntity[] = [
  {
    name: 'Student',
    hesaRef: 'STU',
    description: 'Core student demographic and identifiers including HUSID, DOB, ethnicity, disability, domicile and nationality',
    mandatory: true,
    migrationOrder: 1,
    dataBridgeEntity: 'Student',
    collectionVersion: 'C25061',
  },
  {
    name: 'Engagement',
    hesaRef: 'ENG',
    description: 'Links a student to an institution for a period of study. Contains engagement start/end dates and reason for ending',
    mandatory: true,
    migrationOrder: 2,
    dataBridgeEntity: 'Enrolment',
    collectionVersion: 'C25061',
  },
  {
    name: 'StudentCourseSession',
    hesaRef: 'SCS',
    description: 'Programme-level data: qualification aim, HECoS subjects, mode, FTE, funding body, year of study',
    mandatory: true,
    migrationOrder: 3,
    dataBridgeEntity: 'Programme',
    collectionVersion: 'C25061',
  },
  {
    name: 'Module',
    hesaRef: 'MOD',
    description: 'Module definition: identifier, title, HECoS subject, credit value and FHEQ credit level',
    mandatory: false,
    migrationOrder: 4,
    dataBridgeEntity: 'Module',
    collectionVersion: 'C25061',
  },
  {
    name: 'StudentModuleInstance',
    hesaRef: 'SMI',
    description: 'Student-level module result: mark, grade, credit achieved, result',
    mandatory: false,
    migrationOrder: 5,
    dataBridgeEntity: 'ModuleResult',
    collectionVersion: 'C25061',
  },
  {
    name: 'Leaver',
    hesaRef: 'LEA',
    description: 'Destination data for students who left during the collection period. Links to Graduate Outcomes',
    mandatory: false,
    migrationOrder: 6,
    dataBridgeEntity: 'LeaverRecord',
    collectionVersion: 'C25061',
  },
  {
    name: 'EntryProfile',
    hesaRef: 'ENP',
    description: 'Entry qualifications held at point of entry. QUALENT3 codes, prior education, domicile at application',
    mandatory: false,
    migrationOrder: 7,
    dataBridgeEntity: 'EntryQualification',
    collectionVersion: 'C25061',
  },
  {
    name: 'InstancePeriod',
    hesaRef: 'INP',
    description: 'Period of study within the academic year. Location of study, teaching institution for franchised provision',
    mandatory: false,
    migrationOrder: 8,
    dataBridgeEntity: 'StudyPeriod',
    collectionVersion: 'C25061',
  },
];

export const MANDATORY_HESA_ENTITIES = HESA_ENTITIES
  .filter(e => e.mandatory)
  .map(e => e.name);

export const HESA_MIGRATION_ORDER = [...HESA_ENTITIES]
  .sort((a, b) => a.migrationOrder - b.migrationOrder)
  .map(e => e.name);

/** Back-compat aliases (legacy flat-file shape consumed by profile.ts). */
export type HesaTdpEntity = HesaEntityName;
export const HESA_TDP_ENTITIES = HESA_ENTITIES;
