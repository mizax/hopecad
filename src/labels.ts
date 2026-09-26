import type { Defect, DefectKind, Side, Surface, WeldType } from './core/types'

export const LEG_NAMES = [
  'прямой луч',
  'однократно отражённый',
  'двукратно отражённый',
  'трёхкратно отражённый',
  'четырёхкратно отражённый',
]

export const SURFACE_NAMES: Record<Surface, string> = {
  outer: 'наружная пов.',
  inner: 'внутренняя пов.',
  cap: 'валик усиления',
  root: 'проплав',
}

export const WELD_NAMES: Record<WeldType, string> = {
  V: 'V-образная',
  X: 'X-образная',
  I: 'без скоса',
  C: 'по факту',
}

export const SIDE_NAMES: Record<Side, string> = { L: 'слева', R: 'справа' }

/** Без «-0.0» */
export const fmt = (v: number, digits = 1) => (Number(v.toFixed(digits)) || 0).toFixed(digits)

/** Смещение от оси шва: «3.1 П» / «3.1 Л» / «0.0» */
export function fmtAxis(v: number) {
  if (Math.abs(v) < 0.05) return '0.0'
  return `${fmt(Math.abs(v))} ${v > 0 ? 'П' : 'Л'}`
}

export const DEFECT_NAMES: Record<DefectKind, string> = {
  through: 'Сквозное отверстие',
  half: 'Засверловка',
  sdh: 'БЦО',
}

/** ½t, ¼t… для привычных долей, иначе проценты */
export function fracLabel(f: number) {
  const known: [number, string][] = [
    [0.25, '¼t'],
    [1 / 3, '⅓t'],
    [0.5, '½t'],
    [2 / 3, '⅔t'],
    [0.75, '¾t'],
  ]
  const hit = known.find(([v]) => Math.abs(v - f) < 0.005)
  return hit ? hit[1] : `${Math.round(f * 100)}% t`
}

export function positionLabel(x: number) {
  return Math.abs(x) < 0.05 ? 'в центре шва' : `${fmt(Math.abs(x))} мм ${x > 0 ? 'справа' : 'слева'} от оси`
}

export function describeDefect(d: Defect, t: number) {
  const base = `${DEFECT_NAMES[d.kind]} Ø${d.diameter}`
  if (d.kind === 'through') return `${base}, ${positionLabel(d.x)}`
  if (d.kind === 'half') {
    return `${base} на ${fracLabel(d.depth)} (${fmt(d.depth * t)} мм) ${d.from === 'outer' ? 'снаружи' : 'изнутри'}, ${positionLabel(d.x)}`
  }
  return `${base}, залегание ${fmt(d.cover)} мм, ${positionLabel(d.x)}`
}
