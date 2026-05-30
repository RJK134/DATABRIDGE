/**
 * Concrete SecretsAdapter implementations:
 *
 * - EnvSecretsAdapter:    read-only, sources values from process.env (optionally
 *                          namespaced/prefix-stripped). Source adapters MUST go
 *                          through this layer rather than read process.env
 *                          directly — that's the design invariant in
 *                          DESIGN.md and the SourceAdapter contract.
 *
 * - MemorySecretsAdapter:  in-memory, used in tests and for ephemeral preview
 *                          deployments. Implements the optional set() method.
 *
 * Future implementations (Doppler, Azure Key Vault, AWS Secrets Manager, OCI
 * Vault, HashiCorp Vault) will live next to this file.
 */
import type { SecretsAdapter } from "./secrets.js";

export interface EnvSecretsAdapterOptions {
  /**
   * Restrict visibility/listing to env vars whose key starts with this prefix.
   * Lookups via .get() will probe both `${prefix}${key}` and the bare key.
   * Example: prefix="DATABRIDGE_" makes get("DATABASE_URL") read
   * DATABRIDGE_DATABASE_URL first, then DATABASE_URL.
   */
  prefix?: string;
  /**
   * Optional explicit allowlist of keys that may be returned by .list() and
   * fetched by .get(). When set, requests for any other key throw. This is
   * the recommended posture for production: even if a process is compromised,
   * an adapter can only read secrets it was authorized for.
   */
  allowlist?: ReadonlyArray<string>;
  /** Source of env vars; defaults to process.env. Useful for tests. */
  env?: NodeJS.ProcessEnv;
}

export class EnvSecretsAdapter implements SecretsAdapter {
  private readonly prefix: string;
  private readonly allowlist: ReadonlySet<string> | null;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: EnvSecretsAdapterOptions = {}) {
    this.prefix = options.prefix ?? "";
    this.allowlist = options.allowlist ? new Set(options.allowlist) : null;
    this.env = options.env ?? process.env;
  }

  async get(key: string): Promise<string> {
    if (this.allowlist && !this.allowlist.has(key)) {
      throw new Error(
        `EnvSecretsAdapter: key '${key}' is not in the allowlist. ` +
          `Add it to allowlist or remove the allowlist option.`
      );
    }
    const prefixed = `${this.prefix}${key}`;
    const value = this.env[prefixed] !== undefined ? this.env[prefixed] : this.env[key];
    if (value === undefined || value === "") {
      throw new Error(
        `EnvSecretsAdapter: secret '${key}' not found in environment` +
          (this.prefix ? ` (tried '${prefixed}' and '${key}')` : "")
      );
    }
    return value;
  }

  async list(): Promise<string[]> {
    if (this.allowlist) return Array.from(this.allowlist).sort();
    const keys = new Set<string>();
    for (const k of Object.keys(this.env)) {
      if (this.prefix && k.startsWith(this.prefix)) {
        keys.add(k.slice(this.prefix.length));
      } else if (!this.prefix) {
        keys.add(k);
      }
    }
    return Array.from(keys).sort();
  }
  // No set(): env-var adapter is intentionally read-only.
}

export class MemorySecretsAdapter implements SecretsAdapter {
  private readonly store: Map<string, string>;

  constructor(initial?: Readonly<Record<string, string>>) {
    this.store = new Map(initial ? Object.entries(initial) : []);
  }

  async get(key: string): Promise<string> {
    const value = this.store.get(key);
    if (value === undefined) {
      throw new Error(`MemorySecretsAdapter: secret '${key}' not found`);
    }
    return value;
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys()).sort();
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  /** Test helper: drop all stored secrets. */
  clear(): void {
    this.store.clear();
  }
}
