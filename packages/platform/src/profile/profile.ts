/**
 * Profile — a target data model definition used by DataBridge profile packs.
 *
 * Profile packs (e.g. profile-sits, profile-hesa-tdp) describe a target
 * data shape using these structural types. Adapters and migration
 * orchestrators consume Profile instances to validate, map and emit data.
 */

/** A coding-frame value (single allowed code in a controlled vocabulary). */
export interface CodingFrameValue {
  code: string;
  label: string;
  /** Optional description / definition of the code. */
  description?: string;
  /** Marks a code as deprecated but still accepted on read. */
  deprecated?: boolean;
}

/**
 * A coding frame — controlled vocabulary attached to a field
 * (e.g. HESA ETHNIC, MODE, SEXID).
 */
export interface CodingFrame {
  id: string;
  label: string;
  /** External authority reference (e.g. HESA ref code). */
  hesaRef?: string;
  /** Optional extended reference (long-form authority URI or doc anchor). */
  extendedRef?: string;
  /** When true, multiple codes may be combined (e.g. concatenated). */
  multiValue?: boolean;
  values: CodingFrameValue[];
  /** Profile packs may attach arbitrary metadata. */
  [key: string]: unknown;
}

/**
 * Supported primitive types for a FieldDefinition.
 * String-typed (with a known-set hint) rather than a strict union to allow
 * profile packs to declare profile-specific aliases such as "coded" or
 * "decimal" without needing to fork the canonical type. The final
 * `string & Record<string, never>` arm widens to any string without collapsing
 * the listed literals (same role as the former `string & {}` pattern).
 */
export type FieldType =
  | "string"
  | "number"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "coded"
  | "json"
  | (string & Record<string, never>);

/**
 * Definition of a single field on a Profile entity.
 */
export interface FieldDefinition {
  /** Field identifier within the profile (e.g. "HUSID"). */
  id: string;
  /** Owning entity name (e.g. "Student"). */
  entity: string;
  /** Human label for UI. */
  label: string;
  /** External authority reference. */
  hesaRef?: string;
  type: FieldType;
  required: boolean;
  /** Maximum length for string/enum fields. */
  maxLength?: number;
  /** Minimum length for string fields. */
  minLength?: number;
  /** Numeric range bounds. */
  min?: number;
  max?: number;
  /** Coding frame id, when the field is constrained by a controlled vocab. */
  codingFrameId?: string;
  /** Free-text description of the field's meaning. */
  description?: string;
  /** Profile-specific cross-references and extra metadata. */
  hesaFieldRef?: string;
  dataBridgeField?: string;
  [key: string]: unknown;
}

/**
 * Profile entity descriptor. Profile packs may attach richer entity metadata
 * but every profile entity must at minimum expose `name`.
 */
export interface ProfileEntity {
  name: string;
  mandatory?: boolean;
  description?: string;
}

/**
 * A profile pack — describes a target data model (e.g. HESA Data Platform,
 * SITS, Banner Ethos).
 */
export interface Profile {
  id: string;
  version: string;
  label: string;
  description?: string;
  entities: ProfileEntity[];
  fields: FieldDefinition[];
  /**
   * Rules attached to this profile. Typed loosely here to avoid a cyclic
   * dependency on @databridge/rule-core; profile packs may declare a
   * stronger type at their use site.
   */
  rules: unknown[];
  metadata?: Record<string, unknown>;
}
