/**
 * Public web origin for share/join links.
 * Local: NEXT_PUBLIC_APP_URL or window.location.origin (http://localhost:3200)
 * Prod: set NEXT_PUBLIC_APP_URL=https://app.castify.example
 */
export function getAppOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:3200";
}

export function watchUrl(streamId: string): string {
  return `${getAppOrigin()}/watch/${streamId}`;
}

export function joinUrl(code: string): string {
  return `${getAppOrigin()}/library?tab=join&code=${encodeURIComponent(code)}`;
}

export function libraryJoinPath(code?: string): string {
  if (!code) return "/library?tab=join";
  return `/library?tab=join&code=${encodeURIComponent(code)}`;
}
