import { useEffect, useMemo } from 'react'
import { Users, TrendingUp, AlertTriangle, Building, ChevronRight, Info, Briefcase, Award, FileText, Hash } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { formatCurrency } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './PayComparison.css'

function PayComparison() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'

  const { data, loading, error } = useData('/data/pay_comparison.json')
  const payData = data

  useEffect(() => {
    document.title = `Executive Pay | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Unpack all data BEFORE early returns (React Rules of Hooks)
  const ceo = payData?.chief_executive || {}
  const history = payData?.pay_history || []
  const seniors = payData?.senior_officers || []
  const comparators = payData?.comparators || []
  const national = payData?.national_context || {}
  const tpa = payData?.tpa_town_hall_rich_list || {}
  const genderGap = payData?.gender_pay_gap || {}
  const headcount = payData?.employee_headcount || {}
  const allowances = payData?.councillor_allowances || {}
  const latestYear = history[history.length - 1] || {}

  // Chart data — CEO salary trend (filter to entries with salary data)
  const salaryTrendData = useMemo(() => history
    .filter(h => h.ceo_salary || h.ceo_total_remuneration || h.combined_ceo_remuneration)
    .map(h => ({
      year: h.year?.replace('20', "'").replace('/20', '/'),
      salary: h.ceo_salary,
      total: h.ceo_total_remuneration || h.combined_ceo_remuneration,
      median: h.median_employee_salary,
    })), [history])

  // Chart data — pay ratio trend (filter to entries with ratio data)
  const ratioTrendData = useMemo(() => history
    .filter(h => h.ceo_to_median_ratio)
    .map(h => ({
      year: h.year?.replace('20', "'").replace('/20', '/'),
      medianRatio: h.ceo_to_median_ratio,
      lowestRatio: h.ceo_to_lowest_ratio,
    })), [history])

  // Chart data — cross-council comparison
  const comparisonData = useMemo(() => comparators
    .sort((a, b) => (b.ceo_salary_midpoint || 0) - (a.ceo_salary_midpoint || 0))
    .map(c => ({
      name: c.council,
      salary: c.ceo_salary_midpoint,
      ratio: c.ceo_to_median_ratio,
      isCurrent: c.council === councilName,
    })), [comparators, councilName])

  // TPA Rich List trend data
  const tpaData = useMemo(() => Object.entries(tpa)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([year, v]) => ({
      year: year.replace('_', '/'),
      count: v.employees_over_100k,
    }))
    .sort((a, b) => a.year.localeCompare(b.year)), [tpa])

  // Early returns AFTER all hooks
  if (loading) return <LoadingState message="Loading pay data..." />
  if (error) return (
    <div className="page-error">
      <h2>Unable to load data</h2>
      <p>Please try refreshing the page.</p>
    </div>
  )
  if (!payData) return <div className="pay-page"><p>No pay comparison data available for this council.</p></div>

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
          <span className="stat-value">{ceo.current_salary_band || ceo.salary_type === 'spot' ? `£${(ceo.salary || ceo.current_midpoint || 0).toLocaleString()}` : `£${(ceo.current_midpoint || 0).toLocaleString()}`}</span>
          <span className="stat-label">{ceo.title || 'Chief Executive'} {ceo.salary_type === 'spot' ? 'Spot Salary' : 'Salary Band'}{ceo.name ? ` — ${ceo.name}` : ''}</span>
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
          <span className="stat-value">{headcount.headcount ? headcount.headcount.toLocaleString() : headcount.band || '—'}</span>
          <span className="stat-label">Council Employees{headcount.fte ? ` (${headcount.fte} FTE)` : ''}</span>
        </div>
      </section>

      {/* CEO Profile */}
      {ceo.name && (
        <section className="pay-section">
          <h2><Briefcase size={22} /> Chief Executive Profile</h2>
          <div className="ceo-profile-card">
            <div className="ceo-profile-header">
              <div>
                <h3>{ceo.name}</h3>
                <span className="ceo-title">{ceo.title || 'Chief Executive'}</span>
                {ceo.appointed && <span className="ceo-appointed">Appointed: {ceo.appointed}</span>}
              </div>
              <div className="ceo-salary-badge">
                {ceo.salary_type === 'spot'
                  ? <><span className="badge-value">£{(ceo.salary || 0).toLocaleString()}</span><span className="badge-label">Spot Salary</span></>
                  : ceo.current_salary_band
                    ? <><span className="badge-value">{ceo.current_salary_band}</span><span className="badge-label">Salary Band</span></>
                    : ceo.current_estimated_salary
                      ? <><span className="badge-value">~£{ceo.current_estimated_salary.toLocaleString()}</span><span className="badge-label">Estimated (from ratios)</span></>
                      : null
                }
              </div>
            </div>
            {ceo.background && <p className="ceo-background">{ceo.background}</p>}
            {ceo.previous_ceo && <p className="ceo-previous">Previous: {ceo.previous_ceo}</p>}
            {ceo.previous_ceos && ceo.previous_ceos.length > 0 && (
              <div className="ceo-previous-list">
                <span className="previous-label">Previous:</span>
                {ceo.previous_ceos.map((prev, i) => (
                  <span key={i} className="previous-ceo">{prev.name} ({prev.period}){prev.note ? ` — ${prev.note}` : ''}</span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

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
                    <Cell key={i} fill={entry.isCurrent ? '#0a84ff' : '#48484a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparison table */}
          <div className="comparison-table-wrapper">
            <table className="comparison-table" role="table" aria-label="Executive pay comparison">
              <thead>
                <tr>
                  <th scope="col">Council</th>
                  <th scope="col">Type</th>
                  <th scope="col">Population</th>
                  <th scope="col">CEO Salary</th>
                  <th scope="col">CEO:Median</th>
                  <th scope="col">Net Revenue Budget</th>
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

      {/* TPA Town Hall Rich List */}
      {tpaData.length > 0 && (
        <section className="pay-section">
          <h2><Award size={22} /> TaxPayers' Alliance Town Hall Rich List</h2>
          <p className="section-intro">
            Employees earning over £100,000 total remuneration. Nationally, {national.total_council_employees_over_100k_nationally ? national.total_council_employees_over_100k_nationally.toLocaleString() : '3,906'} council employees earned over £100K in 2023/24{national.national_100k_increase_pct ? ` (up ${national.national_100k_increase_pct}% on the previous year)` : ''}.
          </p>
          <div className="tpa-grid">
            {tpaData.map((d, i) => (
              <div key={i} className={`tpa-card${d.count === 0 ? ' tpa-zero' : ''}`}>
                <span className="tpa-year">{d.year}</span>
                <span className="tpa-count">{d.count}</span>
                <span className="tpa-label">employee{d.count !== 1 ? 's' : ''} over £100K</span>
              </div>
            ))}
          </div>
          {Object.values(tpa).some(v => v?.note) && (
            <div className="tpa-notes">
              {Object.entries(tpa).map(([year, v]) => v?.note ? (
                <p key={year} className="tpa-note-item">{year.replace('_', '/')}: {v.note}</p>
              ) : null)}
            </div>
          )}
        </section>
      )}

      {/* Councillor Allowances */}
      {(allowances.basic_allowance || allowances.total_paid_2024_25) && (
        <section className="pay-section">
          <h2><FileText size={22} /> Councillor Allowances</h2>
          <p className="section-intro">
            {allowances.total_councillors || '—'} councillors at {councilName} Council.{allowances.scheme_frozen_since ? ` Allowances frozen since ${allowances.scheme_frozen_since}.` : ''}
          </p>
          <div className="allowances-grid">
            {allowances.basic_allowance && (
              <div className="allowance-card">
                <span className="allowance-value">£{allowances.basic_allowance.toLocaleString()}</span>
                <span className="allowance-label">Basic Allowance (per councillor/year)</span>
              </div>
            )}
            {allowances.key_sras?.leader && (
              <div className="allowance-card">
                <span className="allowance-value">£{allowances.key_sras.leader.toLocaleString()}</span>
                <span className="allowance-label">Leader SRA{allowances.lancashire_ranking ? ` — ${allowances.lancashire_ranking}` : ''}</span>
              </div>
            )}
            {allowances.leader_total_with_basic && (
              <div className="allowance-card">
                <span className="allowance-value">£{allowances.leader_total_with_basic.toLocaleString()}</span>
                <span className="allowance-label">Leader Total (Basic + SRA)</span>
              </div>
            )}
            {allowances.total_paid_2024_25 && (
              <div className="allowance-card">
                <span className="allowance-value">£{allowances.total_paid_2024_25.toLocaleString()}</span>
                <span className="allowance-label">Total Allowances Paid 2024/25</span>
              </div>
            )}
            {allowances.estimated_annual_total_cost && (
              <div className="allowance-card">
                <span className="allowance-value">{allowances.estimated_annual_total_cost}</span>
                <span className="allowance-label">Estimated Annual Cost</span>
              </div>
            )}
          </div>
          {allowances.irp_note && (
            <p className="allowances-note">{allowances.irp_note}</p>
          )}
        </section>
      )}

      {/* Gender Pay Gap */}
      {genderGap && (genderGap['2024_25'] || genderGap['2023_24'] || genderGap.note) && (
        <section className="pay-section">
          <h2><Hash size={22} /> Gender Pay Gap</h2>
          {genderGap.reports_required === false ? (
            <div className="gap-exempt-note">
              <Info size={16} />
              <p>{genderGap.reason || 'Not required to report.'}{genderGap.note ? ` ${genderGap.note}` : ''}</p>
            </div>
          ) : (
            <>
              <p className="section-intro">{genderGap.note || `Gender pay gap data for ${councilName} Council from GOV.UK.`}</p>
              {['2024_25', '2023_24'].map(year => {
                const d = genderGap[year]
                if (!d) return null
                return (
                  <div key={year} className="gap-year-card">
                    <h4>{year.replace('_', '/')} (snapshot: {d.snapshot_date})</h4>
                    <div className="gap-stats">
                      <div className="gap-stat">
                        <span className={`gap-value ${d.median_hourly_gap_pct < 0 ? 'gap-reverse' : d.median_hourly_gap_pct === 0 ? 'gap-equal' : ''}`}>
                          {d.median_hourly_gap_pct === 0 ? '0.0%' : `${Math.abs(d.median_hourly_gap_pct)}%`}
                        </span>
                        <span className="gap-label">Median gap{d.gap_direction ? ` — ${d.gap_direction}` : ''}</span>
                      </div>
                      <div className="gap-stat">
                        <span className={`gap-value ${d.mean_hourly_gap_pct < 0 ? 'gap-reverse' : ''}`}>
                          {Math.abs(d.mean_hourly_gap_pct)}%
                        </span>
                        <span className="gap-label">Mean gap</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
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
            {payData.data_quality && <p className="source-text">Data quality: {payData.data_quality}</p>}
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
