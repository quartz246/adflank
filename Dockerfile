# AdFlank: Next.js (standalone) + the Qloo event harness (stdio MCP subprocess), one long-running Node container.
# Runs as uid 10001 with a read-only root filesystem: it writes only to /data (SQLite volume), /tmp and /app/.next/cache.
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/tmp \
    QLOO_HOME=/tmp/qloo-home \
    DB_PATH=/data/adflank.db \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Full production node_modules: the Qloo harness is spawned as a subprocess, so file tracing cannot see all of it.
COPY --from=build /app/node_modules ./node_modules
RUN mkdir -p /data /app/.next/cache && chown -R 10001:10001 /data /app/.next/cache
USER 10001:10001
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
