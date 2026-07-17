export type OAuthProviderId = "google" | "dev";

export interface OAuthProfile {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  raw?: unknown;
}

export interface OAuthProviderPublic {
  id: OAuthProviderId;
  label: string;
  enabled: boolean;
}

export interface OAuthProvider {
  id: OAuthProviderId;
  label: string;
  isEnabled(): boolean;
  /** Absolute authorize URL (browser redirect) */
  getAuthorizationUrl(state: string): string;
  /** Exchange authorization code for profile */
  exchangeCode(code: string): Promise<OAuthProfile>;
}
