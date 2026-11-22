import { defineConfig } from 'vite'

/**
 * Cliente do jogo. Em desenvolvimento, o Vite serve o cliente em :5173 e
 * repassa /ws e /api para o servidor dedicado local (npm run server, :7350).
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: 'es' },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:7350', ws: true },
      '/api': { target: 'http://localhost:7350' },
    },
  },
})
