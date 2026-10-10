import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.png', 'icons/apple-touch-icon.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff,woff2}'], navigateFallback: 'index.html' },
      manifest: {
        name: 'Митти юракча: Главный',
        short_name: 'Главный',
        description: 'Митти юракча: внутренний учёт клиники',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff6ec',
        theme_color: '#bd5a17',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
