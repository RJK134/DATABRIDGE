/**
 * Banner canonical entity map.
 *
 * Sourced from BANNER_DATA_STRUCTURES.md §3 (student core) and §9
 * (validation tables). Migration order matches the topological order
 * imposed by Banner foreign-key dependencies — STVMAJR / STVCAMP before
 * SGBSTDN, SPRIDEN before any record that references PIDM, etc.
 */
export type BannerEntityKey =
  | "Spriden"
  | "StvMajr"
  | "StvCamp"
  | "StvDegc"
  | "StvTerm"
  | "Sgbstdn"
  | "Sorlcur"
  | "Sorlfos"
  | "Shrtgpa"
  | "Shrtckg"
  | "Sfrstcr"
  | "Ssbsect"
  | "Shrdgmr";

export interface BannerEntity {
  key: BannerEntityKey;
  /** Primary Banner table that backs this entity. */
  bannerTables: string[];
  /** SITS counterpart referenced by the bidirectional mapping (if any). */
  sitsCounterpart?: string;
  /** Order in which this entity must be migrated when targeting Banner. */
  migrationOrder: number;
  description: string;
}

export const BANNER_ENTITIES: Record<BannerEntityKey, BannerEntity> = {
  Spriden: {
    key: "Spriden",
    bannerTables: ["SPRIDEN"],
    sitsCounterpart: "STU",
    migrationOrder: 1,
    description:
      "Banner identity table — one row per person, anchored by SPRIDEN_PIDM (internal surrogate) and SPRIDEN_ID (institutional id).",
  },
  StvMajr: {
    key: "StvMajr",
    bannerTables: ["STVMAJR"],
    sitsCounterpart: "POS",
    migrationOrder: 2,
    description:
      "Banner major/programme validation table. Each STVMAJR_CODE is a canonical programme code referenced by SGBSTDN / SORLFOS.",
  },
  StvCamp: {
    key: "StvCamp",
    bannerTables: ["STVCAMP"],
    sitsCounterpart: "CAM",
    migrationOrder: 2,
    description:
      "Banner campus validation table — referenced by SGBSTDN_CAMP_CODE and SORLCUR_CAMP_CODE.",
  },
  StvDegc: {
    key: "StvDegc",
    bannerTables: ["STVDEGC"],
    migrationOrder: 2,
    description: "Banner degree code validation — feeds SHRDGMR_DEGC_CODE on award.",
  },
  StvTerm: {
    key: "StvTerm",
    bannerTables: ["STVTERM"],
    sitsCounterpart: "AYR",
    migrationOrder: 2,
    description:
      "Banner term validation table — primary key for SHRTGPA, SFRSTCR, SSBSECT, SGBSTDN.",
  },
  Sgbstdn: {
    key: "Sgbstdn",
    bannerTables: ["SGBSTDN"],
    sitsCounterpart: "SCE",
    migrationOrder: 3,
    description:
      "General student record — effective-dated. One row per term-effective programme assignment.",
  },
  Sorlcur: {
    key: "Sorlcur",
    bannerTables: ["SORLCUR"],
    sitsCounterpart: "SCE",
    migrationOrder: 4,
    description: "Student curriculum learner — supports multi-curriculum, priority-numbered.",
  },
  Sorlfos: {
    key: "Sorlfos",
    bannerTables: ["SORLFOS"],
    sitsCounterpart: "SCJ",
    migrationOrder: 5,
    description:
      "Student field of study — pairs with SORLCUR to express major/minor/concentration.",
  },
  Shrtgpa: {
    key: "Shrtgpa",
    bannerTables: ["SHRTGPA"],
    sitsCounterpart: "STA",
    migrationOrder: 6,
    description: "Term-level GPA summary — one row per PIDM/term, drives transcript projection.",
  },
  Shrtckg: {
    key: "Shrtckg",
    bannerTables: ["SHRTCKG"],
    sitsCounterpart: "SAS",
    migrationOrder: 6,
    description: "Term-level grade-by-class breakdown — feeds component mark capture.",
  },
  Sfrstcr: {
    key: "Sfrstcr",
    bannerTables: ["SFRSTCR"],
    sitsCounterpart: "SMR",
    migrationOrder: 7,
    description: "Student course registration — current term enrolment status per CRN.",
  },
  Ssbsect: {
    key: "Ssbsect",
    bannerTables: ["SSBSECT"],
    sitsCounterpart: "MAV",
    migrationOrder: 7,
    description: "Section / class — one row per CRN per term.",
  },
  Shrdgmr: {
    key: "Shrdgmr",
    bannerTables: ["SHRDGMR"],
    sitsCounterpart: "AWD",
    migrationOrder: 8,
    description:
      "Degree award master — conferred awards including UK classification on INST_HONOR.",
  },
};
