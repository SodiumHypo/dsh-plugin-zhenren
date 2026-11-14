/**
 * Oracle-font loading.
 *
 * The font ships inside the client bundle as a data URL: the `/plugins/<id>/`
 * route serves scripts, not arbitrary package files, so a relative `url()` in
 * injected CSS would resolve against the document and 404. A data URL keeps the
 * card self-contained and offline.
 */
import { ORAC_FONT_URL } from 'virtual:orac-font'

/** Family name of the oracle-bone font. */
export const ORACLE_FONT_FAMILY = 'Oracular'

let pending: Promise<boolean> | undefined

/**
 * Load and register the font once per page.
 * @returns whether the font is usable; `false` means "render text, not tofu".
 */
export function loadOracleFont(): Promise<boolean> {
  pending ??= (async () => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return false
    try {
      const face = new FontFace(ORACLE_FONT_FAMILY, `url("${ORAC_FONT_URL}")`)
      await face.load()
      document.fonts.add(face)
      return true
    } catch {
      return false
    }
  })()
  return pending
}
