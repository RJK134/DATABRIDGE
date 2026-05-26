/**
 * Credit-hour → CATS conversion (policy slot 5).
 */
import type { CreditHourPolicy } from "@databridge/migration-policy";
import type { ProvenanceEntry } from "../types.js";

export function convertCreditHoursToCats(
  hours: number,
  policy: CreditHourPolicy,
): { cats: number; provenance: ProvenanceEntry } {
  const raw = hours * policy.catsPerCreditHour;
  let cats: number;
  switch (policy.rounding) {
    case "floor":
      cats = Math.floor(raw);
      break;
    case "ceil":
      cats = Math.ceil(raw);
      break;
    case "nearest":
    default:
      cats = Math.round(raw);
      break;
  }
  return {
    cats,
    provenance: {
      slot: "creditHour",
      strategy: `${policy.catsPerCreditHour}x · ${policy.rounding}`,
      note: `${hours}ch → ${cats}cats`,
      inputValue: hours,
      outputValue: cats,
    },
  };
}
