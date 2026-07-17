import { config } from "../../config";
import type { OAuthProvider, OAuthProfile } from "../types";

/**
 * Local-only provider: no Google Cloud required.
 * Start: GET /auth/oauth/dev?next=/library
 * Callback simulates profile from query or defaults.
 */
export const devMockProvider: OAuthProvider = {
  id: "dev",
  label: "Continue with Dev OAuth",
  isEnabled: () =>
    config.NODE_ENV !== "production" && config.OAUTH_DEV_BYPASS === true,

  getAuthorizationUrl(state: string): string {
    // Bounce through our own callback with a fake code
    const base = `http://localhost:${config.PORT}/api/v1/auth/oauth/dev/callback`;
    const params = new URLSearchParams({
      code: "dev-mock-code",
      state,
    });
    return `${base}?${params.toString()}`;
  },

  async exchangeCode(_code: string): Promise<OAuthProfile> {
    const id = `dev-${Date.now().toString(36)}`;
    return {
      provider: "dev",
      providerAccountId: "dev-user-1",
      email: "viewer.dev@castify.local",
      emailVerified: true,
      fullName: "Dev Viewer",
      avatarUrl: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      raw: { mock: true, id },
    };
  },
};
