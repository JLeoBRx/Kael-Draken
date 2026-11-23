# Roteiro de desenvolvimento — Última Chama

Cada fase só começa quando a anterior está **jogável e testada** (testes
automáticos verdes + validação no navegador). Os prazos são estimativas de
esforço para este projeto, conduzido em sessões de trabalho contínuas; cada fase
termina com uma entrega que pode ser jogada.

| Fase | Entrega | Esforço estimado | Situação |
| --- | --- | --- | --- |
| 1 — Fundação | personagem, câmera, movimentação, mapa de testes, servidor autoritativo e rede básica | 1 semana | **concluída** |
| 2 — Gameplay | armas, tiros, vida/escudo, inventário, coleta, baús, mapa principal (1ª versão), HUD completa | 2–3 semanas | **concluída** |
| 3 — Construção | paredes, rampas, pisos, telhados; pré-visualização, recursos, vida e destruição sincronizadas | 2 semanas | **concluída** |
| 4 — IA | bots com navegação, loot, combate, fuga, abrigo, construção e zona; níveis de dificuldade; zona segura; partida BR completa offline | 2–3 semanas | **concluída** |
| 5 — Multijogador local | lobby LAN, equipes, descoberta na rede, reconexão, tela dividida, testes com vários jogadores | 1–2 semanas | próxima |
| 6 — Online | plataforma (contas, amigos, convites, grupos, matchmaking, salas públicas/privadas, código de convite), alocação de servidores, segurança, gerência de interesse e compressão | 3–4 semanas | |
| 7 — Polimento | arte final (GLTF, animações esqueléticas), sons, efeitos, pós-processamento, otimização, acessibilidade, correção de bugs | 3 semanas | |
| 8 — Lançamento | app desktop (Electron/Tauri), instaladores, servidor em container, documentação de operação, testes de carga e finais | 1–2 semanas | |

**Marcos jogáveis**

- **M1 (fim da Fase 2)** — tiroteio funcional no mapa principal, offline e em rede.
- **M2 (fim da Fase 4)** — *primeira versão jogável de battle royale*: partida
  completa contra bots, com zona, loot, construção e vencedor.
- **M3 (fim da Fase 5)** — a mesma partida com amigos na LAN.
- **M4 (fim da Fase 6)** — partidas online entre redes diferentes, com matchmaking.
- **M5 (fim da Fase 8)** — versão de lançamento.

---

## Fase 1 — Fundação ✅

Entregue:

- Projeto TypeScript com cliente (Vite + three.js), servidor (Node + WebSocket) e
  código de simulação compartilhado.
- Controlador de personagem determinístico: andar, correr, sprint, caminhar
  devagar, pular (com "coyote time" e buffer), agachar, deslizar (com impulso,
  ganho em descidas e pulo de deslize), mirar, nadar, subir degraus e rampas,
  colar no chão.
- Colisão própria: relevo + caixas orientadas, sem atravessar paredes finas.
- Câmera em terceira pessoa sobre o ombro, com colisão, mira, FOV dinâmico.
- Personagem procedural com 8 visuais e animação procedural.
- Mapa de testes "Campo de Provas" (ilha 512 m: pátio de treino medido, vila,
  bosque, lagoa com píer, serra).
- Servidor autoritativo com predição + reconciliação no cliente, interpolação
  de remotos, proteção contra speed hack, limites de mensagens e validações.
- Modo offline (servidor no Web Worker), servidor dedicado/LAN (`npm run host`).
- Interface: menu, entrar em servidor, carregamento, "clique para jogar",
  pausa, configurações (salvas), controles, HUD (mira, bússola, região,
  postura, conexão, ajuda, painel técnico F3).
- Testes: 58 unitários/integração + 3 de navegador (offline e 2 jogadores reais).

## Fase 2 — Gameplay ✅

Entregue (tudo decidido no servidor; o cliente prevê o próprio movimento, a
arma e os consumíveis e mostra efeitos):

- **Catálogo de itens** em dados (`shared/config/items.ts`): 6 armas
  (pistola, submetralhadora, fuzil, escopeta, sniper, lança-foguetes) com dano,
  cadência, precisão (dispersão por postura/movimento/"bloom"), coice, pente,
  recarga, alcance, queda de dano e 5 raridades; granada; 4 itens de cura e
  escudo; 5 tipos de munição; madeira, pedra e metal.
- **Tiro com compensação de latência** (até 1 s), mira pelo ombro, dispersão
  determinística (o traçado previsto é o validado), obstrução entre arma e
  alvo, cabeça × corpo, escopeta com 9 bagos.
- **Explosivos simulados**: foguete (impacto) e granada (quica, pavio), dano em
  área com linha de visão.
- **Vida (100) e escudo (100)**, dano de queda, curas com tempo de uso e limites.
- **Inventário** de 5 espaços, empilhamento, troca quando cheio, soltar e
  reorganizar (tela Tab), munição por tipo e materiais.
- **Loot**: tabelas por raridade e nível; pontos no chão, baús, arsenal com
  reposição no campo de treino; o corpo eliminado solta tudo.
- **Eliminação**, feed, tela de eliminado, espectador do autor e renascimento
  (modo treino — a partida sem renascimento já existe nas regras do servidor).
- **Mapa principal Ilha de Brasa** (1,6 km): Cidade Esquecida (prédios de até
  7 andares com escada e telhado acessíveis, ruínas, carros), Mata Fechada,
  Picos Gélidos com a Torre do Vigia, Distrito Fabril (galpões, silos,
  contêineres), Vila Serena, Lago Azul (píer e ilhota), Base Sentinela (muralha,
  hangar, alojamentos, bunkers, torres de vigia), Farol do Fim e Solar dos Ventos.
- **Campo de Provas** ampliado: arsenal e estande de tiro com bonecos.
- **HUD completo**: vida, escudo, munição, armas equipadas, recursos,
  minimapa, tempo, jogadores vivos, eliminações, posição na grade, mira
  dinâmica, marcador de acerto, números de dano, indicador de direção do dano,
  luneta, feed e avisos; mapa completo (M) e seleção de mapa.
- **Áudio** sintetizado e posicional; efeitos de traçante, clarão, impacto,
  explosão.
- Testes: 91 unitários/integração + 5 de navegador (incluindo combate real
  entre dois navegadores no servidor dedicado).

Decisão de projeto: a sniper é *hitscan* com compensação de latência (como as
demais armas de bala); só explosivos são projéteis simulados. Projéteis com
compensação exigem retroceder o mundo a cada tick de voo, com ganho pequeno
para o jogador — pode ser revisto no polimento.

## Fase 3 — Construção ✅

Entregue:

- Grade de construção alinhada ao mundo (células de 4 m, níveis de 4 m) e
  quatro peças: parede, piso, rampa de 45° (4 direções) e telhado de duas
  águas — cada uma feita das mesmas caixas orientadas na colisão e no desenho.
- Modo construção: Q parede · Z piso · V rampa · T telhado (a mesma tecla sai),
  R gira, G ou botão direito troca o material, roda troca a peça; no controle,
  direcional (cima = peça, esquerda = girar, direita = material).
- Fantasma azul/vermelho com o mesmo cálculo de alvo do servidor e o motivo de
  bloqueio no HUD ("Ocupado", "Sem apoio", "Falta madeira"…).
- Construção prevista no cliente (sobe na rampa sem esperar a rede) e
  confirmada/recusada pelo servidor; corrida de rampas sem correções com 100 ms
  de latência.
- Materiais com custo, vida e tempo de construção (madeira 150/3 s, pedra
  300/6 s, metal 450/9 s); a peça cresce de 10% até a vida máxima.
- Integridade estrutural: só se constrói apoiado; ao quebrar uma peça, o que
  ficou sem ligação com o chão desaba junto.
- Dano em peças por balas, picareta (50) e explosões (×3), com destruição
  sincronizada, poeira/lascas e sons.
- Picareta sempre na tecla 1: golpe com animação, 20 de dano em jogadores e
  coleta de madeira, pedra e metal em árvores, rochas, caixotes, carros,
  contêineres e estruturas (árvores, rochas e caixotes quebram).
- HUD: picareta na barra, barra de construção (peça, material, custo, motivo
  de bloqueio), materiais em destaque, vida da construção sob a mira, números
  de coleta ("+8 Madeira").
- Pátio do Campo de Provas alinhado à grade (superfície a 8 m) e mesas de
  materiais no arsenal.
- Testes: geometria, alvo, apoio e desabamento, corrida de rampas; servidor
  (construção autoritativa, custo e intervalo, bloqueio de tiros, quebra,
  desabamento, explosões, picareta, coleta, sincronização); predição em rede;
  navegador (construir, subir, derrubar e coletar offline; peça vista e
  derrubada entre dois navegadores no servidor dedicado).

Decisões de projeto:

- **Eventos confiáveis, não snapshot.** Peças mudam pouco e precisam chegar
  todas: vão como eventos ordenados (com idade e dano para quem entra depois),
  e o snapshot continua pequeno.
- **Grade absoluta.** Como em outros jogos do gênero, a grade não acompanha o
  relevo: em encostas as peças podem ficar parcialmente enterradas. O nível
  escolhido é o do corpo do jogador, não o da altura absoluta do olhar.
- Editar peças (abrir janelas/portas) fica para depois da Fase 4, se os testes
  de jogo pedirem.

## Fase 4 — Inteligência artificial ✅ (M2: primeira versão jogável de battle royale)

Entregue:

- **Partida completa**: aquecimento → dirigível (salto quando quiser) → queda
  livre com mergulho → planador automático → pouso → zona em 7 etapas →
  vencedor. Eliminados recebem a colocação e assistem os outros (clique troca
  quem assistir).
- **Zona segura** ("nuvem de cinzas"): círculos aninhados com centro em terra,
  espera e fechamento, dano crescente direto na vida; parede animada no mundo,
  contorno no minimapa e no mapa, próxima zona tracejada, aviso e tela
  arroxeada fora dela.
- **Bots** no servidor, pelos mesmos comandos dos jogadores: grade de
  navegação com portas + A*, percepção com campo e linha de visão, saque
  (itens, baús, munição, cura, materiais), combate com reação e erro de mira,
  escolha de arma por distância, deslocamento lateral, pulos, paredes de
  construção, cura, fuga, coleta com a picareta, zona e salto do dirigível
  rumo a pontos de loot. Três dificuldades.
- **Offline configurável**: modo (battle royale ou treino), 0–99 bots,
  dificuldade, zona normal ou rápida, mapa.
- **Servidor dedicado/LAN**: `--mode`, `--bots`, `--bot-difficulty`,
  `--warmup`, `--zone-speed`; recomeça sozinho e os clientes reconectam.
- **Telas**: resultado de vitória/derrota (colocação, eliminações, dano,
  tempo), "Jogar de novo", histórico local de partidas com totais.
- **Desempenho**: 40 bots custam 0,2–0,4 ms por tick no mapa principal.
- **Testes**: queda livre e planador, zona, fases, colocação, vencedor,
  servidor em modo BR com espectador e reinício, partida inteira só de bots
  (24 bots, com vencedor e maioria das eliminações em combate), e no navegador:
  salto/planador/pouso offline e uma partida até o fim no servidor dedicado com
  resultado, histórico e reconexão.

Decisões de projeto:

- **Bots no servidor, não no cliente**: valem para offline, LAN e online sem
  código extra, e não podem trapacear além do que o servidor já permite (a
  percepção é limitada por distância, campo e linha de visão).
- **Grade 2D no térreo**: os bots não sobem escadas de prédios (andares de
  cima ficam para jogadores); construções e adereços quebrados são tratados
  pelo próprio bot (desvia, pula, quebra).
- **Zona começa a contar no fim do dirigível** e o último círculo fecha por
  completo: a partida sempre termina.

## Fase 5 — Multijogador local

- Lobby LAN com lista de jogadores, prontos, configuração de partida (mapa,
  bots, dificuldade, número de jogadores, equipes).
- Descoberta na rede (anúncio UDP pelo host; lista no app desktop).
- Equipes (solo/dupla/trio/esquadrão), fogo amigo configurável.
- Reconexão ao mesmo personagem.
- Tela dividida para 2 jogadores com controles.

## Fase 6 — Online

- Plataforma: contas e autenticação, amigos, convites, grupos, códigos de
  sala, partidas públicas e privadas, matchmaking por região/habilidade.
- Alocação de servidores de jogo em containers; tickets assinados; resultados
  reportados pelo servidor de jogo.
- Persistência (PostgreSQL): perfis, XP, níveis, estatísticas, desafios,
  cosméticos desbloqueados, histórico de partidas.
- Rede: gerência de interesse, compressão delta, taxa adaptativa,
  WebTransport, testes de carga com 100 clientes simulados.
- Segurança: limites por IP, verificação de integridade de comandos, detecção
  estatística de mira automática, registro de auditoria.

## Fase 7 — Polimento

- Personagens e armas em GLTF com animações esqueléticas e mistura de animações.
- Texturas finais, splatmap do relevo, vegetação com vento, LOD e instâncias por bloco.
- Pós-processamento (SSAO, bloom, correção de cor), partículas, explosões.
- Áudio espacial: ambiente, passos por superfície, armas, interface.
- Telas: seleção de personagem/visual, histórico de partidas, vitória e derrota.
- Otimização (meta: 60 FPS em GPU integrada na qualidade média) e acessibilidade.

## Fase 8 — Lançamento

- Aplicativo desktop com servidor embutido (LAN sem terminal) e instalador.
- Imagem Docker do servidor de jogo e da plataforma; guia de operação.
- Testes finais, testes de carga, documentação de instalação e de jogo.
