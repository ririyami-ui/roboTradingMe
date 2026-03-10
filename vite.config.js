import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api-coingecko': {
        target: 'https://api.coingecko.com/api/v3',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-coingecko/, ''),
      },
      '/api-cryptocompare': {
        target: 'https://min-api.cryptocompare.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-cryptocompare/, ''),
      },
      '/api-coincap': {
        target: 'https://api.coincap.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-coincap/, '/v2'),
        // Tambahkan logging untuk debugging
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(`[Vite Proxy] Forwarding request to CoinCap: ${proxyReq.method} ${proxyReq.path}`);
          });
        },
      },
      '/api-indodax-tapi': {
        target: 'https://indodax.com/tapi',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-indodax-tapi/, ''),
        secure: false, // Menghindari isu sertifikat SSL pada dev
      },
      '/api-indodax-public': {
        target: 'https://indodax.com/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-indodax-public/, ''),
        secure: false, // Menghindari isu sertifikat SSL pada dev
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'Crypto Signal Analyzer',
        short_name: 'CryptoAnalyzer',
        description: 'A web application for analyzing cryptocurrency signals and trends.',
        theme_color: '#111827',
        background_color: '#1f2937',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})