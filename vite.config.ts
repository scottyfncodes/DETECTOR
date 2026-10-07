import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // DETECTOR is served from GitHub Pages at /DETECTOR/, never from the domain
  // root. An absolute base (rather than './') keeps every chunk, icon and the
  // manifest resolvable from the 404.html fallback too, at any path depth.
  // The e2e suite serves the build under the same path.
  base: process.env.DETECTOR_BASE ?? '/DETECTOR/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    // The 3D screen's chunk is mostly Three.js, lazy-loaded on first entry.
    chunkSizeWarningLimit: 700,
  },
  server: { host: true, port: 5173 },
});
