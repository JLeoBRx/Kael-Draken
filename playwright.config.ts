import { defineConfig, devices } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'

/**
 * Testes de ponta a ponta. Sobem o servidor de produção com um banco e uma
 * pasta de uploads descartáveis, e credenciais aleatórias geradas a cada
 * execução (nenhuma senha fica no código).
 */
const PORT = Number(process.env.E2E_PORT ?? 3300)
const BASE = `http://localhost:${PORT}`

if (!process.env.E2E_ADMIN_PASSWORD) {
  process.env.E2E_ADMIN_USER = 'e2e'
  process.env.E2E_ADMIN_PASSWORD = randomBytes(12).toString('base64url')
}
const salt = randomBytes(16)
const key = scryptSync(process.env.E2E_ADMIN_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 })
const hash = ['scrypt', 16384, 8, 1, salt.toString('base64url'), key.toString('base64url')].join(':')

const webglArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: BASE, trace: 'retain-on-failure', launchOptions: { args: webglArgs } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /fallback\.spec\.ts/ },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true }, testMatch: /(public|atlas|illustrations|announcement)\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /(public|atlas|illustrations|announcement)\.spec\.ts/ },
    {
      name: 'sem-webgl',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-webgl', '--disable-3d-apis', '--disable-gpu'] } },
      testMatch: /fallback\.spec\.ts/,
    },
  ],
  webServer: {
    command: `rm -rf data/e2e.db* data/e2e-uploads && npm run start -- -p ${PORT}`,
    url: BASE,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: 'file:./data/e2e.db',
      UPLOADS_DIR: './data/e2e-uploads',
      SITE_URL: BASE,
      ADMIN_USERNAME: process.env.E2E_ADMIN_USER!,
      ADMIN_PASSWORD_HASH: hash,
      SESSION_SECRET: randomBytes(48).toString('base64url'),
    },
  },
})
