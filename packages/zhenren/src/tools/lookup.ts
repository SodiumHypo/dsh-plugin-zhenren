/**
 * `zhenren_lookup` — 单字科普查询 (CLAUDE.md §4.13, F2).
 *
 * Independent of the ritual chain: no divinationId, no auspice, no mutation.
 * Returns the glyph, its 说文 gloss, evolution, and the inline PUA codepoint.
 *
 * The inline PUA character MUST appear in `output.render`: dsh delivers the
 * render content (not the raw value) to the model — see agent-loop
 * `appendToolResult` → `createToolResultMessage({ content: result.content })`.
 * Embedding it here is the only way the model can copy it into prose (D21).
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { OracleIndex } from '../data/load.js'
import { lookupOracle, splitHanCharacters } from '../data/lookup.js'
import {
  ATTRIBUTION,
  LOOKUP_META_VERSION,
  TOOL_LOOKUP,
  type LookupPresentationMeta,
  type MetaEvolution,
} from '../contract.js'
import { invalid } from './shared.js'

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

const evolutionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    stages: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', required: true },
          note: { type: 'string', required: true },
        },
      },
    },
    status: { type: 'string', enum: ['draft', 'reviewed'], required: true },
  },
} as const

const sourceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['oracleGlyph', 'shuowen', 'correction'], required: true },
    value: { type: 'string', required: true },
  },
} as const

/**
 * Discriminated union: a found glyph carries the full record; a miss carries
 * only the reason. `const` on `found` makes `InferValue` distribute into two
 * branches the renderer and projector can narrow on.
 */
const LOOKUP_OUTPUT = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        found: { type: 'boolean', const: true, required: true },
        query: { type: 'string', required: true },
        normalized: { type: 'string', required: true },
        glyphChar: { type: 'string', required: true },
        glyphSource: { type: 'string', enum: ['font', 'image'], required: true },
        headword: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        pinyin: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        shuowen: { oneOf: [glossSchema, { type: 'null' }], required: true },
        inline: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        evolution: { oneOf: [evolutionSchema, { type: 'null' }], required: true },
        matchedBy: { type: 'string', enum: ['glyph', 'alias'], required: true },
        sources: { type: 'array', items: sourceSchema, required: true },
        supportedCount: { type: 'integer', required: true },
        attribution: { type: 'string', required: true },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        found: { type: 'boolean', const: false, required: true },
        query: { type: 'string', required: true },
        normalized: { type: 'string', required: true },
        reason: { type: 'string', enum: ['not-in-oracle-corpus', 'empty-query'], required: true },
        supportedCount: { type: 'integer', required: true },
        attribution: { type: 'string', required: true },
      },
    },
  ],
} as const

export interface LookupDeps {
  /** Resolved lazily so a missing data file fails the call, not the plugin load. */
  getIndex: () => OracleIndex
}

const DESCRIPTION =
  '查询单个汉字的甲骨字形、《说文》释义与字形演变（科普，非占卜）。'
  + 'char 必须是单个汉字（简体/繁体/异体均可）；多字请逐字查询。'
  + 'found 表示「有甲骨字形」，不等于「有说文释义」；shuowen 为 null 时如实说「《说文》未收此形」。'
  + '返回的 inline 是正文内联用的私有区（PUA）字符：把它原样复制进正文，并紧跟现代字括注，不得凭记忆猜测或替换成普通汉字；inline 为 null 时正文用现代字。'
  + 'evolution 为 null 时说「演变资料整理中」，不要编造演变阶段。此工具不起卜、不产生吉凶。'

/** Build the lookup tool bound to one loaded corpus. */
export function createLookupTool(deps: LookupDeps) {
  const { getIndex } = deps
  return defineTool({
    name: TOOL_LOOKUP,
    description: DESCRIPTION,
    parameters: {
      char: {
        type: 'string',
        required: true,
        description: '要查询的单个汉字（简体/繁体/异体均可）。多字输入会被拒绝。',
      },
    },
    output: {
      schema: LOOKUP_OUTPUT,
      render(_args, value): ContentBlock[] {
        if (!value.found) {
          const text =
            value.reason === 'empty-query'
              ? '输入不含汉字，无法查询。请提供单个汉字。'
              : `「${value.query}」不在甲骨字形库内（字形库 ${value.supportedCount} 字）。不猜测近似字；请换一个库内字，或改用现代字表达。`
          return [{ type: 'text', text }]
        }

        const head =
          value.headword !== null && value.headword !== value.glyphChar
            ? `${value.glyphChar}（说文头：${value.headword}）`
            : value.glyphChar
        const lines = [value.pinyin !== null ? `${head} · ${value.pinyin}` : head]

        if (value.shuowen !== null) {
          lines.push(`《说文》：${value.shuowen.original}`)
          if (value.shuowen.vernacular !== '') {
            lines.push(`现代转述：${value.shuowen.vernacular}`)
          }
          if (value.shuowen.correction !== null) {
            lines.push(
              `古文字纠正：${value.shuowen.correction.text}（出处：${value.shuowen.correction.source}）`,
            )
          }
        } else {
          lines.push('《说文》未收此形：此字有甲骨字形，但构建期未接上《说文》释义。')
        }

        if (value.evolution !== null) {
          const stages = value.evolution.stages.map((s) => `${s.name}：${s.note}`).join('；')
          lines.push(`字形演变：${stages}`)
        } else {
          lines.push('字形演变：资料整理中。')
        }

        // D21: the PUA char must be in the render so the model can copy it.
        if (value.inline !== null) {
          lines.push(`内联字形（原样复制进正文，保留现代字括注）：${value.inline}（${value.glyphChar}）`)
        } else if (value.glyphSource === 'image') {
          lines.push(`图像字形暂不支持正文内联，正文请用现代字「${value.glyphChar}」。`)
        } else {
          lines.push(`此字暂不支持正文内联，正文请用现代字「${value.glyphChar}」。`)
        }

        return [{ type: 'text', text: lines.join('\n') }]
      },
      presentationMeta(_args, value) {
        // Pure projection of the returned value; no data-layer reads, no RNG.
        if (!value.found) {
          const meta: LookupPresentationMeta = {
            version: LOOKUP_META_VERSION,
            kind: 'zhenren.lookup',
            query: value.query,
            found: false,
            glyphChar: null,
            glyphSource: 'font',
            headword: null,
            pinyin: null,
            original: null,
            vernacular: null,
            vernacularStatus: null,
            correction: null,
            evolution: null,
            inline: null,
            reason: value.reason,
            supportedCount: value.supportedCount,
            attribution: ATTRIBUTION,
          }
          return meta
        }

        const evolution: MetaEvolution | null =
          value.evolution === null
            ? null
            : {
                stages: value.evolution.stages.map((s) => ({ name: s.name, note: s.note })),
                status: value.evolution.status,
              }
        const meta: LookupPresentationMeta = {
          version: LOOKUP_META_VERSION,
          kind: 'zhenren.lookup',
          query: value.query,
          found: true,
          glyphChar: value.glyphChar,
          glyphSource: value.glyphSource,
          headword: value.headword,
          pinyin: value.pinyin,
          original: value.shuowen?.original ?? null,
          vernacular: value.shuowen?.vernacular ?? null,
          vernacularStatus: value.shuowen?.vernacularStatus ?? null,
          correction: value.shuowen?.correction ?? null,
          evolution,
          inline: value.inline,
          reason: null,
          supportedCount: value.supportedCount,
          attribution: ATTRIBUTION,
        }
        return meta
      },
    },
    async execute(args) {
      // Resolve the corpus first: a broken data file must surface as a tool error.
      const index = getIndex()

      const chars = splitHanCharacters(args.char)
      if (chars.length > 1) {
        invalid('char 只能是一个汉字；多字请逐字查询')
      }

      const lookup = lookupOracle(index, args.char)
      if (!lookup.found) {
        return {
          found: false,
          query: lookup.query,
          normalized: lookup.normalized,
          reason: lookup.reason,
          supportedCount: index.supportedCount,
          attribution: ATTRIBUTION,
        }
      }

      const pinyin =
        lookup.headword === null ? null : (index.headwords.get(lookup.headword)?.pinyin ?? null)
      return {
        found: true,
        query: lookup.query,
        normalized: lookup.normalized,
        glyphChar: lookup.glyphChar,
        glyphSource: lookup.glyphSource,
        headword: lookup.headword,
        pinyin,
        shuowen: lookup.shuowen,
        inline: lookup.inline,
        evolution: lookup.evolution,
        matchedBy: lookup.matchedBy,
        sources: lookup.sources,
        supportedCount: index.supportedCount,
        attribution: ATTRIBUTION,
      }
    },
  })
}