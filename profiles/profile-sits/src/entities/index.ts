/**
 * SITS canonical entity map — 21 primary entities.
 * Derived from SITS:Vision data model documentation and HESA SITS mapping guides.
 * Dependency order matches the 21-entity migration sequence in DESIGN.md §8.
 */

export type SitsEntityKey =
  | "AwardBody"
  | "Faculty"
  | "Department"
  | "Programme"
  | "Module"
  | "Location"
  | "AcademicYear"
  | "Person"
  | "Student"
  | "Applicant"
  | "Staff"
  | "Enrolment"
  | "ModuleRegistration"
  | "Assessment"
  | "Award"
  | "Finance"
  | "Accommodation"
  | "Disability"
  | "Ethnicity"
  | "Nationality"
  | "AgentRelationship";

export interface SitsEntity {
  key: SitsEntityKey;
  /** Primary SITS table(s) that back this entity */
  sitsTables: string[];
  /** HESA entity mapping reference (if applicable) */
  hesaEntityRef?: string;
  /** Whether this entity must be migrated before dependents */
  migrationOrder: number;
  description: string;
}

export const SITS_ENTITIES: Record<SitsEntityKey, SitsEntity> = {
  AwardBody: {
    key: "AwardBody",
    sitsTables: ["AWB"],
    migrationOrder: 1,
    description: "Awarding bodies and validating institutions"
  },
  Faculty: {
    key: "Faculty",
    sitsTables: ["FAC"],
    migrationOrder: 2,
    description: "Faculty organisational units"
  },
  Department: {
    key: "Department",
    sitsTables: ["DPT"],
    migrationOrder: 3,
    description: "Department / school organisational units"
  },
  Programme: {
    key: "Programme",
    sitsTables: ["POS", "MAR", "PRG"],
    hesaEntityRef: "COURSE",
    migrationOrder: 4,
    description: "Programme of study (course) definitions"
  },
  Module: {
    key: "Module",
    sitsTables: ["MOD", "MAV"],
    hesaEntityRef: "MODULE",
    migrationOrder: 5,
    description: "Module definitions and version catalogue"
  },
  Location: {
    key: "Location",
    sitsTables: ["LOC"],
    hesaEntityRef: "CAMPUSLOC",
    migrationOrder: 6,
    description: "Campus and delivery locations"
  },
  AcademicYear: {
    key: "AcademicYear",
    sitsTables: ["AYR"],
    migrationOrder: 7,
    description: "Academic year definitions"
  },
  Person: {
    key: "Person",
    sitsTables: ["PRS"],
    migrationOrder: 8,
    description: "Core person record (PII anchor)"
  },
  Student: {
    key: "Student",
    sitsTables: ["STU"],
    hesaEntityRef: "STUDENT",
    migrationOrder: 9,
    description: "Student record — extends Person"
  },
  Applicant: {
    key: "Applicant",
    sitsTables: ["APP", "APL"],
    migrationOrder: 10,
    description: "Applicant records (pre-enrolment)"
  },
  Staff: {
    key: "Staff",
    sitsTables: ["STF"],
    migrationOrder: 11,
    description: "Staff records"
  },
  Enrolment: {
    key: "Enrolment",
    sitsTables: ["SRS", "SMR"],
    hesaEntityRef: "INSTANCE",
    migrationOrder: 12,
    description: "Student route / enrolment instance"
  },
  ModuleRegistration: {
    key: "ModuleRegistration",
    sitsTables: ["SMO"],
    hesaEntityRef: "MODULEREGISTRATION",
    migrationOrder: 13,
    description: "Student module occurrence registrations"
  },
  Assessment: {
    key: "Assessment",
    sitsTables: ["SAM", "SAS"],
    migrationOrder: 14,
    description: "Assessment marks and results"
  },
  Award: {
    key: "Award",
    sitsTables: ["SAW"],
    hesaEntityRef: "QUALIFICATION",
    migrationOrder: 15,
    description: "Student awards and qualifications"
  },
  Finance: {
    key: "Finance",
    sitsTables: ["SFE", "SFR"],
    migrationOrder: 16,
    description: "Student finance and fee liability records"
  },
  Accommodation: {
    key: "Accommodation",
    sitsTables: ["SAC"],
    migrationOrder: 17,
    description: "Student accommodation records"
  },
  Disability: {
    key: "Disability",
    sitsTables: ["SDA"],
    hesaEntityRef: "DISABILITY",
    migrationOrder: 18,
    description: "Student disability declarations"
  },
  Ethnicity: {
    key: "Ethnicity",
    sitsTables: ["SIT_ETH"],
    migrationOrder: 19,
    description: "Student ethnicity declarations"
  },
  Nationality: {
    key: "Nationality",
    sitsTables: ["SIT_NAT"],
    migrationOrder: 20,
    description: "Student nationality and domicile records"
  },
  AgentRelationship: {
    key: "AgentRelationship",
    sitsTables: ["AGT"],
    migrationOrder: 21,
    description: "Student–agent relationships (international recruitment)"
  }
};
