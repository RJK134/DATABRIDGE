/**
 * @databridge/provenance-core
 *
 * Phase G of DATABRIDGE. Three primitives that everything downstream
 * depends on:
 *
 *   1. `reconcileAltIds` — merge two AltId[] sets, dedupe by (system,type,value),
 *      preserving `firstSeenAt` (earliest wins) and `current` (true wins).
 *      Used by the identifier-reconciliation engine in Phase I.
 *
 *   2. `resolveCurrentness` — given a row + its declared effective-dating
 *      pattern, return a uniform `EffectiveDating` triple. Hides the four
 *      Banner shapes + SITS dual-column from rule / migration code.
 *
 *   3. `roundTripSourceKeys` — helpers to merge / read / verify sourceKeys
 *      maps without leaking native PK shape into canonical identity.
 *
 * The package is intentionally tiny and pure — no I/O, no DB clients.
 */

export * from './alt-ids.js';
export * from './currentness.js';
export * from './source-keys.js';
