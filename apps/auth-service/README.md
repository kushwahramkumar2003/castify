# Auth Service — API Specification

## Overview

Handles user registration, login, logout, JWT token management, stream key generation, and user profile operations. All endpoints are reached through the API Gateway (`/api/auth/*` and `/api/users/*`).

**Base URL (internal):** `http://localhost:3000`
**Base URL (via gateway):** `http://localhost:3100/api/auth`

---

## Architecture

```
Client → api-gateway → auth-service → PostgreSQL
              │              │
              │    JWT decoded at gateway
              │    X-User-Id + X-Username forwarded in headers
              │
         Internal services receive user identity without re-validating tokens
```

---

## Endpoints

### 1. Register

Creates a new user account. Returns JWT access + refresh tokens.

```
POST /api/auth/register
```

**Request Body**
```json
{
  "username": "string (required, 3-30 chars, alphanumeric + underscore)",
  "email": "string (optional, valid email)",
  "password": "string (required, min 8 chars, must include 1 uppercase + 1 number)",
  "displayName": "string (optional, 1-50 chars)"
}
```

**Success Response** `201 Created`
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "email": "john@example.com",
    "displayName": "John",
    "avatarUrl": null,
    "bio": null,
    "createdAt": "2026-06-07T10:00:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "dGhpcyBpcyBhIHJlZnJl...",
    "expiresIn": 900
  }
}
```

**Error Responses**
| Status | Code | Message |
|--------|------|---------|
| 409 | USERNAME_TAKEN | Username already exists |
| 409 | EMAIL_TAKEN | Email already registered |
| 422 | VALIDATION_ERROR | Invalid password/username format |

---

### 2. Login

Authenticates a user with username + password. Returns JWT tokens.

```
POST /api/auth/login
```

**Request Body**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Success Response** `200 OK`
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "email": "john@example.com",
    "displayName": "John",
    "avatarUrl": "https://castify.com/avatars/john.jpg",
    "bio": "Full-stack streamer",
    "createdAt": "2026-06-07T10:00:00.000Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "dGhpcyBpcyBhIHJlZnJl...",
    "expiresIn": 900
  }
}
```

**Error Responses**
| Status | Code | Message |
|--------|------|---------|
| 401 | INVALID_CREDENTIALS | Wrong username or password |
| 429 | RATE_LIMITED | Too many login attempts — try again in 60s |

---

### 3. Refresh Token

Exchanges a refresh token for a new access token. Old refresh token is revoked.

```
POST /api/auth/refresh
```

**Request Body**
```json
{
  "refreshToken": "string (required)"
}
```

**Success Response** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "bmV3IHJlZnJlc2ggdG9rZW4=...",
  "expiresIn": 900
}
```

**Error Responses**
| Status | Code | Message |
|--------|------|---------|
| 401 | TOKEN_EXPIRED | Refresh token expired — re-login required |
| 401 | TOKEN_REVOKED | Refresh token already used or revoked |
| 401 | INVALID_TOKEN | Malformed or non-existent refresh token |

---

### 4. Logout

Revokes the current refresh token. Access token remains valid until expiry.

```
POST /api/auth/logout
```

**Headers**
```
Authorization: Bearer <access_token>
```

**Request Body**
```json
{
  "refreshToken": "string (required)"
}
```

**Success Response** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

**Other Responses**
- `204 No Content` — token was already revoked (idempotent)

---

### 5. Get Current User

Returns the authenticated user's profile.

```
GET /api/users/me
```

**Headers**
```
Authorization: Bearer <access_token>
```

**Success Response** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "email": "john@example.com",
  "displayName": "John",
  "avatarUrl": "https://castify.com/avatars/john.jpg",
  "bio": "Full-stack streamer",
  "createdAt": "2026-06-07T10:00:00.000Z",
  "updatedAt": "2026-06-07T10:00:00.000Z",
  "streamKey": "a1b2c3d4e5f6...",
  "isLive": false
}
```

---

### 6. Update Current User

Updates the authenticated user's profile.

```
PATCH /api/users/me
```

**Headers**
```
Authorization: Bearer <access_token>
```

**Request Body** (all fields optional — only send what changes)
```json
{
  "displayName": "string (1-50 chars, optional)",
  "email": "string (valid email, optional)",
  "bio": "string (max 300 chars, optional)",
  "avatarUrl": "string (valid URL, optional)"
}
```

**Success Response** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "email": "newemail@example.com",
  "displayName": "Johnny",
  "avatarUrl": "https://castify.com/avatars/johnny.jpg",
  "bio": "Now streaming Rust projects",
  "createdAt": "2026-06-07T10:00:00.000Z",
  "updatedAt": "2026-06-07T11:30:00.000Z"
}
```

---

### 7. Change Password

Updates the authenticated user's password. Requires current password for verification.

```
POST /api/auth/change-password
```

**Headers**
```
Authorization: Bearer <access_token>
```

**Request Body**
```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (required, min 8 chars, must include 1 uppercase + 1 number)"
}
```

**Success Response** `200 OK`
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses**
| Status | Code | Message |
|--------|------|---------|
| 401 | WRONG_PASSWORD | Current password is incorrect |
| 422 | VALIDATION_ERROR | New password doesn't meet requirements |

---

### 8. Get Public User Profile

Returns a user's public profile by username. No authentication required.

```
GET /api/users/:username
```

**Success Response** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "john_doe",
  "displayName": "John",
  "avatarUrl": "https://castify.com/avatars/john.jpg",
  "bio": "Full-stack streamer",
  "isLive": true,
  "currentStream": {
    "streamId": "stream-0001-0000-0000-000000000001",
    "title": "Building a Live Streaming Platform",
    "category": "Programming",
    "thumbnailUrl": "https://castify.com/thumbnails/stream-001.jpg",
    "startedAt": "2026-06-07T09:00:00.000Z",
    "viewerCount": 142
  },
  "followerCount": 1240,
  "createdAt": "2026-06-07T10:00:00.000Z"
}
```

**Error Responses**
| Status | Code | Message |
|--------|------|---------|
| 404 | USER_NOT_FOUND | No user with that username |

---

### 9. Generate / Rotate Stream Key

Returns or regenerates the authenticated user's stream key. Used by OBS to publish to nginx RTMP.

```
GET    /api/auth/stream-key       (get current key)
POST   /api/auth/stream-key       (regenerate — revokes old key)
```

**Headers**
```
Authorization: Bearer <access_token>
```

**GET Response** `200 OK`
```json
{
  "streamKey": "a1b2c3d4e5f6789012345678abcdef01",
  "streamId": "stream-0001-0000-0000-000000000001",
  "createdAt": "2026-06-07T10:00:00.000Z"
}
```

**POST Response** `200 OK` (old key revoked, new key generated)
```json
{
  "streamKey": "f1e2d3c4b5a6789012345678abcdef02",
  "streamId": "stream-0001-0000-0000-000000000002",
  "createdAt": "2026-06-07T12:00:00.000Z",
  "previousKeyRevoked": true
}
```

**Warning on POST:** Rotating the key immediately disconnects any active stream. The streamer must update OBS with the new key and re-start.

---

### 10. Validate Stream Key (Internal)

Called by rtmp-ingest when OBS connects to nginx. Validates the stream key and returns the associated user + stream info. This endpoint is **internal only** — not exposed through the gateway.

```
POST /internal/validate-stream-key
```

**Headers**
```
X-Internal-Secret: <shared-secret-between-services>
```

**Request Body**
```json
{
  "streamKey": "a1b2c3d4e5f6789012345678abcdef01",
  "clientIp": "192.168.1.100"
}
```

**Success Response** `200 OK`
```json
{
  "valid": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "streamId": "stream-0001-0000-0000-000000000001",
  "username": "john_doe"
}
```

**Failure Response** `200 OK` (nginx-rtmp needs HTTP 200 to reject gracefully)
```json
{
  "valid": false,
  "error": "Invalid or revoked stream key"
}
```

---

## JWT Token Specification

### Access Token

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: {
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // userId
  "username": "john_doe",
  "iat": 1717718400,                                // issued at (epoch seconds)
  "exp": 1717719300                                 // expires at (epoch seconds)
}
```

- **Expiry:** 15 minutes (configurable via `JWT_ACCESS_TOKEN_EXPIRES_IN`)
- **Signed with:** `JWT_SECRET` (HMAC-SHA256)

### Refresh Token

- Stored in `refresh_tokens` table in PostgreSQL
- Format: 64-character random hex string
- **Expiry:** 7 days (configurable via `JWT_REFRESH_TOKEN_EXPIRES_IN`)
- One refresh token per login session
- Revoked on logout, password change, or stream key rotation

---

## Database Tables (from Prisma schema)

### users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| username | VARCHAR(30) | Unique, 3-30 alphanumeric + underscore |
| email | VARCHAR(255) | Unique, nullable |
| password_hash | VARCHAR(60) | bcrypt hash |
| display_name | VARCHAR(50) | Nullable |
| avatar_url | VARCHAR(500) | Nullable |
| bio | VARCHAR(300) | Nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### stream_keys
| Column | Type | Description |
|--------|------|-------------|
| key | VARCHAR(64) | Primary key, random hex |
| user_id | UUID | FK → users.id |
| stream_id | VARCHAR(50) | "stream-XXXX-XXXX-XXXX-XXXXXXXXXXXX" |
| created_at | TIMESTAMP | |

### refresh_tokens
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users.id |
| token | VARCHAR(500) | Unique |
| expires_at | TIMESTAMP | |
| revoked_at | TIMESTAMP | Nullable |
| created_at | TIMESTAMP | |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/auth/login | 5 attempts | 60 seconds per IP |
| POST /api/auth/register | 3 attempts | 60 seconds per IP |
| POST /api/auth/refresh | 10 attempts | 60 seconds per IP |
| All other endpoints | 100 requests | 60 seconds per IP (gateway-level) |

---

## Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 number (0-9)
- No maximum length (bcrypt handles any length)

Username requirements:
- 3-30 characters
- Only alphanumeric characters and underscores (`a-z`, `A-Z`, `0-9`, `_`)
- Must start with a letter
- Case-insensitive for uniqueness (john_doe and John_Doe are the same)

---

## Environment Variables

```bash
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
DATABASE_URL="postgresql://castify:castify@localhost:5432/castify?schema=public"
JWT_SECRET=<random-64-char-string>
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
INTERNAL_SECRET=<shared-secret-with-api-gateway-and-rtmp-ingest>
CORS_ORIGINS=http://localhost:3200,http://localhost:8080
```

---

## Implementation Notes

### Password Hashing
Use `bcrypt` with 12 rounds (configurable). Never store plaintext passwords. Compare with `bcrypt.compare()`, not string equality.

### Refresh Token Storage
Store the **hashed** refresh token in PostgreSQL, not the raw token. Return the raw token to the client. On refresh, hash the incoming token and compare against the database. This prevents token theft from database dumps.

### Stream Key Generation
Generate 32-byte random hex strings. Use `crypto.randomBytes(32).toString("hex")`. Stream keys are never hashed — they must be stored in plaintext so nginx-rtmp can validate them.

### Service-to-Service Auth
The `/internal/validate-stream-key` endpoint must verify the `X-Internal-Secret` header before processing. Services on the same Docker network use this shared secret. In production, use mTLS or a service mesh instead.

### Error Handling
All errors return JSON in this format:
```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {}  // optional, for validation errors
}
```

HTTP status codes:
- `400` — bad request (malformed JSON, missing required fields)
- `401` — authentication failed
- `404` — resource not found
- `409` — conflict (duplicate username/email)
- `422` — validation error
- `429` — rate limited
- `500` — internal server error (never expose stack traces)
