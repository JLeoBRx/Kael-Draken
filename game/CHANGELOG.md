# Histórico de versões

Formato: o que mudou para quem joga e para quem opera. Datas no fuso de Brasília.

## 1.0.0 — lançamento (2026-11-24)

**Para quem joga**

- **Aplicativo para computador** (Windows e Linux): instalador, versão
  portátil (zip), AppImage e pacote .deb. Funciona offline, na rede local e
  online, como no navegador.
- **Hospedar partida pelo aplicativo**: em *Rede local → Hospedar partida*, o
  aplicativo abre uma sala de espera de verdade neste computador; os outros
  entram pelo aplicativo (a partida aparece sozinha na lista) ou pelo
  navegador no endereço mostrado (`http://IP:7350`). Fecha junto com o
  aplicativo.
- **Teste de desempenho** em *Configurações → Testar este computador*:
  percorre a ilha com cada qualidade (cidade, mata e vista do salto, com
  personagens e explosões), mostra quadros por segundo, 1% piores, tempo de
  CPU, chamadas de desenho e triângulos, e aplica a melhor qualidade fluida
  (ou sugere uma escala de resolução menor).
- Botão **Sair do jogo** no aplicativo; F11 alterna tela cheia.

**Para quem opera**

- **Nós de servidor de jogo** (`npm run game-node` ou a imagem Docker): outras
  máquinas se registram na plataforma provando o segredo (HMAC com desafio,
  o segredo não passa pela rede), recebem partidas, relatam a situação a cada
  2 s e repassam resultados. A plataforma escolhe a máquina pela região e
  pela ocupação; os servidores da própria plataforma viram reserva
  (`--max-servers 0` = só nós).
- **Tolerância a falhas**: nó que cai mantém as partidas e guarda os
  resultados até voltar (a plataforma espera 60 s e o readota); plataforma
  reiniciada readota as partidas que os nós ainda rodam; nó em desligamento
  (`SIGTERM`) não recebe partidas novas e espera as atuais terminarem.
- **Pacotes de produção** (`npm run build:server`): `dist/server/*.mjs`, um
  arquivo por programa, rodando com `node` puro (sem `node_modules`).
- **Imagem Docker** única (plataforma, nó e servidor dedicado, 333 MB, sem
  `node_modules`) e **docker compose** com plataforma + 2 nós, mais a
  sobreposição com **Caddy** (HTTPS/WSS automático, um domínio para tudo).
- `/api/health` (para orquestradores) e `/metrics` (Prometheus, com token
  opcional) na plataforma, nos nós e no servidor dedicado.
- O teste de carga aceita uma plataforma já rodando (`--url`) e mostra o
  tick por nó.
- Versão da plataforma 2 (os bilhetes podem apontar para outra máquina):
  clientes antigos recebem "recarregue a página".

## 0.7.0 — polimento

Pós-processamento (brilho, gradação de cor, oclusão ambiente), nuvens, relevo
com camadas de detalhe, grama 3D, árvores com vento e níveis de detalhe, água
pela profundidade; personagem com esqueleto e 17 clipes de animação em GLB;
partículas, explosões, marcas de tiro; som com passos por superfície,
ambiente, reverb e distância; vitrine 3D no menu, armário de visuais;
acessibilidade (daltonismo, indicador visual de sons, tamanho da interface,
mira, reduzir movimento), teclas configuráveis e escala da resolução.

## 0.6.0 — online

Plataforma online com entrada só pelo nome, amigos com presença, grupos,
matchmaking por região e habilidade (completando com bots), salas privadas
com código, servidores de jogo sob demanda com bilhetes assinados, XP, níveis,
estatísticas, histórico, classificação, desafios do dia e visuais/títulos por
nível (SQLite). Snapshots em delta e gerência de interesse (~10× menos banda);
teste de carga com 100 pessoas.

## 0.5.0 — multijogador local

Sala de espera na rede local, descoberta automática (UDP), duplas, trios e
esquadrões com fogo amigo opcional, reconexão ao mesmo personagem, tela
dividida para 2 jogadores.

## 0.4.0 — battle royale jogável

Aquecimento, dirigível, queda livre e planador, zona em 7 etapas, vencedor,
tela de resultado e histórico; bots em três dificuldades (navegação, saque,
combate, cura, construção, fuga da zona).

## 0.3.0 — construção

Parede, piso, rampa e telhado numa grade de 4 m em madeira, pedra e metal;
apoio e desabamento; picareta e coleta de materiais; construção prevista no
cliente e confirmada pelo servidor.

## 0.2.0 — combate

Seis armas com raridades, munição, explosivos, cura e escudo, inventário,
loot e baús, acertos com compensação de latência no servidor, mapa principal
Ilha de Brasa e Campo de Provas.

## 0.1.0 — fundação

Simulação determinística compartilhada, movimentação em terceira pessoa com
predição no cliente, servidor autoritativo em WebSocket, mapa de testes.
