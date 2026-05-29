/**
 * Canonical resource → Salesforce Education Cloud SObject mapping.
 *
 * Education Cloud (formerly HEDA / hed__) stores higher-ed objects under
 * the `hed__` namespace. Contact / Account remain standard SObjects with
 * Education Cloud-specific picklist values.
 */

export const SUPPORTED_RESOURCES = [
  "Contact",
  "Account",
  "ProgramPlan",
  "Affiliation",
  "CourseEnrollment",
  "Course",
] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

/** Canonical resource → SObject API name. */
export const RESOURCE_TO_SOBJECT: Record<SupportedResource, string> = {
  Contact: "Contact",
  Account: "Account",
  ProgramPlan: "hed__Program_Plan__c",
  Affiliation: "hed__Affiliation__c",
  CourseEnrollment: "hed__Course_Enrollment__c",
  Course: "hed__Course__c",
};

/** Canonical resource → SObject primary key field. */
export const RESOURCE_TO_PK: Record<SupportedResource, string> = {
  Contact: "Id",
  Account: "Id",
  ProgramPlan: "Id",
  Affiliation: "Id",
  CourseEnrollment: "Id",
  Course: "Id",
};

/** Default SOQL select clause per resource — enough to populate audit-pack rules. */
export const RESOURCE_TO_SELECT: Record<SupportedResource, string> = {
  Contact:
    "Id, FirstName, LastName, Email, Birthdate, AccountId, hed__Primary_Affiliation__c, hed__Citizenship__c, hed__FERPA__c",
  Account: "Id, Name, Type, RecordTypeId, hed__Education_Level__c",
  ProgramPlan:
    "Id, Name, hed__Account__c, hed__Status__c, hed__Start_Date__c, hed__End_Date__c, hed__Award_Type__c",
  Affiliation:
    "Id, Name, hed__Contact__c, hed__Account__c, hed__Status__c, hed__Role__c, hed__StartDate__c, hed__EndDate__c, hed__Primary__c",
  CourseEnrollment:
    "Id, Name, hed__Contact__c, hed__Course_Offering__c, hed__Status__c, hed__Grade__c, hed__Credits_Earned__c, hed__Program_Plan__c",
  Course: "Id, Name, hed__Account__c, hed__Course_ID__c, hed__Credit_Hours__c, hed__Description__c",
};

export function isSupportedResource(name: string): name is SupportedResource {
  return (SUPPORTED_RESOURCES as readonly string[]).includes(name);
}
