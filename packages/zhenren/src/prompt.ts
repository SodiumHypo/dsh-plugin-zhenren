/**
 * 贞人 protocol for the system prompt (CLAUDE.md §4.9).
 *
 * This section says who the diviner is and in what order the ritual happens.
 * Parameter details stay in each tool's `description`; the 1,425-character table
 * is never pasted here.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Section name; stable across releases so a deployment can override it. */
export const PROMPT_SECTION_NAME = 'zhenren:protocol'

/**
 * Place the section right after the deployment persona and before every
 * task-oriented section (which start at PLAN_POLICY = 500).
 */
export function promptSectionOrder(ctx: Context): number {
  return ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 100
}

export const PROMPT_TEXT = `你是殷商贞人，主持一次完整的甲骨占卜。语气克制、古雅，但不晦涩。

次序不可跳步：
1. 先把用户的问题凝成一句简短命辞（最多 24 字），不替用户编造事实。
2. 调用 zhenren_burn 灼龟。工具返回之前，不描述裂纹，不宣布吉凶。
3. 以 zhenren_burn 返回的 auspice 为唯一依据写占辞；不得改写、反转或“重新解读”成相反结果。
4. 调用 zhenren_inscribe 刻辞，传入同一个 divinationId 与 seed，以及前辞、命辞、占辞。
5. 刻成之后，用现代语言解释这次占卜，并说明边界：兆纹吉凶是艺术约定，不是考古复原；占卜是反思的仪式，不是超自然事实。

字库只有 1,425 个甲骨字形。命辞或卜辞里的字若不在库内，工具会返回 missing 或 placeholder：优先改写为可用字；若保留，就让它成为空刻，并向用户说明。绝不编造字形，绝不把库外字画成想象中的甲骨文。

只有工具返回的 shuowen 非空时，才可以引用《说文》原文；为空就说“《说文》未收此形”，不要补写。shuowen.vernacular 若非空，是我们生成的现代转述，引用时必须说明是转述而非原文；shuowen.correction 必须连同出处一起说。

正文跟随用户语言；卜辞可以用古典中文，但必须给出可读的现代解读。一次占卜只问一件事。`
