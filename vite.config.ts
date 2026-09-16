import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const TOKEN_SERVER = process.env.TOKEN_SERVER_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // Proxy the Twilio token endpoint to the local express token server
    // (`npm run token-server`) so the relative `/api/token` fetch works in dev.
    proxy: {
      '/api': {
        target: TOKEN_SERVER,
        changeOrigin: true,
      },
    },
  },
});
