import { defineConfig } from 'vite';
import react         from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // your dev server host/port can stay defaults (5173)
    proxy: {
      // whenever you do fetch('/api/whatever'), Vite will forward
      // it to http://localhost:8000/api/whatever for you.
      '/api': {
        target:   'http://localhost:8000',
        changeOrigin: true,
        secure:   false,
      },
    },
  },
});
