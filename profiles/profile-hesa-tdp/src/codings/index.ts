import type { CodingFrame } from '@databridge/platform';
import { ETHNIC } from './ethnic';
import { DISABLE } from './disable';
import { DOMICILE } from './domicile';
import { MODE } from './mode';
import { RSNEND } from './rsnend';
import { QUALENT3 } from './qualent3';
import { HECOS } from './hecos';
import { SEXID } from './sexid';
import { FUNDCOMP } from './fundcomp';

export { ETHNIC, DISABLE, DOMICILE, MODE, RSNEND, QUALENT3, HECOS, SEXID, FUNDCOMP };

/** Helper: build a Set of valid codes from a CodingFrame. */
const codes = (frame: CodingFrame): Set<string> =>
  new Set(frame.values.map((v) => v.code));

export const VALID_ETHNIC_CODES = codes(ETHNIC);
export const VALID_DISABLE_CODES = codes(DISABLE);
export const VALID_DOMICILE_CODES = codes(DOMICILE);
export const VALID_MODE_CODES = codes(MODE);
export const VALID_RSNEND_CODES = codes(RSNEND);
export const VALID_QUALENT3_CODES = codes(QUALENT3);
export const VALID_SEXID_CODES = codes(SEXID);
export const VALID_FUNDCOMP_CODES = codes(FUNDCOMP);
export const VALID_HECOS_CODES = codes(HECOS);

/**
 * UK domicile ISO 3166-1 numeric codes for England, Wales, Scotland,
 * Northern Ireland, and the Crown Dependencies covered by the GB cluster.
 */
export const UK_DOMICILE_CODES = new Set<string>([
  '826', // United Kingdom
  '042', // Channel Islands
  'XF',  // England
  'XG',  // Northern Ireland
  'XH',  // Scotland
  'XI',  // Wales
  'XK',  // Great Britain not otherwise specified
]);

/** Central registry of coding frames keyed by HESA reference. */
export const CODING_FRAMES = {
  ETHNIC,
  DISABLE,
  DOMICILE,
  MODE,
  RSNEND,
  QUALENT3,
  HECOS,
  SEXID,
  FUNDCOMP,
} as const;

export type CodingFrameName = keyof typeof CODING_FRAMES;
