# Multi-stage build pour Next.js web-portal (PWA intérimaire) en mode standalone.
# Cible : Cloud Run (port 3000, Node.js 20).

FROM node:20-alpine AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Deps stage ----
FROM base AS deps
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/domain/package.json ./packages/domain/
COPY packages/application/package.json ./packages/application/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web-portal/package.json ./apps/web-portal/

COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/worker/package.json ./apps/worker/
COPY apps/mock-moveplanner/package.json ./apps/mock-moveplanner/
COPY apps/web-admin/package.json ./apps/web-admin/

RUN pnpm install --frozen-lockfile

# ---- Build stage ----
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/domain ./packages/domain
COPY packages/application ./packages/application
COPY packages/contracts ./packages/contracts
COPY apps/web-portal ./apps/web-portal

RUN pnpm -F @interim/web-portal build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=build /repo/apps/web-portal/.next/standalone ./
COPY --from=build /repo/apps/web-portal/.next/static ./apps/web-portal/.next/static
COPY --from=build /repo/apps/web-portal/public ./apps/web-portal/public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/web-portal/server.js"]
