/**
 * Phase I3 — Effective-dating resolvers.
 *
 * Six pure functions, one per documented source-system pattern. Adapters
 * declare which pattern applies per resource; the integration engine
 * imports the matching resolver and consumes its `ResolvedRow` uniformly.
 */
export * from "./types.js";
export {
  resolveActivityDated,
  resolveTermKeyed,
  resolveFromToDated,
  resolveChangeIndicator,
  resolveStatusDriven,
  resolveSnapshot,
} from "./resolvers.js";
