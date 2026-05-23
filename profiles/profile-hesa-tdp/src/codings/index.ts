/**
 * HESA Data Futures coding frames.
 * All values sourced from HESA coding manuals (C25061).
 * Reference: https://www.hesa.ac.uk/collection/c25061/coding-manual
 */

// ---------------------------------------------------------------------------
// ETHNIC — Ethnicity
// ---------------------------------------------------------------------------
export const ETHNIC_CODES: Record<string, string> = {
  '10': 'White',
  '11': 'White - Scottish',
  '12': 'Other White British',
  '13': 'White Irish',
  '14': 'White - Gypsy or Traveller',
  '19': 'Other White background',
  '21': 'Black or Black British - Caribbean',
  '22': 'Black or Black British - African',
  '29': 'Other Black background',
  '31': 'Asian or Asian British - Indian',
  '32': 'Asian or Asian British - Pakistani',
  '33': 'Asian or Asian British - Bangladeshi',
  '34': 'Asian or Asian British - Chinese',
  '39': 'Other Asian background',
  '41': 'Mixed - White and Black Caribbean',
  '42': 'Mixed - White and Black African',
  '43': 'Mixed - White and Asian',
  '49': 'Other mixed background',
  '50': 'Arab',
  '80': 'Other ethnic background',
  '90': 'Not known',
  '98': 'Information refused',
  '99': 'Not applicable',
};

export const VALID_ETHNIC_CODES = new Set(Object.keys(ETHNIC_CODES));

// ---------------------------------------------------------------------------
// DISABLE — Disability
// ---------------------------------------------------------------------------
export const DISABLE_CODES: Record<string, string> = {
  '0': 'No known disability',
  '2': 'Blind or a serious visual impairment uncorrected by glasses',
  '3': 'Deaf or a serious hearing impairment',
  '4': 'Wheelchair user or has mobility difficulties',
  '5': 'Personal care support needs',
  '6': 'Mental health condition',
  '7': 'An unseen disability, e.g. diabetes, epilepsy, asthma',
  '8': 'Two or more impairments and/or disabling medical conditions',
  '10': 'Specific learning difficulty such as dyslexia, dyspraxia or AD(H)D',
  '11': 'Autistic spectrum condition',
  '96': 'A disability, impairment or medical condition that is not listed above',
  '97': 'Information refused',
  '98': 'Not known',
  '99': 'Not applicable',
};

export const VALID_DISABLE_CODES = new Set(Object.keys(DISABLE_CODES));

// ---------------------------------------------------------------------------
// DOMICILE — Country of domicile
// ---------------------------------------------------------------------------
export const DOMICILE_CODES: Record<string, string> = {
  'XF': 'England',
  'XG': 'Northern Ireland',
  'XH': 'Scotland',
  'XI': 'Wales',
  'XK': 'United Kingdom (not otherwise specified)',
  'XL': 'Channel Islands',
  'XM': 'Isle of Man',
  'XN': 'British Overseas Territories',
  'XJ': 'Guernsey',
  'ZZ': 'Unknown',
  // EU member states (representative subset)
  'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'CY': 'Cyprus',
  'CZ': 'Czech Republic', 'DE': 'Germany', 'DK': 'Denmark', 'EE': 'Estonia',
  'ES': 'Spain', 'FI': 'Finland', 'FR': 'France', 'GR': 'Greece',
  'HR': 'Croatia', 'HU': 'Hungary', 'IE': 'Ireland', 'IT': 'Italy',
  'LT': 'Lithuania', 'LU': 'Luxembourg', 'LV': 'Latvia', 'MT': 'Malta',
  'NL': 'Netherlands', 'PL': 'Poland', 'PT': 'Portugal', 'RO': 'Romania',
  'SE': 'Sweden', 'SI': 'Slovenia', 'SK': 'Slovakia',
  // Common non-EU
  'AU': 'Australia', 'CA': 'Canada', 'CN': 'China', 'IN': 'India',
  'JP': 'Japan', 'NG': 'Nigeria', 'PK': 'Pakistan', 'US': 'United States',
};

export const UK_DOMICILE_CODES = new Set(['XF', 'XG', 'XH', 'XI', 'XK', 'XL', 'XM', 'XN', 'XJ']);
export const VALID_DOMICILE_CODES = new Set(Object.keys(DOMICILE_CODES));

// ---------------------------------------------------------------------------
// MODE — Mode of study
// ---------------------------------------------------------------------------
export const MODE_CODES: Record<string, string> = {
  '01': 'Full-time',
  '02': 'Other full-time',
  '23': 'Part-time day and block release',
  '24': 'Evening only (part-time)',
  '25': 'Mixed mode',
  '31': 'Part-time - other',
  '33': 'Dormant - previously part-time',
  '34': 'Dormant - previously full-time',
  '35': 'Writing up (previously full-time)',
  '36': 'Writing up (previously part-time)',
  '38': 'Sabbatical - on a leave of absence',
  '39': 'Intercalating',
  '51': 'Apprenticeship (full-time)',
  '63': 'Apprenticeship (part-time)',
  '64': 'Distance learning / online learning',
  '65': 'E-learning',
};

export const FULL_TIME_MODES = new Set(['01', '02', '51']);
export const PART_TIME_MODES = new Set(['23', '24', '25', '31', '63', '64', '65']);
export const DORMANT_MODES = new Set(['33', '34', '35', '36', '38', '39']);
export const VALID_MODE_CODES = new Set(Object.keys(MODE_CODES));

// ---------------------------------------------------------------------------
// RSNEND — Reason for ending engagement
// ---------------------------------------------------------------------------
export const RSNEND_CODES: Record<string, string> = {
  '01': 'Successful completion of course',
  '02': 'Transferred to another institution',
  '03': 'Health reasons',
  '04': 'Financial reasons',
  '05': 'Other personal reasons',
  '06': 'Wrote off after lapse of time',
  '07': 'Exclusion',
  '08': 'Gone into employment',
  '09': 'Other',
  '10': 'Transfer to another qualification aim within provider',
  '11': 'Death',
  '12': 'Completed course - not an award course',
  '13': 'Did not complete course - lapsed',
  '98': 'Dormant',
  '99': 'Unknown',
};

export const COMPLETION_RSNEND_CODES = new Set(['01', '12']);
export const VALID_RSNEND_CODES = new Set(Object.keys(RSNEND_CODES));

// ---------------------------------------------------------------------------
// QUALENT3 — Entry qualifications
// ---------------------------------------------------------------------------
export const QUALENT3_CODES: Record<string, string> = {
  'D': 'Higher degree',
  'E': 'First degree or equivalent',
  'F': 'Other HE qualification (below degree level)',
  'G': 'National/Scottish vocational qualifications at level 4 and above',
  'H': 'Baccalaureate',
  'J': 'Two or more A/AS levels or equivalent',
  'K': 'One A/AS level',
  'L': 'Access course',
  'M': 'Other qualification',
  'N': 'No formal qualification',
  'P': 'Professional qualifications',
  'Q': 'GNVQ/GSVQ advanced',
  'X': 'Not known',
};

export const VALID_QUALENT3_CODES = new Set(Object.keys(QUALENT3_CODES));

// ---------------------------------------------------------------------------
// FUNDCOMP — Completion of funding
// ---------------------------------------------------------------------------
export const FUNDCOMP_CODES: Record<string, string> = {
  '1': 'Completed the course successfully',
  '2': 'Did not complete the course',
  '3': 'Not yet completed the course (continuing)',
};

export const VALID_FUNDCOMP_CODES = new Set(Object.keys(FUNDCOMP_CODES));

// ---------------------------------------------------------------------------
// SEXID — Gender identity (replaces SEX from C23)
// ---------------------------------------------------------------------------
export const SEXID_CODES: Record<string, string> = {
  '1': 'Female',
  '2': 'Male',
  '3': 'Other',
  '4': 'Information refused',
  '9': 'Not available',
};

export const VALID_SEXID_CODES = new Set(Object.keys(SEXID_CODES));

// Convenience: all coding frames for validation lookup
export const CODING_FRAMES = {
  ETHNIC: VALID_ETHNIC_CODES,
  DISABLE: VALID_DISABLE_CODES,
  DOMICILE: VALID_DOMICILE_CODES,
  MODE: VALID_MODE_CODES,
  RSNEND: VALID_RSNEND_CODES,
  QUALENT3: VALID_QUALENT3_CODES,
  FUNDCOMP: VALID_FUNDCOMP_CODES,
  SEXID: VALID_SEXID_CODES,
} as const;

export type CodingFrameName = keyof typeof CODING_FRAMES;
