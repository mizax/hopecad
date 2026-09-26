import type { Arc, Geometry, Pipe, Side, Surface, Vec, Weld } from './types'

export const DEG = Math.PI / 180
const EPS = 1e-6
const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const norm = (a: number) => ((a % TAU) + TAU) % TAU
const polar = (p: Vec) => Math.atan2(p.y, p.x)

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

/** Дуга окружности через A и B, проходящая через M */
function arcThrough(name: Surface, A: Vec, M: Vec, B: Vec): Arc {
  const a2 = A.x * A.x + A.y * A.y
  const m2 = M.x * M.x + M.y * M.y
  const b2 = B.x * B.x + B.y * B.y
  const d = 2 * (A.x * (M.y - B.y) + M.x * (B.y - A.y) + B.x * (A.y - M.y))
  const cx = (a2 * (M.y - B.y) + m2 * (B.y - A.y) + b2 * (A.y - M.y)) / d
  const cy = (a2 * (B.x - M.x) + m2 * (A.x - B.x) + b2 * (M.x - A.x)) / d
  const rho = Math.hypot(A.x - cx, A.y - cy)
  const aA = Math.atan2(A.y - cy, A.x - cx)
  const aM = Math.atan2(M.y - cy, M.x - cx)
  const aB = Math.atan2(B.y - cy, B.x - cx)
  const sweepAB = norm(aB - aA)
  return norm(aM - aA) <= sweepAB
    ? { name, cx, cy, rho, a0: aA, sweep: sweepAB }
    : { name, cx, cy, rho, a0: aB, sweep: norm(aA - aB) }
}

/** Точки дуги, начиная с того конца, что ближе к start */
function arcPointsFrom(arc: Arc, start: Vec, n: number): Vec[] {
  const pts = arcPoints(arc.cx, arc.cy, arc.rho, arc.a0, arc.a0 + arc.sweep, n)
  const d0 = Math.hypot(pts[0].x - start.x, pts[0].y - start.y)
  const d1 = Math.hypot(pts[n].x - start.x, pts[n].y - start.y)
  return d0 <= d1 ? pts : pts.reverse()
}

const add = (p: Vec, d: Vec, t: number): Vec => ({ x: p.x + d.x * t, y: p.y + d.y * t })

/** Кромка справа от оси (x ≥ 0) для стенки с радиусами Ro/Ri, от внутренней поверхности к наружной */
function buildFace(weld: Weld, Ro: number, Ri: number): Vec[] {
  const t = Ro - Ri
  const g2 = clamp(weld.gap / 2, 0, Ri * 0.2)
  const a = clamp(weld.bevel, 0, 70) * DEG
  const yO = (x: number) => Math.sqrt(Ro * Ro - x * x)
  const yI = (x: number) => Math.sqrt(Ri * Ri - x * x)
  const up: Vec = { x: Math.sin(a), y: Math.cos(a) }
  const down: Vec = { x: Math.sin(a), y: -Math.cos(a) }

  switch (weld.type) {
    case 'C': {
      // «по факту»: прямая кромка от ширины снизу до ширины сверху
      const xb = clamp(weld.widthBottom / 2, 0, Ri * 0.6)
      const xt = clamp(weld.widthTop / 2, 0, Ro * 0.6)
      return [
        { x: xb, y: yI(xb) },
        { x: xt, y: yO(xt) },
      ]
    }
    case 'I':
      return [
        { x: g2, y: yI(g2) },
        { x: g2, y: yO(g2) },
      ]
    case 'V': {
      const land = clamp(weld.land, 0, t * 0.9)
      const A = { x: g2, y: yI(g2) }
      const B = { x: g2, y: A.y + land }
      const C = add(B, up, circleHit(B, up, Ro) ?? 0)
      return land > 0 ? [A, B, C] : [A, C]
    }
    case 'X': {
      const yi = yI(g2)
      const yo = yO(g2)
      const land = clamp(weld.land, 0, (yo - yi) * 0.9)
      const ym = (yi + yo) / 2
      const B1 = { x: g2, y: ym - land / 2 }
      const B2 = { x: g2, y: ym + land / 2 }
      const tA = circleHit(B1, down, Ri)
      const A = tA === null ? { x: g2, y: yi } : add(B1, down, tA)
      const C = add(B2, up, circleHit(B2, up, Ro) ?? 0)
      return land > 0 ? [A, B1, B2, C] : [A, B1, C]
    }
  }
}

/**
 * Поперечное сечение трубы с продольным швом. Центр трубы в (0,0),
 * ось шва — вертикаль x = 0 сверху, y вверх, всё в мм.
 * Смещение кромок: правая половина стенки сдвинута по радиусу на misalign мм (+ наружу).
 */
export function buildGeometry(pipe: Pipe, weld: Weld): Geometry {
  const R = Math.max(pipe.od, 4) / 2
  const t = clamp(pipe.t, 0.5, R - 0.5)
  const r = R - t
  const shift = clamp(weld.misalign ?? 0, -t * 0.9, t * 0.9)
  const wall: Geometry['wall'] = { L: { R, r }, R: { R: R + shift, r: r + shift } }
  const asBuilt = weld.type === 'C'

  const faceR = buildFace(weld, wall.R.R, wall.R.r)
  const faceL = buildFace(weld, wall.L.R, wall.L.r).map((p) => ({ x: -p.x, y: p.y }))
  const topOf = (face: Vec[]) => face[face.length - 1]

  // Края валика и проплава на каждой стороне
  const toe = (side: Side, face: Vec[], outer: boolean) => {
    const w = wall[side]
    const edge = outer ? topOf(face) : face[0]
    const over = asBuilt ? 0 : outer ? weld.capOver : weld.rootOver
    const hasBump = outer ? weld.capH > 0.05 : weld.rootH > 0.05
    const x = clamp(Math.abs(edge.x) + (hasBump ? over : 0), 0, (outer ? w.R : w.r) * 0.8)
    const rho = outer ? w.R : w.r
    return { x: side === 'R' ? x : -x, y: Math.sqrt(rho * rho - x * x) }
  }
  const capL = toe('L', faceL, true)
  const capR = toe('R', faceR, true)
  const rootL = toe('L', faceL, false)
  const rootR = toe('R', faceR, false)

  // Вершина валика — над более высокой кромкой на capH, но не ниже хорды между краями
  const yOf = (rho: number, x: number) => Math.sqrt(rho * rho - x * x)
  const chordY = (A: Vec, B: Vec, x: number) => A.y + ((B.y - A.y) * (x - A.x)) / (B.x - A.x || 1)
  const xmCap = (capL.x + capR.x) / 2
  const capApex = {
    x: xmCap,
    y: Math.max(
      Math.max(yOf(wall.L.R, xmCap), yOf(wall.R.R, xmCap)) + Math.max(weld.capH, 0),
      chordY(capL, capR, xmCap) + 0.02,
    ),
  }
  const xmRoot = (rootL.x + rootR.x) / 2
  const rootApex = {
    x: xmRoot,
    y: Math.min(
      Math.min(yOf(wall.L.r, xmRoot), yOf(wall.R.r, xmRoot)) - Math.max(weld.rootH, 0),
      chordY(rootL, rootR, xmRoot) - 0.02,
    ),
  }
  // без усиления/проплава эта дуга — просто поверхность шва заподлицо
  const capArc = arcThrough(weld.capH > 0.05 ? 'cap' : 'outer', capR, capApex, capL)
  const rootArc = arcThrough(weld.rootH > 0.05 ? 'root' : 'inner', rootR, rootApex, rootL)

  const thCapL = polar(capL)
  const thCapR = polar(capR)
  const thRootL = polar(rootL)
  const thRootR = polar(rootR)
  const arcs: Arc[] = [
    { name: 'outer', cx: 0, cy: 0, rho: wall.L.R, a0: thCapL, sweep: (3 * Math.PI) / 2 - thCapL },
    { name: 'outer', cx: 0, cy: 0, rho: wall.R.R, a0: -Math.PI / 2, sweep: thCapR + Math.PI / 2 },
    capArc,
    { name: 'inner', cx: 0, cy: 0, rho: wall.L.r, a0: thRootL, sweep: (3 * Math.PI) / 2 - thRootL },
    { name: 'inner', cx: 0, cy: 0, rho: wall.R.r, a0: -Math.PI / 2, sweep: thRootR + Math.PI / 2 },
    rootArc,
  ]
  // Для наведения: только поверхности основного металла, без валика и проплава
  const bareArcs: Arc[] = [
    { name: 'outer', cx: 0, cy: 0, rho: wall.L.R, a0: Math.PI / 2, sweep: Math.PI },
    { name: 'outer', cx: 0, cy: 0, rho: wall.R.R, a0: -Math.PI / 2, sweep: Math.PI },
    { name: 'inner', cx: 0, cy: 0, rho: wall.L.r, a0: Math.PI / 2, sweep: Math.PI },
    { name: 'inner', cx: 0, cy: 0, rho: wall.R.r, a0: -Math.PI / 2, sweep: Math.PI },
  ]

  // Контур металла шва: валик → правая кромка → проплав → левая кромка
  const CR = topOf(faceR)
  const CL = topOf(faceL)
  const AR = faceR[0]
  const AL = faceL[0]
  const weldPolygon = [
    ...arcPointsFrom(capArc, capL, 48),
    ...arcPoints(0, 0, wall.R.R, thCapR, polar(CR), 6),
    ...[...faceR].reverse(),
    ...arcPoints(0, 0, wall.R.r, polar(AR), thRootR, 6),
    ...arcPointsFrom(rootArc, rootR, 32),
    ...arcPoints(0, 0, wall.L.r, thRootL, polar(AL), 6),
    ...faceL,
    ...arcPoints(0, 0, wall.L.R, polar(CL), thCapL, 6),
  ]

  // Основной металл: две половины кольца (при смещении кромок они разной высоты)
  const half = (w: { R: number; r: number }, from: number) => [
    ...arcPoints(0, 0, w.R, from, from + Math.PI, 360),
    ...arcPoints(0, 0, w.r, from + Math.PI, from, 360),
  ]
  const basePolygons = [half(wall.L, Math.PI / 2), half(wall.R, -Math.PI / 2)]

  return {
    R,
    r,
    t,
    wall,
    faceR,
    faceL,
    capEdge: {
      L: { x: -capL.x, angle: thCapL },
      R: { x: capR.x, angle: thCapR },
    },
    capApexY: capApex.y,
    rootApexY: rootApex.y,
    arcs,
    bareArcs,
    weldPolygon,
    basePolygons,
  }
}

/** Наружный и внутренний радиус стенки по ту сторону оси шва, где лежит точка */
export function wallAt(G: Geometry, p: Vec) {
  return G.wall[p.x >= 0 ? 'R' : 'L']
}
