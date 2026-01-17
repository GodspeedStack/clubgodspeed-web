import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'index.html',
                aau: 'aau.html',
                about: 'about.html',
                academy: 'academy.html',
                calendarEmbed: 'calendar-embed.html',
                calendarPreview: 'calendar-preview.html',
                cardPreview: 'card-preview.html',
                coachPortal: 'coach-portal.html',
                contact: 'contact.html',
                parentAudit: 'parent-audit.html',
                parentPortal: 'parent-portal.html',
                parents: 'parents.html',
                product: 'product.html',
                shop: 'shop.html',
                skillAudit: 'skill-audit.html',
                training: 'training.html',
            },
        },
    },
})
