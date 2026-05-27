/**
 * Demo fixtures + canned NL→rule prompts wired into the query bar.
 *
 * The web app does not load the full apps/demo/fixtures/*.json datasets
 * (~2k rows each) — instead it ships a representative slice per fixture
 * so the query bar can show non-zero findings without a backend dataset
 * upload. Production deployments load the live tenant data via a
 * separate route.
 *
 * The canned prompts mirror the corpus entries in
 * packages/rule-compiler-llm/src/__tests__/corpus.json so the
 * deterministic mock provider compiles them into the same rules used
 * by the regression suite.
 */

export type DemoFixtureId =
  | "banner-r2t-2024"
  | "sits-southcoast-2024"
  | "salesforce-edu-westmidlands"
  | "dynamics365-edu-northpennines";

export interface DemoFixtureSample {
  label: string;
  source: "banner" | "sits" | "salesforce-edu" | "dynamics365-edu";
  rows: Array<Record<string, string | number | boolean | null>>;
}

export const DEMO_FIXTURES: Record<DemoFixtureId, DemoFixtureSample> = {
  "banner-r2t-2024": {
    label: "Banner — Round 2 Trent 2024",
    source: "banner",
    rows: [
      { SPRIDEN_PIDM: 100001, SPRIDEN_ID: "S0100001", SPRIDEN_LAST_NAME: "Smith", SGBSTDN_MAJR_CODE_1: "CS" },
      { SPRIDEN_PIDM: 100002, SPRIDEN_ID: "S0100002", SPRIDEN_LAST_NAME: null, SGBSTDN_MAJR_CODE_1: "CS" },
      { SPRIDEN_PIDM: 100003, SPRIDEN_ID: "S0100003", SPRIDEN_LAST_NAME: "Jones", SGBSTDN_MAJR_CODE_1: "XX_LEGACY" },
      { SPRIDEN_PIDM: 100004, SPRIDEN_ID: "S0100004", SPRIDEN_LAST_NAME: "Williams", SGBSTDN_MAJR_CODE_1: "EE" },
      { SPRIDEN_PIDM: 100005, SPRIDEN_ID: "S0100005", SPRIDEN_LAST_NAME: "Brown", SGBSTDN_MAJR_CODE_1: "XX_LEGACY" },
    ],
  },
  "sits-southcoast-2024": {
    label: "SITS — South Coast University 2024/25",
    source: "sits",
    rows: [
      { STU_CODE: "S0100001", STU_HUSID: "1234567890123", STU_SURN: "Smith", SCE_AYR: "2024/25", SCE_POS: "CS" },
      { STU_CODE: "S0100002", STU_HUSID: null, STU_SURN: "Jones", SCE_AYR: "2024/25", SCE_POS: "ZZ" },
      { STU_CODE: "S0100003", STU_HUSID: "1234567890124", STU_SURN: null, SCE_AYR: "2024/25", SCE_POS: "CS" },
      { STU_CODE: "S0100004", STU_HUSID: "1234567890125", STU_SURN: "Davies", SCE_AYR: "2024/25", SCE_POS: "ZZ" },
      { STU_CODE: "S0100005", STU_HUSID: "1234567890126", STU_SURN: "Evans", SCE_AYR: "2024/25", SCE_POS: "EE" },
    ],
  },
  "salesforce-edu-westmidlands": {
    label: "Salesforce Education Cloud — West Midlands",
    source: "salesforce-edu",
    rows: [
      { Id: "001a", Email: "alice@uni.example", hed__FERPA__c: "Granted", HasOptedOutOfEmail: true },
      { Id: "001b", Email: "shared.contact@uni.example", hed__FERPA__c: "Granted", HasOptedOutOfEmail: false },
      { Id: "001c", Email: "shared.contact@uni.example", hed__FERPA__c: "Withheld", HasOptedOutOfEmail: false },
      { Id: "001d", Email: "dave@uni.example", hed__FERPA__c: "Granted", HasOptedOutOfEmail: true },
      { Id: "001e", Email: "eve@uni.example", hed__FERPA__c: "Withheld", HasOptedOutOfEmail: false },
    ],
  },
  "dynamics365-edu-northpennines": {
    label: "Dynamics 365 Education — North Pennines",
    source: "dynamics365-edu",
    rows: [
      { contactid: "cnt-1", emailaddress1: "alice@uni.example", donotbulkemail: false },
      { contactid: "cnt-2", emailaddress1: "shared.contact@uni.example", donotbulkemail: true },
      { contactid: "cnt-3", emailaddress1: "shared.contact@uni.example", donotbulkemail: true },
      { contactid: "cnt-4", emailaddress1: "dave@uni.example", donotbulkemail: false },
      { contactid: "cnt-5", emailaddress1: "eve@uni.example", donotbulkemail: true },
    ],
  },
};

/** Prompt definition the query bar offers as shortcuts. */
export interface PromptDef {
  /** Button label. */
  label: string;
  /** Exact NL string posted to /v1/rules:compile. */
  nl: string;
  /** Canned LLM response — mirrors the corpus expectations so the
   *  deterministic mock provider can compile it. */
  expectedRule: Record<string, unknown>;
}

export const PROMPT_LIBRARY: PromptDef[] = [
  {
    label: "Salesforce — shared placeholder email",
    nl: "contacts with the placeholder shared email",
    expectedRule: {
      id: "contacts-shared-email",
      entity: "Contact",
      name: "Contacts with shared placeholder email",
      description: "Salesforce Contacts whose Email is the shared placeholder.",
      severity: "ERROR",
      tags: ["crm", "identity"],
      messageTemplate: "Contact {{Id}} has shared placeholder email",
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "Contact", field: "Email" },
        operands: [{ kind: "literal", value: "shared.contact@uni.example" }],
      },
    },
  },
  {
    label: "Salesforce — FERPA withheld but not opted out",
    nl: "contacts with FERPA withheld but not opted out of email",
    expectedRule: {
      id: "contacts-ferpa-mismatch",
      entity: "Contact",
      name: "FERPA withheld but not opted out",
      description: "Salesforce Contacts whose hed__FERPA__c is Withheld but HasOptedOutOfEmail is false.",
      severity: "ERROR",
      tags: ["crm", "privacy"],
      messageTemplate: "Contact {{Id}} has FERPA Withheld but is not opted out",
      where: {
        kind: "and",
        clauses: [
          {
            kind: "predicate",
            op: "eq",
            field: { kind: "field", entity: "Contact", field: "hed__FERPA__c" },
            operands: [{ kind: "literal", value: "Withheld" }],
          },
          {
            kind: "predicate",
            op: "eq",
            field: { kind: "field", entity: "Contact", field: "HasOptedOutOfEmail" },
            operands: [{ kind: "literal", value: false }],
          },
        ],
      },
    },
  },
  {
    label: "Banner — legacy XX_LEGACY major code",
    nl: "banner students whose major code is XX_LEGACY",
    expectedRule: {
      id: "banner-major-legacy",
      entity: "BannerStudent",
      name: "Banner students on legacy XX_LEGACY major",
      description: "Banner students whose SGBSTDN_MAJR_CODE_1 is XX_LEGACY.",
      severity: "WARN",
      tags: ["banner", "codeset-drift"],
      messageTemplate: "Banner student {{SPRIDEN_PIDM}} has legacy major XX_LEGACY",
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "BannerStudent", field: "SGBSTDN_MAJR_CODE_1" },
        operands: [{ kind: "literal", value: "XX_LEGACY" }],
      },
    },
  },
  {
    label: "SITS — missing HUSID",
    nl: "sits students whose husid is null",
    expectedRule: {
      id: "sits-missing-husid",
      entity: "SitsStudent",
      name: "SITS students missing STU_HUSID",
      description: "SITS students whose STU_HUSID is null.",
      severity: "WARN",
      tags: ["sits", "identity"],
      messageTemplate: "SITS student {{STU_CODE}} is missing STU_HUSID",
      where: {
        kind: "predicate",
        op: "isNull",
        field: { kind: "field", entity: "SitsStudent", field: "STU_HUSID" },
        operands: [],
      },
    },
  },
  {
    label: "Dynamics — opted-out contacts",
    nl: "dataverse contacts with donotbulkemail true",
    expectedRule: {
      id: "dataverse-bulk-optout",
      entity: "DataverseContact",
      name: "Dataverse contacts opted out of bulk email",
      description: "Dataverse contact rows with donotbulkemail = true.",
      severity: "INFO",
      tags: ["crm", "privacy"],
      messageTemplate: "Contact {{contactid}} is opted out of bulk email",
      where: {
        kind: "predicate",
        op: "eq",
        field: { kind: "field", entity: "DataverseContact", field: "donotbulkemail" },
        operands: [{ kind: "literal", value: true }],
      },
    },
  },
];
