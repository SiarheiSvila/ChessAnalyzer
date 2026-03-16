FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV STOCKFISH_PATH=/usr/games/stockfish
ENV ANALYSIS_STORAGE_DIR=/app/storage/local/analyses

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY public ./public

RUN mkdir -p /app/storage/local/analyses \
  && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "dist/app/server.js"]
