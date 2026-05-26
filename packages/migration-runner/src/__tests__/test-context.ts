import type { AdapterContext } from "@databridge/adapter-spec";
import type { SecretAccessor } from "@databridge/platform";

class TestSecrets implements SecretAccessor {
  async get(_key: string): Promise<string> {
    return "";
  }
}

export function makeTestContext(): AdapterContext {
  return {
    tenantId: "tenant-test",
    connectionId: "conn-test",
    secrets: new TestSecrets(),
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    signal: new AbortController().signal,
  };
}
