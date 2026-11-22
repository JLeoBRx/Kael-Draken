/** Serialização binária little-endian com verificação de limites. */

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export class BinaryWriter {
  private buf: Uint8Array
  private view: DataView
  private offset = 0

  constructor(initialSize = 256) {
    this.buf = new Uint8Array(initialSize)
    this.view = new DataView(this.buf.buffer)
  }

  private ensure(n: number): void {
    if (this.offset + n <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.offset + n) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.offset))
    this.buf = next
    this.view = new DataView(next.buffer)
  }

  u8(v: number): this { this.ensure(1); this.view.setUint8(this.offset, v); this.offset += 1; return this }
  i8(v: number): this { this.ensure(1); this.view.setInt8(this.offset, v); this.offset += 1; return this }
  u16(v: number): this { this.ensure(2); this.view.setUint16(this.offset, v, true); this.offset += 2; return this }
  i16(v: number): this { this.ensure(2); this.view.setInt16(this.offset, v, true); this.offset += 2; return this }
  u32(v: number): this { this.ensure(4); this.view.setUint32(this.offset, v, true); this.offset += 4; return this }
  f32(v: number): this { this.ensure(4); this.view.setFloat32(this.offset, v, true); this.offset += 4; return this }
  f64(v: number): this { this.ensure(8); this.view.setFloat64(this.offset, v, true); this.offset += 8; return this }

  /** Texto UTF-8 com prefixo de tamanho (u16). */
  string(v: string): this {
    const bytes = encoder.encode(v)
    if (bytes.length > 0xffff) throw new ProtocolError('texto longo demais')
    this.u16(bytes.length)
    this.ensure(bytes.length)
    this.buf.set(bytes, this.offset)
    this.offset += bytes.length
    return this
  }

  /** Cópia exata dos bytes escritos (pode ser transferida para um Worker). */
  finish(): Uint8Array {
    return this.buf.slice(0, this.offset)
  }
}

export class BinaryReader {
  private readonly view: DataView
  private offset = 0

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get remaining(): number {
    return this.bytes.byteLength - this.offset
  }

  private need(n: number): void {
    if (this.offset + n > this.bytes.byteLength) throw new ProtocolError('mensagem truncada')
  }

  u8(): number { this.need(1); const v = this.view.getUint8(this.offset); this.offset += 1; return v }
  i8(): number { this.need(1); const v = this.view.getInt8(this.offset); this.offset += 1; return v }
  u16(): number { this.need(2); const v = this.view.getUint16(this.offset, true); this.offset += 2; return v }
  i16(): number { this.need(2); const v = this.view.getInt16(this.offset, true); this.offset += 2; return v }
  u32(): number { this.need(4); const v = this.view.getUint32(this.offset, true); this.offset += 4; return v }
  f32(): number { this.need(4); const v = this.view.getFloat32(this.offset, true); this.offset += 4; return v }
  f64(): number { this.need(8); const v = this.view.getFloat64(this.offset, true); this.offset += 8; return v }

  string(maxBytes = 4096): string {
    const len = this.u16()
    if (len > maxBytes) throw new ProtocolError('texto longo demais')
    this.need(len)
    const s = decoder.decode(this.bytes.subarray(this.offset, this.offset + len))
    this.offset += len
    return s
  }

  expectEnd(): void {
    if (this.remaining !== 0) throw new ProtocolError('bytes sobrando na mensagem')
  }
}
