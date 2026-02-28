import { useState, useEffect, useMemo, Fragment } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, PiggyBank, Building, Landmark, HardHat, Wallet, BarChart3, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { formatCurrency, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState, DataFreshness } from '../components/ui'
import { CHART_COLORS_EXTENDED as DEPT_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import './Budgets.css'

// Departments to exclude from the main table (reserves shown separately, zero-budget items hidden)
const EXCLUDED_DEPARTMENTS = new Set([
  'Earmarked Reserves',
  'Management Team',
  'People & Development',
])

/**
 * Extract core departments from budget data dynamically.
 * Returns departments that appear in any budget year with a non-zero value.
 * Handles Burnley-specific Finance & Property split by merging those entries.
 */
function extractCoreDepartments(revenueBudgets) {
  const deptSet = new Set()
  const hasFinanceSplit = revenueBudgets.some(b =>
    b.departments?.['Finance (from 01/04/2025)'] !== undefined
  )

  for (const b of revenueBudgets) {
    for (const [name, val] of Object.entries(b.departments || {})) {
      if (EXCLUDED_DEPARTMENTS.has(name)) continue
      // Skip the split sub-departments — they'll be shown as merged "Finance & Property"
      if (hasFinanceSplit && (name === 'Finance (from 01/04/2025)' || name === 'Property (back in-house 01/04/2025)')) continue
      if (val !== 0 && val !== null && val !== undefined) {
        deptSet.add(name)
      }
    }
  }

  // If Finance & Property was split, ensure the merged entry is included
  if (hasFinanceSplit && !deptSet.has('Finance & Property')) {
    deptSet.add('Finance & Property')
  }

  return Array.from(deptSet).sort()
}

function Budgets() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const councilTier = config.council_tier || 'district'
  const hasBudgets = config.data_sources?.budgets !== false
  const hasBudgetTrends = config.data_sources?.budget_trends
  const hasCollectionRates = config.data_sources?.collection_rates

  // Load different data depending on what's available
  const budgetUrls = hasBudgets
    ? ['/data/budgets.json', '/data/budget_insights.json', '/data/budget_mapping.json', '/data/budget_efficiency.json']
    : ['/data/budgets_govuk.json', '/data/revenue_trends.json', '/data/budgets_summary.json', '/data/budget_insights.json', '/data/budget_efficiency.json', '/data/budget_mapping.json']
  // Collection rates loaded separately (optional)
  const collectionUrl = hasCollectionRates ? ['/data/collection_rates.json'] : []
  const { data, loading, error } = useData([...budgetUrls, ...collectionUrl])
  // When hasBudgets=true: data = [budgets.json, budget_insights.json]
  //   → budgetData, insights used for full 4-tab view
  // When hasBudgets=false: data = [budgets_govuk.json, revenue_trends.json, budgets_summary.json, budget_insights.json, budget_efficiency.json]
  //   → govukRaw, trendsRaw, summaryRaw, insightsRaw, efficiencyRaw used for BudgetTrendsView
  const d = data || []
  const budgetData = hasBudgets ? (d[0] || null) : null
  const insights = hasBudgets ? (d[1] || null) : null
  const budgetMapping = hasBudgets ? (d[2] || null) : null  // budget_mapping.json
  const budgetEfficiency = hasBudgets ? (d[3] || null) : null  // budget_efficiency.json
  // For non-budget councils, these feed into BudgetTrendsView
  const govukRaw = !hasBudgets ? (d[0] || null) : null        // budgets_govuk.json
  const trendsRaw = !hasBudgets ? (d[1] || null) : null        // revenue_trends.json
  const budgetSummary = !hasBudgets ? (d[2] || null) : null    // budgets_summary.json
  const govukInsights = !hasBudgets ? (d[3] || null) : null    // budget_insights.json
  const efficiencyData = !hasBudgets ? (d[4] || null) : null   // budget_efficiency.json
  const mappingData = !hasBudgets ? (d[5] || null) : null      // budget_mapping.json
  // Collection rates: always last in the array when hasCollectionRates is true
  const collectionRates = hasCollectionRates ? (d[d.length - 1] || null) : null

  // Property assets (optional — for estate overview)
  const { data: propertyAssetsRaw } = useData('/data/property_assets.json')

  const [activeTab, setActiveTab] = useState('revenue')
  const [expandedDept, setExpandedDept] = useState(null)
  const [selectedYear, setSelectedYear] = useState(() => {
    // Will be properly initialized once budgetData loads
    return null
  })

  useEffect(() => {
    document.title = `Budget Analysis | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Initialize selectedYear when data first loads
  useEffect(() => {
    if (budgetData && selectedYear === null) {
      setSelectedYear(budgetData.revenue_budgets?.length - 1 || 0)
    }
  }, [budgetData, selectedYear])

  // Unpack all data BEFORE early returns (React Rules of Hooks)
  const revenueBudgets = budgetData?.revenue_budgets || []
  const capitalProgrammes = budgetData?.capital_programmes || []
  const treasury = budgetData?.treasury_and_investment || {}
  const budgetInsights = budgetData?.insights || {}
  const isAutoGenerated = !!budgetData?._generated
  const hasCapital = capitalProgrammes.length > 0
  const hasTreasury = Object.keys(treasury.key_context || {}).length > 0 || (treasury.notable_investments || []).length > 0
  const yoyChanges = insights?.yoy_changes || []
  const highlights = insights?.political_highlights || []
  const efficiency = insights?.efficiency_metrics || {}

  // Revenue chart data
  const revenueChartData = useMemo(() => revenueBudgets.map(b => ({
    year: b.financial_year,
    budget: (b.net_revenue_budget || 0) / 1_000_000,
    councilTax: b.council_tax?.council_element ?? b.council_tax?.[`${config.council_id}_element`] ?? b.council_tax?.burnley_element ?? b.council_tax?.band_d ?? 0,
  })), [revenueBudgets, config])

  // Departmental data for selected year
  const selectedBudget = revenueBudgets[selectedYear] || revenueBudgets[revenueBudgets.length - 1]
  const deptData = selectedBudget?.departments || {}

  // Dynamically extract department list from the data (not hardcoded)
  const coreDepartments = extractCoreDepartments(revenueBudgets)

  // Check if Finance & Property has been split in any year
  const hasFinanceSplit = revenueBudgets.some(b =>
    b.departments?.['Finance (from 01/04/2025)'] !== undefined
  )

  // Helper to get department value, handling Finance & Property split
  const getDeptValue = (budget, dept) => {
    if (dept === 'Finance & Property' && hasFinanceSplit && budget.departments) {
      const fp = budget.departments['Finance & Property']
      const f = budget.departments['Finance (from 01/04/2025)']
      const p = budget.departments['Property (back in-house 01/04/2025)']
      if (fp !== undefined) return fp
      if (f !== undefined && p !== undefined) return f + p
      return null
    }
    return budget.departments?.[dept] ?? null
  }

  // Pie chart data for selected year's departments
  const pieData = useMemo(() => Object.entries(deptData)
    .filter(([name, val]) => val > 0 && !EXCLUDED_DEPARTMENTS.has(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name, val], i) => ({
      name: name.replace('(from 01/04/2025)', '').replace('(back in-house 01/04/2025)', '').trim(),
      value: val,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    })), [deptData])

  // Capital programme chart data
  const latestCapital = capitalProgrammes[capitalProgrammes.length - 1]
  const capitalCategoryData = useMemo(() => latestCapital?.categories ? Object.entries(latestCapital.categories).map(([name, data], i) => ({
    name: name.length > 15 ? name.substring(0, 15) + '...' : name,
    fullName: name,
    value: data.total / 1_000_000,
    note: data.note || '',
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  })) : [], [latestCapital])

  // Funding source data for selected year — handles both budget book and GOV.UK formats
  const fundingData = selectedBudget?.funding_sources || {}
  const fundingChartData = useMemo(() => {
    const fd = fundingData
    // Categorise funding sources by keyword matching
    let ctTotal = 0, brTotal = 0, grantTotal = 0, otherTotal = 0
    for (const [key, val] of Object.entries(fd)) {
      const absVal = Math.abs(val || 0)
      const k = key.toLowerCase()
      if (k.includes('council_tax') || k.includes('council tax')) {
        ctTotal += absVal
      } else if (k.includes('business_rate') || k.includes('non-domestic') || k.includes('non_domestic') || k.includes('nndr')) {
        brTotal += absVal
      } else if (k.includes('grant') || k.includes('revenue_support') || k.includes('new_homes') || k.includes('recovery') || k.includes('funding_guarantee')) {
        grantTotal += absVal
      } else {
        otherTotal += absVal
      }
    }
    return [
      { name: 'Council Tax', value: ctTotal / 1_000_000, color: '#0a84ff' },
      { name: 'Business Rates', value: brTotal / 1_000_000, color: '#30d158' },
      { name: 'Government Grants', value: grantTotal / 1_000_000, color: '#ff9f0a' },
      { name: 'Other', value: otherTotal / 1_000_000, color: '#8e8e93' },
    ].filter(d => d.value > 0.01)
  }, [fundingData])

  // Early returns AFTER all hooks
  if (loading) {
    return <LoadingState message="Loading budget data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  // For councils without detailed budgets.json, render a simpler GOV.UK trends view
  if (!hasBudgets && hasBudgetTrends) {
    return <BudgetTrendsView councilName={councilName} councilFullName={councilFullName} govukData={govukRaw} trendsData={trendsRaw} summaryData={budgetSummary} insightsData={govukInsights} efficiencyData={efficiencyData} mappingData={mappingData} collectionRates={collectionRates} />
  }

  if (!budgetData) {
    return (
      <div className="budgets-page animate-fade-in">
        <header className="page-header">
          <h1>Budget Analysis</h1>
          <p className="subtitle">Budget data is not yet available for {councilFullName}.</p>
        </header>
      </div>
    )
  }

  // Capital programme timeline
  const capitalTimelineData = capitalProgrammes.map(cp => ({
    period: cp.budget_book_year,
    total: cp.total_all_schemes / 1_000_000,
  }))

  return (
    <div className="budgets-page animate-fade-in" aria-live="polite" aria-busy={loading}>
      <header className="page-header">
        <h1>Budget Analysis</h1>
        <p className="subtitle">
          Comprehensive analysis of {councilFullName}'s revenue and capital budgets
        </p>
        <DataFreshness source="Budget data" compact />
      </header>

      {/* Revenue vs Capital Explainer */}
      <div className="budget-explainer">
        <Info size={18} />
        <div>
          {isAutoGenerated ? (
            <>
              <strong>About this data:</strong> Budget analysis for {councilFullName} based on
              GOV.UK MHCLG Revenue Outturn data — official, certified figures showing <em>actual spend</em>,
              not budget estimates. The current net revenue expenditure
              is {formatCurrency(budgetInsights.revenue_vs_capital?.current_revenue, true)}.
            </>
          ) : (
            <>
              <strong>Revenue vs Capital:</strong> The council has two separate budgets.
              The <strong>Revenue Budget</strong> ({formatCurrency(budgetInsights.revenue_vs_capital?.current_revenue, true)}) covers
              day-to-day running costs — staff, services, utilities — funded by council tax and grants.
              The <strong>Capital Programme</strong> ({formatCurrency(budgetInsights.revenue_vs_capital?.current_capital_5yr, true)} over 5 years) covers
              long-term investment in buildings, infrastructure, and equipment — funded by borrowing and capital grants.
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <nav className="budget-tabs" role="tablist" aria-label="Budget sections">
        <button
          role="tab"
          aria-selected={activeTab === 'revenue'}
          className={`tab-btn ${activeTab === 'revenue' ? 'active' : ''}`}
          onClick={() => setActiveTab('revenue')}
        >
          <Wallet size={18} />
          Revenue Budget
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'departments'}
          className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          <Building size={18} />
          Departmental Breakdown
        </button>
        {hasCapital && (
        <button
          role="tab"
          aria-selected={activeTab === 'capital'}
          className={`tab-btn ${activeTab === 'capital' ? 'active' : ''}`}
          onClick={() => setActiveTab('capital')}
        >
          <HardHat size={18} />
          Capital Programme
        </button>
        )}
        {hasTreasury && (
        <button
          role="tab"
          aria-selected={activeTab === 'treasury'}
          className={`tab-btn ${activeTab === 'treasury' ? 'active' : ''}`}
          onClick={() => setActiveTab('treasury')}
        >
          <Landmark size={18} />
          Treasury & Investment
        </button>
        )}
      </nav>

      {/* ============ REVENUE TAB ============ */}
      {activeTab === 'revenue' && (
        <div className="tab-content">
          {/* Key Metrics */}
          <section className="metrics-grid">
            <div className="metric-card highlight">
              <div className="metric-icon">
                <PiggyBank size={24} />
              </div>
              <div className="metric-content">
                <span className="metric-value">{formatCurrency(efficiency.latest_budget, true)}</span>
                <span className="metric-label">{efficiency.latest_year} Net Revenue Budget</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon growth">
                <TrendingUp size={24} />
              </div>
              <div className="metric-content">
                <span className="metric-value text-orange">+{formatPercent(efficiency.total_budget_growth_pct)}</span>
                <span className="metric-label">{efficiency.years_covered}-Year Budget Growth</span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">
                <Building size={24} />
              </div>
              <div className="metric-content">
                <span className="metric-value">+{formatPercent(efficiency.avg_annual_growth_pct)}</span>
                <span className="metric-label">Average Annual Growth</span>
              </div>
            </div>
          </section>

          {/* Property Estate Overview — when data available */}
          {propertyAssetsRaw?.assets?.length > 0 && (() => {
            const assets = propertyAssetsRaw.assets
            const totalSpend = assets.reduce((s, a) => s + (a.linked_spend || 0), 0)
            const conditionSpend = assets.reduce((s, a) => s + (a.condition_spend || 0), 0)
            const disposals = assets.filter(a => a.disposal?.category === 'A' || a.disposal?.category === 'B').length
            const categories = {}
            assets.forEach(a => { categories[a.category || 'other'] = (categories[a.category || 'other'] || 0) + 1 })
            return (
              <section className="chart-section" style={{ marginTop: '1.5rem' }}>
                <h2><Building size={20} /> Property Estate</h2>
                <p className="section-note">{assets.length} council-owned properties and land assets</p>
                <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <div className="metric-card">
                    <div className="metric-content">
                      <span className="metric-value">{assets.length}</span>
                      <span className="metric-label">Total Assets</span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-content">
                      <span className="metric-value">{totalSpend >= 1000000 ? (totalSpend / 1000000).toFixed(1) + 'M' : Math.round(totalSpend / 1000) + 'k'}</span>
                      <span className="metric-label">Linked Supplier Spend</span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-content">
                      <span className="metric-value">{Math.round(conditionSpend / 1000)}k</span>
                      <span className="metric-label">Condition Spend</span>
                    </div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-content">
                      <span className="metric-value text-orange">{disposals}</span>
                      <span className="metric-label">Disposal Candidates</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '1rem 0' }}>
                  {Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, count]) => (
                    <span key={cat} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                      {cat.replace(/_/g, ' ')} ({count})
                    </span>
                  ))}
                </div>
                <a href="/properties" style={{ color: 'var(--accent-primary, #12B6CF)', fontSize: '0.85rem' }}>
                  View full property portfolio &rarr;
                </a>
              </section>
            )
          })()}

          {/* Revenue Trend Chart */}
          <section className="chart-section">
            <h2>Revenue Budget Trend</h2>
            <p className="section-note">Net revenue budget — the cost of running day-to-day council services</p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                  <YAxis
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`£${value.toFixed(2)}M`, 'Net Revenue Budget']}
                  />
                  <Bar dataKey="budget" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Year-on-Year Changes */}
          <section className="yoy-section">
            <h2>Year-on-Year Changes</h2>
            <div className="yoy-grid">
              {yoyChanges.map((change, i) => (
                <div key={i} className={`yoy-card ${change.change_amount > 0 ? 'increase' : 'decrease'}`}>
                  <div className="yoy-header">
                    <span className="yoy-years">{change.from_year} → {change.to_year}</span>
                    {change.change_amount > 0 ? (
                      <TrendingUp size={20} className="text-red" />
                    ) : (
                      <TrendingDown size={20} className="text-green" />
                    )}
                  </div>
                  <div className="yoy-change">
                    <span className={`change-amount ${change.change_amount > 0 ? 'text-red' : 'text-green'}`}>
                      {change.change_amount > 0 ? '+' : ''}{formatCurrency(change.change_amount, true)}
                    </span>
                    <span className="change-percent">
                      ({change.change_percent > 0 ? '+' : ''}{change.change_percent?.toFixed(1) ?? '?'}%)
                    </span>
                  </div>
                  <div className="yoy-detail text-secondary">
                    {formatCurrency(change.previous_budget, true)} → {formatCurrency(change.current_budget, true)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Reform vs Conservative Budget Spotlight */}
          {budgetData?.insights?.reform_vs_conservative && (() => {
            const rvc = budgetData.insights.reform_vs_conservative
            const ctData = rvc.council_tax_increase
            const growth = rvc.budget_growth
            const pressures = rvc.pressures_absorbed
            const savings = rvc.savings_delivered
            return (
              <section className="chart-section reform-spotlight">
                <h2>Reform vs Conservative: Budget Comparison</h2>
                <p className="section-note">{rvc.description}</p>
                <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div className="stat-card">
                    <div className="stat-value text-green">{ctData?.['2026_27_reform']}%</div>
                    <div className="stat-label">Reform CT Rise</div>
                    <div className="stat-context">vs {ctData?.['2025_26_conservative']}% Conservative</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">£{(ctData?.saving_per_band_d || 0).toFixed(2)}</div>
                    <div className="stat-label">Saved per Band D</div>
                    <div className="stat-context">vs maximum 4.99% increase</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{formatCurrency(growth?.increase, true)}</div>
                    <div className="stat-label">Budget Growth</div>
                    <div className="stat-context">+{growth?.increase_pct}% year-on-year</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{formatCurrency(Math.abs(savings?.net_savings || 0), true)}</div>
                    <div className="stat-label">Net Savings</div>
                    <div className="stat-context">£{((savings?.new_reform_savings || 0) / -1e6).toFixed(1)}M newly identified</div>
                  </div>
                </div>

                {/* Pressures vs Savings waterfall */}
                <div className="reform-waterfall">
                  <h3>How the Budget Gap Was Closed</h3>
                  <div className="waterfall-items">
                    <div className="waterfall-item">
                      <span className="waterfall-label">2025/26 Baseline (Conservative)</span>
                      <span className="waterfall-value">{formatCurrency(growth?.baseline_2025_26, true)}</span>
                    </div>
                    <div className="waterfall-item pressure">
                      <span className="waterfall-label">+ Inflation</span>
                      <span className="waterfall-value text-red">+{formatCurrency(pressures?.inflation, true)}</span>
                    </div>
                    <div className="waterfall-item pressure">
                      <span className="waterfall-label">+ Demand growth</span>
                      <span className="waterfall-value text-red">+{formatCurrency(pressures?.demand, true)}</span>
                    </div>
                    <div className="waterfall-item pressure">
                      <span className="waterfall-label">+ Capital financing & other</span>
                      <span className="waterfall-value text-red">+{formatCurrency((pressures?.capital_financing || 0) + (pressures?.other || 0), true)}</span>
                    </div>
                    <div className="waterfall-item saving">
                      <span className="waterfall-label">- Existing savings (from Conservatives)</span>
                      <span className="waterfall-value text-green">{formatCurrency(savings?.existing_from_conservatives, true)}</span>
                    </div>
                    <div className="waterfall-item saving">
                      <span className="waterfall-label">- New Reform savings</span>
                      <span className="waterfall-value text-green">{formatCurrency(savings?.new_reform_savings, true)}</span>
                    </div>
                    <div className="waterfall-item total">
                      <span className="waterfall-label">2026/27 Budget (Reform)</span>
                      <span className="waterfall-value">{formatCurrency(growth?.budget_2026_27, true)}</span>
                    </div>
                  </div>
                </div>

                {rvc.mtfp_outlook && (
                  <div className="reform-outlook">
                    <h3>Medium-Term Outlook</h3>
                    <p className="text-secondary">
                      Budget balanced through 2027/28 (expected LGR vesting day).
                      {rvc.mtfp_outlook['2028_29_gap'] > 0 && ` £${(rvc.mtfp_outlook['2028_29_gap'] / 1e6).toFixed(1)}M gap forecast in 2028/29 if reorganisation is delayed.`}
                    </p>
                  </div>
                )}

                {ctData?.note && (
                  <p className="chart-note text-secondary">{ctData.note}</p>
                )}
              </section>
            )
          })()}

          {/* AI DOGE Coverage — how much of the budget does our spending data capture? */}
          {isAutoGenerated && budgetMapping?.coverage && (
            <section className="chart-section">
              <h2><BarChart3 size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />AI DOGE Data Coverage</h2>
              <p className="section-note">
                AI DOGE tracks {budgetMapping.coverage.mapped_spend_pct?.toFixed(0)}% of supplier payments
                by value across {budgetMapping.mapped_departments} of {budgetMapping.total_departments} spending categories.
                Coverage below 100% is expected — staff salaries, internal transfers, and small payments
                below the publication threshold are excluded.
              </p>
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div className="stat-card">
                  <div className="stat-value">{budgetMapping.coverage.mapped_spend_pct?.toFixed(0)}%</div>
                  <div className="stat-label">Spend Mapped</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{budgetMapping.mapped_departments}</div>
                  <div className="stat-label">Categories Mapped</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{formatCurrency(budgetMapping.coverage.mapped_spend, true)}</div>
                  <div className="stat-label">Total Tracked</div>
                </div>
              </div>
            </section>
          )}

          {/* How It's Funded */}
          <section className="chart-section">
            <h2>How the Revenue Budget is Funded ({selectedBudget?.financial_year})</h2>
            <div className="chart-card funding-chart">
              <div className="funding-visual">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={fundingChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, value }) => `${name}: £${value.toFixed(1)}M`}
                      labelLine={true}
                    >
                      {fundingChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`£${value.toFixed(2)}M`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="funding-breakdown">
                {fundingChartData.map((item, i) => (
                  <div key={i} className="funding-item">
                    <span className="funding-dot" style={{ background: item.color }} />
                    <span className="funding-name">{item.name}</span>
                    <span className="funding-value">£{item.value.toFixed(1)}M</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Council Tax Trend */}
          <section className="chart-section">
            <h2>Council Tax ({councilName} Element) Band D</h2>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenueChartData.filter(d => d.councilTax > 0)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                  <YAxis
                    domain={['dataMin - 10', 'dataMax + 10']}
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `£${v}`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`£${value.toFixed(2)}`, `Band D (${councilName})`]}
                  />
                  <Line
                    type="monotone"
                    dataKey="councilTax"
                    stroke="var(--accent-green)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--accent-green)', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="chart-note text-secondary">
                {config.council_tier === 'county'
                  ? `This is the ${councilFullName} precept element only. Total Band D council tax also includes district council, police, and fire precepts.`
                  : config.council_tier === 'unitary'
                    ? `This is the ${councilFullName} element only. Total Band D council tax also includes police and fire precepts.`
                    : `This is the ${councilFullName} element only. Total Band D council tax includes Lancashire County Council, police, and fire precepts.`
                }
              </p>
            </div>
          </section>

          {/* Reserves Trajectory — for auto-generated councils with reserves data */}
          {isAutoGenerated && budgetData?.reserves_trajectory?.length > 1 && (
            <section className="chart-section">
              <h2>Reserves Trajectory</h2>
              <p className="section-note">Total financial reserves (earmarked + unallocated) as reported to MHCLG</p>
              <div className="chart-card">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={budgetData.reserves_trajectory.map(r => ({
                    year: r.year,
                    earmarked: (r.earmarked || 0) / 1_000_000,
                    unallocated: (r.unallocated || 0) / 1_000_000,
                  }))} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                    <YAxis
                      tick={AXIS_TICK_STYLE}
                      tickFormatter={(v) => `£${v}M`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => [`£${value.toFixed(1)}M`, name === 'earmarked' ? 'Earmarked Reserves' : 'Unallocated Reserves']}
                    />
                    <Bar dataKey="earmarked" stackId="reserves" fill="var(--accent-blue)" radius={[0, 0, 0, 0]} name="earmarked" />
                    <Bar dataKey="unallocated" stackId="reserves" fill="var(--accent-orange)" radius={[4, 4, 0, 0]} name="unallocated" />
                  </BarChart>
                </ResponsiveContainer>
                <p className="chart-note text-secondary">
                  Earmarked reserves are set aside for specific purposes. Unallocated reserves are the council's general safety net.
                  Declining reserves may indicate financial pressure.
                </p>
              </div>
            </section>
          )}

          {/* Collection Performance (from collection_rates.json) */}
          {collectionRates && (
            <CollectionRatesSection collectionRates={collectionRates} councilName={councilName} />
          )}

          {/* Key Political Points */}
          {highlights.length > 0 && (
            <section className="highlights-section">
              <h2>Key Political Points</h2>
              <div className="highlights-grid">
                {highlights.map((h, i) => (
                  <div key={i} className="highlight-card">
                    <AlertTriangle size={20} className="highlight-icon" />
                    <p>{h.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ DEPARTMENTS TAB ============ */}
      {activeTab === 'departments' && (
        <div className="tab-content">
          {/* Year Selector */}
          <div className="year-selector" role="group" aria-label="Select financial year">
            <span className="year-label">Showing:</span>
            {revenueBudgets.map((b, i) => (
              <button
                key={i}
                className={`year-btn ${selectedYear === i ? 'active' : ''}`}
                onClick={() => setSelectedYear(i)}
                aria-label={`Show ${b.financial_year} budget`}
                aria-pressed={selectedYear === i}
              >
                {b.financial_year}
              </button>
            ))}
          </div>

          {/* Department Pie Chart */}
          <section className="chart-section">
            <h2>Department Spending — {selectedBudget?.financial_year}</h2>
            <p className="section-note">Net revenue budget allocation by department (excludes zero-budget and negative departments)</p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={130}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${formatCurrency(value, true)}`}
                    labelLine={true}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatCurrency(value, true)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Department Table with Sub-Service Drill-Down */}
          <section className="table-section">
            <h2>Departmental Budget Comparison</h2>
            <p className="section-note">
              All figures are net revenue budget (£). Negative values indicate net income generators.
              {isAutoGenerated && selectedBudget?.sub_services && ' Click a service to see sub-service breakdown.'}
            </p>
            <div className="table-wrapper">
              <table className="budget-table" role="table" aria-label="Departmental budget comparison">
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    {revenueBudgets.map(b => (
                      <th scope="col" key={b.financial_year}>{b.financial_year}</th>
                    ))}
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {coreDepartments.map(dept => {
                    const values = revenueBudgets.map(b => getDeptValue(b, dept))
                    const first = values.find(v => v !== null && v !== 0)
                    const last = values[values.length - 1]
                    const growthPct = first && last ? ((last - first) / Math.abs(first) * 100).toFixed(0) : null

                    // Mark merged Finance & Property with asterisk
                    const deptName = (dept === 'Finance & Property' && hasFinanceSplit) ? 'Finance & Property *' : dept

                    // Get sub-services for this department from selected year
                    const subServices = selectedBudget?.sub_services?.[dept] || {}
                    const hasSubServices = Object.keys(subServices).length > 0
                    const isExpanded = expandedDept === dept

                    // Get expenditure breakdown for selected year
                    const expBreakdown = selectedBudget?.expenditure_breakdown?.[dept] || {}

                    return (
                      <Fragment key={dept}>
                        <tr className={`${isExpanded ? 'expanded' : ''} ${hasSubServices ? 'has-drill-down' : ''}`}>
                          <td className="dept-name" onClick={() => setExpandedDept(isExpanded ? null : dept)}>
                            {hasSubServices && (isExpanded ? <ChevronUp size={14} className="drill-icon" /> : <ChevronDown size={14} className="drill-icon" />)}
                            {deptName}
                          </td>
                          {values.map((val, i) => (
                            <td key={i} className={val < 0 ? 'negative' : ''}>
                              {val !== null && val !== 0
                                ? formatCurrency(val, true)
                                : val === 0 ? '-' : '-'}
                            </td>
                          ))}
                          <td className={`change-cell ${growthPct > 0 ? 'text-red' : growthPct < 0 ? 'text-green' : ''}`}>
                            {growthPct !== null ? `${growthPct > 0 ? '+' : ''}${growthPct}%` : '-'}
                          </td>
                        </tr>
                        {/* Sub-service drill-down rows */}
                        {isExpanded && hasSubServices && (
                          <>
                            {/* Expenditure breakdown row */}
                            {Object.keys(expBreakdown).length > 0 && (
                              <tr className="sub-service-breakdown-row">
                                <td colSpan={revenueBudgets.length + 2} className="breakdown-cell">
                                  <div className="expenditure-breakdown">
                                    {expBreakdown.employees != null && (
                                      <span className="breakdown-tag employees">
                                        Employees: {formatCurrency(expBreakdown.employees, true)}
                                      </span>
                                    )}
                                    {expBreakdown.running_expenses != null && (
                                      <span className="breakdown-tag running">
                                        Running costs: {formatCurrency(expBreakdown.running_expenses, true)}
                                      </span>
                                    )}
                                    {expBreakdown.total_expenditure != null && (
                                      <span className="breakdown-tag total-exp">
                                        Gross spend: {formatCurrency(expBreakdown.total_expenditure, true)}
                                      </span>
                                    )}
                                    {expBreakdown.total_income != null && (
                                      <span className="breakdown-tag income">
                                        Income: {formatCurrency(expBreakdown.total_income, true)}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {Object.entries(subServices)
                              .sort(([,a], [,b]) => Math.abs(b.net) - Math.abs(a.net))
                              .map(([subName, subData]) => (
                                <tr key={subName} className="sub-service-row">
                                  <td className="sub-service-name">{subName}</td>
                                  <td colSpan={revenueBudgets.length - 1}></td>
                                  <td className={subData.net < 0 ? 'negative' : ''}>
                                    {formatCurrency(subData.net, true)}
                                  </td>
                                  <td className="sub-service-detail text-secondary">
                                    {subData.employees > 0 && subData.total_expenditure > 0 ? `${Math.round(subData.employees / subData.total_expenditure * 100)}% staff` : ''}
                                  </td>
                                </tr>
                              ))}
                          </>
                        )}
                      </Fragment>
                    )
                  })}
                  {/* Earmarked Reserves row — hidden when no year has data */}
                  {revenueBudgets.some(b => b.departments?.['Earmarked Reserves'] != null && b.departments['Earmarked Reserves'] !== 0) && (
                  <tr className="reserves-row">
                    <td className="dept-name">Earmarked Reserves</td>
                    {revenueBudgets.map((b, i) => (
                      <td key={i} className={b.departments?.['Earmarked Reserves'] < 0 ? 'negative' : ''}>
                        {formatCurrency(b.departments?.['Earmarked Reserves'], true)}
                      </td>
                    ))}
                    <td></td>
                  </tr>
                  )}
                  {/* Total row */}
                  <tr className="total-row">
                    <td className="dept-name"><strong>Total Net Revenue Budget</strong></td>
                    {revenueBudgets.map((b, i) => (
                      <td key={i}><strong>{formatCurrency(b.net_revenue_budget, true)}</strong></td>
                    ))}
                    <td className="text-red"><strong>+{formatPercent(efficiency.total_budget_growth_pct)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="table-note text-secondary">
              {hasFinanceSplit && '* Finance & Property split into separate departments in 2025/26. Combined figure shown for comparison. '}
              Source: {isAutoGenerated ? 'GOV.UK MHCLG Revenue Outturn' : `${councilName} Council Budget Books`}.
            </p>
          </section>

          {/* Departmental Growth Rankings */}
          <section className="growth-section">
            <h2>Fastest Growing {isAutoGenerated ? 'Services' : 'Departments'} ({revenueBudgets[0]?.financial_year} → {revenueBudgets[revenueBudgets.length - 1]?.financial_year})</h2>
            <div className="growth-grid">
              {Object.entries(budgetInsights.departmental_growth || {}).map(([dept, data], i) => (
                <div key={dept} className="growth-card">
                  <div className="growth-rank">#{i + 1}</div>
                  <div className="growth-info">
                    <h4>{dept}</h4>
                    <div className="growth-values">
                      <span className="growth-from">{formatCurrency(data.from, true)}</span>
                      <span className="growth-arrow">→</span>
                      <span className="growth-to">{formatCurrency(data.to, true)}</span>
                    </div>
                  </div>
                  <div className={`growth-pct ${data.growth_pct > 50 ? 'high' : ''}`}>
                    +{data.growth_pct?.toFixed(0) ?? '?'}%
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Spending Efficiency by Service */}
          {budgetEfficiency && (
            <section className="chart-section" style={{ marginTop: 'var(--space-xl)' }}>
              <h2><BarChart3 size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Spending Efficiency by Service</h2>
              <p className="section-note">
                AI DOGE forensic analysis of supplier payments mapped to each budget category.
                Flags include supplier concentration (HHI), duplicate payment rates, year-end spikes, and round-number anomalies.
              </p>
              <div className="department-table">
                <table>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Service Category</th>
                      <th style={{ textAlign: 'right' }}>Transactions</th>
                      <th style={{ textAlign: 'right' }}>Total Spend</th>
                      <th style={{ textAlign: 'center' }}>HHI</th>
                      <th style={{ textAlign: 'center' }}>Duplicate %</th>
                      <th style={{ textAlign: 'center' }}>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(budgetEfficiency.categories || {})
                      .sort(([,a], [,b]) => b.total_spend - a.total_spend)
                      .map(([cat, data]) => (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td style={{ textAlign: 'right' }}>{data.transactions?.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(data.total_spend, true)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`efficiency-badge ${data.hhi_category === 'high' ? 'badge-danger' : data.hhi_category === 'moderate' ? 'badge-warning' : 'badge-ok'}`}>
                              {data.hhi?.toLocaleString()} ({data.hhi_category})
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>{data.duplicate_rate_pct?.toFixed(1)}%</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`efficiency-badge ${data.rating === 'red' ? 'badge-danger' : data.rating === 'amber' ? 'badge-warning' : 'badge-ok'}`}>
                              {data.rating}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ CAPITAL TAB ============ */}
      {activeTab === 'capital' && hasCapital && (
        <div className="tab-content">
          {/* Capital vs Revenue Explainer */}
          <div className="budget-explainer capital">
            <HardHat size={18} />
            <div>
              <strong>What is the Capital Programme?</strong> Unlike the revenue budget (day-to-day costs),
              the capital programme covers investment in long-term assets — buildings, infrastructure, vehicles,
              and major equipment. It's funded by borrowing (which must be repaid from revenue), government capital grants,
              and proceeds from selling council assets.
            </div>
          </div>

          {/* Capital Metrics */}
          <section className="metrics-grid">
            <div className="metric-card highlight">
              <div className="metric-icon">
                <HardHat size={24} />
              </div>
              <div className="metric-content">
                <span className="metric-value">{formatCurrency(latestCapital?.total_all_schemes, true)}</span>
                <span className="metric-label">{latestCapital?.programme_period} Capital Programme</span>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon growth">
                <BarChart3 size={24} />
              </div>
              <div className="metric-content">
                <span className="metric-value">{formatCurrency(latestCapital?.year_totals?.[Object.keys(latestCapital?.year_totals || {})[0]], true)}</span>
                <span className="metric-label">Current Year Capital Spend</span>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon">
                <Building size={24} />
              </div>
              <div className="metric-content">
                <span className="metric-value">5</span>
                <span className="metric-label">Investment Categories</span>
              </div>
            </div>
          </section>

          {/* Capital by Category Chart */}
          <section className="chart-section">
            <h2>Current Capital Programme by Category</h2>
            <p className="section-note">{latestCapital?.programme_period} — Total: {formatCurrency(latestCapital?.total_all_schemes, true)}</p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={capitalCategoryData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    type="number"
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={AXIS_TICK_STYLE}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, name, props) => [`£${value.toFixed(2)}M`, props.payload.fullName]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {capitalCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Capital Programme Timeline */}
          <section className="chart-section">
            <h2>Capital Programme Size Over Time</h2>
            <p className="section-note">Total 5-year programme as approved in each budget book</p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={capitalTimelineData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="period" tick={AXIS_TICK_STYLE} />
                  <YAxis
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`£${value.toFixed(1)}M`, '5-Year Programme']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--accent-green)"
                    fill="rgba(48, 209, 88, 0.15)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Major Capital Schemes */}
          <section className="schemes-section">
            <h2>Major Capital Schemes</h2>
            <div className="schemes-grid">
              {(treasury.notable_investments || []).map((inv, i) => (
                <div key={i} className="scheme-card">
                  <div className="scheme-value">{formatCurrency(inv.value, true)}</div>
                  <h4>{inv.name}</h4>
                  <p className="text-secondary">{inv.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Capital Category Details */}
          {latestCapital && (
            <section className="capital-details-section">
              <h2>Category Breakdown ({latestCapital.budget_book_year})</h2>
              <div className="capital-details-grid">
                {Object.entries(latestCapital.categories).map(([name, data]) => (
                  <div key={name} className="capital-detail-card">
                    <h4>{name}</h4>
                    <span className="capital-detail-total">{formatCurrency(data.total, true)}</span>
                    {data.note && <p className="text-secondary">{data.note}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ============ TREASURY TAB ============ */}
      {activeTab === 'treasury' && hasTreasury && (
        <div className="tab-content">
          <div className="budget-explainer treasury">
            <Landmark size={18} />
            <div>
              <strong>Treasury Management & Investment Strategy:</strong> The council manages public money through
              carefully regulated borrowing and investment activities. All decisions must comply with the CIPFA Code
              of Practice for Treasury Management and the council's approved strategies.
            </div>
          </div>

          {/* Treasury Overview Cards — data-driven */}
          <section className="treasury-grid">
            {treasury.key_context?.borrowing && (
              <div className="treasury-card">
                <h3>Borrowing</h3>
                <p>{treasury.key_context.borrowing}</p>
              </div>
            )}
            {treasury.key_context?.investments && (
              <div className="treasury-card">
                <h3>Investments</h3>
                <p>{treasury.key_context.investments}</p>
              </div>
            )}
            {treasury.key_context?.mrp && (
              <div className="treasury-card">
                <h3>Minimum Revenue Provision (MRP)</h3>
                <p>{treasury.key_context.mrp}</p>
              </div>
            )}
            {treasury.key_context?.charter_walk && (
              <div className="treasury-card">
                <h3>Charter Walk Investment</h3>
                <p>{treasury.key_context.charter_walk}</p>
              </div>
            )}
          </section>

          {/* Treasury Context */}
          <section className="context-section">
            <h2>How Council Finance Works</h2>
            <div className="context-card">
              <div className="context-item">
                <h4>Revenue Budget</h4>
                <p>
                  The day-to-day running costs of the council — staff salaries, service delivery, utilities, contracts.
                  Currently {formatCurrency(budgetInsights.revenue_vs_capital?.current_revenue, true)} per year.
                  Funded by council tax ({budgetInsights.funding_dependency?.council_tax_pct}%),
                  business rates ({budgetInsights.funding_dependency?.business_rates_pct}%),
                  and government grants ({budgetInsights.funding_dependency?.government_grants_pct}%).
                </p>
              </div>
              <div className="context-item">
                <h4>Capital Programme</h4>
                <p>
                  Long-term investment in assets: buildings, infrastructure, vehicles, equipment.
                  Currently {formatCurrency(budgetInsights.revenue_vs_capital?.current_capital_5yr, true)} over 5 years.
                  Funded by prudential borrowing (which must be repaid from revenue via MRP),
                  government capital grants (Better Care, Levelling Up, Heritage Lottery), and capital receipts from asset sales.
                </p>
              </div>
              <div className="context-item">
                <h4>Treasury Management</h4>
                <p>
                  The council's treasury function manages cash flow, borrowing, and investments.
                  Borrowing must comply with Prudential Indicators approved by Full Council.
                  Investments prioritise security first, then liquidity, then yield.
                  The MRP charge on revenue has grown as capital spending increased.
                </p>
              </div>
              <div className="context-item">
                <h4>Reserves & Balances</h4>
                <p>
                  Reserves are the council's financial cushion. General Fund reserves provide a safety net for emergencies.
                  Earmarked reserves are set aside for specific purposes. Adequate reserves are critical for financial
                  resilience — if they fall too low, the council may not be able to respond to unexpected costs.
                </p>
              </div>
              <div className="context-item">
                <h4>External Spending Data</h4>
                <p>
                  The spending data published under the Transparency Code shows external payments to suppliers — invoices over
                  the publication threshold, contracts, and purchase cards. This includes both revenue payments (day-to-day contracts)
                  and capital payments (construction, equipment). It does not show internal costs like staff salaries.
                </p>
              </div>
              {(budgetInsights.key_risks || budgetInsights.key_trends) && (
              <div className="context-item">
                <h4>Key Risks</h4>
                <p>
                  {councilTier === 'county'
                    ? 'Common pressures facing county councils include: growing demand for adult and children\'s social care, dedicated schools grant (DSG) deficit recovery, highways maintenance backlogs, constrained council tax increases (capped by referendum limits), and the challenge of delivering statutory services across large geographic areas with a shrinking central government funding base.'
                    : councilTier === 'unitary'
                    ? 'Common pressures facing unitary authorities include: rising demand for adult and children\'s social care, growing homelessness and temporary accommodation costs, constrained council tax increases (capped by referendum limits), highways maintenance backlogs, and the challenge of maintaining adequate reserve levels while delivering the full range of district and county-level services.'
                    : 'Common pressures facing district councils include: rising MRP costs from past capital borrowing, declining government grants, constrained council tax increases (capped by referendum limits at typically 2-3% for districts), and the challenge of maintaining adequate reserve levels while delivering services with a shrinking funding base.'
                  }
                </p>
              </div>
              )}
            </div>
          </section>

          {/* Key Trends */}
          <section className="trends-section">
            <h2>Key Budget Trends</h2>
            <div className="trends-grid">
              {(budgetInsights.key_trends || []).map((trend, i) => (
                <div key={i} className="trend-card">
                  <span className="trend-number">{i + 1}</span>
                  <p>{trend}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

/**
 * Simplified budget view for councils that only have GOV.UK outturn data
 * (i.e. no detailed budget book PDFs available). Shows service expenditure
 * breakdown and revenue trends over time.
 */
/**
 * Council Tax Collection Performance section — reused in both main Budgets and BudgetTrendsView.
 * Shows 6-year trend line, performance badge, uncollected amounts, quarterly receipts, and arrears.
 */
function CollectionRatesSection({ collectionRates, councilName }) {
  if (!collectionRates?.years) return null

  const years = collectionRates.years
  const trendData = Object.entries(years)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, d]) => ({
      year: year.replace('-', '/'),
      rate: d.collection_rate_pct,
      uncollected: (d.uncollected_thousands || 0) / 1000,
      collectable: (d.net_collectable_thousands || 0) / 1000,
    }))

  const latestRate = collectionRates.latest_rate
  const trend = collectionRates.trend
  const fiveYearAvg = collectionRates.five_year_avg
  const performance = collectionRates.performance
  const detail = collectionRates.latest_year_detail || {}
  const quarterly = detail.quarterly_receipts_thousands || {}
  const latestYear = collectionRates.latest_year

  // Performance badge styling
  const perfBadge = performance === 'excellent' ? 'badge-ok'
    : performance === 'good' ? 'badge-info'
    : performance === 'below_average' ? 'badge-warning'
    : 'badge-danger'
  const perfLabel = performance === 'below_average' ? 'Below Average'
    : performance ? performance.charAt(0).toUpperCase() + performance.slice(1) : 'N/A'

  // Quarterly data for mini bar chart
  const quarterlyData = [
    { q: 'Q1 (Apr-Jun)', value: (quarterly.q1_apr_jun || 0) / 1000 },
    { q: 'Q2 (Jul-Sep)', value: (quarterly.q2_jul_sep || 0) / 1000 },
    { q: 'Q3 (Oct-Dec)', value: (quarterly.q3_oct_dec || 0) / 1000 },
    { q: 'Q4 (Jan-Mar)', value: (quarterly.q4_jan_mar || 0) / 1000 },
  ].filter(d => d.value > 0)

  return (
    <section className="chart-section">
      <h2><Wallet size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Council Tax Collection Performance</h2>
      <p className="section-note">
        In-year collection rate measures how much council tax is collected within the financial year it's due.
        National average for districts is ~96%. Source: GOV.UK QRC4.
      </p>

      {/* Key metrics */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="stat-card">
          <div className="stat-label">Latest Rate ({latestYear})</div>
          <div className="stat-value" style={{ color: latestRate >= 97 ? '#30d158' : latestRate >= 95 ? '#0a84ff' : latestRate >= 93 ? '#ff9f0a' : '#ff453a' }}>
            {latestRate?.toFixed(1)}%
          </div>
          <div className="stat-sublabel">
            <span className={`efficiency-badge ${perfBadge}`}>{perfLabel}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">5-Year Average</div>
          <div className="stat-value">{fiveYearAvg?.toFixed(1)}%</div>
          <div className="stat-sublabel">
            Trend: <span style={{ color: trend > 0 ? '#30d158' : trend < 0 ? '#ff453a' : 'inherit' }}>
              {trend > 0 ? '+' : ''}{trend?.toFixed(2)}pp
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Uncollected ({latestYear})</div>
          <div className="stat-value" style={{ color: '#ff453a' }}>
            £{((years[collectionRates.latest_year]?.uncollected_thousands || 0) / 1000).toFixed(1)}M
          </div>
          <div className="stat-sublabel">
            of £{((years[collectionRates.latest_year]?.net_collectable_thousands || 0) / 1000).toFixed(1)}M collectable
          </div>
        </div>
        {detail.total_arrears_thousands > 0 && (
          <div className="stat-card">
            <div className="stat-label">Total Arrears</div>
            <div className="stat-value" style={{ color: '#ff9f0a' }}>
              £{(detail.total_arrears_thousands / 1000).toFixed(1)}M
            </div>
            <div className="stat-sublabel">
              {detail.arrears_brought_forward_thousands > 0
                ? `Brought forward: £${(detail.arrears_brought_forward_thousands / 1000).toFixed(1)}M`
                : ''}
            </div>
          </div>
        )}
      </div>

      {/* Collection rate trend chart */}
      <div className="chart-card">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
            <YAxis
              domain={[Math.floor(Math.min(...trendData.map(d => d.rate)) - 1), 100]}
              tick={AXIS_TICK_STYLE}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => name === 'rate'
                ? [`${value.toFixed(2)}%`, 'Collection Rate']
                : [`£${value.toFixed(1)}M`, 'Uncollected']
              }
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="var(--accent-blue)"
              strokeWidth={2.5}
              dot={{ fill: 'var(--accent-blue)', r: 5 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="chart-note text-secondary">
          {councilName}'s collection rate {collectionRates.trend_direction === 'declining'
            ? `has declined ${Math.abs(trend).toFixed(1)}pp since 2019-20`
            : collectionRates.trend_direction === 'improving'
            ? `has improved ${Math.abs(trend).toFixed(1)}pp since 2019-20`
            : 'has remained stable'
          }. The COVID-19 pandemic visibly impacted 2020-21 collection rates nationally.
        </p>
      </div>

      {/* Uncollected amounts bar chart */}
      {trendData.some(d => d.uncollected > 0) && (
        <div className="chart-card" style={{ marginTop: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-sm)', fontSize: '1rem' }}>Uncollected Council Tax by Year</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
              <YAxis
                tick={AXIS_TICK_STYLE}
                tickFormatter={(v) => `£${v.toFixed(0)}M`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`£${value.toFixed(2)}M`, 'Uncollected']}
              />
              <Bar dataKey="uncollected" radius={[4, 4, 0, 0]}>
                {trendData.map((entry, index) => (
                  <Cell key={`unc-${index}`} fill={entry.uncollected > 3.5 ? '#ff453a' : entry.uncollected > 3 ? '#ff9f0a' : '#30d158'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quarterly receipts breakdown */}
      {quarterlyData.length === 4 && (
        <div className="chart-card" style={{ marginTop: 'var(--space-lg)' }}>
          <h3 style={{ marginBottom: 'var(--space-sm)', fontSize: '1rem' }}>Quarterly Collection ({latestYear})</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={quarterlyData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="q" tick={AXIS_TICK_STYLE} />
              <YAxis
                tick={AXIS_TICK_STYLE}
                tickFormatter={(v) => `£${v.toFixed(0)}M`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [`£${value.toFixed(2)}M`, 'Receipts']}
              />
              <Bar dataKey="value" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="chart-note text-secondary">
            Q4 (January-March) is typically lower as most payments are collected in the first three quarters.
            {detail.court_costs_thousands > 0 && ` Court costs recovered: £${(detail.court_costs_thousands / 1000).toFixed(1)}M.`}
            {detail.in_year_write_offs_thousands > 0 && ` In-year write-offs: £${(detail.in_year_write_offs_thousands / 1000).toFixed(0)}K.`}
          </p>
        </div>
      )}
    </section>
  )
}

function BudgetTrendsView({ councilName, councilFullName, govukData, trendsData, summaryData, insightsData, efficiencyData, mappingData, collectionRates }) {
  const config = useCouncilConfig()
  const councilTier = config.council_tier || 'district'
  const isMultiYear = summaryData?.multi_year && summaryData?.years?.length > 1

  // Service expenditure bar chart — tier-aware: show relevant services for this council type
  // Districts see district services, county sees county services, unitaries see all services
  const tierFilterKey = councilTier === 'county' ? 'relevant_to_county'
    : councilTier === 'unitary' ? 'relevant_to_unitary'
    : 'relevant_to_districts'

  const serviceData = govukData?.revenue_summary?.service_expenditure
    ? Object.entries(govukData?.revenue_summary?.service_expenditure || {})
        .filter(([name, d]) => d[tierFilterKey] && d.value_pounds > 0 && name !== 'TOTAL SERVICE EXPENDITURE')
        .sort((a, b) => b[1].value_pounds - a[1].value_pounds)
        .map(([name, d], i) => ({
          name: name.length > 25 ? name.substring(0, 22) + '...' : name,
          fullName: name,
          value: d.value_pounds / 1_000_000,
          color: DEPT_COLORS[i % DEPT_COLORS.length],
        }))
    : []

  // Spending vs Budget comparison data (from budget_mapping.json + govukData multi-year totals)
  const spendingVsBudgetData = useMemo(() => {
    if (!mappingData?.category_summary || !govukData) return []
    const categorySummary = mappingData.category_summary
    // Sum GOV.UK outturn across ALL available years for fair comparison
    // (budget_mapping.json aggregates all years of spending data)
    const govukYears = govukData.by_year || {}
    const latestYearServices = govukData.revenue_summary?.service_expenditure || {}

    // Build multi-year GOV.UK totals per category
    const govukTotals = {}
    let govukYearCount = 0
    for (const [, yearData] of Object.entries(govukYears)) {
      govukYearCount++
      const services = yearData?.revenue_summary?.service_expenditure || {}
      for (const [cat, data] of Object.entries(services)) {
        if (cat === 'TOTAL SERVICE EXPENDITURE') continue
        govukTotals[cat] = (govukTotals[cat] || 0) + (data.value_pounds || 0)
      }
    }
    if (govukYearCount === 0) return []

    return Object.entries(categorySummary)
      .filter(([cat]) => {
        // Only compare categories that exist in GOV.UK data and are relevant to this tier
        const govuk = latestYearServices[cat]
        if (!govuk) return false
        if (councilTier === 'county' && !govuk.relevant_to_county) return false
        if (councilTier === 'unitary' && !govuk.relevant_to_unitary) return false
        if (councilTier === 'district' && !govuk.relevant_to_districts) return false
        return true
      })
      .map(([cat, aiDogeTotal]) => {
        const govukTotal = govukTotals[cat] || 0
        // Annualise both for per-year comparison
        const aiDogeAnnual = aiDogeTotal / govukYearCount
        const govukAnnual = govukTotal / govukYearCount
        // Coverage ratio: how much of the official outturn does AI DOGE's spending data capture?
        const coveragePct = govukAnnual > 0 ? (aiDogeAnnual / govukAnnual * 100) : 0
        return {
          category: cat.replace(' services', '').replace(' (GFRA only)', ''),
          fullCategory: cat,
          aiDoge: aiDogeAnnual / 1_000_000,
          govuk: govukAnnual / 1_000_000,
          coveragePct: Math.min(coveragePct, 200), // cap at 200% for display
          rawCoveragePct: coveragePct,
        }
      })
      .filter(d => d.govuk > 0.01 || d.aiDoge > 0.01) // exclude zero-value categories
      .sort((a, b) => b.govuk - a.govuk)
  }, [mappingData, govukData, councilTier])

  const totalServiceExpenditure = govukData?.revenue_summary?.service_expenditure?.['TOTAL SERVICE EXPENDITURE']?.value_pounds || 0
  const netRevenue = govukData?.revenue_summary?.key_financials?.['NET REVENUE EXPENDITURE']?.value_pounds || 0
  const councilTaxReq = govukData?.revenue_summary?.key_financials?.['COUNCIL TAX REQUIREMENT']?.value_pounds || 0

  // Multi-year service expenditure trend (from budgets_summary.json computed trends)
  const multiYearTrendData = useMemo(() => {
    if (!isMultiYear || !summaryData?.trends?.headline_trends) return []
    const headlines = summaryData.trends.headline_trends
    const years = summaryData.years || []
    return years.map(year => {
      const ys = summaryData.year_summaries?.[year] || {}
      const svc = ys.service_breakdown || {}
      return {
        year: year.replace('-', '/'),
        total: (ys.total_service_expenditure || 0) / 1_000_000,
        net_revenue: (ys.net_revenue_expenditure || 0) / 1_000_000,
        council_tax: (ys.council_tax_requirement || 0) / 1_000_000,
        // Service breakdown for stacked chart
        environmental: (svc['Environmental and regulatory services'] || 0) / 1_000_000,
        central: (svc['Central services'] || 0) / 1_000_000,
        cultural: (svc['Cultural and related services'] || 0) / 1_000_000,
        housing: (svc['Housing services (GFRA only)'] || 0) / 1_000_000,
        planning: (svc['Planning and development services'] || 0) / 1_000_000,
        highways: (svc['Highways and transport services'] || 0) / 1_000_000,
        education: (svc['Education services'] || 0) / 1_000_000,
        adult_sc: (svc['Adult Social Care'] || 0) / 1_000_000,
        children_sc: (svc['Children Social Care'] || 0) / 1_000_000,
        public_health: (svc['Public Health'] || 0) / 1_000_000,
      }
    })
  }, [isMultiYear, summaryData])

  // Reserve trajectory (multi-year)
  const reserveTrendData = useMemo(() => {
    if (!isMultiYear || !summaryData?.trends?.reserves_trends) return []
    return Object.entries(summaryData.trends.reserves_trends)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, data]) => ({
        year: year.replace('-', '/'),
        earmarked: (data.earmarked || 0) / 1_000_000,
        unallocated: (data.unallocated || 0) / 1_000_000,
        total: (data.total || 0) / 1_000_000,
      }))
  }, [isMultiYear, summaryData])

  // Service trend keys — tier-aware
  const serviceKeys = councilTier === 'district'
    ? ['environmental', 'central', 'cultural', 'housing', 'planning', 'highways']
    : councilTier === 'county'
    ? ['education', 'adult_sc', 'children_sc', 'environmental', 'highways', 'central', 'public_health', 'cultural']
    : ['education', 'adult_sc', 'children_sc', 'environmental', 'housing', 'highways', 'central', 'public_health', 'cultural', 'planning']

  const serviceLabels = {
    environmental: 'Environmental',
    central: 'Central Services',
    cultural: 'Cultural',
    housing: 'Housing',
    planning: 'Planning',
    highways: 'Highways & Transport',
    education: 'Education',
    adult_sc: 'Adult Social Care',
    children_sc: "Children's Social Care",
    public_health: 'Public Health',
  }
  const serviceColors = {
    environmental: '#30d158',
    central: '#0a84ff',
    cultural: '#ff9f0a',
    housing: '#bf5af2',
    planning: '#64d2ff',
    highways: '#ff6b6b',
    education: '#ffd93d',
    adult_sc: '#ff4757',
    children_sc: '#ff6348',
    public_health: '#2ed573',
  }

  // Legacy revenue trend (from revenue_trends.json — kept as fallback)
  const trendChartData = (!isMultiYear && trendsData?.years)
    ? trendsData?.years?.map(year => {
        const yearData = trendsData?.by_year?.[year]?.summary || {}
        return {
          year: year.replace('-', '/'),
          total: (yearData['Total Net Current Expenditure'] || 0) / 1000,
          housing: (yearData['Housing (GF & HRA)'] || 0) / 1000,
          cultural: (yearData['Cultural Services'] || 0) / 1000,
          environmental: (yearData['Environmental Services'] || 0) / 1000,
          planning: (yearData['Planning & Development'] || 0) / 1000,
          central: (yearData['Central Services'] || 0) / 1000,
        }
      })
    : []

  return (
    <div className="budgets-page animate-fade-in">
      <header className="page-header">
        <h1>Budget Overview</h1>
        <p className="subtitle">
          Revenue outturn data for {councilFullName} from GOV.UK MHCLG returns
        </p>
        <DataFreshness source="GOV.UK Revenue Outturn" compact />
      </header>

      <div className="budget-explainer">
        <Info size={18} />
        <div>
          <strong>About this data:</strong> Detailed budget book analysis is not yet available for {councilFullName}.
          This page shows official revenue outturn data published by the Ministry of Housing, Communities and Local Government (MHCLG)
          under the Open Government Licence. Outturn figures show <em>actual spend</em>, not budget estimates.
        </div>
      </div>

      {/* Key Metrics */}
      <section className="metrics-grid">
        {totalServiceExpenditure > 0 && (
          <div className="metric-card highlight">
            <div className="metric-icon"><PiggyBank size={24} /></div>
            <div className="metric-content">
              <span className="metric-value">{formatCurrency(totalServiceExpenditure, true)}</span>
              <span className="metric-label">{govukData?.financial_year} Service Expenditure</span>
            </div>
          </div>
        )}
        {netRevenue > 0 && (
          <div className="metric-card">
            <div className="metric-icon growth"><TrendingUp size={24} /></div>
            <div className="metric-content">
              <span className="metric-value">{formatCurrency(netRevenue, true)}</span>
              <span className="metric-label">Net Revenue Expenditure</span>
            </div>
          </div>
        )}
        {councilTaxReq > 0 && (
          <div className="metric-card">
            <div className="metric-icon"><Wallet size={24} /></div>
            <div className="metric-content">
              <span className="metric-value">{formatCurrency(councilTaxReq, true)}</span>
              <span className="metric-label">Council Tax Requirement</span>
            </div>
          </div>
        )}
      </section>

      {/* Real Growth & Reserves Adequacy — from pre-computed data */}
      {(insightsData?.yoy_changes?.length > 0 || summaryData?.reserves) && (
        <section className="metrics-grid analytics-metrics">
          {/* Real growth from latest YoY change */}
          {insightsData?.yoy_changes?.length > 0 && (() => {
            const latest = insightsData.yoy_changes[insightsData.yoy_changes.length - 1]
            const nominalPct = latest?.change_percent
            // Approximate real growth by subtracting ~2% CPI (exact figures in Python output)
            return nominalPct != null ? (
              <div className="metric-card">
                <div className="metric-icon growth"><TrendingUp size={24} /></div>
                <div className="metric-content">
                  <span className="metric-value" style={{ color: nominalPct > 0 ? '#ff9f0a' : '#30d158' }}>
                    {nominalPct > 0 ? '+' : ''}{nominalPct.toFixed(1)}%
                  </span>
                  <span className="metric-label">Nominal Growth ({latest.from_year} → {latest.to_year})</span>
                  <span className="metric-sub" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Real growth ~{(nominalPct - 2.0).toFixed(1)}% after CPI-H inflation
                  </span>
                </div>
              </div>
            ) : null
          })()}

          {/* Reserves adequacy */}
          {(() => {
            const reservesTrend = summaryData?.trends?.reserves_trends
            if (!reservesTrend) return null
            const years = Object.keys(reservesTrend).sort()
            const latest = reservesTrend[years[years.length - 1]]
            const total = latest?.total || 0
            if (total <= 0 || netRevenue <= 0) return null
            const monthsCover = (total / netRevenue) * 12
            let rating, color
            if (monthsCover < 3) { rating = 'Critical'; color = '#dc3545' }
            else if (monthsCover < 6) { rating = 'Low'; color = '#fd7e14' }
            else if (monthsCover < 12) { rating = 'Adequate'; color = '#28a745' }
            else { rating = 'Strong'; color = '#007bff' }
            return (
              <div className="metric-card">
                <div className="metric-icon" style={{ color }}><PiggyBank size={24} /></div>
                <div className="metric-content">
                  <span className="metric-value">{monthsCover.toFixed(1)} months</span>
                  <span className="metric-label">Reserves Adequacy</span>
                  <span className="metric-sub" style={{ fontSize: '0.75rem', color, fontWeight: 600 }}>
                    {rating} — {formatCurrency(total, true)} reserves cover
                  </span>
                </div>
              </div>
            )
          })()}

          {/* Per capita spend — population from summaryData or cross_council */}
          {totalServiceExpenditure > 0 && summaryData?.population > 0 && (
            <div className="metric-card">
              <div className="metric-icon"><Building size={24} /></div>
              <div className="metric-content">
                <span className="metric-value">£{Math.round(totalServiceExpenditure / summaryData.population).toLocaleString()}</span>
                <span className="metric-label">Per Capita Spend</span>
                <span className="metric-sub" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Population: {summaryData.population.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Year-on-Year Budget Changes */}
      {insightsData?.yoy_changes?.length > 0 && (
        <section className="chart-section">
          <h2><TrendingUp size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Budget Growth Over Time</h2>
          <p className="section-note">
            Total service expenditure grew {insightsData.efficiency_metrics?.total_budget_growth_pct?.toFixed(1)}% over {insightsData.efficiency_metrics?.years_covered} years
            (from {formatCurrency(insightsData.efficiency_metrics?.earliest_budget, true)} to {formatCurrency(insightsData.efficiency_metrics?.latest_budget, true)})
          </p>
          <div className="stats-grid">
            {insightsData.yoy_changes.map((change, i) => (
              <div key={i} className="stat-card">
                <div className="stat-label">{change.from_year} → {change.to_year}</div>
                <div className="stat-value" style={{ color: change.change_percent > 5 ? '#ff453a' : change.change_percent > 0 ? '#ff9f0a' : '#30d158' }}>
                  {change.change_percent > 0 ? '+' : ''}{change.change_percent.toFixed(1)}%
                </div>
                <div className="stat-sublabel">{change.change_amount > 0 ? '+' : ''}{formatCurrency(change.change_amount, true)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Key Political & Financial Highlights */}
      {insightsData?.political_highlights?.length > 0 && (
        <section className="chart-section">
          <h2><AlertTriangle size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Key Financial Findings</h2>
          <p className="section-note">Notable trends and concerns identified from budget analysis</p>
          <div className="highlights-grid">
            {insightsData.political_highlights.map((highlight, i) => (
              <div key={i} className={`highlight-card ${highlight.type === 'low_unallocated_reserves' ? 'highlight-danger' : highlight.type === 'rapid_budget_growth' || highlight.type === 'council_tax_dependency' ? 'highlight-warning' : 'highlight-info'}`}>
                <div className="highlight-icon">
                  {highlight.type === 'low_unallocated_reserves' ? <AlertTriangle size={18} /> :
                   highlight.type === 'council_tax_dependency' ? <Wallet size={18} /> :
                   highlight.type === 'largest_service' ? <Building size={18} /> :
                   highlight.type === 'rapid_budget_growth' ? <TrendingUp size={18} /> :
                   <BarChart3 size={18} />}
                </div>
                <div className="highlight-text">{highlight.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Service Expenditure Breakdown */}
      {serviceData.length > 0 && (
        <section className="chart-section">
          <h2>Service Expenditure ({govukData?.financial_year})</h2>
          <p className="section-note">Actual outturn spend by service area — {councilTier === 'county' ? 'county council services' : councilTier === 'unitary' ? 'all services' : 'district-relevant services only'}</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={serviceData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis
                  type="number"
                  tick={AXIS_TICK_STYLE}
                  tickFormatter={(v) => `£${v.toFixed(1)}M`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={AXIS_TICK_STYLE}
                  width={160}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name, props) => [`£${value.toFixed(2)}M`, props.payload.fullName]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {serviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Spending vs Budget Comparison (AI DOGE tracked spending vs GOV.UK outturn) */}
      {spendingVsBudgetData.length > 0 && (
        <section className="chart-section">
          <h2><BarChart3 size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />AI DOGE Spending vs Official Budget</h2>
          <p className="section-note">
            Annualised comparison of AI DOGE supplier payment data vs GOV.UK official outturn per budget category.
            {mappingData?.coverage && ` ${mappingData.coverage.mapped_spend_pct?.toFixed(0)}% of AI DOGE spending successfully mapped to budget categories.`}
          </p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={Math.max(250, spendingVsBudgetData.length * 50)}>
              <BarChart data={spendingVsBudgetData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis
                  type="number"
                  tick={AXIS_TICK_STYLE}
                  tickFormatter={(v) => `£${v.toFixed(0)}M`}
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  tick={AXIS_TICK_STYLE}
                  width={160}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [
                    `£${value.toFixed(2)}M`,
                    name === 'govuk' ? 'GOV.UK Outturn' : 'AI DOGE Tracked'
                  ]}
                />
                <Bar dataKey="govuk" fill="var(--accent-blue)" name="govuk" radius={[0, 4, 4, 0]} fillOpacity={0.7} />
                <Bar dataKey="aiDoge" fill="#ff9f0a" name="aiDoge" radius={[0, 4, 4, 0]} fillOpacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
            <div className="funding-breakdown" style={{ marginTop: 'var(--space-md)' }}>
              <div className="funding-item">
                <span className="funding-dot" style={{ background: 'var(--accent-blue)' }} />
                <span className="funding-name">GOV.UK Official Outturn</span>
              </div>
              <div className="funding-item">
                <span className="funding-dot" style={{ background: '#ff9f0a' }} />
                <span className="funding-name">AI DOGE Tracked Spending</span>
              </div>
            </div>
          </div>

          {/* Coverage table */}
          <div className="department-table" style={{ marginTop: 'var(--space-lg)' }}>
            <h3 style={{ marginBottom: 'var(--space-sm)' }}>Coverage Analysis</h3>
            <p className="section-note">
              AI DOGE tracks supplier payments above the publication threshold. Coverage below 100% is expected — staff salaries,
              internal transfers, and small payments are excluded from transparency data.
            </p>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Budget Category</th>
                  <th style={{ textAlign: 'right' }}>GOV.UK Outturn</th>
                  <th style={{ textAlign: 'right' }}>AI DOGE Tracked</th>
                  <th style={{ textAlign: 'center' }}>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {spendingVsBudgetData.map(row => (
                  <tr key={row.fullCategory}>
                    <td>{row.fullCategory}</td>
                    <td style={{ textAlign: 'right' }}>£{row.govuk.toFixed(2)}M</td>
                    <td style={{ textAlign: 'right' }}>£{row.aiDoge.toFixed(2)}M</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`efficiency-badge ${row.rawCoveragePct > 120 ? 'badge-warning' : row.rawCoveragePct > 60 ? 'badge-ok' : 'badge-info'}`}>
                        {row.rawCoveragePct.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Multi-Year Service Expenditure Trend (from budgets_summary.json) */}
      {multiYearTrendData.length > 1 && (
        <section className="chart-section">
          <h2>Service Expenditure Trend ({summaryData.years[0]} to {summaryData.years[summaryData.years.length - 1]})</h2>
          <p className="section-note">Actual GOV.UK outturn by service area across {summaryData.years.length} years (£ millions)</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={multiYearTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                <YAxis
                  tick={AXIS_TICK_STYLE}
                  tickFormatter={(v) => `£${v.toFixed(0)}M`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [`£${value.toFixed(2)}M`, serviceLabels[name] || name]}
                />
                {serviceKeys.filter(key => multiYearTrendData.some(d => d[key] > 0)).map(key => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    stroke={serviceColors[key]}
                    fill={serviceColors[key]}
                    fillOpacity={0.4}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="funding-breakdown" style={{ marginTop: 'var(--space-md)' }}>
              {serviceKeys.filter(key => multiYearTrendData.some(d => d[key] > 0)).map(key => (
                <div key={key} className="funding-item">
                  <span className="funding-dot" style={{ background: serviceColors[key] }} />
                  <span className="funding-name">{serviceLabels[key]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Total Service Expenditure + Council Tax Requirement Trend */}
      {multiYearTrendData.length > 1 && (
        <section className="chart-section">
          <h2>Total Expenditure & Council Tax Requirement</h2>
          <p className="section-note">How total service spend and council tax demand have changed over time</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={multiYearTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                <YAxis
                  tick={AXIS_TICK_STYLE}
                  tickFormatter={(v) => `£${v.toFixed(0)}M`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [
                    `£${value.toFixed(1)}M`,
                    name === 'total' ? 'Total Service Expenditure' :
                    name === 'net_revenue' ? 'Net Revenue Expenditure' :
                    'Council Tax Requirement'
                  ]}
                />
                <Line type="monotone" dataKey="total" stroke="var(--accent-blue)" strokeWidth={2} dot={{ fill: 'var(--accent-blue)', r: 4 }} name="total" />
                <Line type="monotone" dataKey="net_revenue" stroke="#ff9f0a" strokeWidth={2} dot={{ fill: '#ff9f0a', r: 4 }} name="net_revenue" />
                <Line type="monotone" dataKey="council_tax" stroke="#ff453a" strokeWidth={2} dot={{ fill: '#ff453a', r: 4 }} name="council_tax" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Reserve Trajectory (multi-year) */}
      {reserveTrendData.length > 1 && (
        <section className="chart-section">
          <h2><PiggyBank size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Reserve Trajectory</h2>
          <p className="section-note">How the council's financial reserves have changed year-on-year</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={reserveTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                <YAxis
                  tick={AXIS_TICK_STYLE}
                  tickFormatter={(v) => `£${v.toFixed(0)}M`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`£${value.toFixed(1)}M`]}
                />
                <Bar dataKey="earmarked" stackId="reserves" fill="#0a84ff" name="Earmarked Reserves" radius={[0, 0, 0, 0]} />
                <Bar dataKey="unallocated" stackId="reserves" fill="#30d158" name="Unallocated Reserves" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="funding-breakdown" style={{ marginTop: 'var(--space-md)' }}>
              <div className="funding-item">
                <span className="funding-dot" style={{ background: '#0a84ff' }} />
                <span className="funding-name">Earmarked Reserves</span>
              </div>
              <div className="funding-item">
                <span className="funding-dot" style={{ background: '#30d158' }} />
                <span className="funding-name">Unallocated Reserves</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Budget Efficiency by Service Category (from budget_efficiency.json) */}
      {efficiencyData?.categories && Object.keys(efficiencyData.categories).length > 0 && (
        <section className="chart-section">
          <h2><BarChart3 size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Spending Efficiency by Service</h2>
          <p className="section-note">
            AI DOGE efficiency analysis: supplier concentration, duplicate rates, and value-for-money indicators across {efficiencyData.categories_analysed || Object.keys(efficiencyData.categories).length} budget categories
          </p>
          <div className="department-table">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Budget Category</th>
                  <th style={{ textAlign: 'right' }}>Transactions</th>
                  <th style={{ textAlign: 'right' }}>Total Spend</th>
                  <th style={{ textAlign: 'center' }}>Concentration</th>
                  <th style={{ textAlign: 'center' }}>Duplicate Rate</th>
                  <th style={{ textAlign: 'center' }}>Rating</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(efficiencyData.categories)
                  .filter(([name]) => name !== 'Other services' && name !== 'Capital')
                  .sort((a, b) => b[1].total_spend - a[1].total_spend)
                  .map(([name, cat]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td style={{ textAlign: 'right' }}>{cat.transactions?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(cat.total_spend, true)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`efficiency-badge ${cat.hhi_category === 'high' ? 'badge-danger' : cat.hhi_category === 'moderate' ? 'badge-warning' : 'badge-ok'}`}>
                        {cat.hhi_category}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{cat.duplicate_rate_pct?.toFixed(1)}%</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`efficiency-badge ${cat.rating === 'red' ? 'badge-danger' : cat.rating === 'amber' ? 'badge-warning' : 'badge-ok'}`}>
                        {cat.rating === 'red' ? '⚠ Issues' : cat.rating === 'amber' ? 'Caution' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {efficiencyData.unmapped_spend > 0 && (
            <p className="section-note" style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
              Note: {formatCurrency(efficiencyData.unmapped_spend, true)} across {efficiencyData.unmapped_transactions?.toLocaleString()} transactions could not be mapped to budget categories due to non-standard department names.
            </p>
          )}
        </section>
      )}

      {/* Funding Sources Breakdown (from budgets_summary financing_trends) */}
      {summaryData?.financing_trends && (() => {
        const latestYear = summaryData.latest_year || summaryData.financial_year
        const financing = summaryData.financing_trends?.[latestYear]
        if (!financing) return null
        const fundingData = Object.entries(financing)
          .filter(([, val]) => val !== 0)
          .map(([name, val]) => ({ name: name.replace(/_/g, ' '), value: Math.abs(val) }))
          .sort((a, b) => b.value - a.value)
        if (fundingData.length === 0) return null
        const fundingColors = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff']
        return (
          <section className="chart-section">
            <h2><Landmark size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Funding Sources ({latestYear?.replace('-', '/')})</h2>
            <p className="section-note">How the council's expenditure is funded beyond council tax</p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fundingData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    type="number"
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `£${(v / 1_000_000).toFixed(0)}M`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={AXIS_TICK_STYLE}
                    width={200}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatCurrency(value, true)]}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {fundingData.map((entry, index) => (
                      <Cell key={`fund-${index}`} fill={fundingColors[index % fundingColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )
      })()}

      {/* Legacy Revenue Trend (fallback for councils without multi-year data) */}
      {!isMultiYear && trendChartData.length > 0 && (
        <section className="chart-section">
          <h2>Revenue Trend ({trendsData?.years?.[0]} to {trendsData?.years?.[trendsData?.years?.length - 1]})</h2>
          <p className="section-note">Service expenditure breakdown over {trendsData?.year_count} years (£ millions, GOV.UK outturn)</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={trendChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                <YAxis
                  tick={AXIS_TICK_STYLE}
                  tickFormatter={(v) => `£${v}M`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => [`£${value.toFixed(2)}M`, serviceLabels[name] || name]}
                />
                {serviceKeys.map(key => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    stroke={serviceColors[key]}
                    fill={serviceColors[key]}
                    fillOpacity={0.4}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Band D Council Tax History from budgets_summary.json */}
      {summaryData?.council_tax?.band_d_by_year && (() => {
        const bandDData = Object.entries(summaryData.council_tax.band_d_by_year)
          .filter(([year]) => {
            const startYear = parseInt(year.split('/')[0])
            return startYear >= 2010
          })
          .map(([year, value]) => ({ year: year.replace('/', '/'), value }))
        return bandDData.length > 0 ? (
          <section className="chart-section">
            <h2>Band D Council Tax ({councilName} element)</h2>
            <p className="section-note">
              District council element only — excludes county, police, and fire precepts.
              Current: £{bandDData[bandDData.length - 1]?.value?.toFixed(2)} ({summaryData.council_tax.band_d_by_year && Object.keys(summaryData.council_tax.band_d_by_year).pop()})
            </p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={bandDData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" tick={AXIS_TICK_STYLE} interval={2} />
                  <YAxis
                    tick={AXIS_TICK_STYLE}
                    tickFormatter={(v) => `£${v}`}
                    domain={['dataMin - 10', 'dataMax + 10']}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`£${value.toFixed(2)}`, `${councilName} Band D`]}
                  />
                  <Line type="monotone" dataKey="value" stroke="#ff9f0a" strokeWidth={2} dot={{ fill: '#ff9f0a', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null
      })()}

      {/* Collection Performance (from collection_rates.json) */}
      {collectionRates && (
        <CollectionRatesSection collectionRates={collectionRates} councilName={councilName} />
      )}

      {/* Detailed Service Breakdown from budgets_summary.json */}
      {summaryData?.detail && (() => {
        const allServices = [
          ...(summaryData.detail.cultural_environmental_planning ? Object.entries(summaryData.detail.cultural_environmental_planning) : []),
          ...(summaryData.detail.housing ? Object.entries(summaryData.detail.housing) : []),
          ...(summaryData.detail.central_services ? Object.entries(summaryData.detail.central_services) : []),
        ].filter(([, val]) => val !== 0)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))

        return allServices.length > 0 ? (
          <section className="chart-section">
            <h2>Detailed Service Breakdown ({summaryData.financial_year})</h2>
            <p className="section-note">Granular outturn spending by individual service line — {allServices.length} services</p>
            <div className="department-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Service</th>
                    <th style={{ textAlign: 'right' }}>Outturn (£)</th>
                  </tr>
                </thead>
                <tbody>
                  {allServices.map(([name, val]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td style={{ textAlign: 'right', color: val < 0 ? '#30d158' : 'inherit' }}>
                        {formatCurrency(val, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null
      })()}

      {/* Reserves Section */}
      {summaryData?.reserves && summaryData.reserves.total_opening != null && (
        <section className="chart-section">
          <h2><PiggyBank size={20} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />Financial Reserves ({summaryData.financial_year})</h2>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="stat-label">Total Reserves (Opening)</div>
              <div className="stat-value">{formatCurrency(summaryData.reserves.total_opening, false)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Reserves (Closing)</div>
              <div className="stat-value">{formatCurrency(summaryData.reserves.total_closing, false)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Year-on-Year Change</div>
              <div className="stat-value" style={{ color: summaryData.reserves.change < 0 ? '#ff453a' : '#30d158' }}>
                {summaryData.reserves.change > 0 ? '+' : ''}{formatCurrency(summaryData.reserves.change, false)}
              </div>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card" style={{ background: 'var(--bg-tertiary)' }}>
              <div className="stat-label">Earmarked Reserves</div>
              <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                {formatCurrency(summaryData.reserves.earmarked_opening, false)} → {formatCurrency(summaryData.reserves.earmarked_closing, false)}
              </div>
            </div>
            <div className="stat-card" style={{ background: 'var(--bg-tertiary)' }}>
              <div className="stat-label">Unallocated Reserves</div>
              <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                {formatCurrency(summaryData.reserves.unallocated_opening, false)} → {formatCurrency(summaryData.reserves.unallocated_closing, false)}
              </div>
            </div>
          </div>
          <p className="section-note" style={{ marginTop: '0.5rem' }}>
            Earmarked reserves are set aside for specific purposes. Unallocated reserves provide a general financial safety net.
          </p>
        </section>
      )}

      {/* Data Source & Context */}
      <section className="context-section">
        <h2>About This Data</h2>
        <div className="context-card">
          <div className="context-item">
            <h4>Source</h4>
            <p>
              Revenue Outturn data published by the Ministry of Housing, Communities and Local Government (MHCLG).
              This is official, certified data submitted by {councilFullName} under statutory reporting requirements.
              Licensed under the Open Government Licence v3.0.
            </p>
          </div>
          <div className="context-item">
            <h4>What's Included</h4>
            <p>
              {councilTier === 'district' ? (
                <>Service expenditure covers the main areas of district council spending: housing, environmental services, planning,
                cultural services, highways, and central administration. Non-district services (education, police, fire, adult social care) are
                excluded as they are provided by Lancashire County Council.</>
              ) : councilTier === 'county' ? (
                <>Service expenditure covers all county council responsibilities including education, children's and adult social care,
                public health, highways, waste disposal, libraries, and central services. District-level services (housing, waste collection)
                are excluded as they are provided by borough councils.</>
              ) : (
                <>As a unitary authority, service expenditure covers all council responsibilities including education, social care,
                public health, housing, environmental services, planning, highways, and central administration.</>
              )}
              {' '}Figures show <em>actual outturn</em> (what was really spent), not budget estimates.
            </p>
          </div>
          <div className="context-item">
            <h4>Financial Reserves</h4>
            <p>
              Reserves data shows the council's financial safety cushion. Earmarked reserves are ring-fenced for specific purposes
              (e.g. insurance, capital programmes). Unallocated reserves provide flexibility for unexpected costs.
              Healthy reserves are typically 5-10% of net revenue expenditure.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Budgets
