/**
 * A minimal dictionary surface the compiler uses to validate that every
 * field reference emitted by the LLM exists in the canonical model.
 *
 * The dictionary is provided by the caller — typically built from the
 * canonical entity registry plus per-tenant extensions. We keep the
 * shape narrow so it can be assembled in tests without dragging in the
 * full canonical zod schemas.
 */
export interface DictionaryField {
  entity: string;
  field: string;
  /** Optional type hint — `string | number | boolean | date | codelist`. */
  type?: string;
  /** Optional codelist id for codelist-typed fields. */
  codelistId?: string;
}

export interface RuleDictionary {
  fields: ReadonlyArray<DictionaryField>;
}

/** Build a lookup index keyed by `entity.field`. */
export function indexDictionary(d: RuleDictionary): Map<string, DictionaryField> {
  const m = new Map<string, DictionaryField>();
  for (const f of d.fields) m.set(`${f.entity}.${f.field}`, f);
  return m;
}

/**
 * Bundled minimal dictionary — covers the canonical entities the demo
 * harness exercises. Used as the default when a caller doesn't supply
 * one. The bundle is intentionally lightweight; full per-tenant
 * dictionaries arrive at runtime via the API.
 */
export const DEMO_DICTIONARY: RuleDictionary = {
  fields: [
    // Student
    { entity: "Student", field: "id", type: "string" },
    { entity: "Student", field: "sourceId", type: "string" },
    { entity: "Student", field: "husid", type: "string" },
    { entity: "Student", field: "firstName", type: "string" },
    { entity: "Student", field: "lastName", type: "string" },
    { entity: "Student", field: "dateOfBirth", type: "date" },
    { entity: "Student", field: "sexId", type: "codelist", codelistId: "HESA.SEXID" },
    { entity: "Student", field: "ethnicity", type: "codelist", codelistId: "HESA.ETHNIC" },
    { entity: "Student", field: "feeStatus", type: "codelist", codelistId: "HESA.FEESTATUS" },
    { entity: "Student", field: "email", type: "string" },
    // Engagement / Enrolment
    { entity: "Engagement", field: "id", type: "string" },
    { entity: "Engagement", field: "studentId", type: "string" },
    { entity: "Engagement", field: "programmeCode", type: "string" },
    { entity: "Engagement", field: "modeOfStudy", type: "codelist", codelistId: "HESA.MODE" },
    { entity: "Engagement", field: "startDate", type: "date" },
    { entity: "Engagement", field: "endDate", type: "date" },
    { entity: "Engagement", field: "collectionYear", type: "string" },
    { entity: "Engagement", field: "campusCode", type: "string" },
    { entity: "Engagement", field: "termCode", type: "string" },
    // Module
    { entity: "Module", field: "id", type: "string" },
    { entity: "Module", field: "code", type: "string" },
    { entity: "Module", field: "title", type: "string" },
    { entity: "Module", field: "credits", type: "number" },
    { entity: "Module", field: "level", type: "codelist", codelistId: "HESA.CLEVEL" },
    // CRM (Salesforce-shaped)
    { entity: "Contact", field: "Id", type: "string" },
    { entity: "Contact", field: "FirstName", type: "string" },
    { entity: "Contact", field: "LastName", type: "string" },
    { entity: "Contact", field: "Email", type: "string" },
    { entity: "Contact", field: "hed__FERPA__c", type: "codelist", codelistId: "HED.FERPA" },
    { entity: "Contact", field: "HasOptedOutOfEmail", type: "boolean" },
    // CRM (Dynamics-shaped)
    { entity: "DataverseContact", field: "contactid", type: "string" },
    { entity: "DataverseContact", field: "emailaddress1", type: "string" },
    { entity: "DataverseContact", field: "msdyn_studentid", type: "string" },
    { entity: "DataverseContact", field: "donotbulkemail", type: "boolean" },
    { entity: "DataverseContact", field: "donotemail", type: "boolean" },
    // Banner-shaped
    { entity: "BannerStudent", field: "SPRIDEN_PIDM", type: "number" },
    { entity: "BannerStudent", field: "SPRIDEN_ID", type: "string" },
    { entity: "BannerStudent", field: "SPRIDEN_LAST_NAME", type: "string" },
    { entity: "BannerStudent", field: "SGBSTDN_MAJR_CODE_1", type: "string" },
    { entity: "BannerStudent", field: "SGBSTDN_TERM_CODE_EFF", type: "string" },
    // SITS-shaped
    { entity: "SitsStudent", field: "STU_CODE", type: "string" },
    { entity: "SitsStudent", field: "STU_HUSID", type: "string" },
    { entity: "SitsStudent", field: "STU_SURN", type: "string" },
    { entity: "SitsStudent", field: "SCE_AYR", type: "string" },
    { entity: "SitsStudent", field: "SCE_POS", type: "string" },
    // Workday-shaped
    { entity: "WorkdayStudent", field: "Student_ID", type: "string" },
    { entity: "WorkdayStudent", field: "Legal_Name", type: "string" },
    { entity: "WorkdayStudent", field: "Active_Status", type: "string" },
    // TechOne-shaped
    { entity: "TechOneInvoice", field: "InvoiceId", type: "string" },
    { entity: "TechOneInvoice", field: "Amount", type: "number" },
    { entity: "TechOneInvoice", field: "Status", type: "string" },
  ],
};
