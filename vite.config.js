import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Copies council-specific data and parameterises index.html at build time.
 * Uses VITE_COUNCIL env var to determine which council config to use.
 */
function councilDataPlugin() {
  const council = process.env.VITE_COUNCIL || 'burnley'
  const base = process.env.VITE_BASE || '/burnleycouncil/'
  const rootDir = import.meta.dirname || '.'
  const srcDir = resolve(rootDir, 'burnley-council', 'data', council)
  const destDir = resolve(rootDir, 'public', 'data')

  // Load council config for HTML parameterisation
  let config = {}
  const configPath = resolve(srcDir, 'config.json')
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf-8'))
  }

  const councilName = config.council_name || 'Council'
  const councilFull = config.council_full_name || 'Borough Council'
  const publisher = config.publisher || 'AI DOGE'
  const siteUrl = `https://aidoge.co.uk${base}`
  const totalSpend = config.doge_context?.total_spend || ''
  const transactions = config.doge_context?.transactions || ''

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
    writeBundle(options) {
      // Generate 404.html for GitHub Pages SPA routing
      const outDir = options.dir || resolve(rootDir, 'dist', base.replace(/\//g, ''))
      const html404 = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    // GitHub Pages SPA routing — redirect 404s to the SPA with the path preserved
    var base = '${base}';
    window.location.replace(base + '?p=' + encodeURIComponent(window.location.pathname));
  </script>
</head>
<body></body>
</html>`
      writeFileSync(resolve(outDir, '404.html'), html404)
      console.log('✓ Generated 404.html for SPA routing')
    },
    transformIndexHtml(html) {
      // Replace placeholders in index.html with council-specific values
      return html
        .replaceAll('%COUNCIL_NAME%', councilName)
        .replaceAll('%COUNCIL_FULL%', councilFull)
        .replaceAll('%COUNCIL_ID%', config.council_id || council)
        .replaceAll('%PUBLISHER%', publisher)
        .replaceAll('%SITE_URL%', siteUrl)
        .replaceAll('%BASE_URL%', base)
        .replaceAll('%TOTAL_SPEND%', totalSpend)
        .replaceAll('%TRANSACTIONS%', String(transactions))
        .replaceAll('%OFFICIAL_URL%', config.official_website || '')
        .replaceAll('%COUNTY%', 'Lancashire')
        .replaceAll('%GEO_PLACENAME%', `${councilName}, Lancashire`)
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
