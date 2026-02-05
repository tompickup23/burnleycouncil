import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, PiggyBank, Building, Landmark, HardHat, Wallet, BarChart3, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { formatCurrency, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { LoadingState } from '../components/ui'
import './Budgets.css'

// Consistent department list for comparison (excluding zero-budget and reserves)
const CORE_DEPARTMENTS = [
  'Streetscene',
  'Leisure Trust Client',
  'Green Spaces & Amenities',
  'Corporate Budgets',
  'Housing & Development Control',
  'Economy & Growth',
  'Legal & Democratic Services',
  'Policy & Engagement',
  'Revenues & Benefits',
  'Strategic Partnership',
]

// Chart colors
const DEPT_COLORS = [
  '#0a84ff', '#30d158', '#ff9f0a', '#ff453a', '#bf5af2',
  '#64d2ff', '#ffd60a', '#ff6482', '#ac8e68', '#8e8e93',
]

const CAPITAL_COLORS = {
  'Housing': '#30d158',
  'Economy & Growth': '#0a84ff',
  'Finance & Property': '#ff9f0a',
  'Green Spaces & Amenities': '#bf5af2',
  'Streetscene': '#64d2ff',
}

function Budgets() {
  const { data, loading } = useData([
    '/data/budgets.json',
    '/data/budget_insights.json',
  ])
  const [budgetData, insights] = data || [null, null]
  const [activeTab, setActiveTab] = useState('revenue')
  const [expandedDept, setExpandedDept] = useState(null)
  const [selectedYear, setSelectedYear] = useState(() => {
    // Will be properly initialized once budgetData loads
    return null
  })

  useEffect(() => {
    document.title = 'Budget Analysis | Burnley Council Transparency'
    return () => { document.title = 'Burnley Council Transparency' }
  }, [])

  // Initialize selectedYear when data first loads
  if (budgetData && selectedYear === null) {
    setSelectedYear(budgetData.revenue_budgets?.length - 1 || 0)
  }

  if (loading) {
    return <LoadingState message="Loading budget data..." />
  }

  const revenueBudgets = budgetData?.revenue_budgets || []
  const capitalProgrammes = budgetData?.capital_programmes || []
  const treasury = budgetData?.treasury_and_investment || {}
  const budgetInsights = budgetData?.insights || {}
  const yoyChanges = insights?.yoy_changes || []
  const highlights = insights?.political_highlights || []
  const efficiency = insights?.efficiency_metrics || {}

  // Revenue chart data
  const revenueChartData = revenueBudgets.map(b => ({
    year: b.financial_year,
    budget: b.net_revenue_budget / 1_000_000,
    councilTax: b.council_tax?.burnley_element || 0,
  }))

  // Departmental data for selected year
  const selectedBudget = revenueBudgets[selectedYear] || revenueBudgets[revenueBudgets.length - 1]
  const deptData = selectedBudget?.departments || {}

  // Finance & Property row that handles the 2025/26 split
  const fpRow = {
    department: 'Finance & Property',
  }
  revenueBudgets.forEach(b => {
    const fp = b.departments['Finance & Property']
    const f = b.departments['Finance (from 01/04/2025)']
    const p = b.departments['Property (back in-house 01/04/2025)']
    if (fp !== undefined) {
      fpRow[b.financial_year] = fp
    } else if (f !== undefined && p !== undefined) {
      fpRow[b.financial_year] = f + p
      fpRow[b.financial_year + '_note'] = 'Split: Finance £' + Math.round(f/1000) + 'K + Property -£' + Math.round(Math.abs(p)/1000) + 'K'
    }
  })

  // Pie chart data for selected year's departments
  const pieData = Object.entries(deptData)
    .filter(([name, val]) => val > 0 && name !== 'Management Team' && name !== 'People & Development' && name !== 'Earmarked Reserves')
    .sort((a, b) => b[1] - a[1])
    .map(([name, val], i) => ({
      name: name.replace('(from 01/04/2025)', '').replace('(back in-house 01/04/2025)', '').trim(),
      value: val,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }))

  // Capital programme chart data
  const latestCapital = capitalProgrammes[capitalProgrammes.length - 1]
  const capitalCategoryData = latestCapital ? Object.entries(latestCapital.categories).map(([name, data]) => ({
    name: name.length > 15 ? name.substring(0, 15) + '...' : name,
    fullName: name,
    value: data.total / 1_000_000,
    note: data.note || '',
    color: CAPITAL_COLORS[name] || '#8e8e93',
  })) : []

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
    <div className="budgets-page animate-fade-in">
      <header className="page-header">
        <h1>Budget Analysis</h1>
        <p className="subtitle">
          Comprehensive analysis of Burnley Borough Council's revenue and capital budgets (2020/21 – 2025/26)
        </p>
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
      <nav className="budget-tabs">
        <button
          className={`tab-btn ${activeTab === 'revenue' ? 'active' : ''}`}
          onClick={() => setActiveTab('revenue')}
        >
          <Wallet size={18} />
          Revenue Budget
        </button>
        <button
          className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          <Building size={18} />
          Departmental Breakdown
        </button>
        <button
          className={`tab-btn ${activeTab === 'capital' ? 'active' : ''}`}
          onClick={() => setActiveTab('capital')}
        >
          <HardHat size={18} />
          Capital Programme
        </button>
        <button
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
                      ({change.change_percent > 0 ? '+' : ''}{change.change_percent.toFixed(1)}%)
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
            <h2>Council Tax (Burnley Element) Band D</h2>
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
                    formatter={(value) => [`£${value.toFixed(2)}`, 'Band D (Burnley)']}
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
                This is the Burnley Borough Council element only. Total Band D council tax includes Lancashire County Council, police, and fire precepts.
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
          <div className="year-selector">
            <span className="year-label">Showing:</span>
            {revenueBudgets.map((b, i) => (
              <button
                key={i}
                className={`year-btn ${selectedYear === i ? 'active' : ''}`}
                onClick={() => setSelectedYear(i)}
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
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    {revenueBudgets.map(b => (
                      <th key={b.financial_year}>{b.financial_year}</th>
                    ))}
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {CORE_DEPARTMENTS.map(dept => {
                    const values = revenueBudgets.map(b => {
                      if (dept === 'Finance & Property' || dept.startsWith('Finance')) {
                        const fp = b.departments['Finance & Property']
                        const f = b.departments['Finance (from 01/04/2025)']
                        const p = b.departments['Property (back in-house 01/04/2025)']
                        if (fp !== undefined) return fp
                        if (f !== undefined && p !== undefined) return f + p
                        return null
                      }
                      return b.departments[dept] ?? null
                    })
                    const first = values.find(v => v !== null && v !== 0)
                    const last = values[values.length - 1]
                    const growthPct = first && last ? ((last - first) / Math.abs(first) * 100).toFixed(0) : null

                    // Special handling for Finance & Property
                    const deptName = dept === 'Finance & Property' ? 'Finance & Property *' : dept

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
                  {/* Earmarked Reserves row */}
                  <tr className="reserves-row">
                    <td className="dept-name">Earmarked Reserves</td>
                    {revenueBudgets.map((b, i) => (
                      <td key={i} className={b.departments['Earmarked Reserves'] < 0 ? 'negative' : ''}>
                        {formatCurrency(b.departments['Earmarked Reserves'], true)}
                      </td>
                    ))}
                    <td></td>
                  </tr>
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
              * Finance & Property split into separate departments in 2025/26. Property services brought back in-house from Liberata.
              Combined figure shown for comparison. Source: Burnley Council Budget Books.
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
                    +{data.growth_pct.toFixed(0)}%
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

          {/* Treasury Overview Cards */}
          <section className="treasury-grid">
            <div className="treasury-card">
              <h3>Borrowing</h3>
              <p>{treasury.key_context?.borrowing}</p>
            </div>
            <div className="treasury-card">
              <h3>Investments</h3>
              <p>{treasury.key_context?.investments}</p>
            </div>
            <div className="treasury-card">
              <h3>Minimum Revenue Provision (MRP)</h3>
              <p>{treasury.key_context?.mrp}</p>
            </div>
            <div className="treasury-card">
              <h3>Charter Walk Investment</h3>
              <p>{treasury.key_context?.charter_walk}</p>
            </div>
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
                  Earmarked reserves are set aside for specific purposes. In 2025/26, earmarked reserves were slashed from
                  £1.33M to just £2,250 — raising concerns about financial resilience.
                </p>
              </div>
              <div className="context-item">
                <h4>External Spending Data</h4>
                <p>
                  The spending data published under the Transparency Code shows external payments to suppliers — invoices over
                  £500, contracts, and purchase cards. This includes BOTH revenue payments (e.g. Liberata contract) AND capital
                  payments (e.g. the £19.8M Geldards payment for Pioneer Place construction). It does NOT show internal costs
                  like staff salaries.
                </p>
              </div>
              <div className="context-item">
                <h4>Key Risks</h4>
                <p>
                  Rising MRP costs from past capital borrowing eating into revenue budget.
                  Declining government grants (New Homes Bonus fell from £694K to £239K).
                  Near-exhaustion of earmarked reserves (£1.33M → £2,250 in one year).
                  Council tax increases capped by referendum limits (typically 2-3% for district councils).
                </p>
              </div>
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

export default Budgets
