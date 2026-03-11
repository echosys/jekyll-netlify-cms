import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'flow-vendor': ['@xyflow/react'],
          'zip-vendor': ['jszip'],
          'dagre-vendor': ['@dagrejs/dagre'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Both routes handled by fs-server.ts (port 3001) in local dev.
      // In Vercel production, /api/pg-* are serverless functions; /api/fs/* doesn't exist.
      '/api/fs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/pg-': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/mongo-': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
