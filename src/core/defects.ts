import { clamp } from './geometry'
import {
  beamDir,
  depthOf,
  inArc,
  offsetFromAxis,
  probeFrame,
  probeSMin,
  segIntersect,
  traceRay,
  type ProbeResult,
  type Trace,
} from './trace'
import type { Defect, Geometry, Probe, Vec } from './types'

export type Shape = { kind: 'poly'; pts: Vec[] } | { kind: 'circle'; c: Vec; rho: number }

/** Где радиальная прямая под углом φ входит в металл и выходит из него (с учётом валика и проплава) */
function radialExtent(G: Geometry, u: Vec, side: 'L' | 'R') {
  const ts: number[] = []
  for (const arc of G.arcs) {
    // пересечение луча из центра трубы по направлению u с окружностью дуги
    const b = -(arc.cx * u.x + arc.cy * u.y)
    const c = arc.cx * arc.cx + arc.cy * arc.cy - arc.rho * arc.rho
    const disc = b * b - c
    if (disc < 0) continue
    for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) {
      if (t > 0 && inArc(Math.atan2(u.y * t - arc.cy, u.x * t - arc.cx), arc)) ts.push(t)
    }
  }
  ts.sort((a, b) => a - b)
  const w = G.wall[side]
  return ts.length >= 2 ? { rin: ts[0], rout: ts[1] } : { rin: w.r, rout: w.R }
}

/** Форма отражателя в сечении: отверстия — полоса вдоль радиуса, БЦО — круг */
export function defectShape(G: Geometry, d: Defect): Shape {
  const side = d.x >= 0 ? 'R' : 'L'
  const w = G.wall[side]
  const phi = Math.PI / 2 - d.x / w.R
  const u = { x: Math.cos(phi), y: Math.sin(phi) }
  const v = { x: -u.y, y: u.x }
  const rad = Math.max(d.diameter, 0.1) / 2
  if (d.kind === 'sdh') {
    const rho = w.R - clamp(d.cover, 0, G.t)
    return { kind: 'circle', c: { x: u.x * rho, y: u.y * rho }, rho: rad }
  }
  let { rin: a, rout: b } = radialExtent(G, u, side)
  if (d.kind === 'half') {
    const len = clamp(d.depth, 0.05, 1) * G.t
    if (d.from === 'outer') a = Math.max(a, b - len)
    else b = Math.min(b, a + len)
  }
  const at = (rho: number, k: number) => ({ x: u.x * rho + v.x * rad * k, y: u.y * rho + v.y * rad * k })
  return { kind: 'poly', pts: [at(a, -1), at(b, -1), at(b, 1), at(a, 1)] }
}

/** Доля отрезка ab (0..1), на которой он входит в отражатель, или null */
function segEntry(a: Vec, b: Vec, shape: Shape): number | null {
  if (shape.kind === 'circle') {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const fx = a.x - shape.c.x
    const fy = a.y - shape.c.y
    const A = dx * dx + dy * dy
    const B = 2 * (fx * dx + fy * dy)
    const C = fx * fx + fy * fy - shape.rho * shape.rho
    if (C <= 0) return 0
    const disc = B * B - 4 * A * C
    if (disc < 0) return null
    const t = (-B - Math.sqrt(disc)) / (2 * A)
    return t >= 0 && t <= 1 ? t : null
  }
  let best: number | null = null
  const n = shape.pts.length
  for (let i = 0; i < n; i++) {
    const hit = segIntersect(a, b, shape.pts[i], shape.pts[(i + 1) % n])
    if (hit && (best === null || hit.t < best)) best = hit.t
  }
  return best
}

export interface DefectHit {
  defectId: string
  /** На каком участке луча, 1 — прямой */
  leg: number
  point: Vec
  /** Путь звука до отражателя, мм */
  path: number
  depth: number
}

/** Первое попадание луча в отражатель */
export function hitOnTrace(G: Geometry, tr: Trace, d: Defect, shape: Shape): DefectHit | null {
  let before = 0
  for (let i = 0; i < tr.points.length - 1; i++) {
    const a = tr.points[i]
    const b = tr.points[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const t = segEntry(a, b, shape)
    if (t !== null) {
      const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      return { defectId: d.id, leg: i + 1, point, path: before + len * t, depth: depthOf(G, point) }
    }
    before += len
  }
  return null
}

/**
 * Диапазон положений ПЭП, при которых луч попадает в отражатель на участке legs.
 * corner — конец участка приходит в устье отверстия (угловой отражатель, самое сильное эхо);
 * body — луч проходит через тело отверстия (БЦО или засверловка, не выходящая на эту поверхность).
 */
export interface Zone {
  legs: number
  mode: 'corner' | 'body'
  /** От и до, мм от оси шва */
  from: number
  to: number
  /** Середина диапазона — там луч проходит через отражатель центром */
  best: number
  /** ПЭП встаёт в середину диапазона */
  fits: boolean
  /** Путь звука и глубина в середине диапазона */
  path: number
  depth: number
}

export function defectZone(G: Geometry, p: Probe, d: Defect, shape: Shape, legs: number): Zone | null {
  // на какую поверхность выходит отверстие и куда приходит конец этого участка луча
  const openAt = d.kind === 'through' ? ['inner', 'outer'] : d.kind === 'half' ? [d.from] : []
  const mode = openAt.includes(legs % 2 === 1 ? 'inner' : 'outer') ? 'corner' : 'body'
  const hitsAt = (s: number): { path: number; depth: number } | null => {
    const F = probeFrame(G, p.side, s)
    const tr = traceRay(G, F.P, beamDir(F, p.angle), legs)
    // схема прозвучивания — с отражениями от стенок основного металла, не от валика или проплава
    if (tr.hits.slice(0, legs - 1).some((h, i) => h.surface !== (i % 2 === 0 ? 'inner' : 'outer'))) return null
    if (mode === 'corner') {
      if (tr.hits.length < legs) return null
      const end = tr.points[tr.points.length - 1]
      if (Math.abs(offsetFromAxis(G, end) - d.x) > d.diameter / 2) return null
      return { path: tr.hits[tr.hits.length - 1].path, depth: depthOf(G, end) }
    }
    const h = hitOnTrace(G, tr, d, shape)
    return h && h.leg === legs ? h : null
  }
  // уточняем границу диапазона между s «мимо» и s «попал»
  const edge = (out: number, inside: number) => {
    for (let k = 0; k < 14; k++) {
      const mid = (out + inside) / 2
      if (hitsAt(mid)) inside = mid
      else out = mid
    }
    return inside
  }
  const step = 0.25
  const sMax = G.R * Math.PI * 0.6
  const sMin = probeSMin(G, p)
  const found: Zone[] = []
  let start: number | null = null
  for (let s = 0; s <= sMax + step; s += step) {
    const inside = s <= sMax && hitsAt(s) !== null
    if (inside && start === null) start = s === 0 ? 0 : edge(s - step, s)
    if (!inside && start !== null) {
      const from = start
      const to = edge(s, s - step)
      const best = (from + to) / 2
      const h = hitsAt(best)
      found.push({
        legs,
        mode,
        from,
        to,
        best,
        fits: best >= sMin - 1e-6,
        path: h?.path ?? NaN,
        depth: h?.depth ?? NaN,
      })
      start = null
    }
  }
  // ближайший диапазон, куда ПЭП встаёт; если такого нет — ближайший к месту, куда можно встать
  return found.find((z) => z.fits) ?? found[found.length - 1] ?? null
}

export interface DefectAnalysis {
  /** В какие отражатели луч попадает сейчас */
  defectHits: DefectHit[]
  /** Для каждого отражателя — где стоять прямым и однократно отражённым лучом */
  zones: { defectId: string; zones: { legs: number; zone: Zone | null }[] }[]
}

/**
 * Зоны не зависят от текущего положения ПЭП — только от геометрии, угла, стороны, стрелы
 * и отражателя. Кэшируем, чтобы перетаскивание ПЭП не пересчитывало их на каждом кадре.
 */
const zoneCache = new WeakMap<Geometry, Map<string, Zone | null>>()

function cachedZone(G: Geometry, p: Probe, d: Defect, shape: Shape, legs: number) {
  let cache = zoneCache.get(G)
  if (!cache) zoneCache.set(G, (cache = new Map()))
  const key = [p.side, p.angle, p.wedge.front, legs, d.kind, d.diameter, d.x, d.from, d.depth, d.cover].join('|')
  if (!cache.has(key)) cache.set(key, defectZone(G, p, d, shape, legs))
  return cache.get(key)!
}

export function analyzeDefects(G: Geometry, res: ProbeResult, defects: Defect[]): DefectAnalysis {
  const active = defects.filter((d) => d.visible)
  const shapes = new Map(active.map((d) => [d.id, defectShape(G, d)]))
  const defectHits = active
    .map((d) => hitOnTrace(G, res.trace, d, shapes.get(d.id)!))
    .filter((h): h is DefectHit => h !== null)
  const legsSet = [...new Set([1, 2, res.probe.legs])]
  const zones = active.map((d) => ({
    defectId: d.id,
    zones: legsSet.map((n) => ({ legs: n, zone: cachedZone(G, res.probe, d, shapes.get(d.id)!, n) })),
  }))
  return { defectHits, zones }
}
