/**
 * CRN generator transform (policy slot 1).
 *
 * Maintains in-runtime state so a single migration run produces a
 * monotonic CRN sequence; for "preserve-existing" it falls back to the
 * configured fallback strategy when no existing CRN is supplied.
 */
import type { CrnGenerator } from "@databridge/migration-policy";
import type { ProvenanceEntry } from "../types.js";

export class CrnGeneratorState {
  private nextMonotonic: number;
  private readonly width: number;
  private readonly hashBucket: number;
  private readonly preserveFallback: "monotonic" | "hash";

  constructor(private readonly policy: CrnGenerator) {
    if (policy.strategy === "monotonic") {
      this.nextMonotonic = policy.start;
      this.width = policy.width;
      this.hashBucket = 99_999;
      this.preserveFallback = "monotonic";
    } else if (policy.strategy === "hash") {
      this.nextMonotonic = 10_000;
      this.width = 5;
      this.hashBucket = policy.bucketSize;
      this.preserveFallback = "monotonic";
    } else {
      this.nextMonotonic = 10_000;
      this.width = 5;
      this.hashBucket = 99_999;
      this.preserveFallback = policy.fallback;
    }
  }

  /**
   * Allocate a CRN for the given subject+section+term tuple. If
   * `existingCrn` is provided and policy is preserve-existing, returns
   * it verbatim. Otherwise applies the active strategy.
   */
  allocate(args: {
    subject: string;
    section: string;
    term: string;
    existingCrn?: string | null;
  }): { crn: string; provenance: ProvenanceEntry } {
    if (this.policy.strategy === "preserve-existing" && args.existingCrn) {
      return {
        crn: args.existingCrn,
        provenance: {
          slot: "crnGenerator",
          strategy: "preserve-existing",
          note: "reused existing target CRN",
          outputValue: args.existingCrn,
        },
      };
    }
    const effective =
      this.policy.strategy === "preserve-existing" ? this.preserveFallback : this.policy.strategy;
    if (effective === "monotonic") {
      const n = this.nextMonotonic++;
      const crn = String(n).padStart(this.width, "0");
      return {
        crn,
        provenance: {
          slot: "crnGenerator",
          strategy: "monotonic",
          note: "allocated next monotonic CRN",
          outputValue: crn,
        },
      };
    }
    // hash
    const key = `${args.subject}|${args.section}|${args.term}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(h) % this.hashBucket;
    const crn = String(bucket).padStart(this.width, "0");
    return {
      crn,
      provenance: {
        slot: "crnGenerator",
        strategy: "hash",
        note: `hashed ${key}`,
        inputValue: key,
        outputValue: crn,
      },
    };
  }
}
