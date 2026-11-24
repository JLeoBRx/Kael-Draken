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
│ net/       serialização binária e protocolo (comandos, snapshots em delta, eventos)        │
│ platform/  mensagens JSON da plataforma online · progression.ts (XP, níveis, desafios)     │
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
└───────────────────────────────────────────────┘  │ online/  cliente da plataforma e telas online  │
┌──────────────────── src/platform ─────────────┐  └───────────────────────────────────────────────┘
│ store (SQLite) · service (contas, amigos,     │
│ grupos, fila, salas, resultados) · matchmaker │
│ · pool (GameHosts alocados) · tickets (HMAC)  │
│ · server (HTTP + /platform + /game/<id>)      │
└───────────────────────────────────────────────┘
```

## 3. Modelo de rede: servidor autoritativo

**Nenhum cliente tem autoridade sobre o estado da partida.** O cliente envia só
*intenções* (comandos de entrada); o servidor executa a simulação e publica o
estado oficial.

### Comando de entrada (cliente → servidor, 18 bytes)

`seq` (u32) · `forward`/`right` (i8, −1..1) · `yaw` (u16) · `pitch` (i16) ·
`buttons` (u16: pular, correr, agachar, mirar, caminhar, atirar, recarregar,
interagir) · `slot` (u8: espaço desejado; 5 = picareta) · `viewTick` (u32: tick
que o cliente estava vendo, base da compensação de latência) · `build` (u8:
peça, rotação e material do modo construção; 0 = fora dele)

O cliente **não envia onde construir**: o servidor calcula a célula da grade a
partir da posição oficial, do yaw e do pitch do comando — a mesma função que
desenha o fantasma no cliente (`building/grid.ts › buildTarget`).

Ações de inventário (soltar, reorganizar) vão em mensagens próprias; o servidor
as aplica e o resultado volta no snapshot.

- O cliente gera **um comando por tick** (30 por segundo), aplica-o imediatamente
  ao próprio personagem (predição) e o envia.
- O cliente usa a versão **quantizada** do comando na própria predição, então
  servidor e cliente calculam com exatamente os mesmos números.

### Snapshot (servidor → cliente, em delta por conexão)

`tick` · `ackSeq` (último comando aplicado) · `queued` (fila no servidor) ·
vivos · eliminações do destinatário · fase da partida e o tick em que ela
muda (contagens do HUD) · estado do próprio jogador · entidades · colegas de
equipe (vida e escudo).

O WebSocket entrega tudo e em ordem, então cada conexão tem uma **base** dos
dois lados (`SnapshotEncoder` no servidor, `SnapshotDecoder` no cliente): o
servidor manda só o que mudou desde o último snapshot enviado **àquela**
conexão. A base recomeça a cada `Welcome` e esquece quem saiu (`PlayerLeft`);
um delta sem base é erro de protocolo (o cliente encerra, nunca inventa estado).

- **Estado próprio**: 60 números (personagem, vida, escudo, espaços, munições,
  materiais, temporizadores da arma) com máscara de bits; os contínuos vão em
  f64 — a reconciliação continua exata. Parado: ~10 bytes; correndo: ~70.
- **Entidades**: id + máscara; posição quantizada em 1/32 m (±1.024 m), com
  passos pequenos em 3 × i8 e grandes em 3 × u16; ângulos, estado,
  velocidade e arma na mão só quando mudam — velocidade e ângulos com zona
  morta (0,5 m/s, ~0,7°), pois só animam e extrapolam os outros jogadores
  (acertos usam o estado do servidor). As duas bases guardam só o que foi
  enviado, então nunca se separam. Primeira vez: 22 bytes; parado: 3 bytes;
  correndo em linha reta: 6 bytes (antes: 28 sempre).
- **Gerência de interesse** (`GameHost.sendSnapshots`): os 24 mais próximos
  até 150 m, todo snapshot; o resto até 400 m, 1 a cada 2; além, 1 a cada 4;
  a bordo do dirigível
  (invisíveis), 1 a cada 8 — escalonado pelo id para espalhar a carga. Vão
  sempre: colegas de equipe, quem mudou de estado (agachar, saltar do
  dirigível…) e quem a conexão ainda não conhece. Eliminados e espectadores
  recebem todos. A interpolação aguenta o intervalo maior (a extrapolação de
  até 150 ms cobre a falta de amostras de quem está longe).
- **Eventos**: tiros e projéteis lançados a mais de 450 m de quem está vivo
  não são enviados (estado do mundo — itens, peças, baús — vai sempre).

### Eventos (servidor → cliente, confiáveis e em ordem)

Tiros de outros jogadores (com os pontos de impacto), acertos (só para quem
atirou: dano, cabeça, escudo quebrado, eliminação), dano recebido (só para a
vítima, com a direção), eliminações, itens que surgem/somem, baús abertos,
projéteis lançados, explosões, bonecos derrubados e renascimentos. Construção:
peça colocada (com autor e `seq` do comando, para confirmar a previsão), dano
em peça (agregado por tick), peça removida (destruída ou desabada), adereço
quebrado (árvore, rocha, caixote) e material coletado (só para quem coletou).
Golpes de picareta de outros jogadores chegam como "tiro" da picareta, para a
animação e as lascas. Battle royale: rota do dirigível, cada etapa da zona
(círculo atual, próximo, ticks de início/fim do fechamento e dano por
segundo — o cliente calcula o círculo de qualquer instante com a mesma função
do servidor), colocação de quem foi eliminado e o fim da partida (vencedor).
Quem entra recebe o estado atual do mundo (itens, baús, projéteis, peças com
idade e dano, adereços quebrados, dirigível, zona) como eventos.

### Predição e reconciliação (jogador local)

1. Ao receber um snapshot, o cliente substitui o estado previsto pelo oficial.
2. Reaplica os comandos ainda não confirmados (`seq > ackSeq`).
3. Se o resultado diverge do que estava na tela, a diferença vira um
   deslocamento visual que decai em ~70 ms (sem "teleporte"); acima de 4 m, corta.

Como a simulação é determinística, em mundo estático o número de correções é
**zero** — verificado em teste com 100 ms de latência em cada sentido
(`tests/unit/net.test.ts`) e nos testes de navegador. Correções passam a ocorrer
quando outro jogador altera o mundo (constrói ou derruba algo perto) — é o caso
para o qual a suavização existe.

**Construção prevista** (`client/net/predicted-buildings.ts`): a peça erguida
pelo próprio jogador entra no mundo de colisão local no mesmo tick (id
provisório = −seq), então dá para subir na rampa sem esperar a rede. O evento
`piecePlaced` com o mesmo `seq` (que sempre chega antes do snapshot que
confirma o comando) troca o id pelo oficial. Na reconciliação, **todas** as
peças previstas saem do mundo antes de reaplicar os comandos e voltam quando o
próprio comando é reaplicado — assim um comando anterior nunca "vê" uma peça
que no servidor ainda não existia; as de `seq ≤ ackSeq` sem confirmação foram
recusadas e somem. Teste: corrida de 3 rampas com 100 ms de latência em cada
sentido termina com zero correções e as mesmas peças dos dois lados.

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
| Construir onde quiser / de longe | o cliente não envia a posição da peça; o servidor deriva a célula do próprio estado (alcance de 3,2 m à frente) |
| Construir sem material, rápido demais ou no ar | custo (10), intervalo de 0,12 s, apoio no chão ou em outra peça, lugar livre e limite de altura — tudo na simulação oficial |
| Coleta/golpe à distância | o servidor traça o golpe (3 m, a cada 0,55 s) e decide material e quantidade; o cliente só vê o resultado |
| Peça "indestrutível" | vida, dano e desabamento existem só no servidor; o cliente recebe eventos |
| Mexer na sala sem ser anfitrião | configuração e início só valem do anfitrião; mapa, bots, equipes e zona são validados |
| Roubar o personagem de outro | o token de reconexão tem 96 bits aleatórios, vale uma vez e só enquanto o personagem espera |
| Atirar no colega | sem fogo amigo, o servidor ignora dano entre membros da mesma equipe |
| Entrar em partida online alheia | o servidor de jogo só aceita bilhete HMAC assinado para ele, dentro da validade; nome, visual e equipe vêm do bilhete |
| Abrir a mesma conta duas vezes na partida | a conexão nova assume o personagem e a antiga é encerrada |
| Inventar resultado, XP ou nível | resultados só chegam do servidor de jogo à plataforma, uma vez por partida e conta; visuais e títulos bloqueados são recusados |
| Inundar a plataforma | limites por conexão, IP e conta; a conexão abusiva é encerrada e registrada na auditoria |

Limitação conhecida: o coice da câmera é aplicado no cliente (como na maioria
dos jogos de tiro); a detecção estatística de mira automática ficou para depois
da Fase 6 (o servidor já registra acertos e eliminações por partida).

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

### Construção

| Item | Regra |
| --- | --- |
| Grade | células de 4 × 4 m e níveis de 4 m, alinhadas ao mundo (as rampas têm 45°) |
| Peças | parede (borda de célula), piso (topo do nível), rampa (4 direções), telhado de duas águas (2 eixos) — cada uma é 1–2 caixas orientadas, as MESMAS na colisão e no desenho |
| Alvo | ponto a 3,2 m à frente do olho; parede: primeira linha da grade à frente que não atravessa o jogador; nível: o do corpo, +1 ao olhar ~34° para cima; rampa continua a rampa anterior (corrida de rampas) |
| Materiais | madeira 150 de vida / 3 s · pedra 300 / 6 s · metal 450 / 9 s; custo 10; a peça nasce com 10% da vida e cresce até o máximo |
| Apoio | só se constrói tocando o relevo, a geometria fixa do mapa ou outra peça |
| Desabamento | ao remover peças, as vizinhas são agrupadas; grupos sem contato com o chão caem juntos (`BuildingWorld.unsupported`) |
| Dano | balas: dano da arma (sem cabeça); picareta: 50; explosões: dano de área × 3 |
| Picareta | sempre disponível (tecla 1); 20 de dano em jogadores; coleta 8 de madeira (árvores, caixotes, madeira do mapa), 8 de pedra (rochas, concreto, tijolo) ou 6 de metal (carros, contêineres, galpões); estruturas fixas rendem até 60 cada; árvores, rochas e caixotes quebram |

O código vive em `shared/building/` (grade e `BuildingWorld` sobre o
`CollisionWorld`), usado pelo servidor (cópia oficial) e pelo cliente (cópia
com previsões).

### Partida battle royale

`server/core/battle-royale.ts` aplica as regras sobre a mesma `Simulation`:

1. **Aquecimento** — todos no mapa, sem dano e sem loot. A contagem só corre
   com uma pessoa conectada (no servidor dedicado: `--warmup`, padrão 45 s;
   offline: 5 s).
2. **Dirigível** — todos embarcam com o estado zerado numa rota que cruza o
   mapa perto do centro (`planAirship`). A bordo, o personagem segue a rota sem
   colisão e não leva dano; salta com o pulo ou no fim da rota. Quem não manda
   comandos (travou, saiu da janela) é ejetado pelo servidor no fim da rota.
3. **Queda livre e planador** — parte do controlador do personagem (mesmo
   código no cliente e no servidor): mergulho mais rápido olhando para baixo,
   planador automático a 38 m do chão/telhado/água, pouso sem dano.
4. **Zona** — 7 etapas (espera, fechamento, dano por segundo de 1 a 25, direto
   na vida); cada círculo novo fica dentro do anterior com o centro em terra
   firme. A contagem começa quando o dirigível termina a rota. `--zone-speed`
   (servidor) ou "Zona rápida" (offline) aceleram tudo.
5. **Fim** — eliminados não renascem e recebem a colocação; com um só de pé, a
   partida acaba. O servidor dedicado recomeça sozinho (`--no-restart`
   desliga): avisa os clientes com o motivo "Nova partida" e eles reconectam.

### Bots (`server/core/bots/`)

Bots são jogadores da `Simulation` marcados como `bot`: a cada tick o
`BotManager` enfileira para cada um um `InputCommand` — o mesmo que um cliente
enviaria —, então valem as mesmas regras de movimento, munição, cadência,
construção e validação.

- **Navegação** — `NavGrid`: grade de 2 m gerada do mapa (inclinação do relevo,
  água com custo maior, colisores fixos na altura do corpo; obstáculos finos
  como cercas marcam toda célula que cruzam). Portas e vãos vêm do construtor
  do mapa (`map.portals`) e abrem um corredor com pontos exatos, por onde o
  caminho passa. A* em 8 direções sem cortar quinas, com heurística ponderada e
  caminho suavizado; orçamento de 4 buscas por tick para todos os bots.
  Mapa principal: grade gerada em ~90 ms.
- **Percepção** (a cada 5 ticks) — alcance de visão, campo de visão, linha de
  visão contra relevo, prédios e construções; quem atirou nele é notado mesmo
  fora do campo de visão.
- **Decisão** (a cada 10 ticks) — prioridades: sair da zona › fugir › lutar ›
  curar › ir para a próxima zona › saquear › coletar materiais › explorar.
  Fuga só de quem está armado e perto; brigas de picareta só revidando, no
  fim da partida ou sem loot por perto. Sem munição, munição vira prioridade
  máxima no saque.
- **Execução** (todo tick) — mira resolvida pelo mesmo `aimFrame` do tiro,
  com tempo de reação ao ver alguém, erro que diminui enquanto acompanha o alvo
  e aumenta se ele corre, giro limitado; arma escolhida pela distância; tiro
  semiautomático com toques; deslocamento lateral e pulos; parede de
  construção ao tomar tiro; cura atrás de cobertura; quebra construções que o
  prendem; detecção de travamento por falta de progresso até o destino.
- **Dificuldades** (`profiles.ts`) — Fácil, Normal e Difícil mudam reação
  (0,95 / 0,55 / 0,3 s), erro de mira, velocidade de giro, alcance e campo de
  visão, chance de construir, limite para se curar, mira na cabeça e pulos.

### Desempenho medido

- **Simulação (Fase 1): 3,3 ms por tick com 100 jogadores** correndo e pulando no
  Campo de Provas.
- **Simulação (Fase 2): 2,5 ms por tick com 100 jogadores armados atirando sem
  parar na Ilha de Brasa** (8 mil colisores, 263 itens no chão) — orçamento a
  30 Hz: 33 ms.
- **Construção (Fase 3): 1,6 ms por tick com 100 jogadores construindo sem
  parar** na Ilha de Brasa (1.363 peças em 20 s); destruir todas, uma a uma,
  com a verificação de desabamento: 69 ms no total (~0,05 ms por peça).
- **Bots (Fase 4): 0,2–0,4 ms por tick com 40 bots** jogando uma partida inteira
  na Ilha de Brasa (saque, combate, zona, construção); 0,4 ms com 99 bots. Uma
  partida só de bots termina em 4–7 min de jogo com vencedor (teste
  automatizado com 24 bots).
- **Geração do mapa principal: ~240 ms** (relevo de 160 mil amostras, 4.900
  caixas, 4.600 adereços, 252 pontos de loot, 100 baús), igual no cliente e no servidor.
- **Banda (Fase 6)** — `npx tsx scripts/bench-net.ts 60 8 150`: battle
  royale no mapa principal com 60 bots e 8 conexões, bytes enviados a cada
  cliente:

  | | antes (v5) | só delta | delta + interesse |
  | --- | --- | --- | --- |
  | dirigível | 61,9 KB/s | 14,5 KB/s | **4,5 KB/s** |
  | partida | 34,6 KB/s | 7,7 KB/s | **3,4 KB/s** |
  | snapshot médio | 1.473 bytes | 336 bytes | **130 bytes** |

- **Teste de carga (Fase 6)** — `npx tsx scripts/load-test.ts 100 120`: 100
  pessoas simuladas pelo caminho real (entrada na plataforma, fila, bilhete,
  WebSocket do servidor de jogo, comandos a 30 Hz andando, virando o mouse e
  pulando), plataforma em outro processo, mapa principal. Pior caso de banda:
  todos saltam juntos e continuam a menos de 400 m uns dos outros.

  | | resultado |
  | --- | --- |
  | 100 entradas na plataforma | 0,2 s |
  | tick do servidor de jogo | **4,5 ms médio, 5,6 ms no pior momento** (orçamento: 33 ms) |
  | banda por pessoa (todos agrupados) | **~15 KB/s** (19 KB/s no dirigível) |
  | saída do servidor | ~1,5 MB/s com 100 pessoas agrupadas |

  O que pesou: entidades próximas mudam a cada tick. Daí os 24 mais
  próximos em taxa cheia (o resto a cada 2) e as zonas mortas de velocidade
  (0,5 m/s) e ângulos (~0,7°) dos outros jogadores — 25 → 15 KB/s. Taxa
  adaptativa por cliente (menos snapshots para conexões lentas) ainda não
  existe.

## 4. Os três modos

| | Offline | LAN | Online |
| --- | --- | --- | --- |
| Onde roda o servidor | Web Worker no navegador do jogador | processo Node em um computador da rede (`npm run host`) | processo Node em servidor dedicado (nuvem) |
| Transporte | `postMessage` (bytes do protocolo) | WebSocket `ws://IP:7350/ws` | WebSocket seguro `wss://` (TLS) |
| Internet | **não precisa** | não precisa | precisa |
| Como entrar | "Jogar offline" | os outros abrem `http://IP-DO-HOST:7350` e clicam em "Rede local" | "Jogar online": nome → matchmaking ou código de sala |
| Bots | sim (0–99, três dificuldades) | sim (`--bots` ou na sala de espera) | sim (completam as partidas públicas; nas salas, o dono escolhe) |
| Equipes | sim (solo a esquadrão; tela dividida na mesma equipe) | sim (sala de espera) | sim (o grupo fica junto; "completar equipe" junta desconhecidos) |
| Persistência | navegador (Fase 8: arquivo local no app desktop) | idem, no host | banco da plataforma (SQLite): conta, XP, estatísticas, histórico, desafios |

**Sala de espera (LAN)**: com `--lobby` (padrão em `npm run host`), quem conecta
recebe o estado da sala (`S2C.Lobby`: membros, prontos, equipe escolhida,
anfitrião, configuração) e envia ações (`C2S.Lobby`: pronto, equipe e — só o
anfitrião — configuração e início). No início, o servidor monta mapa,
simulação, regras e bots e manda `Welcome` a todos; no fim, volta a mandar o
estado da sala pela mesma conexão.

**Reconexão**: o `Welcome` traz um token. Quem sai pelo menu fecha o
WebSocket com o código 1000 e sai na hora. Se a conexão cair de outro jeito
(rede, aba fechada), o `SimPlayer` fica no mundo por `reconnectSeconds`
(padrão 60), podendo ser atingido; um `Hello` com o
token devolve o mesmo personagem (posição, vida, inventário) e zera a
numeração dos comandos. O cliente guarda o token por aba e por servidor
(`sessionStorage`) e tenta voltar sozinho até 15 vezes.

**Tela dividida**: o servidor local aceita várias conexões; cada jogador é uma
`Match` com sua cena, câmera, HUD e `InputManager` (teclado/mouse para o 1,
controle para o 2), desenhada na sua metade do canvas com `setViewport` e
`setScissor`.

**Descoberta na LAN**: navegadores não escutam UDP. Cada servidor anuncia-se
por broadcast UDP (porta 7351, a cada 2 s, com nome, mapa, ocupação, modo,
sala de espera e versão) e ouve os outros; `/api/lan` devolve a lista, que a
tela "Rede local" mostra. O app desktop (Fase 8) poderá ouvir direto.

## 5. Online (Fase 6)

```
                 ┌──────────────── processo da plataforma (npm run online, :7370) ────────────────┐
 navegador ─────►│ /platform (JSON)   PlatformService: sessões, presença, amigos, grupos,         │
   (HTTPS/wss)   │                    convites, fila, salas, resultados → XP/desafios             │
                 │                       │ Matchmaker (fila por modo+região, janela de habilidade)│
                 │                       │ GameServerPool ──► GameHost <id>… (reserva) e nós (§11) │
 navegador ─────►│ /game/<id> (binário) ─┘   bilhete HMAC verificado pelo próprio GameHost         │
                 │ PlatformStore (node:sqlite, data/plataforma.db)                                  │
                 └──────────────────────────────────────────────────────────────────────────────────┘
```

**Entrada só pelo nome** (pedido do projeto): `login {name}` cria a conta na
primeira vez e usa a mesma depois (sem diferenciar maiúsculas, acentos em forma
canônica). A resposta traz uma **sessão** (token aleatório de 24 bytes, válido
por 30 dias sem uso) que o cliente guarda e usa para voltar sem digitar o nome
(`resume`). Uma conta tem uma conexão por vez: entrar em outro lugar derruba a
anterior.

**Mensagens** (`shared/platform/messages.ts`): pedidos do cliente com `rid` e
resposta `ok`/`error`; avisos empurrados pelo servidor (`welcome`, `me`,
`friends`, `party`, `partyInvite`, `queue`, `matchFound`, `reward`,
`challenges`, `roomInvite`, `notice`, `online`, `kicked`). O cliente mantém um
espelho do estado (`PlatformClient.state`) e as telas só leem dele.

**Amigos e presença**: pedido pelo nome; pedir de volta vira amizade. A
presença (offline, no menu, procurando, em partida, em sala) é calculada pela
plataforma — "em partida" vem do próprio `GameHost` (contas conectadas ou com
personagem esperando reconexão) — e enviada aos amigos e ao grupo quando muda.

**Grupos**: até 4, só com amigos online; o líder convida, tira e entra na
fila; quem cai da plataforma tem 30 s para voltar antes de sair do grupo.
Qualquer mudança no grupo cancela a busca.

**Matchmaking** (`platform/matchmaker.ts`): uma fila por (tamanho de equipe,
região). A entrada mais antiga é a âncora; entram com ela os grupos com
habilidade (MMR médio) a até 150 pontos, janela que alarga 25 pontos por
segundo de espera. A partida sai com `maxHumans` pessoas ou quando a âncora
esperou `maxWait` (padrão 20 s); o lobby é completado com bots até
`lobbySize`. Grupos ficam na mesma equipe; com "completar equipe", grupos
menores dividem equipe com outros (o que sobra o servidor completa com bots).

**Servidores de jogo** (`platform/pool.ts`): cada partida é um `GameHost` com
o próprio laço de ticks, servido em `/game/<id>`, até `--max-servers`. Sem
vaga, os grupos voltam à fila sem perder o lugar. Partida pública: battle
royale, aquecimento até todos os esperados chegarem (encurta para 6 s quando
chegam), encerrada no fim (`KICK_MATCH_OVER` manda o cliente de volta à
plataforma sem tentar reconectar). Sala privada: a sala de espera da Fase 5
com código de 6 caracteres (sem 0/O/1/I/L), partidas seguidas, fechada
depois de 2 min vazia.

**Bilhetes** (`platform/tickets.ts`): `base64url(JSON).base64url(HMAC-SHA256)`
com conta, nome, visual, grupo (equipe), servidor de destino e validade
(3 h). O `GameHost` (opção `auth`) recusa `Hello` sem bilhete válido para ele
e tira nome, visual e equipe do bilhete — o cliente não escolhe nada disso. O
servidor de jogo não consulta a plataforma: servidores em outras máquinas só
precisam do mesmo segredo (`PLATFORM_SECRET`).

**Resultados** (`GameHost.onResult`): no embarque do dirigível o servidor
registra as pessoas na disputa; a cada equipe eliminada (`teamOut`) e na
vitória, fecha o resultado de quem era dela — colocação, eliminações, dano,
baús, peças, materiais coletados e tempo vivo. Quem sai no meio conta como
eliminado (`Cause.Quit`, solta o que carregava). A plataforma grava **uma
vez por partida e conta** (chave primária), calcula XP (`matchXp`),
habilidade (Elo por colocação contra a média do lobby, só em públicas) e o
avanço dos desafios do dia, e empurra `reward`, `me` e `challenges`.

**Progressão** (`shared/progression.ts`, igual no cliente e no servidor):
níveis até 100 (300 XP no 1º, +150 por nível, teto 2.500); XP por presença,
minutos vivo, eliminações, dano, colocação e vitória; 3 desafios por dia
(sorteados pela data, iguais para todos); 8 visuais liberados por nível e 8
títulos por nível ou vitórias — a plataforma recusa o que está bloqueado.

**Banco** (`platform/store.ts`, `node:sqlite` embutido no Node 22, modo WAL):
`users`, `stats`, `sessions`, `friends`, `friend_requests`, `matches`,
`match_players`, `challenges`, `audit`, `meta` (versão do esquema). Toda
escrita composta é uma transação. Trocar por PostgreSQL é reimplementar esta
classe (a única porta de acesso).

**Segurança**:

- mensagens validadas campo a campo, até 4 KB, tipo desconhecido recusado;
- limites: 20 mensagens/s por conexão (a conexão é encerrada e registrada),
  10 entradas por minuto por IP, convites/pedidos/salas por conta,
  20 conexões novas por IP em rajada (2/s) e 16 simultâneas;
- WebSocket com `ping` a cada 30 s (conexões mortas são derrubadas);
- o servidor de jogo só aceita bilhete assinado para ele, uma conexão por
  conta, e mantém as validações das fases anteriores (comandos, ritmo,
  cadência, construção);
- resultados só vêm do servidor de jogo e contam uma vez;
- **auditoria** (`audit`): contas criadas, entradas e saídas, amizades,
  grupos, filas, partidas formadas, resultados, salas e abusos (com IP).

**Escala (próximos passos)**: o desenho já separa plataforma e servidores de
jogo pelo bilhete; falta o registro de nós remotos com batimentos (Fase 8,
junto do container), PostgreSQL + Redis se a plataforma tiver mais de um
processo, e WebTransport (datagramas) com WebSocket como alternativa — o
protocolo binário já é independente do transporte.

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
- Construções entram no `CollisionWorld` (adicionar/remover em O(1) pela grade
  espacial), com o mesmo código no cliente e no servidor; adereços quebrados
  saem dele da mesma forma.

## 7. Estrutura de pastas

```
game/
├── index.html                 entrada do cliente
├── package.json               scripts (dev, build, build:all, server, host, platform, online, game-node, desktop, test…)
├── Dockerfile                 imagem única dos servidores (plataforma, nó, dedicado)
├── docker-compose.yml         plataforma + 2 nós; deploy/ (TLS com Caddy, .env de exemplo)
├── CHANGELOG.md               histórico de versões
├── scripts/                   build-server.ts (pacotes .mjs), load-test.ts, bench-net.ts, export-assets.ts
├── desktop/                   aplicativo Electron: src/main.ts, src/preload.ts, assets/, tests/smoke.mjs
├── vite.config.ts             build do cliente (e proxy /ws para o servidor em dev)
├── playwright.config.ts       testes de navegador
├── docs/                      ARQUITETURA.md (este), ROADMAP.md, INSTALACAO.md, OPERACAO.md, GUIA-DO-JOGADOR.md
├── src/
│   ├── shared/                código comum cliente/servidor
│   │   ├── config/            game.ts (identidade), movement.ts, items.ts (catálogo), building.ts
│   │   ├── math/              scalar, rng, noise
│   │   ├── world/             heightfield, obb, spatial-grid, collision-world
│   │   ├── movement/          character.ts (controlador)
│   │   ├── player/            player.ts (estado + stepPlayer), inventory.ts, interact.ts
│   │   ├── combat/            aim.ts, hitboxes.ts, projectile.ts
│   │   ├── building/          grid.ts (peças, alvo), buildings.ts (BuildingWorld: apoio, desabamento)
│   │   ├── match/             zone.ts (modos, fases, zona, rota do dirigível)
│   │   ├── maps/              types, builder, structures, ember-island, proving-grounds, index
│   │   ├── net/               binary, protocol (snapshots em delta)
│   │   ├── platform/          messages.ts (mensagens da plataforma online)
│   │   └── progression.ts     níveis, XP, habilidade, visuais, títulos, desafios
│   ├── platform/              store (SQLite), service, matchmaker, pool (local + nós), game-spec, tickets, rate-limit,
│   │                          node-protocol, node-agent + node-main (nó remoto), metrics, server, main (CLI)
│   ├── desktop/               site.ts: site local e descoberta do aplicativo (sem Electron, testável)
│   ├── server/
│   │   ├── core/              simulation.ts, game-host.ts, battle-royale.ts, loot.ts (sem dependências de ambiente)
│   │   │   └── bots/          nav-grid.ts (grade + A*), bot.ts (cérebro), bot-manager.ts, profiles.ts
│   │   └── node/              server.ts (HTTP + WebSocket), discovery.ts (UDP), paths.ts (raiz do jogo), main.ts (CLI)
│   └── client/
│       ├── app.ts, main.ts    casca e estados
│       ├── game/              match.ts (laço da partida), world-items.ts, effects.ts
│       ├── net/               transport, session, prediction, predicted-buildings, interpolation
│       ├── worker/            servidor local (offline)
│       ├── render/            world-view, sky, terrain-mesh/-material/-textures, grass, post, particles, menu-stage, static-geometry, props, item-models, buildings-view, zone-view, airship-view, materials, textures
│       ├── character/         rig.ts (ossos, malha, clipes), character-assets.ts (GLB), glb-writer.ts, character-model.ts
│       ├── camera/            third-person-camera.ts
│       ├── input/             input.ts
│       ├── audio/             audio.ts
│       ├── ui/                screens, hud, minimap, inventory-screen, icons, dom, styles.css
│       ├── online/            platform-client.ts, online-screens.ts, online.ts (fluxo online)
│       ├── accessibility.ts   daltonismo, teclas, paleta
│       ├── photo.ts           modo foto (?foto=…)
│       ├── benchmark.ts       teste de desempenho (percurso por qualidade); benchmark-score.ts (recomendação)
│       ├── desktop.ts         ponte com o aplicativo (window.ucDesktop)
│       ├── history.ts         histórico local de partidas
│       └── settings.ts
└── tests/
    ├── unit/                  Vitest: colisão, movimento, mapas, combate, construção, servidor, rede, cliente
    └── e2e/                   Playwright: offline, combate, construção e multijogador no navegador
```

## 8. Imagem, animação, som e acessibilidade (Fase 7)

**Pipeline de imagem** (`render/post.ts`, por qualidade):

```
cena (HDR linear, MSAA 4×) → GTAO (só alta) → brilho (bloom, ½ resolução)
  → ACES + sRGB (OutputPass) → gradação, vinheta e correção para daltonismo → tela
```

Na baixa, a cena vai direto à tela. Na tela dividida, cada metade tem o seu
pipeline, desenhado no próprio viewport. O modo foto (`?foto=<mapa>&x=&z=&h=&yaw=&pitch=&q=&chars=&fx=`)
desenha o mapa sem partida e informa chamadas de desenho e triângulos.

**Mundo**:

- relevo: o PBR do three.js com a cor-base trocada por 5 camadas de detalhe
  (pesos por vértice), mistura pela altura do detalhe, rocha triplanar,
  variação ampla e relevo fino pela derivada da altura (com guarda contra
  derivadas degeneradas, que geravam NaN e apagavam a tela pelo bloom);
- grama (`render/grass.ts`): uma chamada de desenho; tufos numa grade que dá
  a volta na câmera em coordenadas do mundo; a GPU lê altura (mesma
  triangulação do relevo), densidade (camada de grama, fora de água e de
  caixas apoiadas no chão) e cor do chão em texturas do mapa; vento por
  rajadas;
- vegetação: copas com normais "esféricas" e cor por altura; vento no
  vértice com fase por árvore; **dois níveis de detalhe** com listas de
  instâncias refeitas quando a câmera anda 6 m — só as de perto projetam
  sombra (antes, todas as árvores da ilha entravam no mapa de sombras);
- água: cor pela profundidade (lida da mesma textura de altura), espuma na
  beira, transparência maior no raso;
- céu: nuvens procedurais com vento.

| Ilha de Brasa, campo aberto | chamadas | triângulos |
| --- | --- | --- |
| baixa | 37 | 0,34 M (antes dos níveis de detalhe: 1,46 M) |
| média | 73 | 0,70 M (antes: 2,72 M) |
| alta (GTAO desenha a cena 2×) | 135 | 2,0 M |

**Personagem** (`character/rig.ts`, `character-assets.ts`, `character-model.ts`):
uma SkinnedMesh por personagem (5 grupos de material, de ~40 malhas antes);
juntas com pesos divididos entre dois ossos. `AnimationMixer` com duas
camadas (cada conjunto de trilhas soma peso 1): pernas/corpo (parado, andar,
correr, disparar, agachado, deslize, no ar, nado, queda livre, planador) e
braços (soltos, balançando, segurando arma, mirando, picareta, golpe; nado,
queda e planador mandam também nos braços). Clipes de passada tocam pela
fase da passada — que anda com a velocidade real —, então a mistura não faz
os pés escorregarem. Por cima: mira (pitch) na coluna, cabeça e braços, e o
quadril virando para o deslocamento. Clipes sem peso ficam desligados; longe
(> 80 m), a animação roda a 1/3 dos quadros. 50 personagens: 0,8 ms de CPU
por quadro. O modelo vem de um GLB (exportador próprio, `glb-writer.ts`;
carregado pelo `GLTFLoader`) — os testes fazem a ida e volta.

**Efeitos** (`render/particles.ts`, `game/effects.ts`): partículas em
quadrados instanciados (uma chamada por pool), simuladas na CPU em arrays
fixos; brilho (aditivo) e fumaça (alfa); explosão em camadas; impacto acha a
superfície pelo raio (normal e material): poeira da cor, faíscas no metal,
marca de tiro (anel de decalques). `game/footsteps.ts` detecta passos (pelo
comprimento da passada), pousos (pela velocidade de queda) e entradas na
água de todos os personagens.

**Som** (`audio/audio.ts`): barramentos de efeitos, ambiente e interface;
compressor no master; reverb por convolução (resposta gerada) com envio que
cresce com a distância e sob teto/entre prédios; passa-baixa pela distância.
Passos por superfície (raio para baixo: construção/estrutura, ou a camada do
relevo). Ambiente em laços (vento por altura e queda livre, ondas perto da
água, pássaros na mata e no campo).

**Acessibilidade** (`accessibility.ts`): correção de cores
(simulação de Machado et al. + "daltonize") como matriz no pós-processamento
e paleta própria de raridades e colegas; indicador visual de sons (o áudio
avisa a posição de tiros, passos, explosões, baús e construções; a HUD
desenha arcos na direção); reduzir movimento; tamanho da interface (CSS
`zoom`); cor e tamanho da mira; teclas por ação, trocadas sem conflito.

## 9. Assets: placeholders organizados e substituíveis


| Asset | Hoje | Ponto de troca |
| --- | --- | --- |
| Texturas de estruturas | geradas em canvas (`render/textures.ts`) | `render/materials.ts` — trocar a fábrica por `TextureLoader` com o arquivo em `public/assets/textures/` |
| Relevo | cor do bioma por vértice + 5 camadas de detalhe geradas (grama, terra, rocha, areia, neve; RGB = cor, A = altura) | `render/terrain-textures.ts › terrainLayers()` — trocar por imagens no mesmo arranjo; pesos em `terrain-mesh.ts` |
| Vegetação, rochas, caixotes | malhas geradas em código, instanciadas, com versão de perto e de longe e vento no vértice | `PART_FACTORIES` em `render/props.ts` (`near`/`far`) — trocar por GLTF |
| Peças de construção | cubo instanciado com painéis gerados em canvas por material (`buildPanelTexture`) | `render/buildings-view.ts` — trocar por modelos GLTF por peça mantendo as caixas de colisão |
| Picareta | modelo procedural (`buildPickaxeModel`) e golpe procedural | `render/item-models.ts` + `character/character-model.ts › swing()` |
| Personagem | **GLB** `public/arte/personagens/personagem.glb` (gerado por `npm run assets` a partir de `character/rig.ts`): 18 ossos, malha com pesos, 5 materiais por nome, 17 clipes | substituir o GLB por um feito por artista com os mesmos nomes de ossos (`BONE_NAMES`), materiais (`MATERIAL_SLOTS`: recebem as cores do visual) e clipes (`CLIP_NAMES`); o jogo confere ao carregar e volta ao gerado se faltar algo |
| Armas, itens e baús | modelos procedurais com cores de raridade | `render/item-models.ts` — trocar por GLTF mantendo a orientação (cano para −Z, empunhadura na origem) |
| Ícones do HUD | silhuetas SVG originais | `ui/icons.ts` |
| Interface | CSS próprio, emblema SVG original | `ui/` |
| Sons | sintetizados por receita (Web Audio), posicionais | `audio/audio.ts` — trocar a receita por um arquivo decodificado com o mesmo nome |

Nada usa nomes, personagens, arte ou sons de outros jogos.

## 10. Tecnologias

| Camada | Tecnologia | Versão |
| --- | --- | --- |
| Linguagem | TypeScript (estrito) | 5.9 |
| Renderização | three.js (WebGL 2, PBR, sombras, ACES) | 0.187 |
| Build do cliente | Vite | 8 |
| Servidor | Node.js + `ws` | 22 / 8 |
| Execução TS no servidor | tsx | 4 |
| Testes | Vitest (unidade/integração), Playwright (navegador) | 5 / 1.63 |
| Persistência | navegador (offline/LAN); `node:sqlite` embutido no Node (plataforma online) | Node 22 |
| Pacotes do servidor | esbuild (um `.mjs` por programa, sem `node_modules`) | 0.28 |
| Aplicativo para computador | Electron + electron-builder (NSIS, zip, AppImage, deb) | 45 / 26 |
| Contêineres | Docker (imagem multiestágio `node:22-bookworm-slim`), Docker Compose, Caddy (TLS) | — / 2.10 |
| Métricas | texto do Prometheus (`/metrics`), sem dependências | — |

## 11. Lançamento: nós remotos, produção e aplicativo (Fase 8)

### Nós de servidor de jogo

```
 plataforma ── /nodes (JSON) ─────────── nó "no-1" (outra máquina)
   GameServerPool                          GameNode
   ├─ local: GameHost (reserva)            ├─ GameHost <id> ◄── jogadores (wss://…/game/<id>)
   └─ nós: RemoteNode {região, capacidade} └─ HTTP: /api/health, /metrics
```

- **Registro**: ao conectar, a plataforma manda um desafio (`nonce`); o nó
  responde `hello` com nome, região, endereço público, capacidade, versões e
  `HMAC(segredo, nonce|nome)`. O segredo é o mesmo dos bilhetes de entrada.
- **Alocação** (`pool.pick`): nós com vaga da região pedida → remotos antes
  do local (reserva) → menor ocupação. A plataforma cria o registro do
  servidor e manda `create {id, spec, meta}`; o `ServerSpec`
  (`platform/game-spec.ts`) é a mesma descrição usada para montar o GameHost
  local, validada campo a campo no nó. Os bilhetes só são entregues depois do
  `created` (salas: a resposta ao pedido espera; partidas públicas: quem
  cancelou nesse meio tempo fica de fora; falha = volta à fila).
- **Situação**: `report` a cada 2 s (pessoas, fase, tick, vivos, contas
  conectadas — base da presença dos amigos), memória e carga da máquina.
- **Resultados**: `result`, `matchEnd` e `finished` vão por uma fila com
  entrega garantida no nó (até 20 mil mensagens) enquanto a plataforma estiver
  fora; a plataforma grava cada resultado uma vez por partida e pessoa.
- **Quedas**: nó desconectado fica 60 s em espera (partidas mantidas); ao
  voltar, o `hello` lista o que ainda roda (spec + meta + situação) e a
  plataforma readota — inclusive depois de reiniciar, com ids que trazem um
  prefixo por processo para não colidir. Sem volta, as partidas dele são
  encerradas. O nó fecha sozinho servidores vazios há 10 min (rede de
  segurança se a plataforma sumir).
- **Desligamento**: `SIGTERM` → `drain` (sem partidas novas) → espera as
  atuais até `DRAIN_TIMEOUT` → `finished` de cada uma → sai.

### Produção

- `scripts/build-server.ts`: esbuild gera `plataforma.mjs`, `no-de-jogo.mjs`
  e `servidor.mjs` (ESM, Node 22, `ws` embutido, `require` real pelo banner
  para os módulos do Node). `server/node/paths.ts` acha a raiz do jogo subindo
  até o `package.json` (ou `UC_ROOT`), igual no código-fonte, no pacote e no
  contêiner.
- `Dockerfile`: estágio de build (`npm ci`, cliente + pacotes) e estágio final
  só com `package.json` e `dist/` (usuário `node`, volume `/app/data`,
  `HEALTHCHECK` em `/api/health` na `PORT`). A CA de redes com proxy entra como
  segredo de build, sem ficar na imagem.
- `docker-compose.yml` + `deploy/docker-compose.tls.yml` (Caddy na frente,
  portas internas fechadas com `!reset`, `TRUST_PROXY=1`, nós em
  `wss://DOMÍNIO/n/<nó>` — o endereço público do nó aceita prefixo de caminho).
- `platform/metrics.ts`: formato de texto do Prometheus, sem dependências.

### Aplicativo para computador

```
 Electron (processo principal, desktop/src/main.ts)
 ├─ site local 127.0.0.1:7349 (src/desktop/site.ts): dist/client + /api/lan + /api/desktop
 │    └─ LanDiscovery só escutando (UDP 7351)
 ├─ utilityProcess: servidor.mjs --lobby (porta 7350, anuncia na rede) ── só ao hospedar
 └─ BrowserWindow (isolada, sandbox) ── preload: window.ucDesktop {host, stopHost, hosting, quit…}
```

- A página é a mesma do navegador; `client/desktop.ts` só acrescenta o que
  existe no aplicativo (hospedar, sair, plataforma padrão). Sem a ponte, tudo
  funciona como antes.
- Segurança: `contextIsolation` e `sandbox`, sem `nodeIntegration`; o processo
  principal só atende pedidos vindos da origem do site local; navegação para
  fora é bloqueada (links abrem no navegador do sistema); permissões só para
  prender o mouse e tela cheia.
- Empacotado, `client/` e `server/` ficam em `resources/` (fora do asar),
  porque o `utilityProcess` executa o `servidor.mjs` como arquivo comum.

### Teste de desempenho

`client/benchmark.ts` cria, para cada qualidade, um renderizador próprio
(antisserrilhamento é atributo do contexto WebGL) e percorre três tomadas
fixas com 10 personagens animados e explosões a cada 2 s, depois de 1,5 s de
aquecimento (compilação dos shaders). Mede o intervalo entre quadros do
`requestAnimationFrame` (limitado pela taxa do monitor), o tempo de CPU de
atualização + envio do quadro e as chamadas/triângulos do renderizador. A
recomendação (`benchmark-score.ts`) é a maior qualidade com média ≥ 50 e 1%
piores ≥ 30 quadros/s; se nem a baixa chega lá, sugere uma escala de
resolução proporcional (custo de preenchimento ∝ escala²). Qualidades mais
pesadas são puladas quando uma mais leve já fica abaixo de 12 quadros/s.

