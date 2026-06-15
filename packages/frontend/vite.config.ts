import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // `shared` is a single-CJS workspace package (deliberate, see PRD). Vite would
  // otherwise treat the symlinked package as ESM source and fail to resolve its
  // named exports (`validateParams`, …). Pre-bundle it in dev so esbuild applies
  // CJS→ESM interop, and run the commonjs transform over its dist in the build.
  optimizeDeps: {
    include: ['shared'],
  },
  build: {
    commonjsOptions: {
      include: [/shared/, /node_modules/],
    },
  },
});
