import type { Arc, Geometry, Pipe, Vec, Weld } from './types'

export const DEG = Math.PI / 180
const EPS = 1e-6

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Ближайшее пересечение луча P + t·d (t > 0) с окружностью, или null */
export function circleHit(P: Vec, d: Vec, rho: number, cx = 0, cy = 0): number | null {
  const px = P.x - cx
  const py = P.y - cy
  const b = px * d.x + py * d.y
  const c = px * px + py * py - rho * rho
  const disc = b * b - c
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  if (-b - sq > EPS) return -b - sq
  if (-b + sq > EPS) return -b + sq
  return null
}

export function arcPoints(cx: number, cy: number, rho: number, a0: number, a1: number, n: number): Vec[] {
  const pts: Vec[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    pts.push({ x: cx + rho * Math.cos(a), y: cy + rho * Math.sin(a) })
  }
  return pts
}

/** Центр (на оси y) окружности через (±w, yEdge) и (0, yApex) */
function bumpCenterY(w: number, yEdge: number, yApex: number) {
  return (yApex * yApex - yEdge * yEdge - w * w) / (2 * (yApex - yEdge))
}

const add = (p: Vec, d: Vec, t: number): Vec => ({ x: p.x + d.x * t, y: p.y + d.y * t })

/**
 * Поперечное сечение трубы с продольным швом. Центр трубы в (0,0),
 * ось шва — вертикаль x = 0 сверху, y вверх, всё в мм.
 */
export function buildGeometry(pipe: Pipe, weld: Weld): Geometry {
  const R = Math.max(pipe.od, 4) / 2
  const t = clamp(pipe.t, 0.5, R - 0.5)
  const r = R - t
  const g2 = clamp(weld.gap / 2, 0, r * 0.2)
  const a = clamp(weld.bevel, 0, 70) * DEG
  const yO = (x: number) => Math.sqrt(R * R - x * x)
  const yI = (x: number) => Math.sqrt(r * r - x * x)
  const up: Vec = { x: Math.sin(a), y: Math.cos(a) }
  const down: Vec = { x: Math.sin(a), y: -Math.cos(a) }

  let faceR: Vec[]
  if (weld.type === 'I') {
    faceR = [
      { x: g2, y: yI(g2) },
      { x: g2, y: yO(g2) },
    ]
  } else if (weld.type === 'V') {
    const land = clamp(weld.land, 0, t * 0.9)
    const A = { x: g2, y: yI(g2) }
    const B = { x: g2, y: A.y + land }
    const C = add(B, up, circleHit(B, up, R) ?? 0)
    faceR = land > 0 ? [A, B, C] : [A, C]
  } else {
    const yi = yI(g2)
    const yo = yO(g2)
    const land = clamp(weld.land, 0, (yo - yi) * 0.9)
    const ym = (yi + yo) / 2
    const B1 = { x: g2, y: ym - land / 2 }
    const B2 = { x: g2, y: ym + land / 2 }
    const tA = circleHit(B1, down, r)
    const A = tA === null ? { x: g2, y: yi } : add(B1, down, tA)
    const C = add(B2, up, circleHit(B2, up, R) ?? 0)
    faceR = land > 0 ? [A, B1, B2, C] : [A, B1, C]
  }
  const faceL = faceR.map((p) => ({ x: -p.x, y: p.y }))
  const A = faceR[0]
  const C = faceR[faceR.length - 1]

  // Валик усиления сверху
  const hasCap = weld.capH > 0.05
  const wc = clamp(C.x + (hasCap ? weld.capOver : 0), 0, R * 0.8)
  const yE = yO(wc)
  const thC = Math.atan2(yE, wc)
  const capApexY = R + (hasCap ? weld.capH : 0)
  const capCy = hasCap ? bumpCenterY(wc, yE, capApexY) : 0
  const capRho = capApexY - capCy
  const capPhi = Math.atan2(yE - capCy, wc)

  // Проплав снизу
  const hasRoot = weld.rootH > 0.05
  const wr = clamp(A.x + (hasRoot ? weld.rootOver : 0), 0, r * 0.8)
  const yRe = yI(wr)
  const thR = Math.atan2(yRe, wr)
  const rootApexY = r - (hasRoot ? weld.rootH : 0)
  const rootCy = hasRoot ? bumpCenterY(wr, yRe, rootApexY) : 0
  const rootRho = rootCy - rootApexY
  const rootPhi = Math.atan2(yRe - rootCy, wr)

  const arcs: Arc[] = []
  if (hasCap) {
    arcs.push({ name: 'outer', cx: 0, cy: 0, rho: R, a0: Math.PI - thC, sweep: Math.PI + 2 * thC })
    arcs.push({ name: 'cap', cx: 0, cy: capCy, rho: capRho, a0: capPhi, sweep: Math.PI - 2 * capPhi })
  } else {
    arcs.push({ name: 'outer', cx: 0, cy: 0, rho: R, a0: 0, sweep: 2 * Math.PI })
  }
  if (hasRoot) {
    arcs.push({ name: 'inner', cx: 0, cy: 0, rho: r, a0: Math.PI - thR, sweep: Math.PI + 2 * thR })
    arcs.push({ name: 'root', cx: 0, cy: rootCy, rho: rootRho, a0: -Math.PI - rootPhi, sweep: Math.PI + 2 * rootPhi })
  } else {
    arcs.push({ name: 'inner', cx: 0, cy: 0, rho: r, a0: 0, sweep: 2 * Math.PI })
  }

  // Контур металла шва: верх → правая кромка → низ → левая кромка
  const thCface = Math.atan2(C.y, C.x)
  const thAface = Math.atan2(A.y, A.x)
  const top = hasCap
    ? arcPoints(0, capCy, capRho, Math.PI - capPhi, capPhi, 48)
    : arcPoints(0, 0, R, Math.PI - thCface, thCface, 24)
  const bottom = hasRoot
    ? arcPoints(0, rootCy, rootRho, rootPhi, -Math.PI - rootPhi, 32)
    : arcPoints(0, 0, r, thR, Math.PI - thR, 16)
  const weldPolygon = [
    ...top,
    ...arcPoints(0, 0, R, thC, thCface, 6),
    ...[...faceR].reverse(),
    ...arcPoints(0, 0, r, thAface, thR, 6),
    ...bottom,
    ...arcPoints(0, 0, r, Math.PI - thR, Math.PI - thAface, 6),
    ...faceL,
    ...arcPoints(0, 0, R, Math.PI - thCface, Math.PI - thC, 6),
  ]

  return {
    R,
    r,
    t,
    faceR,
    faceL,
    capEdgeX: wc,
    capEdgeAngle: thC,
    capApexY,
    rootApexY,
    arcs,
    weldPolygon,
  }
}
