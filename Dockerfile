############################
# 1. Builder Stage
############################
FROM node:20-alpine AS builder

WORKDIR /app

ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN apk add --no-cache python3 make g++

# Copy everything
COPY . .

# Install all deps (workspace)
RUN npm install

# Build project
RUN npm run build


############################
# 2. Production Stage
############################
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Need build tools for better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

# Copy root package files for workspace resolution
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package*.json ./server/

# Install server production dependencies via workspace
RUN npm install --workspace=server --omit=dev

# Remove build tools to keep image small
RUN apk del python3 make g++

# Copy built server code
COPY --from=builder /app/server/dist ./server/dist

# Copy built client code (served by Express in production)
COPY --from=builder /app/client/dist ./client/dist

# Create data directory for SQLite
RUN mkdir -p /data

WORKDIR /app/server

EXPOSE 3000

CMD ["node", "dist/index.js"]
