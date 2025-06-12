import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: 'public', // serve index.html from /public
  envDir: '../', // look for .env files in project root
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // allow importing from project root
  },
  resolve: {
    alias: {
      '/src': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist', // optional "npm run build"
    sourcemap: false,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./public/index.html', import.meta.url)),
      },
    },
    terserOptions: {
      format: {
        comments: false,
      },
    },
  },
  base: './', // Use relative paths for assets
  plugins: [react()],
});
