# Entify frontend.
#
# Multi-stage so the runtime image carries the standalone server bundle rather
# than the full node_modules tree and the build toolchain.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci needs a lockfile; fall back to install so a fresh clone still builds.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi


FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked in at build time, because Next inlines NEXT_PUBLIC_* into the client
# bundle. Changing where the API lives means rebuilding this image.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN useradd --create-home --shell /bin/false --uid 1001 nextjs

# The standalone output expects static assets alongside it in these exact
# locations; it does not serve them from the build directory.
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
