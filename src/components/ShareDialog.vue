<script setup lang="ts">
import { ref, watch } from 'vue'
import QRCode from 'qrcode'
import { scheme } from '../store'
import { encodeScheme } from '../core/share'

const PUBLIC_URL = 'https://mizax.github.io/hopecad/'

const dialog = ref<HTMLDialogElement>()
const qrSvg = ref('')
const copied = ref(false)
const withScheme = ref(true)
const url = ref(PUBLIC_URL)

/** С localhost и из файла делимся опубликованной версией, иначе — текущим адресом */
const baseUrl = () =>
  location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? location.origin + location.pathname
    : PUBLIC_URL

async function refresh() {
  url.value = baseUrl() + (withScheme.value ? `#s=${await encodeScheme(scheme)}` : '')
  qrSvg.value = await QRCode.toString(url.value, { type: 'svg', margin: 1, errorCorrectionLevel: 'L' })
  copied.value = false
}

watch(withScheme, refresh)

async function open() {
  await refresh()
  dialog.value?.showModal()
}

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value)
    copied.value = true
  } catch {
    // буфер недоступен — выделяем текст, чтобы скопировать вручную
    const el = dialog.value?.querySelector('.share-url')
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(range)
  }
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="share" @click.self="dialog?.close()">
    <h2>Открыть ХопаCAD на телефоне</h2>
    <p class="share-hint">Наведите камеру телефона на код</p>
    <div class="qr" v-html="qrSvg" />
    <label class="check share-check">
      <input v-model="withScheme" type="checkbox" /> с текущей схемой (труба, шов, ПЭП)
    </label>
    <code class="share-url">{{ url }}</code>
    <div class="share-actions">
      <button class="btn" @click="copy">{{ copied ? 'Ссылка скопирована' : 'Копировать ссылку' }}</button>
      <button class="btn" @click="dialog?.close()">Закрыть</button>
    </div>
  </dialog>
</template>
