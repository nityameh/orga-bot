# Orga API container (ADR-019). Used by option B (free VM via docker-compose) and
# any container host. Build with the model baked in for fast cold starts:
#   docker build --build-arg PRELOAD_MODEL=true -t orga-api .
FROM node:20-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY prompts ./prompts
COPY scripts ./scripts

# Optionally download the open-source embedding model at build time.
ARG PRELOAD_MODEL=false
RUN if [ "$PRELOAD_MODEL" = "true" ]; then node scripts/check-embedder.js; fi

# Run as the unprivileged "node" user.
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
