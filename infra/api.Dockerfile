FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig*.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @oncotrack/contracts && npm run build -w @oncotrack/api
RUN npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
