import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Separate from vite.config.ts so tests don't load the dev-server plugins (which probe for LibreOffice etc.).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: { environment: 'node', include: ['{src,server,shared}/**/*.test.ts'] },
})
