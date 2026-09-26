<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { DEG, clamp } from '../core/geometry'
import { probeSMin, wedgeAngle } from '../core/trace'
import type { Vec } from '../core/types'
import { geometry, results, scheme } from '../store'
import { LEG_NAMES, SIDE_NAMES, WELD_NAMES, fmt } from '../labels'

const props = defineProps<{ showStamp: boolean }>()

const host = ref<HTMLDivElement>()
const svgEl = ref<SVGSVGElement>()
const size = reactive({ W: 800, H: 500 })
const view = reactive({ cx: 0, cy: 100, k: 8 })

const X = (x: number) => (x - view.cx) * view.k + size.W / 2
const Y = (y: number) => -(y - view.cy) * view.k + size.H / 2
const pt = (p: Vec) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`
const toWorld = (sx: number, sy: number): Vec => ({
  x: (sx - size.W / 2) / view.k + view.cx,
  y: -(sy - size.H / 2) / view.k + view.cy,
})
const add = (p: Vec, d: Vec, t: number): Vec => ({ x: p.x + d.x * t, y: p.y + d.y * t })

function fitBox(x0: number, x1: number, y0: number, y1: number) {
  view.k = Math.min(size.W / (x1 - x0), size.H / (y1 - y0)) * 0.9
  view.cx = (x0 + x1) / 2
  view.cy = (y0 + y1) / 2
}

function fitWeld() {
  const G = geometry.value
  let span = 20
  let y0 = G.rootApexY - 4
  let y1 = G.capApexY + 6
  for (const r of results.value) {
    if (!r.probe.visible) continue
    const w = r.probe.wedge
    span = Math.max(span, r.frame.s + w.length - w.front + 4)
    y1 = Math.max(y1, G.R + w.height + 10)
    for (const p of r.trace.points) {
      span = Math.max(span, Math.abs(p.x) + 4)
      y0 = Math.min(y0, p.y - 4)
    }
  }
  // снизу оставляем место под подпись с параметрами
  fitBox(-span, span, y0 - (props.showStamp ? (y1 - y0) * 0.45 : 0), y1)
}

function fitPipe() {
  const R = geometry.value.R
  fitBox(-R - 20, R + 20, -R - 20, R + 20)
}

function zoom(f: number, sx = size.W / 2, sy = size.H / 2) {
  const before = toWorld(sx, sy)
  view.k = clamp(view.k * f, 0.05, 500)
  const after = toWorld(sx, sy)
  view.cx += before.x - after.x
  view.cy += before.y - after.y
}

defineExpose({ fitWeld, fitPipe, zoom, svgEl, size })

let ro: ResizeObserver | undefined
onMounted(() => {
  let fitted = false
  ro = new ResizeObserver(([entry]) => {
    size.W = Math.max(50, entry.contentRect.width)
    size.H = Math.max(50, entry.contentRect.height)
    if (!fitted) {
      fitted = true
      fitWeld()
    }
  })
  ro.observe(host.value!)
})
onBeforeUnmount(() => ro?.disconnect())

// ---------- Геометрия на экране ----------

const annulusPath = computed(() => {
  const G = geometry.value
  const cx = X(0)
  const cy = Y(0)
  const circle = (rho: number) =>
    `M${cx + rho},${cy}A${rho},${rho} 0 1 0 ${cx - rho},${cy}A${rho},${rho} 0 1 0 ${cx + rho},${cy}Z`
  return circle(G.R * view.k) + circle(G.r * view.k)
})

const weldPath = computed(() => 'M' + geometry.value.weldPolygon.map(pt).join('L') + 'Z')

const axis = computed(() => {
  const G = geometry.value
  return { x: X(0), y0: Y(G.capApexY + 5), y1: Y(G.rootApexY - 5) }
})

interface Mark {
  x: number
  y: number
}

const beams = computed(() =>
  results.value
    .filter((r) => r.probe.visible)
    .map((r) => {
      const pts = r.trace.points
      const arrows: string[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        const a = { x: X(pts[i].x), y: Y(pts[i].y) }
        const b = { x: X(pts[i + 1].x), y: Y(pts[i + 1].y) }
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len < 30) continue
        const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
        const m = { x: a.x + (b.x - a.x) * 0.55, y: a.y + (b.y - a.y) * 0.55 }
        const tip = `${m.x + u.x * 6},${m.y + u.y * 6}`
        const l = `${m.x - u.x * 5 - u.y * 4},${m.y - u.y * 5 + u.x * 4}`
        const rr = `${m.x - u.x * 5 + u.y * 4},${m.y - u.y * 5 - u.x * 4}`
        arrows.push(`${tip} ${l} ${rr}`)
      }
      const bounces: (Mark & { n: number })[] = pts.slice(1).map((p, i) => ({ x: X(p.x), y: Y(p.y), n: i + 1 }))
      const crossings: Mark[] = r.crossings.map((c) => ({ x: X(c.point.x), y: Y(c.point.y) }))
      return { id: r.probe.id, color: r.probe.color, line: pts.map(pt).join(' '), arrows, bounces, crossings }
    }),
)

const probes = computed(() =>
  results.value
    .filter((r) => r.probe.visible)
    .map((r) => {
      const { P, n, tan } = r.frame
      const w = r.probe.wedge
      const b0 = add(P, tan, -(w.length - w.front))
      const b1 = add(P, tan, w.front)
      const t1 = add(b1, n, w.height)
      const t0 = add(b0, n, w.height)
      // Пьезоэлемент на пути луча в призме
      const aw = wedgeAngle(r.probe.angle) * DEG
      const dw = { x: -n.x * Math.cos(aw) + tan.x * Math.sin(aw), y: -n.y * Math.cos(aw) + tan.y * Math.sin(aw) }
      const back = Math.max(1, w.length - w.front - 2)
      const dist = Math.min((w.height * 0.62) / Math.cos(aw), back / Math.max(Math.sin(aw), 1e-3))
      const E = add(P, dw, -dist)
      const perp = { x: -dw.y, y: dw.x }
      const half = Math.min(4, w.height * 0.3)
      const top = add({ x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 }, n, 1.5)
      return {
        id: r.probe.id,
        color: r.probe.color,
        name: r.probe.name,
        body: [b0, b1, t1, t0].map(pt).join(' '),
        element: (() => {
          const a = add(E, perp, -half)
          const b = add(E, perp, half)
          return { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y) }
        })(),
        inWedge: `${pt(E)} ${pt(P)}`,
        label: { x: X(top.x), y: Y(top.y) - 4 },
      }
    }),
)

const stamp = computed(() => {
  const { pipe, weld } = scheme
  const lines = [
    `Труба Ø${pipe.od}×${pipe.t} мм`,
    weld.type === 'C'
      ? `Шов по факту: ширина ${weld.widthTop} сверху / ${weld.widthBottom} снизу, валик ${weld.capH} / проплав ${weld.rootH} мм`
      : weld.type === 'I'
        ? `Шов без скоса кромок, зазор ${weld.gap} мм`
        : `Разделка ${WELD_NAMES[weld.type]} ${weld.bevel}°, зазор ${weld.gap}, притупление ${weld.land} мм`,
    ...results.value
      .filter((r) => r.probe.visible)
      .map(
        (r) =>
          `${r.probe.name}: ${r.probe.angle}°, ${SIDE_NAMES[r.probe.side]}, ${fmt(r.frame.s)} мм от оси, ${LEG_NAMES[r.probe.legs - 1]}`,
      ),
  ]
  const lh = 16
  const w = Math.min(size.W - 24, Math.max(...lines.map((l) => l.length)) * 6.3 + 20)
  const h = lines.length * lh + 12
  return { lines, lh, x: 12, y: size.H - 12 - h, w, h }
})

const scaleBar = computed(() => {
  const target = 110 / view.k
  const nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  const mm = nice.find((v) => v >= target * 0.6) ?? 1000
  const len = mm * view.k
  return { mm, len, x: size.W - 16 - len, y: 44 }
})

// ---------- Мышь и пальцы ----------

type Drag =
  | { kind: 'probe'; id: string }
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'pinch'; dist: number; k: number }

let drag: Drag | null = null
const pointers = new Map<number, { x: number; y: number }>()

function local(e: PointerEvent) {
  const r = host.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onDown(e: PointerEvent) {
  host.value!.setPointerCapture(e.pointerId)
  const p = local(e)
  pointers.set(e.pointerId, p)
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }
    return
  }
  const probeEl = (e.target as Element).closest('[data-probe]')
  drag = probeEl
    ? { kind: 'probe', id: probeEl.getAttribute('data-probe')! }
    : { kind: 'pan', sx: p.x, sy: p.y, cx: view.cx, cy: view.cy }
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId) || !drag) return
  const p = local(e)
  pointers.set(e.pointerId, p)
  if (drag.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const f = Math.hypot(a.x - b.x, a.y - b.y) / drag.dist
    zoom((drag.k * f) / view.k, (a.x + b.x) / 2, (a.y + b.y) / 2)
  } else if (drag.kind === 'pan') {
    view.cx = drag.cx - (p.x - drag.sx) / view.k
    view.cy = drag.cy + (p.y - drag.sy) / view.k
  } else if (drag.kind === 'probe') {
    const id = drag.id
    const probe = scheme.probes.find((q) => q.id === id)
    if (!probe) return
    const G = geometry.value
    const w = toWorld(p.x, p.y)
    let a = Math.atan2(w.y, w.x)
    if (a < -Math.PI / 2) a += 2 * Math.PI
    const side = a <= Math.PI / 2 ? 'R' : 'L'
    const s = Math.max(G.R * Math.abs(a - Math.PI / 2), probeSMin(G, probe))
    probe.side = side
    probe.s = Math.round(s * 10) / 10
  }
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  drag = null
}

function onWheel(e: WheelEvent) {
  const r = host.value!.getBoundingClientRect()
  zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}

const svgCss = `
.bg{fill:var(--paper)}
.steel{fill:var(--steel)}
.hatch{stroke:var(--hatch);stroke-width:1}
.weld{fill:var(--weld)}
.weld-hatch{stroke:var(--weldh);stroke-width:1}
.outline{fill:none;stroke:var(--ink);stroke-width:1.4;stroke-linejoin:round}
.axis{stroke:var(--muted);stroke-width:1;stroke-dasharray:16 4 2 4}
.beam{fill:none;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.bounce-n{fill:#fff;font:600 10px/1 'IBM Plex Mono',ui-monospace,monospace;text-anchor:middle;dominant-baseline:central}
.cross{fill:var(--paper);stroke-width:2}
.wedge{fill:var(--panel);stroke-width:1.6;cursor:grab}
.element{stroke:var(--ink);stroke-width:3;stroke-linecap:round}
.in-wedge{fill:none;stroke-width:1;stroke-dasharray:3 3}
.plabel{fill:var(--ink);font:600 12px/1 'IBM Plex Sans Condensed','Arial Narrow',sans-serif;text-anchor:middle}
.stamp-bg{fill:var(--panel);stroke:var(--line)}
.stamp{fill:var(--ink);font:12px/1 'IBM Plex Sans Condensed','Arial Narrow',sans-serif}
.scale{stroke:var(--ink);stroke-width:1.5}
.scale-t{fill:var(--ink);font:11px/1 'IBM Plex Mono',ui-monospace,monospace;text-anchor:middle}
`
</script>

<template>
  <div
    ref="host"
    class="scene"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @wheel.prevent="onWheel"
  >
    <svg
      ref="svgEl"
      xmlns="http://www.w3.org/2000/svg"
      :width="size.W"
      :height="size.H"
      :viewBox="`0 0 ${size.W} ${size.H}`"
      role="img"
      aria-label="Схема прозвучивания сварного шва"
    >
      <component :is="'style'">{{ svgCss }}</component>
      <defs>
        <pattern id="hatch-base" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line class="hatch" x1="0" y1="0" x2="0" y2="10" />
        </pattern>
        <pattern id="hatch-weld" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line class="weld-hatch" x1="0" y1="0" x2="0" y2="5" />
        </pattern>
      </defs>

      <rect class="bg" x="0" y="0" :width="size.W" :height="size.H" />

      <path class="steel" :d="annulusPath" fill-rule="evenodd" />
      <path :d="annulusPath" fill="url(#hatch-base)" fill-rule="evenodd" />
      <path class="outline" :d="annulusPath" />

      <path class="weld" :d="weldPath" />
      <path :d="weldPath" fill="url(#hatch-weld)" />
      <path class="outline" :d="weldPath" />

      <line class="axis" :x1="axis.x" :x2="axis.x" :y1="axis.y0" :y2="axis.y1" />

      <g v-for="b in beams" :key="b.id">
        <polyline class="beam" :points="b.line" :style="{ stroke: b.color }" />
        <polygon v-for="(a, i) in b.arrows" :key="i" :points="a" :style="{ fill: b.color }" />
        <circle
          v-for="(c, i) in b.crossings"
          :key="'c' + i"
          class="cross"
          :cx="c.x"
          :cy="c.y"
          r="4"
          :style="{ stroke: b.color }"
        />
        <g v-for="m in b.bounces" :key="'b' + m.n">
          <circle :cx="m.x" :cy="m.y" r="7" :style="{ fill: b.color }" />
          <text class="bounce-n" :x="m.x" :y="m.y">{{ m.n }}</text>
        </g>
      </g>

      <g v-for="p in probes" :key="p.id" :data-probe="p.id">
        <polygon class="wedge" :points="p.body" :style="{ stroke: p.color }" />
        <polyline class="in-wedge" :points="p.inWedge" :style="{ stroke: p.color }" />
        <line class="element" v-bind="p.element" />
        <text class="plabel" :x="p.label.x" :y="p.label.y">{{ p.name }}</text>
      </g>

      <g v-if="props.showStamp">
        <rect class="stamp-bg" :x="stamp.x" :y="stamp.y" :width="stamp.w" :height="stamp.h" rx="3" />
        <text
          v-for="(l, i) in stamp.lines"
          :key="i"
          class="stamp"
          :x="stamp.x + 10"
          :y="stamp.y + 18 + i * stamp.lh"
        >
          {{ l }}
        </text>
      </g>

      <g>
        <line class="scale" :x1="scaleBar.x" :x2="scaleBar.x + scaleBar.len" :y1="scaleBar.y" :y2="scaleBar.y" />
        <line class="scale" :x1="scaleBar.x" :x2="scaleBar.x" :y1="scaleBar.y - 4" :y2="scaleBar.y + 4" />
        <line
          class="scale"
          :x1="scaleBar.x + scaleBar.len"
          :x2="scaleBar.x + scaleBar.len"
          :y1="scaleBar.y - 4"
          :y2="scaleBar.y + 4"
        />
        <text class="scale-t" :x="scaleBar.x + scaleBar.len / 2" :y="scaleBar.y - 7">{{ scaleBar.mm }} мм</text>
      </g>
    </svg>
    <p class="scene-hint">Тащите ПЭП мышью · колесо — масштаб · пустое место — сдвиг</p>
  </div>
</template>
