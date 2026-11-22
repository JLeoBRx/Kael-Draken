# Arquitetura — Última Chama

> Título provisório (definido só em `src/shared/config/game.ts`).
> Documento técnico de referência. Atualizado ao fim de cada fase.

## 1. Análise do ambiente e escolha da engine

### Ambiente disponível (medido no início do projeto)

| Item | Encontrado |
| --- | --- |
| Máquina | contêiner Linux na nuvem (Ubuntu 24.04), 4 CPUs, 15 GB de RAM |
| GPU / tela | **nenhuma** (sem GPU, sem servidor gráfico) |
| Ferramentas | Node 22, Go 1.24, Rust 1.97, Java, Python 3.13, GCC/Clang, Chromium headless (Playwright) |
| Rede | acesso a registros de pacotes (npm, PyPI…); sem Docker em execução |
| Engines instaladas | nenhuma (sem Unity, Unreal ou Godot) |

### Opções avaliadas

| Opção | Viável aqui? | Observação |
| --- | --- | --- |
| Unreal Engine 5 | não | editor de dezenas de GB, exige GPU e tela; não há como compilar nem testar neste ambiente |
| Unity | não | editor gráfico + ativação de licença; sem GPU/tela não há como validar o resultado |
| Godot 4 | parcial | roda headless, mas não está instalado e o resultado visual não poderia ser verificado aqui |
| **TypeScript + Three.js (WebGL 2) + Node.js** | **sim** | tudo instalável via npm; servidor e simulação testáveis em Node; cliente testável em Chromium headless (WebGL por SwiftShader) |

### Decisão: TypeScript + Three.js no cliente, Node.js no servidor

1. **Testável de ponta a ponta neste ambiente** — a regra do projeto é testar cada
   sistema antes de avançar. Com a pilha web, a simulação roda em testes unitários
   (Vitest), o servidor roda de verdade (WebSocket) e o jogo roda em um navegador
   real automatizado (Playwright), inclusive com dois jogadores simultâneos.
2. **Um só código de simulação para cliente e servidor** — a movimentação, a
   colisão e o mapa são o MESMO código TypeScript no navegador (predição) e no
   servidor (autoridade). Isso elimina a classe inteira de bugs de "o cliente
   calcula diferente do servidor".
3. **Três modos com a mesma base** — o servidor autoritativo roda em Node
   (dedicado/LAN) e dentro de um Web Worker no navegador (offline), sem mudar uma
   linha da lógica de jogo.
4. **Distribuição** — o jogo abre em qualquer computador com navegador moderno;
   para LAN basta um computador rodar o host. Empacotamento desktop (Electron ou
   Tauri) e instalador ficam na Fase 8.

Limitações assumidas com transparência: o teto visual de WebGL é menor que o de
Unreal; "qualidade AAA" aqui significa direção de arte consistente, iluminação
PBR, sombras, pós-processamento e boa animação — não fotorrealismo. Os assets
atuais são **placeholders procedurais organizados** (ver §8), prontos para troca
por modelos GLTF e texturas reais.

## 2. Visão geral

```
┌──────────────────────── src/shared (determinístico, sem DOM/Node) ────────────────────────┐
│ math/      escalares, RNG com semente, ruído de gradiente sem trigonometria               │
│ world/     Heightfield, OBB (cápsula×caixa, raio×caixa), SpatialGrid, CollisionWorld      │
│ movement/  stepCharacter(): andar, correr, sprint, pular, agachar, deslizar, nadar        │
│ player/    PlayerState + stepPlayer(): armas, recarga, consumíveis, granadas, queda;       │
│            regras de inventário; escolha do que "Interagir" pega                          │
│ combat/    mira pelo ombro, caixas de acerto (cabeça/corpo), projéteis                     │
│ config/    movimento, catálogo de itens (armas, raridades, consumíveis, munições)          │
│ maps/      formato + builder + estruturas + "Ilha de Brasa" e "Campo de Provas"            │
│ net/       serialização binária e protocolo (comandos, snapshots, eventos)                 │
└───────────────────────────────────────────────────────────────────────────────────────────┘
            ▲ usado por                                   ▲ usado por
┌───────────┴──────────── src/server ──────────┐  ┌───────┴──────────── src/client ──────────────┐
│ core/  Simulation (autoridade: acertos com    │  │ net/     transportes, sessão, predição,       │
│        compensação de latência, dano, loot,   │  │          interpolação                          │
│        baús, projéteis, eliminações, bonecos) │  │ render/  céu, relevo, estruturas, vegetação,   │
│        loot.ts (tabelas por raridade)         │  │          água, armas/itens/baús (substituíveis)│
│        GameHost (conexões, eventos, snapshots,│  │ character/ personagem procedural + animação    │
│        limites, expulsões) — sem Node/DOM     │  │ camera/  terceira pessoa com colisão e luneta  │
│ node/  HTTP + WebSocket, CLI do servidor      │  │ input/   teclado, mouse, controle              │
└───────────────────────────────────────────────┘  │ audio/   sons sintetizados e posicionais       │
            ▲ mesma classe                         │ game/    Match, itens do mundo, efeitos        │
┌───────────┴─────── src/client/worker ─────────┐  │ ui/      menu, mapas, HUD, minimapa,           │
│ GameHost dentro de um Web Worker (offline)    │  │          inventário, telas                     │
└───────────────────────────────────────────────┘  └───────────────────────────────────────────────┘
```

## 3. Modelo de rede: servidor autoritativo

**Nenhum cliente tem autoridade sobre o estado da partida.** O cliente envia só
*intenções* (comandos de entrada); o servidor executa a simulação e publica o
estado oficial.

### Comando de entrada (cliente → servidor, 17 bytes)

`seq` (u32) · `forward`/`right` (i8, −1..1) · `yaw` (u16) · `pitch` (i16) ·
`buttons` (u16: pular, correr, agachar, mirar, caminhar, atirar, recarregar,
interagir) · `slot` (u8: espaço desejado) · `viewTick` (u32: tick que o cliente
estava vendo, base da compensação de latência)

Ações de inventário (soltar, reorganizar) vão em mensagens próprias; o servidor
as aplica e o resultado volta no snapshot.

- O cliente gera **um comando por tick** (30 por segundo), aplica-o imediatamente
  ao próprio personagem (predição) e o envia.
- O cliente usa a versão **quantizada** do comando na própria predição, então
  servidor e cliente calculam com exatamente os mesmos números.

### Snapshot (servidor → cliente)

`tick` · `ackSeq` (último comando aplicado) · `queued` (fila no servidor) ·
vivos · eliminações do destinatário · estado COMPLETO do próprio jogador
(movimento, vida, escudo, inventário, munições, materiais e temporizadores da
arma — para reconciliação exata) · lista de entidades (28 bytes cada: id,
posição, yaw, pitch, flags, velocidade, arma na mão e raridade).

### Eventos (servidor → cliente, confiáveis e em ordem)

Tiros de outros jogadores (com os pontos de impacto), acertos (só para quem
atirou: dano, cabeça, escudo quebrado, eliminação), dano recebido (só para a
vítima, com a direção), eliminações, itens que surgem/somem, baús abertos,
projéteis lançados, explosões, bonecos derrubados e renascimentos. Quem entra
recebe o estado atual do mundo (itens, baús, projéteis) como eventos.

### Predição e reconciliação (jogador local)

1. Ao receber um snapshot, o cliente substitui o estado previsto pelo oficial.
2. Reaplica os comandos ainda não confirmados (`seq > ackSeq`).
3. Se o resultado diverge do que estava na tela, a diferença vira um
   deslocamento visual que decai em ~70 ms (sem "teleporte"); acima de 4 m, corta.

Como a simulação é determinística, em mundo estático o número de correções é
**zero** — verificado em teste com 100 ms de latência em cada sentido
(`tests/unit/net.test.ts`) e nos testes de navegador. Correções passam a ocorrer
quando outro jogador altera o mundo (construções, Fase 3) — é o caso para o qual
a suavização existe.

### Interpolação (jogadores remotos)

Outros jogadores são desenhados ~100 ms no passado, entre dois snapshots. O
relógio do servidor é estimado pelo menor atraso observado. Sem dados novos,
extrapola no máximo 150 ms e para.

### Validações no servidor

| Ameaça | Defesa |
| --- | --- |
| Speed hack (enviar comandos demais) | balde de fichas: 1 comando por tick do servidor, rajada máx. de 8; fila máx. de 64 |
| Teleporte / posição falsa | o cliente nunca envia posição; só intenções |
| Valores inválidos (NaN, eixos > 1, pitch extremo, bits extras, espaço inexistente) | `sanitizeCommand` limita tudo |
| Dano falso, tiro rápido demais, munição infinita | o cliente não informa dano nem acertos; cadência, pente, recarga e dispersão são simulados pelo servidor (`stepPlayer`) |
| Tiro "pela câmera" (atrás de uma quina) | além do raio da mira, o caminho da arma até o impacto precisa estar livre |
| Abusar da compensação de latência | volta no tempo limitada a 1 s; o tick informado é limitado ao intervalo válido |
| Pegar item longe / através de parede | o servidor escolhe o alvo de "Interagir" (alcance de 2,6 m, na direção do olhar) |
| Inventário adulterado | inventário só muda no servidor (coleta, uso, soltar, trocar); o cliente recebe o estado oficial |
| Mensagens malformadas | leitor binário com verificação de limites; mensagem inválida = expulsão |
| Inundação | > 240 mensagens por segundo de jogo = expulsão |
| Protocolo diferente | handshake com versão; incompatível = recusado com motivo |
| Nome abusivo | sem caracteres de controle/HTML, máx. 16 caracteres |

Limitação conhecida: o coice da câmera é aplicado no cliente (como na maioria
dos jogos de tiro); detecção estatística de mira automática entra na Fase 6.
Construções e resultado da partida seguirão a mesma regra nas fases seguintes.

### Combate

1. **Mira pelo ombro.** A câmera fica sobre a reta que sai do ombro na
   direção da mira, então o raio do tiro parte do ombro (`combat/aim.ts`) e
   passa exatamente pelo centro da tela — o servidor reconstrói a mira só com
   yaw, pitch e postura.
2. **Dispersão determinística.** O desvio de cada bala vem de um hash de
   (jogador, comando, bala): cliente e servidor calculam o mesmo, então o
   traçado previsto na tela é o que o servidor valida.
3. **Compensação de latência.** O servidor guarda ~1,5 s de posições de cada
   jogador e, para cada tiro, volta os alvos ao tick que o atirador via
   (`viewTick`), interpolando entre ticks. Testado: acerta onde o atirador via o
   alvo e erra onde ele não estava.
4. **Obstrução.** O mundo bloqueia o raio; além disso, a linha da arma (peito)
   até o impacto precisa estar livre.
5. **Dano.** Por bala: base × raridade × queda por distância × cabeça. O escudo
   absorve primeiro. Escopeta soma os bagos por alvo. Explosões: dano decresce
   com a distância e exige linha de visão; sem dano em si mesmo.
6. **Eliminação.** Tudo o que o jogador carregava cai em volta do corpo; o
   autor recebe o crédito (ou quem causou dano nos últimos 10 s, em quedas).

### Desempenho medido

- **Simulação (Fase 1): 3,3 ms por tick com 100 jogadores** correndo e pulando no
  Campo de Provas.
- **Simulação (Fase 2): 2,5 ms por tick com 100 jogadores armados atirando sem
  parar na Ilha de Brasa** (8 mil colisores, 263 itens no chão) — orçamento a
  30 Hz: 33 ms.
- **Geração do mapa principal: ~240 ms** (relevo de 160 mil amostras, 4.900
  caixas, 4.600 adereços, 252 pontos de loot, 100 baús), igual no cliente e no servidor.
- **Banda: o gargalo real.** Com 100 jogadores atirando, snapshots completos e
  eventos de tiro para todos somam ~10 MB/s de saída. A Fase 6 traz gerência de
  interesse (só quem está por perto, em taxa cheia), compressão delta e taxa
  adaptativa (alvo: < 1,5 MB/s por partida cheia).

## 4. Os três modos

| | Offline | LAN | Online |
| --- | --- | --- | --- |
| Onde roda o servidor | Web Worker no navegador do jogador | processo Node em um computador da rede (`npm run host`) | processo Node em servidor dedicado (nuvem) |
| Transporte | `postMessage` (bytes do protocolo) | WebSocket `ws://IP:7350/ws` | WebSocket seguro `wss://` (TLS) |
| Internet | **não precisa** | não precisa | precisa |
| Como entrar | "Jogar offline" | os outros abrem `http://IP-DO-HOST:7350` e clicam em "Entrar em servidor" | matchmaking / código de convite (Fase 6) |
| Bots | sim (Fase 4) | sim | sim (preencher partidas) |
| Persistência | navegador (Fase 8: arquivo local no app desktop) | idem, no host | banco de dados |

**Tela dividida**: viável — o host aceita várias conexões; o cliente desenha duas
câmeras (viewports) e lê dois controles pela Gamepad API. Planejado para a Fase 5.

**Descoberta na LAN**: navegadores não escutam UDP. Na Fase 5, o host anuncia-se
por broadcast UDP e o app desktop (Fase 8) lista as partidas encontradas; pelo
navegador, entra-se pelo endereço mostrado no terminal do host (já funciona).

## 5. Online em escala (Fases 6–8)

```
            ┌──────────────── Plataforma (Node, sem estado de partida) ───────────────┐
 Cliente ──►│ Autenticação (contas, tokens JWT) · Amigos/convites · Grupos (equipes)  │
  HTTPS     │ Matchmaking (filas por modo/região/habilidade) · Códigos de sala        │
            │ Alocador de partidas · Progressão/estatísticas · Histórico              │
            └──────┬─────────────────────────────┬──────────────────────┬─────────────┘
                   │ aloca partida               │ resultados (só do     │
                   ▼                             │ servidor de jogo)     ▼
       ┌───────────────────────┐                 │              ┌──────────────┐
       │ Nós de servidores de  │─────────────────┘              │ PostgreSQL   │
       │ jogo (GameHost em     │◄── Cliente (wss, com ticket    │ (+ Redis p/  │
       │ processos/containers) │    assinado da partida)        │ filas/presença)
       └───────────────────────┘                                └──────────────┘
```

- Cada partida é um processo `GameHost` (o mesmo de hoje), empacotado em container.
- Os nós registram-se no alocador com batimentos; o alocador escolhe o nó com
  capacidade na região certa.
- O cliente recebe um **ticket assinado** (HMAC/JWT) para entrar na partida; o
  servidor de jogo valida o ticket — ninguém entra em partida para a qual não foi
  escalado.
- Resultados, XP e estatísticas são enviados **pelo servidor de jogo** à
  plataforma, nunca pelo cliente.
- Reconexão: o jogador desconectado continua na simulação por N segundos; o
  ticket permite voltar ao mesmo personagem.
- Evolução de transporte: WebTransport (datagramas, sem bloqueio de cabeça de
  fila) com WebSocket como alternativa; o protocolo já é independente do transporte.

## 6. Simulação e física

- **Tick fixo de 30 Hz** (configurável), igual no cliente e no servidor.
- **Personagem = cápsula vertical** (raio 0,38 m; 1,8 m em pé, 1,2 m agachado).
- **Colisão própria e determinística** (sem motor de física externo):
  - relevo por campo de alturas, interpolado pelos mesmos triângulos da malha;
  - caixas orientadas para tudo o que é construído (paredes, pisos, rampas, telhados);
  - contato cápsula×OBB pela distância segmento–caixa (convexa: busca áurea exata);
  - subpassos de até 20 cm (sem atravessar paredes de 20 cm mesmo a 55 m/s);
  - degraus de até 45 cm com auxílio de subida; rampas até 50° (as de construção têm 45°);
  - "colar no chão" em descidas e degraus para baixo.
- Construções da Fase 3 entram no `CollisionWorld` (adicionar/remover em O(1)
  pela grade espacial), com o mesmo código no cliente e no servidor.

## 7. Estrutura de pastas

```
game/
├── index.html                 entrada do cliente
├── package.json               scripts (dev, build, server, host, test, test:e2e)
├── vite.config.ts             build do cliente (e proxy /ws para o servidor em dev)
├── playwright.config.ts       testes de navegador
├── docs/                      ARQUITETURA.md (este), ROADMAP.md
├── src/
│   ├── shared/                código comum cliente/servidor
│   │   ├── config/            game.ts (identidade), movement.ts, items.ts (catálogo)
│   │   ├── math/              scalar, rng, noise
│   │   ├── world/             heightfield, obb, spatial-grid, collision-world
│   │   ├── movement/          character.ts (controlador)
│   │   ├── player/            player.ts (estado + stepPlayer), inventory.ts, interact.ts
│   │   ├── combat/            aim.ts, hitboxes.ts, projectile.ts
│   │   ├── maps/              types, builder, structures, ember-island, proving-grounds, index
│   │   └── net/               binary, protocol
│   ├── server/
│   │   ├── core/              simulation.ts, game-host.ts, loot.ts (sem dependências de ambiente)
│   │   └── node/              server.ts (HTTP + WebSocket), main.ts (CLI)
│   └── client/
│       ├── app.ts, main.ts    casca e estados
│       ├── game/              match.ts (laço da partida), world-items.ts, effects.ts
│       ├── net/               transport, session, prediction, interpolation
│       ├── worker/            servidor local (offline)
│       ├── render/            world-view, sky, terrain-mesh, static-geometry, props, item-models, materials, textures
│       ├── character/         character-model.ts
│       ├── camera/            third-person-camera.ts
│       ├── input/             input.ts
│       ├── audio/             audio.ts
│       ├── ui/                screens, hud, minimap, inventory-screen, icons, dom, styles.css
│       └── settings.ts
└── tests/
    ├── unit/                  Vitest: colisão, movimento, mapas, combate, servidor, rede, cliente
    └── e2e/                   Playwright: offline, combate e multijogador no navegador
```

## 8. Assets: placeholders organizados e substituíveis

| Asset | Hoje | Ponto de troca |
| --- | --- | --- |
| Texturas de estruturas | geradas em canvas (`render/textures.ts`) | `render/materials.ts` — trocar a fábrica por `TextureLoader` com o arquivo em `public/assets/textures/` |
| Relevo | cores por altura/inclinação + textura de detalhe | `render/terrain-mesh.ts` + material do relevo (splatmap na Fase 7) |
| Vegetação, rochas, caixotes | malhas low-poly geradas em código, instanciadas | `PART_FACTORIES` em `render/props.ts` — trocar por GLTF |
| Personagem | humanoide procedural com animação procedural, 8 visuais | `character/character-model.ts` — um modelo GLTF com esqueleto implementa a mesma interface (`update`, `setName`, `setHeld`, `muzzleWorld`, `dispose`) |
| Armas, itens e baús | modelos procedurais com cores de raridade | `render/item-models.ts` — trocar por GLTF mantendo a orientação (cano para −Z, empunhadura na origem) |
| Ícones do HUD | silhuetas SVG originais | `ui/icons.ts` |
| Interface | CSS próprio, emblema SVG original | `ui/` |
| Sons | sintetizados por receita (Web Audio), posicionais | `audio/audio.ts` — trocar a receita por um arquivo decodificado com o mesmo nome |

Nada usa nomes, personagens, arte ou sons de outros jogos.

## 9. Tecnologias

| Camada | Tecnologia | Versão |
| --- | --- | --- |
| Linguagem | TypeScript (estrito) | 5.9 |
| Renderização | three.js (WebGL 2, PBR, sombras, ACES) | 0.187 |
| Build do cliente | Vite | 8 |
| Servidor | Node.js + `ws` | 22 / 8 |
| Execução TS no servidor | tsx | 4 |
| Testes | Vitest (unidade/integração), Playwright (navegador) | 5 / 1.63 |
| Persistência (planejada) | navegador (offline), PostgreSQL + Drizzle (online), Redis (filas/presença) | Fase 6 |
| Desktop (planejado) | Electron ou Tauri (inclui o servidor Node para LAN e descoberta UDP) | Fase 8 |
