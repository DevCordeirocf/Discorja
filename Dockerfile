# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY scripts/install-electron.mjs ./scripts/install-electron.mjs
RUN npm ci
COPY . .
RUN npm run server:build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 ELECTRON_SKIP_BINARY_DOWNLOAD=1
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/install-electron.mjs ./scripts/install-electron.mjs
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build --chown=node:node /app/dist/server ./dist/server
COPY --from=build --chown=node:node /app/dist/shared ./dist/shared
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server/index.js"]
