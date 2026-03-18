/**
 * @module savings/playbook
 * Reform Playbook generation and MTFS comparison.
 */

/**
 * Generate a phased Reform Playbook for a portfolio.
 * Uses 5-tier model: immediate_recovery -> procurement_reform -> demand_management
 * -> service_redesign -> income_generation
 *
 * @param {Object} portfolio - Portfolio from cabinet_portfolios.json
 * @param {Array} directives - Output from generateDirectives()
 * @param {Object} cabinetData - Full cabinet_portfolios.json (for MTFS comparison)
 * @returns {Object|null} Playbook with phases, red lines, targets
 */
export function generateReformPlaybook(portfolio, directives, cabinetData) {
  if (!portfolio) return null

  // Phase directives by timeline
  const year1 = directives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('immediate') || tl.includes('0-3') || tl.includes('3-6') || tl.includes('short')
  })
  const year2 = directives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('6-12') || tl.includes('12-18') || tl.includes('medium')
  })
  const year3 = directives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('18-') || tl.includes('24-') || tl.includes('long') || tl.includes('structural')
  })

  // Uncategorized go to year 2
  const categorized = new Set([...year1, ...year2, ...year3].map(d => d.id))
  for (const d of directives) {
    if (!categorized.has(d.id)) year2.push(d)
  }

  const sumSavings = (items) => items.reduce((s, d) => s + (d.save_central || 0), 0)

  // Group by tier for the 5-tier view
  const byTier = {}
  for (const d of directives) {
    const tier = d.tier || 'demand_management'
    if (!byTier[tier]) byTier[tier] = { directives: [], total: 0 }
    byTier[tier].directives.push(d)
    byTier[tier].total += d.save_central || 0
  }

  // Group by ownership
  const centralised = directives.filter(d => d.owner === 'centralised')
  const portfolioOwned = directives.filter(d => d.owner !== 'centralised')

  // Red lines - statutory duties rated 'red'
  const redLines = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'red')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  // Amber zones - statutory duties rated 'amber'
  const amberZones = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'amber')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  // Green space - statutory duties rated 'green'
  const greenSpace = (portfolio.statutory_duties || [])
    .filter(d => d.risk_level === 'green')
    .map(d => ({ act: d.act, summary: d.summary, risk: d.risk }))

  return {
    portfolio_id: portfolio.id,
    portfolio_title: portfolio.title,
    cabinet_member: portfolio.cabinet_member?.name,
    phases: {
      year_1: { label: 'Quick Wins & Recovery', directives: year1, total_savings: sumSavings(year1) },
      year_2: { label: 'Procurement Reform & Restructure', directives: year2, total_savings: sumSavings(year2) },
      year_3: { label: 'Structural Transformation', directives: year3, total_savings: sumSavings(year3) },
    },
    by_tier: byTier,
    ownership: {
      centralised: { count: centralised.length, total: sumSavings(centralised) },
      portfolio_specific: { count: portfolioOwned.length, total: sumSavings(portfolioOwned) },
    },
    total_savings: sumSavings(directives),
    directive_count: directives.length,
    red_lines: redLines,
    amber_zones: amberZones,
    green_space: greenSpace,
  }
}

/**
 * Compare total savings pipeline against MTFS targets.
 *
 * @param {Array} allDirectives - All directives from generateAllDirectives()
 * @param {Object} cabinetData - Full cabinet_portfolios.json
 * @returns {Object|null} MTFS comparison
 */
export function mtfsComparison(allDirectives, cabinetData) {
  const mtfs = cabinetData?.administration?.mtfs
  if (!mtfs || !allDirectives?.length) return null

  const totalCentral = allDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
  const totalLow = allDirectives.reduce((s, d) => s + (d.save_low || 0), 0)
  const totalHigh = allDirectives.reduce((s, d) => s + (d.save_high || 0), 0)

  // Year 1 = immediate + short-term directives
  const year1Directives = allDirectives.filter(d => {
    const tl = (d.timeline || '').toLowerCase()
    return tl.includes('immediate') || tl.includes('0-3') || tl.includes('3-6') || tl.includes('short')
  })
  const year1Central = year1Directives.reduce((s, d) => s + (d.save_central || 0), 0)

  const target1 = mtfs.savings_targets?.['2026_27'] ?? 0
  const target2 = mtfs.savings_targets?.two_year_total ?? 0

  return {
    mtfs_year1_target: target1,
    mtfs_two_year_target: target2,
    identified_low: totalLow,
    identified_central: totalCentral,
    identified_high: totalHigh,
    year1_deliverable: year1Central,
    year1_coverage_pct: target1 ? Math.round(year1Central / target1 * 100) : null,
    two_year_coverage_pct: target2 ? Math.round(totalCentral / target2 * 100) : null,
    gap_or_surplus: totalCentral - target2,
    prior_year_shortfall: mtfs.prior_year_performance?.adult_services_shortfall ?? 0,
    cost_pressures: mtfs.cost_pressures_2026_27?.total ?? 0,
    redundancy_provision: mtfs.redundancy_provision ?? 0,
  }
}
