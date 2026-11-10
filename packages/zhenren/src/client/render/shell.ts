/**
 * Procedural plastron surface (CLAUDE.md §5.6).
 *
 * The texture is deterministic from `shellSeed` and cached offscreen: it is
 * drawn once per size and blitted every frame instead of regenerating hundreds
 * of pores at 60 fps.
 */
import { createRng } from '../../shared/rng.js'

const BASE_LIGHT = '#f2e8d4'
const BASE_DARK = '#d8c5a4'
const GROWTH_INK = 'rgba(142, 118, 82, 0.14)'
const PORE_INK = 'rgba(94, 74, 50, 0.10)'
const VIGNETTE_INK = 'rgba(104, 82, 52, 0.30)'

interface CachedTexture {
  key: string
  canvas: HTMLCanvasElement
}

let cache: CachedTexture | null = null

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function paintTexture(width: number, height: number, shellSeed: string): HTMLCanvasElement | null {
  const canvas = createCanvas(width, height)
  if (canvas === null) return null
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null

  const rng = createRng(`shell:${shellSeed}`)

  const base = ctx.createLinearGradient(0, 0, width, height)
  base.addColorStop(0, BASE_LIGHT)
  base.addColorStop(0.55, '#e6d8bf')
  base.addColorStop(1, BASE_DARK)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  // Growth lines: long, shallow arcs that follow the shell's curvature.
  const lineCount = 18 + rng.int(0, 10)
  ctx.lineWidth = Math.max(0.6, width * 0.0016)
  ctx.strokeStyle = GROWTH_INK
  for (let index = 0; index < lineCount; index++) {
    const y0 = rng.range(height * 0.04, height * 0.96)
    const bow = rng.range(-0.16, 0.16) * height
    ctx.beginPath()
    ctx.moveTo(-width * 0.05, y0)
    ctx.bezierCurveTo(
      width * 0.3,
      y0 + bow,
      width * 0.7,
      y0 - bow * 0.6,
      width * 1.05,
      y0 + rng.range(-height * 0.03, height * 0.03),
    )
    ctx.stroke()
  }

  // Pores: clustered, not uniformly scattered.
  const clusters = 6 + rng.int(0, 4)
  for (let cluster = 0; cluster < clusters; cluster++) {
    const cx = rng.range(0, width)
    const cy = rng.range(0, height)
    const spread = rng.range(width * 0.04, width * 0.16)
    const pores = 12 + rng.int(0, 18)
    ctx.fillStyle = PORE_INK
    for (let index = 0; index < pores; index++) {
      const angle = rng.range(0, Math.PI * 2)
      const distance = rng.range(0, spread)
      const radius = Math.max(0.6, width * rng.range(0.0008, 0.0028))
      ctx.beginPath()
      ctx.arc(
        cx + Math.cos(angle) * distance,
        cy + Math.sin(angle) * distance * 0.7,
        radius,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
  }

  // Vignette: the shell darkens toward its rim.
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.46,
    Math.min(width, height) * 0.24,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.74,
  )
  vignette.addColorStop(0, 'rgba(104, 82, 52, 0)')
  vignette.addColorStop(0.78, 'rgba(104, 82, 52, 0.10)')
  vignette.addColorStop(1, VIGNETTE_INK)
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)

  return canvas
}

/**
 * Paint the shell surface into `ctx`.
 * Falls back to a flat fill when canvases are unavailable (tests, SSR).
 */
export function drawShell(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shellSeed: string,
): void {
  const key = `${Math.round(width)}x${Math.round(height)}:${shellSeed}`
  if (cache === null || cache.key !== key) {
    const canvas = paintTexture(width, height, shellSeed)
    cache = canvas === null ? null : { key, canvas }
  }
  if (cache !== null) {
    ctx.drawImage(cache.canvas, 0, 0, width, height)
    return
  }
  ctx.fillStyle = BASE_LIGHT
  ctx.fillRect(0, 0, width, height)
}

/** Drop the cached texture (tests, or a theme change). */
export function clearShellCache(): void {
  cache = null
}
