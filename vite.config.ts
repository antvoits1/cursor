import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The local host is also published through a tunnel. Vite blocks unknown
    // Host headers by default; any host that reaches this process is already
    // past the tunnel, so the check is just in the way.
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
