# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Stage 2: Runtime Server ---
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
# Install only production dependencies
RUN npm install --omit=dev

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy prisma schema and server scripts
COPY prisma ./prisma
COPY server ./server

# Generate Prisma Client for Node runtime
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Perform database migration and startup
CMD ["sh", "-c", "npx prisma db push && node server/server.cjs"]
