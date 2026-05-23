/**
 * SecretsAdapter — pluggable secrets vault
 * Implementations: env vars, Doppler, Azure Key Vault, AWS Secrets Manager,
 * HashiCorp Vault, OCI Vault
 */
export interface SecretsAdapter {
  /** Retrieve a secret value by key. Throws if not found. */
  get(key: string): Promise<string>;

  /** List all secret keys accessible to this service (no values). */
  list(): Promise<string[]>;

  /**
   * Write/rotate a secret.
   * Not available in all implementations (e.g. env-var adapter is read-only).
   */
  set?(key: string, value: string): Promise<void>;
}

/**
 * SecretAccessor — thin facade passed to adapters.
 * Ensures adapters never touch raw env vars directly.
 */
export type SecretAccessor = Pick<SecretsAdapter, "get">;
