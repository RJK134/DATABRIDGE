import type { CodingFrame } from "@databridge/platform";

// Representative subset — full HECoS list has ~1,400 entries.
// Full list loaded at runtime from @databridge/codings-hecos.
export const HECOS: CodingFrame = {
  id: "HECOS",
  label: "Higher Education Classification of Subjects",
  hesaRef: "HECOS",
  multiValue: true,
  values: [
    { code: "100076", label: "Computer science" },
    { code: "100425", label: "Economics" },
    { code: "100435", label: "Psychology" },
    { code: "100503", label: "Law by area" },
    { code: "100340", label: "Nursing" },
    { code: "100299", label: "Business studies" },
    { code: "100366", label: "Education" },
    { code: "100060", label: "Mathematics" },
    { code: "100185", label: "English studies" },
    { code: "100422", label: "Sociology" },
  ],
  extendedRef: "@databridge/codings-hecos",
};
