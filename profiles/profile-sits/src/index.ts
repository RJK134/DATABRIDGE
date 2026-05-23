/**
 * @databridge/profile-sits
 * Full Tribal SITS profile: entity map, canonical field catalogue, 69 audit rules.
 * Rule families F01–F13 as defined in docs/AUDIT_RULES.md
 * 8 legacy-scar rules (LS-01 to LS-08) are the commercially differentiating capability.
 */
export { SITS_ENTITIES } from "./entities/index.js";
export { SITS_FIELD_CATALOGUE } from "./fields/catalogue.js";
export { rules } from "./rules/index.js";
export type { SitsEntityKey } from "./entities/index.js";
