# rtmp-ingest

The RTMP ingest service for Castify. It is the bridge between **nginx's RTMP server** (which receives raw video from OBS) and **the rest of the platform** (which is all HTTP/WebSocket/Kafka).

---

## What it does in one sentence

When OBS connects to nginx on port 1935, nginx asks this service *"is this stream key valid?"*. If yes, the stream is allowed and a Kafka event fires. If no, OBS gets a connection error.

---

## Table of Contents

1. [The Big Picture — how RTMP streaming works](#1-the-big-picture)
2. [Why rtmp-ingest exists as a separate service](#2-why-a-separate-service)
3. [nginx-rtmp-module callbacks explained](#3-nginx-rtmp-callbacks)
4. [The stream key validation flow (step by step)](#4-stream-key-validation-flow)
5. [Kafka events](#5-kafka-events)
6. [Code architecture](#6-code-architecture)
7. [Environment variables](#7-environment-variables)
8. [Running locally](#8-running-locally)
9. [Testing with OBS](#9-testing-with-obs)
10. [FAQ / common issues](#10-faq)

---

## 1. The Big Picture

```
┌─────────┐   RTMP stream    ┌───────────────┐   HTTP POST   ┌──────────────────┐
│   OBS   │ ────────────────▶│  nginx:1935   │ ────────────▶ │  rtmp-ingest     │
│(streamer│   (raw H.264     │  (nginx-rtmp  │  on_publish   │  :3001           │
│  app)   │   video bytes)   │  module)      │◀──────────── │  (this service)  │
└─────────┘                  └───────────────┘   200 OK /    └────────┬─────────┘
                                     │           401 Reject           │
                                     │ (if 200)                       │ validate key
                                     │ nginx starts                   ▼
                                     │ processing                ┌────────────┐
                                     │ video                     │ auth-service│
                                     ▼                           │  :3000      │
                              ┌─────────────┐                    └────────────┘
                              │  /tmp/hls   │
                              │  (segments) │    ┌──────────────────────────┐
                              │  served on  │    │  Kafka (stream.started / │
                              │  :8080/hls  │    │         stream.ended)    │
                              └─────────────┘    └──────────────────────────┘
```

### What is RTMP?

**RTMP** (Real-Time Messaging Protocol) was invented by Macromedia (now Adobe) in the early 2000s. It is a TCP-based protocol designed to stream audio and video with low latency. Despite being old, it remains the industry standard for *sending* a live stream from a broadcaster to a server — OBS, Streamlabs, and every major streaming tool uses RTMP as the output protocol.

RTMP is **not** used for viewers. Viewers use **HLS** (HTTP Live Streaming), which is a much newer protocol that works in every browser without plugins.

### What is nginx-rtmp-module?

Nginx is a web server. The [nginx-rtmp-module](https://github.com/arut/nginx-rtmp-module) adds a `rtmp {}` config block to nginx that turns it into an RTMP server. When OBS connects to port 1935, nginx handles the RTMP handshake, receives the video stream, and can:

- Write it to disk as raw video
- Convert it to HLS segments (`.ts` files + `.m3u8` playlist)
- Forward it to another RTMP server (push relay)
- Call HTTP callbacks when specific events happen

It's the **HTTP callbacks** that this service listens to.

---

## 2. Why a Separate Service?

You might ask: *why not just configure nginx to accept all RTMP streams and not bother with validation?*

1. **Security**: Without validation, anyone who discovers your server IP can push a stream. A stream key is the password for the RTMP ingest point.

2. **Platform integration**: When a stream starts, many other services need to know. The notification service should alert followers. The presence service should mark the streamer as live. The analytics service should start collecting data. All of these are triggered by the `stream.started` Kafka event that this service publishes.

3. **Separation of concerns**: nginx should be a fast, dumb video forwarder. Business logic (who can stream, what events fire, what gets stored) lives in services — not in nginx config.

4. **Control**: This service exposes the nginx `/control` API, which lets us forcibly disconnect a stream (e.g. when a streamer rotates their stream key mid-stream).

---

## 3. nginx-rtmp Callbacks

The `nginx-rtmp-module` can call an HTTP endpoint when specific RTMP events happen. We configure three in `infrastructure/nginx/rtmp.conf`:

```nginx
application live {
    on_publish      http://host.docker.internal:3001/rtmp/on-publish;
    on_publish_done http://host.docker.internal:3001/rtmp/on-publish-done;
    on_play         http://host.docker.internal:3001/rtmp/on-play;
}
```

> `host.docker.internal` is how a Docker container reaches the host machine (your Mac). This lets the nginx container call rtmp-ingest which runs on the host via `bun dev`.

### What nginx sends

nginx fires a **POST** request with `Content-Type: application/x-www-form-urlencoded`. The body looks like:

```
call=publish
addr=192.168.1.10
clientid=7
app=live
flashver=FMLE%2F3.0+%28compatible%3B+FMSc%2F1.0%29
swfurl=
tcurl=rtmp%3A%2F%2Flocalhost%3A1935%2Flive
pageurl=
name=abc123def456xyz789
```

The most important field is **`name`** — this is the stream key. It's whatever comes after the application name in the OBS URL:

```
rtmp://localhost:1935/live/abc123def456xyz789
                          ^^^^^^^^^^^^^^^^^^^
                          body.name = "abc123def456xyz789"
```

### on_publish — the gate

Called **before** nginx starts forwarding video. nginx **waits** for the HTTP response:

| Response | nginx behaviour |
|---|---|
| `200 OK` | RTMP connection is allowed. OBS starts streaming. |
| `401` / `403` / any 4xx-5xx | RTMP connection is rejected. OBS sees "connection refused". |

> **This is the only place in the entire platform where stream authentication happens at the ingest layer.** Get it wrong and either anyone can stream, or no one can.

### on_publish_done — cleanup

Called **after** the RTMP session ends (OBS disconnects, network drops, etc.). nginx does NOT wait for our response — it fires and forgets. We use this to:
- Publish `stream.ended` to Kafka
- Calculate stream duration
- Clean up in-memory state

### on_play — RTMP viewer

Called when someone connects to *watch* via raw RTMP (not HLS). In Castify, real viewers use HLS — this handler exists mainly for debugging and future extensibility.

---

## 4. Stream Key Validation Flow

Here is exactly what happens when a streamer goes live:

```
OBS                nginx               rtmp-ingest         auth-service        Kafka
 │                   │                      │                    │               │
 │── RTMP connect ──▶│                      │                    │               │
 │   rtmp://...      │                      │                    │               │
 │   /live/KEY       │                      │                    │               │
 │                   │── POST /rtmp/on-publish ──▶│              │               │
 │                   │   (form body: name=KEY)     │              │               │
 │                   │                      │── GET /internal/stream-keys/validate ▶│
 │                   │                      │   Header: X-Stream-Key: KEY       │
 │                   │                      │◀── 200 { userId, streamId } ──────│
 │                   │                      │                    │               │
 │                   │                      │── Publish stream.started ─────────▶│
 │                   │                      │   { streamId, userId, startedAt }  │
 │                   │◀── 200 OK ───────────│                    │               │
 │◀── RTMP allowed ──│                      │                    │               │
 │                   │                      │                    │               │
 │ [streaming...]    │ [nginx writes HLS]   │                    │               │
 │                   │                      │                    │               │
 │── RTMP disconnect ▶│                     │                    │               │
 │                   │── POST /rtmp/on-publish-done ─▶│          │               │
 │                   │                      │── Publish stream.ended ───────────▶│
 │                   │                      │   { streamId, durationSeconds }    │
```

### The in-memory stream registry

When `on_publish` fires successfully, we store:
```typescript
activeStreams.set(streamKey, {
  streamId: "uuid-from-auth-service",
  userId: "user-uuid",
  startedAt: new Date(),
});
```

When `on_publish_done` fires, we read this back:
```typescript
const { streamId, userId, startedAt } = activeStreams.get(streamKey);
const durationSeconds = (Date.now() - startedAt.getTime()) / 1000;
```

This is an in-memory `Map` — it does not survive a service restart. For a production multi-instance deployment, this would live in Redis.

### Why fail closed?

If auth-service is unreachable when a streamer tries to go live, `authService.validateStreamKey()` returns `{ valid: false }` and the stream is rejected. We could fail open (allow the stream anyway), but that would let anyone stream if auth-service is down. Security > availability at the ingest point.

---

## 5. Kafka Events

rtmp-ingest publishes two events. It never consumes.

### `stream.started`

Published when a valid stream key connects. Consumer services:

| Service | What it does |
|---|---|
| `presence-service` | Marks the stream as live, initialises viewer count = 0 |
| `notification-service` | Sends "X is live!" alerts to followers |
| `analytics-service` | Opens a time-series window for this stream in ClickHouse |
| `metadata-service` | Sets `is_live = true` in PostgreSQL |

Payload:
```json
{
  "streamId": "uuid",
  "userId": "uuid",
  "streamKey": "abc123...",
  "startedAt": "2024-01-15T10:30:00.000Z",
  "clientIp": "192.168.1.10",
  "nginxClientId": "7"
}
```

### `stream.ended`

Published when the RTMP session ends. Consumer services:

| Service | What it does |
|---|---|
| `vod-service` | Stitches HLS segments from S3 into a permanent VOD |
| `analytics-service` | Finalizes stream metrics |
| `presence-service` | Sets viewer count to 0, marks stream offline |
| `metadata-service` | Sets `is_live = false` |

Payload:
```json
{
  "streamId": "uuid",
  "userId": "uuid",
  "streamKey": "abc123...",
  "endedAt": "2024-01-15T11:45:00.000Z",
  "durationSeconds": 4500
}
```

### Message keys and partition ordering

Both events use `streamId` as the Kafka message key. Kafka routes messages with the same key to the same partition. This guarantees that `stream.started` always arrives before `stream.ended` for the same stream, even if consumers lag or partitions are reassigned.

---

## 6. Code Architecture

```
apps/rtmp-ingest/
├── src/
│   ├── index.ts                   # Entry point: Kafka connect + Bun server export
│   ├── app.ts                     # Hono app factory: middleware + route mounting
│   ├── config.ts                  # Zod env validation — fails fast on bad config
│   ├── logger.ts                  # Pino logger (pretty in dev, JSON in prod)
│   ├── types.ts                   # TypeScript interfaces for all data shapes
│   │
│   ├── handlers/                  # One file per nginx callback
│   │   ├── onPublish.ts           # ← most important: stream gate + Kafka event
│   │   ├── onPublishDone.ts       # Stream end + Kafka event + cleanup
│   │   └── onPlay.ts              # RTMP viewer connection (allow/deny)
│   │
│   ├── routes/
│   │   ├── rtmp.ts                # POST /rtmp/* routes wired to handlers
│   │   └── health.ts              # GET /health
│   │
│   └── services/
│       ├── authService.ts         # HTTP client → auth-service + in-memory cache
│       └── kafkaService.ts        # KafkaJS producer singleton
│
├── package.json
├── tsconfig.json
└── README.md
```

### Why Hono?

Hono is the HTTP framework chosen across all Castify services. It is:
- **Lightweight** (~14kb, zero dependencies)
- **Fast** — benchmarks faster than Express and Fastify
- **Bun-native** — uses Bun's built-in HTTP server via `export default { port, fetch }`
- **TypeScript-first** — `c.req`, `c.res`, `c.json()` are all fully typed

### Why not Express?

Express was designed for Node.js circa 2010. On Bun it works but you lose Bun's native HTTP optimisations. Hono uses the Web Standards `Request`/`Response` API that Bun implements natively.

### The Bun server pattern

```typescript
// src/index.ts
export default {
  port: 3001,
  fetch: app.fetch,  // app.fetch is Hono's Web Standard handler
};
```

Bun sees the `default` export and starts an HTTP server on `:3001`. No `listen()` call. No `http.createServer()`. Bun's built-in HTTP server handles everything.

---

## 7. Environment Variables

All variables are validated by Zod in `src/config.ts`. If any required variable is missing the service exits immediately with a clear error message.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port this service listens on |
| `NODE_ENV` | `development` | `development` \| `production` |
| `LOG_LEVEL` | `info` | `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `AUTH_SERVICE_URL` | `http://localhost:3000` | URL of the auth-service |
| `INTERNAL_SECRET` | required | Shared 32+ character secret used to authenticate calls to auth-service |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated Kafka broker list |
| `KAFKA_CLIENT_ID` | `rtmp-ingest` | Identifies this producer in Kafka |
| `KAFKA_TOPIC_STREAM_STARTED` | `stream.started` | Topic for stream start events |
| `KAFKA_TOPIC_STREAM_ENDED` | `stream.ended` | Topic for stream end events |
| `NGINX_RTMP_APP` | `live` | RTMP application name to accept (matches rtmp.conf) |
| `NGINX_CONTROL_URL` | `http://localhost:8080/control` | nginx control API for dropping publishers |
| `STREAM_KEY_CACHE_TTL_SEC` | `30` | How long to cache valid stream key results |

These are all pre-populated in the root `.env` file.

---

## 8. Running Locally

### Prerequisites

```bash
# 1. Start the infrastructure stack (Kafka, Postgres, Redis, MinIO, nginx)
cd infrastructure
docker compose up -d

# 2. Confirm Kafka is healthy
docker compose ps

# 3. Install dependencies (already done if you ran bun install)
cd apps/rtmp-ingest
bun install
```

### Start the service

```bash
bun run dev
```

You should see:
```
[rtmp-ingest] Starting rtmp-ingest...
[rtmp-ingest] Kafka producer connected
[rtmp-ingest] rtmp-ingest ready — listening on :3001
```

### Verify it's working

```bash
# Health check
curl http://localhost:3001/health
# → { "status": "ok", "service": "rtmp-ingest", "activeStreams": 0 }

# Simulate an on_publish callback (what nginx sends)
curl -X POST http://localhost:3001/rtmp/on-publish \
  -d "call=publish&addr=127.0.0.1&clientid=1&app=live&name=test-stream-key"
# → 401 (because auth-service isn't running yet / key doesn't exist)
# → 200 (once auth-service is running and key exists)
```

---

## 9. Testing with OBS

Once both rtmp-ingest and auth-service are running:

1. Open OBS → Settings → Stream
2. Set **Service** to `Custom`
3. Set **Server** to `rtmp://localhost:1935/live`
4. Set **Stream Key** to your stream key (get it from auth-service after registering)
5. Click **Start Streaming**

OBS will connect to nginx on port 1935. nginx calls rtmp-ingest `/rtmp/on-publish`. rtmp-ingest calls auth-service. If the key is valid, OBS starts sending video.

Watch the rtmp-ingest logs:
```
[rtmp-ingest] on_publish callback received  { app: 'live', clientIp: '...' }
[rtmp-ingest]  Stream started — RTMP connection allowed  { streamId: '...', userId: '...' }
[rtmp-ingest] Published stream.started  { streamId: '...', topic: 'stream.started' }
```

Watch Kafka events via Kafka UI at `http://localhost:9000`.

---

## 10. FAQ

### Why does nginx call our HTTP service instead of reading from a DB directly?

nginx is a C binary — it can't import your Prisma schema or call your Postgres directly. The nginx-rtmp-module's HTTP callback is the standard extension point. Our HTTP service is the translator between nginx's C world and the Node.js/TypeScript world.

### What happens if rtmp-ingest is down when OBS connects?

nginx cannot reach the `on_publish` URL → it returns a connection error → OBS sees "stream rejected". The RTMP session is never opened. This is the safe failure mode — better to reject all streams than to allow unvalidated streams.

### What if the stream key cache returns a stale valid result?

If a user deletes their account while streaming, the cached validation will still be `valid: true` for up to `STREAM_KEY_CACHE_TTL_SEC` (30 seconds). The stream will continue for that window. When the cache expires and the next validation fires (or on the next stream attempt), the key will be correctly rejected. For key rotation/revocation to be immediate, call the nginx control API to drop the publisher.

### Why is `activeStreams` a Map and not Redis?

For Phase 1 local development, simplicity wins. A single instance of rtmp-ingest with an in-memory Map is sufficient. When you scale to multiple instances (Phase 4 production prep), replace the Map with Redis `HSET`/`HGET` with a TTL. The data shape stays exactly the same.

### The `on_publish_done` handler always returns 200 — why?

nginx does not read the response from `on_publish_done`. The RTMP session is already torn down by the time this callback fires. Returning anything other than 200 would just cause an error log in nginx with no real effect. Always 200.
