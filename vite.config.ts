import { defineConfig } from 'vite';

// Dial device app — vanilla JS, no framework. dist/ is zipped verbatim;
// public/manifest.json + public/icon.png land at the zip root.
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
