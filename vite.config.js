import { defineConfig } from 'vite';

// Relative base so the built site works from any sub-path (GitHub Pages, file shares…).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
