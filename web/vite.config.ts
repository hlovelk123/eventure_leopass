import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Leo Pass',
        short_name: 'LeoPass',
        description: 'Leo Sri Lanka steward scanning and member QR experience.',
        theme_color: '#1463FF',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/.well-known/jwks.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'jwks-cache',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 6 * 60 * 60
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/member/events/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'member-token-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: '0.0.0.0'
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  }
});
