import { DEG, wallAt } from './geometry'
import type { Arc, Geometry, Probe, Side, Surface, Vec } from './types'

/** Скорости звука, мм/мкс */
export const C_SHEAR = 3.24
export const C_LONG = 5.92
export const C_WEDGE = 2.73 // оргстекло, продольная

/** Угол падения поперечной волны, ниже которого отражение сильно теряет энергию в продольную */
export const MODE_CONVERSION_ANGLE = Math.asin(C_SHEAR / C_LONG) / DEG

const EPS = 1e-6
const TAU = Math.PI * 2

export interface Hit {
  point: Vec
  surface: Surface
  /** Угол падения на поверхность от нормали, ° */
  incidence: number
  /** Длина участка, мм */
  legLength: number
  /** Накопленный путь звука, мм */
  path: number
}

export interface Trace {
  start: Vec
  points: Vec[]
  hits: Hit[]
  /** Направление после последнего отражения */
  dir: Vec
}

export function inArc(angle: number, arc: Arc) {
  const da = (((angle - arc.a0) % TAU) + TAU) % TAU
  return da <= arc.sweep + 1e-9
}

/** Луч из P0 в направлении d0 (единичный вектор), отражающийся от границ металла */
export function traceRay(G: Geometry, P0: Vec, d0: Vec, legs: number): Trace {
  let P = P0
  let d = d0
  let path = 0
  const points: Vec[] = [P0]
  const hits: Hit[] = []
  for (let i = 0; i < legs; i++) {
    let best: { t: number; arc: Arc; Q: Vec } | null = null
    for (const arc of G.arcs) {
      const px = P.x - arc.cx
      const py = P.y - arc.cy
      const b = px * d.x + py * d.y
      const c = px * px + py * py - arc.rho * arc.rho
      const disc = b * b - c
      if (disc < 0) continue
      const sq = Math.sqrt(disc)
      for (const t of [-b - sq, -b + sq]) {
        if (t <= EPS || (best && t >= best.t)) continue
        const Q = { x: P.x + d.x * t, y: P.y + d.y * t }
        if (!inArc(Math.atan2(Q.y - arc.cy, Q.x - arc.cx), arc)) continue
        best = { t, arc, Q }
      }
    }
    if (!best) break
    const nx = (best.Q.x - best.arc.cx) / best.arc.rho
    const ny = (best.Q.y - best.arc.cy) / best.arc.rho
    const dn = d.x * nx + d.y * ny
    path += best.t
    hits.push({
      point: best.Q,
      surface: best.arc.name,
      incidence: Math.acos(Math.min(1, Math.abs(dn))) / DEG,
      legLength: best.t,
      path,
    })
    d = { x: d.x - 2 * dn * nx, y: d.y - 2 * dn * ny }
    P = best.Q
    points.push(P)
  }
  return { start: P0, points, hits, dir: d }
}

export interface ProbeFrame {
  /** Фактическое расстояние от оси (после ограничения валиком) */
  s: number
  sMin: number
  clamped: boolean
  /** Угловое положение точки ввода, рад */
  phi: number
  /** Точка ввода */
  P: Vec
  /** Внешняя нормаль */
  n: Vec
  /** Касательная в сторону шва */
  tan: Vec
}

/** Ближе этого расстояния от оси передняя грань призмы упирается в валик */
export function probeSMin(G: Geometry, p: Probe) {
  return G.wall[p.side].R * Math.abs(G.capEdge[p.side].angle - Math.PI / 2) + p.wedge.front
}

export function probeFrame(G: Geometry, side: Side, s: number, sMin = 0): ProbeFrame {
  const sc = Math.max(s, sMin)
  const Rs = G.wall[side].R
  const phi = side === 'R' ? Math.PI / 2 - sc / Rs : Math.PI / 2 + sc / Rs
  const n = { x: Math.cos(phi), y: Math.sin(phi) }
  const tan = side === 'R' ? { x: -n.y, y: n.x } : { x: n.y, y: -n.x }
  return { s: sc, sMin, clamped: s < sMin, phi, P: { x: Rs * n.x, y: Rs * n.y }, n, tan }
}

export function beamDir(F: ProbeFrame, angleDeg: number): Vec {
  const b = angleDeg * DEG
  return {
    x: -F.n.x * Math.cos(b) + F.tan.x * Math.sin(b),
    y: -F.n.y * Math.cos(b) + F.tan.y * Math.sin(b),
  }
}

/** Угол призмы (оргстекло), дающий заданный угол ввода поперечной волны в сталь, °. Нужен только для рисунка ПЭП */
export function wedgeAngle(betaDeg: number) {
  return Math.asin((C_WEDGE / C_SHEAR) * Math.sin(betaDeg * DEG)) / DEG
}

/** Угол точки относительно центра, приведённый к окрестности оси шва (π/2 ± π) */
function axisAngle(Q: Vec) {
  const a = Math.atan2(Q.y, Q.x) - Math.PI / 2
  return Math.PI / 2 + (((a + Math.PI) % TAU) + TAU) % TAU - Math.PI
}

/** Смещение проекции точки на наружную поверхность от оси шва, мм (+ справа) */
export function offsetFromAxis(G: Geometry, Q: Vec) {
  return wallAt(G, Q).R * (Math.PI / 2 - axisAngle(Q))
}

/** Глубина точки от наружной поверхности своей стенки, мм */
export function depthOf(G: Geometry, Q: Vec) {
  return wallAt(G, Q).R - Math.hypot(Q.x, Q.y)
}

export function segIntersect(a: Vec, b: Vec, c: Vec, d: Vec) {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-12) return null
  const qx = c.x - a.x
  const qy = c.y - a.y
  const t = (qx * sy - qy * sx) / den
  const u = (qx * ry - qy * rx) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { t, u }
}

export interface Crossing {
  side: Side
  leg: number
  point: Vec
  depth: number
  path: number
  /** Угол между лучом и нормалью к кромке, °: 0 — луч перпендикулярен кромке */
  angleToNormal: number
}

export function faceCrossings(G: Geometry, tr: Trace): Crossing[] {
  const out: Crossing[] = []
  let pathBefore = 0
  for (let i = 0; i < tr.points.length - 1; i++) {
    const a = tr.points[i]
    const b = tr.points[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    for (const [side, face] of [
      ['L', G.faceL],
      ['R', G.faceR],
    ] as const) {
      for (let j = 0; j < face.length - 1; j++) {
        const hit = segIntersect(a, b, face[j], face[j + 1])
        if (!hit) continue
        const point = { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t }
        const ex = face[j + 1].x - face[j].x
        const ey = face[j + 1].y - face[j].y
        const el = Math.hypot(ex, ey)
        const cos = Math.abs(((b.x - a.x) * -ey + (b.y - a.y) * ex) / (len * el))
        out.push({
          side,
          leg: i + 1,
          point,
          depth: depthOf(G, point),
          path: pathBefore + len * hit.t,
          angleToNormal: Math.acos(Math.min(1, cos)) / DEG,
        })
      }
    }
    pathBefore += len
  }
  return out
}

export interface LegInfo {
  index: number
  surface: Surface
  path: number
  depth: number
  /** Расстояние от точки ввода по поверхности, мм (+ в сторону шва) */
  fromIndex: number
  /** Смещение от оси шва, мм (+ справа) */
  fromAxis: number
  incidence: number
}

/** Где надо стоять, чтобы конец луча пришёлся на ось шва, и встаёт ли туда ПЭП */
export interface Reach {
  legs: number
  /** Нужное расстояние от оси до точки ввода, мм; null — таким лучом в ось не попасть */
  s: number | null
  /** ПЭП в эту позицию встаёт (передняя грань не упирается в валик) */
  fits: boolean
  /** Насколько не хватает места, мм (0, если встаёт) */
  shortBy: number
}

export interface ProbeResult {
  probe: Probe
  frame: ProbeFrame
  /** Запас хода: от передней грани ПЭП до края валика по поверхности, мм */
  clearance: number
  /** Позиции для прямого и однократно отражённого луча (и текущего, если он дальше) */
  reach: Reach[]
  trace: Trace
  legs: LegInfo[]
  crossings: Crossing[]
  warnings: string[]
}

export function analyzeProbe(G: Geometry, p: Probe): ProbeResult {
  const F = probeFrame(G, p.side, p.s, probeSMin(G, p))
  const tr = traceRay(G, F.P, beamDir(F, p.angle), p.legs)
  const legs: LegInfo[] = tr.hits.map((h, i) => {
    const psi = axisAngle(h.point)
    return {
      index: i + 1,
      surface: h.surface,
      path: h.path,
      depth: depthOf(G, h.point),
      fromIndex: G.wall[p.side].R * (psi - F.phi) * (p.side === 'R' ? 1 : -1),
      fromAxis: offsetFromAxis(G, h.point),
      incidence: h.incidence,
    }
  })

  const warnings: string[] = []
  if (F.clamped) {
    warnings.push(`ПЭП упирается в валик усиления: ближе ${F.sMin.toFixed(1)} мм от оси не поставить`)
  }
  if (G.wall[p.side].R * Math.sin(p.angle * DEG) >= G.wall[p.side].r) {
    warnings.push('Луч не достаёт до внутренней поверхности (R·sinβ ≥ r). Уменьшите угол ввода.')
  }
  tr.hits.forEach((h, i) => {
    if (i < tr.hits.length - 1 && h.incidence < MODE_CONVERSION_ANGLE) {
      warnings.push(
        `Отражение ${i + 1}: угол падения ${h.incidence.toFixed(1)}° < ${MODE_CONVERSION_ANGLE.toFixed(0)}°, ` +
          'сильная трансформация в продольную волну, отражённый луч ослаблен',
      )
    }
  })

  const reach: Reach[] = [...new Set([1, 2, p.legs])].map((n) => {
    const need = cachedAim(G, p, n)
    const fits = need !== null && need >= F.sMin - 1e-6
    return { legs: n, s: need, fits, shortBy: need === null || fits ? 0 : F.sMin - need }
  })

  return {
    probe: p,
    frame: F,
    clearance: F.s - F.sMin,
    reach,
    trace: tr,
    legs,
    crossings: faceCrossings(G, tr),
    warnings,
  }
}

/** Нужная позиция не зависит от текущего s — кэшируем, чтобы не пересчитывать при перетаскивании */
const aimCache = new WeakMap<Geometry, Map<string, number | null>>()

function cachedAim(G: Geometry, p: Probe, legs: number) {
  let cache = aimCache.get(G)
  if (!cache) aimCache.set(G, (cache = new Map()))
  const key = [p.side, p.angle, legs].join('|')
  if (!cache.has(key)) cache.set(key, aimProbe(G, p, { legs, from: 0 }))
  return cache.get(key)!
}

/**
 * Подбирает расстояние от оси, при котором последний участок луча проходит через
 * ось шва на уровне поверхности трубы. Валик и проплав при наведении не учитываются,
 * иначе луч, зашедший в проплав, упирается в его дальнюю стенку и конец
 * «перепрыгивает» через ось.
 * Возвращает s или null, если не получилось.
 *
 * legs — сколько участков луча (по умолчанию как у ПЭП); from — с какого s искать
 * (по умолчанию с ближайшей к шву позиции, куда ПЭП физически встаёт; 0 — без учёта валика).
 */
export function aimProbe(G: Geometry, p: Probe, opts: { legs?: number; from?: number } = {}): number | null {
  const nLegs = opts.legs ?? p.legs
  const bare: Geometry = { ...G, arcs: G.bareArcs }
  const sFrom = opts.from ?? probeSMin(G, p)
  const sMax = G.R * Math.PI * 0.9
  // Цель — точка на оси на уровне поверхности (при смещении кромок — посередине ступеньки)
  const w = G.wall
  const target: Vec = { x: 0, y: nLegs % 2 === 1 ? (w.L.r + w.R.r) / 2 : (w.L.R + w.R.R) / 2 }
  /** Расстояние от цели до последнего участка луча со знаком, мм */
  const endOffset = (s: number) => {
    const F = probeFrame(bare, p.side, s)
    const tr = traceRay(bare, F.P, beamDir(F, p.angle), nLegs - 1)
    if (tr.hits.length < nLegs - 1) return null
    // промежуточные отражения — поочерёдно от внутренней и наружной стенки
    if (tr.hits.some((h, i) => h.surface !== (i % 2 === 0 ? 'inner' : 'outer'))) return null
    const P = tr.points[tr.points.length - 1]
    const d = tr.dir
    const tx = target.x - P.x
    const ty = target.y - P.y
    if (tx * d.x + ty * d.y <= 0) return null
    return d.x * ty - d.y * tx
  }
  let prev: { s: number; f: number } | null = null
  for (let s = sFrom; s <= sMax; s += 0.25) {
    const f = endOffset(s)
    if (f === null) {
      prev = null
      continue
    }
    if (prev && Math.sign(f) !== Math.sign(prev.f)) {
      let lo = prev
      let hi = { s, f }
      for (let k = 0; k < 60; k++) {
        const mid = (lo.s + hi.s) / 2
        const fm = endOffset(mid)
        if (fm === null) break
        if (Math.sign(fm) === Math.sign(lo.f)) lo = { s: mid, f: fm }
        else hi = { s: mid, f: fm }
      }
      const best = Math.abs(lo.f) <= Math.abs(hi.f) ? lo : hi
      if (Math.abs(best.f) < 0.05) return best.s
    }
    prev = { s, f }
  }
  return null
}
