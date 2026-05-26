/**
 * Mapping from canonical resource name → published RaaS report name.
 *
 * These names are what tenants typically publish; sites can override
 * via tenant config in future. For v1.2 the names are conventionally
 * fixed so the adapter can resolve them statically.
 *
 * Reference: docs/WORKDAY_RAAS_INTEGRATION.md §4 ("Recommended report
 * names").
 */
import type { SupportedResource } from "./adapter.js";

export const RAAS_REPORT_NAME: Record<SupportedResource, string> = {
  Students: "INT_DataBridge_Students",
  Academic_Programs_of_Study: "INT_DataBridge_AcademicProgramsOfStudy",
  Course_Sections: "INT_DataBridge_CourseSections",
  Academic_Periods: "INT_DataBridge_AcademicPeriods",
};

/** Primary key field on each resource's Report_Entry row. */
export const RAAS_REPORT_PK: Record<SupportedResource, string> = {
  Students: "Student_ID",
  Academic_Programs_of_Study: "Program_of_Study_ID",
  Course_Sections: "Course_Section_ID",
  Academic_Periods: "Academic_Period_ID",
};
