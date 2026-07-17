import {
  asyncHandler,
  castifyResponse,
  castifyError,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import type { Request, Response } from "express";
import { config } from "../config";
import { listOAuthProviders, getOAuthProvider } from "../oauth/registry";
import {
  createOAuthState,
  verifyOAuthState,
  sanitizeNextPath,
} from "../oauth/state";
import { upsertOAuthUser } from "../oauth/upsertUser";
import { signToken, setAuthCookie, clearAuthCookie } from "../utils/auth.utils";
import type { OAuthProviderId } from "../oauth/types";

export const listProviders = asyncHandler(async (_req: Request, res: Response) => {
  return castifyResponse(res, { providers: listOAuthProviders() }, STATUS_MSG.OK);
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearAuthCookie(res);
  return castifyResponse(res, null, "Logged out");
});

export const startOAuth = asyncHandler(async (req: Request, res: Response) => {
  const providerId = req.params["provider"] as OAuthProviderId;
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    return castifyError(
      res,
      `OAuth provider "${providerId}" is not available`,
      STATUS_CODE.NOT_FOUND
    );
  }

  const next = sanitizeNextPath(req.query.next);
  const state = createOAuthState({ provider: providerId, next });
  const url = provider.getAuthorizationUrl(state);
  return res.redirect(302, url);
});

export const oauthCallback = asyncHandler(async (req: Request, res: Response) => {
  const providerId = req.params["provider"] as OAuthProviderId;
  const provider = getOAuthProvider(providerId);
  const web = config.WEB_ORIGIN.replace(/\/$/, "");

  const fail = (msg: string) =>
    res.redirect(
      302,
      `${web}/login?error=${encodeURIComponent(msg)}`
    );

  if (!provider) {
    return fail("OAuth provider unavailable");
  }

  const errParam = typeof req.query.error === "string" ? req.query.error : null;
  if (errParam) {
    return fail(errParam);
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const stateRaw = typeof req.query.state === "string" ? req.query.state : null;
  if (!code || !stateRaw) {
    return fail("Missing OAuth code or state");
  }

  const state = verifyOAuthState(stateRaw);
  if (!state || state.provider !== providerId) {
    return fail("Invalid or expired OAuth state");
  }

  try {
    const profile = await provider.exchangeCode(code);
    const user = await upsertOAuthUser(profile);
    const token = signToken({ sub: user.id, username: user.username });
    setAuthCookie(res, token);
    const next = sanitizeNextPath(state.next);
    return res.redirect(302, `${web}/auth/callback?next=${encodeURIComponent(next)}`);
  } catch (e) {
    console.error("[oauth] callback error", e);
    return fail("OAuth sign-in failed");
  }
});
