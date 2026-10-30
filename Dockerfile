# numnum production image: Next.js app + ffmpeg for video processing
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build:local

FROM base AS run
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/data/storage NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "scripts/start.sh"]
