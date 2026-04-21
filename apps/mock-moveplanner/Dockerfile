FROM node:25-alpine

RUN apk add --no-cache wget
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json ./
RUN pnpm install --prod=false --ignore-workspace --no-frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

ENV PORT=3030
EXPOSE 3030

CMD ["pnpm", "exec", "tsx", "src/main.ts"]
