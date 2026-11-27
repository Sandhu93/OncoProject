FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig*.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build -w @oncotrack/contracts && npm run build -w @oncotrack/web
RUN npm prune --omit=dev

# The web app is a Node server: it renders pages and calls the API itself, so the browser never talks to
# the API directly. API_URL is read at runtime. Local preview only: a hospital deployment puts a reviewed
# TLS reverse proxy in front of it.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 5173
CMD ["npm", "run", "start", "-w", "@oncotrack/web", "--", "--hostname", "0.0.0.0"]
