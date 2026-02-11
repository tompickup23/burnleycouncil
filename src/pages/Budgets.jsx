import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, PiggyBank, Building, Landmark, HardHat, Wallet, BarChart3, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { formatCurrency, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState, DataFreshness } from '../components/ui'
import { CHART_COLORS_EXTENDED as DEPT_COLORS } from '../utils/constants'
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
  const hasBudgets = config.data_sources?.budgets !== false
  const hasBudgetTrends = config.data_sources?.budget_trends

  // Load different data depending on what's available
  const budgetUrls = hasBudgets
    ? ['/data/budgets.json', '/data/budget_insights.json']
    : ['/data/budgets_govuk.json', '/data/revenue_trends.json', '/data/budgets_summary.json']
  const { data, loading, error } = useData(budgetUrls)
  const [budgetData, insights, budgetSummary] = data || [null, null, null]
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
  const yoyChanges = insights?.yoy_changes || []
  const highlights = insights?.political_highlights || []
  const efficiency = insights?.efficiency_metrics || {}

  // Revenue chart data
  const revenueChartData = useMemo(() => revenueBudgets.map(b => ({
    year: b.financial_year,
    budget: (b.net_revenue_budget || 0) / 1_000_000,
    councilTax: b.council_tax?.council_element ?? b.council_tax?.[`${config.council_id}_element`] ?? b.council_tax?.burnley_element ?? 0,
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
    return <BudgetTrendsView councilName={councilName} councilFullName={councilFullName} govukData={budgetData} trendsData={insights} summaryData={budgetSummary} />
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

  // Funding source data for selected year
  const fundingData = selectedBudget?.funding_sources || {}
  const fundingChartData = [
    { name: 'Council Tax', value: Math.abs(fundingData.council_tax || 0) / 1_000_000, color: '#0a84ff' },
    { name: 'Business Rates', value: (Math.abs(fundingData.business_rate_baseline || 0) + Math.abs(fundingData.additional_business_rates || 0)) / 1_000_000, color: '#30d158' },
    { name: 'Government Grants', value: (Math.abs(fundingData.revenue_support_grant || 0) + Math.abs(fundingData.new_homes_bonus || 0) + Math.abs(fundingData.recovery_grant || 0) + Math.abs(fundingData.funding_guarantee_grant || 0) + Math.abs(fundingData.services_grant || 0) + Math.abs(fundingData.services_grant_2022 || 0) + Math.abs(fundingData.lower_tier_services_grant || 0) + Math.abs(fundingData.local_council_tax_support_grant || 0) + Math.abs(fundingData.domestic_abuse_grant || 0) + Math.abs(fundingData.ni_contribution_grant || 0)) / 1_000_000, color: '#ff9f0a' },
    { name: 'Other', value: (Math.abs(fundingData.renewable_energy_schemes || 0) + Math.abs(fundingData.business_rates_multiplier_grant || 0) + Math.abs(fundingData.parish_precepts || 0)) / 1_000_000, color: '#8e8e93' },
  ].filter(d => d.value > 0)

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
          <strong>Revenue vs Capital:</strong> The council has two separate budgets.
          The <strong>Revenue Budget</strong> ({formatCurrency(budgetInsights.revenue_vs_capital?.current_revenue, true)}) covers
          day-to-day running costs — staff, services, utilities — funded by council tax and grants.
          The <strong>Capital Programme</strong> ({formatCurrency(budgetInsights.revenue_vs_capital?.current_capital_5yr, true)} over 5 years) covers
          long-term investment in buildings, infrastructure, and equipment — funded by borrowing and capital grants.
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
        <button
          role="tab"
          aria-selected={activeTab === 'capital'}
          className={`tab-btn ${activeTab === 'capital' ? 'active' : ''}`}
          onClick={() => setActiveTab('capital')}
        >
          <HardHat size={18} />
          Capital Programme
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'treasury'}
          className={`tab-btn ${activeTab === 'treasury' ? 'active' : ''}`}
          onClick={() => setActiveTab('treasury')}
        >
          <Landmark size={18} />
          Treasury & Investment
        </button>
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

          {/* Revenue Trend Chart */}
          <section className="chart-section">
            <h2>Revenue Budget Trend</h2>
            <p className="section-note">Net revenue budget — the cost of running day-to-day council services</p>
            <div className="chart-card">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
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
                      contentStyle={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                      }}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis
                    domain={['dataMin - 10', 'dataMax + 10']}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `£${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
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
                This is the {councilFullName} element only. Total Band D council tax includes Lancashire County Council, police, and fire precepts.
              </p>
            </div>
          </section>

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
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [formatCurrency(value, true)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Department Table */}
          <section className="table-section">
            <h2>Departmental Budget Comparison</h2>
            <p className="section-note">All figures are net revenue budget (£). Negative values indicate net income generators.</p>
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

                    return (
                      <tr key={dept} className={expandedDept === dept ? 'expanded' : ''}>
                        <td className="dept-name" onClick={() => setExpandedDept(expandedDept === dept ? null : dept)}>
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
              Source: {councilName} Council Budget Books.
            </p>
          </section>

          {/* Departmental Growth Rankings */}
          <section className="growth-section">
            <h2>Fastest Growing Departments (2021/22 → 2025/26)</h2>
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
        </div>
      )}

      {/* ============ CAPITAL TAB ============ */}
      {activeTab === 'capital' && (
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="period" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
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
      {activeTab === 'treasury' && (
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
                  Common pressures facing district councils include: rising MRP costs from past capital borrowing,
                  declining government grants, constrained council tax increases (capped by referendum limits at
                  typically 2-3% for districts), and the challenge of maintaining adequate reserve levels while
                  delivering services with a shrinking funding base.
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
function BudgetTrendsView({ councilName, councilFullName, govukData, trendsData, summaryData }) {
  // Service expenditure bar chart — only district-relevant services with non-zero values
  const serviceData = govukData?.revenue_summary?.service_expenditure
    ? Object.entries(govukData?.revenue_summary?.service_expenditure || {})
        .filter(([name, d]) => d.relevant_to_districts && d.value_pounds > 0 && name !== 'TOTAL SERVICE EXPENDITURE')
        .sort((a, b) => b[1].value_pounds - a[1].value_pounds)
        .map(([name, d], i) => ({
          name: name.length > 25 ? name.substring(0, 22) + '...' : name,
          fullName: name,
          value: d.value_pounds / 1_000_000,
          color: DEPT_COLORS[i % DEPT_COLORS.length],
        }))
    : []

  const totalServiceExpenditure = govukData?.revenue_summary?.service_expenditure?.['TOTAL SERVICE EXPENDITURE']?.value_pounds || 0
  const netRevenue = govukData?.revenue_summary?.key_financials?.['NET REVENUE EXPENDITURE']?.value_pounds || 0
  const councilTaxReq = govukData?.revenue_summary?.key_financials?.['COUNCIL TAX REQUIREMENT']?.value_pounds || 0

  // Revenue trend over years
  const trendChartData = trendsData?.years
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

  // Service breakdown trend for stacked area chart
  const serviceKeys = ['environmental', 'central', 'cultural', 'housing', 'planning']
  const serviceLabels = {
    environmental: 'Environmental',
    central: 'Central Services',
    cultural: 'Cultural',
    housing: 'Housing',
    planning: 'Planning',
  }
  const serviceColors = {
    environmental: '#30d158',
    central: '#0a84ff',
    cultural: '#ff9f0a',
    housing: '#bf5af2',
    planning: '#64d2ff',
  }

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

      {/* Service Expenditure Breakdown */}
      {serviceData.length > 0 && (
        <section className="chart-section">
          <h2>Service Expenditure ({govukData?.financial_year})</h2>
          <p className="section-note">Actual outturn spend by service area — district-relevant services only</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={serviceData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickFormatter={(v) => `£${v.toFixed(1)}M`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  width={160}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
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

      {/* Revenue Trend Over Time */}
      {trendChartData.length > 0 && (
        <section className="chart-section">
          <h2>Revenue Trend ({trendsData?.years?.[0]} to {trendsData?.years?.[trendsData?.years?.length - 1]})</h2>
          <p className="section-note">Service expenditure breakdown over {trendsData?.year_count} years (£ millions, GOV.UK outturn)</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={trendChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickFormatter={(v) => `£${v}M`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
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
            <div className="funding-breakdown" style={{ marginTop: 'var(--space-md)' }}>
              {serviceKeys.map(key => (
                <div key={key} className="funding-item">
                  <span className="funding-dot" style={{ background: serviceColors[key] }} />
                  <span className="funding-name">{serviceLabels[key]}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Total Net Expenditure Trend */}
      {trendChartData.length > 0 && (
        <section className="chart-section">
          <h2>Total Net Current Expenditure Trend</h2>
          <p className="section-note">Includes housing benefit, parish precepts, and all service areas</p>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickFormatter={(v) => `£${v}M`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
                  formatter={(value) => [`£${value.toFixed(1)}M`, 'Net Current Expenditure']}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--accent-blue)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--accent-blue)', r: 4 }}
                />
              </LineChart>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} interval={2} />
                  <YAxis
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `£${v}`}
                    domain={['dataMin - 10', 'dataMax + 10']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [`£${value.toFixed(2)}`, `${councilName} Band D`]}
                  />
                  <Line type="monotone" dataKey="value" stroke="#ff9f0a" strokeWidth={2} dot={{ fill: '#ff9f0a', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null
      })()}

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
              Service expenditure covers the main areas of council spending: housing, environmental services, planning,
              cultural services, highways, and central administration. Figures show <em>actual outturn</em> (what was
              really spent), not budget estimates. Non-district services (education, police, fire, adult social care) are
              excluded as they are provided by Lancashire County Council.
            </p>
          </div>
          <div className="context-item">
            <h4>Detailed Budgets Coming Soon</h4>
            <p>
              We're working on extracting detailed budget book data for {councilFullName}, which will provide departmental
              breakdowns, capital programme details, treasury management information, and year-on-year budget comparisons
              similar to other councils on this site.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Budgets
