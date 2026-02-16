import { useState, useMemo, useEffect } from 'react'
import { Search, Shield, ShieldAlert, ShieldCheck, ShieldX, Building2, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Eye, Users, Fingerprint, Scale, Info, Network, Heart, Landmark, Banknote, Globe, Home } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { formatCurrency } from '../utils/format'
import './Integrity.css'

const RISK_CONFIG = {
  low: { label: 'Low Risk', color: '#30d158', icon: ShieldCheck, bg: 'rgba(48, 209, 88, 0.1)' },
  medium: { label: 'Medium', color: '#ffd60a', icon: Shield, bg: 'rgba(255, 214, 10, 0.1)' },
  elevated: { label: 'Elevated', color: '#ff9f0a', icon: ShieldAlert, bg: 'rgba(255, 159, 10, 0.1)' },
  high: { label: 'High Risk', color: '#ff453a', icon: ShieldX, bg: 'rgba(255, 69, 58, 0.1)' },
  not_checked: { label: 'Pending', color: '#8e8e93', icon: Shield, bg: 'rgba(142, 142, 147, 0.1)' },
}

const SEVERITY_COLORS = {
  critical: '#ff453a',
  high: '#ff6b35',
  warning: '#ffd60a',
  info: '#0a84ff',
}

function Integrity() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data, loading, error } = useData([
    '/data/integrity.json',
    '/data/councillors.json',
    '/data/insights.json',
  ])
  const [integrity, councillorsFull, insights] = data || [null, [], null]
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [sortBy, setSortBy] = useState('risk') // risk, name, directorships

  useEffect(() => {
    document.title = `Councillor Integrity | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Merge integrity data with full councillor data for richer display
  const councillors = useMemo(() => {
    if (!integrity?.councillors) return []
    const fullMap = new Map()
    if (Array.isArray(councillorsFull)) {
      councillorsFull.forEach(c => fullMap.set(c.id, c))
    }
    return integrity.councillors.map(c => ({
      ...c,
      // Merge in full councillor data (email, phone, roles, party_color)
      ...(fullMap.get(c.councillor_id) || {}),
      // Keep integrity fields (v2)
      integrity_score: c.integrity_score,
      risk_level: c.risk_level,
      companies_house: c.companies_house,
      co_director_network: c.co_director_network,
      disqualification_check: c.disqualification_check,
      electoral_commission: c.electoral_commission,
      fca_register: c.fca_register,
      familial_connections: c.familial_connections,
      supplier_conflicts: c.supplier_conflicts,
      cross_council_conflicts: c.cross_council_conflicts,
      misconduct_patterns: c.misconduct_patterns,
      network_investigation: c.network_investigation,
      red_flags: c.red_flags,
      checked_at: c.checked_at,
      data_sources_checked: c.data_sources_checked,
    }))
  }, [integrity, councillorsFull])

  // Get unique parties for filter
  const parties = useMemo(() => {
    const set = new Set(councillors.map(c => c.party).filter(Boolean))
    return [...set].sort()
  }, [councillors])

  // Filter and sort
  const filtered = useMemo(() => {
    let list = councillors.filter(c => {
      const matchesSearch = !search ||
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.ward?.toLowerCase().includes(search.toLowerCase())
      const matchesRisk = !riskFilter || c.risk_level === riskFilter
      const matchesParty = !partyFilter || c.party === partyFilter
      return matchesSearch && matchesRisk && matchesParty
    })

    // Sort
    if (sortBy === 'risk') {
      const riskOrder = { high: 0, elevated: 1, medium: 2, low: 3, not_checked: 4 }
      list.sort((a, b) => (riskOrder[a.risk_level] ?? 5) - (riskOrder[b.risk_level] ?? 5))
    } else if (sortBy === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sortBy === 'directorships') {
      list.sort((a, b) => (b.companies_house?.total_directorships || 0) - (a.companies_house?.total_directorships || 0))
    }

    return list
  }, [councillors, search, riskFilter, partyFilter, sortBy])

  // Summary stats
  const stats = useMemo(() => {
    if (!integrity?.summary) return null
    const s = integrity.summary
    // Count councillors that need network investigation
    const networkCandidates = councillors.filter(c => {
      const ch = c.companies_house || {}
      // Flag for network investigation if: 3+ active directorships, or supplier conflict, or high risk
      return ch.active_directorships >= 3 ||
        (c.supplier_conflicts?.length || 0) > 0 ||
        c.risk_level === 'high' ||
        c.risk_level === 'elevated'
    })
    return {
      ...s,
      networkInvestigationCandidates: networkCandidates.length,
      networkCandidateNames: networkCandidates.map(c => c.name)
    }
  }, [integrity, councillors])

  // Determine if scan has been run
  const scanComplete = integrity?.councillors_checked > 0

  if (loading) return <LoadingState message="Loading integrity data..." />
  if (error) return (
    <div className="page-error">
      <h2>Unable to load integrity data</h2>
      <p>Please try refreshing the page.</p>
    </div>
  )

  return (
    <div className="integrity-page animate-fade-in">
      <header className="page-header">
        <div className="integrity-title-row">
          <Fingerprint size={32} className="integrity-icon" />
          <div>
            <h1>Councillor Integrity Checker</h1>
            <p className="subtitle">
              Cross-referencing {councillors.length} councillors against 8+ public data sources
              including Companies House, Electoral Commission, FCA Register, and council spending data
            </p>
          </div>
        </div>
      </header>

      {/* Methodology Banner */}
      <section className="methodology-banner">
        <Info size={18} />
        <div>
          <strong>Multi-source forensic investigation:</strong> Each councillor is checked against{' '}
          <a href="https://find-and-update.company-information.service.gov.uk/" target="_blank" rel="noopener noreferrer">
            Companies House
          </a>{' '}
          (directorships, PSC register, disqualifications), co-director network mapping,
          Electoral Commission donations, FCA prohibition orders, and cross-council supplier matching.
          Familial connections are detected through surname clustering and shared-address analysis.
          Seven misconduct pattern algorithms flag phoenix companies, contract steering, dormant
          company payments, and rapid company turnover.
        </div>
      </section>

      {/* Summary Dashboard */}
      {stats && (
        <section className="integrity-dashboard">
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <span className="dashboard-number">{integrity.total_councillors}</span>
              <span className="dashboard-label">Councillors</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-number">{stats.total_directorships_found}</span>
              <span className="dashboard-label">Directorships Found</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-number">{stats.active_directorships}</span>
              <span className="dashboard-label">Active Directorships</span>
            </div>
            <div className="dashboard-card accent-warning">
              <span className="dashboard-number">{stats.red_flags_total}</span>
              <span className="dashboard-label">Red Flags</span>
            </div>
            <div className="dashboard-card accent-critical">
              <span className="dashboard-number">{stats.supplier_conflicts + (stats.cross_council_conflicts || 0)}</span>
              <span className="dashboard-label">Supplier Conflicts</span>
            </div>
            <div className="dashboard-card accent-critical">
              <span className="dashboard-number">{stats.disqualification_matches}</span>
              <span className="dashboard-label">Disqualification Matches</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-number">{stats.misconduct_patterns || 0}</span>
              <span className="dashboard-label">Misconduct Patterns</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-number">{stats.co_directors_mapped || 0}</span>
              <span className="dashboard-label">Co-Directors Mapped</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-number">{stats.family_connections_found || 0}</span>
              <span className="dashboard-label">Family Connections</span>
            </div>
          </div>

          {/* Data Sources */}
          {integrity.data_sources?.length > 0 && (
            <div className="data-sources-list">
              <h4>Data Sources Checked</h4>
              <div className="source-tags">
                {integrity.data_sources.map((source, i) => (
                  <span key={i} className="source-tag">{source}</span>
                ))}
              </div>
            </div>
          )}

          {/* Risk Distribution */}
          <div className="risk-distribution">
            <h3>Risk Distribution</h3>
            <div className="risk-bars">
              {Object.entries(stats.risk_distribution || {}).map(([level, count]) => {
                const cfg = RISK_CONFIG[level] || RISK_CONFIG.not_checked
                const pct = councillors.length > 0 ? (count / councillors.length * 100) : 0
                return (
                  <div key={level} className="risk-bar-row">
                    <span className="risk-bar-label" style={{ color: cfg.color }}>{cfg.label}</span>
                    <div className="risk-bar-track">
                      <div
                        className="risk-bar-fill"
                        style={{ width: `${pct}%`, background: cfg.color }}
                      />
                    </div>
                    <span className="risk-bar-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Network Investigation Advisory */}
          {stats.networkInvestigationCandidates > 0 && (
            <div className="network-advisory">
              <div className="network-advisory-header">
                <Users size={20} />
                <h3>Network Investigation Advisable</h3>
              </div>
              <p>
                <strong>{stats.networkInvestigationCandidates} councillor{stats.networkInvestigationCandidates !== 1 ? 's' : ''}</strong> flagged
                for deeper associate network analysis based on: 3+ active directorships, supplier conflicts,
                or elevated/high risk profile.
              </p>
              <div className="network-candidates">
                {stats.networkCandidateNames.map(name => (
                  <span key={name} className="network-candidate-chip">{name}</span>
                ))}
              </div>
              <p className="network-note">
                A network investigation traces all co-directors of each company, maps their other companies,
                and identifies hidden connections to council spending, insolvency practitioners, or shell company networks.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Scan Status */}
      {!scanComplete && (
        <div className="scan-pending-banner">
          <Shield size={20} />
          <div>
            <strong>Companies House scan pending</strong>
            <p>
              This council has {councillors.length} councillors awaiting integrity verification.
              The scan queries Companies House for each councillor and typically takes 2-3 minutes per council.
              Run <code>councillor_integrity_etl.py --council {config.council_id}</code> to populate this data.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <section className="integrity-filters">
        <div className="filter-row">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name or ward..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search councillors"
            />
          </div>

          <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} aria-label="Filter by risk level">
            <option value="">All Risk Levels</option>
            <option value="high">High Risk</option>
            <option value="elevated">Elevated</option>
            <option value="medium">Medium</option>
            <option value="low">Low Risk</option>
            <option value="not_checked">Pending</option>
          </select>

          <select value={partyFilter} onChange={e => setPartyFilter(e.target.value)} aria-label="Filter by party">
            <option value="">All Parties</option>
            {parties.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort by">
            <option value="risk">Sort: Highest Risk</option>
            <option value="directorships">Sort: Most Directorships</option>
            <option value="name">Sort: A-Z</option>
          </select>
        </div>
        <p className="filter-count">{filtered.length} of {councillors.length} councillors</p>
      </section>

      {/* Surname Clusters & Shared Addresses */}
      {scanComplete && (integrity.surname_clusters?.length > 0 || integrity.shared_address_councillors?.length > 0) && (
        <section className="familial-overview">
          <h3><Heart size={18} /> Familial Connection Analysis</h3>
          <p className="familial-desc">
            Under the Localism Act 2011, family members' financial interests are Disclosable
            Pecuniary Interests (DPIs). Failure to declare can be a criminal offence (s.34).
          </p>
          <div className="familial-grid">
            {integrity.surname_clusters?.map((cluster, i) => (
              <div key={i} className={`familial-card ${cluster.severity}`}>
                <div className="familial-card-header">
                  <Home size={16} />
                  <strong>{cluster.surname}</strong>
                  <span className="familial-count">{cluster.count} councillors</span>
                </div>
                <div className="familial-members">
                  {cluster.members.map((m, j) => (
                    <div key={j} className="familial-member">
                      <span>{m.name}</span>
                      <span className="familial-meta">{m.party} · {m.ward}</span>
                    </div>
                  ))}
                </div>
                <div className="familial-flags">
                  {cluster.shared_address && <span className="familial-flag critical">Same Address</span>}
                  {cluster.same_ward && <span className="familial-flag warning">Same Ward</span>}
                  {cluster.same_party && <span className="familial-flag info">Same Party</span>}
                </div>
              </div>
            ))}
            {integrity.shared_address_councillors?.map((shared, i) => (
              <div key={`addr-${i}`} className="familial-card high">
                <div className="familial-card-header">
                  <Home size={16} />
                  <strong>Shared Address</strong>
                  <span className="familial-count">{shared.count} councillors</span>
                </div>
                <div className="familial-members">
                  {shared.members.map((m, j) => (
                    <div key={j} className="familial-member">
                      <span>{m.name}</span>
                      <span className="familial-meta">{m.party} · {m.ward}</span>
                    </div>
                  ))}
                </div>
                <p className="familial-note">{shared.note}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Councillor Cards */}
      <section className="integrity-grid">
        {filtered.map(councillor => {
          const riskCfg = RISK_CONFIG[councillor.risk_level] || RISK_CONFIG.not_checked
          const RiskIcon = riskCfg.icon
          const ch = councillor.companies_house || {}
          const isExpanded = expandedId === councillor.councillor_id
          const hasFlags = (councillor.red_flags?.length || 0) > 0
          const hasConflicts = (councillor.supplier_conflicts?.length || 0) > 0
          const hasCrossCouncil = (councillor.cross_council_conflicts?.length || 0) > 0
          const hasMisconduct = (councillor.misconduct_patterns?.length || 0) > 0
          const hasFamilyConflict = councillor.familial_connections?.has_family_supplier_conflict
          const needsNetworkInvestigation = councillor.network_investigation?.advisable || ch.active_directorships >= 3 || hasConflicts || councillor.risk_level === 'high' || councillor.risk_level === 'elevated'
          const networkPriority = councillor.network_investigation?.priority || (needsNetworkInvestigation ? 'medium' : 'none')
          const networkReasons = councillor.network_investigation?.reasons || []

          return (
            <div
              key={councillor.councillor_id}
              className={`integrity-card ${hasFlags ? 'has-flags' : ''} ${hasConflicts ? 'has-conflicts' : ''}`}
              style={{ borderColor: hasFlags ? riskCfg.color + '40' : undefined }}
            >
              <div
                className="integrity-card-header"
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => setExpandedId(isExpanded ? null : councillor.councillor_id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(isExpanded ? null : councillor.councillor_id) } }}
              >
                <div className="integrity-name-block">
                  <div className="party-indicator" style={{ background: councillor.party_color || '#666' }} />
                  <div>
                    <h3>{councillor.name}</h3>
                    <span className="integrity-ward">{councillor.ward}</span>
                  </div>
                </div>

                <div className="integrity-meta">
                  {councillor.party && (
                    <span className="party-tag-sm" style={{ color: councillor.party_color, background: (councillor.party_color || '#666') + '20' }}>
                      {councillor.party}
                    </span>
                  )}
                  <div className="integrity-badges">
                    {ch.active_directorships > 0 && (
                      <span className="badge-directorships" title={`${ch.active_directorships} active directorships`}>
                        <Building2 size={12} />
                        {ch.active_directorships}
                      </span>
                    )}
                    {hasConflicts && (
                      <span className="badge-conflict" title="Potential supplier conflict">
                        <AlertTriangle size={12} />
                        Conflict
                      </span>
                    )}
                    {hasCrossCouncil && (
                      <span className="badge-cross-council" title="Cross-council conflict">
                        <Globe size={12} />
                        Cross-Council
                      </span>
                    )}
                    {hasMisconduct && (
                      <span className="badge-misconduct" title="Misconduct pattern detected">
                        <ShieldAlert size={12} />
                        Misconduct
                      </span>
                    )}
                    {hasFamilyConflict && (
                      <span className="badge-family" title="Family member supplier conflict">
                        <Heart size={12} />
                        Family
                      </span>
                    )}
                    {needsNetworkInvestigation && (
                      <span className="badge-network" title="Network investigation advisable">
                        <Users size={12} />
                        Network
                      </span>
                    )}
                  </div>
                  <div className="risk-badge" style={{ color: riskCfg.color, background: riskCfg.bg }}>
                    <RiskIcon size={14} />
                    {riskCfg.label}
                  </div>
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="integrity-detail">
                  {/* Integrity Score */}
                  {councillor.integrity_score !== null && (
                    <div className="score-section">
                      <div className="score-visual">
                        <svg viewBox="0 0 36 36" className="score-ring">
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="3"
                          />
                          <path
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke={riskCfg.color}
                            strokeWidth="3"
                            strokeDasharray={`${councillor.integrity_score}, 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <span className="score-number" style={{ color: riskCfg.color }}>{councillor.integrity_score}</span>
                      </div>
                      <div className="score-info">
                        <span className="score-title">Integrity Score</span>
                        <span className="score-desc">
                          Based on {ch.total_directorships} directorship{ch.total_directorships !== 1 ? 's' : ''},{' '}
                          {councillor.red_flags?.length || 0} red flag{(councillor.red_flags?.length || 0) !== 1 ? 's' : ''},{' '}
                          {councillor.supplier_conflicts?.length || 0} supplier conflict{(councillor.supplier_conflicts?.length || 0) !== 1 ? 's' : ''},
                          {councillor.misconduct_patterns?.length ? ` ${councillor.misconduct_patterns.length} misconduct pattern${councillor.misconduct_patterns.length !== 1 ? 's' : ''},` : ''}
                          {' '}checked across {councillor.data_sources_checked?.length || 1} data source{(councillor.data_sources_checked?.length || 1) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Network Investigation Advisory */}
                  {needsNetworkInvestigation && (
                    <div className={`network-investigation-flag ${networkPriority === 'high' ? 'priority-high' : ''}`}>
                      <Users size={16} />
                      <div>
                        <strong>
                          Network investigation advisable
                          {networkPriority === 'high' && <span className="priority-badge">HIGH PRIORITY</span>}
                        </strong>
                        {networkReasons.length > 0 ? (
                          <ul className="network-reasons">
                            {networkReasons.map((reason, i) => (
                              <li key={i}>{reason}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            This councillor has {ch.active_directorships} active directorship{ch.active_directorships !== 1 ? 's' : ''}
                            {hasConflicts ? ', supplier conflict matches' : ''}
                            {councillor.risk_level === 'high' ? ', and a high risk profile' : ''}.
                          </p>
                        )}
                        <p className="network-methodology">
                          A network investigation traces all co-directors of each company, maps their
                          other directorships, checks insolvency records and the Gazette, and identifies
                          hidden connections to council spending or shell company networks.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Companies */}
                  {ch.companies?.length > 0 && (
                    <div className="companies-section">
                      <h4><Building2 size={16} /> Company Directorships ({ch.companies.length})</h4>
                      <div className="companies-list">
                        {ch.companies.map((company, i) => (
                          <div key={i} className={`company-row ${company.resigned_on ? 'resigned' : 'active'}`}>
                            <div className="company-info">
                              <span className="company-name">{company.company_name}</span>
                              <span className="company-meta">
                                {company.role} · {company.resigned_on ? `Resigned ${company.resigned_on}` : 'Active'}
                                {company.company_status ? ` · ${company.company_status}` : ''}
                              </span>
                            </div>
                            <div className="company-actions">
                              {company.red_flags?.length > 0 && (
                                <span className="flag-count" title={company.red_flags.map(f => f.detail).join('\n')}>
                                  <AlertTriangle size={12} />
                                  {company.red_flags.length}
                                </span>
                              )}
                              {company.supplier_match && (
                                <span className="supplier-match-tag">
                                  <Scale size={12} />
                                  Supplier Match
                                </span>
                              )}
                              {company.companies_house_url && (
                                <a href={company.companies_house_url} target="_blank" rel="noopener noreferrer"
                                   className="ch-link" title="View on Companies House">
                                  <ExternalLink size={12} />
                                  CH
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Red Flags */}
                  {councillor.red_flags?.length > 0 && (
                    <div className="flags-section">
                      <h4><AlertTriangle size={16} /> Red Flags ({councillor.red_flags.length})</h4>
                      <div className="flags-list">
                        {councillor.red_flags.map((flag, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[flag.severity] || '#666' }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[flag.severity] }}>
                              {flag.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{flag.detail}</span>
                            {flag.company && <span className="flag-company">{flag.company}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Supplier Conflicts */}
                  {councillor.supplier_conflicts?.length > 0 && (
                    <div className="conflicts-section">
                      <h4><Scale size={16} /> Potential Conflicts of Interest</h4>
                      <div className="conflicts-list">
                        {councillor.supplier_conflicts.map((conflict, i) => (
                          <div key={i} className="conflict-row">
                            <span className="conflict-company">{conflict.company_name}</span>
                            <span className="conflict-arrow">→</span>
                            <span className="conflict-supplier">{conflict.supplier_match?.supplier}</span>
                            <span className="conflict-confidence">
                              {conflict.supplier_match?.confidence}% match
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-Council Conflicts */}
                  {councillor.cross_council_conflicts?.length > 0 && (
                    <div className="conflicts-section cross-council">
                      <h4><Globe size={16} /> Cross-Council Conflicts ({councillor.cross_council_conflicts.length})</h4>
                      <div className="conflicts-list">
                        {councillor.cross_council_conflicts.map((conflict, i) => (
                          <div key={i} className="conflict-row">
                            <span className="conflict-company">{conflict.company_name}</span>
                            <span className="conflict-arrow">→</span>
                            <span className="conflict-supplier">{conflict.supplier_match?.supplier}</span>
                            <span className="conflict-council-tag">{conflict.other_council}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Co-Director Network */}
                  {councillor.co_director_network?.associates?.length > 0 && (
                    <div className="network-section">
                      <h4><Network size={16} /> Co-Director Network ({councillor.co_director_network.total_unique_associates} associates)</h4>
                      <div className="network-list">
                        {councillor.co_director_network.associates.slice(0, 10).map((assoc, i) => (
                          <div key={i} className="network-row">
                            <span className="network-name">{assoc.name}</span>
                            <span className="network-shared">
                              {assoc.shared_company_count} shared {assoc.shared_company_count === 1 ? 'company' : 'companies'}
                            </span>
                            <span className="network-roles">{assoc.roles?.join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Misconduct Patterns */}
                  {councillor.misconduct_patterns?.length > 0 && (
                    <div className="misconduct-section">
                      <h4><ShieldAlert size={16} /> Misconduct Patterns ({councillor.misconduct_patterns.length})</h4>
                      <div className="flags-list">
                        {councillor.misconduct_patterns.map((pattern, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[pattern.severity] || '#666' }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[pattern.severity] }}>
                              {pattern.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{pattern.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Familial Connections */}
                  {councillor.familial_connections?.family_member_companies?.length > 0 && (
                    <div className="familial-section">
                      <h4><Heart size={16} /> Familial Connections</h4>
                      {councillor.familial_connections.has_family_supplier_conflict && (
                        <div className="family-alert">
                          <AlertTriangle size={14} />
                          <strong>Family member's company is a council supplier — potential undeclared DPI</strong>
                        </div>
                      )}
                      <div className="family-members-list">
                        {councillor.familial_connections.family_member_companies.map((fm, i) => (
                          <div key={i} className={`family-member-card ${fm.has_supplier_conflict ? 'conflict' : ''}`}>
                            <div className="family-member-header">
                              <span className="family-name">{fm.family_member_name}</span>
                              <span className="family-relationship">{fm.relationship}</span>
                            </div>
                            <span className="family-companies">
                              {fm.active_companies} active {fm.active_companies === 1 ? 'company' : 'companies'}
                            </span>
                            {fm.supplier_conflicts?.length > 0 && (
                              <div className="family-supplier-conflicts">
                                {fm.supplier_conflicts.map((sc, j) => (
                                  <span key={j} className="supplier-match-tag">
                                    <Scale size={12} />
                                    {sc.company_name} matches supplier "{sc.supplier_match?.supplier}"
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Electoral Commission */}
                  {councillor.electoral_commission?.findings?.length > 0 && (
                    <div className="ec-section">
                      <h4><Landmark size={16} /> Electoral Commission Findings</h4>
                      <div className="flags-list">
                        {councillor.electoral_commission.findings.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: finding.type?.includes('supplier') ? SEVERITY_COLORS.high : SEVERITY_COLORS.info }}>
                            <span className="flag-detail">{finding.detail}</span>
                            {finding.value && <span className="ec-value">{formatCurrency(finding.value)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* FCA Register */}
                  {councillor.fca_register?.findings?.length > 0 && (
                    <div className="fca-section">
                      <h4><Banknote size={16} /> FCA Register Findings</h4>
                      <div className="flags-list">
                        {councillor.fca_register.findings.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.info }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.info }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disqualification Check */}
                  {councillor.disqualification_check?.matches?.length > 0 && (
                    <div className="disqualification-section">
                      <h4><ShieldX size={16} /> Disqualification Register Matches</h4>
                      {councillor.disqualification_check.matches.map((match, i) => (
                        <div key={i} className="disqualification-match">
                          <span className="dq-name">{match.name}</span>
                          <span className="dq-score">{match.match_score}% name match</span>
                          {match.snippet && <p className="dq-snippet">{match.snippet}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No Issues */}
                  {!hasFlags && !hasConflicts && ch.total_directorships === 0 && councillor.checked_at && (
                    <div className="clean-check">
                      <ShieldCheck size={20} />
                      <span>No directorships, conflicts or red flags found. Last checked: {new Date(councillor.checked_at).toLocaleDateString()}</span>
                    </div>
                  )}

                  {/* Not checked yet */}
                  {!councillor.checked_at && (
                    <div className="pending-check">
                      <Eye size={16} />
                      <span>Companies House check pending — run the integrity ETL to populate this data.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>

      {filtered.length === 0 && (
        <p className="no-results">No councillors match your filters.</p>
      )}

      {/* Legal Disclaimer */}
      <section className="integrity-disclaimer">
        <p>
          <strong>Important:</strong> This tool uses publicly available data from Companies House, the Electoral
          Commission, the FCA Register, and council spending records. Name matching is probabilistic and may
          produce false positives — a match does not imply wrongdoing. Councillors may legitimately hold company
          directorships and family members may have legitimate business interests. Surname matches across
          councils may be coincidental. The integrity score is algorithmic and should be interpreted alongside
          the council's formal Register of Members' Interests. This tool is provided for transparency purposes
          under the{' '}
          <a href="https://www.legislation.gov.uk/ukpga/2011/20/contents/enacted" target="_blank" rel="noopener noreferrer">
            Localism Act 2011
          </a>{' '}
          and the principle of open government.
        </p>
      </section>
    </div>
  )
}

export default Integrity
