/**
 * 灼龟 card (CLAUDE.md §4.8, §5.2).
 *
 * The card is decoration on top of an already-settled result: it never blocks
 * input, never requests data, and falls back to the plain result text when the
 * meta is missing or malformed.
 */
import { useCallback, useState, type ReactElement } from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { parseBurnMeta, type BurnPresentationMeta } from '../../contract.js'
import { drawOmen } from '../render/cracks.js'
import { drawShell } from '../render/shell.js'
import { BURN_TIMELINE, burnFrame } from '../render/timeline.js'
import { RitualCanvas, type CanvasDraw } from './RitualCanvas.js'
import { resultFailed, resultText } from './result.js'
import * as styles from './styles.js'

type BurnRowProps = ToolCallViewProps & PropsLocale<'zhenren'>

/** Static card for text-only stages and fallbacks. */
function MessageCard(props: {
  t: BurnRowProps['t']
  message: string
  state: 'preparing' | 'waiting' | 'error'
}): ReactElement {
  return (
    <div style={styles.cardStyle} data-tool="zhenren_burn" data-state={props.state}>
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{props.t('burn.title')}</span>
      </div>
      <div style={{ ...styles.bodyStyle, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {props.message}
      </div>
    </div>
  )
}

/**
 * Render one `zhenren_burn` call.
 * @param props - keyed toolview payload plus the zhenren locale seat.
 */
export function BurnRow(props: BurnRowProps): ReactElement {
  if (props.phase === 'preparing') {
    return <MessageCard t={props.t} message={props.t('burn.preparing')} state="preparing" />
  }
  if (props.phase === 'start') {
    return <MessageCard t={props.t} message={props.t('burn.waiting')} state="waiting" />
  }

  const meta = parseBurnMeta(props.block.meta)
  if (resultFailed(props.block)) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('burn.noResult')} state="error" />
  }
  if (meta === null) {
    return <MessageCard t={props.t} message={resultText(props.block) ?? props.t('burn.noMeta')} state="error" />
  }
  return <BurnCard meta={meta} t={props.t} />
}

function BurnCard(props: { meta: BurnPresentationMeta; t: BurnRowProps['t'] }): ReactElement {
  const { meta, t } = props
  const [replayKey, setReplayKey] = useState(0)
  const [instant, setInstant] = useState(false)
  const animatable = meta.animation === 'full'

  const draw = useCallback<CanvasDraw>(
    (ctx, width, height, elapsedMs) => {
      drawShell(ctx, width, height, meta.shellSeed)
      const frame = burnFrame(elapsedMs)
      drawOmen(ctx, meta.cracks, width, height, frame, meta.seed)
    },
    [meta],
  )

  return (
    <div style={styles.cardStyle} data-tool="zhenren_burn" data-state="ok">
      <div style={styles.headerStyle}>
        <span style={styles.titleStyle}>{t('burn.title')}</span>
        <span style={styles.spacerStyle} />
        <span style={styles.auspiceChipStyle(meta.auspice)}>
          {t('burn.auspice')} · {meta.auspice}
        </span>
      </div>
      <div style={styles.bodyStyle}>
        <div style={styles.canvasFrameStyle}>
          <RitualCanvas
            draw={draw}
            durationMs={BURN_TIMELINE.totalMs}
            animate={animatable && !instant}
            replayKey={replayKey}
            label={`${t('burn.title')}：${meta.auspice}。${meta.charge}`}
          />
        </div>
        <div style={styles.fieldRowStyle}>
          <span style={styles.fieldLabelStyle}>{t('burn.question')}</span>
          <span style={styles.fieldValueStyle}>{meta.question}</span>
        </div>
        <div style={styles.fieldRowStyle}>
          <span style={styles.fieldLabelStyle}>{t('burn.charge')}</span>
          <span style={styles.fieldValueStyle}>{meta.charge}</span>
        </div>
      </div>
      <div style={styles.footerStyle}>
        <span style={styles.attributionStyle}>
          <div>{meta.attribution}</div>
          <div>{t('card.boundary')}</div>
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
