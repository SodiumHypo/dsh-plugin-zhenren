/**
 * Ritual determinism and geometry bounds (CLAUDE.md §5.3–§5.5).
 *
 * The host must be a pure function of (seed, auspice, burnPoint): replaying a
 * persisted meta must produce the same omen without the host's memory.
 */
import { describe, expect, it } from 'vitest'
import type { Auspice, CrackSpec, Vec2 } from '../src/contract.js'
import { chooseAuspice } from '../src/ritual/auspice.js'
import { carveDuration, planCarve } from '../src/ritual/carve.js'
import {
  DEFAULT_BOUNDS,
  deriveReading,
  generateCracks,
  pickBurnPoint,
  polylineLength,
} from '../src/ritual/crack.js'
import { computeLayout, MAX_SLOTS } from '../src/ritual/layout.js'
import { createRng, deriveSeed, hashSeed, isSeed } from '../src/shared/rng.js'

const AUSPICES: readonly Auspice[] = ['吉', '凶', '中性']
const BURN_POINT = { x: 0.5, y: 0.42 }

function allPoints(spec: CrackSpec): Vec2[] {
  return [
    ...spec.main.points,
    ...spec.branches.flatMap((branch) => branch.points),
  ]
}

function withinBounds(spec: CrackSpec): boolean {
  const { x, y, w, h } = spec.bounds
  return allPoints(spec).every(
    (point) =>
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      point[0] >= x &&
      point[0] <= x + w &&
      point[1] >= y &&
      point[1] <= y + h,
  )
}

describe('shared PRNG', () => {
  it('replays the same sequence from the same seed', () => {
    const left = createRng('alpha')
    const right = createRng('alpha')
    const other = createRng('beta')
    const leftValues = Array.from({ length: 8 }, () => left.next())
    expect(leftValues).toEqual(Array.from({ length: 8 }, () => right.next()))
    expect(leftValues).not.toEqual(Array.from({ length: 8 }, () => other.next()))
  })

  it('derives independent but stable stage streams', () => {
    expect(deriveSeed('abc', 'crack')).toBe('abc:crack')
    expect(deriveSeed('abc', 'crack')).not.toBe(deriveSeed('abc', 'carve'))
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
  })

  it('accepts replay seeds and rejects everything else', () => {
    expect(isSeed('8f3c9a')).toBe(true)
    expect(isSeed('a-B_c9')).toBe(true)
    expect(isSeed('')).toBe(false)
    expect(isSeed('has space')).toBe(false)
    expect(isSeed('x'.repeat(65))).toBe(false)
  })
})

describe('omen geometry', () => {
  it('is a pure function of seed, auspice and burn point', () => {
    for (const auspice of AUSPICES) {
      const input = { seed: 'seed-42', auspice, burnPoint: BURN_POINT }
      const first = generateCracks(input)
      const second = generateCracks(input)
      expect(second).toEqual(first)
      expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    }
    const alternate = generateCracks({ seed: 'seed-43', auspice: '吉', burnPoint: BURN_POINT })
    expect(alternate).not.toEqual(
      generateCracks({ seed: 'seed-42', auspice: '吉', burnPoint: BURN_POINT }),
    )
  })

  it('keeps every point inside the 甲面 for every auspice', () => {
    for (const auspice of AUSPICES) {
      for (let index = 0; index < 40; index++) {
        const spec = generateCracks({ seed: `s${index}`, auspice, burnPoint: BURN_POINT })
        expect(withinBounds(spec), `${auspice} seed ${index}`).toBe(true)
        expect(spec.bounds).toEqual(DEFAULT_BOUNDS)
        expect(spec.main.points.length).toBeGreaterThanOrEqual(2)
        expect(polylineLength(spec.main.points)).toBeGreaterThan(0)
      }
    }
  })

  it('points 吉 upward and 凶 downward across seeds', () => {
    for (let index = 0; index < 40; index++) {
      for (const [auspice, sign] of [['吉', -1], ['凶', 1]] as const) {
        const points = generateCracks({ seed: `dir${index}`, auspice, burnPoint: BURN_POINT }).main
          .points
        const start = points[0] as Vec2
        const end = points[points.length - 1] as Vec2
        expect(Math.sign(end[1] - start[1]), `${auspice} seed ${index}`).toBe(sign)
      }
    }
  })

  it('encodes the §5.4 branch and glow conventions', () => {
    const expected = {
      吉: { branches: [3, 5], level2: [1, 2], temperature: [0.7, 0.85] },
      中性: { branches: [3, 3], level2: [0, 0], temperature: [0.45, 0.55] },
      凶: { branches: [2, 4], level2: [0, 0], temperature: [0.15, 0.3] },
    } as const
    for (const auspice of AUSPICES) {
      const level1: number[] = []
      const level2: number[] = []
      const temperatures: number[] = []
      for (let index = 0; index < 30; index++) {
        const spec = generateCracks({ seed: `shape${index}`, auspice, burnPoint: BURN_POINT })
        level1.push(spec.branches.filter((branch) => branch.order === 1).length)
        level2.push(spec.branches.filter((branch) => branch.order === 2).length)
        temperatures.push(spec.glow.temperature)
      }
      const range = expected[auspice]
      for (const count of level1) {
        expect(count).toBeGreaterThanOrEqual(range.branches[0])
        expect(count).toBeLessThanOrEqual(range.branches[1])
      }
      for (const count of level2) {
        expect(count).toBeGreaterThanOrEqual(range.level2[0])
        expect(count).toBeLessThanOrEqual(range.level2[1])
      }
      for (const temperature of temperatures) {
        expect(temperature).toBeGreaterThanOrEqual(range.temperature[0])
        expect(temperature).toBeLessThanOrEqual(range.temperature[1])
      }
    }
  })

  it('derives a reading that matches the generated trunk', () => {
    for (const auspice of AUSPICES) {
      const spec = generateCracks({ seed: 'reading', auspice, burnPoint: BURN_POINT })
      const reading = deriveReading(spec)
      const start = spec.main.points[0] as Vec2
      const end = spec.main.points[spec.main.points.length - 1] as Vec2
      const dy = end[1] - start[1]
      const expected = dy < -0.03 ? 'up' : dy > 0.03 ? 'down' : 'level'
      expect(reading.mainDirection).toBe(expected)
      expect(reading.intensity).toBeGreaterThanOrEqual(0)
      expect(reading.intensity).toBeLessThanOrEqual(1)
      expect(['continuous', 'broken', 'symmetric']).toContain(reading.branchPattern)
    }
  })

  it('picks a deterministic burn point and clamps hints to the shell', () => {
    expect(pickBurnPoint('seed-1')).toEqual(pickBurnPoint('seed-1'))
    for (const hint of [{ x: -5, y: 9 }, { x: 0.5, y: 0.5 }, { x: 2, y: -1 }]) {
      const point = pickBurnPoint('seed-1', hint)
      expect(point.x).toBeGreaterThanOrEqual(0.14)
      expect(point.x).toBeLessThanOrEqual(0.86)
      expect(point.y).toBeGreaterThanOrEqual(0.14)
      expect(point.y).toBeLessThanOrEqual(0.86)
    }
  })
})

describe('auspice selection', () => {
  it('is deterministic for a seed and settings pair', () => {
    expect(chooseAuspice('seed-7', '吉', 'balanced')).toBe(
      chooseAuspice('seed-7', '吉', 'balanced'),
    )
  })

  it('shifts, but does not guarantee, the distribution by tone', () => {
    let goodWhenAskedGood = 0
    let goodWhenAskedBad = 0
    for (let index = 0; index < 2000; index++) {
      if (chooseAuspice(`tone${index}`, '吉', 'balanced') === '吉') goodWhenAskedGood += 1
      if (chooseAuspice(`tone${index}`, '凶', 'balanced') === '吉') goodWhenAskedBad += 1
    }
    expect(goodWhenAskedGood).toBeGreaterThan(goodWhenAskedBad)
    expect(goodWhenAskedBad).toBeGreaterThan(0)
  })
})

describe('carving rhythm', () => {
  const slots = [
    { slot: 0, found: true },
    { slot: 1, found: true },
    { slot: 2, found: false },
    { slot: 3, found: true },
  ]

  it('is deterministic and ordered', () => {
    const first = planCarve('seed-9', slots)
    expect(planCarve('seed-9', slots)).toEqual(first)
    expect(first.chars.map((step) => step.slot)).toEqual([0, 1, 2, 3])
    for (let index = 1; index < first.chars.length; index++) {
      const previous = first.chars[index - 1] as (typeof first.chars)[number]
      const current = first.chars[index] as (typeof first.chars)[number]
      expect(current.startMs).toBeGreaterThan(previous.startMs + previous.durationMs)
    }
    for (const step of first.chars) {
      expect(step.durationMs).toBeGreaterThanOrEqual(180)
      expect(step.durationMs).toBeLessThanOrEqual(630)
      expect(step.pressure).toBeGreaterThanOrEqual(0.55)
      expect(step.pressure).toBeLessThanOrEqual(1)
      expect(Number.isInteger(step.maskSeed)).toBe(true)
    }
  })

  it('lets the missing slot linger', () => {
    const plan = planCarve('seed-9', slots)
    const missing = plan.chars[2] as (typeof plan.chars)[number]
    const present = plan.chars[0] as (typeof plan.chars)[number]
    expect(missing.durationMs).toBeGreaterThanOrEqual(270)
    expect(missing.durationMs / 1.5).toBeGreaterThanOrEqual(180)
    expect(present.durationMs).toBeGreaterThanOrEqual(180)
    expect(carveDuration(plan)).toBeGreaterThan(missing.startMs)
  })
})

describe('layout', () => {
  it('rejects counts that cannot be placed', () => {
    expect(computeLayout({ count: 0, bounds: DEFAULT_BOUNDS })).toBeNull()
    expect(computeLayout({ count: MAX_SLOTS + 1, bounds: DEFAULT_BOUNDS })).toBeNull()
  })

  it('fills 48 slots in 4 columns of 12 rows', () => {
    const layout = computeLayout({ count: MAX_SLOTS, bounds: DEFAULT_BOUNDS })
    expect(layout).not.toBeNull()
    if (layout === null) return
    expect(layout.columns).toBe(4)
    expect(layout.rows).toBe(12)
    expect(layout.direction).toBe('rtl')
    expect(layout.slots.length).toBe(MAX_SLOTS)
    for (const slot of layout.slots) {
      expect(slot.x).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.x)
      expect(slot.x).toBeLessThanOrEqual(DEFAULT_BOUNDS.x + DEFAULT_BOUNDS.w)
      expect(slot.y).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.y)
      expect(slot.y).toBeLessThanOrEqual(DEFAULT_BOUNDS.y + DEFAULT_BOUNDS.h)
      expect(slot.size).toBeGreaterThan(0)
    }
  })

  it('fills right-to-left, top-to-bottom', () => {
    const layout = computeLayout({ count: 6, requestedColumns: 3, bounds: DEFAULT_BOUNDS })
    expect(layout).not.toBeNull()
    if (layout === null) return
    const [first, second, third] = layout.slots as [
      (typeof layout.slots)[number],
      (typeof layout.slots)[number],
      (typeof layout.slots)[number],
    ]
    expect(first.column).toBe(0)
    expect(first.row).toBe(0)
    expect(second.row).toBe(1)
    expect(third.column).toBe(1)
    expect(first.x).toBeGreaterThan(third.x)
    expect(first.y).toBeLessThan(second.y)
  })

  it('clamps requested columns to the placeable range', () => {
    const wide = computeLayout({ count: 6, requestedColumns: 99, bounds: DEFAULT_BOUNDS })
    expect(wide?.columns).toBe(4)
    const narrow = computeLayout({ count: 6, requestedColumns: 0, bounds: DEFAULT_BOUNDS })
    expect(narrow?.columns).toBe(1)
  })

  it('shifts the block away from the burn point', () => {
    const left = computeLayout({
      count: 6,
      bounds: DEFAULT_BOUNDS,
      burnPoint: { x: 0.8, y: 0.4 },
    })
    const right = computeLayout({
      count: 6,
      bounds: DEFAULT_BOUNDS,
      burnPoint: { x: 0.2, y: 0.4 },
    })
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    if (left === null || right === null) return
    expect((left.slots[0] as { x: number }).x).toBeLessThan((right.slots[0] as { x: number }).x)
  })

  it('advances left-to-right when the diviner chooses ltr', () => {
    const layout = computeLayout({
      count: 6,
      requestedColumns: 3,
      bounds: DEFAULT_BOUNDS,
      direction: 'ltr',
    })
    expect(layout?.direction).toBe('ltr')
    if (layout === null) return
    const first = layout.slots[0]
    const nextColumn = layout.slots.find((slot) => slot.column === 1)
    expect(first?.x).toBeLessThan(nextColumn?.x ?? 0)
    for (const slot of layout.slots) {
      expect(slot.x).toBeGreaterThanOrEqual(DEFAULT_BOUNDS.x)
      expect(slot.x).toBeLessThanOrEqual(DEFAULT_BOUNDS.x + DEFAULT_BOUNDS.w)
    }
  })
})
