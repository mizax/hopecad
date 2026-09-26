<script setup lang="ts">
import { ref } from 'vue'
import Scene from './components/Scene.vue'
import ControlPanel from './components/ControlPanel.vue'
import Results from './components/Results.vue'
import { replaceScheme, scheme } from './store'
import { defaultScheme, normalizeScheme } from './core/defaults'
import { download, stamp, svgForExport, svgToPng } from './export'

const scene = ref<InstanceType<typeof Scene>>()
const fileInput = ref<HTMLInputElement>()
const showStamp = ref(true)
const toast = ref('')
const confirmReset = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function say(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3500)
}

function exportSvg() {
  const svg = scene.value?.svgEl
  if (!svg) return
  download(new Blob([svgForExport(svg)], { type: 'image/svg+xml' }), `hopecad-${stamp()}.svg`)
}

async function exportPng() {
  const s = scene.value
  if (!s?.svgEl) return
  try {
    const blob = await svgToPng(svgForExport(s.svgEl), s.size.W, s.size.H)
    download(blob, `hopecad-${stamp()}.png`)
  } catch (e) {
    say(`Не получилось сохранить PNG: ${(e as Error).message}`)
  }
}

async function copyPng() {
  const s = scene.value
  if (!s?.svgEl) return
  try {
    const blob = await svgToPng(svgForExport(s.svgEl), s.size.W, s.size.H)
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    say('Картинка в буфере обмена, вставляйте в отчёт')
  } catch {
    say('Браузер не дал скопировать картинку, сохраните PNG')
  }
}

function saveScheme() {
  const blob = new Blob([JSON.stringify(scheme, null, 2)], { type: 'application/json' })
  download(blob, `hopecad-${stamp()}.json`)
}

async function openScheme(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    replaceScheme(normalizeScheme(JSON.parse(await file.text())))
    scene.value?.fitWeld()
    say(`Открыта схема «${file.name}»`)
  } catch {
    say('Файл не похож на схему HopeCAD')
  }
}

function reset() {
  if (!confirmReset.value) {
    confirmReset.value = true
    setTimeout(() => (confirmReset.value = false), 3000)
    return
  }
  confirmReset.value = false
  replaceScheme(defaultScheme())
  scene.value?.fitWeld()
  say('Схема сброшена к примеру')
}
</script>

<template>
  <div class="app">
    <header class="bar">
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M2 7 Q12 3 22 7" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M2 17 Q12 13 22 17" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M5 6 L11 15.2 L17 6.2" fill="none" stroke="var(--beam)" stroke-width="2" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="name">Хопа<b>CAD</b></span>
        <span class="tagline">схемы прозвучивания сварных швов</span>
      </div>
      <nav class="tools">
        <div class="group" aria-label="Вид">
          <button class="btn" @click="scene?.fitWeld()">К шву</button>
          <button class="btn" @click="scene?.fitPipe()">Вся труба</button>
          <button class="btn sq" aria-label="Уменьшить" @click="scene?.zoom(1 / 1.25)">−</button>
          <button class="btn sq" aria-label="Увеличить" @click="scene?.zoom(1.25)">+</button>
        </div>
        <div class="group" aria-label="Картинка">
          <label class="check"><input v-model="showStamp" type="checkbox" /> подпись</label>
          <button class="btn" @click="copyPng">Копировать</button>
          <button class="btn" @click="exportPng">PNG</button>
          <button class="btn" @click="exportSvg">SVG</button>
        </div>
        <div class="group" aria-label="Схема">
          <button class="btn" @click="saveScheme">Сохранить</button>
          <button class="btn" @click="fileInput?.click()">Открыть</button>
          <button class="btn" :class="{ danger: confirmReset }" @click="reset">
            {{ confirmReset ? 'Точно сбросить?' : 'Сброс' }}
          </button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="openScheme" />
        </div>
      </nav>
    </header>

    <aside class="panel">
      <ControlPanel @toast="say" />
    </aside>

    <main class="main">
      <Scene ref="scene" :show-stamp="showStamp" />
      <Results />
    </main>

    <div class="toast" role="status" aria-live="polite" :hidden="!toast">{{ toast }}</div>
  </div>
</template>
