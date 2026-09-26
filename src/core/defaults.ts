import { buildGeometry } from './geometry'
import { aimProbe } from './trace'
import type { Probe, Scheme, Side } from './types'

export const PROBE_COLORS = ['#E0301E', '#2F6FE0', '#1E9E5A', '#9150DB', '#D98A00']

let counter = 0
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export function makeProbe(index: number, side: Side = 'R', angle = 45, s = 30, legs = 1): Probe {
  return {
    id: uid(),
    name: `П${index + 1}`,
    side,
    angle,
    s,
    legs,
    color: PROBE_COLORS[index % PROBE_COLORS.length],
    visible: true,
    wedge: { length: 22, height: 13, front: 6 },
  }
}

export function defaultScheme(): Scheme {
  const scheme: Scheme = {
    version: 1,
    pipe: { od: 219, t: 16 },
    weld: { type: 'V', bevel: 30, gap: 2, land: 1.5, capH: 2, capOver: 2, rootH: 1.5, rootOver: 1.5, widthTop: 22, widthBottom: 4 },
    probes: [makeProbe(0, 'L', 50, 40, 1), makeProbe(1, 'R', 45, 21, 1), makeProbe(2, 'R', 45, 60, 2)],
  }
  const G = buildGeometry(scheme.pipe, scheme.weld)
  for (const p of scheme.probes) {
    const s = aimProbe(G, p)
    if (s !== null) p.s = Math.round(s * 10) / 10
  }
  return scheme
}

/** Приводит загруженный JSON к валидной схеме, недостающее берёт из умолчаний */
export function normalizeScheme(raw: unknown): Scheme {
  const d = defaultScheme()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Partial<Scheme>
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb)
  const pipe = { od: num(o.pipe?.od, d.pipe.od), t: num(o.pipe?.t, d.pipe.t) }
  const w = o.weld ?? d.weld
  const weld = {
    type: w.type === 'V' || w.type === 'X' || w.type === 'I' || w.type === 'C' ? w.type : d.weld.type,
    bevel: num(w.bevel, d.weld.bevel),
    gap: num(w.gap, d.weld.gap),
    land: num(w.land, d.weld.land),
    capH: num(w.capH, d.weld.capH),
    capOver: num(w.capOver, d.weld.capOver),
    rootH: num(w.rootH, d.weld.rootH),
    rootOver: num(w.rootOver, d.weld.rootOver),
    widthTop: num(w.widthTop, d.weld.widthTop),
    widthBottom: num(w.widthBottom, d.weld.widthBottom),
  }
  const probes = Array.isArray(o.probes)
    ? o.probes.map((p, i) => {
        const base = makeProbe(i)
        return {
          id: typeof p?.id === 'string' ? p.id : base.id,
          name: typeof p?.name === 'string' ? p.name : base.name,
          side: p?.side === 'L' ? ('L' as const) : ('R' as const),
          angle: Math.min(75, Math.max(30, num(p?.angle, base.angle))),
          s: num(p?.s, base.s),
          legs: Math.round(num(p?.legs, base.legs)),
          color: typeof p?.color === 'string' ? p.color : base.color,
          visible: p?.visible !== false,
          wedge: {
            length: num(p?.wedge?.length, base.wedge.length),
            height: num(p?.wedge?.height, base.wedge.height),
            front: num(p?.wedge?.front, base.wedge.front),
          },
        }
      })
    : d.probes
  return { version: 1, pipe, weld, probes }
}
