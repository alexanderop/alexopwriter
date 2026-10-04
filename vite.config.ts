import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { join } from 'node:path'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env['VITE_BASE_PATH'] ?? '/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'alexopwriter',
        short_name: 'alexopwriter',
        start_url: base,
        scope: base,
        description: 'A quiet, local-first writing app.',
        theme_color: '#fbfaf8',
        background_color: '#fbfaf8',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && (url.pathname.endsWith('.wasm') || url.pathname.endsWith('.mjs')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'alexopwriter-model-runtime',
              expiration: { maxEntries: 4 },
            },
          },
        ],
      },
    }),
  ],
  resolve: { dedupe: ['vue'] },
  worker: { format: 'es' },
  server: { port: 5186, strictPort: true },
  preview: { port: 5186, strictPort: true },
  build: {
    target: 'es2022',
    ...(process.env['WRITER_RUN_DIR'] ? { outDir: join(process.env['WRITER_RUN_DIR'], 'build') } : {}),
  },
})
