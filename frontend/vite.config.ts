import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Playwright owns e2e/ (its own *.spec.ts convention, run via `npm run
    // test:e2e`) — excluded here so Vitest doesn't also try to collect
    // those files as unit tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
