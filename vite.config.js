import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Raise warning threshold to 1000 kB to suppress the default 500 kB warning
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) requires manualChunks as a function
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@fullcalendar')) return 'fullcalendar';
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
            if (id.includes('lucide-react') || id.includes('axios')) return 'vendor';
          }
        },
      },
    },
  },
})
