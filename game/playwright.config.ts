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
  webServer: {
    command: `npx vite build && npx tsx src/server/node/main.ts --port ${PORT} --host 127.0.0.1 --name "Servidor de testes"`,
    url: `http://127.0.0.1:${PORT}/api/info`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
