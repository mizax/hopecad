<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string
    modelValue: number
    min: number
    max: number
    step?: number
    unit?: string
    slider?: boolean
  }>(),
  { step: 1, unit: '', slider: true },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

// Пока печатают — принимаем только значения в диапазоне (при наборе «45» не прыгать на «4» → min)
function onInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (Number.isFinite(v) && v >= props.min && v <= props.max) emit('update:modelValue', v)
}

// Ушли из поля — приводим к диапазону и показываем, что реально применилось
function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  const v = parseFloat(el.value)
  const next = Number.isFinite(v) ? Math.min(props.max, Math.max(props.min, v)) : props.modelValue
  emit('update:modelValue', next)
  el.value = String(next)
}

function onRange(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  // шаг слайдера округляем, чтобы в поле не было 20.300000000000001
  const decimals = (String(props.step).split('.')[1] ?? '').length
  if (Number.isFinite(v)) emit('update:modelValue', Number(v.toFixed(decimals)))
}
</script>

<template>
  <div class="field">
    <span class="field-label">{{ label }}</span>
    <div class="field-ctl" :class="{ 'no-slider': !slider }">
      <input
        v-if="slider"
        type="range"
        :aria-label="label"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        @input="onRange"
      />
      <span class="num-wrap">
        <input
          type="number"
          class="num"
          :aria-label="label"
          :min="min"
          :max="max"
          :step="step"
          :value="modelValue"
          @input="onInput"
          @change="onChange"
        />
        <span v-if="unit" class="unit">{{ unit }}</span>
      </span>
    </div>
  </div>
</template>
