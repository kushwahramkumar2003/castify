/**
 * Verifies OBS stop/start playlist continuity against real MinIO + merge logic.
 * Does NOT claim production OBS works — proves merge/discontinuity/start-number.
 */
import { Client } from "minio";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeHlsPlaylists } from "../src/playlistMerge.ts";

const minio = new Client({
  endPoint: "localhost",
  port: 9100,
  useSSL: false,
  accessKey: "castify",
  secretKey: "castify123",
});

const BUCKET = "hls-segments";
const TEST_KEY = `verify-reconnect-${Date.now().toString(36)}`;
const QUALITY = "720p";
const prefix = `live/${TEST_KEY}/${QUALITY}/`;

function playlist(segs, { endlist = false, discAt = null } = {}) {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:2",
    `#EXT-X-MEDIA-SEQUENCE:${segs[0] ?? 0}`,
  ];
  for (const n of segs) {
    if (discAt !== null && n === discAt) lines.push("#EXT-X-DISCONTINUITY");
    lines.push("#EXTINF:2.000000,");
    lines.push(`seg${String(n).padStart(5, "0")}.ts`);
  }
  if (endlist) lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

async function putText(key, text) {
  const buf = Buffer.from(text, "utf-8");
  await minio.putObject(BUCKET, key, buf, buf.length, {
    "Content-Type": "application/vnd.apple.mpegurl",
  });
}

async function putFakeSeg(n) {
  const name = `seg${String(n).padStart(5, "0")}.ts`;
  const buf = Buffer.alloc(188, 0x47); // minimal TS-ish bytes
  await minio.putObject(BUCKET, `${prefix}${name}`, buf, buf.length);
}

async function getText(key) {
  const s = await minio.getObject(BUCKET, key);
  const chunks = [];
  for await (const c of s) chunks.push(c);
  return Buffer.concat(chunks).toString("utf-8");
}

async function listSegIndexes() {
  const out = [];
  for await (const o of minio.listObjectsV2(BUCKET, prefix, true)) {
    const m = o.name?.match(/seg(\d+)\.ts$/);
    if (m) out.push(parseInt(m[1], 10));
  }
  return out.sort((a, b) => a - b);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK  ", msg);
  }
}

// ── Unit: merge discontinuity ──────────────────────────────────────────────
{
  const a = playlist([0, 1, 2], { endlist: true });
  const b = playlist([3, 4]);
  const m = mergeHlsPlaylists(a, b, { discontinuity: true });
  assert(m.includes("seg00000.ts") && m.includes("seg00004.ts"), "merge keeps all segs");
  assert(!m.includes("#EXT-X-ENDLIST"), "merge strips ENDLIST for live session");
  assert(m.includes("#EXT-X-DISCONTINUITY"), "merge inserts DISCONTINUITY on reconnect");
  assert(m.includes("#EXT-X-PLAYLIST-TYPE:EVENT"), "merge marks EVENT playlist");
  // discontinuity must appear before seg00003
  const iDisc = m.indexOf("#EXT-X-DISCONTINUITY");
  const i3 = m.indexOf("seg00003.ts");
  assert(iDisc >= 0 && i3 > iDisc, "DISCONTINUITY is before first new segment");

  // second merge (more segs in same session) must NOT add another disc before 5
  const m2 = mergeHlsPlaylists(m, playlist([3, 4, 5]), { discontinuity: false });
  const discCount = (m2.match(/#EXT-X-DISCONTINUITY/g) || []).length;
  assert(discCount === 1, `only one discontinuity after continued session (got ${discCount})`);
}

// ── Integration: MinIO start-number + merge path ───────────────────────────
const tmp = join(tmpdir(), TEST_KEY);
await mkdir(tmp, { recursive: true });

try {
  // Session 1: segs 0-4
  for (let i = 0; i <= 4; i++) await putFakeSeg(i);
  await putText(`${prefix}index.m3u8`, playlist([0, 1, 2, 3, 4], { endlist: true }));

  const segs1 = await listSegIndexes();
  assert(segs1.length === 5 && segs1[0] === 0 && segs1.at(-1) === 4, "session1 objects 0-4");

  // Simulate transcoder: next start number
  const next = Math.max(...segs1) + 1;
  assert(next === 5, `next start number is 5 (got ${next})`);

  // Session 2: FFmpeg would produce segs 5-7 + short playlist; packager merges
  for (let i = 5; i <= 7; i++) await putFakeSeg(i);
  const incoming = playlist([5, 6, 7]);
  const existing = await getText(`${prefix}index.m3u8`);
  const merged = mergeHlsPlaylists(existing, incoming, { discontinuity: true });
  await putText(`${prefix}index.m3u8`, merged);

  const finalPl = await getText(`${prefix}index.m3u8`);
  const listed = [...finalPl.matchAll(/seg(\d+)\.ts/g)].map((m) => +m[1]);
  assert(
    listed.join(",") === "0,1,2,3,4,5,6,7",
    `final playlist has 0-7 (got ${listed.join(",")})`
  );
  assert(finalPl.includes("#EXT-X-DISCONTINUITY"), "final playlist has discontinuity");
  assert(!finalPl.includes("#EXT-X-ENDLIST"), "final playlist has no ENDLIST");

  const segs2 = await listSegIndexes();
  assert(segs2.length === 8, `8 segment objects on disk (got ${segs2.length})`);

  console.log("\n--- merged playlist sample ---\n" + finalPl.split("\n").slice(0, 20).join("\n"));
} finally {
  // cleanup test objects
  for await (const o of minio.listObjectsV2(BUCKET, `live/${TEST_KEY}/`, true)) {
    if (o.name) await minio.removeObject(BUCKET, o.name);
  }
  await rm(tmp, { recursive: true, force: true });
}

console.log(failed === 0 ? "\nALL VERIFY CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
