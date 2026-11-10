/**
 * Two artifacts, one package (CLAUDE.md §4.1):
 *
 * - `lib/index.js` — host half, plain ESM for Node;
 * - `lib/client.js` — browser half, a lazy CJS factory registered with the
 *   loader's module table. The banner/intro/footer mirror the harness client
 *   preset (`packages/client/tsdown.client.ts`) exactly.
 *
 * The oracle font is inlined as a data URL: `/plugins/<id>/` serves bundle
 * scripts only, so a relative `url()` would 404. OFL-1.1 permits embedding.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type TsdownPlugin } from 'tsdown'

const root = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ID = 'dsh-plugin-zhenren'

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
    plugins: [oracFont()],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
