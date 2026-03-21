import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: '.',
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    lib: {
      entry: 'src/portals/dues-entry.jsx',
      formats: ['iife'],
      name: 'DuesTransparencyWidget',
      fileName: () => 'dues-widget.js'
    },
    outDir: 'build',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    open: false,
    watch: {
      ignored: [
        '**/_current_backup_before_reset/**',
        '**/_broken_backup/**',
        '**/node_modules/**',
        '**/.git/**'
      ]
    }
  },
  publicDir: 'public'
});
