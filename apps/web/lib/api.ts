const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  status?: number;
  errors?: Record<string, string[]>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    // Auth is cookie-based — the browser sends the HTTP-only session cookie
    // automatically via `credentials: "include"`. No manual token handling needed.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: "include",
      signal: options.signal ?? controller.signal,
    }).finally(() => clearTimeout(timeout));

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const error: ApiError = {
        success: false,
        message: json?.message ?? `Request failed with status ${res.status}`,
        status: res.status,
        errors: json?.errors,
      };
      throw error;
    }

    return json as ApiResponse<T>;
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  login(email: string, password: string) {
    // Server responds with the user fields flat on `data` (no nested .user)
    // and sets an HTTP-only cookie — no token returned to the client.
    return this.request<UserProfile>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  signup(data: { username: string; fullName: string; email: string; password: string }) {
    // Server sets an HTTP-only cookie and returns only the safe user fields.
    return this.request<{ user: Omit<UserProfile, 'bio' | 'avatarUrl' | 'updatedAt'> }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Clears the server-side session cookie. */
  logout() {
    return this.request<null>("/auth/logout", { method: "POST" });
  }

  getOAuthProviders() {
    return this.request<{
      providers: { id: string; label: string; enabled: boolean }[];
    }>("/auth/oauth/providers");
  }

  /** Full URL for browser navigation to OAuth start (cookie set on callback). */
  oauthStartUrl(provider: string, next = "/library") {
    const base = this.baseUrl;
    const n = next.startsWith("/") ? next : "/library";
    return `${base}/auth/oauth/${provider}?next=${encodeURIComponent(n)}`;
  }

  // ── User ──────────────────────────────────────────────────────────────

  getMe() {
    return this.request<UserProfile>("/user/me");
  }

  getEntitlements() {
    return this.request<PlanEntitlements>("/user/entitlements");
  }

  updateMe(data: { fullName?: string; bio?: string; avatarUrl?: string }) {
    return this.request<UserProfile>("/user/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  changePassword(data: { currentPassword: string; newPassword: string }) {
    return this.request<null>("/user/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getPublicProfile(username: string) {
    return this.request<PublicProfile>(`/user/${username}`);
  }

  // ── Stream Keys ───────────────────────────────────────────────────────

  getStreamKeys() {
    return this.request<StreamKey[]>("/user/stream-keys");
  }

  createStreamKey(data?: { label?: string }) {
    return this.request<StreamKey>("/user/stream-keys", {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  }

  revokeStreamKey(data: { keyId?: string; label?: string }) {
    return this.request<null>("/user/stream-keys/revoke", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  regenerateStreamKey() {
    return this.request<StreamKey>("/user/stream-keys/regenerate", {
      method: "POST",
    });
  }

  // ── Follow ────────────────────────────────────────────────────────────

  follow(username: string) {
    return this.request<null>(`/user/follow/${username}`, { method: "POST" });
  }

  unfollow(username: string) {
    return this.request<null>(`/user/follow/${username}`, { method: "DELETE" });
  }

  getFollowing() {
    return this.request<UserCard[]>("/user/following");
  }

  getFollowers() {
    return this.request<UserCard[]>("/user/followers");
  }

  getStreams() {
    return this.request<Stream[]>("/user/streams");
  }

  getStream(streamId: string) {
    return this.request<StreamDetail>(`/user/streams/${streamId}`);
  }

  createStream(payload: CreateStreamPayload) {
    return this.request<CreateStreamResponse>("/user/streams", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  endStream(streamId: string) {
    return this.request<{ stream: Stream; vod: Vod }>(`/user/streams/${streamId}/end`, {
      method: "POST",
    });
  }

  getStreamKeysForStream(streamId: string) {
    return this.request<StreamKey[]>(`/user/streams/${streamId}/keys`);
  }

  rotateStreamKey(streamId: string) {
    return this.request<StreamKey>(`/user/streams/${streamId}/keys/rotate`, {
      method: "POST",
    });
  }

  getVods() {
    return this.request<Vod[]>("/user/vods");
  }

  // ── Browse / Watch (auth required) ────────────────────────────────────

  browseStreams(params?: { q?: string; live?: boolean; following?: boolean }) {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.live) sp.set("live", "1");
    if (params?.following) sp.set("following", "1");
    const qs = sp.toString();
    return this.request<BrowseStreamCard[]>(
      `/browse/streams${qs ? `?${qs}` : ""}`
    );
  }

  browseStream(streamId: string) {
    return this.request<BrowseStreamDetail>(`/browse/streams/${streamId}`);
  }

  /** Viewer presence while on /watch — keeps concurrent count + peak accurate. */
  streamHeartbeat(streamId: string) {
    return this.request<{
      currentViewers: number;
      peakViewers: number;
      totalViews: number;
    }>(`/browse/streams/${streamId}/heartbeat`, { method: "POST" });
  }

  streamLeave(streamId: string) {
    return this.request<{ currentViewers: number }>(
      `/browse/streams/${streamId}/leave`,
      { method: "POST" }
    );
  }

  redeemInvite(code: string) {
    return this.request<{
      streamId: string;
      alreadyHadAccess: boolean;
      watchPath: string;
    }>("/browse/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  // ── Invites (creator) ─────────────────────────────────────────────────

  createStreamInvite(
    streamId: string,
    body?: {
      kind?: "CODE" | "LINK";
      label?: string;
      maxUses?: number | null;
      expiresInHours?: number | null;
    }
  ) {
    return this.request<{
      invite: StreamInviteRow;
      code: string;
    }>(`/user/streams/${streamId}/invites`, {
      method: "POST",
      body: JSON.stringify(body ?? { kind: "CODE" }),
    });
  }

  listStreamInvites(streamId: string) {
    return this.request<StreamInviteRow[]>(
      `/user/streams/${streamId}/invites`
    );
  }

  revokeStreamInvite(streamId: string, inviteId: string) {
    return this.request<{ id: string; revokedAt: string | null }>(
      `/user/streams/${streamId}/invites/${inviteId}`,
      { method: "DELETE" }
    );
  }

  // ── Library ───────────────────────────────────────────────────────────

  libraryLive(params?: { q?: string; limit?: number }) {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return this.request<LibraryLiveCard[]>(
      `/library/live${qs ? `?${qs}` : ""}`
    );
  }

  libraryVods(params?: { q?: string; limit?: number }) {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return this.request<LibraryVodCard[]>(
      `/library/vods${qs ? `?${qs}` : ""}`
    );
  }

  libraryVod(vodId: string) {
    return this.request<LibraryVodDetail>(`/library/vods/${vodId}`);
  }

  followStatus(username: string) {
    return this.request<{ isFollowing: boolean; isSelf: boolean }>(
      `/user/follow/${username}/status`
    );
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export type PlanTier = "FREE" | "PRO" | "ENTERPRISE";

export interface PlanEntitlements {
  plan: PlanTier;
  maxQuality: string;
  allowedQualities: string[];
  labels: string;
}

export interface UserProfile {
  id: string;
  username: string;
  fullName: string | null;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  plan?: PlanTier;
  entitlements?: PlanEntitlements;
  // Not always present — login endpoint omits these; /me includes them
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  followerCount: number;
  followingCount: number;
}

export interface StreamKey {
  id: string;
  key: string;
  streamId: string;
  label: string | null;
  createdAt: string;
}

export interface UserCard {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface Stream {
  id: string;
  userId: string;
  title: string | null;
  categoryId: string | null;
  thumbnailUrl: string | null;
  language: string | null;
  tags: string[];
  isLive: boolean;
  startedAt: string | null;
  endedAt: string | null;
  durationSecs: number | null;
  peakViewers: number | null;
  totalViews: number | null;
  /** Concurrent viewers currently on /watch (from presence heartbeats) */
  currentViewers?: number | null;
  qualities?: string[];
  isPrivate?: boolean;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StreamDetail {
  stream: Stream;
  streamKeys: StreamKey[];
  vod: Vod | null;
  currentViewers?: number;
}

export interface Vod {
  id: string;
  streamId: string;
  userId: string;
  title: string | null;
  playlistUrl: string | null;
  durationSecs: number | null;
  thumbnailUrl: string | null;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  createdAt: string;
  updatedAt: string;
}

export interface CreateStreamPayload {
  title?: string;
  tags?: string[];
  qualities?: string[];
  isPrivate?: boolean;
  scheduledAt?: string | null;
  thumbnailBase64?: string;
  thumbnailContentType?: string;
}

export interface CreateStreamResponse {
  stream: Stream;
  streamKey: StreamKey;
}

export interface BrowseStreamCard {
  id: string;
  title: string | null;
  tags: string[];
  isLive: boolean;
  isPrivate: boolean;
  qualities: string[];
  peakViewers: number | null;
  totalViews: number | null;
  currentViewers?: number | null;
  thumbnailUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
}

export interface StreamInviteRow {
  id: string;
  streamId: string;
  kind: "CODE" | "LINK";
  codeHint: string | null;
  label: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface LibraryLiveCard {
  id: string;
  title: string | null;
  tags: string[];
  isLive: boolean;
  isPrivate: boolean;
  qualities: string[];
  peakViewers: number;
  totalViews: number;
  currentViewers: number;
  thumbnailUrl: string | null;
  startedAt: string | null;
  createdAt: string;
  creator: {
    id: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
}

export interface LibraryVodCard {
  id: string;
  streamId: string;
  title: string | null;
  durationSecs: number | null;
  thumbnailUrl: string | null;
  status: string;
  createdAt: string;
  stream: {
    id: string;
    title: string | null;
    isPrivate: boolean;
    qualities: string[];
  };
  creator: {
    id: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
}

export interface LibraryVodDetail {
  vod: {
    id: string;
    streamId: string;
    title: string | null;
    durationSecs: number | null;
    thumbnailUrl: string | null;
    status: string;
    createdAt: string;
  };
  stream: {
    id: string;
    title: string | null;
    isPrivate: boolean;
    qualities: string[];
  };
  creator: {
    id: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  };
  playback: {
    mode: "vod" | "offline";
    masterUrl: string | null;
    qualities: string[];
    qualityUrls: Record<string, string>;
  };
}

export interface BrowseStreamDetail {
  stream: {
    id: string;
    title: string | null;
    tags: string[];
    isLive: boolean;
    isPrivate: boolean;
    qualities: string[];
    peakViewers: number | null;
    totalViews: number | null;
    currentViewers?: number | null;
    thumbnailUrl: string | null;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
  };
  creator: {
    id: string;
    username: string;
    fullName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    followerCount: number;
  };
  isFollowing: boolean;
  isOwner: boolean;
  playback: {
    mode: "live" | "vod" | "offline";
    masterUrl: string | null;
    qualities: string[];
    qualityUrls: Record<string, string>;
  };
  vod: {
    id: string;
    title: string | null;
    playlistUrl: string | null;
    durationSecs: number | null;
    status: string;
  } | null;
}

export const api = new ApiClient(BASE_URL);
