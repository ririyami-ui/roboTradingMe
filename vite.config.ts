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
      '/api-indodax-tradingview': {
        target: 'https://indodax.com/tradingview',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-indodax-tradingview/, ''),
        secure: false,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'SaktiBot Trade',
        short_name: 'SaktiBot',
        description: 'SaktiBot Trade: Advanced AI-Powered Crypto Trading Assistant.',
        theme_color: '#111827',
        background_color: '#1f2937',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        gcm_sender_id: "1039538002307",
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('@google/generative-ai')) {
              return 'vendor-ai';
            }
            if (id.includes('lightweight-charts')) {
              return 'vendor-charts';
            }
            return 'vendor-others';
          }
        }
      }
    }
  }
})