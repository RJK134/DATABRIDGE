/**
 * SQL queries for each SITS logical entity.
 * These target standard SITS:Vision read-only views.
 * All column aliases map to the canonical DataBridge SITS profile field IDs.
 */
export const SITS_ENTITY_QUERIES: Record<string, string> = {
  // ─ Student (PRS_STU + SCJ views) ──────────────────────────────────────────────
  Student: `
    SELECT
      ps.STU_CODE        AS "STU_CODE",
      ps.STU_FNAME       AS "FNAME",
      ps.STU_SNAME       AS "SNAME",
      ps.STU_DOB         AS "DOB",
      ps.STU_SEX         AS "SEX",
      ps.STU_NATION      AS "NATION",
      ps.STU_DOMICILE    AS "DOMICILE",
      ps.STU_ETHNIC      AS "ETHNIC",
      ps.STU_DISABLE     AS "DISABLE",
      ps.STU_HUSID       AS "HUSID",
      ps.STU_EMAIL       AS "EMAIL",
      ps.STU_UKPRN       AS "UKPRN",
      ps.STU_STATUS      AS "STATUS"
    FROM PRS_STU ps
    WHERE ps.STU_STATUS NOT IN ('D')
  `,

  // ─ CourseInstance (CAM_CRS) ────────────────────────────────────────────────
  CourseInstance: `
    SELECT
      cc.CRS_CODE        AS "CRS_CODE",
      cc.CRS_IUSE        AS "IUSE",
      cc.CRS_YSTR        AS "YSTR",
      cc.CRS_YEND        AS "YEND",
      cc.CRS_TITL        AS "TITLE",
      cc.CRS_FACC        AS "FACC",
      cc.CRS_FOWN        AS "FOWN",
      cc.CRS_CRSTYP      AS "CRSTYP",
      cc.CRS_CLEV        AS "CLEV"
    FROM CAM_CRS cc
    WHERE cc.CRS_IUSE = 'Y'
  `,

  // ─ StudentCourseJoin (CAM_SCJ) ───────────────────────────────────────────────
  StudentCourseJoin: `
    SELECT
      scj.SCJ_SPRC       AS "SCJ_CODE",
      scj.SCJ_STU        AS "STU_CODE",
      scj.SCJ_CRS        AS "CRS_CODE",
      scj.SCJ_STUC       AS "STUC",
      scj.SCJ_COMS       AS "COMDATE",
      scj.SCJ_ENDS       AS "ENDDATE",
      scj.SCJ_STS        AS "STATUS",
      scj.SCJ_REND       AS "RSNEND",
      scj.SCJ_MODE       AS "MODE",
      scj.SCJ_FEEC       AS "MSTUFEE",
      scj.SCJ_LFLV       AS "FUNDLEV",
      scj.SCJ_GRFE       AS "GROSSFEE",
      scj.SCJ_STLA       AS "STULOAD"
    FROM CAM_SCJ scj
    WHERE scj.SCJ_STS NOT IN ('D')
  `,

  // ─ Module (CAM_MOD) ───────────────────────────────────────────────────────
  Module: `
    SELECT
      cm.MOD_CODE        AS "MOD_CODE",
      cm.MOD_TITL        AS "TITLE",
      cm.MOD_CRED        AS "CREDITS",
      cm.MOD_LEVL        AS "LEVEL",
      cm.MOD_SUBJ        AS "SUBJECT",
      cm.MOD_IUSE        AS "IUSE"
    FROM CAM_MOD cm
    WHERE cm.MOD_IUSE = 'Y'
  `,

  // ─ ModuleInstance (CAM_MCI) ───────────────────────────────────────────────
  ModuleInstance: `
    SELECT
      mci.MCI_MOIN       AS "MOIN_CODE",
      mci.MCI_MOD        AS "MOD_CODE",
      mci.MCI_AYR        AS "AYR",
      mci.MCI_PSL        AS "PSL",
      mci.MCI_MPTS       AS "MAX_STUDENTS",
      mci.MCI_AVAI       AS "AVAI"
    FROM CAM_MCI mci
  `,

  // ─ StudentModuleResult (CAM_SMR) ─────────────────────────────────────────────
  StudentModuleResult: `
    SELECT
      smr.SMR_STU        AS "STU_CODE",
      smr.SMR_MOD        AS "MOD_CODE",
      smr.SMR_MOIN       AS "MOIN_CODE",
      smr.SMR_MARK       AS "MARK",
      smr.SMR_GRAD       AS "GRADE",
      smr.SMR_RSLT       AS "RESULT",
      smr.SMR_AGRP       AS "AGRP"
    FROM CAM_SMR smr
  `,

  // ─ AddressBook (PRS_ADR) ────────────────────────────────────────────────────
  Address: `
    SELECT
      pa.ADR_STU         AS "STU_CODE",
      pa.ADR_ADRT        AS "ADR_TYPE",
      pa.ADR_ADD1        AS "LINE1",
      pa.ADR_ADD2        AS "LINE2",
      pa.ADR_ADD3        AS "LINE3",
      pa.ADR_TOWN        AS "TOWN",
      pa.ADR_PCODE       AS "POSTCODE",
      pa.ADR_CNTY        AS "COUNTY",
      pa.ADR_CTRY        AS "COUNTRY"
    FROM PRS_ADR pa
    WHERE pa.ADR_ADRT IN ('H', 'T', 'P')
  `,

  // ─ ApplicationQualification (APL_APL / APL_QUA) ──────────────────────────
  Qualification: `
    SELECT
      aq.AQU_STU         AS "STU_CODE",
      aq.AQU_QUAL        AS "QUAL_CODE",
      aq.AQU_QLTL        AS "QUAL_TITLE",
      aq.AQU_GRDE        AS "GRADE",
      aq.AQU_SBCT        AS "SUBJECT",
      aq.AQU_YEAR        AS "YEAR"
    FROM APL_AQU aq
  `,
};
