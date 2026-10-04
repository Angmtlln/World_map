/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from https://angmtlln.github.io/World_map/
  base: '/World_map/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
