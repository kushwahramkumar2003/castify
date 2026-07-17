import { config, isGoogleOAuthEnabled } from "../../config";
import type { OAuthProvider, OAuthProfile } from "../types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const googleProvider: OAuthProvider = {
  id: "google",
  label: "Continue with Google",
  isEnabled: () => isGoogleOAuthEnabled(),

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID!,
      redirect_uri: config.GOOGLE_REDIRECT_URI!,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<OAuthProfile> {
    const body = new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID!,
      client_secret: config.GOOGLE_CLIENT_SECRET!,
      redirect_uri: config.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      throw new Error(`Google token exchange failed: ${tokenRes.status} ${text}`);
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!tokenJson.access_token) {
      throw new Error("Google token response missing access_token");
    }

    const profileRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!profileRes.ok) {
      throw new Error(`Google userinfo failed: ${profileRes.status}`);
    }
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!profile.sub) {
      throw new Error("Google userinfo missing sub");
    }

    return {
      provider: "google",
      providerAccountId: profile.sub,
      email: profile.email ?? null,
      emailVerified: !!profile.email_verified,
      fullName: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      expiresAt: tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000)
        : null,
      raw: profile,
    };
  },
};
