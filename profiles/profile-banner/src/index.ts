/**
 * @databridge/profile-banner
 *
 * Banner canonical profile. Mirrors @databridge/profile-sits and exposes
 * the entity map + field catalogue + programme/student/registration
 * structural mapping that the Banner↔SITS bidirectional migrations rely on.
 *
 * The covered surface is intentionally focused on what the demo migrations
 * exercise: SPRIDEN (identity), STVMAJR (programme code lookup),
 * STVCAMP (campus lookup), SHRTGPA (term-level grade summary), plus the
 * SGBSTDN/SORLCUR programme registration tables that anchor the
 * Banner→SITS programme/student/registration mapping case study.
 */
export { BANNER_ENTITIES, type BannerEntityKey, type BannerEntity } from "./entities/index.js";
export { BANNER_FIELD_CATALOGUE, type FieldCatalogueEntry } from "./fields/catalogue.js";
export {
  BANNER_PROGRAMME_REGISTRATION_MAP,
  bannerEntityToCanonical,
  canonicalToBannerEntity,
  type BannerToCanonicalMap,
} from "./mapping/programme-registration.js";
