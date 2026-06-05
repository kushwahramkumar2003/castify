#!/usr/bin/env bash
# =============================================================================
# create-kafka-topics.sh
# =============================================================================
# Creates all Kafka topics required by Castify services.
# Run this ONCE after 'docker compose up -d' and before starting any service.
#
# Usage:
#   chmod +x infrastructure/scripts/create-kafka-topics.sh
#   ./infrastructure/scripts/create-kafka-topics.sh
#
# Or from the repo root:
#   bash infrastructure/scripts/create-kafka-topics.sh
#
# Requirements:
#   - Docker running with castify-infra stack ('docker compose up -d')
#   - Kafka container healthy ('docker compose ps kafka')
#
# Topic design:
#   partitions=3   — allows up to 3 consumer instances per group to run in
#                    parallel without one sitting idle. Scale this up when you
#                    have more service replicas.
#   replication=1  — single broker in local dev (no replication needed).
#   retention=24h  — events older than 24 hours are deleted. Long enough for
#                    debugging without filling up the local disk.
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
CONTAINER="castify-kafka"
BOOTSTRAP="localhost:9092"
PARTITIONS=3
REPLICATION=1
RETENTION_MS=$((24 * 60 * 60 * 1000))   # 24 hours in milliseconds

# Colour helpers
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'   # No Colour

info()    { echo -e "${GREEN}[+]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }

# ── All topics and their purpose ──────────────────────────────────────────────
# Format: "topic-name:description"
declare -a TOPICS=(
  # ── Stream lifecycle (rtmp-ingest → everything) ───────────────────────────
  "stream.started:Fired when OBS connects and stream key is validated"
  "stream.ended:Fired when OBS disconnects or stream key is revoked"

  # ── Transcoding (transcoding-service → hls-packager / analytics) ──────────
  "video.segment.ready:Each .ts HLS segment uploaded to MinIO by transcoding-service"

  # ── Chat (chat-service) ───────────────────────────────────────────────────
  "chat.message.sent:A viewer sent a chat message in a live stream"
  "chat.message.deleted:A message was deleted (mod action or author)"

  # ── Viewer presence (presence-service) ───────────────────────────────────
  "viewer.joined:A viewer opened the stream player"
  "viewer.left:A viewer closed the stream player"

  # ── Reactions (reaction-service) ──────────────────────────────────────────
  "reaction.fired:A viewer sent a reaction emoji (heart, fire, etc.)"

  # ── Notifications (notification-service) ─────────────────────────────────
  "notification.send:Trigger a push/email notification to a user"

  # ── Clips / VOD (vod-service) ────────────────────────────────────────────
  "clip.requested:A viewer or creator requested a clip to be cut"
  "vod.ready:A VOD has been stitched and is available for playback"

  # ── Moderation (moderation-service) ───────────────────────────────────────
  "moderation.action:A ban, timeout, or message deletion was applied"

  # ── Analytics (analytics-service) ────────────────────────────────────────
  "analytics.stream.metric:Periodic bitrate / viewer count snapshot for ClickHouse"
)

# ── Pre-flight: confirm Kafka container is running and healthy ────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         Castify — Kafka Topic Setup Script           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if ! docker inspect "$CONTAINER" --format='{{.State.Status}}' 2>/dev/null | grep -q "running"; then
  error "Container '$CONTAINER' is not running."
  error "Start the infra stack first:  cd infrastructure && docker compose up -d"
  exit 1
fi

info "Kafka container: $CONTAINER is running"

# Wait for Kafka to be truly ready (can take 10-30s after container starts)
echo -n "Waiting for Kafka to be ready..."
MAX_WAIT=60
WAITED=0
until docker exec "$CONTAINER" kafka-topics \
    --bootstrap-server "$BOOTSTRAP" --list &>/dev/null; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo ""
    error "Kafka did not become ready within ${MAX_WAIT}s"
    error "Check logs: docker logs $CONTAINER"
    exit 1
  fi
  echo -n "."
  sleep 2
  WAITED=$((WAITED + 2))
done
echo " ready! (${WAITED}s)"
echo ""

# ── Create topics ─────────────────────────────────────────────────────────────
CREATED=0
SKIPPED=0
FAILED=0

for entry in "${TOPICS[@]}"; do
  TOPIC="${entry%%:*}"
  DESC="${entry##*:}"

  # Check if already exists
  if docker exec "$CONTAINER" kafka-topics \
      --bootstrap-server "$BOOTSTRAP" \
      --describe --topic "$TOPIC" &>/dev/null; then
    warn "EXISTS   $TOPIC"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Create it
  if docker exec "$CONTAINER" kafka-topics \
      --bootstrap-server "$BOOTSTRAP" \
      --create \
      --topic "$TOPIC" \
      --partitions "$PARTITIONS" \
      --replication-factor "$REPLICATION" \
      --config "retention.ms=$RETENTION_MS" \
      --config "min.insync.replicas=1" &>/dev/null; then
    info "CREATED  $TOPIC  ($DESC)"
    CREATED=$((CREATED + 1))
  else
    error "FAILED   $TOPIC"
    FAILED=$((FAILED + 1))
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────────────────"
echo " Created: $CREATED   Skipped (already exist): $SKIPPED   Failed: $FAILED"
echo "─────────────────────────────────────────────────────────"

if [ "$FAILED" -gt 0 ]; then
  error "Some topics failed to create. Check Kafka logs:"
  error "  docker logs $CONTAINER --tail 50"
  exit 1
fi

echo ""
info "All topics ready. Listing all topics in the cluster:"
echo ""
docker exec "$CONTAINER" kafka-topics \
  --bootstrap-server "$BOOTSTRAP" \
  --list | grep -v "^__" | sort | while read -r t; do
    echo "  • $t"
done

echo ""
info "Done! You can now start your services."
echo ""
echo "  Useful commands:"
echo "    Describe a topic:    docker exec $CONTAINER kafka-topics --bootstrap-server $BOOTSTRAP --describe --topic stream.started"
echo "    Browse messages:     http://localhost:9000  (Kafka UI)"
echo "    Consumer groups:     docker exec $CONTAINER kafka-consumer-groups --bootstrap-server $BOOTSTRAP --list"
echo ""
