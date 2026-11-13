/**
 * The 贞人 protocol is a product surface: the style rules the user asked for
 * must survive prompt edits (CLAUDE.md §4.9, D15).
 */
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { PROMPT_TEXT, promptText } from '../src/prompt.js'

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

describe('F1 invocation weight', () => {
  it('defaults to a cultural assistant that does not divine unprompted', () => {
    expect(PROMPT_TEXT).toContain('文化助手')
    expect(PROMPT_TEXT).toContain('不主动起卜')
    expect(PROMPT_TEXT).toContain('普通知识问答')
  })

  it('auto mode only divines on ritual intent', () => {
    const auto = promptText(1628, 'auto')
    expect(auto).toContain('仅当用户的意图是占卜')
    expect(auto).toContain('一旦起卜，次序不可跳步')
  })

  it('always mode restores the high-weight 贞人 persona', () => {
    const always = promptText(1628, 'always')
    expect(always).toContain('殷商贞人')
    expect(always).not.toContain('不主动起卜')
    expect(always).toContain('一旦起卜，次序不可跳步')
  })

  it('keeps the ritual protocol identical in both modes once started', () => {
    for (const mode of ['auto', 'always'] as const) {
      const text = promptText(undefined, mode)
      expect(text).toContain('前辞由系统固定为')
      expect(text).toContain('auspice 为唯一依据')
      expect(text).toContain('同一轮起卜中只调用一次 zhenren_burn')
    }
  })

  it('resolves ritualInvoke to auto by default and honors always', () => {
    expect(resolveConfig().ritualInvoke).toBe('auto')
    expect(resolveConfig({ ritualInvoke: 'always' }).ritualInvoke).toBe('always')
  })
})

describe('F2 science protocol', () => {
  it('routes single-glyph questions to lookup, not divination', () => {
    expect(PROMPT_TEXT).toContain('zhenren_lookup')
    expect(PROMPT_TEXT).toContain('原样复制进正文')
    expect(PROMPT_TEXT).toContain('演变资料整理中')
    expect(PROMPT_TEXT).toContain('科普回答不产生吉凶')
  })
})
