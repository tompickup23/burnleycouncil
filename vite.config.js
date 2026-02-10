import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
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

      // Also copy shared data files
      const sharedDir = resolve(rootDir, 'burnley-council', 'data', 'shared')
      if (existsSync(sharedDir)) {
        const sharedDestDir = resolve(destDir, 'shared')
        mkdirSync(sharedDestDir, { recursive: true })
        cpSync(sharedDir, sharedDestDir, { recursive: true, force: true })
        console.log(`✓ Shared data copied`)
      }
      console.log(`✓ Council data ready (${council})`)
    },
    writeBundle(options) {
      // NOTE: Per-council 404.html is NOT generated here. GitHub Pages only reads the
      // root 404.html (at /404.html), not nested ones. SPA routing for all 4 councils
      // is handled by burnley-council/hub/404.html which is copied to the deploy root
      // by deploy.yml. That file detects which council the URL belongs to and redirects
      // to the council's index.html with ?p= query parameter for client-side routing.

      const outDir = options.dir || resolve(rootDir, 'dist', base.replace(/\//g, ''))
      // Generate sitemap.xml with council-specific base path
      const routes = ['', 'spending', 'doge', 'budgets', 'news', 'about', 'pay', 'compare', 'suppliers', 'procurement', 'politics', 'meetings', 'foi', 'my-area', 'legal']
      const sitemapUrls = routes.map(r => `  <url><loc>${siteUrl}${r}</loc></url>`).join('\n')
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls}
</urlset>`
      writeFileSync(resolve(outDir, 'sitemap.xml'), sitemap)
      console.log('✓ Generated sitemap.xml')
    },
    transformIndexHtml(html) {
      // Replace placeholders in index.html with council-specific values
      html = html
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

      // Inject Cloudflare Web Analytics when token is configured (production only)
      const cfToken = process.env.VITE_CF_ANALYTICS_TOKEN
      if (cfToken) {
        html = html.replace('</body>',
          `  <script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${cfToken}"}'></script>\n  </body>`)
      }

      return html
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
          tanstack: ['@tanstack/react-virtual'],
        },
      },
    },
  },
})
