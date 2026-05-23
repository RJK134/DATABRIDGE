/**
 * @databridge/adapter-sits-oracle
 * SITS Oracle read adapter.
 * Implements the SourceAdapter interface from @databridge/adapter-spec.
 * Reads from the standard SITS:Vision/eSIS Oracle schema using
 * well-known view names (CAM_*, PRS_*, STU_*, MOD_*, etc.).
 */
export { SitsOracleAdapter } from './sits-oracle-adapter';
export { SitsOracleConfig, SitsOracleConfigSchema } from './config';
export type { SitsRecordMap } from './entity-map';
export { SITS_ENTITY_QUERIES } from './entity-queries';
