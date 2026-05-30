import type { RuleDefinition } from "@databridge/rule-core";

/**
 * H07 — Fee consistency rules.
 * Gross fee, net fee and funding relationships must be internally consistent.
 */

export const H07_RULES: RuleDefinition[] = [
  {
    id: "H07-001",
    family: "H07",
    entity: "StudentCourseSession",
    field: "grossFee",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-FEE-NEGATIVE",
    description: "Gross fee must not be negative",
    evaluate: (record) => {
      const fee = record["grossFee"];
      if (fee === undefined || fee === null) return { pass: true };
      if (Number(fee) < 0) {
        return { pass: false, message: `GROSSFEE (${fee}) must not be negative.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H07-002",
    family: "H07",
    entity: "StudentCourseSession",
    field: "netFee",
    severity: "ERROR",
    ucisa_benchmark_ref: "HESA-SCS-NETFEE-NEGATIVE",
    description: "Net fee must not be negative",
    evaluate: (record) => {
      const fee = record["netFee"];
      if (fee === undefined || fee === null) return { pass: true };
      if (Number(fee) < 0) {
        return { pass: false, message: `NETFEE (${fee}) must not be negative.` };
      }
      return { pass: true };
    },
  },
  {
    id: "H07-003",
    family: "H07",
    entity: "StudentCourseSession",
    field: "netFee",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-SCS-FEE-NET-GT-GROSS",
    description: "Net fee should not exceed gross fee",
    evaluate: (record) => {
      const gross = record["grossFee"];
      const net = record["netFee"];
      if (gross === undefined || gross === null || net === undefined || net === null)
        return { pass: true };
      if (Number(net) > Number(gross)) {
        return {
          pass: false,
          message: `NETFEE (${net}) exceeds GROSSFEE (${gross}). Net fee after waivers should not exceed the gross amount.`,
        };
      }
      return { pass: true };
    },
  },
  {
    id: "H07-004",
    family: "H07",
    entity: "StudentCourseSession",
    field: "grossFee",
    severity: "WARNING",
    ucisa_benchmark_ref: "HESA-SCS-FEE-HOME-CAP",
    description:
      "Home undergraduate fee should not exceed the regulated maximum (£9,535 for 2025/26)",
    evaluate: (record) => {
      const gross = Number(record["grossFee"]);
      const fundingLevel = record["fundingLevel"] as string | undefined;
      // Only apply to home UG students (fundingLevel 10–19 indicates home UG)
      const homeUgLevels = new Set(["10", "11", "12", "13", "14", "15", "16", "17", "18", "19"]);
      if (!fundingLevel || !homeUgLevels.has(fundingLevel)) return { pass: true };
      if (isNaN(gross)) return { pass: true };
      // £9,535 expressed in pence = 953500
      if (gross > 953500) {
        return {
          pass: false,
          message: `GROSSFEE (£${(gross / 100).toFixed(2)}) exceeds the regulated Home UG maximum of £9,535.00 for 2025/26.`,
        };
      }
      return { pass: true };
    },
  },
];
