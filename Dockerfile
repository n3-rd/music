# Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack and prepare pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Disable pnpm build scripts prompt for CI/Docker builds
ENV PNPM_CONFIG_IGNORED_BUILDS=false

# Copy package descriptors and pnpm configs
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./

# Install all dependencies
RUN pnpm install

# Copy source code
COPY . .

# Build SvelteKit application using adapter-node
ENV NODE_ENV=production
RUN pnpm build

# Production Runner Stage
FROM node:22-alpine AS runner

WORKDIR /app

# Install fontconfig and base fonts for SVG/PNG rendering
RUN apk add --no-cache fontconfig ttf-dejavu ttf-droid ttf-freefont

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy built app, dependencies, static assets, and custom fonts
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/static ./static
COPY --from=builder /app/src/lib/fonts ./src/lib/fonts
COPY --from=builder /app/src/lib/fonts ./fonts

EXPOSE 3000

CMD ["node", "build/index.js"]
