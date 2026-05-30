import type { CodingFrame } from "@databridge/platform";

export const QUALENT3: CodingFrame = {
  id: "QUALENT3",
  label: "Highest qualification on entry",
  hesaRef: "QUALENT3",
  values: [
    { code: "D00", label: "Doctorate degree" },
    { code: "D01", label: "Doctorate degree obtained in the UK" },
    { code: "D02", label: "Doctorate degree obtained overseas" },
    { code: "E00", label: "Other higher degree" },
    { code: "E01", label: "Masters degree obtained in the UK" },
    { code: "E02", label: "Masters degree obtained overseas" },
    { code: "FC1", label: "PGCE / PGDE" },
    { code: "J00", label: "First degree (not further specified)" },
    { code: "J01", label: "First degree obtained in UK" },
    { code: "J10", label: "Foundation degree" },
    { code: "J20", label: "DipHE" },
    { code: "J30", label: "HNC/HND" },
    { code: "J45", label: "A/AS levels" },
    { code: "J50", label: "Access course" },
    { code: "J80", label: "Baccalaureate (International or European)" },
    { code: "M00", label: "No qualifications" },
    { code: "M11", label: "GCSE/O level" },
    { code: "M2", label: "Other qualification (level not known)" },
    { code: "X00", label: "Not known" },
  ],
};
