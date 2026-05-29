import { z } from "zod";

export const PlatformConfigSchema = z.object({
  // Database
  databaseUrl: z.string().url(),
  directUrl: z.string().url().optional(),

  // API
  port: z.coerce.number().int().min(1).max(65535).default(3001),
  host: z.string().default("0.0.0.0"),
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // Auth
  keycloakUrl: z.string().url(),
  keycloakRealm: z.string(),
  keycloakClientId: z.string(),
  keycloakClientSecret: z.string(),

  // Object Store
  s3Endpoint: z.string().url().optional(),
  s3AccessKeyId: z.string().optional(),
  s3SecretAccessKey: z.string().optional(),
  s3Bucket: z.string().default("databridge-objects"),
  s3Region: z.string().default("auto"),

  // AI
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  llmPrimary: z.enum(["anthropic", "openai", "azure", "bedrock", "oci"]).default("anthropic"),
  llmFallback: z.enum(["anthropic", "openai", "azure", "bedrock", "oci", "none"]).default("openai"),
  llmEuOnly: z.coerce.boolean().default(true),

  // Secrets
  secretsProvider: z
    .enum(["env", "doppler", "azure-kv", "aws-sm", "oci-vault", "hashicorp"])
    .default("env"),
  dopplerToken: z.string().optional(),

  // Feature flags
  featureAiAgents: z.coerce.boolean().default(false),
  featureLiveIntegration: z.coerce.boolean().default(false),
  featureMigrationEngine: z.coerce.boolean().default(false),
});

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

/** Parse & validate config from process.env at boot. Throws on missing required values. */
export function loadPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  const raw = {
    databaseUrl: env["DATABASE_URL"],
    directUrl: env["DIRECT_URL"],
    port: env["API_PORT"],
    host: env["API_HOST"],
    nodeEnv: env["NODE_ENV"],
    logLevel: env["LOG_LEVEL"],
    keycloakUrl: env["KEYCLOAK_URL"],
    keycloakRealm: env["KEYCLOAK_REALM"],
    keycloakClientId: env["KEYCLOAK_CLIENT_ID"],
    keycloakClientSecret: env["KEYCLOAK_CLIENT_SECRET"],
    s3Endpoint: env["S3_ENDPOINT"],
    s3AccessKeyId: env["S3_ACCESS_KEY_ID"],
    s3SecretAccessKey: env["S3_SECRET_ACCESS_KEY"],
    s3Bucket: env["S3_BUCKET"],
    s3Region: env["S3_REGION"],
    anthropicApiKey: env["ANTHROPIC_API_KEY"],
    openaiApiKey: env["OPENAI_API_KEY"],
    llmPrimary: env["LLM_PRIMARY"],
    llmFallback: env["LLM_FALLBACK"],
    llmEuOnly: env["LLM_EU_ONLY"],
    secretsProvider: env["SECRETS_PROVIDER"],
    dopplerToken: env["DOPPLER_TOKEN"],
    featureAiAgents: env["FEATURE_AI_AGENTS"],
    featureLiveIntegration: env["FEATURE_LIVE_INTEGRATION"],
    featureMigrationEngine: env["FEATURE_MIGRATION_ENGINE"],
  };

  const result = PlatformConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Platform configuration invalid:\n${issues}`);
  }
  return result.data;
}
