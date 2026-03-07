import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Default base '/' (Firebase). GitHub Pages requires explicit --base=/frc-2026-analytics/
  base: process.env.DEPLOY_TARGET === 'ghpages' ? '/frc-2026-analytics/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
