# Multi-stage build pour l'API : on isole les deps + build dans un stage,
# puis on copie le minimum nécessaire dans une image runtime mince.

FROM node:20-alpine AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apk add --no-cache wget openssl

# ---- Dependencies stage ----
FROM base AS deps
WORKDIR /repo

# Copie minimale pour faire le install au niveau workspace.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/domain/package.json ./packages/domain/
COPY packages/application/package.json ./packages/application/
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/
COPY apps/web-admin/package.json ./apps/web-admin/
COPY apps/web-portal/package.json ./apps/web-portal/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mock-moveplanner/package.json ./apps/mock-moveplanner/

# Le schema Prisma est requis pour le postinstall apps/api (prisma generate).
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm install --frozen-lockfile

# ---- Build stage : copie le code, génère Prisma Client, prépare l'app ----
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Le client Prisma a déjà été généré par le postinstall du stage deps
# (le schema était présent à ce moment). Pas besoin de regénérer.

# ---- Runtime stage : image mince qui exécute via tsx ----
FROM node:20-alpine AS runtime
RUN apk add --no-cache wget openssl
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# On copie depuis l'étape build : node_modules hoistés + sources non-buildées
# (on exécute via tsx, conforme au choix d'archi A0.1 — pas de build TS prod
# pour l'instant ; le compile passera en optimisation A6 hardening).
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./
COPY --from=build /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/tsconfig.base.json ./
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Exécution depuis /repo : pnpm résout tsx via le workspace symlink chain.
WORKDIR /repo
CMD ["pnpm", "--filter", "@interim/api", "exec", "tsx", "src/main.ts"]
