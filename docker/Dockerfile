# syntax=docker/dockerfile:1.7
# Image de l'application Stivea Vet : multi-étapes, sortie `standalone`, exécution sans root.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Worker de la file de tâches (ADR 0014) : même code que l'application, exécuté par tsx,
# sans root. Construit seulement avec --target worker (Docker Compose) ; l'image par défaut
# reste celle de l'application, ci-dessous.
FROM build AS worker
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 stivea && useradd --system --uid 1001 --gid stivea stivea
USER stivea
CMD ["node_modules/.bin/tsx", "scripts/worker.mts"]

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 stivea && useradd --system --uid 1001 --gid stivea stivea
COPY --from=build --chown=stivea:stivea /app/.next/standalone ./
COPY --from=build --chown=stivea:stivea /app/.next/static ./.next/static
COPY --from=build --chown=stivea:stivea /app/public ./public
# Seul répertoire inscriptible (cache d'images) ; monté en tmpfs quand le système de fichiers est en lecture seule.
RUN mkdir -p .next/cache && chown stivea:stivea .next/cache
USER stivea
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
