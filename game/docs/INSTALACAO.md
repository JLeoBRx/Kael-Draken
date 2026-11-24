# Instalação

Três jeitos de ter o jogo, do mais simples ao mais completo:

| Quero… | Use |
| --- | --- |
| jogar (offline, rede local ou online) | o **aplicativo para computador** ou o **navegador** |
| hospedar partidas para os amigos da casa/escritório | o aplicativo (*Rede local → Hospedar partida*) ou `npm run host` |
| manter um servidor online para muita gente | a imagem **Docker** — veja [OPERACAO.md](OPERACAO.md) |

## Aplicativo para computador

Arquivos gerados por `npm run desktop:dist` (pasta `desktop/release/`):

| Sistema | Arquivo | Como instalar |
| --- | --- | --- |
| Windows 10/11 (64 bits) | `ultima-chama-1.0.0-win-x64.exe` | execute e siga o instalador (escolha a pasta; cria atalho na área de trabalho) |
| Windows (sem instalar) | `ultima-chama-1.0.0-win-x64.zip` | descompacte e abra `ultima-chama.exe` |
| Linux (qualquer distribuição) | `ultima-chama-1.0.0-linux-x86_64.AppImage` | `chmod +x` no arquivo e abra |
| Ubuntu, Debian, Mint | `ultima-chama-1.0.0-linux-amd64.deb` | `sudo apt install ./ultima-chama-1.0.0-linux-amd64.deb` |

Depois de instalado, o jogo aparece no menu de aplicativos como **Última Chama**
(no Linux, também pelo comando `ultima-chama`).

**Primeira vez:** abra *Configurações → Testar este computador* — o teste leva
menos de um minuto e escolhe a melhor qualidade gráfica que fica fluida.

### Avisos do sistema

- **Windows SmartScreen** ("O Windows protegeu o computador"): os arquivos não
  têm assinatura digital (exige um certificado pago). Clique em *Mais
  informações → Executar assim mesmo*.
- **Firewall** ao hospedar: permita o aplicativo na **rede privada** (TCP
  7350 para o jogo e UDP 7351 para a lista de partidas). Sem isso, só este
  computador entra na sala.
- **AppImage não abre no Ubuntu 24.04+** (restrição de *namespaces* do
  AppArmor): rode `./ultima-chama-1.0.0-linux-x86_64.AppImage --no-sandbox`
  ou instale o `.deb`, que traz o perfil do AppArmor.
- **AppImage pede FUSE**: `sudo apt install libfuse2` (ou rode com
  `--appimage-extract-and-run`).
- **Placa de vídeo na lista de bloqueio** do Chromium (drivers antigos): a
  imagem cai para renderização por software e fica lenta. Para forçar a placa,
  abra com a variável `UC_IGNORE_GPU_BLOCKLIST=1`.

### Configuração do aplicativo

Opcional, em `config.json` na pasta de dados do aplicativo
(`%APPDATA%\Última Chama` no Windows, `~/.config/Última Chama` no Linux):

```json
{ "platform": "jogo.exemplo.com.br", "hostPort": 7350 }
```

- `platform`: plataforma online padrão (a tela de entrada online também
  aceita outro endereço). Padrão `localhost:7370`.
- `hostPort`: porta do servidor ao hospedar pelo aplicativo.

As mesmas opções valem pelas variáveis `UC_PLATFORM` e `UC_HOST_PORT`.
Configurações do jogo (qualidade, teclas, nome) ficam salvas no próprio
aplicativo.

## Navegador

Qualquer navegador atual com **WebGL 2** (Chrome, Edge, Firefox, Safari).
Abra o endereço de quem hospeda:

- rede local: `http://IP-DO-ANFITRIÃO:7350` (mostrado no terminal ou no
  aplicativo de quem hospeda);
- online: o endereço da plataforma (por exemplo `https://jogo.exemplo.com.br`).

O modo offline também funciona no navegador: o servidor da partida roda
dentro da página (Web Worker).

## A partir do código-fonte

Requisitos: **Node.js 22.12+** e npm. Para o aplicativo, nada além disso (o
Electron é baixado pelo npm).

```bash
cd game
npm install
npm run host                # compila e abre o jogo em http://localhost:7350
```

| Comando | Resultado |
| --- | --- |
| `npm run build:all` | cliente (`dist/client`) e servidores empacotados (`dist/server/*.mjs`) |
| `npm run desktop` | compila e abre o aplicativo (desenvolvimento) |
| `npm run desktop:dist` | instaladores do Linux e do Windows em `desktop/release/` |
| `npm --prefix desktop run dist:linux` | só AppImage e .deb |
| `npm --prefix desktop run dist:win` | só Windows (instalador e zip) |

Observações sobre os instaladores:

- O **instalador do Windows** (NSIS) precisa ser gerado no Windows ou, no
  Linux, com Wine. Sem Wine, gere a versão portátil e depois o instalador na
  imagem oficial do electron-builder (que traz o Wine):

  ```bash
  cd desktop
  npm run build && npx electron-builder --win zip --publish never      # zip + release/win-unpacked
  docker run --rm -v "$PWD/..":/project -w /project/desktop electronuserland/builder:wine \
    npx electron-builder --win nsis --publish never --prepackaged release/win-unpacked
  ```

- O pacote para **macOS** (`.dmg`) só pode ser gerado num Mac
  (`npx electron-builder --mac` dentro de `desktop/`); a configuração já está
  no `desktop/package.json`.
- Se o npm não baixar o Electron (redes com bloqueio), rode
  `node desktop/node_modules/electron/install.js`.

### Conferir o aplicativo

```bash
cd desktop
npm run build
xvfb-run -a node tests/smoke.mjs                                   # código-fonte
UC_EXE=release/linux-unpacked/ultima-chama xvfb-run -a node tests/smoke.mjs   # pacote pronto
```

O teste abre o aplicativo, confere a ponte com a página (sem acesso ao Node),
hospeda uma partida, entra nela com um navegador comum (como outro
computador) e confere que o servidor fecha junto com o aplicativo.

## Hospedar sem o aplicativo

No computador anfitrião, com o código-fonte:

```bash
npm run host
```

Ou com os pacotes de produção (só Node, sem `npm install` na máquina):

```bash
node dist/server/servidor.mjs --lobby --static dist/client
```

Opções: `node dist/server/servidor.mjs --help`. Para o servidor online
completo (contas, amigos, matchmaking), veja [OPERACAO.md](OPERACAO.md).
