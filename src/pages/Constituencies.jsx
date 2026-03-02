import { useState, useMemo, Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { LoadingState } from '../components/ui'
import { Users, TrendingUp, TrendingDown, ArrowUpDown, Search, Landmark, ExternalLink, MapPin } from 'lucide-react'
import { PARTY_COLORS } from '../utils/constants'
import './Constituencies.css'

const LancashireMap = lazy(() => import('../components/LancashireMap'))

const SORT_OPTIONS = [
  { value: 'alpha', label: 'A–Z' },
  { value: 'majority', label: 'Majority' },
  { value: 'majority_asc', label: 'Most vulnerable' },
  { value: 'expenses', label: 'Highest expenses' },
  { value: 'attendance', label: 'Attendance %' },
]

// Party filter built dynamically from data — see buildFilterOptions() in component

function Constituencies() {
  const { data: constData, loading, error } = useData('/data/shared/constituencies.json')
  const { data: pollingData } = useData('/data/shared/polling.json')
  const { data: councilBoundaries } = useData('/data/shared/council_boundaries.json')
  const { data: crossCouncilData } = useData('/data/cross_council.json')
  const [mapMode, setMapMode] = useState('politics')
  const [sortBy, setSortBy] = useState('alpha')
  const [filterParty, setFilterParty] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Build filter options dynamically from actual party data
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

  const constituencies = useMemo(() => {
    if (!constData?.constituencies) return []
    let list = [...constData.constituencies]

    // Filter by party
    if (filterParty !== 'all') {
      list = list.filter(c => c.mp?.party === filterParty)
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.mp?.name?.toLowerCase().includes(term)
      )
    }

    // Sort
    switch (sortBy) {
      case 'alpha':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'majority':
        list.sort((a, b) => (b.mp?.majority_pct || 0) - (a.mp?.majority_pct || 0))
        break
      case 'majority_asc':
        list.sort((a, b) => (a.mp?.majority_pct || 0) - (b.mp?.majority_pct || 0))
        break
      case 'expenses':
        list.sort((a, b) => (b.mp?.expenses?.total_cost_to_taxpayer || 0) - (a.mp?.expenses?.total_cost_to_taxpayer || 0))
        break
      case 'attendance':
        list.sort((a, b) => (b.voting_record?.attendance_pct || 0) - (a.voting_record?.attendance_pct || 0))
        break
    }

    return list
  }, [constData, sortBy, filterParty, searchTerm])

  // Compute swing for each constituency from polling data
  const swingData = useMemo(() => {
    if (!pollingData?.swing_from_ge2024) return {}
    return pollingData.swing_from_ge2024
  }, [pollingData])

  if (loading) return <LoadingState />
  if (error || !constData?.constituencies) {
    return (
      <div className="constituencies-page">
        <div className="constituencies-error">
          <Landmark size={48} />
          <h2>Constituency data unavailable</h2>
          <p>Unable to load constituency data. Please try again later.</p>
        </div>
      </div>
    )
  }

  const totalMPs = constData.constituencies.length
  const partyBreakdown = constData.constituencies.reduce((acc, c) => {
    const p = c.mp?.party || 'Unknown'
    acc[p] = (acc[p] || 0) + 1
    return acc
  }, {})

  return (
    <div className="constituencies-page">
      <header className="constituencies-header">
        <div className="constituencies-header-content">
          <div className="constituencies-title-row">
            <Landmark size={32} className="constituencies-icon" />
            <div>
              <h1>Lancashire MPs</h1>
              <p className="constituencies-subtitle">
                {totalMPs} Westminster constituencies covering Lancashire's 15 councils
              </p>
            </div>
          </div>

          <div className="constituencies-summary-bar">
            {Object.entries(partyBreakdown).sort((a, b) => b[1] - a[1]).map(([party, count]) => (
              <span
                key={party}
                className="party-chip"
                style={{ borderColor: PARTY_COLORS[party] || '#888' }}
              >
                <span className="party-chip-dot" style={{ background: PARTY_COLORS[party] || '#888' }} />
                {party}: {count}
              </span>
            ))}
          </div>
        </div>
      </header>

      {councilBoundaries && (
        <section className="premium-map-section">
          <div className="premium-map-header">
            <h2><MapPin size={22} /> Lancashire Political Map</h2>
            <p className="section-intro">{totalMPs} constituencies across 15 council areas. Coloured by political control.</p>
          </div>
          <div className="premium-map-toggles">
            {[
              { value: 'politics', label: 'Political Control' },
              { value: 'tier', label: 'Council Tier' },
              { value: 'spend', label: 'Spend/Head' },
            ].map(m => (
              <button
                key={m.value}
                className={mapMode === m.value ? 'active' : ''}
                onClick={() => setMapMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="premium-map-3d">
            <div className="premium-map-orb premium-map-orb--red" />
            <div className="premium-map-orb premium-map-orb--blue" />
            <div className="premium-map-frame premium-map-frame--lancashire">
              <Suspense fallback={<div className="premium-map-loading">Loading map…</div>}>
                <LancashireMap
                  councilBoundaries={councilBoundaries}
                  councilData={crossCouncilData?.councils || []}
                  colorMode={mapMode}
                  onCouncilClick={() => {}}
                  height="480px"
                />
              </Suspense>
            </div>
          </div>
          <div className="premium-map-legend">
            <div className="premium-map-legend-items">
              {mapMode === 'politics' && (
                <>
                  <span className="premium-map-legend-label">Party Control</span>
                  {Object.entries(partyBreakdown).sort((a, b) => b[1] - a[1]).map(([party]) => (
                    <span key={party} className="premium-map-legend-item">
                      <span className="premium-map-legend-dot" style={{ background: PARTY_COLORS[party] || '#888' }} />
                      {party}
                    </span>
                  ))}
                </>
              )}
              {mapMode === 'tier' && (
                <>
                  <span className="premium-map-legend-label">Council Tier</span>
                  <span className="premium-map-legend-item"><span className="premium-map-legend-dot" style={{ background: '#0a84ff' }} />District</span>
                  <span className="premium-map-legend-item"><span className="premium-map-legend-dot" style={{ background: '#ff9f0a' }} />County</span>
                  <span className="premium-map-legend-item"><span className="premium-map-legend-dot" style={{ background: '#bf5af2' }} />Unitary</span>
                </>
              )}
              {mapMode === 'spend' && (
                <>
                  <span className="premium-map-legend-label">Per-Capita Spend</span>
                  <div className="premium-map-legend-gradient">
                    <div className="premium-map-legend-gradient-bar" style={{ background: 'linear-gradient(to right, rgb(48,209,88), rgb(255,214,10), rgb(255,159,10), rgb(255,69,58))' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#8e8e93' }}>
                      <span>Low</span><span>High</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="constituencies-compare-link">
        <Link to="/constituencies/compare" className="compare-mps-btn">
          <ArrowUpDown size={14} /> Compare All MPs — Expenses, Voting &amp; Analysis
        </Link>
      </div>

      <div className="constituencies-controls">
        <div className="constituencies-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search constituency or MP…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)}>
          {filterOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="constituencies-grid">
        {constituencies.map(c => (
          <ConstituencyCard
            key={c.id}
            constituency={c}
            swingData={swingData}
          />
        ))}
      </div>

      {constituencies.length === 0 && (
        <div className="constituencies-empty">
          <p>No constituencies match your filters.</p>
        </div>
      )}

      <footer className="constituencies-footer">
        <p>
          Data: Parliament Members API, Commons Votes API, IPSA Expenses.
          {constData.meta?.generated && ` Updated ${constData.meta.generated.split('T')[0]}.`}
          {' '}Boundary revision: 2024.
        </p>
      </footer>
    </div>
  )
}

function ConstituencyCard({ constituency: c, swingData }) {
  const mp = c.mp || {}
  const partyColor = PARTY_COLORS[mp.party] || '#888'
  const majorityPct = mp.majority_pct ? (mp.majority_pct * 100).toFixed(1) : '—'
  const expenses = mp.expenses
  const totalCost = expenses?.total_cost_to_taxpayer
  const votingRecord = c.voting_record || {}
  const attendancePct = votingRecord.attendance_pct
    ? (votingRecord.attendance_pct * 100).toFixed(0)
    : '—'

  // Get the leading party swing from GE2024 polling
  const mpPartyKey = mp.party?.replace(' (Co-op)', '')
  const swing = swingData[mpPartyKey]
  const swingPct = swing != null ? (swing * 100).toFixed(1) : null

  return (
    <Link to={`/constituency/${c.id}`} className="constituency-card">
      <div className="constituency-card-accent" style={{ background: partyColor }} />

      <div className="constituency-card-header">
        {mp.photo_url && (
          <img
            src={mp.photo_url}
            alt={mp.name}
            className="constituency-card-photo"
            loading="lazy"
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
        <div className="constituency-card-info">
          <h3 className="constituency-card-name">{c.name}</h3>
          <p className="constituency-card-mp">{mp.name || 'Vacant'}</p>
          <span
            className="constituency-card-party"
            style={{ color: partyColor }}
          >
            {mp.party || '—'}
          </span>
        </div>
      </div>

      <div className="constituency-card-stats">
        <div className="constituency-card-stat">
          <span className="stat-label">Majority</span>
          <span className="stat-value">{majorityPct}%</span>
        </div>
        <div className="constituency-card-stat">
          <span className="stat-label">Attendance</span>
          <span className="stat-value">{attendancePct}%</span>
        </div>
        {totalCost && (
          <div className="constituency-card-stat">
            <span className="stat-label">Cost</span>
            <span className="stat-value">£{Math.round(totalCost / 1000)}k</span>
          </div>
        )}
        {swingPct && (
          <div className="constituency-card-stat">
            <span className="stat-label">Swing</span>
            <span className={`stat-value ${swing > 0 ? 'swing-positive' : 'swing-negative'}`}>
              {swing > 0 ? '+' : ''}{swingPct}pp
            </span>
          </div>
        )}
      </div>

      {c.partial && (
        <div className="constituency-card-badge">Cross-border</div>
      )}

      {Array.isArray(c.claimant_count) && c.claimant_count.length > 0 && (() => {
        const latest = [...c.claimant_count].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
        return latest?.claimant_rate_pct != null ? (
          <div className="constituency-card-claimant">
            <span>Claimant rate: {latest.claimant_rate_pct}%</span>
          </div>
        ) : null
      })()}
    </Link>
  )
}

export default Constituencies
