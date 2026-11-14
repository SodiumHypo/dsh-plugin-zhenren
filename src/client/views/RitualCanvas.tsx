/**
 * Canvas host for one card (CLAUDE.md §5.7, §5.8).
 *
 * Owns device-pixel sizing, the animation clock, and pause boundaries:
 * off-screen or hidden cards stop their RAF loop and resume where they left
 * off. Reduced motion and `animation: off` render the final frame immediately.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'

/** Draw one frame in CSS pixels. `elapsedMs` may exceed the duration. */
export type CanvasDraw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
) => void

export interface RitualCanvasProps {
  draw: CanvasDraw
  durationMs: number
  /** False renders the final frame only. */
  animate: boolean
  /** Change to restart the timeline from 0. */
  replayKey: number
  /** Accessible description of what the canvas shows. */
  label: string
  /** Internal width cap; keeps high-density screens from overdrawing. */
  maxWidthPx?: number
}

const DEFAULT_MAX_WIDTH = 1280

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animated canvas that fills its parent.
 * @returns a `<canvas>` sized to the parent, or nothing when 2D is unavailable.
 */
export function RitualCanvas(props: RitualCanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef<CanvasDraw>(props.draw)
  drawRef.current = props.draw

  const [size, setSize] = useState({ width: 0, height: 0 })
  // Start hidden: the first intersection report decides when the clock may
  // run. Initializing to `true` lets a card that mounts below the fold burn
  // its whole timeline before the viewer ever sees it.
  const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === 'undefined')
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )
  const elapsedRef = useRef(0)
  const { replayKey } = props

  // A replay restarts the clock; size changes must not.
  useEffect(() => {
    elapsedRef.current = 0
  }, [replayKey])

  useEffect(() => {
    const host = hostRef.current
    if (host === null || typeof ResizeObserver === 'undefined') return
    const measure = (width: number, height: number): void => {
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      )
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      measure(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(host)
    const rect = host.getBoundingClientRect()
    measure(rect.width, rect.height)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const host = hostRef.current
    if (host === null) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) setOnScreen(entry.isIntersecting)
    }, { threshold: 0.05 })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onChange = (): void => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const { width, height } = size
  const { animate, durationMs, maxWidthPx = DEFAULT_MAX_WIDTH } = props

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || width <= 0 || height <= 0) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return

    const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    const scale = Math.min(ratio, maxWidthPx / width)
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    ctx.setTransform(scale, 0, 0, scale, 0, 0)

    const paint = (elapsedMs: number): void => {
      ctx.clearRect(0, 0, width, height)
      drawRef.current(ctx, width, height, elapsedMs)
    }

    if (!animate || prefersReducedMotion()) {
      paint(durationMs)
      return
    }
    if (!onScreen || !pageVisible) {
      // Paused before or during the ritual: hold the frame the viewer last
      // reached. A card that has never been visible stays at frame zero
      // instead of being pre-drawn to its final state.
      paint(Math.min(elapsedRef.current, durationMs))
      return
    }

    let frame = 0
    const start = performance.now() - elapsedRef.current
    const tick = (now: number): void => {
      elapsedRef.current = now - start
      if (elapsedRef.current >= durationMs) {
        paint(durationMs)
        frame = 0
        return
      }
      paint(elapsedRef.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [width, height, animate, durationMs, replayKey, onScreen, pageVisible, maxWidthPx])

  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={props.label}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
