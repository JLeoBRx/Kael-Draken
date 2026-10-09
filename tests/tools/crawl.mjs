// Rastreia todos os links internos a partir da página inicial e relata respostas diferentes de 200.
// Uso: node tests/tools/crawl.mjs http://localhost:3000 ["cookie=valor"]
const base = process.argv[2] ?? 'http://localhost:3000'
const cookie = process.argv[3] ?? ''
const seen = new Set()
const queue = ['/']
const failures = []
while (queue.length) {
  const path = queue.shift()
  if (seen.has(path)) continue
  seen.add(path)
  const res = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location')
    if (loc) queue.push(new URL(loc, base + path).pathname)
    continue
  }
  if (res.status !== 200) {
    failures.push(`${res.status} ${path}`)
    continue
  }
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('text/html')) continue
  const html = await res.text()
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#]*)(?:#[^"]*)?"/g)) {
    const href = m[1].replace(/&amp;/g, '&')
    if (href.startsWith('/_next/image')) {
      // valida também a imagem original por trás do otimizador
      const original = new URL(href, base).searchParams.get('url')
      if (original && !seen.has(original)) queue.push(original)
      continue
    }
    if (href.startsWith('/_next') || href.startsWith('/admin') || href.startsWith('/api/preview')) continue
    if (!seen.has(href)) queue.push(href)
  }
  for (const m of html.matchAll(/srcSet="([^"]+)"/gi)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(' ')[0].replace(/&amp;/g, '&')
      const original = url.startsWith('/_next/image') ? new URL(url, base).searchParams.get('url') : null
      if (original && !seen.has(original)) queue.push(original)
    }
  }
}
console.log(`${seen.size} endereços verificados`)
if (failures.length) {
  console.log('Falhas:\n' + failures.join('\n'))
  process.exit(1)
}
