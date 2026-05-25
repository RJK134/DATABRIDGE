/**
 * Canonical entity registry — DATABRIDGE's source-agnostic data model.
 * Derived from UCISA HERM and harmonised with HESA Data Futures.
 *
 * Adapters map FROM source shapes INTO these entities; profile packs map
 * FROM these entities INTO target shapes.
 */
export * from './student.js';
export * from './engagement.js';
export * from './student-course-session.js';
export * from './module.js';
export * from './leaver.js';
export * from './entry-profile.js';
export * from './instance.js';
export * from './study-location.js';
export * from './ses.js';
export * from './disability.js';
export * from './qualification-awarded.js';
export * from './supervisor-allocation.js';
export * from './termtime-accommodation.js';

import { StudentZ } from './student.js';
import { EngagementZ } from './engagement.js';
import { StudentCourseSessionZ } from './student-course-session.js';
import { ModuleZ, ModuleInstanceZ } from './module.js';
import { LeaverZ } from './leaver.js';
import { EntryProfileZ } from './entry-profile.js';
import { InstanceZ } from './instance.js';
import { StudyLocationZ } from './study-location.js';
import { SesZ } from './ses.js';
import { DisabilityZ } from './disability.js';
import { QualificationAwardedZ } from './qualification-awarded.js';
import { SupervisorAllocationZ } from './supervisor-allocation.js';
import { TermtimeAccommodationZ } from './termtime-accommodation.js';

/** Names of all canonical entities. */
export const CANONICAL_ENTITY_NAMES = [
  'Student',
  'Engagement',
  'StudentCourseSession',
  'Module',
  'ModuleInstance',
  'Leaver',
  'EntryProfile',
  'Instance',
  'StudyLocation',
  'SES',
  'Disability',
  'QualificationAwarded',
  'SupervisorAllocation',
  'TermtimeAccommodation',
] as const;

export type CanonicalEntityName = (typeof CANONICAL_ENTITY_NAMES)[number];

/** Registry mapping canonical entity name → zod schema. */
export const CANONICAL_SCHEMAS = {
  Student: StudentZ,
  Engagement: EngagementZ,
  StudentCourseSession: StudentCourseSessionZ,
  Module: ModuleZ,
  ModuleInstance: ModuleInstanceZ,
  Leaver: LeaverZ,
  EntryProfile: EntryProfileZ,
  Instance: InstanceZ,
  StudyLocation: StudyLocationZ,
  SES: SesZ,
  Disability: DisabilityZ,
  QualificationAwarded: QualificationAwardedZ,
  SupervisorAllocation: SupervisorAllocationZ,
  TermtimeAccommodation: TermtimeAccommodationZ,
} as const;
