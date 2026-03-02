import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import { Users, MapPin, Globe, Briefcase, Church, Info, TrendingUp, Shield, Home, AlertTriangle, Activity } from 'lucide-react'
import './Demographics.css'

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : '—'
const pct = (n) => typeof n === 'number' ? `${n}%` : '—'

function Demographics() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data: demographics, loading, error } = useData('/data/demographics.json')
  const { data: projections } = useData('/data/demographic_projections.json')
  const { data: demoFiscalData } = useData('/data/demographic_fiscal.json')
  const [selectedWard, setSelectedWard] = useState('')
  const [activeTab, setActiveTab] = useState('census')

  useEffect(() => {
    document.title = `Demographics | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Prepare data
  const summary = demographics?.summary || {}
  const wards = demographics?.wards || {}
  const councilTotals = demographics?.council_totals || {}

  const wardList = useMemo(() =>
    Object.entries(wards)
      .map(([code, w]) => ({ code, name: w.name, ...w }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [wards]
  )

  const ethnicityChart = useMemo(() => {
    const eth = summary.ethnicity || {}
    return Object.entries(eth).map(([group, data]) => ({
      name: group,
      count: data.count,
      pct: data.pct,
    }))
  }, [summary])

  const religionChart = useMemo(() => {
    const rel = summary.religion || {}
    return Object.entries(rel)
      .filter(([k]) => k !== 'Not answered')
      .map(([name, data]) => ({
        name: name.length > 12 ? name.slice(0, 12) + '...' : name,
        fullName: name,
        count: data.count,
        pct: data.pct,
      }))
  }, [summary])

  // Dependency ratio — (under 16 + over 65) / working-age (16-64)
  const dependencyStats = useMemo(() => {
    const age = councilTotals.age || {}
    const under16 = (age['Aged 4 years and under'] || 0) + (age['Aged 5 to 9 years'] || 0) + (age['Aged 10 to 15 years'] || 0)
    const aged16to64 = (age['Aged 16 to 19 years'] || 0) + (age['Aged 20 to 24 years'] || 0) + (age['Aged 25 to 34 years'] || 0)
      + (age['Aged 35 to 49 years'] || 0) + (age['Aged 50 to 64 years'] || 0)
    const over65 = (age['Aged 65 to 74 years'] || 0) + (age['Aged 75 to 84 years'] || 0) + (age['Aged 85 years and over'] || 0)
    const total = summary.population || 0
    const ratio = aged16to64 > 0 ? ((under16 + over65) / aged16to64 * 100) : 0
    return {
      ratio: Math.round(ratio * 10) / 10,
      youthPct: total > 0 ? Math.round(under16 / total * 1000) / 10 : 0,
      elderlyPct: total > 0 ? Math.round(over65 / total * 1000) / 10 : 0,
      workingPct: total > 0 ? Math.round(aged16to64 / total * 1000) / 10 : 0,
    }
  }, [councilTotals, summary])

  // Age band chart — extract just the banded totals from council_totals.age
  const ageBands = useMemo(() => {
    const age = councilTotals.age || {}
    const bands = [
      { label: '0-4', key: 'Aged 4 years and under' },
      { label: '5-9', key: 'Aged 5 to 9 years' },
      { label: '10-15', key: 'Aged 10 to 15 years' },
      { label: '16-19', key: 'Aged 16 to 19 years' },
      { label: '20-24', key: 'Aged 20 to 24 years' },
      { label: '25-34', key: 'Aged 25 to 34 years' },
      { label: '35-49', key: 'Aged 35 to 49 years' },
      { label: '50-64', key: 'Aged 50 to 64 years' },
      { label: '65-74', key: 'Aged 65 to 74 years' },
      { label: '75-84', key: 'Aged 75 to 84 years' },
      { label: '85+', key: 'Aged 85 years and over' },
    ]
    return bands.map(b => ({
      name: b.label,
      count: age[b.key] || 0,
      pct: summary.population ? Math.round((age[b.key] || 0) / summary.population * 1000) / 10 : 0,
    }))
  }, [councilTotals, summary])

  // Ward comparison data
  const wardComparison = useMemo(() => {
    return wardList.map(w => {
      const eth = w.ethnicity || {}
      // Find "White" top-level
      const whiteKey = Object.keys(eth).find(k => k.startsWith('White') && !k.includes(':'))
      const whiteCount = whiteKey ? eth[whiteKey] : 0
      const totalKey = Object.keys(eth).find(k => k.toLowerCase().includes('total'))
      const total = totalKey ? eth[totalKey] : 0
      const whitePct = total ? Math.round(whiteCount / total * 1000) / 10 : 0
      const nonWhitePct = total ? Math.round((total - whiteCount) / total * 1000) / 10 : 0

      // Population from age total
      const ageData = w.age || {}
      const popKey = Object.keys(ageData).find(k => k.toLowerCase().includes('total'))
      const pop = popKey ? ageData[popKey] : 0

      return {
        code: w.code,
        name: w.name,
        population: pop,
        whitePct,
        nonWhitePct,
      }
    })
  }, [wardList])

  // Selected ward detail
  const wardDetail = useMemo(() => {
    if (!selectedWard) return null
    const w = wards[selectedWard]
    if (!w) return null

    const eth = w.ethnicity || {}
    const rel = w.religion || {}
    const age = w.age || {}
    const cob = w.country_of_birth || {}

    const popKey = Object.keys(age).find(k => k.toLowerCase().includes('total'))
    const pop = popKey ? age[popKey] : 0

    // Ethnicity breakdown — top-level only
    const ethGroups = Object.entries(eth)
      .filter(([k]) => !k.toLowerCase().includes('total') && !k.includes(': '))
      .map(([k, v]) => ({ name: k.split(',')[0], count: v, pct: pop ? Math.round(v / pop * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count)

    // Religion — skip total
    const relGroups = Object.entries(rel)
      .filter(([k]) => !k.toLowerCase().includes('total'))
      .map(([k, v]) => ({ name: k, count: v, pct: pop ? Math.round(v / pop * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count)

    // Country of birth — UK vs non-UK
    const ukKey = Object.keys(cob).find(k => k.toLowerCase().includes('united kingdom'))
    const cobTotalKey = Object.keys(cob).find(k => k.toLowerCase().includes('total'))
    const cobTotal = cobTotalKey ? cob[cobTotalKey] : 0
    const ukBorn = ukKey ? cob[ukKey] : 0

    return {
      name: w.name,
      population: pop,
      ethnicity: ethGroups,
      religion: relGroups,
      bornUkPct: cobTotal ? Math.round(ukBorn / cobTotal * 1000) / 10 : 0,
    }
  }, [selectedWard, wards])

  // Projection chart data
  const popTrajectory = useMemo(() => {
    const pp = projections?.population_projections || {}
    return Object.entries(pp).map(([year, pop]) => ({ year, population: pop }))
  }, [projections])

  const ageShiftData = useMemo(() => {
    const ap = projections?.age_projections || {}
    return Object.entries(ap).map(([year, ages]) => ({
      year,
      '0-15': ages['0-15'] || 0,
      '16-64': ages['16-64'] || 0,
      '65+': ages['65+'] || 0,
    }))
  }, [projections])

  const depRatioTrajectory = useMemo(() => {
    const dr = projections?.dependency_ratio_projection || {}
    return Object.entries(dr).map(([year, ratio]) => ({ year, ratio }))
  }, [projections])

  const asylumData = projections?.asylum || {}
  const asylumTrend = asylumData.trend || []
  const asylumAccommodation = useMemo(() => {
    const acc = asylumData.by_accommodation || {}
    return Object.entries(acc).map(([type, count]) => ({
      name: type.replace('Accommodation', '').trim(),
      value: count,
    }))
  }, [asylumData])

  if (loading) return <LoadingState />
  if (error) return <div className="demo-error">Error loading demographics: {error.message}</div>
  if (!demographics) return <div className="demo-error">No demographics data available</div>

  return (
    <div className="demo-page">
      {/* Hero */}
      <section className="demo-hero">
        <div className="hero-content">
          <h1>Demographics</h1>
          <p className="hero-subtitle">
            Population data, projections, and migration for {councilName}
          </p>
        </div>
      </section>

      {/* Tab Navigation */}
      <div className="demo-tabs" role="tablist">
        {[
          { id: 'census', label: 'Census 2021' },
          ...(projections ? [{ id: 'projections', label: 'Projections' }] : []),
          ...(asylumData.seekers_supported > 0 ? [{ id: 'asylum', label: 'Asylum & Migration' }] : []),
          ...(demoFiscalData?.fiscal_resilience_score != null ? [{ id: 'fiscal', label: 'Fiscal Outlook' }] : []),
        ].map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`demo-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== CENSUS 2021 TAB ===== */}
      {activeTab === 'census' && <>

      {/* Summary Cards */}
      <div className="demo-summary-grid" role="region" aria-label="Population summary statistics">
        <div className="demo-card">
          <div className="demo-card-icon"><Users size={20} /></div>
          <div className="demo-card-value">{fmt(summary.population)}</div>
          <div className="demo-card-label">Total Population</div>
          <div className="demo-card-detail">
            {pct(summary.female_pct)} female, {pct(summary.male_pct)} male
          </div>
        </div>
        <div className="demo-card">
          <div className="demo-card-icon"><Globe size={20} /></div>
          <div className="demo-card-value">{pct(summary.born_uk_pct)}</div>
          <div className="demo-card-label">Born in UK</div>
          <div className="demo-card-detail">
            {pct(summary.born_outside_uk_pct)} born outside UK
          </div>
        </div>
        <div className="demo-card">
          <div className="demo-card-icon"><Briefcase size={20} /></div>
          <div className="demo-card-value">{pct(summary.employment_rate_pct)}</div>
          <div className="demo-card-label">Employment Rate</div>
          <div className="demo-card-detail">
            {pct(summary.unemployment_rate_pct)} unemployment
          </div>
        </div>
        {dependencyStats.ratio > 0 && (
          <div className="demo-card">
            <div className="demo-card-icon" style={{ color: dependencyStats.ratio >= 70 ? '#ff453a' : dependencyStats.ratio >= 65 ? '#ff9f0a' : '#30d158' }}>
              <Users size={20} />
            </div>
            <div className="demo-card-value">{dependencyStats.ratio}%</div>
            <div className="demo-card-label">Dependency Ratio</div>
            <div className="demo-card-detail">
              {dependencyStats.youthPct}% youth, {dependencyStats.elderlyPct}% elderly
            </div>
          </div>
        )}
        <div className="demo-card">
          <div className="demo-card-icon"><MapPin size={20} /></div>
          <div className="demo-card-value">{wardList.length}</div>
          <div className="demo-card-label">Wards</div>
          <div className="demo-card-detail">
            Census 2021 boundaries
          </div>
        </div>
      </div>

      {/* Ethnicity Section */}
      <section className="demo-section" aria-labelledby="demo-ethnicity-heading">
        <h2 id="demo-ethnicity-heading"><Globe size={22} /> Ethnicity</h2>
        <p className="section-intro">
          Broad ethnic group breakdown across {councilName} from the 2021 Census.
        </p>
        <div className="demo-chart-container" role="img" aria-label={`Ethnicity breakdown bar chart for ${councilName}`}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ethnicityChart} layout="vertical" margin={{ left: 60, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis type="number" tick={AXIS_TICK_STYLE} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#e5e5e7', fontSize: 13 }} width={55} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(val, name) => [fmt(val) + ` (${ethnicityChart.find(e => e.count === val)?.pct || 0}%)`, 'Population']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {ethnicityChart.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Religion Section */}
      <section className="demo-section" aria-labelledby="demo-religion-heading">
        <h2 id="demo-religion-heading"><Church size={22} /> Religion</h2>
        <div className="demo-chart-row">
          <div className="demo-chart-container demo-chart-half" role="img" aria-label={`Religion pie chart for ${councilName}`}>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={religionChart}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={40}
                  dataKey="count"
                  label={({ fullName, pct }) => pct > 3 ? `${fullName} ${pct}%` : ''}
                  labelLine={false}
                >
                  {religionChart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(val, name, props) => [fmt(val) + ` (${props.payload.pct}%)`, props.payload.fullName]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="demo-chart-container demo-chart-half" role="list" aria-label="Religion breakdown">
            <div className="religion-list">
              {religionChart.map((r, i) => (
                <div key={r.fullName} className="religion-row">
                  <span className="religion-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="religion-name">{r.fullName}</span>
                  <span className="religion-pct">{r.pct}%</span>
                  <span className="religion-count">{fmt(r.count)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Age Distribution */}
      <section className="demo-section" aria-labelledby="demo-age-heading">
        <h2 id="demo-age-heading"><Users size={22} /> Age Distribution</h2>
        <div className="demo-chart-container" role="img" aria-label={`Age distribution bar chart for ${councilName}`}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageBands} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(val) => [fmt(val), 'Population']}
              />
              <Bar dataKey="count" fill="#0a84ff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Ward Comparison Table */}
      <section className="demo-section" aria-labelledby="demo-ward-heading">
        <h2 id="demo-ward-heading"><MapPin size={22} /> Ward Comparison</h2>
        <p className="section-intro">
          Population and ethnic diversity by ward. Select a ward for detailed breakdown.
        </p>
        <div className="demo-table-wrapper">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Ward</th>
                <th>Population</th>
                <th>White %</th>
                <th>Ethnic Minority %</th>
              </tr>
            </thead>
            <tbody>
              {wardComparison.map(w => (
                <tr
                  key={w.code}
                  className={selectedWard === w.code ? 'selected' : ''}
                  onClick={() => setSelectedWard(selectedWard === w.code ? '' : w.code)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWard(selectedWard === w.code ? '' : w.code) } }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selectedWard === w.code}
                  aria-label={`Select ${w.name} ward — population ${w.population?.toLocaleString('en-GB') || 'unknown'}`}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="ward-name">{w.name}</td>
                  <td>{fmt(w.population)}</td>
                  <td>{w.whitePct}%</td>
                  <td>
                    <div className="diversity-bar">
                      <div
                        className="diversity-fill"
                        style={{ width: `${Math.min(w.nonWhitePct, 100)}%` }}
                      />
                      <span>{w.nonWhitePct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ward Detail Panel */}
      {wardDetail && (
        <section className="demo-section demo-ward-detail" aria-labelledby="demo-ward-detail-heading" aria-live="polite">
          <h2 id="demo-ward-detail-heading"><MapPin size={22} /> {wardDetail.name}</h2>
          <p className="section-intro">
            Population {fmt(wardDetail.population)} &middot; {wardDetail.bornUkPct}% born in UK
          </p>

          <div className="demo-ward-grid">
            <div className="demo-chart-container">
              <h3>Ethnicity</h3>
              <div className="breakdown-list">
                {wardDetail.ethnicity.map((e, i) => (
                  <div key={e.name} className="breakdown-row">
                    <span className="breakdown-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="breakdown-name">{e.name}</span>
                    <span className="breakdown-bar">
                      <span className="breakdown-fill" style={{ width: `${e.pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </span>
                    <span className="breakdown-pct">{e.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="demo-chart-container">
              <h3>Religion</h3>
              <div className="breakdown-list">
                {wardDetail.religion.slice(0, 6).map((r, i) => (
                  <div key={r.name} className="breakdown-row">
                    <span className="breakdown-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="breakdown-name">{r.name}</span>
                    <span className="breakdown-bar">
                      <span className="breakdown-fill" style={{ width: `${r.pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </span>
                    <span className="breakdown-pct">{r.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      </>}

      {/* ===== PROJECTIONS TAB ===== */}
      {activeTab === 'projections' && projections && <>
        <div className="demo-summary-grid">
          <div className="demo-card">
            <div className="demo-card-icon"><TrendingUp size={20} /></div>
            <div className="demo-card-value" style={{ color: projections.growth_rate_pct > 0 ? '#30d158' : '#ff453a' }}>
              {projections.growth_rate_pct > 0 ? '+' : ''}{projections.growth_rate_pct}%
            </div>
            <div className="demo-card-label">Projected Growth</div>
            <div className="demo-card-detail">2022 to 2047</div>
          </div>
          <div className="demo-card">
            <div className="demo-card-icon"><Users size={20} /></div>
            <div className="demo-card-value">{fmt(projections.population_projections?.['2032'])}</div>
            <div className="demo-card-label">Population 2032</div>
            <div className="demo-card-detail">vs {fmt(projections.population_projections?.['2022'])} in 2022</div>
          </div>
          <div className="demo-card">
            <div className="demo-card-icon" style={{ color: (projections.dependency_ratio_projection?.['2032'] || 0) >= 65 ? '#ff9f0a' : '#30d158' }}>
              <Users size={20} />
            </div>
            <div className="demo-card-value">{projections.dependency_ratio_projection?.['2032'] || '—'}%</div>
            <div className="demo-card-label">Dependency Ratio 2032</div>
            <div className="demo-card-detail">
              vs {projections.dependency_ratio_projection?.['2022'] || '—'}% in 2022
            </div>
          </div>
          <div className="demo-card">
            <div className="demo-card-icon"><Briefcase size={20} /></div>
            <div className="demo-card-value">{projections.working_age_pct_projection?.['2032'] || '—'}%</div>
            <div className="demo-card-label">Working Age 2032</div>
            <div className="demo-card-detail">16-64 year olds</div>
          </div>
        </div>

        {/* Population Trajectory */}
        {popTrajectory.length > 0 && (
          <section className="demo-section">
            <h2><TrendingUp size={22} /> Population Trajectory</h2>
            <p className="section-intro">
              ONS 2022-based projected population for {councilName} out to 2047.
            </p>
            <div className="demo-chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={popTrajectory} margin={{ left: 20, right: 20, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} domain={['dataMin - 2000', 'dataMax + 2000']} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmt(v), 'Population']} />
                  <Line type="monotone" dataKey="population" stroke="var(--accent-blue)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent-blue)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Age Structure Shift */}
        {ageShiftData.length > 0 && (
          <section className="demo-section">
            <h2><Users size={22} /> Age Structure Shift</h2>
            <p className="section-intro">
              How the age composition of {councilName} is projected to change. The growing 65+ population will increase demand for social care.
            </p>
            <div className="demo-chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={ageShiftData} margin={{ left: 20, right: 20, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmt(v), '']} />
                  <Legend wrapperStyle={{ color: '#e5e5e7', fontSize: '0.8rem' }} />
                  <Area type="monotone" dataKey="0-15" stackId="1" stroke="#0a84ff" fill="rgba(10,132,255,0.3)" name="Youth (0-15)" />
                  <Area type="monotone" dataKey="16-64" stackId="1" stroke="#30d158" fill="rgba(48,209,88,0.3)" name="Working (16-64)" />
                  <Area type="monotone" dataKey="65+" stackId="1" stroke="#ff9f0a" fill="rgba(255,159,10,0.3)" name="Elderly (65+)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Dependency Ratio Trajectory */}
        {depRatioTrajectory.length > 0 && (
          <section className="demo-section">
            <h2><Shield size={22} /> Dependency Ratio Trajectory</h2>
            <p className="section-intro">
              The dependency ratio measures how many dependents (under 16 + over 65) each 100 working-age residents support.
              Higher ratios mean more pressure on council services and budgets.
            </p>
            <div className="demo-chart-container">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={depRatioTrajectory} margin={{ left: 20, right: 20, top: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} domain={[50, 75]} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Dependency Ratio']} />
                  <defs>
                    <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff9f0a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ff9f0a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="ratio" stroke="#ff9f0a" fill="url(#depGrad)" strokeWidth={2} dot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <div className="demo-source">
          <Info size={16} />
          <div>
            <p>Data from <strong>ONS 2022-based Sub-National Population Projections</strong> via Nomis API. Projections are trend-based and assume no major policy changes.</p>
          </div>
        </div>
      </>}

      {/* ===== ASYLUM & MIGRATION TAB ===== */}
      {activeTab === 'asylum' && asylumData.seekers_supported > 0 && <>
        <div className="demo-summary-grid">
          <div className="demo-card">
            <div className="demo-card-icon"><Home size={20} /></div>
            <div className="demo-card-value">{fmt(asylumData.seekers_supported)}</div>
            <div className="demo-card-label">Asylum Seekers Supported</div>
            <div className="demo-card-detail">As at {asylumData.latest_date || 'latest'}</div>
          </div>
          <div className="demo-card">
            <div className="demo-card-icon"><Globe size={20} /></div>
            <div className="demo-card-value">{fmt(projections?.resettlement?.total || 0)}</div>
            <div className="demo-card-label">Refugees Resettled</div>
            <div className="demo-card-detail">Cumulative total</div>
          </div>
          {summary.population > 0 && (
            <div className="demo-card">
              <div className="demo-card-icon"><Users size={20} /></div>
              <div className="demo-card-value">
                {Math.round(asylumData.seekers_supported / summary.population * 10000) / 10}
              </div>
              <div className="demo-card-label">Per 1,000 Population</div>
              <div className="demo-card-detail">Local dispersal rate</div>
            </div>
          )}
        </div>

        {/* Accommodation Type Breakdown */}
        {asylumAccommodation.length > 0 && (
          <section className="demo-section">
            <h2><Home size={22} /> Accommodation Type</h2>
            <p className="section-intro">
              How asylum seekers in {councilName} are housed. Dispersal accommodation is provided by private contractors under Home Office contracts.
            </p>
            <div className="demo-chart-container" style={{ maxWidth: '400px' }}>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={asylumAccommodation} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value"
                    label={({ name, value }) => `${name}: ${fmt(value)}`} labelLine={false}>
                    {asylumAccommodation.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Trend */}
        {asylumTrend.length > 1 && (
          <section className="demo-section">
            <h2><TrendingUp size={22} /> Asylum Support Trend</h2>
            <p className="section-intro">
              Number of asylum seekers receiving Home Office support in {councilName} over recent years.
            </p>
            <div className="demo-chart-container">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={asylumTrend.map(t => ({ ...t, date: t.date?.replace(/\d+ \w+ /, '') || t.date }))} margin={{ left: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="date" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmt(v), 'People supported']} />
                  <Bar dataKey="people" fill="var(--accent-orange)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        <div className="demo-source">
          <Info size={16} />
          <div>
            <p>Data from <strong>Home Office Immigration Statistics</strong>, year ending December 2025. Asylum support figures show people receiving Section 4 or Section 95 support.</p>
          </div>
        </div>
      </>}

      {/* ═══ FISCAL OUTLOOK TAB ═══ */}
      {activeTab === 'fiscal' && demoFiscalData && <>
        {/* Score cards */}
        <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="demo-stat-card" style={{ borderLeft: `3px solid ${demoFiscalData.fiscal_resilience_score < 30 ? '#ff453a' : demoFiscalData.fiscal_resilience_score < 50 ? '#ff9f0a' : '#30d158'}` }}>
            <span className="demo-stat-label">Fiscal Resilience</span>
            <span className="demo-stat-value" style={{ color: demoFiscalData.fiscal_resilience_score < 30 ? '#ff453a' : demoFiscalData.fiscal_resilience_score < 50 ? '#ff9f0a' : '#30d158' }}>
              {demoFiscalData.fiscal_resilience_score}/100
            </span>
            <span className="demo-stat-desc">{demoFiscalData.risk_category}</span>
          </div>
          <div className="demo-stat-card" style={{ borderLeft: `3px solid ${demoFiscalData.service_demand_pressure_score > 70 ? '#ff453a' : '#ff9f0a'}` }}>
            <span className="demo-stat-label">Service Demand Pressure</span>
            <span className="demo-stat-value" style={{ color: demoFiscalData.service_demand_pressure_score > 70 ? '#ff453a' : '#ff9f0a' }}>
              {demoFiscalData.service_demand_pressure_score}/100
            </span>
            <span className="demo-stat-desc">Higher = more costly services</span>
          </div>
          {demoFiscalData.demographic_change_velocity != null && (
            <div className="demo-stat-card" style={{ borderLeft: '3px solid #0a84ff' }}>
              <span className="demo-stat-label">Demographic Change</span>
              <span className="demo-stat-value" style={{ color: '#0a84ff' }}>
                {demoFiscalData.demographic_change_velocity.toFixed(1)}
              </span>
              <span className="demo-stat-desc">Velocity of composition shift</span>
            </div>
          )}
        </div>

        {/* SEND Risk */}
        {demoFiscalData.send_risk && (
          <div className="demo-section">
            <h3><Activity size={18} /> Education &amp; SEND Exposure</h3>
            <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div className="demo-stat-card">
                <span className="demo-stat-label">Estimated SEND Rate</span>
                <span className="demo-stat-value">{pct(demoFiscalData.send_risk.estimated_send_rate_pct)}</span>
              </div>
              {demoFiscalData.send_risk.eal_pupil_estimate > 0 && (
                <div className="demo-stat-card">
                  <span className="demo-stat-label">EAL Pupils (est.)</span>
                  <span className="demo-stat-value">{fmt(demoFiscalData.send_risk.eal_pupil_estimate)}</span>
                </div>
              )}
              {demoFiscalData.send_risk.cost_premium_pct > 0 && (
                <div className="demo-stat-card">
                  <span className="demo-stat-label">Cost Premium</span>
                  <span className="demo-stat-value" style={{ color: '#ff9f0a' }}>+{demoFiscalData.send_risk.cost_premium_pct.toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Council Tax Risk */}
        {demoFiscalData.council_tax_risk && (
          <div className="demo-section">
            <h3><Home size={18} /> Council Tax Risk</h3>
            <div className="demo-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div className="demo-stat-card">
                <span className="demo-stat-label">Collection Rate</span>
                <span className="demo-stat-value">{pct(demoFiscalData.council_tax_risk.collection_rate)}</span>
              </div>
              {demoFiscalData.council_tax_risk.trend != null && (
                <div className="demo-stat-card">
                  <span className="demo-stat-label">5-Year Trend</span>
                  <span className="demo-stat-value" style={{ color: demoFiscalData.council_tax_risk.trend < 0 ? '#ff453a' : '#30d158' }}>
                    {demoFiscalData.council_tax_risk.trend > 0 ? '+' : ''}{demoFiscalData.council_tax_risk.trend.toFixed(2)}%/yr
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Threats */}
        {demoFiscalData.threats?.length > 0 && (
          <div className="demo-section">
            <h3><AlertTriangle size={18} /> Identified Threats</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {demoFiscalData.threats.map((t, i) => (
                <div key={i} style={{ padding: '0.75rem', background: 'rgba(28,28,30,0.7)', borderRadius: '8px', borderLeft: `3px solid ${t.severity === 'critical' ? '#ff453a' : t.severity === 'high' ? '#ff9f0a' : '#ffd60a'}` }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{t.description}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.evidence}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pressure Zones */}
        {demoFiscalData.pressure_zones?.length > 0 && (
          <div className="demo-section">
            <h3><MapPin size={18} /> Pressure Zone Wards</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Wards with both high deprivation and significant demographic pressure — where service costs are highest.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
              {demoFiscalData.pressure_zones.map((z, i) => (
                <div key={i} style={{ padding: '0.5rem 0.75rem', background: 'rgba(28,28,30,0.7)', borderRadius: '6px', borderLeft: `3px solid ${z.flag === 'CRITICAL' ? '#ff453a' : '#ff9f0a'}`, fontSize: '0.8125rem' }}>
                  <strong>{z.ward}</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                    IMD dec. {z.imd_decile}
                    {z.muslim_pct > 0 && <> · Muslim {z.muslim_pct}%</>}
                    {z.under_16_pct > 0 && <> · U16 {z.under_16_pct}%</>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LGR Implications */}
        {demoFiscalData.lgr_threats?.length > 0 && (
          <div className="demo-section">
            <h3><Shield size={18} /> LGR Implications</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {demoFiscalData.lgr_threats.map((t, i) => (
                <div key={i} style={{ padding: '0.5rem 0.75rem', background: 'rgba(28,28,30,0.7)', borderRadius: '6px', fontSize: '0.8125rem' }}>
                  <strong>{t.model}</strong>: {t.threat}
                </div>
              ))}
            </div>
            <Link to="/lgr-tracker" style={{ display: 'inline-block', marginTop: '0.75rem', fontSize: '0.8125rem' }}>View full LGR analysis →</Link>
          </div>
        )}

        <div className="demo-source">
          <Info size={16} />
          <div>
            <p>
              Fiscal analysis based on <strong>ONS Census 2021</strong>, <strong>DfE SEND Statistics 2023</strong>,
              <strong> Home Office Immigration Statistics</strong>, <strong>GOV.UK Council Tax Collection Rates</strong>,
              and <strong>MHCLG IMD 2019</strong>. Academic sources: Casey Review (2016), Cantle Report (2001).
            </p>
          </div>
        </div>
      </>}

      {/* Source Note (shown on census tab) */}
      {activeTab === 'census' && (
      <div className="demo-source">
        <Info size={16} />
        <div>
          <p>
            Data from the <strong>ONS Census 2021</strong> via Nomis API.
            Census date: 21 March 2021. Ward boundaries are 2022 electoral wards.
          </p>
          <p className="generated-date">
            Generated: {demographics?.meta?.generated || 'Unknown'}
          </p>
        </div>
      </div>
      )}
    </div>
  )
}

export default Demographics
