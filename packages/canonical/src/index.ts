/**
 * @databridge/canonical
 *
 * Canonical, source-agnostic entity types and zod schemas for DATABRIDGE.
 * Derived from UCISA HERM (Higher Education Reference Model) and aligned
 * with HESA Data Futures.
 *
 * Layer position:
 *   adapters (sits-*, banner-*, workday-*, sjms5)
 *     ↓ map to canonical
 *   @databridge/canonical (this package)
 *     ↓ profile packs map FROM canonical
 *   profile-hesa-tdp, profile-sits (target shapes)
 */
export * from "./entities/index.js";
