import type { OAuthProvider, OAuthProviderId, OAuthProviderPublic } from "./types";
import { googleProvider } from "./providers/google";
import { devMockProvider } from "./providers/devMock";

const providers: OAuthProvider[] = [googleProvider, devMockProvider];

export function listOAuthProviders(): OAuthProviderPublic[] {
  return providers.map((p) => ({
    id: p.id,
    label: p.label,
    enabled: p.isEnabled(),
  }));
}

export function getOAuthProvider(id: OAuthProviderId): OAuthProvider | null {
  const p = providers.find((x) => x.id === id) ?? null;
  if (!p || !p.isEnabled()) return null;
  return p;
}
