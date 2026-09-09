import type { View } from '../../platform/canvas/geometry'

export function drawGrid(grid: HTMLCanvasElement, stage: HTMLDivElement, view: View): void {
  const dpr = window.devicePixelRatio || 1
  const width = stage.clientWidth, height = stage.clientHeight
  const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr)
  if (grid.width !== pixelWidth || grid.height !== pixelHeight) {
    grid.width = pixelWidth
    grid.height = pixelHeight
  }
  grid.style.width = `${width}px`
  grid.style.height = `${height}px`
  const context = grid.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  const css = getComputedStyle(document.documentElement)
  const { x, y, k } = view
  const step = 24 * k
  if (step < 6) return
  const draw = (spacing: number, color: string) => {
    context.strokeStyle = color
    context.lineWidth = 1
    context.beginPath()
    for (let px = ((x % spacing) + spacing) % spacing; px < width; px += spacing) {
      context.moveTo(Math.round(px) + 0.5, 0)
      context.lineTo(Math.round(px) + 0.5, height)
    }
    for (let py = ((y % spacing) + spacing) % spacing; py < height; py += spacing) {
      context.moveTo(0, Math.round(py) + 0.5)
      context.lineTo(width, Math.round(py) + 0.5)
    }
    context.stroke()
  }
  draw(step, css.getPropertyValue('--grid').trim())
  if (step * 5 > 40) draw(step * 5, css.getPropertyValue('--grid-strong').trim())
}
