/**
 * The 贞人 protocol is a product surface: the style rules the user asked for
 * must survive prompt edits (CLAUDE.md §4.9, D15).
 */
import { describe, expect, it } from 'vitest'
import { PROMPT_TEXT } from '../src/prompt.js'

describe('贞人 prompt', () => {
  it('fixes the 前辞 opening and forbids rewriting it', () => {
    expect(PROMPT_TEXT).toContain('前辞由系统固定为')
    expect(PROMPT_TEXT).toContain('不要改写它')
  })

  it('asks for single-character content words instead of modern disyllables', () => {
    expect(PROMPT_TEXT).toContain('实词尽量用单字')
    expect(PROMPT_TEXT).toContain('出行→出')
    expect(PROMPT_TEXT).toContain('明日→翌')
    expect(PROMPT_TEXT).toContain('翌出，其吉')
  })

  it('banishes modal particles and shows the terse question form', () => {
    expect(PROMPT_TEXT).toContain('乎、哉、兮、矣、也、焉、耳')
    expect(PROMPT_TEXT).toContain('「其雨」而不是「其雨乎」')
  })

  it('prefers rewriting over 空刻', () => {
    expect(PROMPT_TEXT).toContain('空刻越少越好')
    expect(PROMPT_TEXT).toContain('必须换字或省略')
    expect(PROMPT_TEXT).toContain('不要把空刻当作首选')
  })

  it('scopes the single-burn rule to one ritual, not the whole session', () => {
    expect(PROMPT_TEXT).toContain('同一轮起卜中只调用一次 zhenren_burn')
    expect(PROMPT_TEXT).toContain('是否另起一卜由你判断')
    expect(PROMPT_TEXT).not.toContain('同一问题只调用一次 zhenren_burn')
  })

  it('lets the diviner choose the column direction', () => {
    expect(PROMPT_TEXT).toContain('layout.direction')
    expect(PROMPT_TEXT).toContain('从右上往左下')
    expect(PROMPT_TEXT).toContain('从左上往右下')
  })
})
