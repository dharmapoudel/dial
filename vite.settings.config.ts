import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Dial settings page — runs on the PHONE in the companion app.
// Single self-contained file; the device refuses a settings page over 1 MiB.
const HARD_CAP = 1024 * 1024;

function sizeGuard(): Plugin {
  return {
    name: 'dial-settings-size-guard',
    closeBundle() {
      const out = resolve(__dirname, 'dist', 'settings.html');
      let bytes: number;
      try {
        bytes = statSync(out).size;
      } catch {
        return;
      }
      if (bytes > HARD_CAP) {
        throw new Error(
          `settings.html is ${(bytes / 1024).toFixed(1)} KiB — over the 1 MiB hard cap; the install fails.`,
        );
      }
      console.log(`settings.html ${(bytes / 1024).toFixed(1)} KiB — under cap`);
    },
  };
}

export default defineConfig({
  root: 'settings',
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'settings/settings.html'),
    },
  },
  plugins: [viteSingleFile(), sizeGuard()],
});
