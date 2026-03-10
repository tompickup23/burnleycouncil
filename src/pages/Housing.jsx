import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../utils/constants'
import { Building2, MapPin, AlertTriangle, Users, ShieldCheck, Home, TrendingUp, FileText } from 'lucide-react'
import CollapsibleSection from '../components/CollapsibleSection'
import SparkLine from '../components/ui/SparkLine'
import GaugeChart from '../components/ui/GaugeChart'
import ChartCard from '../components/ui/ChartCard'
import './Housing.css'

const ChoroplethMap = lazy(() => import('../components/ChoroplethMap'))

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : '—'
const pct = (n) => typeof n === 'number' ? `${n}%` : '—'

function Housing() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data: housing, loading, error } = useData('/data/housing.json')
  const { data: hmoData } = useData('/data/hmo.json')
  const { data: wardBoundaries } = useData(
    config.data_sources?.ward_boundaries ? '/data/ward_boundaries.json' : null
  )
  const [selectedWard, setSelectedWard] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [mapMetric, setMapMetric] = useState('private_rent')

  useEffect(() => {
    document.title = `Housing | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  const summary = housing?.summary || {}
  const census = housing?.census || {}
  const councilTotals = census.council_totals || {}
  const wards = census.wards || {}
  const policy = housing?.policy || {}

  // Ward list sorted by name
  const wardList = useMemo(() =>
    Object.entries(wards)
      .map(([code, w]) => ({ code, name: w.name, ...w }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [wards]
  )

  // Tenure pie chart data
  const tenureChart = useMemo(() => {
    if (!summary.total_households) return []
    return [
      { name: 'Owner-occupied', value: summary.owned || 0, pct: summary.owned_pct },
      { name: 'Social rent', value: summary.social_rented || 0, pct: summary.social_rented_pct },
      { name: 'Private rent', value: summary.private_rented || 0, pct: summary.private_rented_pct },
      { name: 'Rent free', value: summary.rent_free || 0, pct: summary.rent_free_pct },
    ].filter(d => d.value > 0)
  }, [summary])

  // Accommodation type bar chart
  const accommodationChart = useMemo(() => {
    const acc = councilTotals.accommodation_type || {}
    return Object.entries(acc)
      .filter(([k]) => !k.startsWith('Total'))
      .map(([name, count]) => ({
        name: name.length > 25 ? name.slice(0, 22) + '...' : name,
        fullName: name,
        count,
      }))
      .sort((a, b) => b.count - a.count)
  }, [councilTotals])

  // Bedrooms bar chart
  const bedroomsChart = useMemo(() => {
    const beds = councilTotals.bedrooms || {}
    return Object.entries(beds)
      .filter(([k]) => !k.startsWith('Total'))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const numA = parseInt(a.name) || 99
        const numB = parseInt(b.name) || 99
        return numA - numB
      })
  }, [councilTotals])

  // Ward comparison data
  const wardComparison = useMemo(() => {
    return wardList.map(w => {
      const ten = w.tenure || {}
      const oc = w.overcrowding || {}
      const tenTotal = Object.entries(ten).find(([k]) => k.startsWith('Total'))?.[1] || 0
      const owned = ten['Owned'] || 0
      const socialRent = Object.entries(ten).find(([k]) => k.toLowerCase().includes('social rented') && !k.includes(':'))?.[1] || 0
      const privateRent = Object.entries(ten).find(([k]) => k.toLowerCase().includes('private rented') && !k.includes(':'))?.[1] || 0
      const ocTotal = Object.entries(oc).find(([k]) => k.startsWith('Total'))?.[1] || 0
      const overcrowded = Object.entries(oc)
        .filter(([k]) => k.includes(': -1') || k.includes(': -2'))
        .reduce((sum, [, v]) => sum + v, 0)
      return {
        name: w.name,
        code: w.code,
        households: tenTotal,
        owned_pct: tenTotal ? Math.round(owned / tenTotal * 1000) / 10 : 0,
        social_pct: tenTotal ? Math.round(socialRent / tenTotal * 1000) / 10 : 0,
        private_pct: tenTotal ? Math.round(privateRent / tenTotal * 1000) / 10 : 0,
        overcrowding_pct: ocTotal ? Math.round(overcrowded / ocTotal * 1000) / 10 : 0,
      }
    })
  }, [wardList])

  // Map values for ChoroplethMap
  const mapValues = useMemo(() => {
    const values = {}
    wardComparison.forEach(w => {
      if (mapMetric === 'private_rent') values[w.name] = w.private_pct
      else if (mapMetric === 'overcrowding') values[w.name] = w.overcrowding_pct
      else if (mapMetric === 'social_rent') values[w.name] = w.social_pct
      else values[w.name] = w.owned_pct
    })
    return values
  }, [wardComparison, mapMetric])

  // HMO summary
  const hmoSummary = useMemo(() => {
    if (!hmoData) return null
    return {
      licensed: hmoData.summary?.total_licensed || 0,
      planning: hmoData.summary?.total_planning_apps || 0,
      bedSpaces: hmoData.summary?.total_bed_spaces || 0,
    }
  }, [hmoData])

  // Selected ward detail
  const selectedWardData = useMemo(() => {
    if (!selectedWard) return null
    const entry = wardList.find(w => w.name === selectedWard)
    if (!entry) return null
    const comp = wardComparison.find(w => w.name === selectedWard)
    return { ...entry, ...comp }
  }, [selectedWard, wardList, wardComparison])

  if (loading) return <LoadingState />
  if (error) return <div className="error-state">Error loading housing data: {error.message}</div>
  if (!housing || !summary.total_households) return <div className="empty-state">No housing data available for {councilName}.</div>

  const mapLegendTitle = mapMetric === 'private_rent' ? 'Private Rent %'
    : mapMetric === 'overcrowding' ? 'Overcrowding %'
    : mapMetric === 'social_rent' ? 'Social Rent %'
    : 'Owner-Occupied %'

  return (
    <div className="housing-page">
      {/* Hero */}
      <div className="housing-hero">
        <div className="hero-content">
          <h1><Building2 size={28} /> Housing</h1>
          <p className="hero-subtitle">
            Ward-level housing analysis for {councilName}. Census 2021 tenure, overcrowding,
            accommodation type data across {wardList.length} wards covering {fmt(summary.total_households)} households.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="housing-summary-grid">
        <div className="housing-card highlight">
          <div className="card-icon"><Home size={20} /></div>
          <div className="card-value">{fmt(summary.total_households)}</div>
          <div className="card-label">Total Households</div>
        </div>
        <div className="housing-card">
          <div className="card-icon"><Home size={20} /></div>
          <div className="card-value">{pct(summary.owned_pct)}</div>
          <div className="card-label">Owner-Occupied</div>
        </div>
        <div className="housing-card">
          <div className="card-icon"><Building2 size={20} /></div>
          <div className="card-value">{pct(summary.social_rented_pct)}</div>
          <div className="card-label">Social Rented</div>
        </div>
        <div className="housing-card">
          <div className="card-icon"><Users size={20} /></div>
          <div className="card-value">{pct(summary.private_rented_pct)}</div>
          <div className="card-label">Private Rented</div>
        </div>
        <div className="housing-card">
          <div className="card-icon"><AlertTriangle size={20} /></div>
          <div className="card-value">{pct(summary.overcrowding_pct)}</div>
          <div className="card-label">Overcrowded</div>
        </div>
        <div className="housing-card">
          <div className="card-icon"><TrendingUp size={20} /></div>
          <div className="card-value">{pct(summary.terraced_pct)}</div>
          <div className="card-label">Terraced Houses</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="housing-tabs" role="tablist">
        {['overview', 'wards', 'hmo'].map(tab => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab === 'overview' ? 'Overview' : tab === 'wards' ? 'Ward Analysis' : 'HMO & Licensing'}
          </button>
        ))}
      </div>

      {/* === OVERVIEW TAB === */}
      {activeTab === 'overview' && (
        <div className="tab-content" role="tabpanel">
          <div className="chart-grid">
            {/* Tenure Pie */}
            <ChartCard title="Housing Tenure" description="Census 2021 household tenure breakdown">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={tenureChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, pct: p }) => `${name} ${p}%`}
                    {...CHART_ANIMATION}
                  >
                    {tenureChart.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Households']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Accommodation Type Bar */}
            <ChartCard title="Accommodation Type" description="Dwelling types across the borough">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={accommodationChart} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_STYLE} />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }} width={120} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Dwellings']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                  />
                  <Bar dataKey="count" fill={CHART_COLORS[0]} {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Bedrooms Bar */}
            <ChartCard title="Number of Bedrooms" description="Bedroom distribution across households">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={bedroomsChart}>
                  <CartesianGrid stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [fmt(value), 'Households']}
                  />
                  <Bar dataKey="count" fill={CHART_COLORS[1]} {...CHART_ANIMATION} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Overcrowding Gauge */}
            <ChartCard title="Overcrowding Rate" description="Households with occupancy rating -1 or worse">
              <div className="gauge-container">
                <GaugeChart
                  value={summary.overcrowding_pct || 0}
                  max={15}
                  label="Overcrowded"
                  suffix="%"
                  thresholds={[3, 6, 10]}
                  colors={['#12B6CF', '#ffd60a', '#ff9500', '#ff453a']}
                />
                <p className="gauge-note">
                  {fmt(summary.overcrowded)} households need more bedrooms
                  (national average ~4.8%)
                </p>
              </div>
            </ChartCard>
          </div>

          {/* Policy Section */}
          <CollapsibleSection
            title="Housing Policy"
            subtitle="Article 4 directions and selective licensing"
            defaultOpen={true}
            icon={<ShieldCheck size={20} />}
          >
            <div className="policy-grid">
              <div className={`policy-card ${policy.article_4?.active ? 'active' : 'inactive'}`}>
                <h4>Article 4 Direction (HMO)</h4>
                <div className={`policy-status ${policy.article_4?.active ? 'yes' : 'no'}`}>
                  {policy.article_4?.active ? 'Active' : 'Not in place'}
                </div>
                {policy.article_4?.active && (
                  <>
                    {policy.article_4.date && <p className="policy-detail">Since: {policy.article_4.date}</p>}
                    {policy.article_4.scope && <p className="policy-detail">Scope: {policy.article_4.scope}</p>}
                    {policy.article_4.wards?.length > 0 && (
                      <p className="policy-detail">
                        Wards: {policy.article_4.wards.join(', ')}
                      </p>
                    )}
                  </>
                )}
                <p className="policy-explainer">
                  Requires planning permission for converting houses to HMOs (C3→C4 change of use).
                </p>
              </div>

              <div className={`policy-card ${policy.selective_licensing?.active ? 'active' : 'inactive'}`}>
                <h4>Selective Licensing</h4>
                <div className={`policy-status ${policy.selective_licensing?.active ? 'yes' : 'no'}`}>
                  {policy.selective_licensing?.active ? 'Active' : 'Not in place'}
                </div>
                {policy.selective_licensing?.active && (
                  <>
                    {policy.selective_licensing.date && <p className="policy-detail">Since: {policy.selective_licensing.date}</p>}
                    {policy.selective_licensing.wards?.length > 0 && (
                      <p className="policy-detail">
                        Wards: {policy.selective_licensing.wards.join(', ')}
                      </p>
                    )}
                  </>
                )}
                {policy.selective_licensing?.note && (
                  <p className="policy-detail">{policy.selective_licensing.note}</p>
                )}
                <p className="policy-explainer">
                  Requires private landlords to hold a licence. Aims to raise standards in the private rented sector.
                </p>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* === WARD ANALYSIS TAB === */}
      {activeTab === 'wards' && (
        <div className="tab-content" role="tabpanel">
          {/* Map */}
          {wardBoundaries && (
            <div className="ward-map-section">
              <div className="map-controls">
                <label>Map metric: </label>
                <select value={mapMetric} onChange={e => setMapMetric(e.target.value)}>
                  <option value="private_rent">Private Rent %</option>
                  <option value="overcrowding">Overcrowding %</option>
                  <option value="social_rent">Social Rent %</option>
                  <option value="owned">Owner-Occupied %</option>
                </select>
              </div>
              <Suspense fallback={<LoadingState />}>
                <ChoroplethMap
                  boundaries={wardBoundaries}
                  values={mapValues}
                  colorScale="intensity"
                  legend={{ title: mapLegendTitle, format: v => v.toFixed(1), unit: '%' }}
                  selectedWard={selectedWard}
                  onWardClick={(name) => setSelectedWard(name)}
                  height="450px"
                />
              </Suspense>
            </div>
          )}

          {/* Ward selector */}
          <div className="ward-selector">
            <label htmlFor="ward-select"><MapPin size={16} /> Select ward:</label>
            <select
              id="ward-select"
              value={selectedWard}
              onChange={e => setSelectedWard(e.target.value)}
            >
              <option value="">All wards</option>
              {wardList.map(w => (
                <option key={w.code} value={w.name}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Selected ward detail */}
          {selectedWardData && (
            <div className="ward-detail">
              <h3>{selectedWardData.name}</h3>
              <div className="ward-stats">
                <span>{fmt(selectedWardData.households)} households</span>
                <span>{selectedWardData.owned_pct}% owned</span>
                <span>{selectedWardData.social_pct}% social</span>
                <span>{selectedWardData.private_pct}% private</span>
                <span>{selectedWardData.overcrowding_pct}% overcrowded</span>
              </div>
            </div>
          )}

          {/* Ward comparison table */}
          <div className="ward-table-wrapper">
            <table className="ward-table">
              <thead>
                <tr>
                  <th>Ward</th>
                  <th>Households</th>
                  <th>Owned %</th>
                  <th>Social %</th>
                  <th>Private %</th>
                  <th>Overcrowded %</th>
                </tr>
              </thead>
              <tbody>
                {wardComparison.map(w => (
                  <tr
                    key={w.code}
                    className={selectedWard === w.name ? 'selected' : ''}
                    onClick={() => setSelectedWard(w.name)}
                  >
                    <td className="ward-name">{w.name}</td>
                    <td>{fmt(w.households)}</td>
                    <td>{w.owned_pct}%</td>
                    <td>{w.social_pct}%</td>
                    <td className={w.private_pct > 35 ? 'high-value' : ''}>{w.private_pct}%</td>
                    <td className={w.overcrowding_pct > 6 ? 'high-value' : ''}>{w.overcrowding_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === HMO & LICENSING TAB === */}
      {activeTab === 'hmo' && (
        <div className="tab-content" role="tabpanel">
          {hmoSummary ? (
            <>
              <div className="housing-summary-grid small">
                <div className="housing-card">
                  <div className="card-value">{fmt(hmoSummary.licensed)}</div>
                  <div className="card-label">Licensed HMOs</div>
                </div>
                <div className="housing-card">
                  <div className="card-value">{fmt(hmoSummary.planning)}</div>
                  <div className="card-label">HMO Planning Apps</div>
                </div>
                {hmoSummary.bedSpaces > 0 && (
                  <div className="housing-card">
                    <div className="card-value">{fmt(hmoSummary.bedSpaces)}</div>
                    <div className="card-label">Total Bed Spaces</div>
                  </div>
                )}
              </div>

              {/* Ward-level HMO density */}
              {hmoData?.summary?.by_ward && (
                <ChartCard title="HMO Density by Ward" description="Licensed HMOs and planning applications per ward">
                  <ResponsiveContainer width="100%" height={Math.max(300, Object.keys(hmoData.summary.by_ward).length * 28)}>
                    <BarChart
                      data={Object.entries(hmoData.summary.by_ward)
                        .map(([ward, data]) => ({
                          name: ward,
                          licensed: data.licensed_hmos || 0,
                          planning: data.planning_applications || 0,
                        }))
                        .sort((a, b) => (b.licensed + b.planning) - (a.licensed + a.planning))
                      }
                      layout="vertical"
                      margin={{ left: 10 }}
                    >
                      <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK_STYLE} />
                      <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }} width={120} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend />
                      <Bar dataKey="licensed" name="Licensed" fill={CHART_COLORS[0]} stackId="a" {...CHART_ANIMATION} />
                      <Bar dataKey="planning" name="Planning Apps" fill={CHART_COLORS[3]} stackId="a" {...CHART_ANIMATION} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </>
          ) : (
            <div className="empty-section">
              <p>No HMO register data available for {councilName}.</p>
              <p>HMO data is available for councils that publish their register or have planning-based HMO applications.</p>
            </div>
          )}

          {/* Policy section (repeated for context) */}
          <CollapsibleSection
            title="HMO Regulation Framework"
            subtitle="Article 4 and selective licensing status"
            defaultOpen={true}
            icon={<FileText size={20} />}
          >
            <div className="regulation-info">
              <h4>What is an Article 4 Direction?</h4>
              <p>
                Removes permitted development rights for converting a dwelling (C3) to a small HMO (C4, 3-6 people).
                Without Article 4, landlords can convert houses to HMOs without planning permission.
              </p>
              <h4>What is Selective Licensing?</h4>
              <p>
                Under the Housing Act 2004, councils can require private landlords in designated areas to
                hold a licence. This allows enforcement of property conditions, management standards, and
                tackling anti-social behaviour.
              </p>
              <div className={`policy-badge ${policy.article_4?.active ? 'active' : ''}`}>
                Article 4: {policy.article_4?.active ? 'Active' : 'Not in place'}
              </div>
              <div className={`policy-badge ${policy.selective_licensing?.active ? 'active' : ''}`}>
                Selective Licensing: {policy.selective_licensing?.active ? 'Active' : 'Not in place'}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* Data source */}
      <div className="housing-source">
        <p>
          Source: ONS Census 2021 via Nomis API. Housing policy data compiled from council publications.
          {hmoData && ' HMO data from council registers and planning applications.'}
        </p>
      </div>
    </div>
  )
}

export default Housing
