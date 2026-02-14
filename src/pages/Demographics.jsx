import { useEffect, useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE } from '../utils/constants'
import { Users, MapPin, Globe, Briefcase, Church, Info } from 'lucide-react'
import './Demographics.css'

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : '—'
const pct = (n) => typeof n === 'number' ? `${n}%` : '—'

function Demographics() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data: demographics, loading, error } = useData('/data/demographics.json')
  const [selectedWard, setSelectedWard] = useState('')

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
            Census 2021 ward-level population data for {councilName}
          </p>
        </div>
      </section>

      {/* Summary Cards */}
      <div className="demo-summary-grid">
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
      <section className="demo-section">
        <h2><Globe size={22} /> Ethnicity</h2>
        <p className="section-intro">
          Broad ethnic group breakdown across {councilName} from the 2021 Census.
        </p>
        <div className="demo-chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ethnicityChart} layout="vertical" margin={{ left: 60, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tick={{ fill: '#8e8e93', fontSize: 12 }} />
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
      <section className="demo-section">
        <h2><Church size={22} /> Religion</h2>
        <div className="demo-chart-row">
          <div className="demo-chart-container demo-chart-half">
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
          <div className="demo-chart-container demo-chart-half">
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
      <section className="demo-section">
        <h2><Users size={22} /> Age Distribution</h2>
        <div className="demo-chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageBands} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8e8e93', fontSize: 12 }} />
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
      <section className="demo-section">
        <h2><MapPin size={22} /> Ward Comparison</h2>
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
        <section className="demo-section demo-ward-detail">
          <h2><MapPin size={22} /> {wardDetail.name}</h2>
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

      {/* Source Note */}
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
    </div>
  )
}

export default Demographics
