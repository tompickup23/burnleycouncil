import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
  base: '/',
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
