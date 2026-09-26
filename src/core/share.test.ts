import { describe, expect, it } from 'vitest'
import { defaultScheme } from './defaults'
import { decodeScheme, encodeScheme } from './share'

describe('схема в ссылке', () => {
  it('кодируется и раскодируется без потерь (кроме id)', async () => {
    const s = defaultScheme()
    s.weld.type = 'C'
    s.weld.widthTop = 25.5
    s.probes[1].visible = false
    s.probes[2].name = 'ПЭП «Вадима»'
    const code = await encodeScheme(s)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = await decodeScheme(code)
    const strip = (x: typeof s) => ({ ...x, probes: x.probes.map(({ id: _id, ...p }) => p) })
    expect(strip(back)).toEqual(strip(s))
  })

  it('короткая, чтобы QR оставался читаемым', async () => {
    expect((await encodeScheme(defaultScheme())).length).toBeLessThan(400)
  })

  it('старые ссылки без ширин шва открываются', async () => {
    const old = await decodeScheme(
      'Zc0xCsMwEETRu4zbQeysvEpcplhXqVK4ETqbr-QjBUQIgVTTPOZ3sbs2qg12HGA1OlWC_lmVGOwd1ykQTzCM3kqliCWtmhIU3anK-XKdDuIFrkG3cp_S97an_cn6le02o1iUW8bjV47xBg',
    )
    expect(old.weld.type).toBe('V')
    expect(old.weld.widthTop).toBe(22)
    expect(old.probes[2].s).toBe(67.5)
  })

  it('мусор в ссылке даёт ошибку, а не падение приложения', async () => {
    await expect(decodeScheme('не-схема')).rejects.toThrow()
  })
})
