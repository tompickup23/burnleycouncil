import { useEffect } from 'react'
import { Users, TrendingUp, AlertTriangle, Building, ChevronRight, Info } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { formatCurrency } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './PayComparison.css'

function PayComparison() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'

  const { data, loading } = useData('/data/pay_comparison.json')
  const payData = data

  useEffect(() => {
    document.title = `Executive Pay | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  if (loading) return <LoadingState message="Loading pay data..." />
  if (!payData) return <div className="pay-page"><p>No pay comparison data available for this council.</p></div>

  const ceo = payData.chief_executive || {}
  const history = payData.pay_history || []
  const seniors = payData.senior_officers || []
  const comparators = payData.comparators || []
  const national = payData.national_context || {}
  const latestYear = history[history.length - 1] || {}

  // Chart data — CEO salary trend
  const salaryTrendData = history.map(h => ({
    year: h.year?.replace('20', "'").replace('/20', '/'),
    salary: h.ceo_salary,
    total: h.ceo_total_remuneration,
    median: h.median_employee_salary,
  }))

  // Chart data — pay ratio trend
  const ratioTrendData = history.map(h => ({
    year: h.year?.replace('20', "'").replace('/20', '/'),
    medianRatio: h.ceo_to_median_ratio,
    lowestRatio: h.ceo_to_lowest_ratio,
  }))

  // Chart data — cross-council comparison
  const comparisonData = comparators
    .sort((a, b) => (b.ceo_salary_midpoint || 0) - (a.ceo_salary_midpoint || 0))
    .map(c => ({
      name: c.council,
      salary: c.ceo_salary_midpoint,
      ratio: c.ceo_to_median_ratio,
      isCurrent: c.council === councilName,
    }))

  return (
    <div className="pay-page animate-fade-in">
      {/* Hero */}
      <header className="pay-hero">
        <div className="hero-content">
          <h1>Executive Pay Comparison</h1>
          <p className="hero-subtitle">
            How senior officer pay at {councilName} Council compares to staff, neighbouring councils, and national benchmarks.
          </p>
        </div>
      </header>

      {/* Key Stats */}
      <section className="pay-stats-grid">
        <div className="pay-stat-card highlight">
          <span className="stat-value">{ceo.current_salary_band || `£${(ceo.current_midpoint || 0).toLocaleString()}`}</span>
          <span className="stat-label">{ceo.title || 'Chief Executive'} Salary Band</span>
        </div>
        <div className="pay-stat-card">
          <span className="stat-value">{latestYear.ceo_to_median_ratio ? `${latestYear.ceo_to_median_ratio}:1` : '—'}</span>
          <span className="stat-label">CEO-to-Median Pay Ratio</span>
        </div>
        <div className="pay-stat-card">
          <span className="stat-value">{latestYear.ceo_to_lowest_ratio ? `${latestYear.ceo_to_lowest_ratio}:1` : '—'}</span>
          <span className="stat-label">CEO-to-Lowest Pay Ratio</span>
        </div>
        <div className="pay-stat-card">
          <span className="stat-value">{latestYear.ceo_total_remuneration ? formatCurrency(latestYear.ceo_total_remuneration) : '—'}</span>
          <span className="stat-label">Total CEO Remuneration ({latestYear.year || ''})</span>
        </div>
      </section>

      {/* Salary Trend Chart */}
      {salaryTrendData.length > 1 && (
        <section className="pay-section">
          <h2><TrendingUp size={22} /> CEO Pay vs Median Employee Pay</h2>
          <p className="section-intro">
            How the Chief Executive's total remuneration compares to the median employee salary over time.
          </p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={salaryTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <YAxis tickFormatter={v => `£${(v / 1000).toFixed(0)}K`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) => [formatCurrency(value), name === 'total' ? 'CEO Total Remuneration' : name === 'salary' ? 'CEO Base Salary' : 'Median Employee Salary']}
                  contentStyle={{ background: 'var(--card-bg, #1c1c1e)', border: '1px solid var(--border-color, #333)', borderRadius: '8px' }}
                />
                <Legend />
                <Line type="monotone" dataKey="total" name="CEO Total Remuneration" stroke="#ff453a" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="salary" name="CEO Base Salary" stroke="#ff9f0a" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="median" name="Median Employee" stroke="#30d158" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Pay Ratio Trend */}
      {ratioTrendData.length > 1 && (
        <section className="pay-section">
          <h2><Users size={22} /> Pay Ratio Trend</h2>
          <p className="section-intro">
            The ratio between the CEO's total remuneration and the median/lowest employee pay. The Hutton Review recommends a maximum ratio of {national.recommended_max_ratio || 20}:1.
          </p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ratioTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
                <XAxis dataKey="year" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} domain={[0, 'auto']} />
                <Tooltip
                  formatter={(value, name) => [`${value}:1`, name === 'medianRatio' ? 'CEO:Median Ratio' : 'CEO:Lowest Ratio']}
                  contentStyle={{ background: 'var(--card-bg, #1c1c1e)', border: '1px solid var(--border-color, #333)', borderRadius: '8px' }}
                />
                <Legend />
                <Bar dataKey="medianRatio" name="CEO:Median" fill="#0a84ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lowestRatio" name="CEO:Lowest Paid" fill="#ff9f0a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Cross-Council Comparison */}
      {comparisonData.length > 0 && (
        <section className="pay-section">
          <h2><Building size={22} /> How {councilName} Compares</h2>
          <p className="section-intro">
            Chief Executive salary midpoints across Lancashire district councils. National district average: {national.district_ceo_average ? formatCurrency(national.district_ceo_average) : '—'}.
          </p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={Math.max(280, comparisonData.length * 40)}>
              <BarChart data={comparisonData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
                <XAxis type="number" tickFormatter={v => `£${(v / 1000).toFixed(0)}K`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-primary, #fff)', fontSize: 12 }} width={80} />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'CEO Salary Midpoint']}
                  contentStyle={{ background: 'var(--card-bg, #1c1c1e)', border: '1px solid var(--border-color, #333)', borderRadius: '8px' }}
                />
                <Bar dataKey="salary" radius={[0, 4, 4, 0]}>
                  {comparisonData.map((entry, i) => (
                    <rect key={i} fill={entry.isCurrent ? '#0a84ff' : '#48484a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison table */}
          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Council</th>
                  <th>Type</th>
                  <th>Population</th>
                  <th>CEO Salary</th>
                  <th>CEO:Median</th>
                  <th>Net Revenue Budget</th>
                </tr>
              </thead>
              <tbody>
                {comparators.sort((a, b) => (b.ceo_salary_midpoint || 0) - (a.ceo_salary_midpoint || 0)).map((c, i) => (
                  <tr key={i} className={c.council === councilName ? 'highlight-row' : ''}>
                    <td className="council-name">{c.council}{c.council === councilName ? ' ★' : ''}</td>
                    <td>{c.type}</td>
                    <td>{(c.population || 0).toLocaleString()}</td>
                    <td>{formatCurrency(c.ceo_salary_midpoint)}</td>
                    <td>{c.ceo_to_median_ratio ? `${c.ceo_to_median_ratio}:1` : '—'}</td>
                    <td>{c.net_revenue_budget || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Senior Officers */}
      {seniors.length > 0 && (
        <section className="pay-section">
          <h2><Users size={22} /> Senior Officer Pay Bands</h2>
          <p className="section-intro">
            Salary bands for senior officers at {councilName} Council, from published Pay Policy Statements.
          </p>
          <div className="senior-officers-grid">
            {seniors.map((officer, i) => (
              <div key={i} className="officer-card">
                <h4>{officer.post}</h4>
                <span className="officer-salary">{officer.salary_band}</span>
                {officer.midpoint && <span className="officer-midpoint">Midpoint: {formatCurrency(officer.midpoint)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data Quality Note */}
      <section className="pay-section">
        <div className="data-quality-note">
          <Info size={18} />
          <div>
            <h4>About This Data</h4>
            <p>{payData.note || 'Data compiled from publicly available Pay Policy Statements and annual accounts.'}</p>
            <p className="source-text">Source: {payData.source || 'Pay Policy Statements and annual accounts'}</p>
            {payData.last_updated && <p className="source-text">Last updated: {payData.last_updated}</p>}
          </div>
        </div>
      </section>

      {/* FOI CTA */}
      <section className="pay-cta">
        <h3>Want the exact figures?</h3>
        <p>Pay Policy Statements give salary bands, not exact figures. Use our FOI templates to request the full breakdown.</p>
        <a href="/foi" className="cta-link">
          Request Pay Data via FOI <ChevronRight size={16} />
        </a>
      </section>
    </div>
  )
}

export default PayComparison
