import type { AdapterContext } from "@databridge/adapter-spec";

/** Build a minimal AdapterContext suitable for write-side tests. */
export function makeTestContext(overrides: Partial<AdapterContext> = {}): AdapterContext {
  const controller = new AbortController();
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    secrets: {
      async get() {
        return "";
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    signal: controller.signal,
    ...overrides,
  };
}
