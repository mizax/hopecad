<script setup lang="ts">
import NumField from './NumField.vue'
import ProbeCard from './ProbeCard.vue'
import { addProbe, aim, removeProbe, results, scheme } from '../store'
import { WELD_NAMES } from '../labels'
import type { Probe, WeldType } from '../core/types'

const emit = defineEmits<{ toast: [message: string] }>()
const weldTypes = Object.keys(WELD_NAMES) as WeldType[]

function onAim(p: Probe) {
  if (!aim(p)) emit('toast', `${p.name}: при таком угле конец луча не попадает на ось шва`)
}
</script>

<template>
  <div class="panel-inner">
    <details class="section" open>
      <summary>Труба</summary>
      <NumField v-model="scheme.pipe.od" label="Наружный диаметр" :min="30" :max="1420" :step="1" unit="мм" />
      <NumField v-model="scheme.pipe.t" label="Толщина стенки" :min="2" :max="60" :step="0.5" unit="мм" />
    </details>

    <details class="section" open>
      <summary>Сварной шов</summary>
      <div class="seg" role="group" aria-label="Разделка">
        <button
          v-for="t in weldTypes"
          :key="t"
          :aria-pressed="scheme.weld.type === t"
          @click="scheme.weld.type = t"
        >
          {{ WELD_NAMES[t] }}
        </button>
      </div>
      <NumField
        v-if="scheme.weld.type !== 'I'"
        v-model="scheme.weld.bevel"
        label="Угол скоса кромки"
        :min="0"
        :max="60"
        :step="0.5"
        unit="°"
      />
      <NumField v-model="scheme.weld.gap" label="Зазор" :min="0" :max="6" :step="0.1" unit="мм" />
      <NumField
        v-if="scheme.weld.type !== 'I'"
        v-model="scheme.weld.land"
        label="Притупление"
        :min="0"
        :max="8"
        :step="0.1"
        unit="мм"
      />
      <NumField v-model="scheme.weld.capH" label="Усиление: высота" :min="0" :max="5" :step="0.1" unit="мм" />
      <NumField v-model="scheme.weld.capOver" label="Усиление: заход на кромку" :min="0" :max="6" :step="0.1" unit="мм" />
      <NumField v-model="scheme.weld.rootH" label="Проплав: высота" :min="0" :max="4" :step="0.1" unit="мм" />
      <NumField v-model="scheme.weld.rootOver" label="Проплав: заход" :min="0" :max="4" :step="0.1" unit="мм" />
    </details>

    <details class="section" open>
      <summary>ПЭП · {{ scheme.probes.length }}</summary>
      <ProbeCard
        v-for="(p, i) in scheme.probes"
        :key="p.id"
        :probe="p"
        :result="results[i]"
        @aim="onAim(p)"
        @remove="removeProbe(p.id)"
      />
      <button class="btn wide" @click="addProbe">Добавить ПЭП</button>
    </details>
  </div>
</template>
