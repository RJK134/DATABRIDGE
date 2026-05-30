import type { Profile } from "@databridge/platform";
import { HESA_TDP_ENTITIES } from "./entities";
import { HESA_TDP_FIELDS } from "./fields/catalogue";
import { HESA_TDP_RULES } from "./rules";

export const HESA_TDP_PROFILE: Profile = {
  id: "hesa-tdp",
  version: "2024.1",
  label: "HESA Data Platform (Data Futures)",
  description:
    "Statutory return profile for HESA Data Futures collections from 2024/25 onward. " +
    "Covers Student, Engagement, CourseSession, Module, Leaver and EntryProfile entities.",
  entities: HESA_TDP_ENTITIES,
  fields: HESA_TDP_FIELDS,
  rules: HESA_TDP_RULES,
  metadata: {
    authority: "HESA",
    specUrl: "https://www.hesa.ac.uk/collection/c24051",
    collectionYear: "2024/25",
    submissionDeadline: "2025-04-30",
  },
};
