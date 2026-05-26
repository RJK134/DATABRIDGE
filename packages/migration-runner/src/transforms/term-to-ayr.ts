/**
 * Term → Academic-Year transform (policy slot 7).
 */
import type { TermToAcademicYearPolicy } from "@databridge/migration-policy";
import type { ProvenanceEntry } from "../types.js";

export function termToAyr(
  term: string,
  policy: TermToAcademicYearPolicy,
  /** Optional lookup for STVTERM-driven mode. Maps term-code → ayr-code. */
  stvtermAyr?: Record<string, string>,
): { ayr: string | null; provenance: ProvenanceEntry } {
  if (policy.strategy === "stvterm-driven") {
    const ayr = stvtermAyr?.[term] ?? null;
    return {
      ayr,
      provenance: {
        slot: "termToAcademicYear",
        strategy: "stvterm-driven",
        note: ayr ? `STVTERM.ACYR_CODE lookup` : `STVTERM lookup missing for ${term}`,
        inputValue: term,
        outputValue: ayr,
      },
    };
  }
  // regex
  const re = new RegExp(policy.pattern);
  const m = re.exec(term);
  if (!m) {
    return {
      ayr: null,
      provenance: {
        slot: "termToAcademicYear",
        strategy: "regex",
        note: `pattern ${policy.pattern} did not match`,
        inputValue: term,
        outputValue: null,
      },
    };
  }
  const yearStr = m[policy.yearGroup];
  if (!yearStr) {
    return {
      ayr: null,
      provenance: {
        slot: "termToAcademicYear",
        strategy: "regex",
        note: `no yearGroup capture at index ${policy.yearGroup}`,
        inputValue: term,
        outputValue: null,
      },
    };
  }
  const yearStart = parseInt(yearStr, 10);
  let ayr: string;
  switch (policy.ayrFormat) {
    case "YYYY/Y":
      ayr = `${yearStart}/${(yearStart + 1) % 10}`;
      break;
    case "YYYY-YYYY":
      ayr = `${yearStart}-${yearStart + 1}`;
      break;
    case "YYYY":
      ayr = `${yearStart}`;
      break;
    default:
      ayr = `${yearStart}/${(yearStart + 1) % 10}`;
  }
  return {
    ayr,
    provenance: {
      slot: "termToAcademicYear",
      strategy: "regex",
      note: `regex(${policy.pattern}) → ${ayr}`,
      inputValue: term,
      outputValue: ayr,
    },
  };
}
