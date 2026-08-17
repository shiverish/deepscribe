import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
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
  },
  test: {
    // De Dexie/fake-indexeddb tests doen veel kleine awaits en lopen parallel met
    // de zwaardere SQLite-suites. Op trage CI-runners haalt 5s (de default) het niet.
    testTimeout: 30000,
    hookTimeout: 30000
  }
})
