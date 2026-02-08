# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies
RUN npm ci

# Copy source code
COPY shared/src ./shared/src
COPY shared/tsconfig.json ./shared/
COPY server/src ./server/src
COPY server/tsconfig.json ./server/
COPY server/public ./server/public
COPY client/src ./client/src
COPY client/tsconfig.json ./client/
COPY client/vite.config.ts ./client/
COPY client/index.html ./client/
COPY client/public ./client/public

# Build all workspaces
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install only runtime dependencies
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/public ./server/public
COPY --from=builder /app/client/dist ./client/dist

# Expose ports
EXPOSE 5173 8080

# Default to running the server
# For local development, the client is served via vite at 5173
# The server runs on 8080
CMD ["node", "server/dist/index.js"]
