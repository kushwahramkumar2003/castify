# =============================================================================
# Nginx + RTMP module — Castify local development image
# =============================================================================
# Builds nginx from source with the nginx-rtmp-module baked in.
# The official nginx:alpine image does NOT include the RTMP module, so we
# compile it ourselves using the Alpine build toolchain.
#
# Build context: infrastructure/nginx/
# Built by:      docker-compose.yml  (nginx-rtmp service)
#
# Ports exposed:
#   1935  — RTMP  (OBS pushes here)
#   8080  — HTTP  (HLS segments served here + /stat + /health)
# =============================================================================

# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM alpine:3.19 AS builder

# Pin versions for reproducible builds
ARG NGINX_VERSION=1.26.1
ARG RTMP_MODULE_VERSION=1.2.2

RUN apk add --no-cache \
    build-base \
    linux-headers \
    openssl-dev \
    pcre2-dev \
    zlib-dev \
    wget \
    git

WORKDIR /build

# Download nginx source
RUN wget -q "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" \
    && tar -xzf "nginx-${NGINX_VERSION}.tar.gz"

# Download nginx-rtmp-module
RUN wget -q "https://github.com/arut/nginx-rtmp-module/archive/refs/tags/v${RTMP_MODULE_VERSION}.tar.gz" \
    && tar -xzf "v${RTMP_MODULE_VERSION}.tar.gz"

# Compile nginx with RTMP module and standard production flags
RUN cd "nginx-${NGINX_VERSION}" && \
    ./configure \
        --prefix=/etc/nginx \
        --sbin-path=/usr/sbin/nginx \
        --modules-path=/usr/lib64/nginx/modules \
        --conf-path=/etc/nginx/nginx.conf \
        --error-log-path=/var/log/nginx/error.log \
        --http-log-path=/var/log/nginx/access.log \
        --pid-path=/var/run/nginx.pid \
        --lock-path=/var/run/nginx.lock \
        --http-client-body-temp-path=/var/cache/nginx/client_temp \
        --http-proxy-temp-path=/var/cache/nginx/proxy_temp \
        --http-fastcgi-temp-path=/var/cache/nginx/fastcgi_temp \
        --http-uwsgi-temp-path=/var/cache/nginx/uwsgi_temp \
        --http-scgi-temp-path=/var/cache/nginx/scgi_temp \
        --with-http_ssl_module \
        --with-http_v2_module \
        --with-http_realip_module \
        --with-http_stub_status_module \
        --with-http_gzip_static_module \
        --with-threads \
        --with-stream \
        --with-stream_ssl_module \
        --with-stream_realip_module \
        --add-module=../nginx-rtmp-module-${RTMP_MODULE_VERSION} \
    && make -j"$(nproc)" \
    && make install

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM alpine:3.19

# Runtime dependencies only — no build tools
RUN apk add --no-cache \
    pcre2 \
    openssl \
    zlib \
    curl \
    tzdata \
    && addgroup -g 101 -S nginx \
    && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx \
    && mkdir -p \
        /var/log/nginx \
        /var/cache/nginx/client_temp \
        /var/cache/nginx/proxy_temp \
        /var/cache/nginx/fastcgi_temp \
        /var/cache/nginx/uwsgi_temp \
        /var/cache/nginx/scgi_temp \
        /tmp/hls \
        /tmp/dash \
        /etc/nginx/conf.d \
    && chown -R nginx:nginx \
        /var/log/nginx \
        /var/cache/nginx \
        /tmp/hls \
        /tmp/dash \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

# Copy compiled nginx binary and modules from builder
COPY --from=builder /usr/sbin/nginx /usr/sbin/nginx
COPY --from=builder /etc/nginx /etc/nginx

# Copy our config files
COPY nginx.conf      /etc/nginx/nginx.conf
COPY rtmp.conf       /etc/nginx/conf.d/rtmp.conf
COPY hls.conf        /etc/nginx/conf.d/hls.conf

# Expose RTMP and HTTP ports
EXPOSE 1935 8080

# Health check via the /health endpoint defined in hls.conf
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8080/health || exit 1

# Run as root so nginx can bind privileged port 1935 and manage workers
# (for dev only; in prod, use a proper unprivileged setup with capabilities)
CMD ["nginx", "-g", "daemon off;"]
