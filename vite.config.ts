import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import glsl from 'vite-plugin-glsl';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), glsl()],
  resolve: {
    alias: {
      '@qualia/core': path.resolve(__dirname, 'packages/core/src'),
      '@qualia/renderer': path.resolve(__dirname, 'packages/renderer/src'),
      '@qualia/ui': path.resolve(__dirname, 'packages/ui/src'),
    },
  },
  worker: {
    format: 'es',
  },
});
