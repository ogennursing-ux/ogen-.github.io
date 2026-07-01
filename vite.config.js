import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the build works whether it is served
// from a domain root or from a GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two independent entry points: the family signing app (index.html)
      // and the standalone social-worker forms portal (worker.html).
      input: {
        main: resolve(__dirname, 'index.html'),
        worker: resolve(__dirname, 'worker.html'),
      },
    },
  },
});
