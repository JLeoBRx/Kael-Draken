import type { ServerResponse } from 'node:http'
import { loadavg } from 'node:os'

/**
 * Métricas no formato de texto do Prometheus (/metrics), sem dependências:
 * o operador aponta o Prometheus (ou qualquer coletor compatível) para a
 * plataforma e para cada nó.
 */

type Labels = Record<string, string | number | boolean>

export class Metrics {
  private readonly lines: string[] = []
  private readonly declared = new Set<string>()

  private declare(name: string, type: 'gauge' | 'counter', help: string): void {
    if (this.declared.has(name)) return
    this.declared.add(name)
    this.lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`)
  }

  private sample(name: string, value: number, labels?: Labels): void {
    const l = labels && Object.keys(labels).length
      ? `{${Object.entries(labels).map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`).join(',')}}`
      : ''
    this.lines.push(`${name}${l} ${Number.isFinite(value) ? value : 0}`)
  }

  gauge(name: string, help: string, value: number, labels?: Labels): this {
    this.declare(name, 'gauge', help)
    this.sample(name, value, labels)
    return this
  }

  counter(name: string, help: string, value: number, labels?: Labels): this {
    this.declare(name, 'counter', help)
    this.sample(name, value, labels)
    return this
  }

  /** Memória, CPU e tempo no ar do processo. */
  process(startedAt: number): this {
    const mem = process.memoryUsage()
    const cpu = process.cpuUsage()
    return this
      .gauge('uc_process_resident_bytes', 'Memória residente do processo', mem.rss)
      .gauge('uc_process_heap_used_bytes', 'Heap JavaScript em uso', mem.heapUsed)
      .counter('uc_process_cpu_seconds_total', 'Tempo de CPU usado (usuário + sistema)', (cpu.user + cpu.system) / 1e6)
      .gauge('uc_process_uptime_seconds', 'Tempo desde o início do processo', (Date.now() - startedAt) / 1000)
      .gauge('uc_host_load1', 'Carga média do sistema (1 min)', loadavg()[0])
  }

  toString(): string {
    return this.lines.join('\n') + '\n'
  }

  send(res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' })
    res.end(this.toString())
  }
}
