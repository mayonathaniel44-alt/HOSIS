import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

const housekeepingSource = fileURLToPath(new URL('../../HOSIS-Housekeeping/hosis-housekeeping/frontend/src/modules/housekeeping', import.meta.url))
const housekeepingDependencies = ['react-dom', 'jspdf', 'jspdf-autotable', 'qrcode', 'write-excel-file/browser']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@housekeeping': housekeepingSource },
    dedupe: ['react', 'react-dom', 'jspdf', 'jspdf-autotable', 'qrcode', 'write-excel-file'],
  },
  optimizeDeps: {
    include: housekeepingDependencies,
  },
  server: {
    host: true,
    strictPort: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
    fs: {
      allow: [searchForWorkspaceRoot(fileURLToPath(new URL('.', import.meta.url))), housekeepingSource],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (outgoing, incoming) => {
            outgoing.setHeader('X-Forwarded-For', incoming.socket.remoteAddress)
            outgoing.setHeader('X-Forwarded-Proto', 'http')
            // The browser reaches the API through the same HOSIS frontend origin.
            if (incoming.headers.origin === `http://${incoming.headers.host}`) {
              outgoing.removeHeader('origin')
            }
          })
        },
      },
    },
  },
})
