# Versão em HTML — Arquivo da Chama Antiga

O arquivo de Kael Draken em HTML, CSS e JavaScript puros, sem servidor:

- **Início** (`index.html`): o pergaminho “O livro voltou”, a capa e a sinopse
  oficial, as ilustrações dos dez primeiros capítulos (com visualização
  ampliada), a carta nas duas versões e os caminhos para o resto do arquivo.
- **Livro I** (`livro.html`), **Atlas** (`atlas.html`) e um verbete para cada
  reino (`reino-*.html`).
- **Personagens**, **Mitologia**, **Cronologia**, **Ressonância**, **Locais**,
  **Manuscritos** e **Mistérios** — índices e verbetes, com o estado editorial
  de cada um (estabelecido, proposta, em aberto).

Como abrir e publicar:

- **No computador:** dê dois cliques em `index.html` (a pasta `assets/` precisa
  ficar ao lado das páginas).
- **De graça na internet:** envie a pasta inteira para GitHub Pages, Netlify ou
  qualquer hospedagem de arquivos estáticos.
- **Atualizar:** não edite à mão — rode `npm run html` na raiz do projeto. As
  páginas são geradas a partir dos mesmos textos e imagens do site.

Por serem páginas estáticas (qualquer pessoa pode ler o código-fonte), os
trechos e verbetes marcados como spoiler no site não entram nesta versão. O
gerador confere isso, e também todos os links e imagens, a cada execução.
