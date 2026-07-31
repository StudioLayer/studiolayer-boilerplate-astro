# syntax=docker/dockerfile:1

# --- build stage ---
FROM node:22-slim AS build
WORKDIR /app

# cap node heap during build so vite/rolldown can't blow past RAM
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Copy ONLY what the runtime needs. NOT src/ - server-side routes must never
# read from src/ (it does not exist in the container). Runtime assets (fonts
# for OG images, etc.) belong in public/ (they end up in dist/client).
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/package.json ./package.json

EXPOSE 4321
CMD ["node", "./server.mjs"]
