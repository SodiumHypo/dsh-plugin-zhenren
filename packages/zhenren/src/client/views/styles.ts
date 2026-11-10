/**
 * Card chrome, inline by design: the client build has no stylesheet pipeline,
 * and these few rules do not justify one.
 *
 * Palette follows CLAUDE.md §5.6 — bone ivory, grey-brown shell, charcoal
 * incision, ember heat, and a dark red reserved for the 凶 label.
 */
import type { CSSProperties } from 'react'
import type { Auspice } from '../../contract.js'

const INK = '#3b2f24'
const INK_SOFT = '#6b5741'
const BONE = '#f4ecdd'
const BONE_EDGE = 'rgba(120, 96, 64, 0.38)'

export const cardStyle: CSSProperties = {
  border: `1px solid ${BONE_EDGE}`,
  borderRadius: 10,
  background: BONE,
  color: INK,
  overflow: 'hidden',
  fontFamily: 'ui-serif, "Songti SC", "Noto Serif CJK SC", serif',
}

export const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px 4px',
}

export const titleStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.18em',
  color: INK_SOFT,
  textTransform: 'uppercase',
}

export const spacerStyle: CSSProperties = { flex: 1 }

export const bodyStyle: CSSProperties = { padding: '4px 14px 12px' }

export const canvasFrameStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 360,
  margin: '0 auto',
  aspectRatio: '1 / 1',
}

export const fieldRowStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: '3px 0',
  lineHeight: 1.6,
  fontSize: 13,
}

export const fieldLabelStyle: CSSProperties = {
  flex: '0 0 auto',
  color: INK_SOFT,
  fontSize: 11,
  letterSpacing: '0.14em',
  paddingTop: 2,
}

export const fieldValueStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
}

export const footerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px 10px',
  borderTop: `1px solid ${BONE_EDGE}`,
  fontSize: 11,
  color: INK_SOFT,
}

export const attributionStyle: CSSProperties = {
  flex: '1 1 220px',
  minWidth: 0,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
}

export const buttonStyle: CSSProperties = {
  appearance: 'none',
  border: `1px solid ${BONE_EDGE}`,
  background: 'transparent',
  color: INK,
  borderRadius: 6,
  minWidth: 44,
  minHeight: 44,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
}

export const noteStyle: CSSProperties = {
  padding: '6px 14px 0',
  fontSize: 11,
  color: INK_SOFT,
}

export const transcriptionStyle: CSSProperties = {
  padding: '10px 14px',
  fontSize: 22,
  lineHeight: 1.75,
  letterSpacing: '0.28em',
  color: INK,
  wordBreak: 'break-all',
}

export const glossStyle: CSSProperties = {
  padding: '8px 14px',
  borderTop: `1px solid ${BONE_EDGE}`,
  fontSize: 12,
  lineHeight: 1.65,
}

export const glossHeadStyle: CSSProperties = {
  fontSize: 15,
  letterSpacing: '0.2em',
  marginBottom: 4,
}

export const glossOriginalStyle: CSSProperties = {
  color: INK,
  marginBottom: 4,
  overflowWrap: 'anywhere',
}

export const glossMetaStyle: CSSProperties = {
  color: INK_SOFT,
  overflowWrap: 'anywhere',
}

const AUSPICE_COLORS: Record<Auspice, string> = {
  吉: '#2f5d43',
  凶: '#7a2e24',
  中性: '#6b5741',
}

/** Small museum-label chip; the text itself carries the meaning, not the color. */
export function auspiceChipStyle(auspice: Auspice): CSSProperties {
  return {
    background: AUSPICE_COLORS[auspice],
    color: '#f6efe2',
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 12,
    letterSpacing: '0.16em',
    whiteSpace: 'nowrap',
  }
}
