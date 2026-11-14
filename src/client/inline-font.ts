/**
 * Prose-inline oracle font (D21/D25).
 *
 * The model copies PUA codepoints (U+E000–F8FF) from `zhenren_lookup` results
 * into its prose. Those codepoints collide with nothing in normal text, so a
 * PUA-only derivative font can sit at the head of the prose stack without
 * touching ordinary Chinese: `unicode-range` keeps the browser from even
 * loading it until a PUA character is actually rendered.
 *
 * The prose font resolves through `--dsw-font-family`:
 *   .markdown { font: var(--dsw-font-markdown-base) }
 *   --dsw-font-markdown-base = … var(--dsw-font-family)
 *   --dsw-font-family (ui-theme base.css, :root) = the built-in text stack
 * We read the theme's resolved `--dsw-font-family` at install time and prepend
 * `ZhenrenInline`, re-declaring it on `:root, html body` with `!important` so the
 * override beats the theme's `:root` rule regardless of source order. Reading
 * the live value (instead of hardcoding the stack or referencing a user-font
 * variable) keeps the theme's font list intact and avoids an invalid `var()`
 * fallback chain. `unicode-range: U+E000-F8FF` means normal Han never selects
 * ZhenrenInline, so prepending it leaves ordinary Chinese untouched.
 *
 * This is the renamed OFL derivative `ZhenrenInline`; the original `Oracular`
 * still renders the ritual cards untouched (D25). Injection mirrors ui-theme's
 * `installThemeStyles`: a `<style>` tag owned by a fiber effect, removed on
 * cleanup. No DOM post-hoc replacement, no markdown renderer patch (D21).
 */
import type { Context } from '@deepseek-ai/cordis'
import { ZHENREN_INLINE_FONT_URL } from 'virtual:zhenren-inline-font'

/** Family name of the PUA-only prose derivative (D25). */
export const INLINE_FONT_FAMILY = 'ZhenrenInline'

/** Fallback text stack mirroring ui-theme base.css, used if the live read is empty. */
const DEFAULT_TEXT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'

/**
 * Register the inline font and prepend it to the prose stack.
 * @param ctx - client root context; the effect is disposed with the plugin fiber.
 */
export function installInlineFont(ctx: Context): void {
  // Non-browser runs (node e2e) have no document; mirror ui-theme's guard so the
  // effect callback always returns a disposer (cordis SyncEffect overload).
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    // Prepend to the theme's resolved text stack rather than hardcoding it. The
    // theme owns `--dsw-font-family` on `:root`; read its computed value before
    // our override lands so we preserve the user/built-in font list.
    const base = getComputedStyle(document.documentElement)
      .getPropertyValue('--dsw-font-family')
      .trim()
    const stack = base && !base.includes(INLINE_FONT_FAMILY) ? base : DEFAULT_TEXT_STACK
    const style = document.createElement('style')
    style.dataset.plugin = 'zhenren'
    style.textContent = [
      '@font-face {',
      `  font-family: '${INLINE_FONT_FAMILY}';`,
      `  src: url("${ZHENREN_INLINE_FONT_URL}") format('woff2');`,
      '  unicode-range: U+E000-F8FF;',
      '  font-display: swap;',
      '}',
      ':root, html body {',
      `  --dsw-font-family: '${INLINE_FONT_FAMILY}', ${stack} !important;`,
      '}',
    ].join('\n')
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'zhenren: inline font')
}