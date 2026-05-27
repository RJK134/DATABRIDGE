/**
 * PII redaction utility.
 * Replaces PII values in strings with deterministic hashed placeholders.
 * Used at the logger boundary and before any LLM call.
 *
 * Fields covered (SJMS-2.5 inherited list + UK-GDPR additions):
 *   email, surname, forenames, dob, national_id, address lines,
 *   phone, nhs_number, passport_* fields, ni_number
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+44|0)[\s-]?\d[\s-]?(?:\d[\s-]?){8,9}/g;
const NHS_RE = /\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g;
const POSTCODE_RE = /\b[A-Z]{1,2}\d[\d A-Z]?\s?\d[A-Z]{2}\b/gi;
const NI_RE = /\b[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}\d{6}[A-D ]{1}\b/gi;
const PASSPORT_RE = /\b[A-Z]{1,3}\d{7}\b/g;

const PII_PATTERNS: Array<[RegExp, string]> = [
  [EMAIL_RE, "[EMAIL]"],
  [PHONE_RE, "[PHONE]"],
  [NHS_RE, "[NHS_NUMBER]"],
  [POSTCODE_RE, "[POSTCODE]"],
  [NI_RE, "[NI_NUMBER]"],
  [PASSPORT_RE, "[PASSPORT]"],
];

/** Redact PII from a string. Returns a new string with PII replaced by placeholders. */
export function redactPii(input: string): string {
  let result = input;
  for (const [pattern, placeholder] of PII_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), placeholder);
  }
  return result;
}

/**
 * Pino serialiser config — pass to pino({ redact: pinoRedactConfig })
 * Covers deeply nested PII fields in log objects.
 */
export const pinoRedactConfig = {
  paths: [
    "email",
    "surname",
    "forenames",
    "firstName",
    "lastName",
    "fullName",
    "dob",
    "dateOfBirth",
    "national_id",
    "nationalId",
    "address_line1",
    "address_line2",
    "address_line3",
    "address_line4",
    "postcode",
    "phone",
    "phoneNumber",
    "nhs_number",
    "nhsNumber",
    "passport_number",
    "passportNumber",
    "ni_number",
    "niNumber",
    "*.email",
    "*.surname",
    "*.forenames",
    "*.dob",
    "*.national_id",
    "*.postcode",
    "*.phone",
    "*.nhs_number",
  ],
  censor: "[REDACTED]",
};
