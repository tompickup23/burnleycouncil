import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { LoadingState } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from 'recharts'
import {
  PoundSterling, Users, BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  Search, ArrowUpDown, ExternalLink, Landmark, Vote, Scale,
} from 'lucide-react'
import { TOOLTIP_STYLE, CHART_COLORS, GRID_STROKE, AXIS_TICK_STYLE, AXIS_TICK_STYLE_SM } from '../utils/constants'
import './MPComparison.css'

// Party colours
const PARTY_COLORS = {
  Labour: '#DC241F', 'Labour (Co-op)': '#DC241F', Conservative: '#0087DC',
  'Liberal Democrats': '#FAA61A', 'Reform UK': '#12B6CF', 'Green Party': '#6AB023',
  Independent: '#888888', Speaker: '#333333', Other: '#999999',
}

const EXPENSE_CATEGORIES = [
  { key: 'staffing', label: 'Staffing', color: '#0a84ff' },
  { key: 'office_costs', label: 'Office', color: '#30d158' },
  { key: 'accommodation', label: 'Accommodation', color: '#ff9f0a' },
  { key: 'travel', label: 'Travel', color: '#bf5af2' },
  { key: 'other', label: 'Other', color: '#8e8e93' },
]

const SORT_OPTIONS = [
  { value: 'total_cost', label: 'Total cost to taxpayer' },
  { value: 'expenses', label: 'Total expenses claimed' },
  { value: 'staffing', label: 'Staffing costs' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'travel', label: 'Travel' },
  { value: 'office', label: 'Office costs' },
  { value: 'attendance', label: 'Attendance rate' },
  { value: 'rebellions', label: 'Rebellion rate' },
  { value: 'alpha', label: 'A–Z by name' },
]

function formatCurrency(n) {
  if (n == null) return '—'
  if (n >= 1e6) return `£${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `£${(n / 1e3).toFixed(1)}k`
  return `£${n.toFixed(0)}`
}

function MPComparison() {
  const { data: constData, loading, error } = useData('/data/shared/constituencies.json')
  const [sortBy, setSortBy] = useState('total_cost')
  const [filterParty, setFilterParty] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('expenses')

  // Build filter options
  const filterOptions = useMemo(() => {
    if (!constData?.constituencies) return [{ value: 'all', label: 'All parties' }]
    const parties = new Set()
    constData.constituencies.forEach(c => {
      if (c.mp?.party) parties.add(c.mp.party)
    })
    return [
      { value: 'all', label: 'All parties' },
      ...[...parties].sort().map(p => ({ value: p, label: p })),
    ]
  }, [constData])

  // Process and sort MPs
  const mps = useMemo(() => {
    if (!constData?.constituencies) return []
    let list = constData.constituencies
      .filter(c => c.mp && c.mp.name)
      .map(c => ({
        ...c,
        totalCost: c.mp.expenses?.total_cost_to_taxpayer || 0,
        totalClaimed: c.mp.expenses?.total_claimed || 0,
        staffing: c.mp.expenses?.staffing || 0,
        accommodation: c.mp.expenses?.accommodation || 0,
        travel: c.mp.expenses?.travel || 0,
        office: c.mp.expenses?.office_costs || 0,
        other: c.mp.expenses?.other || 0,
        salary: c.mp.expenses?.salary || 0,
        attendancePct: c.voting_record?.attendance_pct || 0,
        rebellionRate: c.voting_record?.rebellion_rate || 0,
        rebellions: c.voting_record?.rebellions || 0,
        totalVotes: c.voting_record?.voted_in || 0,
        totalDivisions: c.voting_record?.total_divisions || 0,
      }))

    // Filter by party
    if (filterParty !== 'all') {
      list = list.filter(c => c.mp.party === filterParty)
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.mp.name.toLowerCase().includes(term)
      )
    }

    // Sort
    switch (sortBy) {
      case 'total_cost': list.sort((a, b) => b.totalCost - a.totalCost); break
      case 'expenses': list.sort((a, b) => b.totalClaimed - a.totalClaimed); break
      case 'staffing': list.sort((a, b) => b.staffing - a.staffing); break
      case 'accommodation': list.sort((a, b) => b.accommodation - a.accommodation); break
      case 'travel': list.sort((a, b) => b.travel - a.travel); break
      case 'office': list.sort((a, b) => b.office - a.office); break
      case 'attendance': list.sort((a, b) => a.attendancePct - b.attendancePct); break
      case 'rebellions': list.sort((a, b) => b.rebellionRate - a.rebellionRate); break
      case 'alpha': list.sort((a, b) => a.mp.name.localeCompare(b.mp.name)); break
    }

    return list
  }, [constData, sortBy, filterParty, searchTerm])

  // Compute aggregate stats
  const stats = useMemo(() => {
    if (mps.length === 0) return null
    const totalCosts = mps.map(m => m.totalCost)
    const avgCost = totalCosts.reduce((a, b) => a + b, 0) / mps.length
    const maxCost = Math.max(...totalCosts)
    const minCost = Math.min(...totalCosts)
    const totalStaffing = mps.reduce((a, m) => a + m.staffing, 0)
    const totalTravel = mps.reduce((a, m) => a + m.travel, 0)
    const totalAccom = mps.reduce((a, m) => a + m.accommodation, 0)
    const avgAttendance = mps.reduce((a, m) => a + m.attendancePct, 0) / mps.length
    const rebels = mps.filter(m => m.rebellions > 0)
    return { avgCost, maxCost, minCost, totalStaffing, totalTravel, totalAccom, avgAttendance, rebels }
  }, [mps])

  // Chart data: expenses by MP
  const expensesChartData = useMemo(() =>
    mps.slice(0, 20).map(m => ({
      name: m.mp.name.split(' ').pop(),
      fullName: m.mp.name,
      constituency: m.name,
      party: m.mp.party,
      staffing: Math.round(m.staffing),
      office: Math.round(m.office),
      accommodation: Math.round(m.accommodation),
      travel: Math.round(m.travel),
      other: Math.round(m.other),
      total: Math.round(m.totalClaimed),
    })),
    [mps]
  )

  // Chart data: total cost by MP
  const costChartData = useMemo(() =>
    mps.map(m => ({
      name: m.mp.name.split(' ').pop(),
      fullName: m.mp.name,
      constituency: m.name,
      party: m.mp.party,
      totalCost: Math.round(m.totalCost),
      salary: Math.round(m.salary),
      expenses: Math.round(m.totalClaimed),
      fill: PARTY_COLORS[m.mp.party] || '#888',
    })).sort((a, b) => b.totalCost - a.totalCost),
    [mps]
  )

  // Voting record comparison
  const votingChartData = useMemo(() =>
    mps.map(m => ({
      name: m.mp.name.split(' ').pop(),
      fullName: m.mp.name,
      constituency: m.name,
      party: m.mp.party,
      attendance: Math.round(m.attendancePct * 100),
      rebellions: m.rebellions,
      rebellionRate: Math.round(m.rebellionRate * 100),
      voted: m.totalVotes,
      fill: PARTY_COLORS[m.mp.party] || '#888',
    })).sort((a, b) => a.attendance - b.attendance),
    [mps]
  )

  // Outlier detection — flag any MP more than 1.5 std devs from mean
  const outliers = useMemo(() => {
    if (mps.length < 3) return []
    const result = []
    const mean = mps.reduce((a, m) => a + m.totalClaimed, 0) / mps.length
    const stdDev = Math.sqrt(mps.reduce((a, m) => a + Math.pow(m.totalClaimed - mean, 2), 0) / mps.length)

    for (const m of mps) {
      const zScore = (m.totalClaimed - mean) / (stdDev || 1)
      if (Math.abs(zScore) > 1.5) {
        result.push({
          mp: m.mp.name,
          constituency: m.name,
          party: m.mp.party,
          totalClaimed: m.totalClaimed,
          zScore,
          direction: zScore > 0 ? 'above' : 'below',
          note: zScore > 0
            ? `Claims ${formatCurrency(m.totalClaimed - mean)} more than Lancashire average`
            : `Claims ${formatCurrency(mean - m.totalClaimed)} less than Lancashire average`,
        })
      }
    }

    // Check for specific category outliers
    for (const cat of EXPENSE_CATEGORIES) {
      const catValues = mps.map(m => m[cat.key] || 0)
      const catMean = catValues.reduce((a, b) => a + b, 0) / mps.length
      const catStd = Math.sqrt(catValues.reduce((a, v) => a + Math.pow(v - catMean, 2), 0) / mps.length)

      for (const m of mps) {
        const val = m[cat.key] || 0
        const z = (val - catMean) / (catStd || 1)
        if (z > 2) {
          result.push({
            mp: m.mp.name,
            constituency: m.name,
            party: m.mp.party,
            category: cat.label,
            value: val,
            zScore: z,
            direction: 'above',
            note: `${cat.label} spending ${formatCurrency(val - catMean)} above Lancashire average (z=${z.toFixed(1)})`,
          })
        }
      }
    }

    // Deduplicate by MP (keep highest z-score per person)
    const byMP = {}
    for (const o of result) {
      if (!byMP[o.mp] || Math.abs(o.zScore) > Math.abs(byMP[o.mp].zScore)) {
        byMP[o.mp] = o
      }
    }
    return Object.values(byMP).sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
  }, [mps])

  if (loading) return <LoadingState />
  if (error || !constData?.constituencies) {
    return (
      <div className="mp-comparison-page">
        <div className="mp-comparison-error">
          <Landmark size={48} />
          <h2>Data unavailable</h2>
          <p>Unable to load constituency data.</p>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'expenses', label: 'Expenses', icon: PoundSterling },
    { id: 'voting', label: 'Voting', icon: Vote },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  ]

  return (
    <div className="mp-comparison-page">
      <header className="mp-comparison-header">
        <div>
          <h1><Scale size={28} /> Lancashire MP Comparison</h1>
          <p className="mp-comparison-subtitle">
            Compare {mps.length} MPs across expenses, cost to taxpayer, and voting records.
            Data: IPSA {constData.meta?.expenses_year || '2024-25'}, Commons Votes API.
          </p>
        </div>
        <Link to="/constituencies" className="mp-comparison-back">
          <Landmark size={14} /> All Constituencies
        </Link>
      </header>

      {/* Summary stats */}
      {stats && (
        <div className="mp-comparison-stats">
          <div className="mp-stat-card">
            <span className="mp-stat-value">{formatCurrency(stats.avgCost)}</span>
            <span className="mp-stat-label">Avg cost to taxpayer</span>
          </div>
          <div className="mp-stat-card">
            <span className="mp-stat-value">{formatCurrency(stats.maxCost)}</span>
            <span className="mp-stat-label">Highest total cost</span>
          </div>
          <div className="mp-stat-card">
            <span className="mp-stat-value">{formatCurrency(stats.minCost)}</span>
            <span className="mp-stat-label">Lowest total cost</span>
          </div>
          <div className="mp-stat-card">
            <span className="mp-stat-value">{(stats.avgAttendance * 100).toFixed(0)}%</span>
            <span className="mp-stat-label">Avg attendance</span>
          </div>
          <div className="mp-stat-card">
            <span className="mp-stat-value">{stats.rebels.length}</span>
            <span className="mp-stat-label">MPs with rebellions</span>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="mp-comparison-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`mp-comparison-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </nav>

      {/* Controls */}
      <div className="mp-comparison-controls">
        <div className="mp-comparison-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search MP or constituency…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)}>
          {filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ====================== EXPENSES TAB ====================== */}
      {activeTab === 'expenses' && (
        <div className="mp-comparison-content">
          {/* Stacked bar chart — expenses breakdown */}
          <div className="mp-chart-card">
            <h3>Expenses Breakdown by MP</h3>
            <ResponsiveContainer width="100%" height={Math.max(400, mps.length * 35)}>
              <BarChart data={expensesChartData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" tickFormatter={v => formatCurrency(v)} axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                <YAxis type="category" dataKey="name" width={75} axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE_SM} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [formatCurrency(v), name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ? `${payload[0].payload.fullName} (${payload[0].payload.constituency})` : ''}
                />
                {EXPENSE_CATEGORIES.map(cat => (
                  <Bar key={cat.key} dataKey={cat.key} stackId="expenses" fill={cat.color} name={cat.label} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Total cost bar chart */}
          <div className="mp-chart-card">
            <h3>Total Cost to Taxpayer (Salary + Expenses)</h3>
            <ResponsiveContainer width="100%" height={Math.max(400, mps.length * 35)}>
              <BarChart data={costChartData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" tickFormatter={v => formatCurrency(v)} axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                <YAxis type="category" dataKey="name" width={75} axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE_SM} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [formatCurrency(v), name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ? `${payload[0].payload.fullName} (${payload[0].payload.constituency})` : ''}
                />
                <Bar dataKey="salary" stackId="cost" fill="#555" name="Salary" />
                <Bar dataKey="expenses" stackId="cost" fill="#0a84ff" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Expenses table */}
          <div className="mp-table-card">
            <h3>Full Expenses Breakdown</h3>
            <div className="mp-table-scroll">
              <table className="mp-comparison-table">
                <thead>
                  <tr>
                    <th>MP</th>
                    <th>Constituency</th>
                    <th>Party</th>
                    <th>Salary</th>
                    <th>Staffing</th>
                    <th>Office</th>
                    <th>Accom.</th>
                    <th>Travel</th>
                    <th>Other</th>
                    <th>Total Claimed</th>
                    <th>Total Cost</th>
                    <th>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {mps.map((m, i) => (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/constituency/${m.id}`} className="mp-table-name">{m.mp.name}</Link>
                      </td>
                      <td>{m.name}</td>
                      <td><span className="mp-party-dot" style={{ background: PARTY_COLORS[m.mp.party] || '#888' }} />{m.mp.party_abbreviation || m.mp.party}</td>
                      <td>{formatCurrency(m.salary)}</td>
                      <td>{formatCurrency(m.staffing)}</td>
                      <td>{formatCurrency(m.office)}</td>
                      <td>{formatCurrency(m.accommodation)}</td>
                      <td>{formatCurrency(m.travel)}</td>
                      <td>{formatCurrency(m.other)}</td>
                      <td className="mp-table-highlight">{formatCurrency(m.totalClaimed)}</td>
                      <td className="mp-table-highlight">{formatCurrency(m.totalCost)}</td>
                      <td>{m.mp.expenses?.rank_of_650 || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================== VOTING TAB ====================== */}
      {activeTab === 'voting' && (
        <div className="mp-comparison-content">
          {/* Attendance chart */}
          <div className="mp-chart-card">
            <h3>Voting Attendance Rate</h3>
            <ResponsiveContainer width="100%" height={Math.max(400, mps.length * 35)}>
              <BarChart data={votingChartData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE} />
                <YAxis type="category" dataKey="name" width={75} axisLine={false} tickLine={false} tick={AXIS_TICK_STYLE_SM} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v, name) => [name === 'Rebellions' ? v : `${v}%`, name]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload
                    return p ? `${p.fullName} (${p.constituency}) — ${p.party}` : ''
                  }}
                />
                <Bar dataKey="attendance" fill="#0a84ff" name="Attendance %" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Voting table */}
          <div className="mp-table-card">
            <h3>Voting Record Comparison</h3>
            <div className="mp-table-scroll">
              <table className="mp-comparison-table">
                <thead>
                  <tr>
                    <th>MP</th>
                    <th>Constituency</th>
                    <th>Party</th>
                    <th>Divisions</th>
                    <th>Voted In</th>
                    <th>Attendance</th>
                    <th>Rebellions</th>
                    <th>Rebel Rate</th>
                    <th>Notable Votes</th>
                  </tr>
                </thead>
                <tbody>
                  {mps.map(m => (
                    <tr key={m.id}>
                      <td>
                        <Link to={`/constituency/${m.id}`} className="mp-table-name">{m.mp.name}</Link>
                      </td>
                      <td>{m.name}</td>
                      <td><span className="mp-party-dot" style={{ background: PARTY_COLORS[m.mp.party] || '#888' }} />{m.mp.party_abbreviation || m.mp.party}</td>
                      <td>{m.totalDivisions}</td>
                      <td>{m.totalVotes}</td>
                      <td className={m.attendancePct < 0.7 ? 'mp-table-warning' : ''}>
                        {(m.attendancePct * 100).toFixed(0)}%
                      </td>
                      <td className={m.rebellions > 0 ? 'mp-table-warning' : ''}>
                        {m.rebellions}
                      </td>
                      <td>{(m.rebellionRate * 100).toFixed(1)}%</td>
                      <td>{m.voting_record?.notable_votes_count || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rebellion details — only show for MPs that actually rebel */}
          {mps.some(m => m.rebellions > 0) && (
            <div className="mp-table-card">
              <h3><AlertTriangle size={16} /> Rebel Votes</h3>
              <p className="mp-analysis-note">
                MPs who voted against their party whip. Only displaying confirmed rebellions to avoid false positives.
              </p>
              <div className="mp-rebel-list">
                {mps.filter(m => m.rebellions > 0).map(m => (
                  <div key={m.id} className="mp-rebel-card">
                    <div className="mp-rebel-header">
                      <span className="mp-rebel-name">{m.mp.name}</span>
                      <span className="mp-party-dot" style={{ background: PARTY_COLORS[m.mp.party] || '#888' }} />
                      <span className="mp-rebel-constituency">{m.name}</span>
                      <span className="mp-rebel-count">{m.rebellions} rebellion{m.rebellions !== 1 ? 's' : ''}</span>
                    </div>
                    {m.voting_record?.notable_votes?.filter(v => v.is_rebel).map((v, i) => (
                      <div key={i} className="mp-rebel-vote">
                        <span className="mp-rebel-vote-title">{v.title}</span>
                        <span className="mp-rebel-vote-date">{v.date}</span>
                        <span className={`mp-rebel-vote-position ${v.voted?.toLowerCase()}`}>{v.voted}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================== ANALYSIS TAB ====================== */}
      {activeTab === 'analysis' && (
        <div className="mp-comparison-content">
          {/* Outliers */}
          {outliers.length > 0 && (
            <div className="mp-analysis-card">
              <h3><AlertTriangle size={16} /> Statistical Outliers</h3>
              <p className="mp-analysis-note">
                MPs whose expenses are more than 1.5 standard deviations from the Lancashire average.
                Outlier detection uses z-scores — not all outliers indicate wrongdoing.
                New MPs (elected July 2024) may have higher initial setup costs.
              </p>
              <div className="mp-outlier-list">
                {outliers.map((o, i) => (
                  <div key={i} className={`mp-outlier-card ${o.direction}`}>
                    <div className="mp-outlier-header">
                      <span className="mp-outlier-name">{o.mp}</span>
                      <span className="mp-party-dot" style={{ background: PARTY_COLORS[o.party] || '#888' }} />
                      <span className="mp-outlier-constituency">{o.constituency}</span>
                      {o.direction === 'above' ? <TrendingUp size={14} className="outlier-up" /> : <TrendingDown size={14} className="outlier-down" />}
                    </div>
                    <p className="mp-outlier-note">{o.note}</p>
                    {o.category && <span className="mp-outlier-category">{o.category}</span>}
                    <span className="mp-outlier-zscore">z-score: {o.zScore.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Connected parties */}
          {mps.some(m => m.mp.expenses?.connected_party) && (
            <div className="mp-analysis-card">
              <h3><Users size={16} /> Connected Party Payments</h3>
              <p className="mp-analysis-note">
                MPs who have paid expenses to connected parties (typically family members employed as staff).
                This is permitted under IPSA rules and declared transparently.
              </p>
              <div className="mp-connected-list">
                {mps.filter(m => m.mp.expenses?.connected_party).map(m => (
                  <div key={m.id} className="mp-connected-card">
                    <span className="mp-connected-name">{m.mp.name} ({m.name})</span>
                    <span className="mp-connected-party">{m.mp.expenses.connected_party}</span>
                    {m.mp.expenses.connected_party_job && (
                      <span className="mp-connected-job">{m.mp.expenses.connected_party_job}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lancashire vs national average */}
          <div className="mp-analysis-card">
            <h3><BarChart3 size={16} /> Lancashire vs National</h3>
            <p className="mp-analysis-note">
              Lancashire's {mps.length} MPs compared to the national median (rank out of 650).
            </p>
            <div className="mp-rank-grid">
              {mps.map(m => {
                const rank = m.mp.expenses?.rank_of_650
                const isAboveMedian = rank && rank <= 325
                return (
                  <div key={m.id} className={`mp-rank-card ${isAboveMedian ? 'above-median' : 'below-median'}`}>
                    <span className="mp-rank-name">{m.mp.name}</span>
                    <span className="mp-rank-number">#{rank || '—'} of 650</span>
                    <span className="mp-rank-cost">{formatCurrency(m.totalCost)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <footer className="mp-comparison-footer">
        <p>
          Expenses data: IPSA Annual Publication {constData.meta?.expenses_year || '2024-25'}.
          Voting records: They Work For You / Commons Votes API.
          Updated {constData.meta?.generated?.split('T')[0] || '—'}.
          {' '}Outlier analysis uses z-scores — statistical flags, not allegations.
        </p>
      </footer>
    </div>
  )
}

export default MPComparison
