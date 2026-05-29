/**
 * CLI adapter loader.
 *
 * Mirrors apps/api/adapter-registry but keeps the CLI's dep surface narrow:
 * only file-based adapters are included by default. Heavier adapters
 * (banner-oracle, sjms5 with pg, workday-raas) can be added by extending
 * KNOWN \u2014 they remain opt-in so the CLI ships without a Postgres or
 * network requirement.
 */

import type { SourceAdapter, AdapterContext } from "@databridge/adapter-spec";
import { SitsFileAdapter } from "@databridge/adapter-sits-file";

interface KnownAdapter {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctor: new (config: unknown) => SourceAdapter;
}

const KNOWN: KnownAdapter[] = [{ id: "sits-file", ctor: SitsFileAdapter }];

export function listKnownAdapterIds(): string[] {
  return KNOWN.map((k) => k.id);
}

export function instantiateAdapter(
  id: string,
  config: Record<string, unknown>
): SourceAdapter | { error: string } {
  const entry = KNOWN.find((k) => k.id === id);
  if (!entry) return { error: `adapter '${id}' not registered in CLI` };
  try {
    return new entry.ctor(config);
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export function makeAdapterContext(
  tenantId: string,
  connectionId: string,
  signal: AbortSignal
): AdapterContext {
  return {
    tenantId,
    connectionId,
    secrets: {
      async get(key: string) {
        const v = process.env[key];
        if (v === undefined) throw new Error(`secret '${key}' not found in env`);
        return v;
      },
    },
    logger: {
      // CLI: silence by default; future flag could enable verbose mode.
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
    signal,
  };
}
