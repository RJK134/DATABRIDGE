/**
 * Phase I1 — Identifier reconciliation engine.
 *
 * Pure functions for matching person records across source systems.
 * See `reconciler.ts` for the policy definitions.
 */
export * from "./types.js";
export { damerauLevenshtein, nameSimilarity } from "./distance.js";
export { scorePair, reconcile, buildMergeLogEntry } from "./reconciler.js";
