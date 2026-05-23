/**
 * IdentityAdapter — pluggable auth/identity provider
 * Implementations: Keycloak (default), Entra ID, Cognito, OCI IAM
 */
export interface IdentityAdapter {
  /** Validate a JWT bearer token. Returns the decoded claims or throws. */
  verifyToken(token: string): Promise<IdentityClaims>;

  /** Check that a principal holds a given role within a tenant. */
  hasRole(claims: IdentityClaims, tenantId: string, role: DatabridgeRole): boolean;

  /** Exchange an auth code for tokens (OAuth2 code flow). */
  exchangeCode(code: string, redirectUri: string): Promise<TokenPair>;

  /** Refresh an access token. */
  refresh(refreshToken: string): Promise<TokenPair>;
}

export interface IdentityClaims {
  sub: string;
  email?: string;
  name?: string;
  tenants: TenantMembership[];
  roles: string[];
  iat: number;
  exp: number;
}

export interface TenantMembership {
  tenantId: string;
  roles: DatabridgeRole[];
}

export type DatabridgeRole =
  | "tenant:admin"
  | "data:steward"
  | "data:viewer"
  | "migration:operator"
  | "audit:viewer"
  | "integration:manager"
  | "system:superadmin";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
