import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

const target = process.env.GIT_TICKET_CANVAS_API_URL || process.env.TKCANVAS_API_URL || 'http://127.0.0.1:7777'
const api = new URL(target)
if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) ||
    api.username || api.password || api.pathname !== '/' || api.search || api.hash) {
  throw new Error('GIT_TICKET_CANVAS_API_URL (or legacy TKCANVAS_API_URL) must be a loopback HTTP origin')
}

export default defineConfig({
  root: 'web',
  base: './',
  plugins: [preact()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target } },
  },
})
