import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { webSearch } from './server/search'
import { agent } from './server/agent'
import { convert } from './server/convert'

const proxy = {
  '/ollama': {
    target: 'http://localhost:11434',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/ollama/, ''),
  },
}

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [react(), tailwindcss(), webSearch(), agent(), convert()],
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
})
