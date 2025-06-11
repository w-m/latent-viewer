import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'public', // serve index.html from /public
  server: { port: 5173 },
  build: {
    outDir: '../dist', // optional "npm run build"
    sourcemap: false,
    terserOptions: {
      format: {
        comments: false,
      },
    },
  },
  plugins: [react()],
});
