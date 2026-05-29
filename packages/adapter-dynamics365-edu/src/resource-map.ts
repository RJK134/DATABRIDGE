/**
 * Canonical resource → Dataverse entity logical name + plural name.
 *
 * Dynamics 365 Education (msdyn_ namespace + the core CRM entities) covers
 * student persona, programmes, courses, instances, and enrolments.
 */

export const SUPPORTED_RESOURCES = [
  "Contact",
  "Account",
  "Program",
  "CourseInstance",
  "StudentProgram",
  "Course",
] as const;
export type SupportedResource = (typeof SUPPORTED_RESOURCES)[number];

/** Logical name (singular) — used by EntityDefinitions describe. */
export const RESOURCE_TO_LOGICAL: Record<SupportedResource, string> = {
  Contact: "contact",
  Account: "account",
  Program: "msdyn_program",
  CourseInstance: "msdyn_courseinstance",
  StudentProgram: "msdyn_studentprogram",
  Course: "msdyn_course",
};

/** Plural set name (used in OData query path). */
export const RESOURCE_TO_SET: Record<SupportedResource, string> = {
  Contact: "contacts",
  Account: "accounts",
  Program: "msdyn_programs",
  CourseInstance: "msdyn_courseinstances",
  StudentProgram: "msdyn_studentprograms",
  Course: "msdyn_courses",
};

/** Primary key attribute name (Dataverse uses entity-prefixed GUIDs). */
export const RESOURCE_TO_PK: Record<SupportedResource, string> = {
  Contact: "contactid",
  Account: "accountid",
  Program: "msdyn_programid",
  CourseInstance: "msdyn_courseinstanceid",
  StudentProgram: "msdyn_studentprogramid",
  Course: "msdyn_courseid",
};

/** Default $select clause per resource. */
export const RESOURCE_TO_SELECT: Record<SupportedResource, string> = {
  Contact:
    "contactid,firstname,lastname,emailaddress1,birthdate,parentcustomerid_account,msdyn_studentid,statecode",
  Account: "accountid,name,accountclassificationcode,statecode",
  Program:
    "msdyn_programid,msdyn_name,msdyn_programstatus,msdyn_startdate,msdyn_enddate,msdyn_account",
  CourseInstance: "msdyn_courseinstanceid,msdyn_name,msdyn_course,msdyn_startdate,msdyn_enddate",
  StudentProgram:
    "msdyn_studentprogramid,msdyn_student,msdyn_program,msdyn_status,msdyn_startdate,msdyn_enddate",
  Course: "msdyn_courseid,msdyn_name,msdyn_account,msdyn_creditpoints",
};

export function isSupportedResource(name: string): name is SupportedResource {
  return (SUPPORTED_RESOURCES as readonly string[]).includes(name);
}
