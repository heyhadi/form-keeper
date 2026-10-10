import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig, type Plugin } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGES = ['index', 'plain', 'react', 'vue', 'svelte', 'spa', 'widgets', 'custom', 'files'];

/** Serves spa.html for every /spa/* path, like a real SPA host's history fallback. */
const spaFallback: Plugin = {
  name: 'spa-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      // Only route-like paths; /spa/main.tsx and other assets must pass through.
      if (req.url && /^\/spa\/[^.]*$/.test(req.url)) req.url = '/spa.html';
      next();
    });
  },
};

/** Manual test pages. Served on localhost so the extension's content script runs on them. */
export default defineConfig({
  root: __dirname,
  plugins: [react({ include: /\.tsx$/ }), vue(), svelte(), spaFallback],
  // IPv4 so the e2e `--host-resolver-rules` mapping reaches it; `not-dev.test` is that mapped name.
  server: { host: '127.0.0.1', port: 5174, strictPort: true, allowedHosts: ['not-dev.test'] },
  build: {
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, resolve(__dirname, `${page}.html`)])),
    },
  },
});
