/**
 * Deterministic omen geometry (CLAUDE.md §5.3, §5.4).
 *
 * The host owns this generator; the client only interpolates. Same seed, same
 * auspice, same burn point → identical `CrackSpec`, which is what makes the
 * persisted `presentationMeta` replayable.
 *
 * The auspice→shape mapping here is an ARTISTIC CONVENTION, not an
 * archaeological reconstruction. It is documented as such in the about card.
 */
import type {
  Auspice,
  CrackBranch,
  CrackBreak,
  CrackPath,
  CrackSpec,
  OmenReading,
  Rect,
  Vec2,
} from '../contract.js'
import { createRng, deriveSeed, type Rng } from '../shared/rng.js'

const DEG = Math.PI / 180

/** Default甲面 bounds; leaves an 8% margin on every side. */
export const DEFAULT_BOUNDS: Rect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }

/** Visually plausible burn points on the plastron. Picked by seed. */
const BURN_POINT_PRESETS: readonly { x: number; y: number }[] = [
  { x: 0.42, y: 0.34 },
  { x: 0.58, y: 0.34 },
  { x: 0.5, y: 0.42 },
  { x: 0.38, y: 0.48 },
  { x: 0.62, y: 0.48 },
]

interface Profile {
  /** Main crack direction, degrees, y grows downward. */
  angle: [number, number]
  /** Fraction of the shell's short side. */
  length: [number, number]
  breaks: [number, number]
  breakLength: [number, number]
  branches: [number, number]
  level2: [number, number]
  branchLength: [number, number]
  /** Absolute direction the branch fan is centred on, degrees. */
  branchAngle: number
  branchSpread: number
  temperature: [number, number]
}

/** §5.4 table, encoded once. */
const PROFILES: Record<Auspice, Profile> = {
  吉: {
    angle: [-75, -45],
    length: [0.55, 0.75],
    breaks: [0, 1],
    breakLength: [0.015, 0.035],
    branches: [3, 5],
    level2: [1, 2],
    branchLength: [0.35, 0.5],
    branchAngle: -90,
    branchSpread: 60,
    temperature: [0.7, 0.85],
  },
  中性: {
    angle: [-15, 15],
    length: [0.45, 0.6],
    breaks: [1, 2],
    breakLength: [0.025, 0.05],
    branches: [3, 3],
    level2: [0, 0],
    branchLength: [0.2, 0.35],
    branchAngle: 0,
    branchSpread: 20,
    temperature: [0.45, 0.55],
  },
  凶: {
    angle: [45, 75],
    length: [0.35, 0.5],
    breaks: [2, 3],
    breakLength: [0.045, 0.08],
    branches: [2, 4],
    level2: [0, 0],
    branchLength: [0.1, 0.2],
    branchAngle: 90,
    branchSpread: 55,
    temperature: [0.15, 0.3],
  },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clampPoint(point: Vec2, bounds: Rect): Vec2 {
  return [
    clamp(point[0], bounds.x, bounds.x + bounds.w),
    clamp(point[1], bounds.y, bounds.y + bounds.h),
  ]
}

function inside(point: Vec2, bounds: Rect): boolean {
  return (
    point[0] >= bounds.x &&
    point[0] <= bounds.x + bounds.w &&
    point[1] >= bounds.y &&
    point[1] <= bounds.y + bounds.h
  )
}

/** Distance from `origin` to the bounds edge along `angleRad`, in unit space. */
function rayDistance(origin: Vec2, angleRad: number, bounds: Rect): number {
  const dx = Math.cos(angleRad)
  const dy = Math.sin(angleRad)
  const maxX = bounds.x + bounds.w
  const maxY = bounds.y + bounds.h
  let distance = Number.POSITIVE_INFINITY
  if (dx > 1e-6) distance = Math.min(distance, (maxX - origin[0]) / dx)
  else if (dx < -1e-6) distance = Math.min(distance, (bounds.x - origin[0]) / dx)
  if (dy > 1e-6) distance = Math.min(distance, (maxY - origin[1]) / dy)
  else if (dy < -1e-6) distance = Math.min(distance, (bounds.y - origin[1]) / dy)
  return Number.isFinite(distance) ? Math.max(0, distance) : 0
}

/** Cumulative arc lengths; `lengths[i]` is the distance up to point `i`. */
function cumulativeLengths(points: Vec2[]): number[] {
  const lengths = [0]
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1] as Vec2
    const current = points[index] as Vec2
    lengths.push(
      (lengths[index - 1] as number) +
        Math.hypot(current[0] - previous[0], current[1] - previous[1]),
    )
  }
  return lengths
}

/** Total polyline length. */
export function polylineLength(points: Vec2[]): number {
  const lengths = cumulativeLengths(points)
  return lengths[lengths.length - 1] ?? 0
}

/** Point and tangent at fraction `t` of the polyline. */
export function samplePath(
  points: Vec2[],
  t: number,
): { point: Vec2; angle: number } {
  const lengths = cumulativeLengths(points)
  const total = lengths[lengths.length - 1] ?? 0
  if (total === 0) {
    const only = points[0] ?? ([0, 0] as Vec2)
    return { point: [only[0], only[1]], angle: 0 }
  }
  const target = clamp(t, 0, 1) * total
  for (let index = 1; index < points.length; index++) {
    const end = lengths[index] as number
    if (target <= end) {
      const start = lengths[index - 1] as number
      const span = end - start
      const local = span === 0 ? 0 : (target - start) / span
      const a = points[index - 1] as Vec2
      const b = points[index] as Vec2
      return {
        point: [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local],
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      }
    }
  }
  const last = points[points.length - 1] as Vec2
  const previous = points[points.length - 2] as Vec2 | undefined
  return {
    point: [last[0], last[1]],
    angle: previous === undefined ? 0 : Math.atan2(last[1] - previous[1], last[0] - previous[0]),
  }
}

/**
 * Grow one polyline: straight-ish steps with perpendicular jitter.
 * Stops at the甲面 edge instead of piling points on the boundary.
 */
function growPath(
  rng: Rng,
  start: Vec2,
  angleDeg: number,
  length: number,
  segments: number,
  bounds: Rect,
): Vec2[] {
  const baseAngle = angleDeg * DEG
  let angle = baseAngle
  const step = length / segments
  const points: Vec2[] = [clampPoint(start, bounds)]
  let current = points[0] as Vec2
  for (let index = 1; index <= segments; index++) {
    angle = clamp(angle + rng.range(-0.04, 0.04), baseAngle - 0.3, baseAngle + 0.3)
    const jitter = rng.range(-1, 1) * rng.range(0.004, 0.012) * (1 - (index / segments) * 0.4)
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    const next: Vec2 = [
      current[0] + nx * step - ny * jitter,
      current[1] + ny * step + nx * jitter,
    ]
    if (!inside(next, bounds)) {
      points.push(clampPoint(next, bounds))
      break
    }
    points.push(next)
    current = next
  }
  return points
}

/** Breaks distributed along the path with jitter, sorted by position. */
function makeBreaks(
  rng: Rng,
  count: number,
  lengthRange: [number, number],
): CrackBreak[] {
  const breaks: CrackBreak[] = []
  for (let index = 0; index < count; index++) {
    const slot = (index + rng.range(0.2, 0.8)) / Math.max(1, count)
    breaks.push({
      at: round(clamp(0.18 + slot * 0.62, 0.1, 0.9), 3),
      length: round(rng.range(lengthRange[0], lengthRange[1]), 3),
    })
  }
  return breaks.sort((left, right) => left.at - right.at)
}

/** Pick the burn point: a preset, or the model's hint clamped to the shell. */
export function pickBurnPoint(
  seed: string,
  hint?: { x: number; y: number },
  bounds: Rect = DEFAULT_BOUNDS,
): { x: number; y: number } {
  const rng = createRng(deriveSeed(seed, 'burn-point'))
  const preset =
    hint ?? (BURN_POINT_PRESETS[rng.int(0, BURN_POINT_PRESETS.length - 1)] as { x: number; y: number })
  const inset: Rect = {
    x: bounds.x + 0.06,
    y: bounds.y + 0.06,
    w: Math.max(0.01, bounds.w - 0.12),
    h: Math.max(0.01, bounds.h - 0.12),
  }
  const point = clampPoint([preset.x, preset.y], inset)
  return { x: round(point[0], 3), y: round(point[1], 3) }
}

export interface GenerateCracksInput {
  seed: string
  auspice: Auspice
  burnPoint: { x: number; y: number }
  bounds?: Rect
}

/** Generate the complete, replayable omen. Pure function of its input. */
export function generateCracks(input: GenerateCracksInput): CrackSpec {
  const bounds = input.bounds ?? DEFAULT_BOUNDS
  const profile = PROFILES[input.auspice]
  const rng = createRng(deriveSeed(input.seed, 'crack'))

  const origin = clampPoint([input.burnPoint.x, input.burnPoint.y], bounds)
  const mainAngle = rng.range(profile.angle[0], profile.angle[1])
  const shortSide = Math.min(bounds.w, bounds.h)
  const desiredLength = rng.range(profile.length[0], profile.length[1]) * shortSide
  const available = rayDistance(origin, mainAngle * DEG, bounds)
  const mainLength = Math.max(0.04, Math.min(desiredLength, available * 0.92))
  const main: CrackPath = {
    points: growPath(rng, origin, mainAngle, mainLength, rng.int(10, 24), bounds).map(
      (point) => [round(point[0], 3), round(point[1], 3)] as Vec2,
    ),
    width: round(rng.range(1.8, 2.6), 2),
    breaks: makeBreaks(rng, rng.int(profile.breaks[0], profile.breaks[1]), profile.breakLength),
  }

  const branchCount = rng.int(profile.branches[0], profile.branches[1])
  const level1: CrackBranch[] = []
  const branches: CrackBranch[] = []

  for (let index = 0; index < branchCount; index++) {
    const startT = round(
      clamp(0.14 + (0.64 * (index + rng.range(0.1, 0.9))) / Math.max(1, branchCount), 0.1, 0.82),
      3,
    )
    const anchor = samplePath(main.points, startT)
    const baseAngle =
      input.auspice === '中性'
        ? (index % 2 === 0 ? 0 : 180) + rng.range(-profile.branchSpread / 2, profile.branchSpread / 2)
        : profile.branchAngle + rng.range(-profile.branchSpread, profile.branchSpread)
    const desired =
      rng.range(profile.branchLength[0], profile.branchLength[1]) *
      shortSide *
      (1 - startT * 0.55)
    const reach = rayDistance(anchor.point, baseAngle * DEG, bounds)
    const length = Math.max(0.02, Math.min(desired, reach * 0.92))
    const raw = growPath(rng, anchor.point, baseAngle, length, rng.int(4, 8), bounds)
    const branch: CrackBranch = {
      order: 1,
      startT,
      points: raw.map((point) => [round(point[0], 3), round(point[1], 3)] as Vec2),
      width: round(rng.range(0.8, 1.6), 2),
      breaks:
        input.auspice === '凶' && rng.chance(0.4)
          ? [{ at: round(rng.range(0.35, 0.7), 3), length: round(rng.range(0.03, 0.05), 3) }]
          : [],
    }
    level1.push(branch)
    branches.push(branch)
  }

  const level2Count = rng.int(profile.level2[0], profile.level2[1])
  for (let index = 0; index < level2Count && level1.length > 0; index++) {
    const parent = rng.pick(level1)
    const startT = round(rng.range(0.35, 0.7), 3)
    const anchor = samplePath(parent.points, startT)
    const angle = anchor.angle / DEG + rng.pick([-1, 1]) * rng.range(35, 70)
    const reach = rayDistance(anchor.point, angle * DEG, bounds)
    const length = Math.max(0.015, Math.min(polylineLength(parent.points) * 0.55, reach * 0.9))
    branches.push({
      order: 2,
      startT,
      points: growPath(rng, anchor.point, angle, length, rng.int(3, 5), bounds).map(
        (point) => [round(point[0], 3), round(point[1], 3)] as Vec2,
      ),
      width: round(parent.width * 0.65, 2),
      breaks: [],
    })
  }

  const glowRadius =
    input.auspice === '吉'
      ? rng.range(0.08, 0.11)
      : input.auspice === '凶'
        ? rng.range(0.05, 0.08)
        : rng.range(0.07, 0.09)

  return {
    version: 1,
    main,
    branches,
    glow: {
      radius: round(glowRadius, 3),
      temperature: round(rng.range(profile.temperature[0], profile.temperature[1]), 2),
      fadeMs: Math.round(rng.range(500, 800)),
    },
    bounds: { ...bounds },
  }
}

/**
 * Derive the wording summary from the geometry actually generated.
 * It is not a second auspice: the burn tool's `auspice` stays authoritative.
 */
export function deriveReading(spec: CrackSpec): OmenReading {
  const first = spec.main.points[0] as Vec2
  const last = spec.main.points[spec.main.points.length - 1] as Vec2
  const dy = last[1] - first[1]
  const mainDirection: OmenReading['mainDirection'] =
    dy < -0.03 ? 'up' : dy > 0.03 ? 'down' : 'level'

  const level1 = spec.branches.filter((branch) => branch.order === 1)
  let sinSum = 0
  let left = 0
  let right = 0
  let counted = 0
  for (const branch of level1) {
    const start = branch.points[0] as Vec2
    const end = branch.points[branch.points.length - 1] as Vec2
    const vx = end[0] - start[0]
    const vy = end[1] - start[1]
    const length = Math.hypot(vx, vy)
    if (length < 1e-6) continue
    sinSum += vy / length
    if (vx > 0.01) right += 1
    else if (vx < -0.01) left += 1
    counted += 1
  }
  const meanSin = counted === 0 ? 0 : sinSum / counted
  const symmetric = Math.abs(meanSin) < 0.35 && left > 0 && right > 0
  const branchPattern: OmenReading['branchPattern'] = symmetric
    ? 'symmetric'
    : spec.main.breaks.length >= 2
      ? 'broken'
      : 'continuous'

  const length = polylineLength(spec.main.points)
  const intensity = clamp(length * 1.1 + level1.length * 0.05 + spec.main.breaks.length * 0.03, 0, 1)

  return {
    mainDirection,
    branchPattern,
    intensity: round(intensity, 2),
  }
}
