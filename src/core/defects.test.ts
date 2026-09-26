import { describe, expect, it } from 'vitest'
import { buildGeometry } from './geometry'
import { makeDefect, makeProbe } from './defaults'
import { analyzeDefects, defectShape, defectZone, hitOnTrace } from './defects'
import { aimProbe, analyzeProbe, beamDir, probeFrame, probeSMin, traceRay } from './trace'
import type { Weld } from './types'

const weld: Weld = {
  type: 'V', bevel: 30, gap: 2, land: 1.5, capH: 2, capOver: 2, rootH: 1.5, rootOver: 1.5,
  widthTop: 22, widthBottom: 4, misalign: 0,
}
const G = buildGeometry({ od: 219, t: 16 }, weld)

describe('форма отражателей', () => {
  it('сквозное отверстие в центре проходит весь металл, включая валик и проплав', () => {
    const s = defectShape(G, makeDefect('through'))
    if (s.kind !== 'poly') throw new Error('ожидали полосу')
    const ys = s.pts.map((p) => p.y)
    expect(Math.max(...ys)).toBeCloseTo(G.capApexY, 3)
    expect(Math.min(...ys)).toBeCloseTo(G.rootApexY, 3)
    expect(Math.abs(s.pts[0].x - s.pts[3].x)).toBeCloseTo(2, 6)
  })

  it('засверловка ½ снаружи — от наружной поверхности на половину стенки', () => {
    const d = { ...makeDefect('half', 30), depth: 0.5 }
    const s = defectShape(G, d)
    if (s.kind !== 'poly') throw new Error('ожидали полосу')
    const radii = s.pts.map((p) => Math.hypot(p.x, p.y))
    expect(Math.max(...radii)).toBeCloseTo(G.R, 1)
    expect(Math.min(...radii)).toBeCloseTo(G.R - 8, 1)
  })

  it('засверловка изнутри начинается от внутренней поверхности', () => {
    const s = defectShape(G, { ...makeDefect('half', -30), from: 'inner', depth: 0.25 })
    if (s.kind !== 'poly') throw new Error('ожидали полосу')
    const radii = s.pts.map((p) => Math.hypot(p.x, p.y))
    expect(Math.min(...radii)).toBeCloseTo(G.r, 1)
    expect(Math.max(...radii)).toBeCloseTo(G.r + 4, 1)
  })

  it('БЦО — круг с центром на заданном залегании', () => {
    const s = defectShape(G, { ...makeDefect('sdh', 0), cover: 5, diameter: 3 })
    if (s.kind !== 'circle') throw new Error('ожидали круг')
    expect(s.c.x).toBeCloseTo(0, 9)
    expect(s.c.y).toBeCloseTo(G.R - 5, 9)
    expect(s.rho).toBe(1.5)
  })
})

describe('попадание и зоны', () => {
  it('прямой луч, наведённый в корень, попадает в сквозное отверстие в центре', () => {
    const p = makeProbe(0, 'R', 45, 0, 1)
    p.s = aimProbe(G, p)!
    const res = analyzeProbe(G, p)
    const { defectHits } = analyzeDefects(G, res, [makeDefect('through')])
    expect(defectHits).toHaveLength(1)
    expect(defectHits[0].leg).toBe(1)
  })

  it('середина зоны БЦО — луч проходит через центр отверстия', () => {
    const d = { ...makeDefect('sdh', 0), cover: 8 }
    const shape = defectShape(G, d)
    if (shape.kind !== 'circle') throw new Error()
    const p = makeProbe(0, 'L', 60, 0, 1)
    const z = defectZone(G, p, d, shape, 1)!
    expect(z).not.toBeNull()
    expect(z.to - z.from).toBeGreaterThan(1)
    const F = probeFrame(G, 'L', z.best)
    const tr = traceRay(G, F.P, beamDir(F, 60), 1)
    const [a, b] = tr.points
    // расстояние от центра БЦО до луча
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.abs(dx * (shape.c.y - a.y) - dy * (shape.c.x - a.x)) / Math.hypot(dx, dy)
    expect(dist).toBeLessThan(0.05)
    // эхо — от ближней к ПЭП стенки отверстия: между верхом отверстия и центром
    expect(z.depth).toBeGreaterThan(8 - 1)
    expect(z.depth).toBeLessThan(8)
    expect(hitOnTrace(G, tr, d, shape)).not.toBeNull()
  })

  it('сквозное отверстие: зона — где конец луча приходит в устье, центр совпадает с наведением на ось', () => {
    // без валиков устье лежит на уровне поверхности, как и точка наведения
    const G0 = buildGeometry({ od: 219, t: 16 }, { ...weld, capH: 0, rootH: 0 })
    const d = makeDefect('through')
    const p = makeProbe(0, 'R', 45, 0, 1)
    for (const legs of [1, 2]) {
      const z = defectZone(G0, p, d, defectShape(G0, d), legs)!
      expect(z.mode).toBe('corner')
      const aimed = aimProbe(G0, { ...p, legs }, { from: 0 })!
      expect(Math.abs(z.best - aimed)).toBeLessThan(0.5)
      // ширина зоны порядка диаметра отверстия, а не всей стенки
      expect(z.to - z.from).toBeLessThan(4)
    }
  })

  it('наружная засверловка: однократно отражённым — угол, прямым — только через тело', () => {
    const d = { ...makeDefect('half', 20), from: 'outer' as const, depth: 0.5 }
    const p = makeProbe(0, 'R', 45, 0, 1)
    const z1 = defectZone(G, p, d, defectShape(G, d), 1)
    const z2 = defectZone(G, p, d, defectShape(G, d), 2)
    expect(z2?.mode).toBe('corner')
    if (z1) expect(z1.mode).toBe('body')
  })

  it('длинная стрела: зона прямого луча есть, но ПЭП туда не встаёт', () => {
    const d = makeDefect('through')
    const p = makeProbe(0, 'R', 45, 0, 1)
    p.wedge.front = 14
    const z = defectZone(G, p, d, defectShape(G, d), 1)!
    expect(z.best).toBeLessThan(probeSMin(G, p))
    expect(z.fits).toBe(false)
    const z2 = defectZone(G, p, d, defectShape(G, d), 2)!
    expect(z2.fits).toBe(true)
  })

  it('скрытые отражатели не анализируются', () => {
    const res = analyzeProbe(G, makeProbe(0, 'R', 45, 21, 1))
    const d = { ...makeDefect('through'), visible: false }
    expect(analyzeDefects(G, res, [d]).zones).toHaveLength(0)
  })

  it('однократно отражённый — с отражением от внутренней стенки, а не от проплава', () => {
    const d = makeDefect('through')
    const p = makeProbe(0, 'L', 50, 0, 1)
    const z1 = defectZone(G, p, d, defectShape(G, d), 1)!
    const z2 = defectZone(G, p, d, defectShape(G, d), 2)!
    expect(z2.best).toBeGreaterThan(z1.best + 15)
    const F = probeFrame(G, 'L', z2.best)
    expect(traceRay(G, F.P, beamDir(F, 50), 2).hits[0].surface).toBe('inner')
  })
})
