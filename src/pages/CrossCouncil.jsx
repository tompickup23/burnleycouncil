import { useEffect, useMemo, useState } from 'react'
import { Building, TrendingUp, Users, PoundSterling, Shield, BarChart3, AlertTriangle, Landmark, Wallet } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from 'recharts'
import { formatCurrency } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { COUNCIL_COLORS, TOOLTIP_STYLE } from '../utils/constants'
import './CrossCouncil.css'

// Service categories by tier — upper-tier services only shown for county/unitary
const DISTRICT_SERVICE_CATEGORIES = ['housing', 'cultural', 'environmental', 'planning', 'central', 'other']
const UPPER_TIER_SERVICE_CATEGORIES = ['education', 'adult_social_care', 'children_social_care', 'public_health', 'highways', 'cultural', 'environmental', 'planning', 'central', 'other']
const ALL_SERVICE_LABELS = {
  education: 'Education',
  adult_social_care: 'Adult Social Care',
  children_social_care: "Children's Social Care",
  public_health: 'Public Health',
  highways: 'Highways',
  housing: 'Housing',
  cultural: 'Cultural',
  environmental: 'Environmental',
  planning: 'Planning',
  central: 'Central',
  other: 'Other',
}

const TIER_LABELS = {
  district: 'District Councils',
  county: 'County Councils',
  unitary: 'Unitary Authorities',
}

const TIER_DESCRIPTIONS = {
  district: 'District councils provide housing, planning, waste collection, leisure and environmental services. Education, social care and highways are handled by the county council.',
  county: 'County councils provide education, social care, highways, fire services, libraries and public health.',
  unitary: 'Unitary authorities provide all council services — combining district and county responsibilities.',
}

function CrossCouncil() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || 'council'
  const councilTier = config.council_tier || 'district'

  const { data, loading, error } = useData('/data/cross_council.json')
  const comparison = data

  const allCouncils = comparison?.councils || []
  // For county/unitary tiers with very few peer councils, default to showing all
  const sameTierCouncils = allCouncils.filter(c => (c.council_tier || 'district') === councilTier)
  const hasEnoughPeers = sameTierCouncils.length >= 3
  const [showAllTiers, setShowAllTiers] = useState(!hasEnoughPeers)
  const councils = showAllTiers ? allCouncils : sameTierCouncils
  const otherTierCount = allCouncils.length - sameTierCouncils.length

  useEffect(() => {
    document.title = `Cross-Council Comparison | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  const current = useMemo(
    () => councils.find(c => c.council_name?.toLowerCase() === councilName.toLowerCase()) || councils[0],
    [councils, councilName]
  )

  // Spend per head data — use annualized spend for fair comparison across different year ranges
  const spendPerHead = useMemo(() => councils.map(c => ({
    name: c.council_name,
    spend: Math.round((c.annual_spend || c.total_spend || 0) / (c.population || 1)),
    years: c.num_years || 1,
    isCurrent: c.council_name === councilName,
  })).sort((a, b) => b.spend - a.spend), [councils, councilName])

  // Service expenditure comparison — tier-aware categories
  // When showing all tiers, use all categories; otherwise filter to relevant tier
  const serviceCategories = showAllTiers ? UPPER_TIER_SERVICE_CATEGORIES
    : councilTier === 'district' ? DISTRICT_SERVICE_CATEGORIES : UPPER_TIER_SERVICE_CATEGORIES
  const serviceData = useMemo(() => serviceCategories.map(cat => {
    const row = { category: ALL_SERVICE_LABELS[cat] || cat }
    councils.forEach(c => {
      row[c.council_id] = Math.round((c.service_expenditure?.[cat] || 0) / (c.population || 1))
    })
    return row
  }), [councils, serviceCategories])

  // Council Tax Band D comparison
  const councilTaxData = useMemo(() => councils
    .filter(c => c.budget_summary?.council_tax_band_d)
    .map(c => ({
      name: c.council_name,
      bandD: c.budget_summary.council_tax_band_d,
      bandDTotal: c.budget_summary.council_tax_band_d_total || 0,
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.bandD - a.bandD), [councils, councilName])

  // Reserves comparison
  const reservesData = useMemo(() => councils
    .filter(c => c.budget_summary?.reserves_total)
    .map(c => ({
      name: c.council_name,
      earmarked: Math.round((c.budget_summary.reserves_earmarked_closing || 0) / 1_000_000),
      unallocated: Math.round((c.budget_summary.reserves_unallocated_closing || 0) / 1_000_000),
      total: Math.round((c.budget_summary.reserves_total || 0) / 1_000_000),
      change: Math.round((c.budget_summary.reserves_change || 0) / 1_000_000),
      perHead: Math.round((c.budget_summary.reserves_total || 0) / (c.population || 1)),
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.perHead - a.perHead), [councils, councilName])

  // Net Revenue Expenditure comparison
  const nreData = useMemo(() => councils
    .filter(c => c.budget_summary?.net_revenue_expenditure)
    .map(c => ({
      name: c.council_name,
      nre: c.budget_summary.net_revenue_expenditure,
      nrePerHead: Math.round(c.budget_summary.net_revenue_expenditure / (c.population || 1)),
      ctReq: c.budget_summary.council_tax_requirement || 0,
      ctReqPerHead: Math.round((c.budget_summary.council_tax_requirement || 0) / (c.population || 1)),
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.nrePerHead - a.nrePerHead), [councils, councilName])

  // Transparency radar data
  const radarData = useMemo(() => [
    { metric: 'Dates', fullMark: 100 },
    { metric: 'Suppliers', fullMark: 100 },
    { metric: 'Departments', fullMark: 100 },
  ].map(item => {
    councils.forEach(c => {
      const t = c.transparency || {}
      if (item.metric === 'Dates') item[c.council_id] = t.has_dates || 0
      if (item.metric === 'Suppliers') item[c.council_id] = t.has_suppliers || 0
      if (item.metric === 'Departments') item[c.council_id] = t.has_departments || 0
    })
    return item
  }), [councils])

  // CEO pay comparison
  const payData = useMemo(() => councils
    .filter(c => c.pay?.ceo_midpoint)
    .map(c => ({
      name: c.council_name,
      salary: c.pay.ceo_midpoint,
      ratio: c.pay.ceo_to_median_ratio,
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.salary - a.salary), [councils, councilName])

  // Duplicate flagged value comparison — annualized for fair comparison
  const dupeData = useMemo(() => councils.map(c => {
    const years = c.num_years || 1
    return {
      name: c.council_name,
      value: Math.round((c.duplicate_value || 0) / years),
      count: Math.round((c.duplicate_count || 0) / years),
      rawValue: c.duplicate_value || 0,
      rawCount: c.duplicate_count || 0,
      years,
      isCurrent: c.council_name === councilName,
    }
  }).sort((a, b) => b.value - a.value), [councils, councilName])

  if (loading) return <LoadingState message="Loading comparison data..." />
  if (error) return (
    <div className="page-error">
      <h2>Unable to load data</h2>
      <p>Please try refreshing the page.</p>
    </div>
  )
  if (!councils.length) return <div className="cross-page"><p>No cross-council comparison data available.</p></div>

  const yearRange = councils.map(c => c.num_years || 1)
  const maxYears = Math.max(...yearRange)
  const minYears = Math.min(...yearRange)
  const lowDataCouncils = councils.filter(c => (c.total_records || 0) < 5000)

  return (
    <div className="cross-page animate-fade-in">
      <header className="cross-hero">
        <div className="hero-content">
          <h1>Cross-Council Comparison</h1>
          <p className="hero-subtitle">
            Side-by-side performance metrics for {councils.length} {TIER_LABELS[councilTier]?.toLowerCase() || 'councils'}.{' '}
            {councilName} is highlighted throughout.
          </p>
        </div>
      </header>

      {/* Tier explanation banner with toggle */}
      <div className="cross-tier-banner">
        <Building size={16} />
        <div>
          {showAllTiers ? (
            <>
              <strong>Comparing all {councils.length} Lancashire councils.</strong>{' '}
              Includes districts, county, and unitary authorities. Budget scales differ significantly across tiers.{' '}
              {hasEnoughPeers && (
                <button className="tier-toggle-btn" onClick={() => setShowAllTiers(false)}>
                  Show {TIER_LABELS[councilTier]?.toLowerCase() || 'same tier'} only
                </button>
              )}
            </>
          ) : (
            <>
              <strong>Comparing {sameTierCouncils.length} {TIER_LABELS[councilTier]?.toLowerCase() || 'councils'}.</strong>{' '}
              {TIER_DESCRIPTIONS[councilTier]}{' '}
              {otherTierCount > 0 && (
                <button className="tier-toggle-btn" onClick={() => setShowAllTiers(true)}>
                  Show all {allCouncils.length} councils
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Data Confidence Banner */}
      {(lowDataCouncils.length > 0 || maxYears - minYears >= 3) && (
        <div className="cross-data-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>Data comparability note:</strong>{' '}
            {lowDataCouncils.length > 0 && (
              <span>
                {lowDataCouncils.map(c => c.council_name).join(', ')} ha{lowDataCouncils.length === 1 ? 's' : 've'} limited
                data ({lowDataCouncils.map(c => `${(c.total_records || 0).toLocaleString()} records`).join(', ')}).{' '}
              </span>
            )}
            {maxYears - minYears >= 3 && (
              <span>
                Data periods range from {minYears} to {maxYears} years — all figures are annualized for fair comparison.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <section className="cross-overview">
        <h2><Building size={22} /> Council Overview</h2>
        <div className="overview-grid">
          {councils.map(c => (
            <div key={c.council_id} className={`overview-card ${c.council_name === councilName ? 'current' : ''}`}>
              <div className="overview-header" style={{ borderColor: COUNCIL_COLORS[c.council_id] }}>
                <h3>{c.council_name}</h3>
                {c.council_name === councilName && <span className="current-badge">You are here</span>}
              </div>
              <div className="overview-stats">
                <div className="ov-stat">
                  <span className="ov-value">{formatCurrency(c.annual_spend || c.total_spend, true)}</span>
                  <span className="ov-label">Annual Spend (avg)</span>
                </div>
                <div className="ov-stat">
                  <span className="ov-value">{(c.annual_records || c.total_records)?.toLocaleString()}</span>
                  <span className="ov-label">Transactions / Year</span>
                </div>
                <div className="ov-stat">
                  <span className="ov-value">{c.unique_suppliers?.toLocaleString()}</span>
                  <span className="ov-label">Unique Suppliers</span>
                </div>
                <div className="ov-stat">
                  <span className="ov-value">{c.num_years || '—'}</span>
                  <span className="ov-label">Years of Data</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Spend Per Head */}
      <section className="cross-section">
        <h2><PoundSterling size={22} /> Annual Spend Per Head of Population</h2>
        <p className="section-intro">
          Average annual external payments divided by population. Figures are annualized to allow fair comparison
          across councils with different data periods. Higher isn't necessarily worse — it depends on what services are provided.
        </p>
        <div className="chart-container" role="img" aria-label="Bar chart comparing spend per head across councils">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={spendPerHead} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <Tooltip
                formatter={(v) => [`£${v.toLocaleString()}`, 'Annual spend per head']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                {spendPerHead.map((entry, i) => (
                  <Cell key={i} fill={entry.isCurrent ? '#0a84ff' : '#48484a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Service Expenditure Per Head */}
      <section className="cross-section">
        <h2><BarChart3 size={22} /> Service Expenditure Per Head (£'000s)</h2>
        <p className="section-intro">
          GOV.UK revenue outturn data (2024-25) divided by population, showing how each council allocates spending across service categories.
        </p>
        <div className="chart-container" role="img" aria-label="Grouped bar chart comparing service expenditure per head across councils">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={serviceData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
              <XAxis dataKey="category" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 11 }} />
              <YAxis tickFormatter={v => `£${v}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <Tooltip
                formatter={(v, name) => {
                  const label = councils.find(c => c.council_id === name)?.council_name || name
                  return [`£${v.toLocaleString()}k per head`, label]
                }}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend formatter={(value) => councils.find(c => c.council_id === value)?.council_name || value} />
              {councils.map(c => (
                <Bar key={c.council_id} dataKey={c.council_id} fill={COUNCIL_COLORS[c.council_id]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Council Tax Band D Comparison */}
      {councilTaxData.length > 0 && (
        <section className="cross-section">
          <h2><Wallet size={22} /> Council Tax Band D {councilTier === 'county' ? '(County Precept)' : ''}</h2>
          <p className="section-intro">
            {councilTier === 'county'
              ? 'The county council precept element of Band D council tax (2025-26). This is added to district council and police/fire precepts to give the total bill.'
              : councilTier === 'unitary'
              ? 'Band D council tax set by the unitary authority (2025-26), excluding police and fire precepts.'
              : 'District council element of Band D council tax (2025-26). This is part of the total bill which also includes county, police and fire precepts.'}
          </p>
          <div className="chart-container" role="img" aria-label="Bar chart comparing council tax Band D rates">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={councilTaxData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <Tooltip
                  formatter={(v) => [`£${v.toLocaleString()}`, 'Band D']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="bandD" name="Band D" radius={[4, 4, 0, 0]}>
                  {councilTaxData.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? '#0a84ff' : '#48484a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Net Revenue Expenditure Per Head */}
      {nreData.length > 0 && (
        <section className="cross-section">
          <h2><Landmark size={22} /> Net Revenue Expenditure Per Head</h2>
          <p className="section-intro">
            NRE is the total cost of running the council after fees and grants but before council tax.
            This is the key comparator for council financial size — the amount that must be funded from
            council tax, government grants, and business rates.
          </p>
          <div className="chart-container" role="img" aria-label="Bar chart comparing net revenue expenditure per head">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={nreData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [`£${v.toLocaleString()}`, name === 'nrePerHead' ? 'NRE per head' : 'CT requirement per head']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="nrePerHead" name="NRE per head" radius={[4, 4, 0, 0]}>
                  {nreData.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? '#30d158' : '#48484a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Reserves Comparison */}
      {reservesData.length > 0 && (
        <section className="cross-section">
          <h2><TrendingUp size={22} /> Reserves Per Head (Closing Balance)</h2>
          <p className="section-intro">
            Reserves are a council's financial safety net — earmarked reserves are committed to specific projects
            while unallocated reserves provide a general buffer. Higher reserves per head indicate greater financial resilience.
          </p>
          <div className="chart-container" role="img" aria-label="Stacked bar chart comparing reserves per head">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={reservesData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <YAxis tickFormatter={v => `£${v}`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [`£${v.toLocaleString()}`, name === 'perHead' ? 'Total per head' : name === 'earmarked' ? 'Earmarked (£M)' : 'Unallocated (£M)']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="perHead" name="Total per head" radius={[4, 4, 0, 0]}>
                  {reservesData.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? '#ff9f0a' : '#48484a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="reserves-detail-grid">
            {reservesData.map(r => (
              <div key={r.name} className={`reserves-detail-card ${r.isCurrent ? 'current' : ''}`}>
                <h4>{r.name}</h4>
                <div className="reserves-figures">
                  <div><span className="fig-label">Earmarked</span><span className="fig-value">£{r.earmarked}M</span></div>
                  <div><span className="fig-label">Unallocated</span><span className="fig-value">£{r.unallocated}M</span></div>
                  <div><span className="fig-label">Total</span><span className="fig-value">£{r.total}M</span></div>
                  <div><span className="fig-label">Change</span><span className={`fig-value ${r.change >= 0 ? 'positive' : 'negative'}`}>{r.change >= 0 ? '+' : ''}£{r.change}M</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Transparency Scorecard */}
      <section className="cross-section">
        <h2><Shield size={22} /> Transparency Scorecard</h2>
        <p className="section-intro">
          Percentage of spending records that include key fields. 100% means every transaction has the field populated.
        </p>
        <div className="scorecard-grid">
          {councils.map(c => {
            const t = c.transparency || {}
            return (
              <div key={c.council_id} className={`scorecard-card ${c.council_name === councilName ? 'current' : ''}`}>
                <h3 style={{ color: COUNCIL_COLORS[c.council_id] }}>{c.council_name}</h3>
                <div className="score-bars">
                  <ScoreBar label="Dates" value={t.has_dates} />
                  <ScoreBar label="Suppliers" value={t.has_suppliers} />
                  <ScoreBar label="Departments" value={t.has_departments} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CEO Pay Comparison */}
      {payData.length > 0 && (
        <section className="cross-section">
          <h2><Users size={22} /> Chief Executive Pay</h2>
          <p className="section-intro">
            CEO salary midpoints and pay ratios from published Pay Policy Statements.
          </p>
          <div className="comparison-table-wrapper">
            <table className="cross-table" role="table" aria-label="Cross-council CEO pay comparison">
              <thead>
                <tr>
                  <th scope="col">Council</th>
                  <th scope="col">CEO Salary Midpoint</th>
                  <th scope="col">CEO:Median Ratio</th>
                  <th scope="col">Median Employee Pay</th>
                </tr>
              </thead>
              <tbody>
                {councils.filter(c => c.pay).map(c => (
                  <tr key={c.council_id} className={c.council_name === councilName ? 'highlight-row' : ''}>
                    <td className="council-name">{c.council_name}{c.council_name === councilName ? ' ★' : ''}</td>
                    <td>{formatCurrency(c.pay.ceo_midpoint)}</td>
                    <td>{c.pay.ceo_to_median_ratio ? `${c.pay.ceo_to_median_ratio}:1` : '—'}</td>
                    <td>{c.pay.median_employee_salary ? formatCurrency(c.pay.median_employee_salary) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Duplicate Payments Flagged */}
      <section className="cross-section">
        <h2><AlertTriangle size={22} /> Potential Duplicate Payments (Annualized)</h2>
        <p className="section-intro">
          Same-day payments to the same supplier for the same amount, annualized for fair comparison.
          These are flagged for investigation — not all are errors.
        </p>
        <div className="chart-container" role="img" aria-label="Bar chart comparing potential duplicate payment values across councils">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dupeData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color, #333)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <YAxis tickFormatter={v => `£${(v / 1_000_000).toFixed(1)}M`} tick={{ fill: 'var(--text-secondary, #999)', fontSize: 12 }} />
              <Tooltip
                formatter={(v) => [formatCurrency(v), 'Flagged value']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {dupeData.map((entry, i) => (
                  <Cell key={i} fill={entry.isCurrent ? '#ff453a' : '#48484a'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="dupe-stats">
          {dupeData.map(d => (
            <div key={d.name} className="dupe-stat">
              <span className="dupe-council" style={{ color: COUNCIL_COLORS[councils.find(c => c.council_name === d.name)?.council_id] }}>{d.name}</span>
              <span className="dupe-count">~{d.count.toLocaleString()} / year ({d.rawCount.toLocaleString()} total over {d.years}yr)</span>
              <span className="dupe-value">{formatCurrency(d.value)} / year</span>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology Note */}
      <section className="cross-section">
        <div className="methodology-note">
          <Shield size={18} />
          <div>
            <h4>Methodology &amp; Data Coverage</h4>
            <p>
              All data is sourced from publicly available council documents including transparency returns,
              GOV.UK revenue outturn data, and Pay Policy Statements. Spending figures cover external payments
              over £500. Where councils have different data periods, figures are <strong>annualized</strong> to
              enable fair comparison. Population figures from ONS mid-year estimates.
            </p>
            <div className="data-coverage">
              <h5>Data periods by council:</h5>
              <ul>
                {councils.map(c => (
                  <li key={c.council_id}>
                    <strong>{c.council_name}</strong>: {c.financial_years?.[0] || '—'} to {c.financial_years?.slice(-1)[0] || '—'} ({c.num_years || '?'} years)
                  </li>
                ))}
              </ul>
            </div>
            <p className="generated-date">Comparison generated: {comparison.generated}</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function ScoreBar({ label, value }) {
  const pct = Math.round(value || 0)
  let color = '#30d158'
  if (pct < 80) color = '#ff9f0a'
  if (pct < 50) color = '#ff453a'

  return (
    <div className="score-bar-row">
      <span className="score-label">{label}</span>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="score-pct" style={{ color }}>{pct}%</span>
    </div>
  )
}

export default CrossCouncil
