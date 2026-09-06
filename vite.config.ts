import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

const NVIDIA_API_BASE = 'https://integrate.api.nvidia.com';

export default defineConfig(({ mode }) => {
  // `loadEnv` sin prefijo expone tambien las variables privadas del .env.
  // Solo se usan aqui, en el proceso de Node: nunca se inyectan en el bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const nvidiaApiKey = (env.NVIDIA_API_KEY ?? '').trim();

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['icon.svg', 'favicon.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'EcoLingo — Reciclaje para Todos',
          short_name: 'EcoLingo',
          description: 'Aprende a reciclar correctamente y encuentra puntos limpios oficiales.',
          lang: 'es-CL',
          theme_color: '#166534',
          background_color: '#ffffff',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          categories: ['education', 'productivity', 'lifestyle'],
          shortcuts: [
            { name: 'Buscar material', short_name: 'Buscar', url: '/#home' },
            { name: 'Ver puntos limpios', short_name: 'Mapa', url: '/#map' },
            { name: 'Abrir escáner', short_name: 'Escáner', url: '/#scanner' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles-v1',
                expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/storage\.googleapis\.com\/tfjs-models\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tfjs-models-v1',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'open-food-facts-v1',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-v1' },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    optimizeDeps: { exclude: ['lucide-react'] },
    server: {
      proxy: {
        /**
         * Proxy de desarrollo hacia NVIDIA Build.
         *
         * La clave `nvapi-...` se anade aqui, en el servidor de Vite, para que
         * no llegue nunca al navegador ni al bundle. En produccion este rol lo
         * cumple la Edge Function `supabase/functions/ai-classify`.
         */
        '/api/nvidia': {
          target: NVIDIA_API_BASE,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/nvidia/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (nvidiaApiKey) proxyReq.setHeader('Authorization', `Bearer ${nvidiaApiKey}`);
              proxyReq.setHeader('Accept', 'application/json');
            });
          },
        },
      },
    },
  };
});
