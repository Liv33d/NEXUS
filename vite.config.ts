import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const singleFilePreview = process.env.NEXUS_SINGLE_FILE === '1'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      disable: singleFilePreview,
      registerType: 'prompt',
      includeAssets: ['nexus-mark.svg', 'nexus-apple-touch.png', 'nexus-icon-192.png', 'nexus-icon-512.png', 'natural-earth-110m-countries.geojson', 'data/*.json'],
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
          { src: 'nexus-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'nexus-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'nexus-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // A cold offline launch uses the onboard SVG Atlas. The connected
        // MapLibre renderer and its worker are fetched only when online, then
        // remain eligible for the browser's normal HTTP cache.
        globIgnores: ['**/ConnectedMapView-*.js', '**/ConnectedMapView-*.css', '**/maplibre-gl-worker-*.js'],
        runtimeCaching: [
          // Time-sensitive APIs are never service-worker cached. Normalized
          // IndexedDB fallback is the only data cache so the UI can label it
          // honestly as stored data with the original observation time.
          {
            urlPattern: /^https:\/\/mapservices\.weather\.noaa\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nexus-radar-tiles',
              expiration: { maxEntries: 64, maxAgeSeconds: 1800 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/satellitemaps\.nesdis\.noaa\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nexus-noaa-geocolor',
              expiration: { maxEntries: 6, maxAgeSeconds: 1800 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/gibs\.earthdata\.nasa\.gov\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nexus-satellite-tiles',
              expiration: { maxEntries: 120, maxAgeSeconds: 172800 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'nexus-openfreemap',
              expiration: { maxEntries: 180, maxAgeSeconds: 604800 },
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
    cssCodeSplit: !singleFilePreview,
    rollupOptions: {
      output: {
        ...(singleFilePreview ? { inlineDynamicImports: true } : { manualChunks: {
          storage: ['dexie'],
          spatial: ['h3-js']
        } })
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: { reporter: ['text', 'json', 'html'] }
  }
})
