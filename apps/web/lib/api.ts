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

  // ── User ──────────────────────────────────────────────────────────────

  getMe() {
    return this.request<UserProfile>("/user/me");
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

  followStatus(username: string) {
    return this.request<{ isFollowing: boolean; isSelf: boolean }>(
      `/user/follow/${username}/status`
    );
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  fullName: string | null;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
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
