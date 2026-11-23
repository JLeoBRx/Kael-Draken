import { defineConfig, devices } from '@playwright/test'

/**
 * Testes de ponta a ponta no navegador real: compila o cliente, sobe o
 * servidor dedicado servindo o build e joga partidas offline (Worker) e
 * multijogador (dois navegadores no mesmo servidor).
 *
 * WebGL roda via SwiftShader (CPU) para funcionar sem GPU — é lento (poucos
 * quadros por segundo), por isso os tempos limite são generosos e a
 * qualidade gráfica dos testes é "baixa".
 */
const PORT = Number(process.env.E2E_PORT ?? 7361)
/** Segundo servidor: battle royale curto (zona 30× mais rápida) com 2 bots fáceis. */
export const BR_PORT = PORT + 1
/** Terceiro servidor: sala de espera de LAN (equipes, prontos, reconexão). */
export const LOBBY_PORT = PORT + 2
/** Plataforma online (banco em memória): partidas de dupla curtas, salas privadas. */
export const PLATFORM_PORT = PORT + 3

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
    viewport: { width: 960, height: 540 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } }],
  webServer: [
    {
      command: `npx vite build && npx tsx src/server/node/main.ts --port ${PORT} --host 127.0.0.1 --map campo-de-provas --mode treino --name "Servidor de testes"`,
      url: `http://127.0.0.1:${PORT}/api/info`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // espera o primeiro servidor compilar o cliente (dist/client) antes de subir
      command: `npx tsx src/server/node/main.ts --port ${BR_PORT} --host 127.0.0.1 --map campo-de-provas --mode br --bots 2 --bot-difficulty facil --warmup 4 --zone-speed 30 --name "BR de testes"`,
      url: `http://127.0.0.1:${BR_PORT}/api/info`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `npx tsx src/server/node/main.ts --port ${LOBBY_PORT} --host 127.0.0.1 --map campo-de-provas --lobby --no-discovery --name "Sala de testes"`,
      url: `http://127.0.0.1:${LOBBY_PORT}/api/info`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `npx tsx --disable-warning=ExperimentalWarning src/platform/main.ts --port ${PLATFORM_PORT} --host 127.0.0.1 --db :memory: --map campo-de-provas --max-humans 2 --lobby-size 4 --max-wait 3 --warmup 8 --zone-speed 40 --bot-difficulty facil`,
      url: `http://127.0.0.1:${PLATFORM_PORT}/api/online/status`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
})
