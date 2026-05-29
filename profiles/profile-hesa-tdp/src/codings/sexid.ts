import type { CodingFrame } from "@databridge/platform";

export const SEXID: CodingFrame = {
  id: "SEXID",
  label: "Sex identifier",
  hesaRef: "SEXID",
  values: [
    { code: "1", label: "Male" },
    { code: "2", label: "Female" },
    { code: "3", label: "Other" },
    { code: "9", label: "Not known" },
  ],
};
