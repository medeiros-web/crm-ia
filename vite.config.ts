import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // Em produção a Vercel injeta SUPABASE_URL/ANON_KEY via process.env (têm
  // prioridade). Em dev, caem para um arquivo .env/.env.local na raiz, para o
  // app já abrir configurado e pular o wizard /setup.
  const fileEnv = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? '';
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? fileEnv.SUPABASE_ANON_KEY ?? '';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
        // Só faz precache do app shell (JS/CSS/HTML/ícones) — chamadas para
        // Supabase (auth, REST, realtime, edge functions) ficam de fora do
        // runtime caching de propósito: é um CRM com inbox em tempo real,
        // dado velho servido do cache seria pior que sem PWA.
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          id: '/',
          name: 'MEGACRM · Agentise',
          short_name: 'MegaCRM',
          description:
            'Automação WhatsApp self-hosted: templates com IA, disparos em massa, inbox em tempo real com handoff IA/humano.',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#0A0A0F',
          background_color: '#0A0A0F',
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/pwa-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
  };
});
