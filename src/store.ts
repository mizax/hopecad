import { computed, reactive, watch } from 'vue'
import { buildGeometry } from './core/geometry'
import { aimProbe, analyzeProbe } from './core/trace'
import { analyzeDefects } from './core/defects'
import { defaultScheme, makeDefect, makeProbe, normalizeScheme } from './core/defaults'
import type { DefectKind, Probe, Scheme } from './core/types'

const STORAGE_KEY = 'hopecad:scheme:v1'

function load(): Scheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeScheme(JSON.parse(raw))
  } catch {
    /* повреждённые данные — начинаем с примера */
  }
  return defaultScheme()
}

export const scheme = reactive<Scheme>(load())

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  scheme,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scheme))
      } catch {
        /* хранилище недоступно — работаем без автосохранения */
      }
    }, 300)
  },
  { deep: true },
)

export const geometry = computed(() => buildGeometry(scheme.pipe, scheme.weld))
export const results = computed(() =>
  scheme.probes.map((p) => {
    const r = analyzeProbe(geometry.value, p)
    return { ...r, ...analyzeDefects(geometry.value, r, scheme.defects) }
  }),
)
export type FullResult = (typeof results.value)[number]

export function replaceScheme(next: Scheme) {
  scheme.pipe = next.pipe
  scheme.weld = next.weld
  scheme.probes = next.probes
  scheme.defects = next.defects
}

/** Подбирает s, чтобы конец луча пришёлся на ось шва. false — если не вышло */
export function aim(p: Probe): boolean {
  const s = aimProbe(geometry.value, p)
  if (s === null) return false
  p.s = Math.round(s * 10) / 10
  return true
}

export function addProbe() {
  const last = scheme.probes[scheme.probes.length - 1]
  const p = makeProbe(scheme.probes.length, last?.side === 'R' ? 'L' : 'R', 60, 40, 1)
  aim(p)
  scheme.probes.push(p)
}

export function removeProbe(id: string) {
  scheme.probes = scheme.probes.filter((p) => p.id !== id)
}

export function addDefect(kind: DefectKind) {
  const d = makeDefect(kind)
  // БЦО по умолчанию — посередине стенки
  d.cover = Math.round((geometry.value.t / 2) * 10) / 10
  scheme.defects.push(d)
}

export function removeDefect(id: string) {
  scheme.defects = scheme.defects.filter((d) => d.id !== id)
}
