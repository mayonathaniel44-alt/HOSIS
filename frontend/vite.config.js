import react from '@vitejs/plugin-react'
import { cpSync, createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

const housekeepingSource = fileURLToPath(new URL('../../HOSIS-Housekeeping/hosis-housekeeping/frontend/src/modules/housekeeping', import.meta.url))
const housekeepingDependencies = ['react-dom', 'jspdf', 'jspdf-autotable', 'qrcode', 'write-excel-file/browser']
const departmentSources = ['admin', 'engineering', 'finance', 'food-and-beverage', 'front-office', 'hr', 'sales-marketing']
  .map((name) => fileURLToPath(new URL(`../departments/${name}/frontend`, import.meta.url)))
const engineeringPublic = fileURLToPath(new URL('../departments/engineering/public/engineering-workspace', import.meta.url))

function engineeringStaticPages() {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
  }
  return {
    name: 'engineering-static-pages',
    configureServer(server) {
      server.middlewares.use('/engineering-workspace', async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const asset = req.url.split('?')[0]
        if (!/^\/(?:assets\/)?[a-zA-Z0-9-]+\.(?:html|js|css|png)$/.test(asset)) return next()
        const file = join(engineeringPublic, asset)
        try {
          const info = await stat(file)
          if (!info.isFile()) return next()
          for (const [header, value] of Object.entries(server.config.server.headers || {})) {
            res.setHeader(header, value)
          }
          res.setHeader('Content-Type', contentTypes[extname(file)])
          res.setHeader('Content-Length', info.size)
          if (req.method === 'HEAD') return res.end()
          createReadStream(file).on('error', (error) => res.destroy(error)).pipe(res)
        } catch (error) {
          if (error.code === 'ENOENT') return next()
          next(error)
        }
      })
    },
    writeBundle({ dir }) {
      cpSync(engineeringPublic, join(dir, 'engineering-workspace'), { recursive: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), engineeringStaticPages()],
  resolve: {
    alias: { '@housekeeping': housekeepingSource },
    dedupe: ['react', 'react-dom', 'jspdf', 'jspdf-autotable', 'qrcode', 'write-excel-file', 'lucide-react', 'recharts', 'dompurify'],
  },
  optimizeDeps: {
    include: [...housekeepingDependencies, 'lucide-react', 'recharts', 'dompurify'],
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
      allow: [searchForWorkspaceRoot(fileURLToPath(new URL('.', import.meta.url))), housekeepingSource, ...departmentSources],
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
