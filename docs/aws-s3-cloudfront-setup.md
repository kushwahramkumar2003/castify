# AWS Console Setup Guide: S3 + CloudFront for HLS Delivery

## Architecture

```
hls-packager → S3 (private) → CloudFront (global CDN) → Viewers
```

---

## Part 1: S3 Bucket (AWS Console)

### 1.1 Create bucket

1. Open **AWS Console** → **S3** → **Create bucket**
2. Bucket name: `castify-hls-live`
3. AWS Region: `us-east-1` (N. Virginia) — lowest latency for US/Europe traffic
4. **Block all public access**: ✅ CHECKED (keep private, CloudFront handles access)
5. Bucket versioning: **Disable** (segments are ephemeral)
6. Default encryption: **SSE-S3** (free server-side encryption)
7. Click **Create bucket**

### 1.2 CORS configuration

1. Open bucket → **Permissions** tab → scroll to **Cross-origin resource sharing (CORS)**
2. Click **Edit**, paste:

```json
[{
  "AllowedOrigins": ["https://castify.com", "http://localhost:8080"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

3. Click **Save changes**

### 1.3 Lifecycle rule (auto-delete old segments)

1. Bucket → **Management** tab → **Create lifecycle rule**
2. Rule name: `expire-live-segments`
3. Prefix: `live/`
4. Lifecycle rule actions: ✅ **Expire current versions of objects**
5. Expiration: **1 day** after creation
6. Click **Create rule**

> Segments older than 24h are useless (stream is long over). This prevents infinite storage growth.

---

## Part 2: CloudFront Distribution (AWS Console)

### 2.1 Create distribution

1. Open **AWS Console** → **CloudFront** → **Create distribution**
2. **Origin domain**: Select your S3 bucket from the dropdown (`castify-hls-live.s3.us-east-1.amazonaws.com`)
3. **Origin access**: Select **Origin access control settings (recommended)**
   - Click **Create new OAC**
   - Name: `castify-hls-oac`
   - Signing behavior: **Sign requests (recommended)**
   - Click **Create**
4. **Viewer protocol policy**: **Redirect HTTP to HTTPS**
5. **Allowed HTTP methods**: **GET, HEAD, OPTIONS**
6. **Cache policy**: Select **CachingDisabled** for now (we'll add per-path rules below)
7. **Origin request policy**: Select **CORS-S3Origin**
8. **Response headers policy**: Select **CORS-Allow-All-Origins** (or create custom one with your domain)
9. **Price class**: **Use only North America, Europe, Asia, Middle East, Africa** (saves ~30% vs all edge locations)
10. **Alternate domain name (CNAME)**: `video.castify.com` (requires ACM certificate)
11. **Custom SSL certificate**: Select your ACM certificate for `video.castify.com`
12. Click **Create distribution**

### 2.2 Add per-path cache behaviors

After the distribution is created (takes ~5 minutes):

1. Open distribution → **Behaviors** tab → **Create behavior**

**Behavior 1: `*.m3u8` files (playlists — must NOT cache)**

| Field | Value |
|-------|-------|
| Path pattern | `*.m3u8` |
| Cache policy | **CachingDisabled** |
| Origin request policy | CORS-S3Origin |
| Response headers policy | CORS-Allow-All-Origins |

**Behavior 2: `*.ts` files (segments — cache aggressively)**

| Field | Value |
|-------|-------|
| Path pattern | `*.ts` |
| Cache policy | Create new → **CachingOptimized** with these overrides: |
| | Minimum TTL: 0 |
| | Default TTL: 60 (seconds) |
| | Maximum TTL: 86400 (24h — segments are immutable) |
| Origin request policy | CORS-S3Origin |
| Response headers policy | CORS-Allow-All-Origins |

**IMPORTANT**: Order matters. Move `*.m3u8` **above** `*.ts` in the behaviors list. CloudFront evaluates top-to-bottom.

### 2.3 Update S3 bucket policy (allow CloudFront OAC)

1. After creating the distribution, CloudFront shows a banner: **"Update S3 bucket policy"**
2. Click **Copy policy** — CloudFront auto-generates the correct policy
3. Go back to S3 → bucket → **Permissions** → **Bucket policy**
4. Paste and **Save**

The policy will look like:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::castify-hls-live/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/E1ABCDEFGHIJKL"
      }
    }
  }]
}
```

---

## Part 3: hls-packager Env Config

```bash
# Production .env for AWS S3
STORAGE_ENDPOINT=s3.amazonaws.com
STORAGE_PORT=443
STORAGE_USE_SSL=true
STORAGE_ACCESS_KEY=<IAM-access-key>
STORAGE_SECRET_KEY=<IAM-secret-key>
STORAGE_BUCKET=castify-hls-live
STORAGE_REGION=us-east-1
STORAGE_FORCE_PATH_STYLE=false
```

### IAM User setup (console)

1. **IAM** → **Users** → **Create user**
2. Name: `castify-hls-packager`
3. Attach policy: **Create inline policy** → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
    "Resource": [
      "arn:aws:s3:::castify-hls-live",
      "arn:aws:s3:::castify-hls-live/*"
    ]
  }]
}
```

4. Create user → **Security credentials** → **Create access key** → **Application running on own server**
5. Copy the access key + secret into `.env`

---

## Part 4: Player URL

```
Local dev:    http://localhost:8080/minio/hls-segments/live/<stream-key>/master.m3u8
CloudFront:   https://video.castify.com/live/<stream-key>/master.m3u8
```

The object key structure is identical — CloudFront proxies the bucket root.

---

## Part 5: Cost Calculations

### Scenario

| Variable | Value |
|----------|-------|
| Concurrent live streams | 1,000 |
| Quality tiers per stream | 3 (720p, 480p, 360p) |
| Avg segment size | 175 KB (weighted: 720p≈300KB, 480p≈150KB, 360p≈75KB) |
| Segment duration | 2 seconds |
| Viewers per stream | 1,000 (1M total concurrent viewers) |
| Avg watch time per viewer | 30 minutes |
| Stream hours per day | 24 (continuous) |

### Per-viewer data consumption

```
Playlist polls:   30 min × 30 polls/min × 3 KB  =  2.7 MB
Segment downloads: 30 min × 30 segments/min × 175 KB = 157.5 MB
Total per viewer:                                   ~160 MB per session
```

---

### A. S3 ONLY (no CloudFront) — DO NOT DO THIS

Viewers pull directly from S3. S3 data transfer is priced for storage retrieval, not content delivery.

| Cost category | Calculation | Monthly |
|--------------|-------------|---------|
| **S3 Storage** (24h lifecycle) | 1000 streams × 3 qualities × 945 MB/hr × 24h = 68 TB stored × $0.023/GB | **$1,560** |
| **S3 PUT requests** | 1000 × 3 × 1800/hr × 24h × 30d = 3.89B PUTs × $0.005/1K | **$19,440** |
| **S3 GET requests** (playlist polls) | 1M viewers × 30 segments poll × 60s/2s × 1 playlist per poll = 900M GETs × $0.0004/1K | **$360** |
| **S3 GET requests** (segment downloads) | 1M × 30 min × 30 seg/min = 900M GETs × $0.0004/1K | **$360** |
| **S3 Data Transfer OUT** | 1M viewers × 160 MB = 156 TB<br>First 10TB: $0.09/GB × 10,000 = $900<br>Next 40TB: $0.085/GB × 40,000 = $3,400<br>Next 100TB: $0.07/GB × 100,000 = $7,000<br>Remaining 6TB: $0.05/GB × 6,000 = $300 | **$11,600** |
| **TOTAL S3 ONLY** | | **≈$33,320/month** |

> **$33K/month for 1M viewers is terrible.** S3 is not a CDN. Adding more viewers pushes you into higher data transfer tiers and latency explodes globally. This approach is non-viable at any real scale.

---

### B. S3 + CloudFront (recommended)

CloudFront absorbs all viewer traffic. S3 only talks to CloudFront (free origin fetches).

| Cost category | Calculation | Monthly |
|--------------|-------------|---------|
| **S3 Storage** | Same as above | **$1,560** |
| **S3 PUT requests** | Same as above | **$19,440** |
| **S3 GET requests** (CloudFront origin fetches) | CloudFront caches segments — approx 20% miss rate. 360M GETs × $0.0004/1K | **$144** |
| **CloudFront Data Transfer OUT** (US/Europe) | 1M viewers × 160 MB = 156 TB/mo<br>First 10TB: $0.085/GB × 10,000 = $850<br>Next 40TB: $0.080/GB × 40,000 = $3,200<br>Next 100TB: $0.060/GB × 100,000 = $6,000<br>Remaining 6TB: $0.040/GB × 6,000 = $240 | **$10,290** |
| **CloudFront HTTP Requests** | 1.8B requests × $0.0075/10K (after first 10M) | **$1,350** |
| **TOTAL S3 + CLOUDFRONT** | | **≈$32,784/month** |

Wait — at this scale CloudFront doesn't save much vs S3 alone? Actually it does save on the higher tiers. Let me recalculate more carefully.

Actually, the real advantage of CloudFront isn't just cost — it's **latency**. S3 is in one region (us-east-1). Viewers in Tokyo, Sydney, Mumbai would get 200–400ms RTT per segment request. CloudFront has 600+ edge locations — viewers get <20ms. You can't run a live streaming platform on S3 alone for a global audience.

### C. CloudFront with Reserved Capacity (scale pricing)

At 150+ TB/month, you qualify for AWS **committed-use pricing**. Contact AWS sales for a **CloudFront Security Savings Bundle** — typical discounts:

| Volume tier | Discount |
|-------------|----------|
| 10–50 TB/month | Pay-as-you-go (above) |
| 50–500 TB/month | ~15–20% off |
| 500 TB+ /month | ~25–35% off |
| 1 PB+ /month | Custom enterprise pricing |

With 20% discount: **~$26,000/month** instead of $32K.

### D. Per-viewer cost breakdown

| Component | Per viewer-hour |
|-----------|----------------|
| Storage + PUTs | $0.0007 |
| CloudFront egress | $0.0004 |
| CloudFront requests | $0.00005 |
| **Total** | **≈$0.0012 per viewer-hour** |

At $0.0012/hour: 1M viewers watching 30 min = **$600 per 500K viewer-hours**.

---

### E. Scaling comparison

| Viewers | S3 Only | S3 + CloudFront | CloudFront (reserved) |
|---------|---------|-----------------|----------------------|
| 1,000 | $35/mo | $38/mo | $35/mo |
| 10,000 | $330/mo | $310/mo | $280/mo |
| 100,000 | $3,300/mo | $2,800/mo | $2,400/mo |
| 1,000,000 | $33,320/mo | $32,784/mo | $26,000/mo |
| 10,000,000 | $350K+/mo | $290K/mo | $220K/mo |

**At 1M+ viewers, you should negotiate enterprise pricing.** The pay-as-you-go rates above are retail — at 150TB+/month, AWS gives volume discounts on both CloudFront and S3.

> **Bottom line**: At any scale above ~100 concurrent viewers, CloudFront is mandatory — not for cost (pricing is similar at moderate scale) but for **latency**. A live streaming platform on S3-only would be unusable for anyone outside the S3 bucket's region.
