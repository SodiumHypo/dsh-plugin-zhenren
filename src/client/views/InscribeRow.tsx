/**
 * 刻辞 card (CLAUDE.md §4.8, §5.5).
 *
 * The inscription is reconstructed from the persisted slot list, so a card
 * replayed from the session log carves exactly what was carved the first time.
 * Characters outside the corpus appear as `□` and as a shallow 空刻 pit.
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { parseInscribeMeta, type InscribePresentationMeta, type MetaGlyph } from '../../contract.js'
import { drawCarvedGlyph, drawGlyphGhost, drawPlaceholder } from '../render/carve.js'
import { drawOmen } from '../render/cracks.js'
import { drawShell } from '../render/shell.js'
import { carveFrame, carveTotalMs } from '../render/timeline.js'
import type { GlyphSource } from '../render/glyph-source.js'
import { ORACLE_FONT_FAMILY, loadOracleFont } from '../font.js'
import { loadGlyphImages } from '../glyph-images.js'
import { RitualCanvas, type CanvasDraw } from './RitualCanvas.js'
import { resultFailed, resultText } from './result.js'
import * as styles from './styles.js'

type InscribeRowProps = ToolCallViewProps & PropsLocale<'zhenren'>

/** `pending` holds the animation until the font can actually draw the glyphs. */
type FontState = 'pending' | 'ok' | 'missing'

/** Marker for a slot the corpus cannot fill; the pit on the shell says the same. */
const PLACEHOLDER = '□'

/** Pick the rendering branch for a found slot (D17); null when it has no glyph. */
function sourceOf(glyph: MetaGlyph): GlyphSource | null {
  if (glyph.glyphChar === null) return null
  return glyph.glyphSource === 'image'
    ? { kind: 'image', char: glyph.glyphChar }
    : { kind: 'font', char: glyph.glyphChar, fontFamily: ORACLE_FONT_FAMILY }
}

function MessageCard(props: {
  t: InscribeRowProps['t']
  message: string
  state: 'preparing' | 'waiting' | 'error'
}): ReactElement {
  return (
    <div style={styles.cardStyle} data-tool="zhenren_inscribe" data-state={props.state}>
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{props.t('inscribe.title')}</span>
      </div>
      <div style={{ ...styles.bodyStyle, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {props.message}
      </div>
    </div>
  )
}

/**
 * Render one `zhenren_inscribe` call.
 * @param props - keyed toolview payload plus the zhenren locale seat.
 */
export function InscribeRow(props: InscribeRowProps): ReactElement {
  if (props.phase === 'preparing') {
    return <MessageCard t={props.t} message={props.t('inscribe.preparing')} state="preparing" />
  }
  if (props.phase === 'start') {
    return <MessageCard t={props.t} message={props.t('inscribe.preparing')} state="waiting" />
  }

  const meta = parseInscribeMeta(props.block.meta)
  if (resultFailed(props.block)) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('inscribe.empty')} state="error" />
  }
  if (meta === null) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('inscribe.empty')} state="error" />
  }
  if (!meta.ok) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('inscribe.empty')} state="error" />
  }
  return <InscribeCard meta={meta} t={props.t} />
}

function InscribeCard(props: { meta: InscribePresentationMeta; t: InscribeRowProps['t'] }): ReactElement {
  const { meta, t } = props
  const [replayKey, setReplayKey] = useState(0)
  const [instant, setInstant] = useState(false)
  const [fontState, setFontState] = useState<FontState>('pending')
  const [imagesReady, setImagesReady] = useState(false)

  useEffect(() => {
    let alive = true
    loadOracleFont().then(
      (ok) => {
        if (alive) setFontState(ok ? 'ok' : 'missing')
      },
      () => {
        if (alive) setFontState('missing')
      },
    )
    return () => {
      alive = false
    }
  }, [])

  // Only the image glyphs this card actually carves need decoding (D17).
  const imageChars = useMemo(
    () =>
      meta.glyphs.flatMap((glyph) =>
        glyph.found && glyph.glyphSource === 'image' && glyph.glyphChar !== null
          ? [glyph.glyphChar]
          : [],
      ),
    [meta.glyphs],
  )

  useEffect(() => {
    let alive = true
    loadGlyphImages(imageChars).then(
      () => {
        if (alive) setImagesReady(true)
      },
      () => {
        if (alive) setImagesReady(true)
      },
    )
    return () => {
      alive = false
    }
  }, [imageChars])

  const steps = useMemo(
    () => new Map(meta.carve.chars.map((step) => [step.slot, step] as const)),
    [meta.carve.chars],
  )
  const slots = useMemo(
    () => new Map(meta.layout.slots.map((slot) => [slot.index, slot] as const)),
    [meta.layout.slots],
  )

  const draw = useCallback<CanvasDraw>(
    (ctx, width, height, elapsedMs) => {
      drawShell(ctx, width, height, `shell-${meta.burnSeed}`)
      if (meta.cracks !== null) {
        // The omen is complete by the time the inscription is carved.
        drawOmen(ctx, meta.cracks, width, height, { heat: 0.12, crack: 1 }, meta.burnSeed)
      }
      if (fontState !== 'ok' || !imagesReady) return

      const progress = carveFrame(meta.carve.chars, elapsedMs)
      const unit = Math.min(width, height)
      // The whole inscription is faintly legible before the first stroke; the
      // chisel then darkens each slot in turn.
      for (const glyph of meta.glyphs) {
        if (!glyph.found) continue
        const source = sourceOf(glyph)
        const slot = slots.get(glyph.slot)
        if (source === null || slot === undefined) continue
        drawGlyphGhost(ctx, {
          source,
          x: slot.x * width,
          y: slot.y * height,
          size: slot.size * unit,
        })
      }
      for (const glyph of meta.glyphs) {
        const slot = slots.get(glyph.slot)
        if (slot === undefined) continue
        const step = steps.get(glyph.slot)
        const revealed = progress.get(glyph.slot) ?? 0
        const x = slot.x * width
        const y = slot.y * height
        const size = slot.size * unit
        if (glyph.placeholder || glyph.glyphChar === null) {
          drawPlaceholder(ctx, x, y, size, revealed, step?.maskSeed ?? glyph.slot)
          continue
        }
        const source = sourceOf(glyph)
        if (source === null) continue
        drawCarvedGlyph(ctx, {
          source,
          x,
          y,
          size,
          progress: revealed,
          pressure: step?.pressure ?? 0.8,
          maskSeed: step?.maskSeed ?? glyph.slot,
        })
      }
    },
    [meta, fontState, imagesReady, slots, steps],
  )

  const durationMs = Math.max(500, carveTotalMs(meta.carve.chars))
  const animatable = meta.animation === 'full'
  const transcription = meta.glyphs.map((glyph) => (glyph.found ? glyph.char : PLACEHOLDER)).join('')
  const hasPlaceholders = meta.glyphs.some((glyph) => glyph.placeholder)

  return (
    <div style={styles.cardStyle} data-tool="zhenren_inscribe" data-state="ok">
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{t('inscribe.title')}</span>
        <span style={styles.spacerStyle} />
        {meta.auspice !== null ? (
          <span style={styles.auspiceChipStyle(meta.auspice)}>
            {t('burn.auspice')} · {meta.auspice}
          </span>
        ) : null}
      </div>
      <div style={styles.bodyStyle}>
        <div style={styles.canvasFrameStyle}>
          <RitualCanvas
            draw={draw}
            durationMs={durationMs}
            animate={animatable && !instant && fontState === 'ok' && imagesReady}
            replayKey={replayKey}
            label={`${t('inscribe.title')}：${transcription}`}
          />
        </div>
        <div style={styles.transcriptionStyle}>{transcription}</div>
        {hasPlaceholders ? (
          <div style={styles.noteStyle}>
            {t('inscribe.missing')}：{PLACEHOLDER}（{t('inscribe.placeholder')}）
          </div>
        ) : null}
        {fontState === 'missing' ? (
          <div style={styles.noteStyle}>{t('card.fontMissing')}</div>
        ) : null}
      </div>
      {meta.showShuowen && meta.highlightGlosses.length > 0 ? (
        <div>
          {meta.highlightGlosses.map((gloss) => (
            <div key={`${gloss.char}:${gloss.original}`} style={styles.glossStyle}>
              <div style={styles.glossHeadStyle}>{gloss.char}</div>
              <div style={styles.glossOriginalStyle}>
                {t('gloss.title')}：{gloss.original}
              </div>
              {gloss.vernacular !== '' ? (
                <div style={styles.glossMetaStyle}>
                  {t('gloss.vernacular')}：{gloss.vernacular}
                </div>
              ) : null}
              {gloss.correction !== null ? (
                <div style={styles.glossMetaStyle}>
                  {t('gloss.correction')}：{gloss.correction}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div style={styles.footerStyle}>
        <span style={styles.attributionStyle}>
          <div>{t('card.boundary')}</div>
          {meta.supportedCount > 0 ? <div>{t('card.corpus', { n: meta.supportedCount })}</div> : null}
        </span>
        {animatable ? (
          <>
            <button
              type="button"
              style={styles.buttonStyle}
              onClick={() => {
                setInstant(true)
              }}
            >
              {t('card.skip')}
            </button>
            <button
              type="button"
              style={styles.buttonStyle}
              onClick={() => {
                setInstant(false)
                setReplayKey((key) => key + 1)
              }}
            >
              {t('card.replay')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
