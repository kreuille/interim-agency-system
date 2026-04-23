# Multi-stage build pour Next.js web-admin en mode standalone.
# Cible : Cloud Run (port 3000, Node.js 20).

FROM node:20-alpine AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Deps stage : install toutes les deps du monorepo ----
FROM base AS deps
WORKDIR /repo

# Manifests workspace (ordre minimisé pour optimiser le cache layer)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/domain/package.json ./packages/domain/
COPY packages/application/package.json ./packages/application/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web-admin/package.json ./apps/web-admin/

# Le postinstall d'apps/api fait `prisma generate`, on lui donne le schema pour
# que pnpm install ne pète pas (même si on ne build pas l'API ici).
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/worker/package.json ./apps/worker/
COPY apps/mock-moveplanner/package.json ./apps/mock-moveplanner/
COPY apps/web-portal/package.json ./apps/web-portal/

RUN pnpm install --frozen-lockfile

# ---- Build stage : copie les sources + build Next ----
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/domain ./packages/domain
COPY packages/application ./packages/application
COPY packages/contracts ./packages/contracts
COPY apps/web-admin ./apps/web-admin

# web-admin n'a pas de dossier public/ versionné — on le crée vide pour que
# le COPY du stage runtime ne fail pas (Next sert l'app sans statique).
RUN mkdir -p apps/web-admin/public

RUN pnpm -F @interim/web-admin build

# ---- Runtime stage : image mince avec juste le serveur standalone ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Copie depuis le standalone Next (server.js + node_modules minimaux)
COPY --from=build /repo/apps/web-admin/.next/standalone ./
COPY --from=build /repo/apps/web-admin/.next/static ./apps/web-admin/.next/static
COPY --from=build /repo/apps/web-admin/public ./apps/web-admin/public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# server.js est généré par Next standalone à la racine du package
CMD ["node", "apps/web-admin/server.js"]
