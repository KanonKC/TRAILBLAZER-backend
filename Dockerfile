# Stage 1: Build
# Pinned to exact patch (was moving tag node:22-alpine). A rebuild pulled a newer
# Node 22.x patch whose HTTP/stream behavior triggered node-fetch "Premature close"
# in twurple. 20.19.6 is the version proven working locally with the same env.
FROM node:20.19.6-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client and Build
RUN npx prisma generate
RUN npm run build

# Stage 2: Production
FROM node:20.19.6-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies
COPY package*.json ./
RUN npm install

# Copy built assets and config
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8080

# Run the application with path alias resolution
CMD ["npm", "start"]
