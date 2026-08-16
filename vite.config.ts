import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['nexus-mark.svg', 'earth-texture.svg'],
      manifest: {
        name: 'NEXUS — See the world connect',
        short_name: 'NEXUS',
        description: 'A privacy-first global signal discovery system.',
        theme_color: '#030506',
        background_color: '#030506',
        display: 'standalone',
        orientation: 'any',
        scope: './',
        start_url: './',
        icons: [
          { src: 'nexus-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/earthquake\.usgs\.gov\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nexus-usgs',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 12, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/(api\.weather\.gov|eonet\.gsfc\.nasa\.gov|services\.swpc\.noaa\.gov)\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nexus-official-feeds',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 30, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/(api|air-quality-api)\.open-meteo\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nexus-observer-context',
              expiration: { maxEntries: 20, maxAgeSeconds: 3600 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          globe: ['react-globe.gl', 'three'],
          storage: ['dexie'],
          spatial: ['h3-js']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: { reporter: ['text', 'json', 'html'] }
  }
})
