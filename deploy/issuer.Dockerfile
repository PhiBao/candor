FROM node:20-alpine
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/issuer/package.json packages/issuer/
RUN pnpm install --frozen-lockfile --filter @candor/issuer

COPY packages/issuer ./packages/issuer
RUN pnpm --filter @candor/issuer build

WORKDIR /app/packages/issuer
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "dist/index.js"]
