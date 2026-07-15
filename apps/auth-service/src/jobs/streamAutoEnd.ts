import { autoEndInactiveStreams, STREAM_AUTO_END_HOURS } from "../utils/stream.utils";

const CHECK_INTERVAL_MS = 5 * 60 * 1_000; // every 5 minutes

let timer: ReturnType<typeof setInterval> | null = null;

export function startStreamAutoEndJob(): void {
  if (timer) return;

  const run = async () => {
    try {
      const ended = await autoEndInactiveStreams();
      if (ended > 0) {
        console.log(
          `[auth-service] Auto-ended ${ended} inactive stream(s) (>${STREAM_AUTO_END_HOURS}h idle)`
        );
      }
    } catch (err) {
      console.error("[auth-service] Stream auto-end job failed:", err);
    }
  };

  void run();
  timer = setInterval(() => void run(), CHECK_INTERVAL_MS);
}

export function stopStreamAutoEndJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}