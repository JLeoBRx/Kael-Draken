# Roteiro de desenvolvimento — Última Chama

Cada fase só começa quando a anterior está **jogável e testada** (testes
automáticos verdes + validação no navegador). Os prazos são estimativas de
esforço para este projeto, conduzido em sessões de trabalho contínuas; cada fase
termina com uma entrega que pode ser jogada.

| Fase | Entrega | Esforço estimado | Situação |
| --- | --- | --- | --- |
| 1 — Fundação | personagem, câmera, movimentação, mapa de testes, servidor autoritativo e rede básica | 1 semana | **concluída** |
| 2 — Gameplay | armas, tiros, vida/escudo, inventário, coleta, baús, mapa principal (1ª versão), HUD completa | 2–3 semanas | próxima |
| 3 — Construção | paredes, rampas, pisos, telhados; pré-visualização, recursos, vida e destruição sincronizadas | 2 semanas | |
| 4 — IA | bots com navegação, loot, combate, fuga, abrigo, construção e zona; níveis de dificuldade; zona segura; partida BR completa offline | 2–3 semanas | |
| 5 — Multijogador local | lobby LAN, equipes, descoberta na rede, reconexão, tela dividida, testes com vários jogadores | 1–2 semanas | |
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

## Fase 2 — Gameplay

Sistemas (todos decididos no servidor; cliente só prevê o próprio movimento e
mostra efeitos):

- **Armas** em dados (`shared/config/weapons.ts`): pistola, rifle de assalto,
  escopeta, submetralhadora, sniper, explosivos — dano, cadência, precisão
  (dispersão por movimento/mira), recuo, munição/pente, recarga, raridade
  (comum → lendária).
- **Tiro com compensação de latência**: o servidor guarda o histórico de
  posições (~1 s) e verifica o acerto no instante que o atirador viu; hitscan
  para a maioria, projétil simulado para explosivos/sniper.
- **Vida (100) e escudo (100)**; itens de cura e escudo com tempo de uso.
- **Inventário** de 5 espaços + munições + materiais; troca de arma; descarte.
- **Coleta** de itens no chão e baús (abrir com tempo); tabelas de loot por raridade.
- **Eliminação, queda e espectador**.
- **Mapa principal v1** (~1,5–2 km): cidade abandonada, floresta, montanhas,
  região industrial, vilarejo, lago, área militar e construções especiais, com
  pontos de interesse e locais de loot.
- HUD: vida, escudo, munição, armas equipadas, recursos, minimapa, tempo,
  jogadores restantes, posição.
- Sons e efeitos básicos de disparo e impacto.

Critérios: testes de balística, dano, inventário e loot no servidor; teste de
navegador com dois jogadores trocando tiros; nenhum valor de dano vindo do cliente.

## Fase 3 — Construção

- Grade de construção (células de 4 m), peças: parede, rampa (45°), piso, telhado.
- Pré-visualização (fantasma) com validação local; confirmação pelo servidor.
- Custo em materiais (madeira, pedra, metal) com vida e tempo de construção por material.
- Coleta de materiais (picareta) em árvores, rochas, carros, estruturas.
- Dano e destruição de peças, incluindo colapso de peças sem apoio.
- Sincronização: criação/destruição como eventos confiáveis + estado no snapshot.

## Fase 4 — Inteligência artificial

- Bots como "clientes" do servidor (mesmos comandos de entrada que um jogador).
- Navegação: grade de navegação gerada do mapa + A*; desvio local; uso de rampas.
- Árvore de comportamento: explorar, saquear, buscar alvo, combater, fugir,
  curar, procurar abrigo, construir defesa, respeitar a zona.
- Dificuldades: tempo de reação, precisão, consciência, agressividade, construção.
- Zona segura dinâmica: fases com espera/encolhimento e dano crescente.
- Partida completa: lobby → ônibus/salto → paraquedas → combate → vencedor.

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
