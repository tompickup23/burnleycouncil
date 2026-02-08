import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { cpSync, existsSync } from 'fs'
import { resolve } from 'path'

/**
 * Copies council-specific data from burnley-council/data/{council}/ to public/data/
 * before each build. Uses the VITE_COUNCIL env var to determine which council.
 */
function councilDataPlugin() {
  const council = process.env.VITE_COUNCIL || 'burnley'
  const srcDir = resolve(import.meta.dirname || '.', 'burnley-council', 'data', council)
  const destDir = resolve(import.meta.dirname || '.', 'public', 'data')
  return {
    name: 'council-data',
    buildStart() {
      if (!existsSync(srcDir)) {
        console.warn(`⚠ Council data dir not found: ${srcDir}`)
        return
      }
      console.log(`📋 Copying ${council} data → public/data/`)
      cpSync(srcDir, destDir, { recursive: true, force: true })
      console.log(`✓ Council data ready (${council})`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    councilDataPlugin(),
    // Pre-compress assets with gzip for faster serving
    compression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024, // Only compress files > 1KB
    }),
    // Also generate brotli-compressed versions
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],
  base: process.env.VITE_BASE || '/burnleycouncil/',
  build: {
    // Enable source maps for debugging in production
    sourcemap: false,
    // Target modern browsers for smaller output
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          // Split recharts into its own chunk (biggest dependency ~350KB)
          recharts: ['recharts'],
          // Split React vendor code
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Split tanstack libs
          tanstack: ['@tanstack/react-virtual', '@tanstack/react-query'],
        },
      },
    },
  },
})
