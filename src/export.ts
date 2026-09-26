/** Светлая палитра для экспорта в отчёт; держать в согласии с :root в style.css */
const LIGHT_TOKENS: Record<string, string> = {
  paper: '#FFFFFF',
  panel: '#FFFFFF',
  ink: '#17212B',
  muted: '#5E6B78',
  line: '#C9D2DB',
  steel: '#DCE2E8',
  hatch: '#A3AFBB',
  weld: '#BCC5CE',
  weldh: '#4A5663',
}

export function svgForExport(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = `svg{${Object.entries(LIGHT_TOKENS)
    .map(([k, v]) => `--${k}:${v}`)
    .join(';')}}`
  clone.insertBefore(style, clone.firstChild)
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function svgToPng(svgText: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG не собрался'))), 'image/png')
    }
    img.onerror = () => reject(new Error('SVG не отрисовался'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText)
  })
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
