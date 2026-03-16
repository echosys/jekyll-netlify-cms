import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  plugins: [react()],
  server: {
    // Proxy to local fs-server only when running dev:all (keeps remote deploys clean)
    proxy: {
      // previous server proxies for /api were removed — this app is Firestore-first now
    },
  },
}));
