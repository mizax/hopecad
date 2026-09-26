<script setup lang="ts">
import NumField from './NumField.vue'
import { LEG_NAMES, fmt } from '../labels'
import type { Probe } from '../core/types'
import type { ProbeResult } from '../core/trace'

defineProps<{ probe: Probe; result?: ProbeResult }>()
defineEmits<{ aim: []; remove: [] }>()
</script>

<template>
  <div class="probe-card" :style="{ '--pc': probe.color }">
    <div class="probe-head">
      <input v-model="probe.color" type="color" class="swatch" aria-label="Цвет луча" />
      <input v-model="probe.name" class="probe-name" aria-label="Название ПЭП" />
      <button
        class="icon-btn"
        :aria-pressed="probe.visible"
        :title="probe.visible ? 'Скрыть' : 'Показать'"
        @click="probe.visible = !probe.visible"
      >
        {{ probe.visible ? 'Скрыть' : 'Показать' }}
      </button>
      <button class="icon-btn danger" title="Удалить ПЭП" @click="$emit('remove')">Удалить</button>
    </div>

    <div class="seg" role="group" aria-label="Сторона">
      <button :aria-pressed="probe.side === 'L'" @click="probe.side = 'L'">Слева от шва</button>
      <button :aria-pressed="probe.side === 'R'" @click="probe.side = 'R'">Справа от шва</button>
    </div>

    <div class="field-row">
      <NumField v-model="probe.angle" label="Угол ввода" :min="30" :max="75" :step="0.5" unit="°" :slider="false" />
      <NumField v-model="probe.wedge.length" label="Длина ПЭП" :min="5" :max="120" :step="0.5" unit="мм" :slider="false" />
      <NumField v-model="probe.wedge.front" label="Стрела" :min="0" :max="60" :step="0.5" unit="мм" :slider="false" />
    </div>
    <p class="hint">Стрела — от передней грани ПЭП до точки выхода луча.</p>

    <NumField v-model="probe.s" label="От оси шва до точки выхода луча" :min="0" :max="200" :step="0.1" unit="мм" />

    <div class="field">
      <span class="field-label">Луч</span>
      <select v-model.number="probe.legs" aria-label="Луч">
        <option v-for="(n, i) in LEG_NAMES" :key="n" :value="i + 1">{{ n }}</option>
      </select>
    </div>

    <button class="btn wide" @click="$emit('aim')">Навести конец луча на ось шва</button>

    <p v-if="result" class="probe-meta" :class="{ warn: result.frame.clamped }">
      <template v-if="result.frame.clamped">Упирается в валик, ближе {{ fmt(result.frame.sMin) }} мм от оси не встать</template>
      <template v-else>Запас хода до валика: {{ fmt(result.clearance) }} мм</template>
    </p>

    <details class="sub">
      <summary>Для рисунка</summary>
      <NumField v-model="probe.wedge.height" label="Высота ПЭП" :min="5" :max="60" :step="0.5" unit="мм" :slider="false" />
    </details>
  </div>
</template>
