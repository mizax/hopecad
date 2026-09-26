import { DEG } from './geometry'
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
  return { start: P0, points, hits }
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
  return G.R * (Math.PI / 2 - G.capEdgeAngle) + p.wedge.front
}

export function probeFrame(G: Geometry, side: Side, s: number, sMin = 0): ProbeFrame {
  const sc = Math.max(s, sMin)
  const phi = side === 'R' ? Math.PI / 2 - sc / G.R : Math.PI / 2 + sc / G.R
  const n = { x: Math.cos(phi), y: Math.sin(phi) }
  const tan = side === 'R' ? { x: -n.y, y: n.x } : { x: n.y, y: -n.x }
  return { s: sc, sMin, clamped: s < sMin, phi, P: { x: G.R * n.x, y: G.R * n.y }, n, tan }
}

export function beamDir(F: ProbeFrame, angleDeg: number): Vec {
  const b = angleDeg * DEG
  return {
    x: -F.n.x * Math.cos(b) + F.tan.x * Math.sin(b),
    y: -F.n.y * Math.cos(b) + F.tan.y * Math.sin(b),
  }
}

/** Угол призмы (оргстекло), дающий заданный угол ввода поперечной волны в сталь, ° */
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
  return G.R * (Math.PI / 2 - axisAngle(Q))
}

function segIntersect(a: Vec, b: Vec, c: Vec, d: Vec) {
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
          depth: G.R - Math.hypot(point.x, point.y),
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

export interface ProbeResult {
  probe: Probe
  frame: ProbeFrame
  trace: Trace
  legs: LegInfo[]
  crossings: Crossing[]
  wedgeAngle: number
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
      depth: G.R - Math.hypot(h.point.x, h.point.y),
      fromIndex: G.R * (psi - F.phi) * (p.side === 'R' ? 1 : -1),
      fromAxis: offsetFromAxis(G, h.point),
      incidence: h.incidence,
    }
  })

  const warnings: string[] = []
  if (F.clamped) {
    warnings.push(`ПЭП упирается в валик усиления: ближе ${F.sMin.toFixed(1)} мм от оси не поставить`)
  }
  if (G.R * Math.sin(p.angle * DEG) >= G.r) {
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

  return {
    probe: p,
    frame: F,
    trace: tr,
    legs,
    crossings: faceCrossings(G, tr),
    wedgeAngle: wedgeAngle(p.angle),
    warnings,
  }
}

/**
 * Подбирает расстояние от оси, при котором конец последнего участка луча
 * приходится на ось шва. Валик и проплав при наведении не учитываются:
 * целимся в точку на уровне поверхности трубы, иначе луч, зашедший в проплав,
 * упирается в его дальнюю стенку и конец «перепрыгивает» через ось.
 * Возвращает s или null, если не получилось.
 */
export function aimProbe(G: Geometry, p: Probe): number | null {
  const bare: Geometry = {
    ...G,
    arcs: [
      { name: 'outer', cx: 0, cy: 0, rho: G.R, a0: 0, sweep: TAU },
      { name: 'inner', cx: 0, cy: 0, rho: G.r, a0: 0, sweep: TAU },
    ],
  }
  const sMin = probeSMin(G, p)
  const sMax = G.R * Math.PI * 0.9
  const endOffset = (s: number) => {
    const F = probeFrame(bare, p.side, s)
    const tr = traceRay(bare, F.P, beamDir(F, p.angle), p.legs)
    if (tr.hits.length < p.legs) return null
    // прямой луч должен дойти до внутренней стенки, отражённые — чередовать стенки
    if (tr.hits.some((h, i) => h.surface !== (i % 2 === 0 ? 'inner' : 'outer'))) return null
    return offsetFromAxis(bare, tr.points[tr.points.length - 1])
  }
  let prev: { s: number; f: number } | null = null
  for (let s = sMin; s <= sMax; s += 0.25) {
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
      const s0 = (lo.s + hi.s) / 2
      const f0 = endOffset(s0)
      if (f0 !== null && Math.abs(f0) < 0.05) return s0
    }
    prev = { s, f }
  }
  return null
}
