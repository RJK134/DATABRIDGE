/**
 * Canonical entity registry — DATABRIDGE's source-agnostic data model.
 * Derived from UCISA HERM and harmonised with HESA Data Futures.
 *
 * Adapters map FROM source shapes INTO these entities; profile packs map
 * FROM these entities INTO target shapes.
 *
 * Phase G extends the original HESA-Data-Futures-shaped set with the
 * provenance primitives and broader HERM entity coverage described in
 * SITS_BANNER_CROSSWALK.md §3.
 */

// Provenance primitives — must export before entities that consume them.
export * from "./provenance.js";

// Original Phase F entity set.
export * from "./student.js";
export * from "./engagement.js";
export * from "./student-course-session.js";
export * from "./module.js";
export * from "./leaver.js";
export * from "./entry-profile.js";
export * from "./instance.js";
export * from "./study-location.js";
export * from "./ses.js";
export * from "./disability.js";
export * from "./qualification-awarded.js";
export * from "./supervisor-allocation.js";
export * from "./termtime-accommodation.js";

// Phase G additions.
export * from "./contact.js";
export * from "./programme.js";
export * from "./enrolment.js";
export * from "./admissions.js";
export * from "./student-account.js";
export * from "./academic-record.js";

import { StudentZ } from "./student.js";
import { EngagementZ } from "./engagement.js";
import { StudentCourseSessionZ } from "./student-course-session.js";
import { ModuleZ, ModuleInstanceZ } from "./module.js";
import { LeaverZ } from "./leaver.js";
import { EntryProfileZ } from "./entry-profile.js";
import { InstanceZ } from "./instance.js";
import { StudyLocationZ } from "./study-location.js";
import { SesZ } from "./ses.js";
import { DisabilityZ } from "./disability.js";
import { QualificationAwardedZ } from "./qualification-awarded.js";
import { SupervisorAllocationZ } from "./supervisor-allocation.js";
import { TermtimeAccommodationZ } from "./termtime-accommodation.js";
import { AddressZ, EmailAddressZ, PhoneZ } from "./contact.js";
import { ProgrammeZ, ProgrammeEnrolmentZ, AcademicYearEnrolmentZ } from "./programme.js";
import { ModuleEnrolmentZ, ModuleResultZ, AssessmentResultZ } from "./enrolment.js";
import {
  ApplicationZ,
  ApplicationDecisionZ,
  VisaRecordZ,
  CasVisaZ,
  SevisVisaZ,
} from "./admissions.js";
import { StudentAccountZ, ChargeZ, PaymentZ, SponsorZ } from "./student-account.js";
import {
  HoldZ,
  AdvisorZ,
  TransferCreditZ,
  RecognisedPriorLearningZ,
  TermGPAZ,
  TestScoreZ,
  StatutoryReturnZ,
} from "./academic-record.js";

/** Names of all canonical entities. */
export const CANONICAL_ENTITY_NAMES = [
  // Phase F set
  "Student",
  "Engagement",
  "StudentCourseSession",
  "Module",
  "ModuleInstance",
  "Leaver",
  "EntryProfile",
  "Instance",
  "StudyLocation",
  "SES",
  "Disability",
  "QualificationAwarded",
  "SupervisorAllocation",
  "TermtimeAccommodation",
  // Phase G additions
  "Address",
  "EmailAddress",
  "Phone",
  "Programme",
  "ProgrammeEnrolment",
  "AcademicYearEnrolment",
  "ModuleEnrolment",
  "ModuleResult",
  "AssessmentResult",
  "Application",
  "ApplicationDecision",
  "VisaRecord",
  "StudentAccount",
  "Charge",
  "Payment",
  "Sponsor",
  "Hold",
  "Advisor",
  "TransferCredit",
  "RecognisedPriorLearning",
  "TermGPA",
  "TestScore",
  "StatutoryReturn",
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
  // Phase G
  Address: AddressZ,
  EmailAddress: EmailAddressZ,
  Phone: PhoneZ,
  Programme: ProgrammeZ,
  ProgrammeEnrolment: ProgrammeEnrolmentZ,
  AcademicYearEnrolment: AcademicYearEnrolmentZ,
  ModuleEnrolment: ModuleEnrolmentZ,
  ModuleResult: ModuleResultZ,
  AssessmentResult: AssessmentResultZ,
  Application: ApplicationZ,
  ApplicationDecision: ApplicationDecisionZ,
  VisaRecord: VisaRecordZ,
  StudentAccount: StudentAccountZ,
  Charge: ChargeZ,
  Payment: PaymentZ,
  Sponsor: SponsorZ,
  Hold: HoldZ,
  Advisor: AdvisorZ,
  TransferCredit: TransferCreditZ,
  RecognisedPriorLearning: RecognisedPriorLearningZ,
  TermGPA: TermGPAZ,
  TestScore: TestScoreZ,
  StatutoryReturn: StatutoryReturnZ,
} as const;

// Re-exported for convenience.
export { CasVisaZ, SevisVisaZ };
