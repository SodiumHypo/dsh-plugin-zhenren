import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Build-time virtual modules; tests resolve them to stubs. */
const fontStub = fileURLToPath(new URL('./src/client/virtual-font-stub.ts', import.meta.url))
const glyphImagesStub = fileURLToPath(
  new URL('./src/client/virtual-glyph-images-stub.ts', import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      'virtual:orac-font': fontStub,
      'virtual:glyph-images': glyphImagesStub,
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
