import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor';
          if (id.includes('dexie')) return 'storage';
          if (id.includes('react') || id.includes('lucide-react')) return 'ui-vendor';
        }
      }
    }
  }
})
