# Decentralized Compute & Delivery for Castify

## The Core Problem

> "Can we decentralize transcoding and delivery so viewers contribute compute instead of us paying AWS?"

**Short answer:** Transcoding cannot be decentralized safely today. Delivery can — and should be.

**Why:** FFmpeg needs raw unencrypted video frames to re-encode them. Anyone running a transcoding node can see, record, or tamper with the stream. You'd need military-grade hardware enclaves (Intel SGX/NVIDIA Confidential Computing) or fully homomorphic encryption — neither is practical for 60fps real-time video encoding.

But delivery is different. HLS has built-in AES-128 encryption. Encrypted segments can be relayed by untrusted nodes. They can't read or modify the content. This is the path.

---

## Architecture: Decentralized Delivery with Encrypted Segments

```
Creator (OBS)
  │
  ▼
Your Server (nginx-rtmp + transcoding-service)
  │  AES-128 encrypts HLS segments
  │  Publishes encryption key to Key Server
  │
  ├──► CloudFront (fallback, always available)
  │
  └──► Edge Nodes (viewer browsers + dedicated relay servers)
         │
         ├─ Encrypted .ts + .m3u8 via WebRTC datachannel
         ├─ Cannot decrypt, cannot modify
         ├─ Submit bandwidth proofs to Solana → earn tokens
         │
         ▼
      Viewer (hls.js + decryption key from Key Server)
```

---

## HLS Encryption: The Privacy Layer

FFmpeg supports AES-128 encryption natively. Every segment is encrypted with a unique key, the keys are served over HTTPS, and the playlist tells the player where to find them.

### How it works

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-KEY:METHOD=AES-128,URI="https://castify.com/keys/stream-xyz",IV=0x0000000000000001
#EXTINF:2.000,
seg00001.ts
#EXT-X-KEY:METHOD=AES-128,URI="https://castify.com/keys/stream-xyz",IV=0x0000000000000002
#EXTINF:2.000,
seg00002.ts
```

- Each segment encrypted with AES-128-CBC
- Key server returns the 16-byte key only to authenticated viewers
- Relay nodes forward encrypted `.ts` files — they have no key
- Even if a relay node stores segments offline, they're useless without the key
- Keys rotate per stream, per session

### What the relay node sees

```
01010101 10101010 11100011 01010101 ...  (encrypted blob, ~250 KB)
```

### What the viewer sees

```
Video frame 42, 720p, 30fps — clear, because hls.js has the decryption key
```

---

## Project Idea 1: Encrypted Edge Relay Network

### What

Viewers opt in to "Relay Mode" in their browser. Their browser becomes a WebRTC relay node — serving encrypted HLS segments to nearby viewers. They earn creator tokens proportional to bandwidth served.

### Privacy guarantees

| Threat | Protection |
|--------|-----------|
| Relay node reads stream content | ❌ Impossible — AES-128 encrypted, no key |
| Relay node modifies segment | ❌ Impossible — hash mismatch detected by player |
| Relay node injects fake segment | ❌ Impossible — HLS playlist specifies exact byte range + hash |
| Relay node tracks who watches | ⚠️ Possible — IP visible, same as any CDN |
| Relay node learns stream metadata | ⚠️ Possible — playlist has segment count, quality info |

### Token economics

```
Bandwidth served (KB) × Quality weight × Uptime multiplier = Tokens earned

Quality weight:  720p = 1.0x, 480p = 0.7x, 360p = 0.5x
Uptime multiplier: >99% = 1.3x, >95% = 1.0x, >80% = 0.7x
```

### Solana integration

```typescript
// On-chain bandwidth proof submitted every 10 minutes
{
  nodeId: "sol-addr-xxx",
  segmentsServed: 1423,
  totalBytes: 287_456_123,
  streamIds: ["stream-001", "stream-002"],
  timestamp: "2026-06-07T10:00:00Z"
}
// Verified via random sampling — the smart contract requests proof
// for 5 random segments to check the node actually has them
```

### Cost reduction

| Scale | CloudFront only | CloudFront + Relay |
|-------|----------------|-------------------|
| 100 concurrent viewers | $8/mo | $6/mo (25% less CF) |
| 1,000 concurrent viewers | $80/mo | $45/mo (45% less CF) |
| 10,000 concurrent viewers | $750/mo | $300/mo (60% less CF) |
| 100,000 concurrent viewers | $6,500/mo | $1,800/mo (73% less CF) |

In a viral event (stream hits 500K viewers), relay saves **$26,000 in a single day**.

---

## Project Idea 2: Proof-of-Bandwidth Smart Contract (Solana Program)

### What

An Anchor program that tracks bandwidth contributions, verifies proofs, and distributes rewards. Fully on-chain — no centralized accounting.

### Program structure

```rust
// Anchor program: castify_relay
// Instructions:
//   submit_proof(node_id, proof_data) → verified or rejected
//   claim_rewards(node_id, amount) → transfers tokens
//   slash_node(node_id, reason) → penalizes bad actors

#[account]
pub struct RelayNode {
    pub owner: Pubkey,
    pub total_bytes_served: u64,
    pub segments_served: u64,
    pub uptime_seconds: u64,
    pub reputation_score: u8,   // 0-100
    pub is_active: bool,
    pub last_proof_at: i64,
}

#[account]
pub struct BandwidthProof {
    pub node: Pubkey,
    pub stream_id: String,
    pub segments_served: u64,
    pub total_bytes: u64,
    pub submitted_at: i64,
    pub is_verified: bool,
}
```

### Proof verification

The smart contract can't verify that a node actually served every segment. Instead:

1. Node submits proof: "I served stream-X for 10 minutes"
2. Smart contract picks 5 random segment IDs from that time window
3. Node must respond with the segment hash (not the full segment)
4. Compare against the on-chain content registry (Idea #3 from expansion doc)
5. If 5/5 match → proof accepted → rewards
6. If mismatch → proof rejected → reputation penalty

This is called **Proof-of-Random-Sampling (PoRS)** — statistically ungameable.

---

## Project Idea 3: Federated Transcoding Pools (Trusted, Not Random)

### What

Instead of random nodes, trusted operators run transcoding pools. Think validators in Solana, but for video. Operators stake tokens as collateral and earn a share of platform fees.

### Why pools work

| Model | Privacy | Trust | Feasible Today |
|-------|---------|-------|---------------|
| Random nodes transcode | ❌ None | None | No |
| Trusted pools transcode | ✅ Contractual | Token stake | **Yes** |
| TEE transcoding (SGX) | ✅ Hardware | Hardware | 2027+ |

### How pools work

1. Pool operator stakes 100,000 CAST tokens as collateral
2. Streamers choose a pool from the marketplace (latency map, cost)
3. Pool runs transcoding-service instances closer to the streamer's audience
4. Pool earns 30% of CloudFront savings (platform keeps 70%)
5. If pool manipulates or records content — penalty:
   - Slashed stake (burnt or redistributed)
   - Reputation score goes to zero
   - Delisted from marketplace

### Marketplace

Streamers see:
```
Pool Name        │ Region      │ Latency │ Fee/Hour │ Reputation
─────────────────┼─────────────┼─────────┼──────────┼───────────
Bangalore Relay  │ ap-south-1  │ 12ms    │ $0.15    │ ⭐⭐⭐⭐⭐ 98%
Mumbai Edge      │ ap-south-1  │ 18ms    │ $0.12    │ ⭐⭐⭐⭐ 94%
Singapore CDN    │ ap-southeast│ 65ms    │ $0.08    │ ⭐⭐⭐⭐⭐ 99%
AWS us-east-1    │ us-east-1   │ 220ms   │ $0.25    │ ⭐⭐⭐⭐⭐ 99.99%
```

Streamers pick the best cost/latency/reputation tradeoff. AWS is always available as fallback.

---

## Project Idea 4: On-Chain Segment Registry + Integrity Verification

### What

Every HLS segment gets:
1. SHA-256 hash computed after encryption
2. Hash + segment metadata registered on Solana
3. Viewer's player verifies hash before decoding

### Why this matters

| Without registry | With registry |
|-----------------|---------------|
| Modified segment → plays corrupted | Modified segment → hash mismatch → rejected |
| Delayed segment → plays late | Hash has timestamp → verifiable timing |
| Missing segment → stream gaps | Registry shows expected segments → viewer knows exact gap |
| Content tampered → nobody knows | Content tampered → hash chain broken → provable |

### On-chain structure

```
SegmentRegistry (Solana account):
  streamId: "stream-0001-0000-0000-000000000001"
  segments: [
    { index: 42, quality: "720p", hash: "0xabcd...", timestamp: 1717718400, size: 287456 }
    { index: 43, quality: "720p", hash: "0xef01...", timestamp: 1717718402, size: 301234 }
    ...
  ]
```

### Integration into existing pipeline

```
transcoding-service writes segment
  → hls-packager uploads to storage
  → hls-packager computes SHA-256
  → hls-packager submits hash to Solana registry
  → viewer downloads segment from relay
  → viewer verifies hash against on-chain registry
  → if match: decrypt + play
  → if mismatch: fall back to CloudFront origin
```

---

## Project Idea 5: Hybrid Infrastructure Economics Dashboard

### What

A real-time dashboard showing:
- CloudFront cost per minute vs Relay savings per minute
- Transcoding costs by pool
- CDN costs by region
- Token emissions vs platform revenue
- Relay node count and health

### For platform operators

```
Current Cost: $0.42/min
Relay Savings: $0.18/min (43%)
Transcoding:   $0.15/min (35%)
Storage:       $0.04/min (9%)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Net Cost:      $0.43/min
Projected (with 500 more relay nodes): $0.28/min
```

### For relay node operators

```
Your Earnings: 12,450 CAST tokens ($1.24)
Bandwidth Served: 4.2 GB
Uptime: 98.3%
Reputation: 96/100
Rank: #142 of 8,921 active nodes
```

---

## Implementation Roadmap

### Phase 1: Encrypted HLS (Week 1-2)
- [ ] Add AES-128 encryption to FFmpeg output in builder.ts
- [ ] Build key server (Express endpoint, returns keys to authenticated users)
- [ ] Update player to request decryption keys
- [ ] Verify relay nodes cannot decrypt

### Phase 2: On-Chain Segment Registry (Week 3-4)
- [ ] Add SHA-256 computation to hls-packager after each upload
- [ ] Build Solana program for segment registry
- [ ] Build client library for submitting hashes
- [ ] Add hash verification to player

### Phase 3: Relay Node MVP (Month 2)
- [ ] WebRTC datachannel for segment relay in browser
- [ ] Relay discovery service (find nearby nodes)
- [ ] Proof-of-Bandwidth smart contract
- [ ] Token reward distribution

### Phase 4: Federated Pools (Month 3-4)
- [ ] Pool operator staking contract
- [ ] Marketplace for transcoding pools
- [ ] Reputation system
- [ ] Automatic fallback to CloudFront

---

## What We Still Can't Decentralize (and That's OK)

| Component | Can Decentralize? | Why |
|-----------|-------------------|-----|
| RTMP ingest (nginx) | ❌ | Raw video, single publisher |
| Transcoding (FFmpeg) | ⚠️ Trusted pools only | Raw frames exposed |
| AES key server | ❌ | Single source of truth for DRM |
| HLS segment delivery | ✅ Fully | Encrypted, stateless, cacheable |
| CDN / edge caching | ✅ Fully | Same as above |
| Storage (S3/MinIO) | ❌ | Requires consistency guarantees |
| Analytics (ClickHouse) | ❌ | Time-series aggregation needs centralization |
| Auth (PostgreSQL) | ❌ | Consistency > availability |

The 80/20 rule: encrypt segments, relay them through viewers, save 50-70% on CDN costs. That's the sweet spot. The other components stay centralized because the alternatives are either unsafe (transcoding on random nodes) or impractical (distributed databases for chat history).

---

## Ethical Guardrails (Same as Main Doc)

- ✅ Relay nodes earn tokens for bandwidth — never forced to participate
- ✅ Content is always encrypted on relay — privacy preserved
- ✅ Creators control key access — they decide who watches
- ✅ Hash registry prevents content tampering
- ❌ No forced mining or hidden background processes
- ❌ No "earn by watching ads" — that's attention exploitation
- ❌ No token-gated access to content
- ❌ No proof-of-work/power-consuming consensus
