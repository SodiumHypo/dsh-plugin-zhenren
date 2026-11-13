/**
 * 字形科普 card (CLAUDE.md §4.13, D21).
 *
 * A single-glyph specimen, not a ritual: no shell, no omen, no animation. It
 * always carries the readable modern character, the 《说文》 gloss (or an honest
 * 「未收此形」), and the evolution text (or 「整理中」), so the card stays useful
 * even when the glyph font fails to load. The glyph itself is drawn through the
 * shared GlyphSource branches (D17): Oracular codepoint or tinted HUST-OBC PNG.
 *
 * When the glyph supports prose inline, a preview row renders the PUA codepoint
 * in `ZhenrenInline` beside its modern-character annotation — the same pairing
 * the model copies into its prose (D21).
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { parseLookupMeta, type LookupPresentationMeta } from '../../contract.js'
import { drawCarvedGlyph } from '../render/carve.js'
import type { GlyphSource } from '../render/glyph-source.js'
import { ORACLE_FONT_FAMILY, loadOracleFont } from '../font.js'
import { getGlyphImage, loadGlyphImages } from '../glyph-images.js'
import { INLINE_FONT_FAMILY } from '../inline-font.js'
import { RitualCanvas, type CanvasDraw } from './RitualCanvas.js'
import { resultFailed, resultText } from './result.js'
import * as styles from './styles.js'

type LookupRowProps = ToolCallViewProps & PropsLocale<'zhenren'>

/** `pending` holds the specimen until the font can actually draw the glyph. */
type FontState = 'pending' | 'ok' | 'missing'

function MessageCard(props: {
  t: LookupRowProps['t']
  message: string
  state: 'preparing' | 'waiting' | 'error'
}): ReactElement {
  return (
    <div style={styles.cardStyle} data-tool="zhenren_lookup" data-state={props.state}>
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{props.t('lookup.title')}</span>
      </div>
      <div style={{ ...styles.bodyStyle, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {props.message}
      </div>
    </div>
  )
}

/** A miss is a valid result, not an error: state the boundary honestly. */
function NotFoundCard(props: {
  meta: LookupPresentationMeta
  t: LookupRowProps['t']
}): ReactElement {
  const { meta, t } = props
  const hint = meta.reason === 'empty-query' ? t('lookup.emptyQuery') : t('lookup.notFoundHint')
  return (
    <div style={styles.cardStyle} data-tool="zhenren_lookup" data-state="ok">
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{t('lookup.title')}</span>
      </div>
      <div style={styles.bodyStyle}>
        <div style={styles.fieldRowStyle}>
          <span style={styles.fieldLabelStyle}>{t('lookup.notFound')}</span>
          <span style={styles.fieldValueStyle}>{meta.query}</span>
        </div>
        <div style={styles.noteStyle}>{hint}</div>
      </div>
      <div style={styles.footerStyle}>
        <span style={styles.attributionStyle}>
          {meta.supportedCount > 0 ? <div>{t('card.corpus', { n: meta.supportedCount })}</div> : null}
        </span>
      </div>
    </div>
  )
}

/**
 * Render one `zhenren_lookup` call.
 * @param props - keyed toolview payload plus the zhenren locale seat.
 */
export function LookupRow(props: LookupRowProps): ReactElement {
  if (props.phase === 'preparing') {
    return <MessageCard t={props.t} message={props.t('lookup.preparing')} state="preparing" />
  }
  if (props.phase === 'start') {
    return <MessageCard t={props.t} message={props.t('lookup.preparing')} state="waiting" />
  }

  const meta = parseLookupMeta(props.block.meta)
  if (resultFailed(props.block)) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('lookup.empty')} state="error" />
  }
  if (meta === null) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('lookup.empty')} state="error" />
  }
  if (!meta.found) {
    return <NotFoundCard meta={meta} t={props.t} />
  }
  return <LookupCard meta={meta} t={props.t} />
}

function LookupCard(props: { meta: LookupPresentationMeta; t: LookupRowProps['t'] }): ReactElement {
  const { meta, t } = props
  // `found` guarantees a glyphChar at runtime; the flat meta type keeps it
  // nullable, so fall back to the query purely to satisfy the type checker.
  const glyphChar = meta.glyphChar ?? meta.query
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

  const imageChars = useMemo(
    () => (meta.glyphSource === 'image' ? [glyphChar] : []),
    [meta.glyphSource, glyphChar],
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

  const source = useMemo<GlyphSource>(
    () =>
      meta.glyphSource === 'image'
        ? { kind: 'image', char: glyphChar }
        : { kind: 'font', char: glyphChar, fontFamily: ORACLE_FONT_FAMILY },
    [meta.glyphSource, glyphChar],
  )
  const maskSeed = glyphChar.codePointAt(0) ?? 0

  const draw = useCallback<CanvasDraw>(
    (ctx, width, height) => {
      if (fontState !== 'ok' || !imagesReady) return
      // A static specimen: the chisel mask is fully revealed (progress 1).
      const size = Math.min(width, height) * 0.74
      drawCarvedGlyph(ctx, {
        source,
        x: width / 2,
        y: height / 2,
        size,
        progress: 1,
        pressure: 0.85,
        maskSeed,
      })
    },
    [source, fontState, imagesReady, maskSeed],
  )

  const ready = fontState === 'ok' && imagesReady
  const imageMissing = meta.glyphSource === 'image' && imagesReady && getGlyphImage(glyphChar) === undefined
  const showFontMissing = fontState === 'missing' || imageMissing

  return (
    <div style={styles.cardStyle} data-tool="zhenren_lookup" data-state="ok">
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{t('lookup.title')}</span>
        <span style={styles.spacerStyle} />
      </div>
      <div style={styles.bodyStyle}>
        <div style={{ ...styles.canvasFrameStyle, maxWidth: 220 }}>
          <RitualCanvas
            draw={draw}
            durationMs={1}
            animate={false}
            // Flipping replayKey on readiness repaints the static final frame
            // once the font/image can draw (RitualCanvas re-runs on replayKey).
            replayKey={ready ? 1 : 0}
            label={`${t('lookup.title')}：${glyphChar}`}
          />
        </div>
        <div style={{ ...styles.transcriptionStyle, textAlign: 'center', letterSpacing: '0.08em' }}>
          {glyphChar}
          {meta.pinyin !== null ? (
            <span style={{ fontSize: 14, letterSpacing: '0.02em' }}> {meta.pinyin}</span>
          ) : null}
        </div>
        {meta.headword !== null && meta.headword !== glyphChar ? (
          <div style={styles.noteStyle}>
            {t('lookup.headword')}：{meta.headword}
          </div>
        ) : null}
        {showFontMissing ? <div style={styles.noteStyle}>{t('card.fontMissing')}</div> : null}
        {meta.inline !== null ? (
          <div style={styles.fieldRowStyle}>
            <span style={styles.fieldLabelStyle}>{t('lookup.inline')}</span>
            <span style={styles.fieldValueStyle}>
              <span style={{ fontFamily: `'${INLINE_FONT_FAMILY}'`, fontSize: 20 }}>{meta.inline}</span>
              （{glyphChar}）
            </span>
          </div>
        ) : (
          <div style={styles.noteStyle}>
            {meta.glyphSource === 'image' ? t('lookup.imageInlineNull') : t('lookup.inlineNull')}
          </div>
        )}
      </div>
      {meta.original !== null ? (
        <div style={styles.glossStyle}>
          <div style={styles.glossOriginalStyle}>
            {t('gloss.title')}：{meta.original}
          </div>
          {meta.vernacular !== null && meta.vernacular !== '' ? (
            <div style={styles.glossMetaStyle}>
              {t('gloss.vernacular')}：{meta.vernacular}
            </div>
          ) : null}
          {meta.correction !== null ? (
            <div style={styles.glossMetaStyle}>
              {t('gloss.correction')}：{meta.correction.text}（{meta.correction.source}）
            </div>
          ) : null}
        </div>
      ) : (
        <div style={styles.noteStyle}>{t('lookup.noGloss')}</div>
      )}
      {meta.evolution !== null ? (
        <div style={styles.glossStyle}>
          <div style={styles.glossHeadStyle}>{t('lookup.evolution')}</div>
          {meta.evolution.stages.map((stage) => (
            <div key={stage.name} style={styles.glossMetaStyle}>
              {stage.name}：{stage.note}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.noteStyle}>{t('lookup.evolutionPending')}</div>
      )}
      <div style={styles.footerStyle}>
        <span style={styles.attributionStyle}>
          {meta.supportedCount > 0 ? <div>{t('card.corpus', { n: meta.supportedCount })}</div> : null}
        </span>
      </div>
    </div>
  )
}