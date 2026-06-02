# Castify — Implementation Phases

This document defines the order in which to build Castify. The goal is to always have something working and demonstrable at the end of each phase. Every phase builds directly on the previous one — nothing is thrown away.

The rule for phasing: **a streamer can go live and a viewer can watch by the end of Phase 1**. Everything after that makes the platform richer, more reliable, and more production-ready.

---

## Why Phases Matter

Building 13 services in parallel is how projects die. You end up with 13 half-finished things and nothing that actually works. The phase plan below ensures you have a running, testable system as early as possible — then you layer features on top of a foundation that you understand deeply because you built it from scratch.

Each phase has a clear "done" definition. Do not move to the next phase until the current one fully works end-to-end.

---

## Phase 1 — The Core Pipeline (Video Works)

**Goal:** A streamer opens OBS, goes live, and a viewer in a browser can watch the stream. Nothing else. No chat. No viewer count. Just working video.

**Why this first:** The video pipeline is the hardest, most unfamiliar part of the platform. RTMP, FFmpeg, HLS, S3 — none of this is typical backend work. Get it working first while your focus is fresh. Everything else in the project is relatively familiar backend territory (APIs, WebSockets, queues). The pipeline is not.

### Services to Build in Phase 1

**1. packages/config** — Build this before anything else. Every service needs environment variable validation. Getting this right once means every future service just imports and uses it. Takes 1–2 hours, saves hours of debugging later.

**2. packages/logger** — Set up structured logging (Pino) as a shared package. Every service will use this. Having consistent log format from day one makes debugging across services dramatically easier.

**3. packages/types** — Define the core TypeScript interfaces upfront: `User`, `Stream`, `StreamStatus`, `KafkaEvent` base types, `HLSSegment`. You will add to this constantly, but having the core types shared prevents duplicated definitions across services.

**4. packages/db** — Write the Prisma schema for the tables you need in Phase 1: `users`, `streams`, `stream_keys`. Run migrations. Generate the client. Share it across services via the monorepo.

**5. auth-service** — Register, login, JWT issuance, stream key generation and validation. This must exist before RTMP ingest can validate incoming streams. Keep it minimal — no OAuth, no password reset — just the core flow.

**6. api-gateway** — Set up routing and JWT validation middleware. In Phase 1 it just needs to forward `/auth/*` requests to auth-service and expose the routes the web app needs. Rate limiting can wait for Phase 3.

**7. rtmp-ingest** — Configure Nginx with the RTMP module. When a stream connects, validate its key against auth-service, publish a `stream.started` event to Kafka. When the stream disconnects, publish `stream.ended`. This is the most infrastructure-heavy service — budget extra time here.

**8. packages/kafka** — Set up Kafka producer and consumer factory before building transcoding-service and hls-packager. Define the `video.segment.ready` topic. Both services need this package.

**9. transcoding-service** — Consume the raw RTMP stream from the ingest pipeline, run FFmpeg to produce 360p and 720p outputs. Do not build all 4 qualities yet — get 2 working first, then add the others. The core challenge is keeping FFmpeg running continuously for a live stream rather than processing a single file.

**10. hls-packager** — Receive transcoded output, slice into 2-second `.ts` segments, write `.m3u8` playlists, upload to MinIO (local) / S3 (cloud). This service is mostly I/O — reading video, writing files, uploading. The tricky part is managing the rolling playlist correctly so the viewer's HLS player always has valid segments to fetch.

**11. metadata-service** — A simple CRUD service. Streamer sets their stream title and category. This data is displayed on the viewer page. Keep it simple — title, category, thumbnail URL, is_live flag. The `is_live` flag gets toggled by consuming `stream.started` and `stream.ended` Kafka events.

**12. web (Phase 1 slice)** — A minimal Next.js app with two pages: a stream page (HLS.js player pointing at the packager output) and a settings page (stream key display, stream title). No chat yet. Just the video player working.

**13. docker-compose.yml** — PostgreSQL, Redis, Kafka, Zookeeper, MinIO, Nginx. Get all of these healthy and tested before writing any service code. Many hours are lost debugging service code when the real problem is a misconfigured Docker network.

### Phase 1 Done When

- OBS connects on port 1935 with a valid stream key
- Browser opens the stream page and video plays within 10 seconds
- Stream ends in OBS and the stream page shows an offline state
- All services start cleanly with `turbo dev`

---

## Phase 2 — Real-time Social Layer (It Feels Like a Platform)

**Goal:** Viewers can chat, see a live viewer count, and send reactions. The stream page goes from a plain video player to something that actually feels alive.

**Why this second:** Phase 1 proves the hard technical foundation works. Phase 2 is where the platform becomes demonstrable to other people — showing someone a stream with chat and viewer count is far more compelling than a raw video player. WebSockets are challenging but significantly more familiar than the video pipeline.

### Services to Build in Phase 2

**1. packages/redis** — Formalise the Redis client, pub/sub helper, and BullMQ setup as a shared package before building the three real-time services. All three use Redis heavily.

**2. chat-service** — WebSocket server. Accept connections from viewers, join them to a "room" per stream ID, fan-out messages via Redis pub/sub across multiple service instances. Store the last 100 messages per stream in Redis so new viewers see recent chat history on connect. Validate messages against auth before broadcasting.

**3. presence-service** — Track viewer count using Redis keys with TTLs. Expose a WebSocket endpoint that pushes updated counts every 5 seconds to all connected clients. Handle the heartbeat mechanism to detect disconnected viewers whose browser closed without a clean disconnect event.

**4. reaction-service** — Accept reaction events from viewer WebSocket connections, batch them in 100ms windows using a Redis counter, broadcast aggregate counts to all viewers. The batching logic is the interesting part — you do not want to broadcast 5,000 individual reaction events per second.

**5. web (Phase 2 additions)** — Add the chat sidebar (WebSocket connection to chat-service), viewer count display (WebSocket connection to presence-service), and reaction overlay (WebSocket connection to reaction-service). The web app now maintains three simultaneous WebSocket connections.

**6. api-gateway (Phase 2 additions)** — Add WebSocket proxy routing — connections to `/ws/chat`, `/ws/presence`, `/ws/reactions` get routed to the correct service. WebSocket proxying is different from HTTP proxying — make sure your gateway handles the upgrade handshake correctly.

### Phase 2 Done When

- Multiple browser tabs can open the stream page and all see the same chat
- Viewer count increments when a new tab opens and decrements when it closes
- Reactions animate on screen when emotes are sent
- Chat messages from one viewer appear on all other viewers' screens within 500ms

---

## Phase 3 — Content and Data (The Platform Has Memory)

**Goal:** Streams are recorded as VODs that viewers can watch after the stream ends. Creators can see how their stream performed. Basic notification alerts when favourite streamers go live.

**Why this third:** After Phase 2 you have a fully functional live streaming experience. Phase 3 adds value that persists beyond the live moment — recordings, analytics, and reach. These are background/async services with no real-time user-facing pressure, making them good candidates for Phase 3 when you understand the codebase well.

### Services to Build in Phase 3

**1. vod-service** — Set up BullMQ workers that consume `stream.ended` events from Kafka and trigger a stitching job. The job reads all `.ts` segments for the stream from S3, converts the live playlist into a static VOD playlist, stores the result back in S3, and writes a `vod` record to PostgreSQL. Also build the clip endpoint — a viewer requests a clip, a job is queued, the clip is stitched from specific segments.

**2. analytics-service** — Consume `viewer.joined`, `viewer.left`, `chat.message.sent`, and `stream.ended` events from Kafka. Write time-series data into ClickHouse. Build two query endpoints: one for the creator dashboard (peak viewers, concurrent viewers over time, chat message rate) and one for the platform (top streams by viewer count, trending categories). Also consume bitrate and dropped-frame data from the RTMP ingest service and expose it via WebSocket to the creator dashboard.

**3. notification-service** — Consume `stream.started` from Kafka. Look up all subscribers of that streamer from PostgreSQL. Dispatch in-app notifications (write to a `notifications` table that the web app polls or receives via WebSocket). Start with in-app only — email and push can come in Phase 4.

**4. web (Phase 3 additions)** — VOD library page, individual VOD playback page, creator analytics dashboard (charts for viewer count over time, chat rate, peak viewers), clips section, in-app notification bell with unread count.

### Phase 3 Done When

- A completed stream is available as a VOD within 5 minutes of ending
- Clips can be created and shared via a link
- Creator dashboard shows a viewer count graph for the just-completed stream
- Subscribed users see an in-app notification when a streamer goes live

---

## Phase 4 — Reliability and Moderation (Production-Ready Thinking)

**Goal:** The platform is safe to let real users use. Bad actors can be dealt with. Services handle failure gracefully. Performance holds under realistic load.

**Why this last:** Moderation and reliability work is less visible but essential before sharing the platform publicly. Building it last means you have full context of how all services interact, which makes you better at designing the failure recovery patterns.

### Services to Build in Phase 4

**1. moderation-service** — Banned word filter backed by a configurable list in PostgreSQL, hot-cached in Redis. Per-channel ban list (streamer bans a specific user from their chat). Timeout system (user is silenced for N minutes). Chat-service calls moderation-service synchronously before broadcasting each message. Also build streamer-facing moderation tools in the web app — ban, timeout, unban.

**2. auth-service (Phase 4 additions)** — Stream key rotation endpoint with immediate effect (connected RTMP session using the old key is terminated). Refresh token support so users are not logged out every hour. Optional: OAuth login (GitHub, Google).

**3. api-gateway (Phase 4 additions)** — Proper rate limiting per endpoint and per user. The chat endpoint in particular needs strict rate limiting (e.g. maximum 5 messages per 3 seconds per user) enforced at the gateway before the message even reaches chat-service.

**4. notification-service (Phase 4 additions)** — Email notifications via a transactional email provider (Resend or Postmark). Mobile push via a push notification service. Streamer-controlled notification preferences (a user can opt out of emails while keeping in-app).

**5. All services — error handling and retry logic** — Review every Kafka consumer and add proper dead-letter queue (DLQ) handling for messages that fail processing. Add retry logic with exponential backoff. Review every BullMQ job and add failure handling. Define what happens when each service is unavailable — does the platform degrade gracefully or does it fail completely?

**6. Load testing** — Simulate 1,000 concurrent WebSocket connections to chat-service. Simulate 10 simultaneous live streams through the transcoding pipeline. Find where things break before real users do.

### Phase 4 Done When

- Banned users cannot send chat messages
- A streamer can rotate their stream key and the old key immediately stops working
- Every service has a health check endpoint (`/health`) that returns meaningful status
- Restarting any single service does not bring the platform down
- Basic load test passes without errors

---

## Summary Table

| Phase              | Services                                                                                                                           | Outcome                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1 — Core Pipeline  | config, logger, types, db, auth, api-gateway, rtmp-ingest, kafka, transcoding, hls-packager, metadata, web (basic), docker-compose | Streamer goes live, viewer watches video             |
| 2 — Social Layer   | redis, chat, presence, reaction, web additions, gateway additions                                                                  | Real-time chat, viewer count, reactions              |
| 3 — Content + Data | vod, analytics, notification (basic), web additions                                                                                | VODs, clips, analytics dashboard, live notifications |
| 4 — Reliability    | moderation, auth additions, gateway additions, notification additions, load testing                                                | Safe for real users, graceful failure handling       |

---

## Packages Build Order

Build shared packages before the services that depend on them. This is the correct order:

```
1. packages/config          ← needed by every service
2. packages/logger          ← needed by every service
3. packages/types           ← needed by every service
4. packages/db              ← needed by auth, metadata, chat, moderation, vod
5. packages/auth            ← needed by api-gateway, chat
6. packages/redis           ← needed by chat, presence, reaction, vod
7. packages/kafka           ← needed by rtmp-ingest, transcoding, hls-packager, analytics, notification
```

Never let an `apps/` service directly depend on another `apps/` service via the monorepo. All shared code lives in `packages/`. Services communicate over the network (HTTP or Kafka or Redis) — never via direct module imports.

---

## What to Have Running Before Writing Service Code

Before building any service, run `docker compose up` and confirm every backing service is healthy:

```
PostgreSQL   →  connect with psql, create the Castify database
Redis        →  redis-cli ping returns PONG
Kafka        →  create the initial topics manually, produce a test message
MinIO        →  open the web UI at localhost:9001, create the hls-segments bucket
ClickHouse   →  connect and run SELECT 1
Nginx        →  curl localhost:8080 returns a response
```

Spending 2–3 hours getting infrastructure solid before writing any application code will save you many hours of debugging later where the real problem is a network configuration issue, not a bug in your code.
