import type { Side, Surface, WeldType } from './core/types'

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
}

export const SIDE_NAMES: Record<Side, string> = { L: 'слева', R: 'справа' }

/** Без «-0.0» */
export const fmt = (v: number, digits = 1) => (Number(v.toFixed(digits)) || 0).toFixed(digits)

/** Смещение от оси шва: «3.1 П» / «3.1 Л» / «0.0» */
export function fmtAxis(v: number) {
  if (Math.abs(v) < 0.05) return '0.0'
  return `${fmt(Math.abs(v))} ${v > 0 ? 'П' : 'Л'}`
}
