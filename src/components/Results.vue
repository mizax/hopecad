<script setup lang="ts">
import { geometry, results } from '../store'
import { LEG_NAMES, SIDE_NAMES, SURFACE_NAMES, fmt, fmtAxis } from '../labels'
import { DEG } from '../core/geometry'

const innerIncidence = (angle: number) => {
  const G = geometry.value
  const v = (G.R / G.r) * Math.sin(angle * DEG)
  return v >= 1 ? null : Math.asin(v) / DEG
}
</script>

<template>
  <div class="results">
    <article v-for="r in results" :key="r.probe.id" class="res" :class="{ dim: !r.probe.visible }">
      <header class="res-head" :style="{ '--pc': r.probe.color }">
        <span class="dot" />
        <b>{{ r.probe.name }}</b>
        <span class="res-sub">
          {{ r.probe.angle }}° · {{ SIDE_NAMES[r.probe.side] }} · {{ fmt(r.frame.s) }} мм от оси ·
          {{ LEG_NAMES[r.probe.legs - 1] }}
        </span>
        <span v-if="innerIncidence(r.probe.angle) !== null" class="chip">
          на внутренней стенке {{ fmt(innerIncidence(r.probe.angle)!) }}°
        </span>
      </header>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Точка</th>
              <th>Поверхность</th>
              <th class="n">Путь S, мм</th>
              <th class="n">Глубина H, мм</th>
              <th class="n">От точки ввода, мм</th>
              <th class="n">От оси шва, мм</th>
              <th class="n">Угол падения</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in r.legs" :key="l.index">
              <td>{{ l.index }}</td>
              <td>{{ SURFACE_NAMES[l.surface] }}</td>
              <td class="n">{{ fmt(l.path) }}</td>
              <td class="n">{{ fmt(l.depth) }}</td>
              <td class="n">{{ fmt(l.fromIndex) }}</td>
              <td class="n">{{ fmtAxis(l.fromAxis) }}</td>
              <td class="n">{{ fmt(l.incidence) }}°</td>
            </tr>
            <tr v-for="(c, i) in r.crossings" :key="'c' + i" class="crossing">
              <td>○</td>
              <td>кромка {{ c.side === 'L' ? 'левая' : 'правая' }}</td>
              <td class="n">{{ fmt(c.path) }}</td>
              <td class="n">{{ fmt(c.depth) }}</td>
              <td class="n">—</td>
              <td class="n">—</td>
              <td class="n" title="Угол между лучом и нормалью к кромке. 0° — луч падает на кромку перпендикулярно">
                {{ fmt(c.angleToNormal) }}° к нормали
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul v-if="r.warnings.length" class="warns">
        <li v-for="w in r.warnings" :key="w">{{ w }}</li>
      </ul>
    </article>
    <p v-if="!results.length" class="empty">Добавьте ПЭП на панели слева.</p>
  </div>
</template>
