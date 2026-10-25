FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
ARG DROID_VERSION=0.249.0
RUN arch="$(dpkg --print-architecture)"; case "$arch" in amd64) arch=x64-baseline;; arm64) arch=arm64;; *) exit 1;; esac; \
    url="https://downloads.factory.ai/factory-cli/releases/${DROID_VERSION}/linux/${arch}/droid"; \
    curl -fsSL "$url" -o /usr/local/bin/droid && \
    curl -fsSL "$url.sha256" -o /tmp/droid.sha256 && \
    echo "$(cat /tmp/droid.sha256)  /usr/local/bin/droid" | sha256sum -c - && chmod +x /usr/local/bin/droid
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/orchestrator/package.json apps/orchestrator/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=""
ARG VITE_SPACETIMEDB_URI=""
ARG VITE_SPACETIMEDB_DB_NAME=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_SPACETIMEDB_URI=$VITE_SPACETIMEDB_URI VITE_SPACETIMEDB_DB_NAME=$VITE_SPACETIMEDB_DB_NAME
RUN npm run build && mkdir -p /app/data && chown -R node:node /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATA_DIR=/app/data DROID_EXEC_PATH=/usr/local/bin/droid
USER node
EXPOSE 4000
CMD ["npm", "--workspace=apps/orchestrator", "run", "start"]
