import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { APP_PORT, OLLAMA_URL, LMSTUDIO_URL } from './shared/constants'
import { webSearch } from './server/web'
import { agent } from './server/agent'
import { convert } from './server/convert'

const proxy = {
  '/lmstudio': {
    target: LMSTUDIO_URL,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/lmstudio/, ''),
  },
  '/ollama': {
    target: OLLAMA_URL,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ollama/, ''),
  },
}

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: [react(), tailwindcss(), webSearch(), agent(), convert()],
  server: { port: APP_PORT, proxy },
  preview: { port: APP_PORT, proxy },
})
