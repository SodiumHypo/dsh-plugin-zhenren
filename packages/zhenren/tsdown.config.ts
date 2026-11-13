/**
 * Two artifacts, one package (CLAUDE.md §4.1):
 *
 * - `lib/index.js` — host half, plain ESM for Node;
 * - `lib/client.js` — browser half, a lazy CJS factory registered with the
 *   loader's module table. The banner/intro/footer mirror the harness client
 *   preset (`packages/client/tsdown.client.ts`) exactly.
 *
 * The oracle font and the curated HUST-OBC image glyphs (D17) are inlined as
 * data URLs: `/plugins/<id>/` serves bundle scripts only, so a relative `url()`
 * would 404. OFL-1.1 permits embedding the font; the glyphs are public-domain.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type TsdownPlugin } from 'tsdown'

const root = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ID = 'dsh-plugin-zhenren'
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }

/** Serve `data/fonts/orac.woff2` as `virtual:orac-font`. */
function oracFont(): TsdownPlugin {
  const virtualId = 'virtual:orac-font'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'zhenren:orac-font',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null
      const font = readFileSync(resolve(root, 'data/fonts/orac.woff2'))
      const url = `data:font/woff2;base64,${font.toString('base64')}`
      return `export const ORAC_FONT_URL = ${JSON.stringify(url)}`
    },
  }
}

/**
 * Serve the curated HUST-OBC image glyphs (D17) as `virtual:glyph-images`:
 * a `glyphChar` → PNG data-URL map. Like the font, the bytes are inlined because
 * `/plugins/<id>/` serves scripts only. The glyphs are public-domain (arXiv
 * 2401.15365); attribution travels in the manifest and card footers.
 */
function glyphImages(): TsdownPlugin {
  const virtualId = 'virtual:glyph-images'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'zhenren:glyph-images',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null
      const dataDir = resolve(root, 'data')
      const manifest = JSON.parse(readFileSync(resolve(dataDir, 'hust-glyphs.json'), 'utf8')) as {
        glyphs: Record<string, { file: string }>
      }
      const images: Record<string, string> = {}
      for (const [char, entry] of Object.entries(manifest.glyphs)) {
        const png = readFileSync(resolve(dataDir, entry.file))
        images[char] = `data:image/png;base64,${png.toString('base64')}`
      }
      return `export const GLYPH_IMAGES = ${JSON.stringify(images)}`
    },
  }
}

/**
 * Serve the renamed OFL derivative `data/fonts/zhenren-inline.woff2` (D21/D25)
 * as `virtual:zhenren-inline-font`. Its cmap is PUA-only (U+E000–F8FF), so the
 * client gates it with `unicode-range` and prepends it to the prose font stack:
 * normal Chinese is untouched, inline oracle glyphs resolve to the derivative.
 */
function inlineFont(): TsdownPlugin {
  const virtualId = 'virtual:zhenren-inline-font'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'zhenren:inline-font',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null
      const font = readFileSync(resolve(root, 'data/fonts/zhenren-inline.woff2'))
      const url = `data:font/woff2;base64,${font.toString('base64')}`
      return `export const ZHENREN_INLINE_FONT_URL = ${JSON.stringify(url)}`
    },
  }
}

/**
 * Serve the compact client dataset `data/client-glyphs.json` (D23) as
 * `virtual:client-glyphs`: a `glyphChar` → record map for the daily-glyph widget
 * and inline lookups, which run client-side without a host tool call. The JSON
 * is already a valid object literal, so it is embedded verbatim.
 */
function clientGlyphs(): TsdownPlugin {
  const virtualId = 'virtual:client-glyphs'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'zhenren:client-glyphs',
    resolveId(id) {
      return id === virtualId ? resolvedId : null
    },
    load(id) {
      if (id !== resolvedId) return null
      const json = readFileSync(resolve(root, 'data/client-glyphs.json'), 'utf8')
      return `export const CLIENT_GLYPHS = ${json}`
    },
  }
}

export default defineConfig([
  {
    name: `${PACKAGE_ID}:host`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
  },
  {
    name: `${PACKAGE_ID}:client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    clean: false,
    sourcemap: true,
    // Platform modules come from the loader's module table, never the bundle.
    external: ['react', 'react/jsx-runtime'],
    plugins: [oracFont(), glyphImages(), inlineFont(), clientGlyphs()],
    // D24: the package version is baked in at build time for the update check.
    define: { __ZHENREN_VERSION__: JSON.stringify(pkg.version) },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
