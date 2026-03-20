import { defineConfig } from 'vite';

export default defineConfig({
 root: '.',
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
