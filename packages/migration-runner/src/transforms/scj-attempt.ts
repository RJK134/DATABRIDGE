/**
 * scj_code attempt-number allocator (policy slot 2).
 */
import type { ScjAttemptPolicy } from "@databridge/migration-policy";
import type { ProvenanceEntry } from "../types.js";

export class ScjAttemptAllocator {
  /** Per-student attempt counter. */
  private readonly perStudent = new Map<string, number>();
  /** Per-student+ayr attempt counter (reset-per-ayr mode). */
  private readonly perStudentAyr = new Map<string, number>();

  constructor(private readonly policy: ScjAttemptPolicy) {}

  allocate(args: {
    studentId: string;
    ayr?: string | null;
    sourceAttempt?: string | number | null;
  }): { scjCode: string; provenance: ProvenanceEntry } {
    if (this.policy.strategy === "source-preserved") {
      const v = args.sourceAttempt ?? "1";
      return {
        scjCode: String(v),
        provenance: {
          slot: "scjAttempt",
          strategy: "source-preserved",
          note: "preserved upstream attempt code",
          outputValue: String(v),
        },
      };
    }
    if (this.policy.strategy === "reset-per-ayr") {
      const key = `${args.studentId}|${args.ayr ?? ""}`;
      const next = (this.perStudentAyr.get(key) ?? 0) + 1;
      this.perStudentAyr.set(key, next);
      return {
        scjCode: String(next),
        provenance: {
          slot: "scjAttempt",
          strategy: "reset-per-ayr",
          note: `attempt #${next} for ${key}`,
          outputValue: String(next),
        },
      };
    }
    // monotonic
    const next = (this.perStudent.get(args.studentId) ?? this.policy.startAt - 1) + 1;
    this.perStudent.set(args.studentId, next);
    return {
      scjCode: String(next),
      provenance: {
        slot: "scjAttempt",
        strategy: "monotonic",
        note: `monotonic attempt #${next} for ${args.studentId}`,
        outputValue: String(next),
      },
    };
  }
}
