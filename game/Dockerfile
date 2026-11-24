# syntax=docker/dockerfile:1
#
# Última Chama — imagem única dos servidores (plataforma, nó de jogo, servidor dedicado).
#
#   docker build -t ultima-chama .
#   docker run -p 7370:7370 -e PLATFORM_SECRET=... -v uc-dados:/app/data ultima-chama
#
# O comando padrão é a plataforma online; para um nó de servidor de jogo:
#   docker run -p 7380:7380 -e PLATFORM_URL=... -e PLATFORM_SECRET=... \
#     -e NODE_PUBLIC_URL=ws://IP:7380 ultima-chama node dist/server/no-de-jogo.mjs
# Veja docs/OPERACAO.md.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# rede com proxy corporativo (TLS interceptado): passe a CA como segredo de build, sem gravá-la na imagem
#   docker build --secret id=ca,src=/caminho/ca.crt .
RUN --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
# cliente (dist/client) e servidores empacotados (dist/server); os testes rodam fora da imagem
RUN npm run build && npm run build:server

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# só o necessário: os pacotes já trazem as dependências (sem node_modules)
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 7370 7380 7350
# a mesma verificação serve para os três programas (cada um responde /api/health na própria PORT)
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 7370) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "dist/server/plataforma.mjs"]
