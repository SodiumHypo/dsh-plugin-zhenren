/**
 * Omen drawing (CLAUDE.md §5.3, §5.8).
 *
 * Pure interpolation: the host already decided the geometry and the auspice.
 * This module never invents a point, never re-rolls randomness, and never
 * changes the number of cracks — it only reveals a fraction of what the spec
 * already contains.
 */
import type { CrackBranch, CrackBreak, CrackPath, CrackSpec, Vec2 } from '../../contract.js'
import { createRng } from '../../shared/rng.js'

const CRACK_INK = 'rgba(44, 33, 23, 0.88)'
const CRACK_INNER = 'rgba(16, 11, 7, 0.55)'
/** Reference width the spec's stroke widths were authored against. */
const WIDTH_REFERENCE = 720

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function cumulative(points: readonly Vec2[]): number[] {
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

function insideBreak(fraction: number, breaks: readonly CrackBreak[]): boolean {
  for (const span of breaks) {
    if (fraction >= span.at && fraction <= span.at + span.length) return true
  }
  return false
}

/**
 * Stroke the revealed part of one polyline, lifting the pen inside breaks.
 * @param reveal fraction of the full path to draw, 0..1.
 * @param scale multiplier converting spec units to device pixels.
 */
function strokePath(
  ctx: CanvasRenderingContext2D,
  points: readonly Vec2[],
  crackWidth: number,
  breaks: readonly CrackBreak[],
  reveal: number,
  width: number,
  height: number,
): void {
  if (reveal <= 0 || points.length < 2) return
  const lengths = cumulative(points)
  const total = lengths[lengths.length - 1] ?? 0
  if (total <= 0) return

  const limit = total * clamp(reveal, 0, 1)
  const stroke = Math.max(0.7, crackWidth * (width / WIDTH_REFERENCE))
  const steps = Math.max(48, points.length * 6)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let penDown = false
  let distance = 0

  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as Vec2
    const to = points[index] as Vec2
    const segment = (lengths[index] as number) - (lengths[index - 1] as number)
    if (segment <= 0) continue
    const substeps = Math.max(1, Math.ceil((segment / total) * steps))
    for (let step = 1; step <= substeps; step++) {
      const travelled = distance + (segment * step) / substeps
      if (travelled > limit) {
        penDown = false
        break
      }
      const local = step / substeps
      // Spec points are normalized to the shell; canvas coordinates are pixels.
      const x = (from[0] + (to[0] - from[0]) * local) * width
      const y = (from[1] + (to[1] - from[1]) * local) * height
      if (insideBreak(travelled / total, breaks)) {
        penDown = false
        continue
      }
      if (penDown) ctx.lineTo(x, y)
      else {
        ctx.moveTo(x, y)
        penDown = true
      }
    }
    distance += segment
    if (distance >= limit) break
  }
  ctx.strokeStyle = CRACK_INK
  ctx.lineWidth = stroke
  ctx.stroke()

  // A narrower darker core reads as depth rather than a painted line.
  ctx.strokeStyle = CRACK_INNER
  ctx.lineWidth = stroke * 0.45
  ctx.stroke()
  ctx.restore()
}

/** Branch reveal is staggered by where it attaches to the trunk. */
function branchReveal(crack: number, branch: CrackBranch): number {
  const start = 0.3 + branch.startT * 0.45
  return clamp((crack - start) / 0.35, 0, 1)
}

function mix(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t)
}

/** Cool grey at temperature 0, ember orange at 1. */
function emberColor(temperature: number, alpha: number): string {
  const t = clamp(temperature, 0, 1)
  return `rgba(${mix(140, 255, t)}, ${mix(140, 168, t)}, ${mix(150, 76, t)}, ${alpha})`
}

export interface OmenPhase {
  /** Heat at the burn point, 0..1. */
  heat: number
  /** Crack growth, 0..1. */
  crack: number
}

/** The burn spot: ember core, halo, and a few wisps of smoke. */
function drawHeat(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: CrackSpec,
  heat: number,
  seed: string,
): void {
  if (heat <= 0.01) return
  const [nx, ny] = spec.main.points[0] as Vec2
  const x = nx * width
  const y = ny * height
  const radius = spec.glow.radius * Math.min(width, height) * 2.4

  const core = ctx.createRadialGradient(x, y, 0, x, y, radius)
  core.addColorStop(0, emberColor(spec.glow.temperature, 0.55 * heat))
  core.addColorStop(0.35, emberColor(spec.glow.temperature, 0.22 * heat))
  core.addColorStop(1, emberColor(spec.glow.temperature, 0))
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()

  // Smoke: fixed geometry, opacity driven by heat.
  const rng = createRng(`smoke:${seed}`)
  ctx.save()
  ctx.strokeStyle = `rgba(110, 102, 92, ${0.16 * heat})`
  ctx.lineWidth = Math.max(0.8, width * 0.002)
  for (let index = 0; index < 9; index++) {
    const spread = rng.range(-0.5, 0.5)
    const rise = rng.range(0.1, 0.28) * height * (0.4 + heat * 0.6)
    const bend = rng.range(-0.06, 0.06) * width
    ctx.beginPath()
    ctx.moveTo(x + spread * width * 0.02, y)
    ctx.quadraticCurveTo(
      x + spread * width * 0.06 + bend,
      y - rise * 0.5,
      x + spread * width * 0.1 + bend,
      y - rise,
    )
    ctx.stroke()
  }
  ctx.restore()
}

/** Draw shell blemish left by the burn: a dark rim once the heat fades. */
function drawScorch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: CrackSpec,
  heat: number,
): void {
  if (heat >= 0.98) return
  const [nx, ny] = spec.main.points[0] as Vec2
  const x = nx * width
  const y = ny * height
  const radius = spec.glow.radius * Math.min(width, height) * 1.6
  const strength = clamp(1 - heat, 0, 1)
  const scorch = ctx.createRadialGradient(x, y, 0, x, y, radius)
  scorch.addColorStop(0, `rgba(72, 48, 28, ${0.34 * strength})`)
  scorch.addColorStop(0.6, `rgba(88, 62, 36, ${0.18 * strength})`)
  scorch.addColorStop(1, 'rgba(88, 62, 36, 0)')
  ctx.fillStyle = scorch
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draw one frame of the omen.
 * @param phase heat and crack progress derived from the card timeline.
 */
export function drawOmen(
  ctx: CanvasRenderingContext2D,
  spec: CrackSpec,
  width: number,
  height: number,
  phase: OmenPhase,
  seed: string,
): void {
  drawScorch(ctx, width, height, spec, phase.heat)
  drawHeat(ctx, width, height, spec, phase.heat, seed)

  const mainReveal = clamp(phase.crack / 0.6, 0, 1)
  strokePath(ctx, spec.main.points, spec.main.width, spec.main.breaks, mainReveal, width, height)

  for (const branch of spec.branches) {
    const reveal = branch.order === 2 ? branchReveal(phase.crack * 0.85, branch) : branchReveal(phase.crack, branch)
    strokePath(ctx, branch.points, branch.width, branch.breaks, reveal, width, height)
  }
}

/** Final frame: no heat, complete cracks. Used for reduced motion and replay end. */
export function drawOmenFinal(
  ctx: CanvasRenderingContext2D,
  spec: CrackSpec,
  width: number,
  height: number,
  seed: string,
): void {
  drawOmen(ctx, spec, width, height, { heat: 0.18, crack: 1 }, seed)
}

/** Exposed for tests: total normalized length of the main fissure. */
export function mainLength(path: CrackPath): number {
  const lengths = cumulative(path.points)
  return lengths[lengths.length - 1] ?? 0
}
