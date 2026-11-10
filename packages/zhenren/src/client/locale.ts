/**
 * Card copy (CLAUDE.md §4.11). UI chrome lives here; oracle glyphs, 说文 text,
 * and source names are data and are never translated.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace owned by this plugin. */
export const NS = 'zhenren'

const zh = {
  'burn.title': '灼龟',
  'burn.preparing': '贞人正灼龟……',
  'burn.waiting': '兆纹将出……',
  'burn.question': '所问',
  'burn.charge': '命辞',
  'burn.auspice': '兆象',
  'burn.noResult': '这次灼龟没有留下可读的兆纹。',
  'burn.noMeta': '灼龟已毕，但兆纹数据无法解析。',
  'inscribe.title': '刻辞',
  'inscribe.preparing': '贞人正刻辞……',
  'inscribe.empty': '刻辞未成。',
  'inscribe.transcription': '卜辞',
  'inscribe.missing': '未收字',
  'inscribe.placeholder': '空刻',
  'card.replay': '重放',
  'card.skip': '跳过',
  'card.attribution': '出处',
  'card.boundary': '兆纹为艺术化表现，非考古复原。',
  'card.fontMissing': '字形未加载，仅显示释文。',
  'gloss.title': '《说文》',
  'gloss.vernacular': '现代转述',
  'gloss.correction': '古文字纠正',
} as const

export type ZhenrenKey = keyof typeof zh

const en: Record<ZhenrenKey, string> = {
  'burn.title': 'Scapulimancy',
  'burn.preparing': 'The diviner is burning the shell…',
  'burn.waiting': 'The omen is about to appear…',
  'burn.question': 'Question',
  'burn.charge': 'Charge',
  'burn.auspice': 'Omen',
  'burn.noResult': 'This burning left no readable omen.',
  'burn.noMeta': 'The burning finished, but its omen data could not be read.',
  'inscribe.title': 'Inscription',
  'inscribe.preparing': 'The diviner is carving…',
  'inscribe.empty': 'Nothing was carved.',
  'inscribe.transcription': 'Inscription',
  'inscribe.missing': 'Outside the corpus',
  'inscribe.placeholder': 'blank carve',
  'card.replay': 'Replay',
  'card.skip': 'Skip',
  'card.attribution': 'Sources',
  'card.boundary': 'Omen geometry is an artistic convention, not an archaeological reconstruction.',
  'card.fontMissing': 'Glyph font unavailable; showing the transcription only.',
  'gloss.title': 'Shuowen',
  'gloss.vernacular': 'Modern paraphrase',
  'gloss.correction': 'Palaeographic note',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy of the 甲骨贞人 cards. */
    zhenren: ZhenrenKey
  }
}

/** Dictionaries registered under {@link NS}. */
export const dictionaries = { zh, en } as const
