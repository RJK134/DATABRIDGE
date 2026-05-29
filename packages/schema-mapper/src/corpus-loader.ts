/**
 * Loads the bundled crosswalk corpus from JSON files. The corpus lives
 * next to this file under `corpus/` and is bundled into `dist/` at
 * build time via the package's `files` entry.
 */
import type { CorpusBundle, CrosswalkSection } from "./types.js";

import personSection from "./corpus/person.json" with { type: "json" };
import programmeSection from "./corpus/programme.json" with { type: "json" };
import moduleSection from "./corpus/module.json" with { type: "json" };
import marksSection from "./corpus/marks.json" with { type: "json" };
import awardSection from "./corpus/award.json" with { type: "json" };
import admissionsSection from "./corpus/admissions.json" with { type: "json" };

const BUNDLED: readonly CrosswalkSection[] = [
  personSection as CrosswalkSection,
  programmeSection as CrosswalkSection,
  moduleSection as CrosswalkSection,
  marksSection as CrosswalkSection,
  awardSection as CrosswalkSection,
  admissionsSection as CrosswalkSection,
];

export function loadBundledCorpus(): CorpusBundle {
  return {
    version: "1.0.0-crosswalk-§6-§11",
    sections: BUNDLED,
  };
}

/**
 * Build a flat lookup keyed by lower-case native column tokens →
 * candidate canonicals. Used by the suggester to do O(1) seed lookups
 * before falling back to fuzzy scoring.
 */
export interface FlatIndexEntry {
  canonical: string;
  entity: string;
  system: "banner" | "sits";
  /** The raw source-string from the corpus (used to derive tokens). */
  source: string;
  notes: string | undefined;
}

export function buildFlatIndex(corpus: CorpusBundle): readonly FlatIndexEntry[] {
  const out: FlatIndexEntry[] = [];
  for (const section of corpus.sections) {
    for (const field of section.fields) {
      if (field.banner) {
        out.push({
          canonical: field.canonical,
          entity: section.entity,
          system: "banner",
          source: field.banner,
          notes: field.notes,
        });
      }
      if (field.sits) {
        out.push({
          canonical: field.canonical,
          entity: section.entity,
          system: "sits",
          source: field.sits,
          notes: field.notes,
        });
      }
    }
  }
  return out;
}
