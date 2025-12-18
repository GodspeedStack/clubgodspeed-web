import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                aau: resolve(__dirname, 'aau.html'),
                about: resolve(__dirname, 'about.html'),
                academy: resolve(__dirname, 'academy.html'),
                calendarEmbed: resolve(__dirname, 'calendar-embed.html'),
                calendarPreview: resolve(__dirname, 'calendar-preview.html'),
                cardPreview: resolve(__dirname, 'card-preview.html'),
                coachPortal: resolve(__dirname, 'coach-portal.html'),
                contact: resolve(__dirname, 'contact.html'),
                parentAudit: resolve(__dirname, 'parent-audit.html'),
                parentPortal: resolve(__dirname, 'parent-portal.html'),
                parents: resolve(__dirname, 'parents.html'),
                product: resolve(__dirname, 'product.html'),
                shop: resolve(__dirname, 'shop.html'),
                skillAudit: resolve(__dirname, 'skill-audit.html'),
                training: resolve(__dirname, 'training.html'),
            },
        },
    },
})
