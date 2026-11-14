/**
 * 每日一字 dock entry (CLAUDE.md §4.8, D22/D23, F3).
 *
 * An ambient pill below the composer, not a ritual card. It reads the embedded
 * client dataset (D23) and the plugin-namespaced cycle state (D22) — no host tool
 * call, no session projection. One cycle traverses the whole corpus; the pick is
 * deterministic and changes on the next local day. The glyph is shown through the
 * same two material branches as the cards (Oracular codepoint / HUST-OBC PNG),
 * with the modern character always present so the entry stays readable even when
 * the font or image fails to load. Evolution is description-only (D23): a missing
 * record reads 「演变资料整理中」, never a fabricated stage.
 *
 * The component needs only the locale seat; the dock's session selector hooks are
 * intentionally unused, so the props type stays minimal (a component accepting
 * fewer props is assignable to the slot's full composed props).
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { GLYPH_DATA, type ClientGlyph } from '../glyph-data.js'
import {
  localDate,
  pickDaily,
  readDailyState,
  writeDailyState,
} from '../daily-state.js'
import { ORACLE_FONT_FAMILY, loadOracleFont } from '../font.js'
import { getGlyphImage, loadGlyphImages } from '../glyph-images.js'
import * as styles from './styles.js'

type DailyGlyphDockProps = PropsLocale<'zhenren'>

interface DailyPick {
  char: string
  record: ClientGlyph
  seen: number
  total: number
}

/** Resolve today's glyph once on mount; same-day remounts return the cached pick. */
function resolvePick(): DailyPick | null {
  const corpus = Object.keys(GLYPH_DATA).sort()
  if (corpus.length === 0) return null
  const date = localDate(new Date())
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage
  const previous = readDailyState(storage, date)
  const { state, char } = pickDaily(previous, corpus, date)
  writeDailyState(storage, state)
  const record = GLYPH_DATA[char]
  if (record === undefined) return null
  return { char, record, seen: state.seen.length, total: corpus.length }
}

/**
 * Render the daily-glyph dock pill.
 * @param props - the zhenren locale seat (the dock's other props are unused).
 */
export function DailyGlyphDock(props: DailyGlyphDockProps): ReactElement | null {
  const { t } = props
  const [pick, setPick] = useState<DailyPick | null>(null)
  const [fontOk, setFontOk] = useState(false)
  const [imageReady, setImageReady] = useState(false)

  useEffect(() => {
    setPick(resolvePick())
  }, [])

  const char = pick?.char ?? ''
  const source = pick?.record.source

  useEffect(() => {
    if (pick === null) return
    let alive = true
    loadOracleFont().then(
      (ok) => {
        if (alive) setFontOk(ok)
      },
      () => {
        if (alive) setFontOk(false)
      },
    )
    if (source === 'image') {
      loadGlyphImages([char]).then(
        () => {
          if (alive) setImageReady(true)
        },
        () => {
          if (alive) setImageReady(true)
        },
      )
    } else {
      setImageReady(true)
    }
    return () => {
      alive = false
    }
  }, [pick, char, source])

  if (pick === null) return null

  const { record, seen, total } = pick
  const image = source === 'image' && imageReady ? getGlyphImage(char) : undefined
  const stage = record.evolution?.stages[0]
  const note = stage !== undefined ? `${stage.name}：${stage.note}` : t('daily.evolutionPending')

  return (
    <div
      style={styles.dockStyle}
      data-plugin="zhenren"
      data-daily={char}
      title={`${t('daily.title')}：${char}`}
    >
      <span style={styles.dockLabelStyle}>{t('daily.title')}</span>
      <span style={styles.dockGlyphStyle} aria-hidden="true">
        {source === 'image' ? (
          image !== undefined ? (
            <img src={image.src} alt="" style={{ maxHeight: 32, maxWidth: 32 }} />
          ) : (
            <span style={{ fontSize: 24 }}>{char}</span>
          )
        ) : fontOk ? (
          <span style={{ fontFamily: `'${ORACLE_FONT_FAMILY}'`, fontSize: 30, lineHeight: 1 }}>{char}</span>
        ) : (
          <span style={{ fontSize: 24 }}>{char}</span>
        )}
      </span>
      <span style={styles.dockCharStyle}>
        {char}
        {record.pinyin !== null ? (
          <span style={{ fontSize: 12, color: '#6b5741' }}> {record.pinyin}</span>
        ) : null}
      </span>
      <span style={styles.dockNoteStyle}>{note}</span>
      <span style={styles.dockProgressStyle}>{t('daily.progress', { seen, total })}</span>
    </div>
  )
}