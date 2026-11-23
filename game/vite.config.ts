import { defineConfig } from 'vite'

/**
 * Cliente do jogo. Em desenvolvimento, o Vite serve o cliente em :5173 e
 * repassa /ws e /api para o servidor dedicado local (npm run server, :7350)
 * e /platform e /game para a plataforma online (npm run platform, :7370).
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
      '/api/online': { target: 'http://localhost:7370' },
      '/api': { target: 'http://localhost:7350' },
      // plataforma online (npm run platform, :7370) e os servidores de jogo que ela aloca
      '/platform': { target: 'ws://localhost:7370', ws: true },
      '/game': { target: 'ws://localhost:7370', ws: true },
    },
  },
})
