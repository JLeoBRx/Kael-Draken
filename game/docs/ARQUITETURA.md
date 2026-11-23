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

### Snapshot (servidor → cliente)

`tick` · `ackSeq` (último comando aplicado) · `queued` (fila no servidor) ·
vivos · eliminações do destinatário · fase da partida e o tick em que ela
muda (contagens do HUD) · estado COMPLETO do próprio jogador
(movimento, vida, escudo, inventário, munições, materiais e temporizadores da
arma — para reconciliação exata) · lista de entidades (28 bytes cada: id,
posição, yaw, pitch, flags, velocidade, arma na mão e raridade).

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

Limitação conhecida: o coice da câmera é aplicado no cliente (como na maioria
dos jogos de tiro); detecção estatística de mira automática entra na Fase 6.
O resultado da partida seguirá a mesma regra na Fase 4.

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
| Bots | sim (0–99, três dificuldades) | sim (`--bots` ou na sala de espera) | sim (preencher partidas) |
| Equipes | sim (solo a esquadrão; tela dividida na mesma equipe) | sim (sala de espera) | sim |
| Persistência | navegador (Fase 8: arquivo local no app desktop) | idem, no host | banco de dados |

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
tela "Entrar em servidor" mostra. O app desktop (Fase 8) poderá ouvir direto.

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
- Construções entram no `CollisionWorld` (adicionar/remover em O(1) pela grade
  espacial), com o mesmo código no cliente e no servidor; adereços quebrados
  saem dele da mesma forma.

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
│   │   ├── config/            game.ts (identidade), movement.ts, items.ts (catálogo), building.ts
│   │   ├── math/              scalar, rng, noise
│   │   ├── world/             heightfield, obb, spatial-grid, collision-world
│   │   ├── movement/          character.ts (controlador)
│   │   ├── player/            player.ts (estado + stepPlayer), inventory.ts, interact.ts
│   │   ├── combat/            aim.ts, hitboxes.ts, projectile.ts
│   │   ├── building/          grid.ts (peças, alvo), buildings.ts (BuildingWorld: apoio, desabamento)
│   │   ├── match/             zone.ts (modos, fases, zona, rota do dirigível)
│   │   ├── maps/              types, builder, structures, ember-island, proving-grounds, index
│   │   └── net/               binary, protocol
│   ├── server/
│   │   ├── core/              simulation.ts, game-host.ts, battle-royale.ts, loot.ts (sem dependências de ambiente)
│   │   │   └── bots/          nav-grid.ts (grade + A*), bot.ts (cérebro), bot-manager.ts, profiles.ts
│   │   └── node/              server.ts (HTTP + WebSocket), discovery.ts (UDP), main.ts (CLI)
│   └── client/
│       ├── app.ts, main.ts    casca e estados
│       ├── game/              match.ts (laço da partida), world-items.ts, effects.ts
│       ├── net/               transport, session, prediction, predicted-buildings, interpolation
│       ├── worker/            servidor local (offline)
│       ├── render/            world-view, sky, terrain-mesh, static-geometry, props, item-models, buildings-view, zone-view, airship-view, materials, textures
│       ├── character/         character-model.ts
│       ├── camera/            third-person-camera.ts
│       ├── input/             input.ts
│       ├── audio/             audio.ts
│       ├── ui/                screens, hud, minimap, inventory-screen, icons, dom, styles.css
│       ├── history.ts         histórico local de partidas
│       └── settings.ts
└── tests/
    ├── unit/                  Vitest: colisão, movimento, mapas, combate, construção, servidor, rede, cliente
    └── e2e/                   Playwright: offline, combate, construção e multijogador no navegador
```

## 8. Assets: placeholders organizados e substituíveis

| Asset | Hoje | Ponto de troca |
| --- | --- | --- |
| Texturas de estruturas | geradas em canvas (`render/textures.ts`) | `render/materials.ts` — trocar a fábrica por `TextureLoader` com o arquivo em `public/assets/textures/` |
| Relevo | cores por altura/inclinação + textura de detalhe | `render/terrain-mesh.ts` + material do relevo (splatmap na Fase 7) |
| Vegetação, rochas, caixotes | malhas low-poly geradas em código, instanciadas | `PART_FACTORIES` em `render/props.ts` — trocar por GLTF |
| Peças de construção | cubo instanciado com painéis gerados em canvas por material (`buildPanelTexture`) | `render/buildings-view.ts` — trocar por modelos GLTF por peça mantendo as caixas de colisão |
| Picareta | modelo procedural (`buildPickaxeModel`) e golpe procedural | `render/item-models.ts` + `character/character-model.ts › swing()` |
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
