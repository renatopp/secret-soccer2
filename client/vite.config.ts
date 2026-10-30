import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Go server (default :8080) owns /ws and /api; Vite proxies them in dev.
const target = process.env.SERVER_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target, ws: true },
      '/api': { target },
    },
  },
})
