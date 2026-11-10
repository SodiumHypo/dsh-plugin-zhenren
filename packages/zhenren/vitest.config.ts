import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** The font is a build-time virtual module; tests resolve it to a stub. */
const fontStub = fileURLToPath(new URL('./src/client/virtual-font-stub.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'virtual:orac-font': fontStub,
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
