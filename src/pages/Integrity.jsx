import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Shield, ShieldAlert, ShieldCheck, ShieldX, Building2, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Eye, Users, Fingerprint, Scale, Info, Network, Heart, Landmark, Banknote, Globe, Home, FileText, PoundSterling } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import CouncillorLink from '../components/CouncillorLink'
import { formatCurrency, slugify } from '../utils/format'
import { SEVERITY_COLORS } from '../utils/constants'
import './Integrity.css'

const RISK_CONFIG = {
  low: { label: 'Low Risk', color: '#30d158', icon: ShieldCheck, bg: 'rgba(48, 209, 88, 0.1)' },
  medium: { label: 'Medium', color: '#ffd60a', icon: Shield, bg: 'rgba(255, 214, 10, 0.1)' },
  elevated: { label: 'Elevated', color: '#ff9f0a', icon: ShieldAlert, bg: 'rgba(255, 159, 10, 0.1)' },
  high: { label: 'High Risk', color: '#ff453a', icon: ShieldX, bg: 'rgba(255, 69, 58, 0.1)' },
  not_checked: { label: 'Pending', color: '#8e8e93', icon: Shield, bg: 'rgba(142, 142, 147, 0.1)' },
}

// Build a human-readable narrative for a direct supplier conflict
function buildConnectionNarrative(councillor, conflict, ch) {
  const companyName = conflict.company_name || 'a company'
  const supplierName = conflict.supplier_match?.supplier || 'a council supplier'
  const totalSpend = conflict.supplier_match?.total_spend
  const confidence = conflict.supplier_match?.confidence || 0
  const companyInfo = ch.companies?.find(c => c.company_number === conflict.company_number)
  const isActive = companyInfo && !companyInfo.resigned_on
  const companyStatus = companyInfo?.company_status || ''
  const role = companyInfo?.role || 'officer'

  let narrative = `Cllr ${councillor.name} (${councillor.party || 'Independent'}, ${councillor.ward || 'ward unknown'})`

  if (isActive) {
    narrative += ` is currently a ${role} of ${companyName}`
  } else if (companyInfo?.resigned_on) {
    narrative += ` was formerly a ${role} of ${companyName} (resigned ${companyInfo.resigned_on})`
  } else {
    narrative += ` is linked to ${companyName}`
  }

  if (companyStatus && companyStatus !== 'active') {
    narrative += ` (company status: ${companyStatus})`
  }

  narrative += `. This company matches council supplier "${supplierName}"`
  if (confidence > 0) narrative += ` (${confidence}% match)`
  if (totalSpend) narrative += `, which has received ${formatCurrency(totalSpend)} from the council`
  narrative += '.'

  return narrative
}

// Build a human-readable narrative for an indirect network crossover
function buildNetworkNarrative(councillor, link) {
  const parts = [`Cllr ${councillor.name} (${councillor.party || 'Independent'})`]
  parts.push(`shares directorship of ${link.councillor_company} with ${link.co_director}`)

  if (link.co_director_company) {
    parts.push(`. ${link.co_director} also directs ${link.co_director_company}`)
    if (link.link_type === 'co_director_also_directs_supplier') {
      parts.push(`, which matches council supplier "${link.supplier_company}"`)
    } else {
      parts.push(`, whose name matches council supplier "${link.supplier_company}"`)
    }
  } else {
    parts.push(`, whose name matches council supplier "${link.supplier_company}"`)
  }

  if (link.supplier_spend > 0) {
    parts.push(` (${formatCurrency(link.supplier_spend)} total council spend)`)
  }
  parts.push('.')
  return parts.join('')
}

function Integrity() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const hasSpending = !!(config.data_sources || {}).spending
  const { data, loading, error } = useData([
    '/data/integrity.json',
    '/data/councillors.json',
    '/data/shared/mp_interests.json',
    '/data/shared/integrity_cross_council.json',
    '/data/shared/ec_donations.json',
    '/data/shared/hansard_cross_reference.json',
  ])
  const [integrity, councillorsFull, mpInterests, crossCouncilIntegrity, ecDonations, hansardData] = data || [null, [], null, null, null, null]
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [partyFilter, setPartyFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [sortBy, setSortBy] = useState('risk') // risk, name, directorships
  const [activeTab, setActiveTab] = useState('councillors') // councillors, mps, donations, investigation

  useEffect(() => {
    document.title = `Councillor Integrity | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // Merge integrity data with full councillor data for richer display
  const councillors = useMemo(() => {
    if (!integrity?.councillors) return []
    const fullMap = new Map()
    const fullList = Array.isArray(councillorsFull) ? councillorsFull : councillorsFull?.councillors || []
    fullList.forEach(c => fullMap.set(c.id, c))
    return integrity.councillors.map(c => ({
      ...c,
      // Merge in full councillor data (email, phone, roles, party_color)
      ...(fullMap.get(c.councillor_id) || {}),
      // Keep integrity fields (v2 + v4)
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
      network_crossover: c.network_crossover,
      misconduct_patterns: c.misconduct_patterns,
      network_investigation: c.network_investigation,
      red_flags: c.red_flags,
      checked_at: c.checked_at,
      data_sources_checked: c.data_sources_checked,
      // v4 fields
      mp_findings: c.mp_findings,
      revolving_door: c.revolving_door,
      beneficial_ownership: c.beneficial_ownership,
      donation_contract_correlation: c.donation_contract_correlation,
      network_centrality: c.network_centrality,
      // v5 fields
      shell_company_findings: c.shell_company_findings,
      threshold_manipulation: c.threshold_manipulation,
      temporal_clusters: c.temporal_clusters,
      contract_splitting: c.contract_splitting,
      phantom_companies: c.phantom_companies,
      dormant_to_active: c.dormant_to_active,
      family_donation_coordination: c.family_donation_coordination,
      mp_councillor_alignment: c.mp_councillor_alignment,
      bid_rigging: c.bid_rigging,
      seasonal_anomaly: c.seasonal_anomaly,
      gift_frequency: c.gift_frequency,
      hansard_mentions: c.hansard_mentions,
      undeclared_interests: c.undeclared_interests,
      formation_timing: c.formation_timing,
      social_network: c.social_network,
      reciprocal_appointments: c.reciprocal_appointments,
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

  // Build reverse lookup: Supplier → Councillors
  const supplierInvestigation = useMemo(() => {
    if (!councillors.length) return []
    const supplierMap = new Map()

    councillors.forEach(c => {
      const ch = c.companies_house || {}
      // Direct supplier conflicts
      c.supplier_conflicts?.forEach(conflict => {
        const supplierName = conflict.supplier_match?.supplier || ''
        if (!supplierName) return
        if (!supplierMap.has(supplierName)) {
          supplierMap.set(supplierName, {
            supplier: supplierName,
            totalSpend: conflict.supplier_match?.total_spend || 0,
            connections: [],
          })
        }
        const entry = supplierMap.get(supplierName)
        entry.connections.push({
          councillor: c.name,
          councillorId: c.councillor_id,
          party: c.party,
          ward: c.ward,
          riskLevel: c.risk_level,
          type: 'direct',
          conflictType: conflict.conflict_type || 'commercial',
          companyName: conflict.company_name,
          companyNumber: conflict.company_number,
          confidence: conflict.supplier_match?.confidence || 0,
          severity: conflict.severity,
          // Build narrative: how is this councillor connected?
          narrative: buildConnectionNarrative(c, conflict, ch),
        })
      })

      // Network crossover (indirect: co-director → supplier)
      c.network_crossover?.links?.forEach(link => {
        const supplierName = link.supplier_company || ''
        if (!supplierName) return
        if (!supplierMap.has(supplierName)) {
          supplierMap.set(supplierName, {
            supplier: supplierName,
            totalSpend: link.supplier_spend || 0,
            connections: [],
          })
        }
        const entry = supplierMap.get(supplierName)
        entry.connections.push({
          councillor: c.name,
          councillorId: c.councillor_id,
          party: c.party,
          ward: c.ward,
          riskLevel: c.risk_level,
          type: 'network',
          companyName: link.councillor_company,
          coDirector: link.co_director,
          coDirectorCompany: link.co_director_company,
          coDirectorCompanyNumber: link.co_director_company_number,
          confidence: link.confidence || 0,
          severity: link.severity,
          narrative: buildNetworkNarrative(c, link),
        })
      })

      // Cross-council conflicts
      c.cross_council_conflicts?.forEach(conflict => {
        const supplierName = conflict.supplier_match?.supplier || ''
        if (!supplierName) return
        if (!supplierMap.has(supplierName)) {
          supplierMap.set(supplierName, {
            supplier: supplierName,
            totalSpend: conflict.supplier_match?.total_spend || 0,
            connections: [],
          })
        }
        const entry = supplierMap.get(supplierName)
        entry.connections.push({
          councillor: c.name,
          councillorId: c.councillor_id,
          party: c.party,
          ward: c.ward,
          riskLevel: c.risk_level,
          type: 'cross_council',
          conflictType: conflict.conflict_type || 'commercial',
          companyName: conflict.company_name,
          otherCouncil: conflict.other_council,
          confidence: conflict.supplier_match?.confidence || 0,
          severity: conflict.severity || 'warning',
          narrative: `Cllr ${c.name} directs ${conflict.company_name}, which matches supplier "${supplierName}" at ${conflict.other_council} council`,
        })
      })
    })

    // Sort by total spend descending
    return [...supplierMap.values()].sort((a, b) => b.totalSpend - a.totalSpend)
  }, [councillors])

  // MP interests data
  const mpData = useMemo(() => {
    if (!mpInterests?.constituencies) return []
    return Object.entries(mpInterests.constituencies).map(([constId, mp]) => ({
      id: constId,
      ...mp,
      riskScore: (mp.ch_cross_reference?.length || 0) * 20 +
        (mp.supplier_findings?.length || 0) * 30,
    })).sort((a, b) => b.riskScore - a.riskScore)
  }, [mpInterests])

  // Investigation priorities from cross-council data
  const investigationPriorities = useMemo(() => {
    if (!crossCouncilIntegrity?.investigation_priorities) return []
    return crossCouncilIntegrity.investigation_priorities
  }, [crossCouncilIntegrity])

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
          <strong>{integrity?.data_sources?.length || 31}-source political fraud detection (v5.1):</strong> Each councillor&apos;s{' '}
          <a href="https://find-and-update.company-information.service.gov.uk/" target="_blank" rel="noopener noreferrer">
            Companies House
          </a>{' '}
          record is verified using their public register of interests as an anchor.
          DOB verification eliminates false positives.
          {integrity?.register_available && (
            <> Register of interests data is available for this council. </>
          )}
          {!integrity?.register_available && (
            <> Register of interests is not available — verification relies on name + geographic proximity. </>
          )}
          {' '}Cross-referenced against: co-director networks,
          Electoral Commission bulk donations, FCA prohibition orders, cross-council supplier matching (17 bodies),
          familial connections, MP Register of Financial Interests, revolving door detection,
          beneficial ownership chains (3-layer PSC), donation-to-contract correlation, network centrality scoring,
          shell company detection, threshold manipulation, contract splitting, phantom companies,
          bid rigging indicators, temporal donation clustering, parliamentary Hansard cross-reference,
          undeclared interest detection, company formation timing analysis, and seasonal spending anomaly detection.
          {stats?.network_centrality_applied && <> Network centrality amplification applied.</>}
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
              <span className="dashboard-label">Supplier Connections</span>
              {stats.supplier_conflicts_by_type && (
                <span className="dashboard-breakdown">
                  {stats.supplier_conflicts_by_type.commercial > 0 && <span className="breakdown-commercial">{stats.supplier_conflicts_by_type.commercial} commercial</span>}
                  {stats.supplier_conflicts_by_type.community_trustee > 0 && <span className="breakdown-community">{stats.supplier_conflicts_by_type.community_trustee} community</span>}
                </span>
              )}
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
            {(stats.network_crossover_links || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.network_crossover_links}</span>
                <span className="dashboard-label">Network Crossover Links</span>
              </div>
            )}
            {/* v4 stat cards */}
            {(stats.mp_financial_links || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.mp_financial_links}</span>
                <span className="dashboard-label">MP Financial Links</span>
              </div>
            )}
            {(stats.revolving_door_detections || 0) > 0 && (
              <div className="dashboard-card accent-warning">
                <span className="dashboard-number">{stats.revolving_door_detections}</span>
                <span className="dashboard-label">Revolving Door</span>
              </div>
            )}
            {(stats.beneficial_ownership_findings || 0) > 0 && (
              <div className="dashboard-card accent-warning">
                <span className="dashboard-number">{stats.beneficial_ownership_findings}</span>
                <span className="dashboard-label">Ownership Chains</span>
              </div>
            )}
            {(stats.donation_contract_correlations || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.donation_contract_correlations}</span>
                <span className="dashboard-label">Donation→Contract</span>
              </div>
            )}
            {/* v5 stat cards */}
            {(stats.shell_company_donors || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.shell_company_donors}</span>
                <span className="dashboard-label">Shell Company Donors</span>
              </div>
            )}
            {(stats.threshold_manipulation_alerts || 0) > 0 && (
              <div className="dashboard-card accent-warning">
                <span className="dashboard-number">{stats.threshold_manipulation_alerts}</span>
                <span className="dashboard-label">Threshold Alerts</span>
              </div>
            )}
            {(stats.contract_splitting_flags || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.contract_splitting_flags}</span>
                <span className="dashboard-label">Contract Splitting</span>
              </div>
            )}
            {(stats.phantom_companies || 0) > 0 && (
              <div className="dashboard-card accent-warning">
                <span className="dashboard-number">{stats.phantom_companies}</span>
                <span className="dashboard-label">Phantom Companies</span>
              </div>
            )}
            {(stats.bid_rigging_indicators || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.bid_rigging_indicators}</span>
                <span className="dashboard-label">Bid Rigging Patterns</span>
              </div>
            )}
            {(stats.temporal_clusters || 0) > 0 && (
              <div className="dashboard-card accent-warning">
                <span className="dashboard-number">{stats.temporal_clusters}</span>
                <span className="dashboard-label">Temporal Clusters</span>
              </div>
            )}
            {(stats.hansard_mentions || stats.parliamentary_mentions || 0) > 0 && (
              <div className="dashboard-card">
                <span className="dashboard-number">{stats.hansard_mentions || stats.parliamentary_mentions}</span>
                <span className="dashboard-label">Hansard Mentions</span>
              </div>
            )}
            {(stats.undeclared_interests || 0) > 0 && (
              <div className="dashboard-card accent-critical">
                <span className="dashboard-number">{stats.undeclared_interests}</span>
                <span className="dashboard-label">Undeclared Interests</span>
              </div>
            )}
            {(stats.formation_timing_flags || 0) > 0 && (
              <div className="dashboard-card accent-warning">
                <span className="dashboard-number">{stats.formation_timing_flags}</span>
                <span className="dashboard-label">Formation Timing</span>
              </div>
            )}
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
                  <span key={name} className="network-candidate-chip">
                    <CouncillorLink name={name} councillorId={slugify(name)} compact />
                  </span>
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

      {/* Tab Navigation */}
      {scanComplete && (
        <nav className="integrity-tabs" role="tablist">
          <button
            role="tab"
            className={`integrity-tab ${activeTab === 'councillors' ? 'active' : ''}`}
            onClick={() => setActiveTab('councillors')}
            aria-selected={activeTab === 'councillors'}
          >
            <Users size={16} />
            Councillors
            <span className="tab-count">{councillors.length}</span>
          </button>
          {mpData.length > 0 && (
            <button
              role="tab"
              className={`integrity-tab ${activeTab === 'mps' ? 'active' : ''}`}
              onClick={() => setActiveTab('mps')}
              aria-selected={activeTab === 'mps'}
            >
              <Landmark size={16} />
              MPs
              <span className="tab-count">{mpData.length}</span>
            </button>
          )}
          {investigationPriorities.length > 0 && (
            <button
              role="tab"
              className={`integrity-tab ${activeTab === 'investigation' ? 'active' : ''}`}
              onClick={() => setActiveTab('investigation')}
              aria-selected={activeTab === 'investigation'}
            >
              <Eye size={16} />
              Investigation Priorities
              <span className="tab-count">{investigationPriorities.length}</span>
            </button>
          )}
          {ecDonations && (
            <button
              role="tab"
              className={`integrity-tab ${activeTab === 'donations' ? 'active' : ''}`}
              onClick={() => setActiveTab('donations')}
              aria-selected={activeTab === 'donations'}
            >
              <PoundSterling size={16} />
              Donations
              <span className="tab-count">{ecDonations?.summary?.total_donations || 0}</span>
            </button>
          )}
        </nav>
      )}

      {/* ══════ MPs Tab ══════ */}
      {activeTab === 'mps' && mpData.length > 0 && (
        <section className="integrity-mp-section">
          <h3><Landmark size={18} /> MP Register of Financial Interests</h3>
          <p className="section-desc">
            Declared interests from the{' '}
            <a href="https://interests.parliament.uk/" target="_blank" rel="noopener noreferrer">
              UK Parliament Register of Members&apos; Financial Interests
            </a>, cross-referenced against spending data from all 17 Lancashire public bodies.
          </p>
          <div className="mp-grid">
            {mpData.map(mp => (
              <div key={mp.id} className={`mp-card ${mp.supplier_findings?.length > 0 ? 'has-findings' : ''}`}>
                <div className="mp-card-header">
                  <h4>{mp.mp_name}</h4>
                  <span className="mp-party">{mp.mp_party}</span>
                  <span className="mp-constituency">{mp.id}</span>
                </div>
                <div className="mp-stats">
                  <span className="mp-stat">
                    <strong>{mp.total_interests || 0}</strong> interests
                  </span>
                  <span className="mp-stat">
                    <strong>{mp.companies_declared?.length || 0}</strong> companies
                  </span>
                  <span className="mp-stat">
                    <strong>{mp.donors?.length || 0}</strong> donors
                  </span>
                  {mp.total_declared_value > 0 && (
                    <span className="mp-stat">
                      <strong>{formatCurrency(mp.total_declared_value)}</strong> declared
                    </span>
                  )}
                </div>

                {/* Interest categories */}
                {mp.interests_by_category && Object.entries(mp.interests_by_category).map(([cat, items]) => {
                  if (!items?.length) return null
                  return (
                    <div key={cat} className="mp-category">
                      <span className="mp-category-label">{cat.replace(/_/g, ' ')}</span>
                      <span className="mp-category-count">{items.length}</span>
                    </div>
                  )
                })}

                {/* Supplier cross-reference findings */}
                {mp.supplier_findings?.length > 0 && (
                  <div className="mp-findings">
                    <h5><AlertTriangle size={14} /> Supplier Cross-Reference Findings</h5>
                    {mp.supplier_findings.map((f, i) => (
                      <div key={i} className={`mp-finding severity-${f.severity || 'warning'}`}>
                        <span className={`severity-badge ${f.severity || 'warning'}`}>{f.severity || 'warning'}</span>
                        <span className="mp-finding-detail">{f.detail || f.mp_entity}</span>
                        {f.supplier_match?.total_spend > 0 && (
                          <span className="mp-finding-spend">{formatCurrency(f.supplier_match.total_spend)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* CH cross-references */}
                {mp.ch_cross_reference?.length > 0 && (
                  <div className="mp-ch-refs">
                    <h5><Building2 size={14} /> Companies House Cross-References</h5>
                    {mp.ch_cross_reference.map((ref, i) => (
                      <div key={i} className={`mp-ch-ref ${ref.is_supplier ? 'is-supplier' : ''}`}>
                        <span className="mp-ch-company">{ref.declared_company}</span>
                        {ref.company_number && (
                          <a href={`https://find-and-update.company-information.service.gov.uk/company/${ref.company_number}`}
                            target="_blank" rel="noopener noreferrer" className="mp-ch-link">
                            <ExternalLink size={12} /> CH
                          </a>
                        )}
                        <span className="mp-ch-status">{ref.ch_status}</span>
                        {ref.is_supplier && (
                          <span className="mp-ch-supplier-tag">
                            SUPPLIER — {formatCurrency(ref.supplier_spend || 0)}
                          </span>
                        )}
                        {ref.councils_supplied?.length > 0 && (
                          <span className="mp-ch-councils">
                            Supplies: {ref.councils_supplied.join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Parliamentary Mentions (v5) */}
                {hansardData?.mp_mentions?.[mp.mp_name]?.mentions?.length > 0 && (
                  <div className="mp-hansard-mentions">
                    <h5><FileText size={14} /> Parliamentary Mentions</h5>
                    <p className="section-desc-sm">
                      Companies/donors in this MP&apos;s network mentioned in parliamentary debates.
                    </p>
                    {hansardData.mp_mentions[mp.mp_name].mentions.slice(0, 10).map((mention, i) => (
                      <div key={i} className={`mp-mention severity-${mention.risk_indicator || 'info'}`}>
                        <span className={`severity-badge ${mention.risk_indicator || 'info'}`}>
                          {mention.relationship || 'mention'}
                        </span>
                        <div className="mention-detail">
                          <strong>{mention.company_or_donor}</strong>
                          {mention.debate_title && (
                            <span className="mention-debate"> in &quot;{mention.debate_title}&quot;</span>
                          )}
                          {mention.debate_date && (
                            <span className="mention-date"> ({mention.debate_date})</span>
                          )}
                          {mention.hansard_url && (
                            <a href={mention.hansard_url} target="_blank" rel="noopener noreferrer" className="mention-link">
                              <ExternalLink size={12} /> Hansard
                            </a>
                          )}
                        </div>
                        {mention.excerpt && (
                          <div className="mention-excerpt">&quot;{mention.excerpt.slice(0, 200)}&quot;</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════ Investigation Priorities Tab ══════ */}
      {activeTab === 'investigation' && investigationPriorities.length > 0 && (
        <section className="integrity-investigation-section">
          <h3><Eye size={18} /> Investigation Priorities</h3>
          <p className="section-desc">
            Ranked list of the most concerning findings across all councillors, sorted by
            critical flag count and network centrality score. These represent the highest-priority
            cases for further examination.
          </p>
          <div className="investigation-list">
            {investigationPriorities.map((item, i) => (
              <div key={i} className={`investigation-card risk-${item.risk_level}`}>
                <div className="investigation-rank">#{i + 1}</div>
                <div className="investigation-details">
                  <div className="investigation-header">
                    <strong><CouncillorLink name={item.councillor} councillorId={slugify(item.councillor)} compact /></strong>
                    <span className="investigation-council">{item.council}</span>
                    <span className={`risk-badge ${item.risk_level}`}>
                      {item.risk_level}
                    </span>
                    <span className="investigation-score">Score: {item.integrity_score}/100</span>
                  </div>
                  <div className="investigation-metrics">
                    <span>{item.critical_flags} critical flags</span>
                    <span>{item.total_flags} total flags</span>
                    {item.network_centrality > 0 && (
                      <span>Centrality: {(item.network_centrality * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  {item.top_concerns?.length > 0 && (
                    <ul className="investigation-concerns">
                      {item.top_concerns.map((concern, j) => (
                        <li key={j}>{concern}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════ Donations Tab ══════ */}
      {activeTab === 'donations' && ecDonations && (
        <section className="integrity-donations-section">
          <h3><PoundSterling size={18} /> Lancashire Political Donations</h3>
          <p className="section-desc">
            Bulk donation data from the{' '}
            <a href="https://search.electoralcommission.org.uk/" target="_blank" rel="noopener noreferrer">
              Electoral Commission
            </a>, cross-referenced against council suppliers, councillor companies, and MP interests.
            Covers all Lancashire party branches and 16 MPs.
          </p>

          {/* Donation summary cards */}
          <div className="stat-grid stat-grid-4">
            <div className="stat-card">
              <div className="stat-value">{ecDonations.summary?.total_donations?.toLocaleString() || 0}</div>
              <div className="stat-label">Total Donations</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{formatCurrency(ecDonations.summary?.total_value || 0)}</div>
              <div className="stat-label">Total Value</div>
            </div>
            <div className="stat-card accent">
              <div className="stat-value">{ecDonations.summary?.suppliers_who_donate || 0}</div>
              <div className="stat-label">Supplier-Donors</div>
            </div>
            <div className="stat-card accent">
              <div className="stat-value">{ecDonations.summary?.threshold_proximity_count || 0}</div>
              <div className="stat-label">Threshold Alerts</div>
            </div>
          </div>

          {/* Supplier-donor pipeline */}
          {ecDonations.supplier_donations?.length > 0 && (
            <div className="donations-findings">
              <h4><AlertTriangle size={16} /> Supplier-Donor Pipeline</h4>
              <p className="section-desc">Companies that both donate to political parties AND receive council contracts.</p>
              <div className="findings-list">
                {ecDonations.supplier_donations.slice(0, 20).map((sd, i) => (
                  <div key={i} className="integrity-finding severity-high">
                    <span className="severity-badge high">pipeline</span>
                    <div className="finding-text">
                      <strong>{sd.donor_name || sd.matched_supplier}</strong> donated{' '}
                      {formatCurrency(sd.value || 0)} to {sd.regulated_entity || 'party'}{' '}
                      ({sd.accounting_unit || ''}){sd.accepted_date ? ` on ${sd.accepted_date}` : ''}
                      {sd.council_spend > 0 && (
                        <span className="finding-extra"> — received {formatCurrency(sd.council_spend)} in council contracts</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Threshold proximity alerts */}
          {ecDonations.threshold_proximity?.length > 0 && (
            <div className="donations-findings">
              <h4><AlertTriangle size={16} /> Threshold Proximity Alerts</h4>
              <p className="section-desc">Donations suspiciously close to PPERA reporting thresholds — may indicate structured giving.</p>
              <div className="findings-list">
                {ecDonations.threshold_proximity.slice(0, 15).map((tp, i) => (
                  <div key={i} className="integrity-finding severity-warning">
                    <span className="severity-badge warning">threshold</span>
                    <div className="finding-text">
                      <strong>{tp.donor_name}</strong>: {formatCurrency(tp.value || 0)} to {tp.accounting_unit || tp.regulated_entity}{' '}
                      — {tp.below_pct}% below {tp.threshold_type} threshold ({formatCurrency(tp.threshold_value || 0)})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Temporal clusters */}
          {ecDonations.temporal_clusters?.length > 0 && (
            <div className="donations-findings">
              <h4><AlertTriangle size={16} /> Temporal Donation Clusters</h4>
              <p className="section-desc">Multiple donations from different donors arriving within a 30-day window — possible coordination.</p>
              <div className="findings-list">
                {ecDonations.temporal_clusters.slice(0, 10).map((tc, i) => (
                  <div key={i} className="integrity-finding severity-high">
                    <span className="severity-badge high">cluster</span>
                    <div className="finding-text">
                      <strong>{tc.donation_count} donations</strong> from {tc.unique_donors} unique donors
                      totalling {formatCurrency(tc.total_value || 0)} to {tc.entity} ({tc.accounting_unit}){' '}
                      between {tc.window_start} and {tc.window_end}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unincorporated associations */}
          {ecDonations.unincorporated_associations?.length > 0 && (
            <div className="donations-findings">
              <h4><AlertTriangle size={16} /> Unincorporated Association Donations</h4>
              <p className="section-desc">
                UAs can accept foreign donations and pass them to UK parties — a major PPERA transparency loophole.
              </p>
              <div className="findings-list">
                {ecDonations.unincorporated_associations.slice(0, 15).map((ua, i) => (
                  <div key={i} className="integrity-finding severity-warning">
                    <span className="severity-badge warning">UA</span>
                    <div className="finding-text">
                      <strong>{ua.donor_name}</strong>: {formatCurrency(ua.value || 0)} to {ua.accounting_unit || ua.regulated_entity}
                      {ua.accepted_date ? ` (${ua.accepted_date})` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Party totals breakdown */}
          {ecDonations.summary?.party_totals && (
            <div className="donations-party-totals">
              <h4>Donations by Party</h4>
              <div className="party-totals-grid">
                {Object.entries(ecDonations.summary.party_totals).slice(0, 8).map(([party, total]) => (
                  <div key={party} className="party-total-card">
                    <div className="party-total-name">{party}</div>
                    <div className="party-total-value">{formatCurrency(total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══════ Councillors Tab ══════ */}
      {activeTab === 'councillors' && <>

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
                      <span><CouncillorLink name={m.name} councillorId={slugify(m.name)} compact /></span>
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
                      <span><CouncillorLink name={m.name} councillorId={slugify(m.name)} compact /></span>
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

      {/* Supplier Political Donations */}
      {integrity?.supplier_political_donations?.length > 0 && (
        <section className="supplier-donations-section">
          <h3><Banknote size={18} /> Supplier Political Donations</h3>
          <p className="section-desc">
            Council suppliers identified as having made political donations to local party associations
            (source: Electoral Commission). This does not imply wrongdoing but is disclosed for transparency.
          </p>
          <div className="supplier-donations-grid">
            {integrity.supplier_political_donations.map((donation, i) => {
              const dateMs = donation.date ? parseInt(donation.date.replace(/\/Date\((\d+)\)\//, '$1'), 10) : null
              const dateStr = dateMs ? new Date(dateMs).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
              return (
                <div key={i} className="supplier-donation-card">
                  <div className="supplier-donation-header">
                    <span className="supplier-donation-name">
                      {donation.donor_name || donation.supplier}
                    </span>
                    <span className="supplier-donation-amount">{formatCurrency(donation.value)}</span>
                  </div>
                  <div className="supplier-donation-meta">
                    <span className="supplier-donation-party">{donation.party}</span>
                    <span className="supplier-donation-date">{dateStr}</span>
                  </div>
                  {donation.donor_name && donation.donor_name !== donation.supplier && (
                    <p className="supplier-donation-link">
                      Matched via council supplier: <strong>{donation.supplier}</strong>
                    </p>
                  )}
                  {donation.ec_ref && (
                    <a
                      href={`https://search.electoralcommission.org.uk/Search/Donations?searchTerm=${encodeURIComponent(donation.donor_name || donation.supplier)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ec-link-btn"
                    >
                      <ExternalLink size={10} /> View on EC Register
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Supplier Investigation — Reverse Lookup */}
      {supplierInvestigation.length > 0 && (
        <section className="supplier-investigation-section">
          <h3><Scale size={18} /> Supplier Investigation</h3>
          <p className="section-desc">
            Reverse lookup: starting from council suppliers, showing which councillors are connected and how.
            Includes direct conflicts (councillor directs a matching company), network crossovers
            (councillor&apos;s co-director linked to supplier), and cross-council conflicts.
          </p>
          <div className="supplier-investigation-grid">
            {supplierInvestigation.map((item, i) => (
              <div key={i} className="supplier-investigation-card">
                <div className="supplier-investigation-header">
                  <div className="supplier-investigation-name">
                    <Scale size={16} />
                    {hasSpending ? (
                      <Link
                        to={`/spending?supplier=${encodeURIComponent(item.supplier)}`}
                        className="supplier-investigation-link"
                      >
                        {item.supplier}
                      </Link>
                    ) : (
                      <span className="supplier-investigation-link">{item.supplier}</span>
                    )}
                  </div>
                  {item.totalSpend > 0 && (
                    <span className="supplier-investigation-spend">
                      {formatCurrency(item.totalSpend)} total spend
                    </span>
                  )}
                </div>
                <div className="supplier-investigation-connections">
                  {item.connections.map((conn, j) => (
                    <div key={j} className={`connection-card ${conn.type} ${conn.severity || ''} ${conn.conflictType ? `conflict-type-${conn.conflictType}` : ''}`}>
                      <div className="connection-header">
                        <span className="connection-type-badge">
                          {conn.type === 'direct' && <><AlertTriangle size={11} /> Direct</>}
                          {conn.type === 'network' && <><Network size={11} /> Network</>}
                          {conn.type === 'cross_council' && <><Globe size={11} /> Cross-Council</>}
                        </span>
                        {conn.conflictType && conn.conflictType !== 'commercial' && (
                          <span className={`conflict-type-badge conflict-type-${conn.conflictType === 'community_trustee' ? 'community' : conn.conflictType === 'council_appointed' ? 'appointed' : conn.conflictType === 'arms_length_body' ? 'armslength' : 'commercial'}`}>
                            {conn.conflictType === 'community_trustee' ? 'Community' : conn.conflictType === 'council_appointed' ? 'Appointed' : conn.conflictType === 'arms_length_body' ? "Arm's-Length" : ''}
                          </span>
                        )}
                        <span className="connection-councillor">
                          <CouncillorLink name={conn.councillor} councillorId={conn.councillorId || slugify(conn.councillor)} compact />
                        </span>
                        {conn.party && (
                          <span className="connection-party">{conn.party}</span>
                        )}
                        {conn.confidence > 0 && (
                          <span className="connection-confidence">{conn.confidence}%</span>
                        )}
                      </div>
                      <p className="connection-narrative">{conn.narrative}</p>
                      <div className="connection-actions">
                        <button
                          type="button"
                          className="connection-view-btn"
                          onClick={() => setExpandedId(conn.councillorId)}
                        >
                          <Eye size={11} /> View Councillor
                        </button>
                        {hasSpending && (
                          <Link
                            to={`/spending?supplier=${encodeURIComponent(item.supplier)}`}
                            className="connection-spending-btn"
                          >
                            <PoundSterling size={11} /> View Spending
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cross-Council Summary */}
      {integrity?.cross_council_summary?.councillor_companies_in_other_councils > 0 && (
        <section className="cross-council-summary-section">
          <h3><Globe size={18} /> Cross-Council Summary</h3>
          <p className="section-desc">
            Councillors whose company directorships appear as suppliers in other Lancashire councils.
          </p>
          <div className="cross-council-summary-stats">
            <div className="dashboard-card accent-critical">
              <span className="dashboard-number">{integrity.cross_council_summary.councillor_companies_in_other_councils}</span>
              <span className="dashboard-label">Companies Found in Other Councils</span>
            </div>
          </div>
          {integrity.cross_council_summary.affected_councils?.length > 0 && (
            <div className="cross-council-affected">
              <strong>Affected councils:</strong>{' '}
              {integrity.cross_council_summary.affected_councils.join(', ')}
            </div>
          )}
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
                    <h3><CouncillorLink name={councillor.name} councillorId={councillor.councillor_id || slugify(councillor.name)} compact /></h3>
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
                            strokeDasharray="100"
                            strokeDashoffset={100 - councillor.integrity_score}
                            strokeLinecap="round"
                            className="score-ring-progress"
                            style={{ strokeDashoffset: 100 - councillor.integrity_score, transition: 'stroke-dashoffset 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s' }}
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
                      {ch.verification_method && (
                        <p className="verification-method-note" style={{ fontSize: '0.8rem', color: 'var(--color-muted)', margin: '0 0 0.5rem' }}>
                          Verification: {ch.verification_method === 'register_and_dob' ? 'Register of interests + DOB confirmed' :
                            ch.verification_method === 'dob_only' ? 'DOB confirmed via Companies House' :
                            ch.verification_method === 'proximity_and_name' ? 'Name + geographic proximity' :
                            'Name match only (limited verification)'}
                        </p>
                      )}
                      <div className="companies-list">
                        {ch.companies.map((company, i) => (
                          <div key={i} className={`company-row ${company.resigned_on ? 'resigned' : 'active'}`}>
                            <div className="company-info">
                              <span className="company-name">{company.company_name}</span>
                              <span className="company-meta">
                                {company.role} · {company.resigned_on ? `Resigned ${company.resigned_on}` : 'Active'}
                                {company.company_status ? ` · ${company.company_status}` : ''}
                              </span>
                              {/* Verification badge */}
                              {company.verification === 'register_confirmed' && (
                                <span className="verification-badge verified" title="Declared on register of interests and verified via Companies House">
                                  ✓ Register + CH Verified
                                </span>
                              )}
                              {company.verification === 'ch_dob_confirmed' && (
                                <span className="verification-badge confirmed" title="Date of birth confirmed via Companies House">
                                  ✓ DOB Confirmed
                                </span>
                              )}
                              {company.verification === 'ch_strong_proximity' && (
                                <span className="verification-badge proximity" title="Strong name match with Lancashire proximity">
                                  ~ Proximity Match
                                </span>
                              )}
                              {company.verification === 'ch_proximity_match' && (
                                <span className="verification-badge proximity" title="Name match with geographic proximity">
                                  ~ Proximity Match
                                </span>
                              )}
                              {company.verification === 'name_match_only' && (
                                <span className="verification-badge unverified" title="Name match only — lower confidence">
                                  ? Unverified
                                </span>
                              )}
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
                                   className="ch-link ch-link-btn" title="View on Companies House">
                                  <Building2 size={12} />
                                  Companies House
                                  <ExternalLink size={10} />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Register of Interests Comparison */}
                  {councillor.register_of_interests?.available && (
                    <div className="register-section" style={{ marginBottom: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.8125rem', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={16} /> Register of Interests
                      </h4>
                      {councillor.register_of_interests.declared_companies?.length > 0 ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <p style={{ margin: '0 0 4px' }}>
                            <strong>Declared interests:</strong>{' '}
                            {councillor.register_of_interests.declared_companies.join(', ')}
                          </p>
                          {ch.companies?.some(c => c.declared_on_register) && (
                            <p style={{ margin: '0 0 4px', color: '#34c759' }}>
                              ✓ {ch.companies.filter(c => c.declared_on_register).length} declared interest(s) verified via Companies House
                            </p>
                          )}
                          {ch.companies?.some(c => !c.declared_on_register && c.confidence >= 55) && (
                            <p style={{ margin: '0 0 4px', color: '#ff9f0a' }}>
                              {ch.companies.filter(c => !c.declared_on_register && c.confidence >= 55).length} CH directorship(s) not found on register of interests
                            </p>
                          )}
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: 0 }}>
                          No company interests declared on register
                        </p>
                      )}
                    </div>
                  )}
                  {!councillor.register_of_interests?.available && integrity?.register_available === false && (
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '0 0 0.5rem', fontStyle: 'italic' }}>
                      Register of interests not available for this council
                    </p>
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
                      <h4><Scale size={16} /> Supplier Connections</h4>
                      <div className="conflicts-list">
                        {councillor.supplier_conflicts.map((conflict, i) => {
                          const ctype = conflict.conflict_type || 'commercial'
                          const typeLabel = {
                            commercial: 'Commercial',
                            community_trustee: 'Community/Charity',
                            council_appointed: 'Council Appointed',
                            arms_length_body: "Arm's-Length Body",
                          }[ctype] || 'Commercial'
                          const typeClass = {
                            commercial: 'conflict-type-commercial',
                            community_trustee: 'conflict-type-community',
                            council_appointed: 'conflict-type-appointed',
                            arms_length_body: 'conflict-type-armslength',
                          }[ctype] || 'conflict-type-commercial'
                          return (
                          <div key={i} className={`conflict-row ${typeClass}`}>
                            <span className={`conflict-type-badge ${typeClass}`}>{typeLabel}</span>
                            <span className="conflict-company">{conflict.company_name}</span>
                            <span className="conflict-arrow">→</span>
                            <Link
                              to={`/supplier/${slugify(conflict.supplier_match?.supplier || '')}`}
                              className="conflict-supplier conflict-supplier-link"
                              onClick={e => e.stopPropagation()}
                            >
                              {conflict.supplier_match?.supplier}
                            </Link>
                            <span className="conflict-confidence">
                              {conflict.supplier_match?.confidence}% match
                            </span>
                            {hasSpending && (
                              <Link
                                to={`/spending?supplier=${encodeURIComponent(conflict.supplier_match?.supplier || '')}`}
                                className="conflict-spending-btn"
                                onClick={e => e.stopPropagation()}
                                title="View spending for this supplier"
                              >
                                <PoundSterling size={11} /> Spending
                              </Link>
                            )}
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Cross-Council Connections */}
                  {councillor.cross_council_conflicts?.length > 0 && (
                    <div className="conflicts-section cross-council">
                      <h4><Globe size={16} /> Cross-Council Connections ({councillor.cross_council_conflicts.length})</h4>
                      <div className="conflicts-list">
                        {councillor.cross_council_conflicts.map((conflict, i) => {
                          const ctype = conflict.conflict_type || 'commercial'
                          const typeLabel = {
                            commercial: 'Commercial',
                            community_trustee: 'Community/Charity',
                            council_appointed: 'Council Appointed',
                            arms_length_body: "Arm's-Length Body",
                          }[ctype] || 'Commercial'
                          const typeClass = {
                            commercial: 'conflict-type-commercial',
                            community_trustee: 'conflict-type-community',
                            council_appointed: 'conflict-type-appointed',
                            arms_length_body: 'conflict-type-armslength',
                          }[ctype] || 'conflict-type-commercial'
                          return (
                          <div key={i} className={`conflict-row ${typeClass}`}>
                            <span className={`conflict-type-badge ${typeClass}`}>{typeLabel}</span>
                            <span className="conflict-company">{conflict.company_name}</span>
                            <span className="conflict-arrow">→</span>
                            <Link
                              to={`/supplier/${slugify(conflict.supplier_match?.supplier || '')}`}
                              className="conflict-supplier conflict-supplier-link"
                              onClick={e => e.stopPropagation()}
                            >
                              {conflict.supplier_match?.supplier}
                            </Link>
                            <span className="conflict-council-tag">{conflict.other_council}</span>
                          </div>
                          )
                        })}
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

                  {/* Network Crossover: Co-Director → Supplier */}
                  {councillor.network_crossover?.total_links > 0 && (
                    <div className="crossover-section">
                      <h4><Network size={16} /> Network Crossover — Co-Director → Supplier ({councillor.network_crossover.total_links} link{councillor.network_crossover.total_links !== 1 ? 's' : ''})</h4>
                      <p className="crossover-explain">These are indirect links: a co-director from the councillor's business network also appears connected to a council supplier.</p>
                      <div className="crossover-links">
                        {councillor.network_crossover.links.map((link, i) => (
                          <div key={i} className={`crossover-card ${link.severity}`}>
                            <div className="crossover-path">
                              <span className="crossover-step">
                                <Building2 size={12} />
                                <span className="crossover-label">Shared Company</span>
                                <span className="crossover-value">{link.councillor_company}</span>
                              </span>
                              <span className="crossover-arrow">→</span>
                              <span className="crossover-step">
                                <Users size={12} />
                                <span className="crossover-label">Co-Director</span>
                                <span className="crossover-value">{link.co_director}</span>
                              </span>
                              <span className="crossover-arrow">→</span>
                              {link.co_director_company && (
                                <>
                                  <span className="crossover-step">
                                    <Building2 size={12} />
                                    <span className="crossover-label">Also Directs</span>
                                    {link.co_director_company_number ? (
                                      <a
                                        href={`https://find-and-update.company-information.service.gov.uk/company/${link.co_director_company_number}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="crossover-value crossover-ch-link"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        {link.co_director_company}
                                      </a>
                                    ) : (
                                      <span className="crossover-value">{link.co_director_company}</span>
                                    )}
                                  </span>
                                  <span className="crossover-arrow">≈</span>
                                </>
                              )}
                              <span className="crossover-step">
                                <Link to={`/supplier/${slugify(link.supplier_company)}`} className="crossover-supplier-link" onClick={e => e.stopPropagation()}>
                                  <PoundSterling size={12} />
                                  <span className="crossover-label">Council Supplier</span>
                                  <span className="crossover-value">{link.supplier_company}</span>
                                </Link>
                              </span>
                            </div>
                            <div className="crossover-meta">
                              <span className={`crossover-severity ${link.severity}`}>{link.severity?.toUpperCase()}</span>
                              {link.supplier_spend > 0 && (
                                <span className="crossover-spend">{formatCurrency(link.supplier_spend)}</span>
                              )}
                              <span className="crossover-link-type">
                                {link.link_type === 'co_director_also_directs_supplier' ? 'Company match' : 'Name match'}
                              </span>
                              <span className="crossover-confidence">{link.confidence}% match</span>
                            </div>
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

                  {/* v4: MP Financial Links */}
                  {councillor.mp_findings?.length > 0 && (
                    <div className="mp-links-section">
                      <h4><Landmark size={16} /> MP Financial Connections</h4>
                      <div className="flags-list">
                        {councillor.mp_findings.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v4: Revolving Door */}
                  {councillor.revolving_door?.length > 0 && (
                    <div className="revolving-door-section">
                      <h4><Scale size={16} /> Revolving Door Analysis</h4>
                      <div className="flags-list">
                        {councillor.revolving_door.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.warning }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v4: Beneficial Ownership */}
                  {councillor.beneficial_ownership?.length > 0 && (
                    <div className="ownership-section">
                      <h4><Network size={16} /> Beneficial Ownership Analysis</h4>
                      <div className="flags-list">
                        {councillor.beneficial_ownership.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.warning }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v4: Donation-to-Contract Correlation */}
                  {councillor.donation_contract_correlation?.length > 0 && (
                    <div className="donation-contract-section">
                      <h4><PoundSterling size={16} /> Donation→Contract Correlation</h4>
                      <div className="flags-list">
                        {councillor.donation_contract_correlation.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v4: Network Centrality */}
                  {councillor.network_centrality?.score > 0.3 && (
                    <div className="centrality-section">
                      <h4><Fingerprint size={16} /> Network Centrality</h4>
                      <div className="centrality-meter">
                        <div className="centrality-bar" style={{ width: `${(councillor.network_centrality.score * 100)}%` }} />
                        <span className="centrality-score">{(councillor.network_centrality.score * 100).toFixed(0)}%</span>
                      </div>
                      <p className="centrality-desc">
                        {councillor.network_centrality.score > 0.8 ? 'Very highly connected — score penalty amplified ×1.5' :
                         councillor.network_centrality.score > 0.5 ? 'Highly connected — score penalty amplified ×1.3' :
                         'Moderately connected'}
                      </p>
                      <div className="centrality-components">
                        {councillor.network_centrality.components && Object.entries(councillor.network_centrality.components).map(([key, val]) => (
                          val > 0 ? <span key={key} className="centrality-component">{key.replace(/_/g, ' ')}: {val}</span> : null
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Shell Company Findings */}
                  {councillor.shell_company_findings?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Building2 size={16} /> Shell Company Donor Findings</h4>
                      <div className="flags-list">
                        {councillor.shell_company_findings.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.critical }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Contract Splitting */}
                  {councillor.contract_splitting?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><AlertTriangle size={16} /> Contract Splitting Detection</h4>
                      <div className="flags-list">
                        {councillor.contract_splitting.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.critical }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Phantom Companies */}
                  {councillor.phantom_companies?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Building2 size={16} /> Phantom Company Detection</h4>
                      <div className="flags-list">
                        {councillor.phantom_companies.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Dormant-to-Active */}
                  {councillor.dormant_to_active?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><AlertTriangle size={16} /> Dormant→Active Supplier</h4>
                      <div className="flags-list">
                        {councillor.dormant_to_active.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.critical }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Bid Rigging */}
                  {councillor.bid_rigging?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><ShieldAlert size={16} /> Bid Rigging Indicators</h4>
                      <div className="flags-list">
                        {councillor.bid_rigging.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.critical }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Threshold Manipulation */}
                  {councillor.threshold_manipulation?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><PoundSterling size={16} /> Donation Threshold Manipulation</h4>
                      <div className="flags-list">
                        {councillor.threshold_manipulation.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Temporal Donation Clusters */}
                  {councillor.temporal_clusters?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><AlertTriangle size={16} /> Temporal Donation Clusters</h4>
                      <div className="flags-list">
                        {councillor.temporal_clusters.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Family Donation Coordination */}
                  {councillor.family_donation_coordination?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Heart size={16} /> Family Donation Coordination</h4>
                      <div className="flags-list">
                        {councillor.family_donation_coordination.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: MP-Councillor Alignment */}
                  {councillor.mp_councillor_alignment?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Landmark size={16} /> MP-Councillor Donor Alignment</h4>
                      <div className="flags-list">
                        {councillor.mp_councillor_alignment.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Social Network Triangulation */}
                  {councillor.social_network?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Network size={16} /> Social Network Triangulation</h4>
                      <div className="flags-list">
                        {councillor.social_network.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.high }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Reciprocal Appointments */}
                  {councillor.reciprocal_appointments?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Globe size={16} /> Reciprocal Cross-Council Appointments</h4>
                      <div className="flags-list">
                        {councillor.reciprocal_appointments.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.critical }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Seasonal Spending Anomaly */}
                  {councillor.seasonal_anomaly?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><AlertTriangle size={16} /> Seasonal Spending Anomaly</h4>
                      <div className="flags-list">
                        {councillor.seasonal_anomaly.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.warning }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5: Gift/Hospitality Frequency */}
                  {councillor.gift_frequency?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Heart size={16} /> Gift &amp; Hospitality Frequency</h4>
                      <div className="flags-list">
                        {councillor.gift_frequency.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.warning }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5.1: Hansard Parliamentary Mentions */}
                  {councillor.hansard_mentions?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Landmark size={16} /> Hansard Parliamentary Mentions</h4>
                      <div className="flags-list">
                        {councillor.hansard_mentions.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.warning }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5.1: Undeclared Interests */}
                  {councillor.undeclared_interests?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><Eye size={16} /> Undeclared Interests</h4>
                      <div className="flags-list">
                        {councillor.undeclared_interests.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.critical }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* v5.1: Company Formation Timing */}
                  {councillor.formation_timing?.length > 0 && (
                    <div className="v5-findings-section">
                      <h4><FileText size={16} /> Company Formation Timing</h4>
                      <div className="flags-list">
                        {councillor.formation_timing.map((finding, i) => (
                          <div key={i} className="flag-row" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] || SEVERITY_COLORS.warning }}>
                            <span className="flag-severity" style={{ color: SEVERITY_COLORS[finding.severity] }}>
                              {finding.severity?.toUpperCase()}
                            </span>
                            <span className="flag-detail">{finding.detail}</span>
                          </div>
                        ))}
                      </div>
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

      </>}
      {/* End of councillors tab */}

      {/* Legal Disclaimer */}
      <section className="integrity-disclaimer">
        <p>
          <strong>Important:</strong> This tool uses publicly available data from {integrity?.data_sources?.length || 28} sources
          including Companies House, Electoral Commission (bulk CSV), FCA Register, UK Parliament Register of Members&apos; Financial Interests,
          Hansard parliamentary records, council registers of interests, and spending records from 17 Lancashire public bodies.
          {integrity?.version?.startsWith('5') ? (
            <> Directorships are DOB-verified with register-anchored identity confirmation.
            31 detection algorithms include shell company detection, threshold manipulation, contract splitting,
            bid rigging indicators, temporal donation clustering, social network triangulation,
            reciprocal cross-council appointments, parliamentary mention cross-referencing (UK Parliament Hansard API),
            beneficial ownership chains (3-layer PSC), donation-to-contract ROI correlation,
            undeclared interest detection (CH vs register), and company formation timing analysis.
            Network centrality scoring amplifies risk for highly-connected individuals. </>
          ) : integrity?.version === '4.0' ? (
            <> Directorships are DOB-verified with register-anchored identity confirmation.
            Network centrality scoring amplifies risk for highly-connected individuals.
            Cross-references include MP declared interests, revolving door detection,
            beneficial ownership chains, and donation-to-contract correlation. </>
          ) : integrity?.version === '3.0' ? (
            <> Directorships are verified using date-of-birth confirmation and geographic proximity scoring. </>
          ) : (
            <> Name matching is probabilistic and may produce false positives. </>
          )}
          A match does not imply wrongdoing. Councillors may legitimately hold company
          directorships and family members may have legitimate business interests.
          The integrity score is algorithmic and should be interpreted alongside
          the council&apos;s formal Register of Members&apos; Interests. This tool is provided for transparency purposes
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
