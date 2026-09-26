import { describe, expect, it } from 'vitest'
import { DEG, buildGeometry } from './geometry'
import { makeProbe } from './defaults'
import { aimProbe, analyzeProbe, beamDir, faceCrossings, probeFrame, traceRay } from './trace'
import type { Weld } from './types'

const plainWeld: Weld = { type: 'V', bevel: 30, gap: 2, land: 1.5, capH: 0, capOver: 0, rootH: 0, rootOver: 0, widthTop: 22, widthBottom: 4 }
const weld: Weld = { ...plainWeld, capH: 2, capOver: 2, rootH: 1.5, rootOver: 1.5 }

describe('геометрия', () => {
  it('кромка V-разделки начинается на внутренней поверхности и заканчивается на наружной', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    const A = G.faceR[0]
    const C = G.faceR[G.faceR.length - 1]
    expect(Math.hypot(A.x, A.y)).toBeCloseTo(G.r, 6)
    expect(Math.hypot(C.x, C.y)).toBeCloseTo(G.R, 6)
    expect(A.x).toBeCloseTo(1, 6)
  })

  it('шов «по факту»: кромка от ширины снизу к ширине сверху, валики ровно по ширине', () => {
    const G = buildGeometry({ od: 219, t: 16 }, { ...weld, type: 'C', widthTop: 20, widthBottom: 5, capH: 3, rootH: 2 })
    const [A, C] = G.faceR
    expect(G.faceR).toHaveLength(2)
    expect(A.x).toBeCloseTo(2.5, 9)
    expect(Math.hypot(A.x, A.y)).toBeCloseTo(G.r, 9)
    expect(C.x).toBeCloseTo(10, 9)
    expect(Math.hypot(C.x, C.y)).toBeCloseTo(G.R, 9)
    expect(G.capEdgeX).toBeCloseTo(10, 9)
    expect(G.capApexY).toBeCloseTo(G.R + 3, 9)
    expect(G.rootApexY).toBeCloseTo(G.r - 2, 9)
    const res = analyzeProbe(G, makeProbe(0, 'R', 45, 0, 1))
    expect(res.frame.s).toBeCloseTo(G.R * (Math.PI / 2 - Math.atan2(Math.sqrt(G.R ** 2 - 100), 10)) + 6, 6)
  })

  it('усиление и проплав выступают на заданную высоту', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    expect(G.capApexY).toBeCloseTo(G.R + 2, 6)
    expect(G.rootApexY).toBeCloseTo(G.r - 1.5, 6)
  })
})

describe('трассировка', () => {
  it('в плоском пределе прямой луч 45° приходит на расстояние t·tanβ', () => {
    const G = buildGeometry({ od: 1e6, t: 20 }, plainWeld)
    const p = { ...makeProbe(0, 'R', 45, 80, 1) }
    const res = analyzeProbe(G, p)
    expect(res.legs[0].surface).toBe('inner')
    expect(res.legs[0].fromIndex).toBeCloseTo(20, 2)
    expect(res.legs[0].path).toBeCloseTo(20 * Math.SQRT2, 2)
    expect(res.legs[0].depth).toBeCloseTo(20, 2)
  })

  it('на трубе угол падения на внутреннюю стенку равен asin(R/r · sinβ)', () => {
    const G = buildGeometry({ od: 219, t: 16 }, plainWeld)
    const res = analyzeProbe(G, makeProbe(0, 'R', 45, 80, 1))
    const expected = Math.asin((109.5 / 93.5) * Math.sin(45 * DEG)) / DEG
    expect(expected).toBeCloseTo(55.9, 1)
    expect(res.legs[0].incidence).toBeCloseTo(expected, 6)
  })

  it('108×16, 45°: луч не доходит до внутренней стенки', () => {
    const G = buildGeometry({ od: 108, t: 16 }, plainWeld)
    const res = analyzeProbe(G, makeProbe(0, 'R', 45, 60, 1))
    expect(res.legs[0].surface).toBe('outer')
    expect(res.warnings.some((w) => w.includes('не достаёт'))).toBe(true)
  })

  it('в кольце без усиления все углы падения сохраняются от отражения к отражению', () => {
    const G = buildGeometry({ od: 219, t: 16 }, plainWeld)
    const res = analyzeProbe(G, makeProbe(0, 'R', 45, 80, 5))
    const inner = res.legs.filter((l) => l.surface === 'inner').map((l) => l.incidence)
    const outer = res.legs.filter((l) => l.surface === 'outer').map((l) => l.incidence)
    expect(inner).toHaveLength(3)
    expect(outer).toHaveLength(2)
    for (const a of inner) expect(a).toBeCloseTo(inner[0], 6)
    for (const a of outer) expect(a).toBeCloseTo(45, 6)
  })

  it('направление остаётся единичным после отражений', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    const F = probeFrame(G, 'R', 40)
    const tr = traceRay(G, F.P, beamDir(F, 60), 5)
    const sum = tr.hits.reduce((acc, h) => acc + h.legLength, 0)
    expect(tr.hits[tr.hits.length - 1].path).toBeCloseTo(sum, 9)
    for (let i = 0; i < tr.hits.length; i++) {
      const a = tr.points[i]
      const b = tr.points[i + 1]
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(tr.hits[i].legLength, 9)
    }
  })

  it('ПЭП слева и справа дают зеркальные лучи', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    const r = analyzeProbe(G, makeProbe(0, 'R', 60, 35, 3))
    const l = analyzeProbe(G, makeProbe(0, 'L', 60, 35, 3))
    r.trace.points.forEach((p, i) => {
      expect(l.trace.points[i].x).toBeCloseTo(-p.x, 9)
      expect(l.trace.points[i].y).toBeCloseTo(p.y, 9)
    })
  })

  it('ПЭП не встаёт на валик усиления', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    const res = analyzeProbe(G, makeProbe(0, 'R', 45, 1, 1))
    expect(res.frame.clamped).toBe(true)
    expect(res.frame.s).toBeGreaterThan(G.capEdgeX)
  })
})

describe('наведение', () => {
  it('прямой луч 45° на трубе 219×16 попадает в ось на s ≈ R·(θ−β)', () => {
    const G = buildGeometry({ od: 219, t: 16 }, plainWeld)
    const p = makeProbe(0, 'R', 45, 0, 1)
    p.wedge.front = 0
    const s = aimProbe(G, p)
    const theta = Math.asin((109.5 / 93.5) * Math.sin(45 * DEG))
    expect(s).not.toBeNull()
    expect(s!).toBeCloseTo(109.5 * (theta - 45 * DEG), 2)
  })

  it('однократно отражённый луч после наведения заканчивается на оси и пересекает кромку', () => {
    const G = buildGeometry({ od: 219, t: 16 }, plainWeld)
    const p = makeProbe(0, 'R', 45, 0, 2)
    p.s = aimProbe(G, p)!
    const res = analyzeProbe(G, p)
    expect(Math.abs(res.legs[1].fromAxis)).toBeLessThan(0.05)
    const cr = faceCrossings(G, res.trace)
    expect(cr.some((c) => c.side === 'R' && c.leg === 2)).toBe(true)
  })

  it('с проплавом наведение на корень всё равно находится', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    const p = makeProbe(0, 'L', 50, 0, 1)
    const s = aimProbe(G, p)
    const theta = Math.asin((109.5 / 93.5) * Math.sin(50 * DEG))
    expect(s).not.toBeNull()
    expect(s!).toBeCloseTo(109.5 * (theta - 50 * DEG), 2)
    expect(analyzeProbe(G, { ...p, s: s! }).legs[0].surface).toBe('root')
  })

  it('луч, не достающий до внутренней стенки, не наводится', () => {
    const G = buildGeometry({ od: 219, t: 16 }, weld)
    expect(aimProbe(G, makeProbe(0, 'R', 70, 0, 1))).toBeNull()
  })
})
