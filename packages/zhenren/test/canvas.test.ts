/**
 * Canvas geometry tests (CLAUDE.md §5.3, §5.7).
 *
 * The spec stores normalized coordinates; the renderer must scale them to the
 * canvas size. A regression here is invisible to the DOM tests and produces a
 * blank shell, so the drawn coordinates are recorded and checked directly.
 */
import { describe, expect, it } from 'vitest'
import { drawGlyphGhost } from '../src/client/render/carve.js'
import { drawOmenFinal } from '../src/client/render/cracks.js'
import { generateCracks } from '../src/ritual/crack.js'

type Point = [number, number]

function fakeContext(): { ctx: CanvasRenderingContext2D; drawn: Point[]; texts: string[] } {
  const drawn: Point[] = []
  const texts: string[] = []
  const noop = (): void => undefined
  const gradient = { addColorStop: noop }
  const ctx = {
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: (x: number, y: number) => drawn.push([x, y]),
    lineTo: (x: number, y: number) => drawn.push([x, y]),
    quadraticCurveTo: noop,
    arc: noop,
    stroke: noop,
    fill: noop,
    fillText: (text: string) => texts.push(text),
    createRadialGradient: () => gradient,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn, texts }
}

describe('omen rendering', () => {
  it('scales normalized crack points to device pixels', () => {
    const spec = generateCracks({
      seed: 'canvas-scale-test',
      auspice: '吉',
      burnPoint: { x: 0.5, y: 0.4 },
    })
    const { ctx, drawn } = fakeContext()
    drawOmenFinal(ctx, spec, 540, 540, 'canvas-scale-test')

    expect(drawn.length).toBeGreaterThan(10)
    // The old bug drew the whole fissure inside a 1x1 px corner.
    expect(drawn.some(([x, y]) => x > 1 || y > 1)).toBe(true)
    // Every point stays on the shell.
    for (const [x, y] of drawn) {
      expect(x).toBeGreaterThanOrEqual(-1)
      expect(x).toBeLessThanOrEqual(541)
      expect(y).toBeGreaterThanOrEqual(-1)
      expect(y).toBeLessThanOrEqual(541)
    }
  })

  it('keeps the fissure anchored near the burn point', () => {
    const spec = generateCracks({
      seed: 'canvas-anchor-test',
      auspice: '凶',
      burnPoint: { x: 0.3, y: 0.7 },
    })
    const { ctx, drawn } = fakeContext()
    drawOmenFinal(ctx, spec, 500, 500, 'canvas-anchor-test')

    const start = drawn[0] as Point
    // First moveTo is the first sampled point of the main fissure.
    expect(Math.abs(start[0] - 150)).toBeLessThan(30)
    expect(Math.abs(start[1] - 350)).toBeLessThan(30)
  })

  it('lays down a faint guide glyph before the chisel starts', () => {
    const { ctx, texts } = fakeContext()
    drawGlyphGhost(ctx, {
      source: { kind: 'font', char: '雨', fontFamily: 'Oracular' },
      x: 120,
      y: 80,
      size: 40,
    })
    expect(texts).toEqual(['雨'])
  })
})
