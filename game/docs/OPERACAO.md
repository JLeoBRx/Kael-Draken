# Operação do servidor online

Como colocar a Última Chama online para muita gente, acompanhar e manter.

## Peças

```
                 navegadores / aplicativo
                  │ HTTPS + WSS             │ WSS (partida)
                  ▼                         ▼
      ┌─────────────────────┐      ┌──────────────────┐
      │ plataforma (:7370)  │◄────►│ nó de jogo (:7380)│ … outros nós, em outras máquinas
      │ contas, amigos,     │ /nodes│ partidas (GameHost)│
      │ matchmaking, banco  │      └──────────────────┘
      │ + servidores reserva│
      └─────────────────────┘
               │ SQLite (volume)
```

| Programa | Pacote | O que faz |
| --- | --- | --- |
| Plataforma | `dist/server/plataforma.mjs` | site do jogo, `/platform` (conta, amigos, grupo, fila, salas), banco SQLite, matchmaking; distribui as partidas entre os nós e roda as que sobrarem (reserva) |
| Nó de jogo | `dist/server/no-de-jogo.mjs` | roda as partidas que a plataforma pede; os jogadores conectam direto nele |
| Servidor dedicado | `dist/server/servidor.mjs` | servidor sem contas (LAN ou um servidor público por endereço) |

Os três estão na mesma imagem Docker (`Dockerfile`), sem `node_modules`: cada
programa é um único arquivo `.mjs`.

## Subir com Docker Compose

```bash
cd game
cp deploy/env.example .env          # edite: PLATFORM_SECRET (obrigatório)
docker compose up -d --build
docker compose ps                    # os três devem ficar "healthy"
```

Abra `http://localhost:7370`. O `docker-compose.yml` sobe a plataforma e dois
nós (`no-1`, `no-2`, 4 partidas cada) e guarda o banco no volume `dados`.

Para outros computadores da rede jogarem, troque `localhost` pelo IP da
máquina em `NODE1_PUBLIC_URL` e `NODE2_PUBLIC_URL` (são os endereços que os
**navegadores** usam para chegar aos nós).

### Com domínio e HTTPS

Aponte o DNS do domínio para a máquina, libere as portas 80 e 443 e defina
`UC_DOMAIN` no `.env`:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.tls.yml up -d --build
```

O Caddy (`deploy/Caddyfile`) obtém o certificado sozinho e atende tudo pelo
mesmo domínio: `https://DOMÍNIO/` (jogo e plataforma) e
`wss://DOMÍNIO/n/no-1/…` (nós). A plataforma e os nós deixam de expor portas e
passam a confiar no `X-Forwarded-For` do proxy (limites por IP). O `/metrics`
fica fechado para fora (o Prometheus fala direto com os contêineres).

### Redes com proxy que intercepta TLS

Se o `npm ci` do build falhar com `SELF_SIGNED_CERT_IN_CHAIN`, passe a CA da
rede como segredo de build (não fica gravada na imagem):

```bash
docker build --secret id=ca,src=/caminho/ca.crt -t ultima-chama:1.0.0 .
```

## Nós em outras máquinas

Em cada máquina extra (só precisa de Docker, ou de Node 22 com o arquivo
`no-de-jogo.mjs`):

```bash
docker run -d --name uc-no-3 --restart unless-stopped -p 7380:7380 \
  -e PLATFORM_URL=https://jogo.exemplo.com.br \
  -e PLATFORM_SECRET=<o mesmo da plataforma> \
  -e NODE_NAME=no-3 -e NODE_REGION=sa -e NODE_CAPACITY=6 \
  -e NODE_PUBLIC_URL=wss://no3.jogo.exemplo.com.br \
  --stop-timeout 960 \
  ultima-chama:1.0.0 node dist/server/no-de-jogo.mjs
```

- O nó conecta em `<PLATFORM_URL>/nodes` e prova que conhece o segredo
  (desafio + HMAC; o segredo não trafega). Nome repetido substitui a conexão
  antiga (mesma máquina reconectando).
- `NODE_PUBLIC_URL` é o endereço que os **jogadores** usam. Com a plataforma em
  HTTPS, ele precisa ser `wss://` (navegadores bloqueiam `ws://` em página
  segura): ponha um proxy TLS na frente do nó (o mesmo Caddyfile, com
  `reverse_proxy localhost:7380`).
- Região (`sa`, `na`, `eu`): a fila de cada região vai primeiro para os nós
  dela; sem vaga, para qualquer nó; por fim, para os servidores reserva da
  plataforma (`MAX_SERVERS`; `0` = nenhum).
- Firewall do nó: entrada TCP na porta pública; saída para a plataforma.

Sem Docker: `node --enable-source-maps dist/server/no-de-jogo.mjs --help`.

## Variáveis de ambiente

| Variável | Programa | Padrão | Para quê |
| --- | --- | --- | --- |
| `PLATFORM_SECRET` | plataforma, nó | — (aleatório na plataforma) | assina os bilhetes de entrada e autentica os nós; **defina sempre** em produção |
| `PORT`, `HOST` | todos | 7370 / 7380 / 7350, `0.0.0.0` | porta e interface |
| `PLATFORM_DB` | plataforma | `data/plataforma.db` | arquivo do banco |
| `MAX_SERVERS` | plataforma | 8 | partidas na própria plataforma (reserva) |
| `LOCAL_REGION` | plataforma | — | região das partidas reserva (vazio = atende qualquer uma) |
| `TRUST_PROXY` | plataforma, nó | 0 | `1` atrás de proxy: IP do cliente pelo `X-Forwarded-For` |
| `METRICS_TOKEN` | plataforma, nó | — | exige `Authorization: Bearer <token>` em `/metrics` |
| `STATIC_DIR` | plataforma | `dist/client` | cliente servido em `/` |
| `PLATFORM_URL` | nó | `http://localhost:7370` | onde fica a plataforma |
| `NODE_NAME` | nó | nome da máquina | identifica o nó (logs, métricas) |
| `NODE_PUBLIC_URL` | nó | `ws://<IP>:<porta>` | endereço dos jogadores até o nó (aceita prefixo: `wss://dominio/n/no-1`) |
| `NODE_REGION` | nó | `sa` | região |
| `NODE_CAPACITY` | nó | 4 | partidas simultâneas |
| `DRAIN_TIMEOUT` | nó | 900 | segundos esperando as partidas no desligamento |

Opções equivalentes em linha de comando: `--help` em cada programa
(mapa, tamanho do lobby, espera da fila, aquecimento, zona, dificuldade dos
bots…).

## Acompanhamento

- `GET /api/health` — 200 quando saudável (503 encerrando). Plataforma:
  banco, pessoas online, partidas, nós conectados. Nó: conectado à
  plataforma, em desligamento, partidas, pessoas. O `HEALTHCHECK` da imagem
  usa essa rota.
- `GET /api/online/status` — situação detalhada (cada partida com o nó, fase,
  pessoas, tick; cada nó com capacidade, memória e carga).
- `GET /metrics` — formato Prometheus:

| Métrica | Onde | Observação |
| --- | --- | --- |
| `uc_online_users` | plataforma | pessoas conectadas |
| `uc_matchmaking_entries` | plataforma | grupos na fila (subindo sem parar = falta capacidade) |
| `uc_server_capacity` | plataforma | partidas possíveis somando os nós |
| `uc_game_servers{node,kind}` | plataforma | partidas por nó (pública/privada) |
| `uc_players_in_matches{node}` | plataforma | pessoas em partida por nó |
| `uc_server_tick_ms{server,node}` | plataforma, nó | duração média do tick (orçamento: 33 ms) |
| `uc_node_up{node,region}` | plataforma | 1 conectado, 0 esperando a volta |
| `uc_node_draining` | plataforma, nó | em desligamento |
| `uc_node_outbox` | nó | resultados guardados esperando a plataforma |
| `uc_process_*`, `uc_host_load1` | todos | memória, CPU, tempo no ar, carga |

Exemplo de coleta (`prometheus.yml`), de dentro da rede do compose:

```yaml
scrape_configs:
  - job_name: ultima-chama
    static_configs:
      - targets: ['plataforma:7370', 'no-1:7380', 'no-2:7380']
```

Alertas sugeridos: `uc_node_up == 0` por mais de 1 min; tick acima de 20 ms;
`uc_matchmaking_entries > 0` com `uc_server_capacity` todo ocupado; `/api/health`
fora do ar.

Logs vão para a saída padrão (`docker compose logs -f`): entrada de nós,
partidas formadas (com o nó), encerramentos e motivo, avisos de abuso. A
plataforma também grava auditoria no banco (tabela `audit`: entradas,
amizades, filas, partidas, abusos).

## Atualizar sem derrubar partidas

1. Construa a imagem nova (`docker compose build`).
2. Recrie **um nó por vez**: `docker compose up -d --no-deps no-1`. No
   `SIGTERM`, o nó avisa a plataforma (sem partidas novas), espera as atuais
   terminarem (até `DRAIN_TIMEOUT`, o `stop_grace_period` do compose é 16 min)
   e sai; o novo se registra em seguida.
3. Recrie a plataforma: `docker compose up -d --no-deps plataforma`. As
   partidas nos nós **continuam**; os nós reconectam sozinhos e a plataforma
   nova readota cada partida (resultados guardados durante a troca são
   enviados na volta). Só as partidas reserva da própria plataforma acabam.
   Pessoas no menu reconectam sozinhas.

Versões diferentes de protocolo são recusadas na entrada (o nó mostra o
motivo no log; o navegador pede para recarregar a página).

## Cópia de segurança do banco

O banco usa WAL: não copie o arquivo com a plataforma rodando. Para uma
cópia consistente sem parar nada:

```bash
docker compose exec plataforma node -e \
  "new (require('node:sqlite').DatabaseSync)('/app/data/plataforma.db').exec(\"VACUUM INTO '/app/data/copia-$(date +%F).db'\")"
docker compose cp plataforma:/app/data/copia-$(date +%F).db ./
```

Para restaurar: pare a plataforma, coloque a cópia como
`/app/data/plataforma.db` no volume e suba de novo.

## Capacidade medida

Teste de carga pelo caminho real (entrada pelo nome → fila → bilhete →
partida, comandos a 30 Hz), `scripts/load-test.ts`:

| Cenário | Resultado |
| --- | --- |
| Docker Compose, 60 pessoas: 24 em `no-1`, 24 em `no-2`, 12 na reserva da plataforma | tick médio 0,9–0,95 ms (pior 1,3 ms) em cada; 5–8 KB/s recebidos por pessoa |
| Um processo, 100 pessoas na mesma partida, agrupadas (pior caso) | 4,5 ms por tick; ~15 KB/s por pessoa |
| Partida espalhada, 60 bots + 8 clientes | ~3,4 KB/s por cliente |

Regra prática: uma partida de 100 cabe com folga em 1 núcleo; um nó com
`NODE_CAPACITY` igual ao número de núcleos livres; ~2 Mbit/s de saída por
partida de 100 pessoas. Rode o teste contra o seu ambiente (com
`TRUST_PROXY=1`, porque todas as pessoas simuladas saem da mesma máquina):

```bash
npx tsx scripts/load-test.ts --pessoas 60 --segundos 75 --url http://localhost:7370
```

## Segurança

- **Segredo**: `PLATFORM_SECRET` longo e aleatório, igual na plataforma e nos
  nós, fora do repositório (arquivo `.env`, segredo do orquestrador).
- Tudo que vem do cliente é validado no servidor (movimento, tiros, construção,
  mensagens da plataforma com limite de tamanho e de taxa); nós não confiam na
  descrição de partida recebida sem conferir.
- Limites por IP (conexões simultâneas, conexões por segundo, entradas por
  minuto) — atrás de proxy, só com `TRUST_PROXY=1` e **sem** expor as portas
  diretas (a sobreposição TLS já faz isso).
- `/metrics` sem token só na rede interna.
- **Contas só pelo nome** (decisão do projeto): quem sabe o nome entra na
  conta. Para uso aberto ao público, acrescente um código pessoal ou login por
  e-mail (a sessão já é um token separado do nome).

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| "Todos os servidores estão ocupados" | capacidade esgotada: mais nós ou `NODE_CAPACITY` maior |
| Partida encontrada mas não conecta | `NODE_PUBLIC_URL` errado ou inalcançável pelos jogadores; `ws://` com a plataforma em HTTPS |
| Nó em loop "plataforma recusou o nó: segredo incorreto" | `PLATFORM_SECRET` diferente da plataforma |
| "protocolo de jogo X; a plataforma usa Y" | nó e plataforma de versões diferentes: atualize a imagem |
| Todos os jogadores com o mesmo IP nos logs | falta `TRUST_PROXY=1` atrás do proxy |
| Contas somem ao recriar o contêiner | banco fora do volume (`/app/data`) |
