import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Для Telegram Mini App нужен относительный base
  base: './',
  server: {
    port: 5173,
    // Telegram требует HTTPS даже локально
    https: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
