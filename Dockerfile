# syntax=docker/dockerfile:1
# Imagem de produção do Arquivo da Chama Antiga.
#   docker build -t kael-draken .
#   docker run -p 3000:3000 --env-file .env.producao -v kael-dados:/app/data kael-draken
# O volume /app/data guarda o banco SQLite e as imagens enviadas pelo painel.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/app/data/kael-draken.db \
    UPLOADS_DIR=/app/data/uploads
RUN groupadd --gid 1001 arquivo \
  && useradd --uid 1001 --gid arquivo --no-create-home arquivo \
  && mkdir -p /app/data/uploads \
  && chown -R arquivo:arquivo /app/data
COPY --from=build --chown=arquivo:arquivo /app/.next/standalone ./
COPY --from=build --chown=arquivo:arquivo /app/.next/static ./.next/static
COPY --from=build --chown=arquivo:arquivo /app/public ./public
# Migrações SQL aplicadas automaticamente na inicialização (AUTO_MIGRATE=false desativa)
COPY --from=build --chown=arquivo:arquivo /app/drizzle ./drizzle
USER arquivo
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
