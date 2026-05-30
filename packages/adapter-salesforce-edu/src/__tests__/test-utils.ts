import { vi } from "vitest";
import type { AdapterContext, AdapterLogger } from "@databridge/adapter-spec";

export function makeLogger(): AdapterLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

export function makeCtx(...args: [] | [string | undefined]): AdapterContext {
  const secret: string | undefined = args.length === 0 ? "secret" : args[0];
  return {
    tenantId: "test-tenant",
    connectionId: "test-conn",
    secrets: {
      get: vi.fn(async (_k: string) => {
        if (secret === undefined) {
          throw new Error("secret not found");
        }
        return secret;
      }),
    },
    logger: makeLogger(),
    signal: new AbortController().signal,
  };
}

export interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  headers?: Record<string, string>;
}

export function jsonResp(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Err",
    body: JSON.stringify(body),
    headers,
  };
}

export function buildFetch(queue: MockResponse[]): (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}> {
  return async () => {
    const resp = queue.shift();
    if (!resp) throw new Error("buildFetch: no more queued responses");
    return {
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      headers: {
        get: (name: string) => resp.headers?.[name.toLowerCase()] ?? null,
      },
      async text() {
        return resp.body;
      },
      async json() {
        return JSON.parse(resp.body) as unknown;
      },
    };
  };
}
