# transcoding-service

Castify's live video transcoding engine. Consumes `stream.started` Kafka events, pulls the RTMP stream from nginx, runs FFmpeg to produce a multi-quality HLS ladder, uploads segments to MinIO, and publishes `video.segment.ready` events for downstream consumers.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [How auto-scaling works](#2-how-auto-scaling-works)
3. [The Worker Pool design](#3-the-worker-pool-design)
4. [FFmpeg internals](#4-ffmpeg-internals)
5. [Segment watcher & MinIO upload](#5-segment-watcher--minio-upload)
6. [Kafka topics](#6-kafka-topics)
7. [MinIO storage layout](#7-minio-storage-layout)
8. [File structure](#8-file-structure)
9. [Environment variables](#9-environment-variables)
10. [Running locally](#10-running-locally)
11. [Simulating a stream without OBS](#11-simulating-a-stream-without-obs)

---

## 1. System Architecture

```
OBS ──RTMP push──▶ nginx:1935/live/<stream-key>
                         │
              on_publish  │
                         ▼
                   rtmp-ingest:3001
                         │ publishes
                         ▼
                   Kafka: stream.started
                         │
                         │ consumed by
                         ▼
              ┌──────────────────────┐
              │  transcoding-service  │   ← THIS SERVICE
              │                      │
              │  WorkerPool          │
              │   └─ StreamWorker    │
              │       └─ FFmpeg      │──RTMP pull──▶ nginx:1935/live/<stream-key>
              │           ├─ 720p    │
              │           ├─ 480p    │──segments──▶ MinIO (hls-segments bucket)
              │           └─ 360p    │
              │       └─ SegmentWatcher (chokidar)
              └──────────────────────┘
                         │
                         │ publishes
                         ▼
                   Kafka: video.segment.ready
```

### Key: FFmpeg pulls from nginx, not from the filesystem

FFmpeg uses `rtmp://nginx:1935/live/<stream-key>` as input — not nginx's `/tmp/hls`.

This means:
- FFmpeg gets the raw H.264 bitstream, with **no decode → re-encode quality loss**
- FFmpeg receives bytes in real time (no polling, no 2-second segment lag)
- transcoding-service doesn't need a shared volume mount with nginx

nginx's `/tmp/hls` output (the local HLS files) is a Phase 1 dev convenience only — it's not used by transcoding-service at all.

---

## 2. How Auto-Scaling Works

Auto-scaling is built into the **Kafka consumer group model** — no custom orchestration code is needed inside this service.

### Instance-level concurrency

Each instance has a `MAX_CONCURRENT_STREAMS` cap (default 3). Within that cap, all streams run as parallel FFmpeg processes.

```
Instance 1 (MAX=3):  stream-A  stream-B  stream-C  [full]
Instance 2 (MAX=3):  stream-D  stream-E            [capacity: 1]
```

When all instances are full, incoming streams are queued inside the instance that receives the event. The queue drains as slots free up.

### Horizontal scaling

```
# Add a second instance locally
docker compose up --scale transcoding-service=2

# Or start a second instance manually
PORT=3003 INSTANCE_ID=ts-instance-2 bun run src/index.ts
```

When a new instance joins the `transcoding-service-group` consumer group, Kafka automatically rebalances partitions. New `stream.started` events are distributed to the instance with the fewest assigned partitions. No configuration needed.

### What drives the scaler

The `/health` endpoint exposes the metrics a Kubernetes HPA or Docker Swarm autoscaler needs:

```json
{
  "pool": {
    "active": 3,
    "max": 3,
    "utilization": 1.0,    ← scale up when this stays > 0.8
    "queueDepth": 2        ← scale up when this is > 0
  }
}
```

In Kubernetes: set an HPA watching a custom metric from Prometheus → scrape `/health` → scale on `pool.utilization > 0.8 for 60s`.

### Partition alignment (why the same instance handles both events for a stream)

Both `stream.started` and `stream.ended` for the same stream use `streamId` as the Kafka message key. Kafka routes all messages with the same key to the same partition via consistent hashing. The same consumer group instance holds that partition, so it sees both events. This is why the in-memory `WorkerPool` is correct — there is no split-brain.

---

## 3. The Worker Pool Design

```
                    WorkerPool
                    ┌────────────────────────────────┐
  stream.started    │  workers: Map<streamKey, Worker>│
  ────────────────▶ │                                │
                    │  if full → queue[] (overflow)  │
                    │                                │
  stream.ended      │  when slot opens → drainQueue()│
  ────────────────▶ │                                │
                    └────────────────────────────────┘
```

### StreamWorker state machine

```
IDLE
  │  start() called
  ▼
STARTING
  ├─ create temp dirs
  ├─ upload master.m3u8 to MinIO
  ├─ build FFmpeg command
  ├─ start SegmentWatcher (chokidar)
  └─ launch FFmpeg
  │
  ▼
TRANSCODING  ←─────────────── (segment uploaded, Kafka event published)
  │
  ├─ stream.ended consumed → stop() called
  │
  ▼
STOPPING
  ├─ SIGINT → FFmpeg (writes EXT-X-ENDLIST)
  ├─ stop chokidar watcher
  └─ rm -rf temp dir
  │
  ▼
DONE

(any step can go to ERROR on unrecoverable failure)
```

---

## 4. FFmpeg Internals

### Why one FFmpeg process for all qualities

```
❌  4 separate FFmpeg processes, each pulling RTMP
    → 4× network bandwidth from nginx
    → 4× RTMP connection overhead
    → segments may drift out of sync

✅  1 FFmpeg process, filter_complex split
    → single RTMP pull
    → all outputs from the same input frames (perfectly synced)
    → ~50% less CPU than 4 processes
```

### The filter_complex command (for 3 qualities: 720p, 480p, 360p)

```bash
ffmpeg -re -i rtmp://localhost:1935/live/<stream-key> \
  -filter_complex "
    [0:v]split=3[v0][v1][v2];
    [v0]scale=1280:720:force_original_aspect_ratio=decrease[v0out];
    [v1]scale=854:480:force_original_aspect_ratio=decrease[v1out];
    [v2]scale=640:360:force_original_aspect_ratio=decrease[v2out]
  " \
  -map [v0out] -map 0:a? -c:v libx264 -b:v 2800k -preset veryfast \
    -hls_time 2 -hls_flags independent_segments+temp_file+delete_segments \
    -hls_segment_filename /tmp/.../720p/seg%05d.ts /tmp/.../720p/index.m3u8 \
  -map [v1out] -map 0:a? -c:v libx264 -b:v 1400k -preset veryfast \
    -hls_segment_filename /tmp/.../480p/seg%05d.ts /tmp/.../480p/index.m3u8 \
  -map [v2out] -map 0:a? -c:v libx264 -b:v 600k -preset veryfast \
    -hls_segment_filename /tmp/.../360p/seg%05d.ts /tmp/.../360p/index.m3u8
```

### Important FFmpeg flags

| Flag | Purpose |
|---|---|
| `-re` | Read input at native frame rate (prevents FFmpeg from processing faster than the stream arrives) |
| `temp_file` | FFmpeg writes `seg00042.ts.tmp` then renames to `seg00042.ts`. chokidar only sees the complete file. |
| `independent_segments` | Each segment decodable standalone (required for low-latency seeks) |
| `delete_segments` | FFmpeg deletes old `.ts` files it no longer references in the playlist (we already uploaded them) |
| `-hls_list_size 0` | Keep all segments in the playlist (for VOD assembly after stream ends) |

### Quality profiles

| Quality | Resolution | Video | Audio | Use case |
|---|---|---|---|---|
| 1080p | 1920×1080 | 5000 kbps | 192 kbps | High bandwidth / large screen |
| 720p | 1280×720 | 2800 kbps | 128 kbps | Default desktop |
| 480p | 854×480 | 1400 kbps | 128 kbps | Mobile / weak connection |
| 360p | 640×360 | 600 kbps | 96 kbps | Very low bandwidth |

For local dev on M-series Mac, use `FFMPEG_QUALITIES=720p,480p` and `FFMPEG_PRESET=veryfast` to keep CPU usage manageable.

### FFmpeg binary

`ffmpeg-static` is a npm/bun package that downloads the correct FFmpeg binary for your platform (ARM64 on M-series Mac) into `node_modules` at `bun install` time. **No `brew install ffmpeg` needed.** The binary path is read at startup and passed to `fluent-ffmpeg.setFfmpegPath()`.

---

## 5. Segment Watcher & MinIO Upload

```
FFmpeg writes:   seg00042.ts.tmp  →  renames to  seg00042.ts  ← atomic
chokidar sees:   "add" event for seg00042.ts
                      │
                      ▼
              uploadSegment(localPath, "live/<key>/720p/seg00042.ts")
                      │
                      ▼  MinIO
              uploadPlaylistFromDisk("720p/index.m3u8")   ← updated playlist
                      │
                      ▼  Kafka
              publishSegmentReady({ quality, segmentIndex, segmentKey, ... })
                      │
                      ▼
              FFmpeg's -delete_segments flag removes the local .ts
              (we don't bother deleting manually — FFmpeg handles it)
```

### Why chokidar and not Node's built-in `fs.watch`?

Node's `fs.watch` on macOS uses the kqueue API which has quirks: it fires for incomplete files, misses rapid renames, and behaves differently between macOS versions. chokidar wraps these platform differences and provides a stable `add` event that only fires after the rename is complete.

---

## 6. Kafka Topics

| Topic | Role | Producer | Consumers |
|---|---|---|---|
| `stream.started` | Stream gate opened by rtmp-ingest | rtmp-ingest | **transcoding-service** |
| `stream.ended` | OBS disconnected | rtmp-ingest | **transcoding-service** |
| `video.segment.ready` | A .ts segment landed in MinIO | **transcoding-service** | hls-packager, analytics-service |

### Message key strategy

All three topics use `streamId` as the message key. This guarantees:
1. `stream.started` and `stream.ended` for the same stream go to the same partition
2. The same consumer instance handles the full lifecycle of a stream
3. `video.segment.ready` events arrive in order at the consumer

---

## 7. MinIO Storage Layout

```
bucket: hls-segments
└── live/
    └── <stream-key>/
        ├── master.m3u8          ← ABR playlist (HLS.js loads this URL)
        ├── 720p/
        │   ├── index.m3u8       ← rolling quality playlist
        │   ├── seg00001.ts
        │   ├── seg00002.ts
        │   └── ...
        ├── 480p/
        │   ├── index.m3u8
        │   └── seg00001.ts ...
        └── 360p/
            └── ...
```

**master.m3u8** is written once at stream start:
```m3u8
#EXTM3U
#EXT-X-VERSION:3

#EXT-X-STREAM-INF:BANDWIDTH=2928000,RESOLUTION=1280x720,CODECS="avc1.42e01e,mp4a.40.2"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1528000,RESOLUTION=854x480,CODECS="avc1.42e01e,mp4a.40.2"
480p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=696000,RESOLUTION=640x360,CODECS="avc1.42e01e,mp4a.40.2"
360p/index.m3u8
```

HLS.js players load `master.m3u8` and automatically select the best quality for the viewer's bandwidth.

---

## 8. File Structure

```
apps/transcoding-service/
├── src/
│   ├── index.ts                  # Entry point (startup + graceful shutdown)
│   ├── app.ts                    # Express app (health routes only)
│   ├── config.ts                 # Zod env validation — exits on bad config
│   ├── logger.ts                 # @castify/logger factory
│   ├── profiles.ts               # Quality ladder + master playlist builder
│   │
│   ├── ffmpeg/
│   │   ├── builder.ts            # Builds multi-output FFmpeg command args
│   │   └── process.ts            # Spawns, monitors, gracefully stops FFmpeg
│   │
│   ├── worker/
│   │   ├── streamWorker.ts       # State machine for ONE stream's lifecycle
│   │   └── workerPool.ts         # Pool of workers + overflow queue
│   │
│   ├── watcher/
│   │   └── segmentWatcher.ts     # chokidar → MinIO upload → Kafka event
│   │
│   ├── storage/
│   │   └── minio.ts              # MinIO client + upload helpers
│   │
│   ├── kafka/
│   │   ├── consumer.ts           # Consumes stream.started / stream.ended
│   │   └── producer.ts           # Produces video.segment.ready
│   │
│   └── routes/
│       └── health.ts             # GET /health (pool stats) + GET /health/ready
│
├── package.json
├── tsconfig.json
└── README.md
```

### Shared packages used

| Package | What from it |
|---|---|
| `@castify/types` | `StreamStartedEvent`, `StreamEndedEvent`, `VideoSegmentReadyEvent`, `TranscodingState`, `QualityLabel` |
| `@castify/kafka` | `KafkaConsumer`, `KafkaProducer` |
| `@castify/logger` | `createLogger` (Pino with consistent format) |

---

## 9. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3002` | HTTP health server port |
| `INSTANCE_ID` | auto | Unique per-instance ID (set by orchestrator in prod) |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated broker list |
| `KAFKA_GROUP_ID` | `transcoding-service-group` | All instances share this group for auto-distribution |
| `NGINX_RTMP_URL` | `rtmp://localhost:1935` | Base RTMP URL (FFmpeg pulls from here) |
| `NGINX_RTMP_APP` | `live` | RTMP application name |
| `MINIO_ENDPOINT` | `localhost` | MinIO host |
| `MINIO_PORT` | `9100` | MinIO port |
| `MINIO_BUCKET` | `hls-segments` | Bucket for all HLS output |
| `FFMPEG_PRESET` | `veryfast` | x264 preset (`ultrafast` = less CPU, `slow` = better compression) |
| `FFMPEG_QUALITIES` | `720p,480p,360p` | Comma-separated quality tiers to produce |
| `HLS_SEGMENT_SECONDS` | `2` | Segment duration (must match nginx `hls_fragment`) |
| `MAX_CONCURRENT_STREAMS` | `3` | Max parallel FFmpeg processes per instance |
| `TEMP_DIR` | `/tmp/castify-transcoding` | Local temp dir for FFmpeg output before upload |

---

## 10. Running Locally

### Prerequisites

```bash
# 1. Start infrastructure (Kafka, MinIO, nginx)
cd infrastructure && docker compose up -d

# 2. Start rtmp-ingest (must be running — produces stream.started events)
cd apps/rtmp-ingest && bun run dev
```

### Start transcoding-service

```bash
cd apps/transcoding-service
bun install  # downloads ffmpeg-static binary into node_modules (first time only)
bun run dev
```

You should see:
```
[transcoding-service] MinIO bucket ready
[transcoding-service] Kafka producer connected
[transcoding-service] Kafka consumer connected and subscribed
[transcoding-service] ┌─────────────────────────────┐
[transcoding-service] │  transcoding-service running │
```

### Start OBS and stream

OBS → Settings → Stream:
- Service: `Custom`
- Server: `rtmp://localhost:1935/live`
- Stream Key: `local-dev-key-streamer-01`

Click **Start Streaming**.

Watch the logs:
```
[transcoding-service] Consumed stream.started { streamId: '...', streamKey: 'local-de…' }
[transcoding-service] StreamWorker starting    { qualities: ['720p', '480p', '360p'] }
[transcoding-service] Master playlist uploaded
[transcoding-service] FFmpeg process started
[transcoding-service] Segment + playlist uploaded  { segmentKey: 'live/local.../720p/seg00001.ts' }
```

Play the stream in VLC or any HLS player:
```
http://localhost:9100/hls-segments/live/local-dev-key-streamer-01/master.m3u8
```

### Run multiple instances

```bash
# Terminal 1
PORT=3002 bun run src/index.ts

# Terminal 2 — second instance, different port + instance ID
PORT=3003 INSTANCE_ID=ts-2 MAX_CONCURRENT_STREAMS=3 bun run src/index.ts
```

Check each instance's health independently:
```bash
curl http://localhost:3002/health | jq .pool
curl http://localhost:3003/health | jq .pool
```

---

## 11. Simulating a Stream Without OBS

You can test the full pipeline without OBS using `ffmpeg` to send a test pattern:

```bash
# Push a test card to nginx (requires ffmpeg installed OR use the ffmpeg-static binary)
./node_modules/.bin/ffmpeg-static  # prints path to the binary

$(cat node_modules/ffmpeg-static/index.js | grep -o '".*"' | tr -d '"') \
  -re \
  -f lavfi -i testsrc=size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=440 \
  -c:v libx264 -b:v 2000k -preset ultrafast \
  -c:a aac -b:a 128k \
  -f flv rtmp://localhost:1935/live/local-dev-key-streamer-01
```

Or trigger it manually with just the Kafka event (transcoding-service will try to connect to nginx and fail gracefully — useful for testing error paths):

```bash
# Publish a mock stream.started event directly to Kafka
docker exec castify-kafka kafka-console-producer \
  --broker-list localhost:9092 \
  --topic stream.started \
  --property "parse.key=true" \
  --property "key.separator=:" <<< 'stream-id-001:{"streamId":"stream-id-001","userId":"user-001","streamKey":"local-dev-key-streamer-01","startedAt":"2024-01-01T00:00:00Z"}'
```
