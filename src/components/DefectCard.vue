<script setup lang="ts">
import { computed } from 'vue'
import NumField from './NumField.vue'
import { geometry } from '../store'
import { DEFECT_NAMES, fmt } from '../labels'
import type { Defect, DefectKind } from '../core/types'

const props = defineProps<{ defect: Defect; index: number }>()
defineEmits<{ remove: [] }>()

const kinds = Object.keys(DEFECT_NAMES) as DefectKind[]
const KIND_BUTTONS: Record<DefectKind, string> = { through: 'Сквозное', half: 'Засверловка', sdh: 'БЦО' }

/** «На кромке»: отверстие в основном металле вплотную к линии сплавления на наружной поверхности */
const edge = computed(() => {
  const G = geometry.value
  const r = props.defect.diameter / 2
  return {
    L: -(Math.abs(G.faceL[G.faceL.length - 1].x) + r),
    R: Math.abs(G.faceR[G.faceR.length - 1].x) + r,
  }
})
const round1 = (v: number) => Math.round(v * 10) / 10
const at = (x: number) => Math.abs(props.defect.x - x) < 0.05

/** Засверловка: глубина в мм, хранится долей стенки */
const drillDepth = computed({
  get: () => round1(props.defect.depth * geometry.value.t),
  set: (mm: number) => (props.defect.depth = mm / geometry.value.t),
})
const fractions: [number, string][] = [
  [0.25, '¼t'],
  [0.5, '½t'],
  [0.75, '¾t'],
]
</script>

<template>
  <div class="probe-card defect-card">
    <div class="probe-head">
      <b class="defect-code">Д{{ index + 1 }}</b>
      <span class="defect-kind">{{ DEFECT_NAMES[defect.kind] }}</span>
      <button class="icon-btn" :aria-pressed="defect.visible" @click="defect.visible = !defect.visible">
        {{ defect.visible ? 'Скрыть' : 'Показать' }}
      </button>
      <button class="icon-btn danger" title="Удалить отражатель" @click="$emit('remove')">Удалить</button>
    </div>

    <div class="seg" role="group" aria-label="Вид отражателя">
      <button v-for="k in kinds" :key="k" :aria-pressed="defect.kind === k" @click="defect.kind = k">
        {{ KIND_BUTTONS[k] }}
      </button>
    </div>

    <NumField v-model="defect.diameter" label="Диаметр" :min="0.3" :max="10" :step="0.1" unit="мм" :slider="false" />

    <div class="field">
      <span class="field-label">Положение</span>
      <div class="seg tight" role="group" aria-label="Положение">
        <button :aria-pressed="at(edge.L)" @click="defect.x = round1(edge.L)">Кромка Л</button>
        <button :aria-pressed="at(0)" @click="defect.x = 0">Центр</button>
        <button :aria-pressed="at(edge.R)" @click="defect.x = round1(edge.R)">Кромка П</button>
      </div>
    </div>
    <NumField v-model="defect.x" label="От оси шва (+ справа)" :min="-80" :max="80" :step="0.1" unit="мм" />

    <template v-if="defect.kind === 'half'">
      <div class="seg" role="group" aria-label="С какой стороны сверлили">
        <button :aria-pressed="defect.from === 'outer'" @click="defect.from = 'outer'">Снаружи</button>
        <button :aria-pressed="defect.from === 'inner'" @click="defect.from = 'inner'">Изнутри</button>
      </div>
      <div class="field">
        <span class="field-label">Глубина сверления</span>
        <div class="seg tight" role="group" aria-label="Глубина в долях стенки">
          <button
            v-for="[f, label] in fractions"
            :key="label"
            :aria-pressed="Math.abs(defect.depth - f) < 0.005"
            @click="defect.depth = f"
          >
            {{ label }}
          </button>
        </div>
      </div>
      <NumField v-model="drillDepth" label="Глубина сверления" :min="0.5" :max="geometry.t" :step="0.1" unit="мм" :slider="false" />
    </template>

    <template v-if="defect.kind === 'sdh'">
      <NumField
        v-model="defect.cover"
        label="Залегание: от поверхности до центра"
        :min="0"
        :max="geometry.t"
        :step="0.1"
        unit="мм"
      />
      <p class="hint">Стенка {{ fmt(geometry.t) }} мм.</p>
    </template>
  </div>
</template>
