import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, PiggyBank, Building } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { formatCurrency, formatPercent, formatNumber } from '../utils/format'
import './Budgets.css'

function Budgets() {
  const [budgets, setBudgets] = useState([])
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/data/budgets.json').then(r => r.json()),
      fetch('/data/budget_insights.json').then(r => r.json()),
    ])
      .then(([budgetsData, insightsData]) => {
        setBudgets(budgetsData)
        setInsights(insightsData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load data:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="loading">Loading budget data...</div>
  }

  // Prepare chart data
  const chartData = budgets
    .filter(b => b.headline?.net_revenue_budget)
    .sort((a, b) => (a.financial_year || '').localeCompare(b.financial_year || ''))
    .map(b => ({
      year: b.financial_year?.replace('/', '/') || '',
      budget: b.headline?.net_revenue_budget / 1_000_000,
      councilTax: b.headline?.burnley_element || 0,
    }))

  const yoyChanges = insights?.yoy_changes || []
  const efficiency = insights?.efficiency_metrics || {}
  const highlights = insights?.political_highlights || []

  return (
    <div className="budgets-page animate-fade-in">
      <header className="page-header">
        <h1>Budget Analysis</h1>
        <p className="subtitle">
          DOGE-style analysis of Burnley Borough Council's revenue budgets
        </p>
      </header>

      {/* Key Metrics */}
      <section className="metrics-grid">
        <div className="metric-card highlight">
          <div className="metric-icon">
            <PiggyBank size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{formatCurrency(efficiency.latest_budget, true)}</span>
            <span className="metric-label">2025/26 Net Revenue Budget</span>
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

      {/* Budget Trend Chart */}
      <section className="chart-section">
        <h2>Budget Trend</h2>
        <div className="chart-card">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="year"
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              />
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
                labelStyle={{ color: 'var(--text-primary)' }}
                formatter={(value) => [`£${value.toFixed(2)}M`, 'Net Budget']}
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

      {/* Council Tax Trend */}
      <section className="chart-section">
        <h2>Council Tax (Burnley Element) Trend</h2>
        <div className="chart-card">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData.filter(d => d.councilTax > 0)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis
                dataKey="year"
                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              />
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
            Note: This is the Burnley Borough Council element only. Total council tax includes Lancashire County Council, police, and fire precepts.
          </p>
        </div>
      </section>

      {/* Political Highlights */}
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

            <div className="highlight-card">
              <AlertTriangle size={20} className="highlight-icon" />
              <p>Budget has grown by {formatCurrency(efficiency.latest_budget - efficiency.earliest_budget, true)} in {efficiency.years_covered} years - taxpayers should ask why</p>
            </div>
          </div>
        </section>
      )}

      {/* Budget Context */}
      <section className="context-section">
        <h2>Understanding Council Budgets</h2>
        <div className="context-card">
          <div className="context-item">
            <h4>Net Revenue Budget</h4>
            <p>The day-to-day running costs that the council must fund from council tax and grants. This excludes capital spending on buildings and infrastructure.</p>
          </div>
          <div className="context-item">
            <h4>Council Tax Dependency</h4>
            <p>Approximately 44% of Burnley's net budget comes from council tax. The rest comes from business rates retention, government grants, and fees.</p>
          </div>
          <div className="context-item">
            <h4>Budget Pressures</h4>
            <p>Local authorities face pressures from inflation, demand for services, and reduced central government funding. However, taxpayers deserve scrutiny of how money is spent.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Budgets
