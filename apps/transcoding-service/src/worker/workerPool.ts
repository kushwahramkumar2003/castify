import type { StreamStartedEvent, ActiveStreamSnapshot } from "@castify/types";
import { StreamWorker } from "./streamWorker.ts";
import { config } from "../config.ts";
import { logger } from "../logger.ts";

// =============================================================================
// WorkerPool — manages all concurrent StreamWorkers on this instance
// =============================================================================
//
// Design goals:
//   1. Hard concurrency cap (MAX_CONCURRENT_STREAMS) — prevents one instance
//      from taking more streams than it can transcode at acceptable quality.
//   2. Auto-overflow queue — if the pool is full, new streams are queued.
//      When a stream ends and a slot opens, the next queued stream starts.
//   3. Expose metrics — the /health endpoint reads getStats() to report
//      capacity, active streams, and queue depth to the load balancer.
//
// ── How auto-scaling works at the platform level ─────────────────────────────
//
//   Each instance of transcoding-service joins the same Kafka consumer group
//   ("transcoding-service-group").  Kafka assigns partitions to instances.
//
//   When the pool is full AND the queue is growing, that means this instance
//   can't keep up.  The operator signals the orchestrator (docker compose
//   --scale, Kubernetes HPA, etc.) to add another replica.
//
//   The new replica joins the consumer group → Kafka rebalances partitions →
//   new stream.started events go to the new instance automatically.
//
//   No custom auto-scaling code needed in the service itself.  The "scaling
//   scope" is built into the Kafka consumer group model.
//
//   Metrics to drive the scaler (exposed on /health):
//     • pool.utilization = active / max   (scale up when > 0.8 for 60s)
//     • pool.queueDepth                   (scale up when > 0)
// =============================================================================

export class WorkerPool {
  // streamKey → worker
  private readonly workers = new Map<string, StreamWorker>();

  // Overflow queue: events that arrived when the pool was full
  private readonly queue: StreamStartedEvent[] = [];

  get maxConcurrent(): number { return config.MAX_CONCURRENT_STREAMS; }
  get activeCount():   number { return this.workers.size; }
  get queueDepth():    number { return this.queue.length; }
  get isFull():       boolean { return this.workers.size >= this.maxConcurrent; }
  get utilization():   number { return this.workers.size / this.maxConcurrent; }

  // ---------------------------------------------------------------------------
  // addStream — called when stream.started is consumed from Kafka
  // ---------------------------------------------------------------------------
  async addStream(event: StreamStartedEvent): Promise<void> {
    const { streamKey, streamId } = event;

    // Idempotency guard: ignore duplicates (Kafka at-least-once delivery)
    if (this.workers.has(streamKey)) {
      logger.warn({ streamKey: `${streamKey.slice(0, 8)}…` }, "WorkerPool: duplicate stream.started — ignoring");
      return;
    }

    if (this.isFull) {
      // Queue it — will be picked up when a slot opens
      this.queue.push(event);
      logger.warn(
        { streamId, queueDepth: this.queue.length, max: this.maxConcurrent },
        "WorkerPool full — stream queued (add more instances to scale)"
      );
      return;
    }

    await this.spawnWorker(event);
  }

  // ---------------------------------------------------------------------------
  // removeStream — called when stream.ended is consumed from Kafka
  // ---------------------------------------------------------------------------
  async removeStream(streamKey: string): Promise<void> {
    const worker = this.workers.get(streamKey);
    if (!worker) {
      // Could be a queued stream that never started
      const queueIdx = this.queue.findIndex((e) => e.streamKey === streamKey);
      if (queueIdx !== -1) {
        this.queue.splice(queueIdx, 1);
        logger.info({ streamKey: `${streamKey.slice(0, 8)}…` }, "WorkerPool: removed stream from queue");
      }
      return;
    }

    await worker.stop();
    this.workers.delete(streamKey);

    logger.info(
      { streamKey: `${streamKey.slice(0, 8)}…`, remaining: this.workers.size },
      "WorkerPool: stream removed"
    );

    // If something is waiting in the queue, start it now that a slot opened
    await this.drainQueue();
  }

  // ---------------------------------------------------------------------------
  // getStats — used by the /health endpoint
  // ---------------------------------------------------------------------------
  getStats(): {
    instanceId: string;
    active: number;
    max: number;
    utilization: number;
    queueDepth: number;
    streams: ActiveStreamSnapshot[];
  } {
    return {
      instanceId: config.INSTANCE_ID,
      active: this.activeCount,
      max: this.maxConcurrent,
      utilization: parseFloat(this.utilization.toFixed(2)),
      queueDepth: this.queueDepth,
      streams: [...this.workers.values()].map((w) => ({
        streamId: w.getStreamId(),
        streamKey: `${w.getStreamKey().slice(0, 8)}…`,
        state: w.state,
        qualities: w.qualities,
        startedAt: w.startedAt.toISOString(),
        segmentsUploaded: w.getSegmentsUploaded(),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // drainAll — stop all workers cleanly (called on SIGTERM)
  // ---------------------------------------------------------------------------
  async drainAll(): Promise<void> {
    this.queue.length = 0; // clear queue
    await Promise.all([...this.workers.values()].map((w) => w.stop()));
    this.workers.clear();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async spawnWorker(event: StreamStartedEvent): Promise<void> {
    const worker = new StreamWorker(event);
    this.workers.set(event.streamKey, worker);

    try {
      await worker.start();
    } catch (err) {
      // Worker failed to start — remove it and don't fill the slot
      this.workers.delete(event.streamKey);
      logger.error(
        { err, streamKey: `${event.streamKey.slice(0, 8)}…` },
        "WorkerPool: worker failed to start"
      );
    }
  }

  private async drainQueue(): Promise<void> {
    while (!this.isFull && this.queue.length > 0) {
      const next = this.queue.shift()!;
      logger.info(
        { streamKey: `${next.streamKey.slice(0, 8)}…`, queueDepth: this.queue.length },
        "WorkerPool: starting queued stream"
      );
      await this.spawnWorker(next);
    }
  }
}
