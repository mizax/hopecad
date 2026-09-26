import { makeProbe, normalizeScheme, uid } from './defaults'
import type { Scheme, WeldType } from './types'

/**
 * Схема в ссылке: компактный массив → JSON → deflate → base64url.
 * Идентификаторы не храним, при открытии выдаём новые.
 */
type Packed = [
  1,
  [number, number],
  // ширины и смещение кромок добавлены позже, в старых ссылках их нет
  [WeldType, number, number, number, number, number, number, number, number?, number?, number?],
  [string, 'L' | 'R', number, number, number, string, 0 | 1, number, number, number][],
]

function pack(s: Scheme): Packed {
  const w = s.weld
  return [
    1,
    [s.pipe.od, s.pipe.t],
    [w.type, w.bevel, w.gap, w.land, w.capH, w.capOver, w.rootH, w.rootOver, w.widthTop, w.widthBottom, w.misalign],
    s.probes.map((p) => [
      p.name,
      p.side,
      p.angle,
      p.s,
      p.legs,
      p.color,
      p.visible ? 1 : 0,
      p.wedge.length,
      p.wedge.height,
      p.wedge.front,
    ]),
  ]
}

function unpack(v: Packed): Scheme {
  const [, [od, t], [type, bevel, gap, land, capH, capOver, rootH, rootOver, widthTop, widthBottom, misalign], probes] = v
  return normalizeScheme({
    version: 1,
    pipe: { od, t },
    weld: { type, bevel, gap, land, capH, capOver, rootH, rootOver, widthTop, widthBottom, misalign } as Scheme['weld'],
    probes: probes.map(([name, side, angle, s, legs, color, visible, length, height, front], i) => ({
      ...makeProbe(i),
      id: uid(),
      name,
      side,
      angle,
      s,
      legs,
      color,
      visible: visible === 1,
      wedge: { length, height, front },
    })),
  })
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64Url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function encodeScheme(s: Scheme): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(pack(s)))
  return toBase64Url(await pipeThrough(json, new CompressionStream('deflate-raw')))
}

export async function decodeScheme(code: string): Promise<Scheme> {
  const bytes = await pipeThrough(fromBase64Url(code), new DecompressionStream('deflate-raw'))
  const v = JSON.parse(new TextDecoder().decode(bytes))
  if (!Array.isArray(v) || v[0] !== 1) throw new Error('Неизвестный формат ссылки')
  return unpack(v as Packed)
}
