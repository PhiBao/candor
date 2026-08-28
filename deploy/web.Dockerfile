# Multi-stage: build the pnpm workspace, serve the static app with Caddy.
# Caddy also provides the same-origin proxies the browser expects:
#   /issuer/*       -> the issuer Fly app (TLS)
#   /proof-server/* -> the proving service (TLS)
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/contract/package.json packages/contract/
COPY packages/issuer/package.json packages/issuer/
RUN pnpm install --frozen-lockfile

COPY . .

# Baked at build time so visitors land on the deployed contract instantly
ARG VITE_CONTRACT_ADDRESS
ENV VITE_CONTRACT_ADDRESS=$VITE_CONTRACT_ADDRESS
ARG VITE_HOSTED_PROVER
ENV VITE_HOSTED_PROVER=$VITE_HOSTED_PROVER

RUN pnpm build

FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
