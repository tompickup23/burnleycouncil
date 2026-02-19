import { useState, useEffect } from 'react'
import { Search, User, Mail, Phone, MapPin } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './Politics.css'

function Politics() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data, loading, error } = useData([
    '/data/councillors.json',
    '/data/politics_summary.json',
    '/data/wards.json',
  ])
  const [councillors, summary, _wards] = data || [[], null, {}]
  const [search, setSearch] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [selectedCouncillor, setSelectedCouncillor] = useState(null)

  useEffect(() => {
    document.title = `Council Politics | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  if (loading) {
    return <LoadingState message="Loading councillor data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  // Filter councillors
  const filteredCouncillors = councillors.filter(c => {
    const matchesSearch = !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.ward?.toLowerCase().includes(search.toLowerCase())
    const matchesParty = !partyFilter || c.party === partyFilter
    return matchesSearch && matchesParty
  })

  // Group by party for seat diagram
  const seatsByParty = summary?.by_party || []

  return (
    <div className="politics-page animate-fade-in">
      <header className="page-header" aria-label="Council politics overview">
        <h1>Council Politics</h1>
        <p className="subtitle">
          {councillors.length} councillors representing {summary?.total_wards || ''} wards across {councilName}
        </p>
      </header>

      {/* Council Composition — data-driven from politics_summary.json */}
      {summary?.coalition && (
        <section className="composition-section">
          <h2>Council Composition</h2>
          <div className="composition-grid">
            <div className="composition-card coalition">
              <h3>{summary.coalition.type === 'majority' ? 'Ruling Party' : 'Ruling Coalition'}</h3>
              <div className="coalition-makeup">
                <span className="coalition-total">{summary.coalition.total_seats}</span>
                <span className="coalition-label">seats</span>
              </div>
              <div className="coalition-parties">
                {(summary.coalition.parties || []).map(partyName => {
                  const partyData = seatsByParty.find(p => p.party === partyName)
                  if (!partyData) return null
                  const isLight = partyData.color?.toLowerCase() === '#faa61a' || partyData.color?.toLowerCase() === '#ffd60a'
                  return (
                    <span key={partyName} className="party-chip" style={{ background: partyData.color, color: isLight ? '#000' : undefined }}>
                      {partyName} {partyData.count}
                    </span>
                  )
                })}
              </div>
              <p className="coalition-note text-secondary">
                Majority threshold: {summary.majority_threshold || Math.floor((summary.total_councillors || 0) / 2) + 1} seats
              </p>
            </div>

            <div className="composition-card">
              <h3>Opposition</h3>
              <div className="opposition-makeup">
                <span className="opposition-total">{summary.opposition_seats}</span>
                <span className="opposition-label">seats</span>
              </div>
              <div className="opposition-parties">
                {seatsByParty
                  .filter(p => !(summary.coalition.parties || []).includes(p.party))
                  .map(partyData => {
                    const isLight = partyData.color?.toLowerCase() === '#faa61a' || partyData.color?.toLowerCase() === '#ffd60a'
                    return (
                      <span key={partyData.party} className="party-chip" style={{ background: partyData.color, color: isLight ? '#000' : undefined }}>
                        {partyData.party} {partyData.count}
                      </span>
                    )
                  })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Seat Diagram */}
      <section className="seats-section">
        <h2>Seat Diagram</h2>
        <div className="seats-diagram">
          {seatsByParty.map(party => (
            <div key={party.party} className="party-seats">
              <div className="seats-row">
                {Array.from({ length: party.count }).map((_, i) => (
                  <div
                    key={i}
                    className="seat"
                    style={{ background: party.color }}
                    title={party.party}
                  />
                ))}
              </div>
              <span className="party-label" style={{ color: party.color }}>
                {party.party} ({party.count})
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Key Figures */}
      <section className="key-figures">
        <h2>Key Figures</h2>
        <div className="figures-grid">
          {summary?.council_leader && (
            <div className="figure-card">
              <span className="figure-role">Leader of the Council</span>
              <span className="figure-name">{summary.council_leader}</span>
            </div>
          )}
          {summary?.deputy_leaders?.length > 0 && summary.deputy_leaders.map((dl, i) => (
            <div key={i} className="figure-card">
              <span className="figure-role">Deputy Leader</span>
              <span className="figure-name">{dl}</span>
            </div>
          ))}
          {summary?.mayor && (
            <div className="figure-card">
              <span className="figure-role">Mayor</span>
              <span className="figure-name">{summary.mayor}</span>
            </div>
          )}
          {summary?.deputy_mayor && (
            <div className="figure-card">
              <span className="figure-role">Deputy Mayor</span>
              <span className="figure-name">{summary.deputy_mayor}</span>
            </div>
          )}
          {summary?.opposition_leader && (
            <div className="figure-card">
              <span className="figure-role">Opposition Leader</span>
              <span className="figure-name">{summary.opposition_leader}</span>
            </div>
          )}
        </div>
      </section>

      {/* Councillor Directory */}
      <section className="directory-section">
        <h2>All Councillors</h2>

        <div className="directory-filters">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name or ward..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search councillors by name or ward"
            />
          </div>

          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            aria-label="Filter by political party"
          >
            <option value="">All Parties</option>
            {seatsByParty.map(p => (
              <option key={p.party} value={p.party}>{p.party}</option>
            ))}
          </select>
        </div>

        <div className="councillors-grid">
          {filteredCouncillors.map(councillor => (
            <div
              key={councillor.id}
              className="councillor-card"
              role="button"
              tabIndex={0}
              aria-expanded={selectedCouncillor?.id === councillor.id}
              onClick={() => setSelectedCouncillor(selectedCouncillor?.id === councillor.id ? null : councillor)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCouncillor(selectedCouncillor?.id === councillor.id ? null : councillor) } }}
            >
              <div className="councillor-header">
                <div
                  className="party-indicator"
                  style={{ background: councillor.party_color }}
                />
                <div className="councillor-info">
                  <h3>{councillor.name}</h3>
                  <span className="ward-name">{councillor.ward}</span>
                </div>
              </div>

              <div className="councillor-party">
                <span className="party-tag" style={{ background: councillor.party_color + '30', color: councillor.party_color }}>
                  {councillor.party}
                </span>
              </div>

              {councillor.roles?.length > 0 && (
                <div className="councillor-roles">
                  {councillor.roles.map((role, i) => (
                    <span key={i} className="role-tag">{role}</span>
                  ))}
                </div>
              )}

              {selectedCouncillor?.id === councillor.id && (
                <div className="councillor-details">
                  {councillor.email && (
                    <a href={`mailto:${councillor.email}`} className="detail-link">
                      <Mail size={14} />
                      {councillor.email}
                    </a>
                  )}
                  {councillor.phone && (
                    <a href={`tel:${councillor.phone}`} className="detail-link">
                      <Phone size={14} />
                      {councillor.phone}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredCouncillors.length === 0 && (
          <p className="no-results">No councillors found matching your search.</p>
        )}
      </section>
    </div>
  )
}

export default Politics
