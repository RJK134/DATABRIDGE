import type { CodingFrame } from "@databridge/platform";

// Abridged — full ISO 3166-1 + HESA additions.
// Extended values loaded from @databridge/codings-iso3166 at runtime.
export const DOMICILE: CodingFrame = {
  id: "DOMICILE",
  label: "Domicile",
  hesaRef: "DOMICILE",
  values: [
    { code: "XF", label: "England" },
    { code: "XG", label: "Northern Ireland" },
    { code: "XH", label: "Scotland" },
    { code: "XI", label: "Wales" },
    { code: "XK", label: "United Kingdom (not otherwise specified)" },
    { code: "ZZ", label: "Not known" },
    // Remaining ISO codes added at runtime via the full coding pack.
  ],
  extendedRef: "@databridge/codings-iso3166",
};
