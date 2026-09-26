<script setup lang="ts">
import { geometry, results, scheme } from '../store'
import { LEG_NAMES, SIDE_NAMES, SURFACE_NAMES, describeDefect, fmt, fmtAxis } from '../labels'
import { DEG } from '../core/geometry'
import type { Probe, Side } from '../core/types'
import type { Zone } from '../core/defects'

const innerIncidence = (angle: number, side: Side) => {
  const w = geometry.value.wall[side]
  const v = (w.R / w.r) * Math.sin(angle * DEG)
  return v >= 1 ? null : Math.asin(v) / DEG
}

const defectIndex = (id: string) => scheme.defects.findIndex((d) => d.id === id)
const defectById = (id: string) => scheme.defects.find((d) => d.id === id)!

/** Поставить ПЭП в середину зоны: выбрать тип луча и расстояние */
function aimAt(p: Probe, z: Zone) {
  p.legs = z.legs
  p.s = Math.round(z.best * 10) / 10
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
        <span v-if="innerIncidence(r.probe.angle, r.probe.side) !== null" class="chip">
          на внутренней стенке {{ fmt(innerIncidence(r.probe.angle, r.probe.side)!) }}°
        </span>
      </header>

      <ul class="reach">
        <li class="reach-item">
          <span class="reach-k">Запас хода до валика</span>
          <span class="reach-v">{{ r.frame.clamped ? 'упирается' : fmt(r.clearance) + ' мм' }}</span>
        </li>
        <li v-for="x in r.reach" :key="x.legs" class="reach-item" :class="x.s === null ? 'na' : x.fits ? 'ok' : 'bad'">
          <span class="reach-k">{{ LEG_NAMES[x.legs - 1] }} в ось шва</span>
          <span v-if="x.s === null" class="reach-v">не попасть при {{ r.probe.angle }}°</span>
          <span v-else-if="x.fits" class="reach-v">встать на {{ fmt(x.s) }} мм от оси</span>
          <span v-else class="reach-v">нужно {{ fmt(x.s) }} мм, не встаёт: не хватает {{ fmt(x.shortBy) }} мм</span>
        </li>
      </ul>

      <div v-if="r.zones.length" class="zones">
        <div v-for="dz in r.zones" :key="dz.defectId" class="zone-row">
          <div class="zone-name">
            <b>Д{{ defectIndex(dz.defectId) + 1 }}</b>
            {{ describeDefect(defectById(dz.defectId), geometry.t) }}
            <template v-for="h in r.defectHits.filter((x) => x.defectId === dz.defectId)" :key="h.leg">
              <span class="chip now">сейчас попадает: {{ LEG_NAMES[h.leg - 1] }}, S {{ fmt(h.path) }}, H {{ fmt(h.depth) }}</span>
            </template>
          </div>
          <ul class="reach">
            <li
              v-for="{ legs, zone: z } in dz.zones"
              :key="legs"
              class="reach-item"
              :class="z === null ? 'na' : z.fits ? 'ok' : 'bad'"
            >
              <span class="reach-k">
                {{ LEG_NAMES[legs - 1] }}{{
                  z?.mode === 'body' && defectById(dz.defectId).kind === 'half' ? ', через тело отверстия' : ''
                }}
              </span>
              <span v-if="z === null" class="reach-v">не попасть</span>
              <template v-else>
                <span class="reach-v">
                  {{ fmt(z.from) }}–{{ fmt(z.to) }} мм, центр {{ fmt(z.best) }}
                </span>
                <span class="reach-v">S {{ fmt(z.path) }} · H {{ fmt(z.depth) }}</span>
                <button
                  v-if="z.fits"
                  class="btn mini"
                  :title="`Поставить ${r.probe.name} на ${fmt(z.best)} мм, ${LEG_NAMES[z.legs - 1]}`"
                  @click="aimAt(r.probe, z)"
                >
                  Навести
                </button>
                <span v-else class="reach-v">не встаёт: не хватает {{ fmt(r.frame.sMin - z.best) }} мм</span>
              </template>
            </li>
          </ul>
        </div>
      </div>

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
