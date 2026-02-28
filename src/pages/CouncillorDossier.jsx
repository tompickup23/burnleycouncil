/**
 * CouncillorDossier — Unified councillor profile page.
 *
 * Route: /councillor/:councillorId
 *
 * Loads ALL data sources in parallel. The single destination for everything
 * about one councillor: integrity, companies, register, elections, timeline.
 *
 * 7 tabbed sections:
 *   1. Header — Name, photo, party, ward, integrity score ring, confidence
 *   2. Quick stats — Directorships, red flags, committees, election margin
 *   3. Integrity tab — All red flags with confidence, source tier badges, legal refs
 *   4. Companies tab — CH directorships, co-director network, supplier conflicts
 *   5. Register tab — Employment, land, securities — each flagged if conflict
 *   6. Electoral tab — Election history, margin trends, ward context, prediction
 *   7. Timeline tab — Chronological events
 */
import { useState, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX, Building2, Users, Vote,
  Clock, Briefcase, MapPin, FileText, ExternalLink, ChevronLeft,
  AlertTriangle, TrendingUp, Calendar, Award, Scale, Globe,
} from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { formatCurrency, formatDate, slugify } from '../utils/format'
import IntegrityBadge from '../components/IntegrityBadge'
import EvidenceChain from '../components/EvidenceChain'
import NetworkGraph from '../components/NetworkGraph'
import './CouncillorDossier.css'

const RISK_CONFIG = {
  low: { label: 'Low Risk', color: '#22c55e', icon: ShieldCheck },
  medium: { label: 'Medium', color: '#f59e0b', icon: Shield },
  elevated: { label: 'Elevated', color: '#f97316', icon: ShieldAlert },
  high: { label: 'High Risk', color: '#ef4444', icon: ShieldX },
}

const SEVERITY_STYLES = {
  critical: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
  high: { bg: 'rgba(255, 107, 107, 0.15)', color: '#ff6b6b' },
  elevated: { bg: 'rgba(255, 159, 10, 0.12)', color: '#ff9f0a' },
  warning: { bg: 'rgba(255, 159, 10, 0.1)', color: '#ff9f0a' },
  medium: { bg: 'rgba(255, 204, 2, 0.1)', color: '#ffcc02' },
  info: { bg: 'rgba(10, 132, 255, 0.1)', color: '#0a84ff' },
  low: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
}

const TABS = [
  { id: 'integrity', label: 'Integrity', icon: Shield },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'register', label: 'Register', icon: FileText },
  { id: 'electoral', label: 'Electoral', icon: Vote },
  { id: 'timeline', label: 'Timeline', icon: Clock },
]

/** Confidence badge component */
function ConfidenceBadge({ tier, score }) {
  const tierClass = tier ? `tier-${tier}` : score >= 85 ? 'tier-1' : score >= 70 ? 'tier-2' : score >= 50 ? 'tier-3' : 'tier-4'
  const label = tier === 1 ? 'Statutory' : tier === 2 ? 'Official' : tier === 3 ? 'Semi-official' : 'Inferred'
  return (
    <span className={`confidence-badge ${tierClass}`} title={`Source: ${label} (${score || '?'}%)`}>
      T{tier || '?'} {score != null ? `${score}%` : ''}
    </span>
  )
}

/** Score Ring SVG */
function ScoreRing({ score, riskLevel, size = 72 }) {
  const riskConfig = RISK_CONFIG[riskLevel] || RISK_CONFIG.medium
  const circumference = Math.PI * (size - 8)
  const offset = circumference - (circumference * Math.min(score || 0, 100)) / 100
  return (
    <div className="score-ring-container">
      <div className="score-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={(size - 8) / 2}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={4}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={(size - 8) / 2}
            fill="none"
            stroke={riskConfig.color}
            strokeWidth={4}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="score-ring-value">{score ?? '?'}</span>
      </div>
      <div className="score-ring-label">{riskConfig.label}</div>
    </div>
  )
}

export default function CouncillorDossier() {
  const { councillorId } = useParams()
  const navigate = useNavigate()
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const [activeTab, setActiveTab] = useState('integrity')

  // Load ALL data sources in parallel
  const { data, loading, error } = useData([
    '/data/councillors.json',
    '/data/integrity.json',
    '/data/register_of_interests.json',
    '/data/elections.json',
    '/data/meetings.json',
    '/data/doge_findings.json',
    '/data/shared/legal_framework.json',
  ])

  const [councillorsRaw, integrity, register, elections, meetings, dogeFindings, legalFramework] = data || [null, null, null, null, null, null, null]

  // Find the councillor across all data sources
  const councillor = useMemo(() => {
    if (!councillorsRaw) return null
    const list = Array.isArray(councillorsRaw) ? councillorsRaw : councillorsRaw.councillors || []
    return list.find(c => {
      const id = c.id || slugify(c.name)
      return id === councillorId || slugify(c.name) === councillorId
    })
  }, [councillorsRaw, councillorId])

  // Find integrity data for this councillor
  const integrityData = useMemo(() => {
    if (!integrity?.councillors || !councillor) return null
    return integrity.councillors.find(c => {
      const id = c.councillor_id || slugify(c.name)
      return id === councillorId || slugify(c.name) === councillorId || c.name === councillor.name
    })
  }, [integrity, councillor, councillorId])

  // Find register data
  const registerData = useMemo(() => {
    if (!register || !councillor) return null
    // register_of_interests.json is keyed by councillor id or name
    if (Array.isArray(register)) {
      return register.find(r => r.name === councillor.name || r.id === councillorId)
    }
    return register[councillorId] || register[councillor.name] || register[councillor.id] || null
  }, [register, councillor, councillorId])

  // Find election data for this councillor's ward
  const electoralData = useMemo(() => {
    if (!elections || !councillor) return null
    const wards = elections.wards || elections
    if (!wards || !Array.isArray(wards)) return null
    return wards.find(w =>
      w.ward === councillor.ward ||
      w.ward_name === councillor.ward ||
      slugify(w.ward || w.ward_name || '') === slugify(councillor.ward || '')
    )
  }, [elections, councillor])

  // Committee memberships from meetings data
  const committees = useMemo(() => {
    if (!meetings?.committees || !councillor) return []
    return meetings.committees.filter(c =>
      c.members?.some(m =>
        m.name?.toLowerCase().includes(councillor.name?.split(' ').pop()?.toLowerCase())
      )
    ).map(c => {
      const member = c.members?.find(m =>
        m.name?.toLowerCase().includes(councillor.name?.split(' ').pop()?.toLowerCase())
      )
      return { name: c.name || c.committee, role: member?.role || 'Member' }
    })
  }, [meetings, councillor])

  // Companies from integrity data
  const companies = useMemo(() => {
    if (!integrityData?.ch) return []
    return integrityData.ch.companies || []
  }, [integrityData])

  // Red flags from integrity data
  const redFlags = useMemo(() => {
    if (!integrityData?.red_flags) return []
    return [...integrityData.red_flags].sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, elevated: 2, warning: 3, medium: 4, info: 5, low: 6 }
      return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
    })
  }, [integrityData])

  // Co-directors from integrity data
  const coDirectors = useMemo(() => {
    if (!integrityData?.ch?.co_directors) return []
    return integrityData.ch.co_directors
  }, [integrityData])

  // Build timeline events from all sources
  const timelineEvents = useMemo(() => {
    const events = []

    // Election events
    if (electoralData?.history) {
      electoralData.history.forEach(election => {
        const candidate = election.candidates?.find(c =>
          c.name?.toLowerCase().includes(councillor?.name?.split(' ').pop()?.toLowerCase()) ||
          slugify(c.name || '') === slugify(councillor?.name || '')
        )
        if (candidate) {
          events.push({
            date: election.date || election.year,
            type: 'election',
            title: candidate.elected ? 'Elected' : 'Stood for election',
            detail: `${electoralData.ward || electoralData.ward_name} — ${candidate.votes} votes (${candidate.pct || '?'}%)`,
            color: '#0a84ff',
            sortDate: new Date(election.date || `${election.year}-05-01`),
          })
        }
      })
    }

    // Company appointments from CH
    companies.forEach(comp => {
      if (comp.appointed_on) {
        events.push({
          date: comp.appointed_on,
          type: 'appointment',
          title: `Appointed ${comp.role || 'director'} of ${comp.company_name || comp.name}`,
          detail: comp.company_number ? `CH: ${comp.company_number}` : '',
          color: '#a855f7',
          sortDate: new Date(comp.appointed_on),
        })
      }
      if (comp.resigned_on) {
        events.push({
          date: comp.resigned_on,
          type: 'resignation',
          title: `Resigned from ${comp.company_name || comp.name}`,
          detail: comp.company_number ? `CH: ${comp.company_number}` : '',
          color: '#94a3b8',
          sortDate: new Date(comp.resigned_on),
        })
      }
    })

    // Sort newest first
    events.sort((a, b) => (b.sortDate?.getTime?.() || 0) - (a.sortDate?.getTime?.() || 0))
    return events
  }, [electoralData, companies, councillor])

  // Supplier conflicts
  const supplierConflicts = useMemo(() => {
    if (!integrityData?.ch?.supplier_conflicts) return []
    return integrityData.ch.supplier_conflicts
  }, [integrityData])

  // Network crossovers
  const networkCrossovers = useMemo(() => {
    if (!integrityData?.ch?.network_crossovers) return []
    return integrityData.ch.network_crossovers
  }, [integrityData])

  // Quick stats
  const stats = useMemo(() => {
    const activeCompanies = companies.filter(c => !c.resigned_on).length
    const totalFlags = redFlags.length
    const highFlags = redFlags.filter(f => ['critical', 'high', 'elevated'].includes(f.severity)).length
    const margin = electoralData?.history?.[0]?.candidates
      ?.find(c => c.elected)?.margin_pct

    return {
      directorships: activeCompanies,
      totalCompanies: companies.length,
      redFlags: totalFlags,
      highRiskFlags: highFlags,
      committees: committees.length,
      margin: margin != null ? margin : null,
      coDirectors: coDirectors.length,
      supplierConflicts: supplierConflicts.length,
    }
  }, [companies, redFlags, committees, electoralData, coDirectors, supplierConflicts])

  // Tab counts for badges
  const tabCounts = useMemo(() => ({
    integrity: redFlags.length,
    companies: companies.length,
    register: registerData ? Object.keys(registerData.sections || registerData).filter(k => k !== 'name' && k !== 'id').length : 0,
    electoral: electoralData?.history?.length || 0,
    timeline: timelineEvents.length,
  }), [redFlags, companies, registerData, electoralData, timelineEvents])

  // Page title
  useEffect(() => {
    if (councillor) {
      document.title = `Cllr ${councillor.name} | ${councilName} Councillor Dossier`
    }
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councillor, councilName])

  if (loading) return <LoadingState message="Loading councillor dossier..." />

  if (error) {
    return (
      <div className="dossier-page" style={{ padding: 'var(--space-2xl)' }}>
        <p style={{ color: '#ef4444' }}>Failed to load councillor data: {error.message}</p>
        <Link to="/integrity" style={{ color: 'var(--accent, #0a84ff)' }}>← Back to Integrity</Link>
      </div>
    )
  }

  if (!councillor) {
    return (
      <div className="dossier-page" style={{ padding: 'var(--space-2xl)', textAlign: 'center' }}>
        <h2>Councillor Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>No councillor found with ID "{councillorId}".</p>
        <Link to="/integrity" style={{ color: 'var(--accent, #0a84ff)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: 'var(--space-md)' }}>
          <ChevronLeft size={16} /> Back to Integrity
        </Link>
      </div>
    )
  }

  const riskLevel = integrityData?.risk_level || 'medium'
  const integrityScore = integrityData?.integrity_score ?? null
  const partyColor = councillor.party_color || '#8e8e93'

  return (
    <div className="dossier-page">
      {/* Back link */}
      <Link
        to="/integrity"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--accent, #0a84ff)',
          fontSize: '0.8rem',
          marginBottom: 'var(--space-lg)',
          textDecoration: 'none',
        }}
      >
        <ChevronLeft size={14} /> Back to Integrity
      </Link>

      {/* ── HEADER ── */}
      <div className="dossier-header">
        {councillor.photo_url ? (
          <img src={councillor.photo_url} alt={councillor.name} className="dossier-photo" />
        ) : (
          <div className="dossier-photo-placeholder">
            <Users size={32} />
          </div>
        )}

        <div className="dossier-header-info">
          <h1>Cllr {councillor.name}</h1>
          <div className="dossier-meta">
            <span className="dossier-meta-tag">
              <span className="party-dot" style={{ backgroundColor: partyColor }} />
              {councillor.party || 'Independent'}
            </span>
            {councillor.ward && (
              <span className="dossier-meta-tag">
                <MapPin size={11} /> {councillor.ward}
              </span>
            )}
            {councillor.roles?.length > 0 && (
              <span className="dossier-meta-tag">
                <Award size={11} /> {councillor.roles[0]}
              </span>
            )}
            {committees.length > 0 && (
              <span className="dossier-meta-tag">
                <Users size={11} /> {committees.length} committee{committees.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {integrityData?.methodology && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 'var(--space-xs)' }}>
              Analysis: {integrityData.methodology} · Sources: {integrityData.sources_checked || '?'}
            </div>
          )}
        </div>

        {integrityScore != null && (
          <ScoreRing score={integrityScore} riskLevel={riskLevel} />
        )}
      </div>

      {/* ── QUICK STATS ── */}
      <div className="dossier-stats stagger-children">
        <div className="dossier-stat-card">
          <div className="dossier-stat-value" style={{ color: stats.directorships > 0 ? '#a855f7' : 'inherit' }}>
            {stats.directorships}
          </div>
          <div className="dossier-stat-label">Active Directorships</div>
        </div>
        <div className="dossier-stat-card">
          <div className="dossier-stat-value" style={{ color: stats.highRiskFlags > 0 ? '#ef4444' : stats.redFlags > 0 ? '#ff9f0a' : '#22c55e' }}>
            {stats.redFlags}
          </div>
          <div className="dossier-stat-label">Red Flags</div>
        </div>
        <div className="dossier-stat-card">
          <div className="dossier-stat-value">{stats.committees}</div>
          <div className="dossier-stat-label">Committees</div>
        </div>
        <div className="dossier-stat-card">
          <div className="dossier-stat-value" style={{ color: stats.supplierConflicts > 0 ? '#ef4444' : 'inherit' }}>
            {stats.supplierConflicts}
          </div>
          <div className="dossier-stat-label">Supplier Conflicts</div>
        </div>
        <div className="dossier-stat-card">
          <div className="dossier-stat-value">{stats.coDirectors}</div>
          <div className="dossier-stat-label">Co-Directors</div>
        </div>
        {stats.margin != null && (
          <div className="dossier-stat-card">
            <div className="dossier-stat-value">{stats.margin.toFixed(1)}%</div>
            <div className="dossier-stat-label">Last Margin</div>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="dossier-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon
          const count = tabCounts[tab.id]
          return (
            <button
              key={tab.id}
              className={`dossier-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              {tab.label}
              {count > 0 && <span className="tab-count">{count}</span>}
            </button>
          )
        })}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="dossier-tab-content">
        {activeTab === 'integrity' && (
          <IntegrityTab
            redFlags={redFlags}
            integrityData={integrityData}
            councillor={councillor}
            legalFramework={legalFramework}
          />
        )}
        {activeTab === 'companies' && (
          <CompaniesTab
            companies={companies}
            coDirectors={coDirectors}
            supplierConflicts={supplierConflicts}
            networkCrossovers={networkCrossovers}
            councillor={councillor}
            integrityData={integrityData}
          />
        )}
        {activeTab === 'register' && (
          <RegisterTab
            registerData={registerData}
            councillor={councillor}
            supplierConflicts={supplierConflicts}
          />
        )}
        {activeTab === 'electoral' && (
          <ElectoralTab
            electoralData={electoralData}
            councillor={councillor}
          />
        )}
        {activeTab === 'timeline' && (
          <TimelineTab events={timelineEvents} />
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 *  TAB COMPONENTS
 * ──────────────────────────────────────────────────────────────────────── */

/** Integrity Tab — All red flags with severity, confidence, legal references */
function IntegrityTab({ redFlags, integrityData, councillor, legalFramework }) {
  if (redFlags.length === 0) {
    return (
      <div className="dossier-empty">
        <ShieldCheck size={40} style={{ color: '#22c55e', marginBottom: 'var(--space-md)' }} />
        <p>No integrity flags detected for Cllr {councillor.name}.</p>
        <p style={{ fontSize: '0.75rem', marginTop: 'var(--space-sm)' }}>
          {integrityData?.sources_checked || 0} sources checked.
        </p>
      </div>
    )
  }

  return (
    <div className="dossier-flags">
      {/* Summary */}
      <div style={{
        padding: 'var(--space-md)',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        marginBottom: 'var(--space-sm)',
      }}>
        {redFlags.length} flag{redFlags.length > 1 ? 's' : ''} detected across {integrityData?.sources_checked || '?'} sources.
        {' '}Critical: {redFlags.filter(f => f.severity === 'critical').length},
        High: {redFlags.filter(f => ['high', 'elevated'].includes(f.severity)).length},
        Other: {redFlags.filter(f => !['critical', 'high', 'elevated'].includes(f.severity)).length}.
      </div>

      {redFlags.map((flag, i) => {
        const style = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info
        const relatedLaw = legalFramework?.find(l =>
          flag.detail?.toLowerCase().includes(l.title?.toLowerCase()) ||
          flag.type?.includes(l.category)
        )
        return (
          <div key={i} className="dossier-flag-card">
            <div className="flag-header">
              <span
                className="flag-severity"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                {flag.severity}
              </span>
              <span className="flag-type">{flag.type || 'unknown'}</span>
              {flag.source_tier && <ConfidenceBadge tier={flag.source_tier} score={flag.confidence} />}
            </div>
            <div className="flag-detail">{flag.detail || flag.description || flag.message}</div>
            {flag.evidence && (
              <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Evidence: {flag.evidence}
              </div>
            )}
            {relatedLaw && (
              <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.7rem' }}>
                <Scale size={10} style={{ verticalAlign: 'middle', marginRight: '3px', color: '#0a84ff' }} />
                <a
                  href={relatedLaw.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#0a84ff', textDecoration: 'none' }}
                >
                  {relatedLaw.law}
                </a>
              </div>
            )}
            {(flag.confidence != null || flag.corroborated_by) && (
              <div className="flag-confidence">
                {flag.confidence != null && <span>Confidence: {flag.confidence}%</span>}
                {flag.corroborated_by?.length > 0 && (
                  <span>Corroborated by: {flag.corroborated_by.join(', ')}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Companies Tab — CH directorships, co-director network, supplier conflicts */
function CompaniesTab({ companies, coDirectors, supplierConflicts, networkCrossovers, councillor, integrityData }) {
  if (companies.length === 0) {
    return (
      <div className="dossier-empty">
        <Building2 size={40} style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }} />
        <p>No Companies House directorships found for Cllr {councillor.name}.</p>
      </div>
    )
  }

  const activeCompanies = companies.filter(c => !c.resigned_on)
  const pastCompanies = companies.filter(c => c.resigned_on)

  return (
    <div className="dossier-companies">
      {/* Active companies */}
      {activeCompanies.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={15} /> Active Directorships ({activeCompanies.length})
          </h3>
          {activeCompanies.map((comp, i) => (
            <CompanyCard key={i} company={comp} supplierConflicts={supplierConflicts} />
          ))}
        </>
      )}

      {/* Past companies */}
      {pastCompanies.length > 0 && (
        <>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={15} /> Past Directorships ({pastCompanies.length})
          </h3>
          {pastCompanies.map((comp, i) => (
            <CompanyCard key={i} company={comp} supplierConflicts={supplierConflicts} past />
          ))}
        </>
      )}

      {/* Supplier conflict evidence chains */}
      {supplierConflicts.length > 0 && (
        <div style={{ marginTop: 'var(--space-xl)' }}>
          <h3 style={{ fontSize: '0.85rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-md)' }}>
            <AlertTriangle size={15} /> Direct Supplier Conflicts ({supplierConflicts.length})
          </h3>
          {supplierConflicts.map((conflict, i) => (
            <EvidenceChain
              key={i}
              finding={`Director of ${conflict.company_name} matches council supplier`}
              supplier={{
                name: conflict.supplier_match?.supplier || conflict.supplier_name || conflict.company_name,
                chNumber: conflict.company_number,
                riskLevel: 'high',
              }}
              totalSpend={conflict.supplier_match?.total_spend}
              councillor={{
                name: councillor.name,
                councillorId: councillor.id || slugify(councillor.name),
                integrityScore: integrityData?.integrity_score,
                riskLevel: integrityData?.risk_level,
              }}
              expandable={false}
            />
          ))}
        </div>
      )}

      {/* Network Graph */}
      {(companies.length > 0 || coDirectors.length > 0) && (
        <div className="dossier-network">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Globe size={15} /> Director Network
          </h3>
          <NetworkGraph
            councillorName={councillor.name}
            companies={companies}
            suppliers={supplierConflicts.map(c => ({
              name: c.supplier_match?.supplier || c.supplier_name || c.company_name,
              spend: c.supplier_match?.total_spend,
            }))}
            coDirectors={coDirectors.map(cd => ({
              name: cd.name || cd.co_director,
              shared_companies: cd.shared_companies || [],
            }))}
            width={700}
            height={Math.max(300, Math.min(500, companies.length * 50 + 100))}
          />
        </div>
      )}

      {/* Network crossovers */}
      {networkCrossovers.length > 0 && (
        <div style={{ marginTop: 'var(--space-xl)' }}>
          <h3 style={{ fontSize: '0.85rem', color: '#ff9f0a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 'var(--space-md)' }}>
            <Users size={15} /> Indirect Network Connections ({networkCrossovers.length})
          </h3>
          {networkCrossovers.slice(0, 10).map((link, i) => (
            <div key={i} className="company-card" style={{ marginBottom: 'var(--space-sm)' }}>
              <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
                Shares directorship of <strong>{link.councillor_company}</strong> with{' '}
                <strong>{link.co_director}</strong>
                {link.co_director_company && (
                  <>, who also directs <strong>{link.co_director_company}</strong></>
                )}
                {link.supplier_company && (
                  <> (matches supplier: <strong>{link.supplier_company}</strong>
                  {link.supplier_spend > 0 && <>, £{link.supplier_spend.toLocaleString('en-GB')}</>})
                </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Single Company Card */
function CompanyCard({ company, supplierConflicts = [], past = false }) {
  const isConflict = supplierConflicts.some(c =>
    c.company_number === company.company_number || c.company_name === (company.company_name || company.name)
  )
  const chUrl = company.company_number ? `https://find-and-update.company-information.service.gov.uk/company/${company.company_number}` : null
  const status = company.company_status || (past ? 'resigned' : 'active')

  return (
    <div className={`company-card${isConflict ? ' conflict' : ''}`}>
      <div className="company-header">
        <div className="company-name">
          {company.company_name || company.name}
          {isConflict && <AlertTriangle size={14} style={{ color: '#ef4444' }} />}
          {chUrl && (
            <a href={chUrl} target="_blank" rel="noopener noreferrer" title="View on Companies House" style={{ color: 'var(--text-secondary)' }}>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <span className={`company-status ${past ? 'resigned' : status === 'active' ? 'active' : 'dissolved'}`}>
          {past ? 'Resigned' : status}
        </span>
      </div>
      <div className="company-meta">
        {company.company_number && <span>CH: {company.company_number}</span>}
        {company.role && <span>Role: {company.role}</span>}
        {company.appointed_on && <span>Appointed: {formatDate(company.appointed_on)}</span>}
        {company.resigned_on && <span>Resigned: {formatDate(company.resigned_on)}</span>}
        {company.company_status && company.company_status !== 'active' && !past && (
          <span style={{ color: '#ef4444' }}>Status: {company.company_status}</span>
        )}
      </div>
      {isConflict && (
        <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={12} /> This company matches a council supplier
        </div>
      )}
    </div>
  )
}

/** Register Tab — Employment, land, securities with conflict flags */
function RegisterTab({ registerData, councillor, supplierConflicts }) {
  if (!registerData) {
    return (
      <div className="dossier-empty">
        <FileText size={40} style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }} />
        <p>No register of interests data available for Cllr {councillor.name}.</p>
        <p style={{ fontSize: '0.75rem', marginTop: 'var(--space-sm)', color: 'var(--text-secondary)' }}>
          Register data may not have been scraped for this council.
        </p>
      </div>
    )
  }

  // Extract sections from register data
  const sections = registerData.sections || registerData
  const employment = sections.declared_employment || sections.employment || []
  const land = sections.declared_land || sections.land_property || sections.land || []
  const securities = sections.declared_securities || sections.securities || []
  const companies = sections.declared_companies || sections.companies || []
  const gifts = sections.gifts_hospitality || sections.gifts || []
  const sponsorships = sections.sponsorships || []

  const hasAny = [employment, land, securities, companies, gifts, sponsorships].some(a =>
    (Array.isArray(a) && a.length > 0) || (typeof a === 'string' && a.length > 0)
  )

  if (!hasAny) {
    return (
      <div className="dossier-empty">
        <FileText size={40} style={{ color: '#ff9f0a', marginBottom: 'var(--space-md)' }} />
        <p>Register appears empty for Cllr {councillor.name}.</p>
        <p style={{ fontSize: '0.75rem', marginTop: 'var(--space-sm)', color: '#ff9f0a' }}>
          An empty register may indicate non-disclosure — this is itself a concern under the Localism Act 2011.
        </p>
      </div>
    )
  }

  return (
    <div>
      <RegisterSection title="Employment" icon={<Briefcase size={15} />} items={employment} supplierConflicts={supplierConflicts} />
      <RegisterSection title="Companies" icon={<Building2 size={15} />} items={companies} />
      <RegisterSection title="Land & Property" icon={<MapPin size={15} />} items={land} />
      <RegisterSection title="Securities" icon={<TrendingUp size={15} />} items={securities} supplierConflicts={supplierConflicts} />
      <RegisterSection title="Gifts & Hospitality" icon={<Award size={15} />} items={gifts} />
      <RegisterSection title="Sponsorships" icon={<Globe size={15} />} items={sponsorships} />
    </div>
  )
}

/** A single register section */
function RegisterSection({ title, icon, items, supplierConflicts = [] }) {
  if (!items || (Array.isArray(items) && items.length === 0) || items === 'None' || items === 'nil') return null

  const itemList = Array.isArray(items) ? items : [items]

  return (
    <div className="register-section">
      <h3>{icon} {title} ({itemList.length})</h3>
      <div className="register-items">
        {itemList.map((item, i) => {
          const text = typeof item === 'string' ? item : item.name || item.description || item.employer || JSON.stringify(item)
          const isConflict = supplierConflicts.some(c =>
            text.toLowerCase().includes((c.supplier_match?.supplier || c.company_name || '').toLowerCase().substring(0, 10))
          )
          return (
            <div key={i} className={`register-item${isConflict ? ' conflict' : ''}`}>
              {text}
              {isConflict && (
                <span style={{ marginLeft: 'var(--space-sm)', fontSize: '0.65rem', color: '#ef4444', fontWeight: 600 }}>
                  ⚠ Supplier conflict
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Electoral Tab — Election history, margin trends, ward context */
function ElectoralTab({ electoralData, councillor }) {
  if (!electoralData) {
    return (
      <div className="dossier-empty">
        <Vote size={40} style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }} />
        <p>No electoral data available for {councillor.ward || 'this ward'}.</p>
      </div>
    )
  }

  const history = electoralData.history || []
  const wardName = electoralData.ward || electoralData.ward_name || councillor.ward

  return (
    <div>
      <h3 style={{ fontSize: '0.9rem', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <MapPin size={15} /> {wardName}
      </h3>

      {/* Ward context */}
      {(electoralData.electorate || electoralData.seats) && (
        <div style={{
          display: 'flex',
          gap: 'var(--space-lg)',
          marginBottom: 'var(--space-xl)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          flexWrap: 'wrap',
        }}>
          {electoralData.electorate && <span>Electorate: {electoralData.electorate.toLocaleString()}</span>}
          {electoralData.seats && <span>Seats: {electoralData.seats}</span>}
          {electoralData.next_election && <span>Next election: {electoralData.next_election}</span>}
        </div>
      )}

      {/* Election history table */}
      {history.length > 0 && (
        <table className="election-history-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Candidate</th>
              <th>Party</th>
              <th>Votes</th>
              <th>%</th>
              <th>Margin</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {history.map((election, ei) => {
              const candidates = election.candidates || []
              const sorted = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0))
              const winner = sorted[0]
              const runnerUp = sorted[1]
              const marginVotes = winner && runnerUp ? (winner.votes || 0) - (runnerUp.votes || 0) : null
              const totalVotes = candidates.reduce((sum, c) => sum + (c.votes || 0), 0)

              return sorted.map((cand, ci) => {
                const isCouncillor = cand.name?.toLowerCase().includes(councillor.name?.split(' ').pop()?.toLowerCase())
                const marginPct = ci === 0 && marginVotes != null && totalVotes > 0
                  ? ((marginVotes / totalVotes) * 100).toFixed(1) : null
                return (
                  <tr key={`${ei}-${ci}`} style={isCouncillor ? { fontWeight: 600, color: 'var(--text-primary)' } : {}}>
                    {ci === 0 ? (
                      <td rowSpan={sorted.length} style={{ verticalAlign: 'top' }}>
                        {election.year || election.date?.substring(0, 4)}
                      </td>
                    ) : null}
                    <td>{cand.name}{isCouncillor ? ' ★' : ''}</td>
                    <td>{cand.party}</td>
                    <td>{(cand.votes || 0).toLocaleString()}</td>
                    <td>{cand.pct || (totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : '-')}%</td>
                    <td>
                      {ci === 0 && marginPct && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div className="margin-bar" style={{ width: `${Math.min(marginPct * 2, 100)}%`, minWidth: '4px' }} />
                          <span style={{ fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>{marginPct}%</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {cand.elected && (
                        <span style={{ color: '#22c55e', fontSize: '0.7rem', fontWeight: 600 }}>ELECTED</span>
                      )}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      )}

      {history.length === 0 && (
        <div className="dossier-empty">
          <p>No election history records found.</p>
        </div>
      )}
    </div>
  )
}

/** Timeline Tab — Chronological events */
function TimelineTab({ events }) {
  if (events.length === 0) {
    return (
      <div className="dossier-empty">
        <Clock size={40} style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }} />
        <p>No timeline events available.</p>
      </div>
    )
  }

  return (
    <div className="dossier-timeline">
      {events.map((event, i) => (
        <div key={i} className="timeline-event">
          <div className="timeline-dot" style={{ borderColor: event.color, backgroundColor: event.color }} />
          <div className="timeline-date">{formatDate(event.date) || event.date}</div>
          <div className="timeline-title">{event.title}</div>
          {event.detail && <div className="timeline-detail">{event.detail}</div>}
        </div>
      ))}
    </div>
  )
}
