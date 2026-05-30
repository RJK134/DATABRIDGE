import type { CodingFrame } from "@databridge/platform";

export const RSNEND: CodingFrame = {
  id: "RSNEND",
  label: "Reason for ending",
  hesaRef: "RSNEND",
  values: [
    { code: "01", label: "Successful completion of course" },
    { code: "02", label: "Academic failure/left in bad standing/not permitted to progress" },
    { code: "03", label: "Transferred to another institution" },
    { code: "04", label: "Health reasons" },
    { code: "05", label: "Death" },
    { code: "06", label: "Financial reasons" },
    { code: "07", label: "Other personal reasons" },
    { code: "08", label: "Written off after lapse of time" },
    { code: "09", label: "Exclusion" },
    { code: "10", label: "Gone into employment" },
    { code: "11", label: "Other" },
    { code: "98", label: "Not known" },
  ],
};
