import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const localItemIconsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'item-icons')
const localItemIconFiles = new Map([
  ['blocks-overworld-sprites.svg', 'image/svg+xml'],
  ['blocks-nether-sprites.svg', 'image/svg+xml'],
  ['blocks-end-sprites.svg', 'image/svg+xml'],
  ['blocks-other-sprites.svg', 'image/svg+xml'],
  ['materials-sprites.svg', 'image/svg+xml'],
  ['equipment-sprites.svg', 'image/svg+xml'],
  ['spawn-eggs-sprites.svg', 'image/svg+xml'],
  ['food-sprites.svg', 'image/svg+xml'],
  ['transport-sprites.svg', 'image/svg+xml'],
])

const localItemIconsPlugin = {
  name: 'local-item-icons',
  configureServer(server) {
    server.middlewares.use('/local-item-icons', async (request, response, next) => {
      const fileName = request.url?.split('?')[0].replace(/^\/+/, '')
      if (!fileName || !localItemIconFiles.has(fileName)) return next()

      try {
        const image = await readFile(path.join(localItemIconsDir, fileName))
        response.setHeader('Content-Type', localItemIconFiles.get(fileName))
        response.setHeader('Cache-Control', 'no-store')
        response.end(request.method === 'HEAD' ? undefined : image)
      } catch {
        response.statusCode = 404
        response.end()
      }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localItemIconsPlugin],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
})
