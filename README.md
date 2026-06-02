# Castify

A distributed, self-hostable live streaming platform built with modern backend infrastructure. Castify lets creators stream live video to viewers worldwide with real-time chat, reactions, viewer analytics, VOD recording, and a full creator dashboard — similar to Twitch, but entirely yours to run and extend.

This is a hobby/portfolio project built to deeply understand distributed systems, real-time communication, video pipelines, and microservice architecture at scale.

---

## What It Does

- A streamer opens OBS and pushes an RTMP stream to Castify
- Castify transcodes it into multiple qualities (360p, 480p, 720p, 1080p) in real time
- Viewers watch via HLS in the browser, delivered through a CDN
- Chat, reactions, and viewer counts update live via WebSocket
- Streams are recorded automatically and available as VODs after the stream ends
- Creators see real-time stream health (bitrate, dropped frames, viewer count) in their dashboard

---

## Architecture Overview

Castify is split into two independent worlds that run in parallel:

**Video Pipeline** — The streamer's video travels through a chain of services: RTMP Ingest → Transcoding → HLS Packager → S3 → CDN → Viewer. This is unidirectional, latency-sensitive, and compute-heavy.

**Social Layer** — Everything real-time around the video: chat fan-out to thousands of viewers, live viewer counts, emote reactions, notifications, and analytics. This is event-driven and WebSocket-heavy.

These two worlds are loosely coupled. They share user identity and the concept of "a stream is live" but their internals are completely independent. If the chat service goes down, the video keeps playing.

---

## Tech Stack

| Layer            | Technology                                   |
| ---------------- | -------------------------------------------- |
| Runtime          | Node.js with Bun                             |
| Language         | TypeScript across all services               |
| HTTP Framework   | Hono (lightweight, fast)                     |
| Monorepo         | Turborepo                                    |
| ORM              | Prisma                                       |
| Primary DB       | PostgreSQL                                   |
| Cache + Pub/Sub  | Redis                                        |
| Job Queues       | BullMQ (on top of Redis)                     |
| Event Bus        | Apache Kafka                                 |
| Object Storage   | AWS S3 (MinIO locally)                       |
| CDN              | AWS CloudFront                               |
| Analytics DB     | ClickHouse                                   |
| Video Processing | FFmpeg (binary, used by transcoding-service) |
| RTMP Server      | Nginx with RTMP module                       |
| Frontend         | Next.js 15 App Router                        |
| Real-time        | WebSockets (ws / uWebSockets.js)             |
| Containerisation | Docker + Docker Compose                      |

---

## Repository Structure

```
Castify/
│
├── apps/
│   ├── api-gateway/              # Single entry point for all client HTTP/WS traffic
│   ├── auth-service/             # User accounts, JWT tokens, stream key management
│   ├── rtmp-ingest/              # Accepts RTMP stream from OBS, validates stream key
│   ├── transcoding-service/      # FFmpeg worker pool, multi-quality video output
│   ├── hls-packager/             # Segments video into .ts files, writes .m3u8, uploads to S3
│   ├── chat-service/             # WebSocket server with Redis pub/sub fan-out
│   ├── presence-service/         # Viewer counts, streamer online/offline tracking
│   ├── reaction-service/         # Real-time emote reactions, batched per 100ms
│   ├── notification-service/     # Push, email, in-app alerts on stream events
│   ├── analytics-service/        # Stream health metrics + viewer behaviour → ClickHouse
│   ├── moderation-service/       # Chat filtering, banned words, user ban management
│   ├── vod-service/              # Stitches recorded HLS segments into VODs and clips
│   ├── metadata-service/         # Stream title, category, thumbnail, tags (CRUD)
│   └── web/                      # Next.js — viewer page + creator dashboard
│
├── packages/
│   ├── db/                       # Prisma schema + generated client, shared by all services
│   ├── redis/                    # Redis client setup, pub/sub helpers, BullMQ config
│   ├── kafka/                    # Kafka producer/consumer factory, topic definitions
│   ├── types/                    # Shared TypeScript interfaces, enums, event payloads
│   ├── config/                   # Environment variable parsing and validation (Zod)
│   ├── logger/                   # Pino logger, request logging middleware
│   └── auth/                     # JWT sign/verify utilities, auth middleware
│
├── infrastructure/
│   ├── docker/                   # Per-service Dockerfiles
│   │   ├── api-gateway.Dockerfile
│   │   ├── auth-service.Dockerfile
│   │   ├── rtmp-ingest.Dockerfile
│   │   ├── transcoding-service.Dockerfile
│   │   ├── hls-packager.Dockerfile
│   │   ├── chat-service.Dockerfile
│   │   ├── presence-service.Dockerfile
│   │   ├── reaction-service.Dockerfile
│   │   ├── notification-service.Dockerfile
│   │   ├── analytics-service.Dockerfile
│   │   ├── moderation-service.Dockerfile
│   │   ├── vod-service.Dockerfile
│   │   ├── metadata-service.Dockerfile
│   │   └── web.Dockerfile
│   ├── nginx/
│   │   ├── rtmp.conf             # RTMP server block — accepts streams on port 1935
│   │   └── hls.conf              # HLS origin — serves segments from local disk/S3 proxy
│   └── docker-compose.yml        # Spins up all backing services for local development
│
├── turbo.json                    # Turborepo pipeline config
├── package.json                  # Root workspace, shared scripts
├── .env.example                  # All environment variables documented with descriptions
└── README.md
```

---

## Services — What Each One Does and Why It Exists

### api-gateway

**What:** The single door into the platform for all external traffic — HTTP requests from the browser and WebSocket upgrade requests. It validates JWT tokens, enforces rate limits, and forwards requests to the correct internal service.

**Why separate:** Without a gateway, every service would need to implement its own auth and rate limiting, leading to duplication and inconsistency. The gateway centralises this and shields internal services from the outside world. Internal service-to-service calls skip the gateway entirely.

---

### auth-service

**What:** Handles user registration, login, logout, JWT issuance, and stream key management. Every streamer has a unique stream key — a long random string they paste into OBS. Auth-service generates, stores, and validates these keys.

**Why separate:** Authentication logic changes independently of business logic. Token strategies, OAuth providers, key rotation policies — all of these evolve on their own schedule. Keeping auth isolated means you can change it without touching other services.

---

### rtmp-ingest

**What:** Runs an Nginx RTMP server that listens on port 1935. When OBS connects and begins pushing a stream, this service validates the stream key by calling auth-service, then hands the raw video bytes downstream into the Kafka pipeline. It also publishes a `stream.started` Kafka event the moment a valid stream connects.

**Why separate:** RTMP is a stateful, long-lived TCP connection that can last hours. This is fundamentally different from normal HTTP request handling and requires specialised server infrastructure. Isolating it means it can be scaled and configured independently from everything else.

---

### transcoding-service

**What:** Consumes raw video from the ingest pipeline and runs FFmpeg to transcode it simultaneously into multiple quality levels — 360p, 480p, 720p, and 1080p. Unlike the video transcoding project (which is a one-time job), here this runs continuously for the entire duration of the stream. Outputs are fed downstream toward the packager.

**Why separate:** Transcoding is the most compute-heavy operation in the entire platform. Separating it allows you to scale transcoding workers independently — spin up more workers when many streams are live, scale down when they end. It also lets you put transcoding workers on GPU-optimised instances while running other services on cheaper hardware.

---

### hls-packager

**What:** Takes the transcoded video streams and slices them into 2-second `.ts` segment files, continuously generating updated `.m3u8` playlist files for each quality level. Every 2 seconds, new segment files are uploaded to S3 and the playlist is updated. This is what turns a live video stream into something a browser HLS player can consume.

**Why separate:** Packaging is a distinct concern from transcoding. The packager's job is file management and S3 I/O — quite different from CPU-bound FFmpeg work. Separating them also allows for future optimisation, such as switching to Low-Latency HLS (LL-HLS) without touching the transcoder.

---

### chat-service

**What:** Manages WebSocket connections for all viewers watching a stream. When a viewer sends a message, chat-service publishes it to a Redis pub/sub channel named after the stream ID. All other chat-service instances subscribed to that channel receive the message and push it to their connected viewers. This is the fan-out pattern that scales chat to tens of thousands of simultaneous viewers.

**Why separate:** Chat has unique scaling characteristics — massive concurrent WebSocket connections and high-frequency fan-out. It also has its own state (chat history, active rooms) and its own failure modes. Isolating it means a chat outage doesn't affect the video pipeline, and you can scale chat servers independently of everything else.

---

### presence-service

**What:** Tracks who is watching which stream in real time. When a viewer connects, their session is registered in Redis with an expiring key. Their client sends a heartbeat every 30 seconds to keep the key alive. If heartbeats stop (browser closed, connection dropped), the key expires and they are automatically removed from the count. Viewer counts are broadcast to all connected clients via WebSocket every few seconds.

**Why separate:** Presence requires very different data patterns from chat — it is all about ephemeral state (who is online right now) with aggressive TTLs, whereas chat is about durable ordered messages. Mixing these into one service creates an unnecessarily complex codebase.

---

### reaction-service

**What:** Handles emote reactions — the animated hearts, flames, and emotes that float across the screen. Because reactions can fire thousands of times per second during exciting moments, this service does not broadcast individual reactions. Instead it batches all reactions in a 100ms window, counts them by type, and broadcasts the aggregate. The frontend animates based on counts, not individual events. Reactions are intentionally lossy — dropping one is acceptable.

**Why separate:** Reactions have deliberately different delivery guarantees from chat. Chat needs ordered, reliable delivery. Reactions are best-effort, high-frequency, and aggregate-based. These are fundamentally different system designs. Putting them together would mean making compromises that hurt both.

---

### notification-service

**What:** A pure event consumer. It listens for Kafka events (`stream.started`, `stream.ended`, `clip.created`) and dispatches notifications to users who have subscribed to that streamer — push notifications, emails, and in-app alerts. It runs entirely in the background and has no real-time component.

**Why separate:** Notification logic changes often — new channels (Slack, Discord webhooks), new triggers, new templates. Keeping it isolated means you can change notification behaviour without touching anything in the video pipeline or social layer.

---

### analytics-service

**What:** Two responsibilities — real-time stream health for the creator, and historical viewer analytics. It consumes events from Kafka (viewer counts, bitrate readings from the ingest service, chat message rates) and writes them into ClickHouse, a column-oriented database optimised for time-series aggregations. The creator dashboard queries this service to show "how many people were watching at each minute of the stream."

**Why separate:** Analytics data volume is high and its query patterns (aggregations over time ranges) are completely different from the transactional queries in PostgreSQL. ClickHouse handles these aggregations orders of magnitude faster than a general-purpose relational database. Separating analytics means you can optimise its database independently.

---

### moderation-service

**What:** Sits in the path of every chat message. Before chat-service broadcasts a message, it calls moderation-service to check: Is the sender banned from this channel? Does the message contain banned words or patterns? Moderation-service maintains ban lists and word filters in PostgreSQL, hot-cached in Redis for fast lookups.

**Why separate:** Moderation rules change constantly and vary per streamer. Some streamers want strict filtering, others want none. Separating moderation means you can add new filtering strategies, integrate external trust-and-safety APIs, or build a manual review queue without touching the chat service at all.

---

### vod-service

**What:** After a stream ends, vod-service takes all the `.ts` segment files that were uploaded to S3 during the stream and stitches them into a permanent, static `.m3u8` playlist — turning the live stream into a replayable VOD. It also handles clip creation: when a viewer requests "clip the last 30 seconds," vod-service identifies those specific segments, stitches them into a new file, and stores it. All of this is async, managed through BullMQ job queues.

**Why separate:** VOD processing is an async, bursty workload — many jobs arrive at once when multiple streams end simultaneously. Using a dedicated job queue with worker concurrency control prevents this from overwhelming other services. It also needs direct access to S3 in ways other services do not.

---

### metadata-service

**What:** A straightforward CRUD service for stream descriptive data — title, category (Gaming, Music, IRL), thumbnail image URL, language, tags. It serves the stream discovery page, search results, and the stream info panel. Backed purely by PostgreSQL.

**Why separate:** Despite being simple, metadata has a different read/write pattern from other services — it is read extremely frequently (every page load) but written rarely (only when the streamer updates it). Separating it allows you to add aggressive caching in front of it without affecting other services.

---

### web

**What:** The Next.js frontend. Contains two main areas — the viewer page (HLS video player, chat window, reactions, viewer count) and the creator dashboard (stream health graphs, chat moderation tools, VOD management, stream settings). Communicates exclusively through the api-gateway; never calls internal services directly.

---

## Backing Services (docker-compose.yml)

These are not your code — they are the infrastructure your services depend on. Run them all locally with a single `docker compose up`.

| Service    | Port       | Used By                                                         | Purpose                                                              |
| ---------- | ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| PostgreSQL | 5432       | auth, metadata, chat, moderation, vod                           | Primary relational store — users, streams, VODs, bans, subscriptions |
| Redis      | 6379       | chat, presence, reaction, moderation, vod                       | Pub/sub fan-out, viewer counters, hot caches, BullMQ job queues      |
| Kafka      | 9092       | rtmp-ingest, transcoding, hls-packager, analytics, notification | Async event bus — video pipeline events and platform-wide events     |
| Zookeeper  | 2181       | Kafka                                                           | Kafka coordination (required to run Kafka)                           |
| MinIO      | 9000       | hls-packager, vod-service                                       | Local S3-compatible storage for HLS segments and VOD files           |
| ClickHouse | 8123       | analytics-service                                               | Time-series analytics — viewer counts, bitrate, engagement over time |
| Nginx      | 1935, 8080 | rtmp-ingest, hls-packager                                       | Port 1935 for RTMP ingest, port 8080 for HLS segment serving         |

---

## Kafka Topics

| Topic                 | Producer            | Consumers                                      | Payload                                                |
| --------------------- | ------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `stream.started`      | rtmp-ingest         | presence, notification, analytics, metadata    | `{ streamId, userId, startedAt }`                      |
| `stream.ended`        | rtmp-ingest         | vod-service, analytics, presence, notification | `{ streamId, userId, endedAt, durationSeconds }`       |
| `video.segment.ready` | transcoding-service | hls-packager                                   | `{ streamId, quality, segmentPath, sequenceNumber }`   |
| `chat.message.sent`   | chat-service        | moderation, analytics                          | `{ streamId, userId, message, sentAt }`                |
| `viewer.joined`       | presence-service    | analytics                                      | `{ streamId, viewerId, joinedAt }`                     |
| `viewer.left`         | presence-service    | analytics                                      | `{ streamId, viewerId, leftAt, watchDurationSeconds }` |
| `clip.requested`      | vod-service         | vod-service workers                            | `{ streamId, requestedBy, startOffset, endOffset }`    |

---

## Cloud Service Mapping (When You Deploy)

| Local (docker-compose) | Cloud Equivalent          |
| ---------------------- | ------------------------- |
| MinIO                  | AWS S3                    |
| Nginx HLS origin       | AWS CloudFront + S3       |
| PostgreSQL             | AWS RDS / Supabase        |
| Redis                  | AWS ElastiCache / Upstash |
| Kafka + Zookeeper      | AWS MSK / Confluent Cloud |
| ClickHouse             | ClickHouse Cloud          |

---

## Environment Variables

Copy `.env.example` to `.env` at the root. Each service reads only the variables it needs — validated at startup using Zod via the shared `packages/config` package. If a required variable is missing, the service refuses to start and logs exactly which variable is absent.

See `.env.example` for the full list with descriptions.

---

## Non-Docker Runtime Dependencies

These are binaries that must be installed on the host machine or included in Dockerfiles:

| Binary                        | Used By             | Why                                                      |
| ----------------------------- | ------------------- | -------------------------------------------------------- |
| `ffmpeg`                      | transcoding-service | Video transcoding — converting and slicing video streams |
| `nginx` + `nginx-rtmp-module` | rtmp-ingest         | Accepting RTMP connections on port 1935                  |
