/**
 * `zhenren_inscribe` — 刻辞 (CLAUDE.md §4.5).
 *
 * Every Han character keeps a slot. Characters outside the 1,425-glyph corpus
 * are reported in `missing` and become 空刻 placeholders: the inscription is
 * still carved, and `ok` stays true. `ok: false` is reserved for input that
 * cannot be laid out at all.
 */
import { defineTool, type InferValue } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { DivinationMemory } from './shared.js'
import type { ResolvedConfig } from '../config.js'
import type { OracleIndex } from '../data/load.js'
import { splitHanCharacters } from '../data/lookup.js'
import { planCarve } from '../ritual/carve.js'
import { DEFAULT_BOUNDS, generateCracks } from '../ritual/crack.js'
import { planGlyphs } from '../ritual/glyph-plan.js'
import { computeLayout, describeLayout, MAX_SLOTS } from '../ritual/layout.js'
import type { RitualLayout } from '../ritual/layout.js'
import { isSeed } from '../shared/rng.js'
import {
  ATTRIBUTION,
  META_VERSION,
  TOOL_INSCRIBE,
  type Auspice,
  type HighlightGloss,
  type InscribePresentationMeta,
  type MetaGlyph,
} from '../contract.js'
import { isDivinationId } from './shared.js'

/** At most this many 说文 entries are echoed in the value and the card. */
const MAX_HIGHLIGHTS = 5

const pointSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', required: true },
    y: { type: 'number', required: true },
  },
} as const

const glossSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    original: { type: 'string', required: true },
    vernacular: { type: 'string', required: true },
    vernacularStatus: { type: 'string', enum: ['draft', 'reviewed'], required: true },
    correction: {
      required: true,
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true },
            source: { type: 'string', required: true },
          },
        },
        { type: 'null' },
      ],
    },
  },
} as const

const INSCRIBE_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    divinationId: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    missing: { type: 'array', items: { type: 'string' }, required: true },
    glyphs: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot: { type: 'integer', required: true },
          char: { type: 'string', required: true },
          found: { type: 'boolean', required: true },
          glossFound: { type: 'boolean', required: true },
          headword: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          glyphChar: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          shuowen: { oneOf: [glossSchema, { type: 'null' }] },
          placeholder: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    },
    layoutSummary: { type: 'string', required: true },
    warnings: { type: 'array', items: { type: 'string' }, required: true },
    error: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
    continuity: {
      required: true,
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            auspice: { type: 'string', enum: ['吉', '凶', '中性'], required: true },
            burnPoint: { required: true, ...pointSchema },
          },
        },
        { type: 'null' },
      ],
    },
    attribution: { type: 'string', required: true },
  },
} as const

/** Canonical success/failure body inferred from the declared schema. */
type InscribeValue = InferValue<typeof INSCRIBE_OUTPUT>

/** Placeholder layout for a call that never produced any slots. */
const EMPTY_LAYOUT: RitualLayout = { columns: 1, rows: 1, direction: 'rtl', slots: [] }

export interface InscribeDeps {
  /** Resolved lazily so a missing data file fails the call, not the plugin load. */
  getIndex: () => OracleIndex
  config: ResolvedConfig
  memory: DivinationMemory
}

const DESCRIPTION =
  '刻辞。把前辞、命辞、占辞刻到同一块龟甲上。'
  + '占辞必须依据 zhenren_burn 返回的 auspice，不得改写。'
  + '字库外的字会保留槽位成为空刻（placeholder），此时 ok 仍为 true；'
  + '只有卜辞为空、超过字数上限或布局不成立时才返回 ok: false。'
  + `highlight 最多 ${MAX_HIGHLIGHTS} 个字，工具会为这些字返回完整《说文》释义。`

function failure(message: string): InscribeValue {
  return {
    ok: false,
    divinationId: null,
    missing: [],
    glyphs: [],
    layoutSummary: '',
    warnings: [],
    error: message,
    continuity: null,
    attribution: ATTRIBUTION,
  }
}

/** Normalize highlight input: Han characters only, deduped, capped. */
function normalizeHighlights(raw: readonly string[] | undefined, text: string): Set<string> {
  const present = new Set(splitHanCharacters(text))
  const selected: string[] = []
  for (const item of raw ?? []) {
    for (const char of splitHanCharacters(item)) {
      if (!present.has(char) || selected.includes(char)) continue
      selected.push(char)
      if (selected.length >= MAX_HIGHLIGHTS) return new Set(selected)
    }
  }
  return new Set(selected)
}

/** Build the inscribe tool bound to one loaded corpus and config. */
export function createInscribeTool(deps: InscribeDeps) {
  const { getIndex, config, memory } = deps
  return defineTool({
    name: TOOL_INSCRIBE,
    description: DESCRIPTION,
    parameters: {
      divinationId: {
        type: 'string',
        required: true,
        description: 'zhenren_burn 返回的 divinationId，用于把刻辞接到同一块龟甲上。',
      },
      burnSeed: {
        type: 'string',
        required: true,
        description: 'zhenren_burn 返回的 seed。同一 seed 才能重放同一兆纹。',
      },
      inscription: {
        type: 'object',
        additionalProperties: false,
        required: true,
        description: '卜辞的三段：前辞、命辞、占辞。',
        properties: {
          prefix: {
            type: 'string',
            description: '前辞（日期、贞人名等）。可省略。',
          },
          charge: { type: 'string', required: true, description: '命辞：所问之事。' },
          prognosis: { type: 'string', required: true, description: '占辞：依据 auspice 作出的判断。' },
        },
      },
      highlight: {
        type: 'array',
        items: { type: 'string' },
        description: `希望卡片页脚展示《说文》释义的字，最多 ${MAX_HIGHLIGHTS} 个。`,
      },
      layout: {
        type: 'object',
        additionalProperties: false,
        description: '布局建议。columns 会被收敛到 1-4 列。',
        properties: {
          columns: { type: 'integer', description: '建议列数，1-4。' },
        },
      },
    },
    output: {
      schema: INSCRIBE_OUTPUT,
      render(_args, value): ContentBlock[] {
        if (!value.ok) return [{ type: 'text', text: `刻辞未成：${value.error ?? '未知原因'}` }]
        const lines = [`卜辞已刻（${value.layoutSummary}）。`]
        lines.push(value.glyphs.map((glyph) => glyph.char).join(''))
        if (value.missing.length > 0) {
          lines.push(`未收字：${value.missing.join('、')}（已刻为空刻）。`)
        }
        for (const warning of value.warnings) lines.push(`注意：${warning}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
      presentationMeta(args, value) {
        const glyphs: MetaGlyph[] = value.glyphs.map((glyph) =>
          glyph.found && typeof glyph.glyphChar === 'string'
            ? {
                slot: glyph.slot,
                char: glyph.char,
                found: true,
                glyphChar: glyph.glyphChar,
                placeholder: false,
              }
            : {
                slot: glyph.slot,
                char: glyph.char,
                found: false,
                glyphChar: null,
                placeholder: true,
              },
        )
        const continuity = value.continuity
        const layout =
          computeLayout({
            count: glyphs.length,
            requestedColumns: args.layout?.columns,
            bounds: DEFAULT_BOUNDS,
            burnPoint: continuity?.burnPoint,
          }) ?? EMPTY_LAYOUT
        const carve = planCarve(
          args.burnSeed,
          glyphs.map((glyph) => ({ slot: glyph.slot, found: glyph.found })),
        )
        const highlightGlosses: HighlightGloss[] = []
        const seenHighlights = new Set<string>()
        for (const glyph of value.glyphs) {
          if (glyph.shuowen === undefined || glyph.shuowen === null) continue
          // One entry per character even if it recurs across the inscription.
          if (seenHighlights.has(glyph.char)) continue
          seenHighlights.add(glyph.char)
          highlightGlosses.push({
            char: glyph.char,
            original: glyph.shuowen.original,
            vernacular: glyph.shuowen.vernacular,
            correction: glyph.shuowen.correction?.text ?? null,
          })
        }
        const meta: InscribePresentationMeta = {
          version: META_VERSION,
          kind: 'zhenren.inscribe',
          ok: value.ok,
          divinationId: value.divinationId ?? '',
          burnSeed: args.burnSeed,
          auspice: continuity === null ? null : continuity.auspice,
          // Regenerated deterministically; no hidden state involved.
          cracks:
            continuity === null
              ? null
              : generateCracks({
                  seed: args.burnSeed,
                  auspice: continuity.auspice,
                  burnPoint: continuity.burnPoint,
                }),
          glyphs,
          layout: { columns: layout.columns, direction: 'rtl', slots: layout.slots },
          carve,
          highlightGlosses,
          animation: config.animation,
          showShuowen: config.showShuowen,
          locale: config.locale,
          attribution: ATTRIBUTION,
        }
        return meta
      },
    },
    async execute(args) {
      if (!isDivinationId(args.divinationId)) {
        return failure('divinationId 格式非法；请使用 zhenren_burn 返回的 id')
      }
      if (!isSeed(args.burnSeed)) {
        return failure('burnSeed 格式非法；请使用 zhenren_burn 返回的 seed')
      }

      const inscription = args.inscription
      const text = [inscription.prefix ?? '', inscription.charge, inscription.prognosis].join('')
      const charCount = splitHanCharacters(text).length
      if (charCount === 0) {
        return failure('卜辞为空：前辞、命辞、占辞至少要有一个汉字')
      }
      if (charCount > config.maxInscriptionChars) {
        return failure(
          `卜辞共 ${charCount} 个汉字，超过上限 ${config.maxInscriptionChars} 字；请缩短后重试`,
        )
      }

      const stored = memory.get(args.divinationId)
      const warnings: string[] = []
      let continuity: { auspice: Auspice; burnPoint: { x: number; y: number } } | null = null
      if (stored === undefined) {
        warnings.push('本次进程内没有对应的灼龟记录，卡片将使用中性甲面，不显示兆纹')
      } else if (stored.seed !== args.burnSeed) {
        warnings.push('burnSeed 与 divinationId 对应的灼龟记录不一致，卡片不显示兆纹')
      } else {
        continuity = { auspice: stored.auspice, burnPoint: stored.burnPoint }
      }

      const layout = computeLayout({
        count: charCount,
        requestedColumns: args.layout?.columns,
        bounds: DEFAULT_BOUNDS,
        burnPoint: continuity?.burnPoint,
      })
      if (layout === null) {
        return failure(`布局无法成立：最多 ${MAX_SLOTS} 个刻位；请缩短卜辞`)
      }

      const plan = planGlyphs(getIndex(), text)
      const highlights = normalizeHighlights(args.highlight, text)

      const glyphs: InscribeValue['glyphs'] = plan.entries.map((entry) => {
        const lookup = entry.lookup
        if (!lookup.found) {
          return {
            slot: entry.slot,
            char: entry.char,
            found: false,
            glossFound: false,
            headword: null,
            glyphChar: null,
            shuowen: null,
            placeholder: true,
            reason: 'not-in-oracle-corpus',
          }
        }
        return {
          slot: entry.slot,
          char: entry.char,
          found: true,
          glossFound: lookup.shuowen !== null,
          headword: lookup.headword,
          glyphChar: lookup.glyphChar,
          // Full glosses are context-expensive; only the model's picks get one.
          shuowen: highlights.has(entry.char) ? lookup.shuowen : null,
          placeholder: false,
        }
      })

      return {
        ok: true,
        divinationId: args.divinationId,
        missing: plan.missing,
        glyphs,
        layoutSummary: describeLayout(layout),
        warnings,
        error: null,
        continuity,
        attribution: ATTRIBUTION,
      }
    },
  })
}
