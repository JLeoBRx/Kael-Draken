# Kael Draken — O Arquivo da Chama Antiga

Enciclopédia, atlas interativo e arquivo de desenvolvimento do universo literário
**Kael Draken — O Sussurro da Chama Antiga**, com painel editorial próprio.

O site público reúne: Atlas dos Seis Reinos (mapa 2D que vira maquete 3D),
reinos, Biblioteca de Personagens, Mitologia, Cronologia, Sistema da Ressonância,
Cidades e Locais, Manuscritos, Mistérios, a página do Livro I e o diário de
Novidades. O painel em `/admin` permite criar, revisar, pré-visualizar, publicar e
arquivar todo esse conteúdo.

> **Estado do projeto:** o código roda localmente e está versionado neste
> repositório. **O site ainda não foi publicado** em nenhum endereço público —
> veja [Publicação](#publicação).

---

## Sumário

- [Tecnologias](#tecnologias)
- [Executar localmente](#executar-localmente)
- [Painel administrativo](#painel-administrativo)
- [Modelo editorial: canon, spoilers e notas privadas](#modelo-editorial-canon-spoilers-e-notas-privadas)
- [Atlas interativo 2D → 3D](#atlas-interativo-2d--3d)
- [Imagens do Atlas](#imagens-do-atlas)
- [Capa oficial do Livro I](#capa-oficial-do-livro-i)
- [Pergaminho de anúncio](#pergaminho-de-anúncio)
- [Ilustrações dos capítulos](#ilustrações-dos-capítulos)
- [Versão em HTML](#versão-em-html)
- [Testes](#testes)
- [Publicação](#publicação)
- [Estrutura do projeto](#estrutura-do-projeto)
- [O que ainda é provisório](#o-que-ainda-é-provisório)

---

## Tecnologias

| Camada | Escolha |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Turbopack) |
| Interface | React 19, TypeScript estrito, CSS próprio com tokens (sem framework de UI) |
| Banco | SQLite via libSQL + Drizzle ORM (migrações versionadas em `drizzle/`); opcionalmente Turso |
| Conteúdo | Markdown (marked) com extensões para spoilers, notas privadas e links internos |
| 3D | three.js carregado sob demanda, só quando o leitor pede o modo 3D |
| Autenticação | senha com hash scrypt + sessão assinada (HMAC-SHA256) em cookie `httpOnly` |
| Testes | Vitest (unidade), Playwright + axe-core (ponta a ponta, acessibilidade, WebGL) |
| Artes | scripts procedurais em Python (numpy + Pillow) e Chromium para os brasões |

Requisitos: **Node.js 22.12 ou superior** e npm. Python 3 só é necessário para
regenerar as artes.

## Executar localmente

```bash
npm install
cp .env.example .env.local
```

Preencha o `.env.local`:

1. `ADMIN_USERNAME` — o usuário do painel.
2. `ADMIN_PASSWORD_HASH` — gere com `npm run admin:hash` (pede a senha, mínimo de
   12 caracteres, e imprime a linha pronta). **A senha em texto nunca vai para
   arquivo algum.**
3. `SESSION_SECRET` — 32+ caracteres aleatórios:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

Depois:

```bash
npm run dev          # http://localhost:3000
```

Ao iniciar, o servidor aplica as migrações e, se o banco estiver vazio, carrega o
conteúdo inicial (reinos, personagens, mitologia, cronologia, manuscritos…). Para
fazer isso manualmente: `npm run db:setup`. Para desligar o automático:
`AUTO_MIGRATE=false`.

O banco local fica em `data/kael-draken.db` e as imagens enviadas pelo painel em
`data/uploads/` — ambos fora do Git.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm run start` | build e servidor de produção |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript |
| `npm test` | testes de unidade |
| `npm run test:e2e` | testes de ponta a ponta (rode `npm run build` antes) |
| `npm run db:migrate` / `db:seed` / `db:setup` | migrações e conteúdo inicial |
| `npm run db:generate` | gera nova migração após alterar `src/lib/db/schema.ts` |
| `npm run admin:hash` | gera o hash da senha do painel |
| `npm run art` | regenera todas as artes procedurais |

## Painel administrativo

Acesse `/admin` e entre com o usuário e a senha configurados. Sem as variáveis de
ambiente, o painel fica bloqueado e explica o que falta — não existe senha padrão.

- **Coleções:** reinos, cidades e locais, personagens, eras, acontecimentos,
  verbetes (mitologia, Ressonância, sobre), mistérios, manuscritos, mapas, livros,
  capítulos e publicações do diário.
- **Fluxo:** *Salvar* (rascunho), *Salvar e publicar*, *Retirar do site*,
  *Arquivar* e *Excluir* (com confirmação). Rascunhos e arquivados nunca aparecem
  no site público, na busca ou no sitemap.
- **Pré-visualizar no site:** abre a página real em modo de pré-visualização
  (rascunhos, notas privadas e todos os spoilers visíveis, com faixa de aviso).
- **Relações:** personagens ligados a reinos, locais, acontecimentos e manuscritos;
  relações entre personagens (família, aliança, rivalidade…); marcadores de mapa
  posicionados com um clique sobre a imagem.
- **Mídia:** envio de imagens (JPG, PNG, WebP, AVIF, GIF; limite em
  `MAX_UPLOAD_MB`), texto alternativo, legenda, créditos e galeria por item.
- **Categorias e tags:** vocabulários editáveis (tipos de local, de documento,
  de acontecimento, papéis de personagem, tags…).
- **Configurações:** textos institucionais, capa oficial e aviso do Livro I.

Segurança: credenciais só por variáveis de ambiente; cookie `httpOnly`,
`SameSite=Lax`, `Secure` em produção com HTTPS, validade de 12 horas; limite de tentativas
de login; verificação de sessão em cada página e em cada ação do servidor; páginas
do painel com `noindex`.

## Modelo editorial: canon, spoilers e notas privadas

**Estado de canon** (exibido como selo em cada página):

| Valor interno | Selo público | Significado |
| --- | --- | --- |
| `canonico` | Estabelecido | fato aprovado da obra |
| `provisorio` | Proposta | ideia de desenvolvimento ainda não aprovada |
| `em_desenvolvimento` | Em aberto | questão deliberadamente sem resposta |
| `desconhecido` | Desconhecido no mundo | os próprios personagens não sabem |
| `arquivado` | Arquivado | ideia descartada, mantida para registro |

**Níveis de spoiler:** 0 — sem spoilers; 1 — revelações iniciais; 2 — revelações
avançadas. O leitor escolhe o nível no seletor do cabeçalho (padrão: sem spoilers).
O filtro é feito **no servidor**: o que está acima do nível escolhido não é enviado
ao navegador.

Sintaxe nos campos de texto (Markdown):

```markdown
Texto visível para todos.

:::spoiler 1
Só aparece para quem escolheu "revelações iniciais" ou mais.
:::

%% Nota privada: nunca é publicada. %%

Veja [[personagens/kael-draken|Kael]] e [[reinos/safra]].
```

- Itens inteiros também têm nível de spoiler: abaixo do nível, o item some das
  listas e da busca e, se aberto pelo endereço, mostra só um aviso para ajustar o
  nível — sem o conteúdo.
- O campo **Anotações privadas** de cada item nunca chega ao site público.
- Links `[[tipo/slug]]` para itens inexistentes, não publicados ou acima do nível
  viram texto simples — não revelam que algo existe.
- **Capítulos** nascem como rascunho e só aparecem depois de publicados
  manualmente.

Revelações que a obra ainda guarda (a identidade de Kael, os detalhes da
destruição de Safra, a natureza do Caos, o que é Skrugheim) não estão afirmadas em
nenhuma página: aparecem como mistérios em aberto ou atrás de spoilers.

## Atlas interativo 2D → 3D

Página: `/atlas`.

1. **2D (padrão):** a carta ilustrada do manuscrito, com as seis regiões clicáveis
   traçadas sobre as fronteiras desenhadas, e
   alternância entre a **versão original** (seis reinos) e a **versão conhecida**
   (Safra apagada, cinco reinos). A seleção abre um painel com o resumo do reino
   e o link para a página completa; o estado fica na URL (`?regiao=&versao=`).
2. **Explorar em 3D:** o three.js é baixado só agora. O relevo é construído a
   partir de `public/images/atlas/relevo-mundo.png` (altura em 16 bits) com o
   próprio mapa como textura; a câmera desce da vista superior — que coincide com
   o 2D — enquanto o relevo se ergue.
3. **No 3D:** arrastar gira, roda do mouse ou pinça aproxima, botão direito ou
   dois dedos deslocam; botões de aproximar, afastar, girar, inclinar e
   reposicionar; setas, `+`, `-` e `0` no teclado. Clicar numa região ou num
   rótulo seleciona e centraliza a câmera nela.
4. **Voltar ao 2D:** a câmera retorna à vista superior, o relevo baixa, o WebGL é
   liberado (geometrias, texturas e contexto) e a região selecionada continua
   selecionada.

Adaptações: sem WebGL o botão 3D não aparece e o mapa 2D segue completo; com
*movimento reduzido* as transições são cortes curtos; aparelhos modestos ou
celulares usam menos resolução de textura, sem antialiasing e com densidade de
pixels limitada; perda de contexto WebGL volta ao 2D com aviso.

**Carta e regiões:** `npm run art:mapas` (`scripts/art/manuscript_map.py`) parte
de `scripts/art/fontes/mapa-manuscrito-cor.webp` e gera a carta original, a versão
conhecida (Safra em branco, como no encarte da própria carta), a máscara de terra,
o relevo 3D e `src/data/atlas/world.json`. As fronteiras clicáveis, os pontos dos
rótulos e as zonas montanhosas ficam no topo do script, em pixels da carta: para
uma carta nova, troque o arquivo da fonte, ajuste esses valores e rode o comando.

## Imagens do Atlas

As cartas do mundo vêm do mapa ilustrado do manuscrito. As demais imagens em
`public/images/atlas/` (panoramas dos reinos, brasões, cenas da mitologia) foram
**produzidas por código** (scripts em `scripts/art/`), não por uma ferramenta de
geração de imagens por IA. São artes conceituais provisórias, sem texto embutido.

Para regenerar: `npm run art` (requer `python3` com `numpy` e `Pillow`; os brasões
usam o Chromium do Playwright). Para trocar uma arte por uma ilustração definitiva,
substitua o arquivo de mesmo nome (WebP, mesma proporção) ou envie a imagem pelo
painel e associe-a ao item. O registro das artes, com textos alternativos e
créditos, está em `src/lib/atlas/art.ts`.

## Capa oficial do Livro I

A capa está em `public/capa/capa-oficial.webp` (recortada da arte completa, que
fica em `public/capa/capa-completa.webp` e tem link na página do livro). Uma imagem
escolhida no painel → **Configurações** → *Capa oficial* tem prioridade.

A sinopse do Livro I é o texto da contracapa. Em bancos criados antes, ela
substitui a apresentação provisória uma única vez, e só se o texto antigo não
tiver sido editado no painel. O site não inventa ISBN nem data de lançamento.

## Pergaminho de anúncio

Na primeira visita, a página inicial abre um pergaminho com o anúncio
“O livro voltou”. Ele fecha com Esc, com o X, com “Entrar no Arquivo” ou com um
clique fora, e não volta a abrir para o mesmo visitante até o texto mudar. O
mesmo pergaminho fica como seção logo abaixo do topo. Título, linha superior e
texto são editados no painel → **Configurações** → *Pergaminho de anúncio*, que
também permite desligá-lo. O trecho sobre a origem de Kael está entre
`:::spoiler 2` e `:::`, então só aparece para quem escolhe revelações avançadas.

## Ilustrações dos capítulos

Página: `/livros/o-sussurro-da-chama-antiga/ilustracoes` (também há uma seção
com as miniaturas na página do Livro I). Os dez primeiros capítulos aparecem em
ordem, cada um com número, título e o **estado da arte**:

| Estado | Selo | Quando usar |
| --- | --- | --- |
| `final` | Arte final | ilustração definitiva, no formato de impressão |
| `estudo` | Versão provisória | imagem que ainda será substituída |
| `pendente` | Arte em produção | ainda não há imagem (o site mostra uma moldura vazia) |

Cada cartão abre a imagem ampliada (Esc, o botão Fechar ou o Voltar do
navegador fecham e devolvem o foco ao cartão; setas ou gesto lateral passam de
capítulo). O endereço recebe `#identificador`, então cada ilustração pode ser
compartilhada. Quando um capítulo for publicado, sua ilustração aparece também
na abertura da página do capítulo.

**Formato:** vertical, 15,5 × 23 cm (31:46), preto e branco; para impressão a
300 DPI, **1831 × 2717 px**. É o tamanho da ilustração, não da página do miolo.

**Arquivos:** `public/images/livro-1/ilustracoes/capitulo-NN-titulo.png` — os
originais em resolução de impressão (o site gera versões menores sob demanda).
As imagens atuais vieram do manuscrito *Kael Draken — Edição Profissional
Ilustrada*: capítulos I e III–X em 1831 × 2717 px; o capítulo II só existe ali
em 1240 × 1820 px, por isso está como versão provisória.

**Trocar uma ilustração:** no painel, em **Ilustrações**, abra o capítulo,
envie a nova imagem no campo *Imagem* e mude o estado para *Arte final*; ou
substitua o arquivo de mesmo nome na pasta acima. A tela de edição mostra a
origem da imagem, as dimensões, o DPI equivalente e avisa se a proporção ou a
resolução não servem para impressão. A *Direção de arte* e as anotações de
cada ilustração ficam só no painel.

Os capítulos I–X existem no painel como **rascunho, só com o título**: nenhum
trecho do manuscrito é publicado, e um capítulo não pode ser publicado com o
trecho vazio. Em bancos que já tinham conteúdo, esses registros são criados
uma única vez na inicialização.

## Versão em HTML

`npm run html` gera `html/index.html` e `html/assets/`: uma página única com o
pergaminho, a capa e a sinopse, as ilustrações com visualização ampliada e o
Atlas nas duas versões. Ela abre com dois cliques, sem servidor, e pode ser
hospedada de graça (GitHub Pages, Netlify). Usa os mesmos textos e imagens do
site; trechos marcados como spoiler não entram nela.

## Testes

```bash
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e
```

Os testes de ponta a ponta sobem o servidor de produção na porta 3300 com banco e
uploads descartáveis (`data/e2e.db`, `data/e2e-uploads`) e uma senha de painel
aleatória gerada a cada execução. Perfis: **desktop**, **tablet**, **mobile**
(Pixel 5, com gestos de toque no 3D) e **sem-webgl** (alternativa 2D). Cobrem
navegação, filtro de spoilers no servidor, acessibilidade (axe), mapa 2D, entrada
e saída do 3D (com verificação de pixels renderizados), gestos de toque, login,
criação/publicação/arquivamento e upload de imagens no painel, e a galeria de
ilustrações (ordem, proporção sem cortes, visualização ampliada com teclado e
botão Voltar, ilustração na página do capítulo em pré-visualização).

`node tests/tools/crawl.mjs http://localhost:3000` visita todas as páginas
públicas e confere links e imagens.

## Publicação

O site precisa de um **servidor Node com disco persistente** (o banco SQLite e as
imagens enviadas ficam em disco). Funciona em VPS, Railway, Fly.io, Render (com
disco) ou qualquer hospedagem de contêiner. Hospedagens *serverless* sem disco
persistente exigiriam trocar o armazenamento de imagens por um serviço de objetos.

**Com Docker:**

```bash
docker build -t kael-draken .
docker run -d -p 3000:3000 \
  -e SITE_URL=https://seu-dominio \
  -e ADMIN_USERNAME=... -e ADMIN_PASSWORD_HASH=... -e SESSION_SECRET=... \
  -v kael-dados:/app/data kael-draken
```

**Sem Docker:** `npm ci && npm run build && npm run start` com as mesmas variáveis
e `DATABASE_URL`/`UPLOADS_DIR` apontando para um disco persistente.

Variáveis de produção: `SITE_URL` (domínio final, usado no SEO e no sitemap),
`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `DATABASE_URL`
(opcional: `libsql://…` do Turso + `DATABASE_AUTH_TOKEN`), `UPLOADS_DIR`,
`MAX_UPLOAD_MB`. Sirva sempre por HTTPS.

**Backup:** copie a pasta `data/` (ou o volume `/app/data`).

## Estrutura do projeto

```
src/
  app/(site)/        páginas públicas
  app/admin/         painel (login, coleções, mídia, categorias, configurações)
  components/        componentes do site, do atlas (2D/3D) e do painel
  lib/db/            esquema, conexão e migrações
  lib/content/       consultas públicas, visibilidade, spoilers, mídia
  lib/markdown/      renderização segura do Markdown editorial
  lib/auth/          senha, sessão, limite de tentativas
  lib/seed/          conteúdo inicial do universo
  lib/atlas/         registro das artes e geometria das regiões
  data/atlas/        world.json (regiões editáveis do mapa)
  styles/            tokens, base, site, atlas, painel
public/images/atlas/ carta do manuscrito, relevo, panoramas e brasões
public/images/livro-1/ilustracoes/  ilustrações dos capítulos (resolução de impressão)
public/capa/         capa oficial e capa completa
scripts/             migrações, seed, hash de senha, geradores de arte e da versão HTML
html/                versão em HTML puro (gerada por npm run html)
tests/               unidade, ponta a ponta e ferramentas de verificação
drizzle/             migrações SQL versionadas
```

## O que ainda é provisório

- **Brasões, cores e panoramas dos reinos:** propostas visuais.
- **Artes procedurais** (panoramas, brasões, cenas da mitologia): conceituais, substituíveis por ilustrações definitivas.
- **As seis faces da Ressonância** (Forja, Vigília, Elo, Eco, Limiar, Ímpeto):
  nomes provisórios, sem vínculo com reinos.
- **Brumafunda e Ruínas de Safra:** propostas de local.
- **Carta do Atlas:** nomes, capitais e fronteiras são os do mapa do manuscrito,
  ainda conceituais; o relevo 3D é uma interpretação da carta.
- **Ilustração do capítulo II:** versão provisória em baixa resolução; precisa
  de um arquivo em 1831 × 2717 px. Créditos das ilustrações não informados.
