# The Millbrook game server. The server runs TypeScript directly with tsx, so
# there is no build step — install the workspace and start it.
#
# Build context is the repo root (see docker-compose.yml: context: ..).

FROM node:22-alpine

RUN corepack enable
WORKDIR /app

# Install with the lockfile for reproducible deps. Copy the whole repo (the
# .dockerignore keeps node_modules, build output and secrets out).
COPY . .
RUN pnpm install --frozen-lockfile

EXPOSE 8080
CMD ["pnpm", "--filter", "@millbrook/server", "start"]
