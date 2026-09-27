import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd()),
      '@workspace/api-client-react': path.resolve(process.cwd(), 'frontend/api-client.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  publicDir: false,
  build: {
    // Keep generated Vite output separate from the legacy public/ tree.\n    // Railway/Railpack was serving the tracked legacy public/index.html after build.\n    outDir: path.resolve(process.cwd(), 'dist'),\n    emptyOutDir: true,
    assetsDir: 'assets',
    manifest: true,
    rollupOptions: {
      input: path.resolve(process.cwd(), 'index.html'),
    },
  },
});
