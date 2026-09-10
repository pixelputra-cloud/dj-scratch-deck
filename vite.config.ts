/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from '/' locally; the GitHub Pages workflow sets DEPLOY_BASE to
  // '/dj-scratch-deck/' so the built asset URLs carry the project sub-path.
  // Runtime references to public/ files go through src/lib/asset.ts, which
  // reads import.meta.env.BASE_URL (derived from this).
  base: process.env.DEPLOY_BASE || '/',
  plugins: [react(), tailwindcss()],
  // The audio worklet is authored as plain JS in public/worklets and loaded
  // at runtime via audioWorklet.addModule('/worklets/turntable-processor.js').
  // Nothing here needs to know about it — it ships verbatim from public/.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/audio/**', 'src/gesture/**', 'src/lib/**'],
    },
  },
})
