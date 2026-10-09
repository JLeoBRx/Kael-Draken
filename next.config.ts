import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Saída autocontida para a imagem Docker (ver Dockerfile); `npm run start` usa o build normal.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
  serverExternalPackages: ['@libsql/client', 'libsql'],
  experimental: {
    // Uploads de imagens pelo painel (MAX_UPLOAD_MB, padrão 25 MB) + margem do multipart
    serverActions: { bodySizeLimit: '30mb' },
    proxyClientMaxBodySize: '30mb',
  },
  images: {
    // As imagens enviadas pelo painel são servidas pela rota /media/…
    localPatterns: [{ pathname: '/media/**' }, { pathname: '/capa/**' }, { pathname: '/images/**' }],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
