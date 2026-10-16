FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY scripts/install-electron.mjs scripts/install-electron.mjs
RUN npm ci
COPY src/server src/server
COPY src/shared src/shared
COPY tsconfig.server.json ./
RUN npm run server:build

FROM node:22-bookworm-slim
ENV NODE_ENV=production ELECTRON_SKIP_BINARY_DOWNLOAD=1 HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/install-electron.mjs scripts/install-electron.mjs
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/server/index.js"]
