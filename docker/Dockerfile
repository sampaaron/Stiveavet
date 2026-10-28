# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Images de Stivea Vet : multi-étapes, sortie `standalone`, exécution sans root.
# Images de base épinglées par empreinte (tag en clair pour la lecture) ; Dependabot les relève.

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:scripts

# Tâches hors Next.js : un fichier compilé par esbuild avec ses dépendances (pnpm
# build:scripts), sans node_modules, sources ni outils de développement, et sans root.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS node-job
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 stivea && useradd --system --uid 1001 --gid stivea stivea

# Migrations (ADR 0041) : tâche ponctuelle, seule à recevoir MIGRATOR_DATABASE_URL, lancée
# depuis le réseau privé avant chaque déploiement. Construite avec --target migrate.
FROM node-job AS migrate
COPY --from=build /app/dist/db/migrate.mjs ./dist/db/migrate.mjs
COPY --from=build /app/db/migrations ./dist/db/migrations
USER stivea
CMD ["node", "dist/db/migrate.mjs"]

# Worker de la file de tâches (ADR 0014, 0041). Construit avec --target worker ; l'image
# par défaut reste celle de l'application, ci-dessous.
FROM node-job AS worker
RUN mkdir -p /data/objets && chown stivea:stivea /data/objets && chmod 700 /data/objets
COPY --from=build /app/dist/scripts/worker.mjs ./dist/worker.mjs
USER stivea
CMD ["node", "dist/worker.mjs"]

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 stivea && useradd --system --uid 1001 --gid stivea stivea
COPY --from=build --chown=stivea:stivea /app/.next/standalone ./
COPY --from=build --chown=stivea:stivea /app/.next/static ./.next/static
COPY --from=build --chown=stivea:stivea /app/public ./public
# Seul répertoire inscriptible (cache d'images) ; monté en tmpfs quand le système de fichiers est en lecture seule.
RUN mkdir -p .next/cache && chown stivea:stivea .next/cache
# Stockage objet local de la phase 2 (ADR 0019) : volume partagé avec le worker, privé.
RUN mkdir -p /data/objets && chown stivea:stivea /data/objets && chmod 700 /data/objets
USER stivea
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
