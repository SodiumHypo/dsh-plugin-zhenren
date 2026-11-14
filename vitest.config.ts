import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Build-time virtual modules; tests resolve them to stubs. */
const fontStub = fileURLToPath(new URL('./src/client/virtual-font-stub.ts', import.meta.url))
const glyphImagesStub = fileURLToPath(
  new URL('./src/client/virtual-glyph-images-stub.ts', import.meta.url),
)
const inlineFontStub = fileURLToPath(
  new URL('./src/client/virtual-inline-font-stub.ts', import.meta.url),
)
const clientGlyphsStub = fileURLToPath(
  new URL('./src/client/virtual-client-glyphs-stub.ts', import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      'virtual:orac-font': fontStub,
      'virtual:glyph-images': glyphImagesStub,
      'virtual:zhenren-inline-font': inlineFontStub,
      'virtual:client-glyphs': clientGlyphsStub,
    },
  },
  // Mirrors the tsdown `define` so client code reading the version typechecks/runs.
  define: { __ZHENREN_VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
