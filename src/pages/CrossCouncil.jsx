import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building, TrendingUp, Users, PoundSterling, Shield, BarChart3, AlertTriangle, Landmark, Wallet, Building2 } from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from 'recharts'
import { formatCurrency, slugify } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { COUNCIL_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, shortenCouncilName } from '../utils/constants'
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
  const [showAllTiers, setShowAllTiers] = useState(true) // true until data loads
  const [tierInitialized, setTierInitialized] = useState(false)
  const councils = showAllTiers ? allCouncils : sameTierCouncils
  const otherTierCount = allCouncils.length - sameTierCouncils.length

  // Set correct default once data loads
  useEffect(() => {
    if (!tierInitialized && allCouncils.length > 0) {
      setShowAllTiers(!hasEnoughPeers)
      setTierInitialized(true)
    }
  }, [allCouncils.length, hasEnoughPeers, tierInitialized])

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
    name: shortenCouncilName(c.council_name),
    spend: Math.round((c.annual_spend || c.total_spend || 0) / (c.population || 1)),
    years: c.num_years || 1,
    isCurrent: c.council_name === councilName,
  })).sort((a, b) => b.spend - a.spend), [councils, councilName])

  // Service expenditure comparison — tier-aware categories
  // When showing all tiers, use all categories; otherwise filter to relevant tier
  const serviceCategories = showAllTiers ? UPPER_TIER_SERVICE_CATEGORIES
    : councilTier === 'district' ? DISTRICT_SERVICE_CATEGORIES : UPPER_TIER_SERVICE_CATEGORIES
  // Service expenditure values in cross_council.json are already in £'000s from the ETL.
  // We divide by population to get £'000s per head, then multiply by 1000 to show £ per head.
  const serviceData = useMemo(() => {
    const rows = serviceCategories.map(cat => {
      const row = { category: ALL_SERVICE_LABELS[cat] || cat }
      councils.forEach(c => {
        const valInThousands = c.service_expenditure?.[cat] || 0
        const pop = c.population || 1
        row[c.council_id] = Math.round((valInThousands * 1000) / pop)
      })
      return row
    })
    // Filter out categories where ALL councils have zero (e.g. education for district-only view)
    return rows.filter(row => councils.some(c => (row[c.council_id] || 0) !== 0))
  }, [councils, serviceCategories])

  // Council Tax Band D comparison
  const councilTaxData = useMemo(() => councils
    .filter(c => c.budget_summary?.council_tax_band_d)
    .map(c => ({
      name: shortenCouncilName(c.council_name),
      bandD: c.budget_summary.council_tax_band_d,
      bandDTotal: c.budget_summary.council_tax_band_d_total || 0,
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.bandD - a.bandD), [councils, councilName])

  // Reserves comparison
  const reservesData = useMemo(() => councils
    .filter(c => c.budget_summary?.reserves_total)
    .map(c => ({
      name: shortenCouncilName(c.council_name),
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
      name: shortenCouncilName(c.council_name),
      nre: c.budget_summary.net_revenue_expenditure,
      nrePerHead: Math.round(c.budget_summary.net_revenue_expenditure / (c.population || 1)),
      ctReq: c.budget_summary.council_tax_requirement || 0,
      ctReqPerHead: Math.round((c.budget_summary.council_tax_requirement || 0) / (c.population || 1)),
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.nrePerHead - a.nrePerHead), [councils, councilName])

  // Council tax collection rate comparison (billing authorities only — excludes LCC)
  const collectionRateData = useMemo(() => councils
    .filter(c => c.collection_rate != null)
    .map(c => ({
      name: shortenCouncilName(c.council_name),
      rate: c.collection_rate,
      avg5yr: c.collection_rate_5yr_avg || 0,
      trend: c.collection_rate_trend || 0,
      uncollected: Math.round((c.uncollected_ct_gbp || 0) / 1_000_000 * 10) / 10,
      performance: c.collection_performance || 'unknown',
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.rate - a.rate), [councils, councilName])

  // Dependency ratio comparison (from Census 2021 demographics)
  const dependencyData = useMemo(() => councils
    .filter(c => c.dependency_ratio > 0)
    .map(c => ({
      name: shortenCouncilName(c.council_name),
      ratio: c.dependency_ratio,
      youth: c.youth_ratio || 0,
      elderly: c.elderly_ratio || 0,
      working: c.working_age_pct || 0,
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.ratio - a.ratio), [councils, councilName])

  // Per-service HHI heatmap data
  const hhiHeatmapData = useMemo(() => {
    // Collect all service categories across all councils
    const allCategories = new Set()
    councils.forEach(c => {
      if (c.service_hhi) Object.keys(c.service_hhi).forEach(cat => allCategories.add(cat))
    })
    const categories = [...allCategories].sort()
    // Build council rows with HHI per category
    return {
      categories,
      councils: councils
        .filter(c => c.service_hhi && Object.keys(c.service_hhi).length > 0)
        .map(c => ({
          name: shortenCouncilName(c.council_name),
          id: c.council_id,
          overallHhi: c.overall_hhi || 0,
          isCurrent: c.council_name === councilName,
          services: categories.reduce((acc, cat) => {
            acc[cat] = c.service_hhi[cat]?.hhi ?? null
            return acc
          }, {}),
        }))
        .sort((a, b) => b.overallHhi - a.overallHhi),
    }
  }, [councils, councilName])

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
      name: shortenCouncilName(c.council_name),
      salary: c.pay.ceo_midpoint,
      ratio: c.pay.ceo_to_median_ratio,
      isCurrent: c.council_name === councilName,
    }))
    .sort((a, b) => b.salary - a.salary), [councils, councilName])

  // Duplicate flagged value comparison — annualized for fair comparison
  const dupeData = useMemo(() => councils.map(c => {
    const years = c.num_years || 1
    return {
      name: shortenCouncilName(c.council_name),
      value: Math.round((c.duplicate_value || 0) / years),
      count: Math.round((c.duplicate_count || 0) / years),
      rawValue: c.duplicate_value || 0,
      rawCount: c.duplicate_count || 0,
      years,
      isCurrent: c.council_name === councilName,
    }
  }).sort((a, b) => b.value - a.value), [councils, councilName])

  // Shared suppliers across councils
  const sharedSuppliers = useMemo(() => {
    const suppliers = comparison?.supplier_index?.shared_suppliers || []
    return suppliers
      .filter(s => s.supplier && s.supplier !== 'UNKNOWN' && s.councils_count >= 2)
      .sort((a, b) => b.total_spend - a.total_spend)
      .slice(0, 15)
  }, [comparison])

  // Councils with missing service expenditure data (silently shows 0)
  // NOTE: All hooks MUST be before early returns to satisfy Rules of Hooks
  const missingServiceData = useMemo(() => {
    return councils.filter(c => {
      if (!c.service_expenditure) return true
      const cats = councilTier === 'district' ? DISTRICT_SERVICE_CATEGORIES : UPPER_TIER_SERVICE_CATEGORIES
      const total = cats.reduce((sum, cat) => sum + (c.service_expenditure[cat] || 0), 0)
      return total === 0
    })
  }, [councils, councilTier])

  // Councils missing budget summary
  const missingBudgetData = useMemo(() => {
    return councils.filter(c => !c.budget_summary?.net_revenue_expenditure)
  }, [councils])

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

      {/* Data Quality Warnings */}
      {(missingServiceData.length > 0 || missingBudgetData.length > 0) && (
        <div className="cross-data-banner cross-quality-warning">
          <AlertTriangle size={16} />
          <div>
            <strong>Data quality:</strong>{' '}
            {missingServiceData.length > 0 && (
              <span>
                {missingServiceData.map(c => c.council_name).join(', ')} {missingServiceData.length === 1 ? 'has' : 'have'} incomplete
                service expenditure data — figures shown as £0 in breakdowns.{' '}
              </span>
            )}
            {missingBudgetData.length > 0 && (
              <span>
                {missingBudgetData.map(c => c.council_name).join(', ')} {missingBudgetData.length === 1 ? 'is' : 'are'} missing
                GOV.UK budget summary data.
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
                <h3>{shortenCouncilName(c.council_name)}</h3>
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
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
              <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={AXIS_TICK_STYLE} />
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
      {serviceData.length > 0 && (
      <section className="cross-section">
        <h2><BarChart3 size={22} /> Service Expenditure Per Head</h2>
        <p className="section-intro">
          GOV.UK revenue outturn data (2024-25) divided by population, showing how each council allocates spending per resident across service categories.
          {showAllTiers && ' District councils show zero for upper-tier services (education, social care) as these are provided by the county council.'}
        </p>
        <div className="chart-container" role="img" aria-label="Grouped bar chart comparing service expenditure per head across councils">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={serviceData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="category" tick={AXIS_TICK_STYLE} />
              <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={AXIS_TICK_STYLE} />
              <Tooltip
                formatter={(v, name) => {
                  const label = councils.find(c => c.council_id === name)?.council_name || name
                  return [`£${v.toLocaleString()} per head`, label]
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
      )}


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
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={AXIS_TICK_STYLE} />
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

      {/* Council Tax Collection Rate */}
      {collectionRateData.length > 0 && (
        <section className="cross-section">
          <h2><TrendingUp size={22} /> Council Tax Collection Rate</h2>
          <p className="section-intro">
            In-year council tax collection rate — the percentage collected within the financial year it's due.
            Only billing authorities (districts and unitaries) collect council tax; Lancashire CC is excluded.
            Rates below 95% indicate significant collection challenges.
          </p>
          <div className="chart-container" role="img" aria-label="Bar chart comparing council tax collection rates">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectionRateData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                <YAxis
                  domain={[Math.floor(Math.min(...collectionRateData.map(d => d.rate)) - 1), 100]}
                  tickFormatter={v => `${v}%`}
                  tick={AXIS_TICK_STYLE}
                />
                <Tooltip
                  formatter={(v, name) => {
                    if (name === 'rate') return [`${v.toFixed(1)}%`, 'Collection rate']
                    return [v, name]
                  }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => {
                    const entry = collectionRateData.find(d => d.name === label)
                    return entry ? `${label} — 5yr avg: ${entry.avg5yr.toFixed(1)}%, uncollected: £${entry.uncollected}M` : label
                  }}
                />
                <Bar dataKey="rate" name="rate" radius={[4, 4, 0, 0]}>
                  {collectionRateData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isCurrent ? '#0a84ff'
                        : entry.rate >= 97 ? '#30d158'
                        : entry.rate >= 95 ? '#48484a'
                        : entry.rate >= 93 ? '#ff9f0a'
                        : '#ff453a'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="cross-source" style={{ marginTop: 'var(--space-sm)' }}>
            Source: GOV.UK QRC4 council tax collection statistics (2024-25). National district average ~96%.
            {current?.collection_rate != null && (
              <> {councilName}: {current.collection_rate.toFixed(1)}% ({current.collection_performance === 'excellent' ? '✓ Excellent'
                : current.collection_performance === 'good' ? '✓ Good'
                : current.collection_performance === 'below_average' ? '⚠ Below average'
                : '✗ Poor'
              }).</>
            )}
          </p>
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
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                <YAxis tickFormatter={v => `£${v.toLocaleString()}`} tick={AXIS_TICK_STYLE} />
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
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                <YAxis tickFormatter={v => `£${v}`} tick={AXIS_TICK_STYLE} />
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

      {/* Dependency Ratio */}
      {dependencyData.length > 0 && (
        <section className="cross-section">
          <h2><Users size={22} /> Dependency Ratio (Census 2021)</h2>
          <p className="section-intro">
            The dependency ratio measures dependents (under 16 + over 65) per 100 working-age residents (16-64).
            Higher ratios mean more demand for services like social care and education relative to the tax base.
            Councils with high elderly ratios face rising adult social care costs; high youth ratios drive education spending.
          </p>
          <div className="chart-container" role="img" aria-label="Bar chart comparing dependency ratios">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dependencyData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                <YAxis
                  domain={[0, Math.ceil(Math.max(...dependencyData.map(d => d.ratio)) / 10) * 10]}
                  tickFormatter={v => `${v}%`}
                  tick={AXIS_TICK_STYLE}
                />
                <Tooltip
                  formatter={(v) => [`${v.toFixed(1)}%`, 'Dependency ratio']}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label) => {
                    const entry = dependencyData.find(d => d.name === label)
                    return entry ? `${label} — Youth: ${entry.youth.toFixed(1)}%, Elderly: ${entry.elderly.toFixed(1)}%` : label
                  }}
                />
                <Bar dataKey="ratio" name="Dependency ratio" radius={[4, 4, 0, 0]}>
                  {dependencyData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isCurrent ? '#0a84ff'
                        : entry.ratio >= 70 ? '#ff453a'
                        : entry.ratio >= 65 ? '#ff9f0a'
                        : '#48484a'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="cross-source" style={{ marginTop: 'var(--space-sm)' }}>
            Source: Census 2021 (ONS Nomis). England average ~57%.
            {current?.dependency_ratio > 0 && (
              <> {councilName}: {current.dependency_ratio.toFixed(1)}% ({current.elderly_ratio?.toFixed(1)}% elderly, {current.youth_ratio?.toFixed(1)}% youth).</>
            )}
          </p>
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
                <h3 style={{ color: COUNCIL_COLORS[c.council_id] }}>{shortenCouncilName(c.council_name)}</h3>
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

      {/* Per-Service Supplier Concentration (HHI) */}
      {hhiHeatmapData.councils.length > 0 && hhiHeatmapData.categories.length > 0 && (
        <section className="cross-section">
          <h2><BarChart3 size={22} /> Supplier Concentration by Service</h2>
          <p className="section-intro">
            Herfindahl-Hirschman Index (HHI) per budget category. Measures how concentrated spending is among suppliers.
            <strong> &lt;1,500</strong> = competitive, <strong>1,500-2,500</strong> = moderate, <strong>&gt;2,500</strong> = highly concentrated.
          </p>
          <div className="hhi-heatmap-wrapper">
            <table className="hhi-heatmap" role="table" aria-label="Per-service supplier concentration HHI">
              <thead>
                <tr>
                  <th scope="col" className="hhi-council-col">Council</th>
                  <th scope="col" className="hhi-overall-col">Overall</th>
                  {hhiHeatmapData.categories.map(cat => (
                    <th key={cat} scope="col" className="hhi-service-col" title={cat}>
                      {cat.replace(/ services?/gi, '').replace(/ \(GFRA only\)/i, '').replace(/and /g, '& ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hhiHeatmapData.councils.map(c => (
                  <tr key={c.id} className={c.isCurrent ? 'highlight-row' : ''}>
                    <td className="council-name">{c.name}{c.isCurrent ? ' \u2605' : ''}</td>
                    <td className={`hhi-cell ${c.overallHhi > 2500 ? 'hhi-high' : c.overallHhi > 1500 ? 'hhi-moderate' : 'hhi-low'}`}>
                      {c.overallHhi > 0 ? Math.round(c.overallHhi).toLocaleString() : '—'}
                    </td>
                    {hhiHeatmapData.categories.map(cat => {
                      const val = c.services[cat]
                      const cls = val == null ? 'hhi-na' : val > 2500 ? 'hhi-high' : val > 1500 ? 'hhi-moderate' : 'hhi-low'
                      return (
                        <td key={cat} className={`hhi-cell ${cls}`} title={val != null ? `${cat}: HHI ${val.toLocaleString()}` : `${cat}: No data`}>
                          {val != null ? (val > 9999 ? `${(val / 1000).toFixed(0)}K` : val.toLocaleString()) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="source-note">
            HHI calculated from AI DOGE spending data mapped to GOV.UK SeRCOP budget categories via budget_mapping.json.
            Empty cells indicate no spending data mapped to that category.
          </p>
        </section>
      )}

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
                    <td className="council-name">{shortenCouncilName(c.council_name)}{c.council_name === councilName ? ' ★' : ''}</td>
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
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
              <YAxis tickFormatter={v => `£${(v / 1_000_000).toFixed(1)}M`} tick={AXIS_TICK_STYLE} />
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

      {/* Shared Suppliers Across Councils */}
      {sharedSuppliers.length > 0 && (
        <section className="cross-section">
          <h2><Building2 size={22} /> Shared Suppliers Across Councils</h2>
          <p className="section-intro">
            Suppliers operating across multiple Lancashire councils. Cross-council suppliers may benefit from
            economies of scale — or may indicate concentration risk.
          </p>
          <div className="shared-suppliers-table-wrapper">
            <table className="shared-suppliers-table" role="table" aria-label="Shared suppliers across councils">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Councils</th>
                  <th scope="col">Total Spend</th>
                  <th scope="col">Top Councils</th>
                </tr>
              </thead>
              <tbody>
                {sharedSuppliers.map((s, i) => (
                  <tr key={i}>
                    <td className="shared-supplier-name-cell">
                      <Link to={`/supplier/${slugify(s.supplier)}`} className="shared-supplier-link">
                        {s.supplier}
                      </Link>
                    </td>
                    <td className="shared-supplier-count">{s.councils_count}</td>
                    <td className="shared-supplier-spend">{formatCurrency(s.total_spend, true)}</td>
                    <td className="shared-supplier-councils">
                      {(s.councils || []).slice(0, 3).map((c, j) => (
                        <span key={j} className="shared-council-tag" style={{ color: COUNCIL_COLORS[c.council_id] || '#8e8e93' }}>
                          {c.council_name} ({formatCurrency(c.spend, true)})
                        </span>
                      ))}
                      {(s.councils || []).length > 3 && (
                        <span className="shared-council-more">+{s.councils.length - 3} more</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
            {comparison.generated && <p className="generated-date">Comparison generated: {comparison.generated}</p>}
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
