/**
 * `zhenren_burn` — 灼龟取兆 (CLAUDE.md §4.4).
 *
 * Returns the single authoritative `auspice` plus the命辞 glyph report. The
 * crack geometry is not returned to the model: it is regenerated deterministically
 * inside `presentationMeta`, so the model's context stays small and the client
 * still receives a complete, replayable spec.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { DivinationMemory } from './shared.js'
import type { ResolvedConfig } from '../config.js'
import type { OracleIndex } from '../data/load.js'
import { splitHanCharacters } from '../data/lookup.js'
import { chooseAuspice } from '../ritual/auspice.js'
import { deriveReading, generateCracks, pickBurnPoint } from '../ritual/crack.js'
import { planGlyphs, toChargeGlyphs } from '../ritual/glyph-plan.js'
import { generateSeed } from '../ritual/random.js'
import { isSeed } from '../shared/rng.js'
import { ATTRIBUTION, META_VERSION, TOOL_BURN, type Auspice } from '../contract.js'
import { invalid, newDivinationId } from './shared.js'

/** 命辞 upper bound in Han characters. Longer input is rejected, never truncated. */
export const MAX_CHARGE_CHARS = 24
/** 问题 upper bound; guards the session log against accidental essays. */
const MAX_QUESTION_CHARS = 500

const pointSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', required: true },
    y: { type: 'number', required: true },
  },
} as const

const chargeGlyphSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    char: { type: 'string', required: true },
    found: { type: 'boolean', required: true },
    headword: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    glyphChar: { type: 'string' },
    glossFound: { type: 'boolean' },
  },
} as const

const BURN_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    divinationId: { type: 'string', required: true },
    seed: { type: 'string', required: true },
    question: { type: 'string', required: true },
    charge: { type: 'string', required: true },
    auspice: { type: 'string', enum: ['吉', '凶', '中性'], required: true },
    reading: {
      required: true,
      type: 'object',
      additionalProperties: false,
      properties: {
        mainDirection: { type: 'string', enum: ['up', 'down', 'level'], required: true },
        branchPattern: { type: 'string', enum: ['continuous', 'broken', 'symmetric'], required: true },
        intensity: { type: 'number', required: true },
      },
    },
    burnPoint: { required: true, ...pointSchema },
    chargeGlyphs: { type: 'array', items: chargeGlyphSchema, required: true },
    missing: { type: 'array', items: { type: 'string' }, required: true },
    attribution: { type: 'string', required: true },
  },
} as const

export interface BurnDeps {
  /** Resolved lazily so a missing data file fails the call, not the plugin load. */
  getIndex: () => OracleIndex
  config: ResolvedConfig
  memory: DivinationMemory
}

const DESCRIPTION =
  '灼龟取兆。贞人先在龟甲上灼出兆纹，再由兆纹定出这一次占卜唯一的吉凶（auspice）。'
  + `命辞（charge）不超过 ${MAX_CHARGE_CHARS} 字。`
  + '调用之前不要描述裂纹、不要宣布吉凶；调用之后必须以本工具返回的 auspice 写占辞，不得改写或反转。'
  + '若命辞含字库外的字，missing 会列出它们；灼龟仍会完成，你可以在刻辞时改写或接受空刻。'

/** Build the burn tool bound to one loaded corpus and config. */
export function createBurnTool(deps: BurnDeps) {
  const { getIndex, config, memory } = deps
  return defineTool({
    name: TOOL_BURN,
    description: DESCRIPTION,
    parameters: {
      question: {
        type: 'string',
        required: true,
        description: '用户所问之事，用一两句白话概括；用于生成占卜编号与卡片标题。',
      },
      charge: {
        type: 'string',
        required: true,
        description: `命辞：以古雅、克制的文体写出所问之事，最多 ${MAX_CHARGE_CHARS} 个汉字。`,
      },
      tone: {
        type: 'string',
        enum: ['吉', '凶', '中性'],
        description: '导演提示，影响吉凶分布，但不保证结果；返回的 auspice 才是最终值。',
      },
      seed: {
        type: 'string',
        description: '重放用 seed（1-64 位字母数字）。通常不传，由系统生成。',
      },
      burnPoint: {
        type: 'object',
        additionalProperties: false,
        description: '灼点提示，归一化坐标 0..1；会被收敛到甲面范围内。通常不传。',
        properties: {
          x: { type: 'number', required: true },
          y: { type: 'number', required: true },
        },
      },
    },
    output: {
      schema: BURN_OUTPUT,
      render(_args, value): ContentBlock[] {
        const lines = [
          `贞人灼龟，兆象：${value.auspice}。`,
          `命辞：${value.charge}`,
        ]
        if (value.missing.length > 0) {
          lines.push(`未收字：${value.missing.join('、')}（刻辞将以空刻表示）。`)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
      presentationMeta(_args, value) {
        // Pure regeneration from the returned value; no hidden state involved.
        const cracks = generateCracks({
          seed: value.seed,
          auspice: value.auspice as Auspice,
          burnPoint: value.burnPoint,
        })
        return {
          version: META_VERSION,
          kind: 'zhenren.burn',
          divinationId: value.divinationId,
          seed: value.seed,
          question: value.question,
          charge: value.charge,
          auspice: value.auspice as Auspice,
          burnPoint: value.burnPoint,
          shellSeed: `shell-${value.seed}`,
          cracks,
          animation: config.animation,
          showShuowen: config.showShuowen,
          locale: config.locale,
          attribution: ATTRIBUTION,
        }
      },
    },
    async execute(args) {
      // Resolve the corpus first: a broken data file must not mint a divination id.
      const index = getIndex()

      const question = args.question.trim()
      if (question === '') invalid('question 不能为空')
      if (question.length > MAX_QUESTION_CHARS) {
        invalid(`question 超过 ${MAX_QUESTION_CHARS} 字，请先概括`)
      }

      const charge = args.charge.trim()
      if (charge === '') invalid('charge（命辞）不能为空')
      const chargeChars = splitHanCharacters(charge)
      if (chargeChars.length === 0) invalid('charge（命辞）至少需要一个汉字')
      if (chargeChars.length > MAX_CHARGE_CHARS) {
        invalid(`charge（命辞）共 ${chargeChars.length} 个汉字，超过上限 ${MAX_CHARGE_CHARS} 字；请缩短后重试`)
      }

      if (args.seed !== undefined && !isSeed(args.seed)) {
        invalid('seed 必须是 1-64 位字母、数字、下划线或连字符')
      }

      const seed = args.seed ?? generateSeed()
      const auspice = chooseAuspice(seed, args.tone, config.auspiceBalance)
      const burnPoint = pickBurnPoint(seed, args.burnPoint)
      const cracks = generateCracks({ seed, auspice, burnPoint })
      const reading = deriveReading(cracks)
      const plan = planGlyphs(index, charge)
      const divinationId = newDivinationId()

      memory.set({
        id: divinationId,
        seed,
        auspice,
        burnPoint,
        question,
        charge,
        cracks,
        storedAt: Date.now(),
      })

      return {
        divinationId,
        seed,
        question,
        charge,
        auspice,
        reading,
        burnPoint,
        chargeGlyphs: toChargeGlyphs(plan),
        missing: plan.missing,
        attribution: ATTRIBUTION,
      }
    },
  })
}
