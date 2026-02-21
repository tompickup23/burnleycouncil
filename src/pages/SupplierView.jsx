import { useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Building, Building2, Shield, AlertTriangle, Users, FileText, Calendar, ExternalLink, MapPin, Briefcase, CheckCircle, XCircle, Scale, Handshake, PoundSterling } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatNumber, formatDate, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { SEVERITY_COLORS, TOOLTIP_STYLE, COUNCIL_COLORS } from '../utils/constants'
import './SupplierView.css'

const RISK_COLORS = {
  clean: '#30d158',
  low: '#0a84ff',
  medium: '#ffd60a',
  high: '#ff9f0a',
  critical: '#ff453a',
}

function SupplierView() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { supplierId } = useParams()

  // Try full profiles first, then lightweight index
  const { data: profilesData, loading: loading1, error: error1 } = useData('/data/supplier_profiles.json')
  const { data: indexData, loading: loading2, error: error2 } = useData('/data/supplier_index.json')
  const { data: integrityData } = useData('/data/integrity.json')
  const { data: procurementData } = useData('/data/procurement.json')

  const profile = profilesData?.profiles?.find(p => p.id === supplierId)
    || indexData?.profiles?.find(p => p.id === supplierId)
  const isLightweight = !profilesData?.profiles?.find(p => p.id === supplierId) && !!profile
  // Show loading while either source is still loading AND we haven't found a profile yet
  // This prevents "not found" flash when profiles 404s but index is still loading
  const loading = !profile && (loading1 || loading2)

  // Find councillors with conflicts related to this supplier
  const councillorConflicts = useMemo(() => {
    if (!integrityData?.councillors || !profile) return []
    const canonical = (profile.canonical || profile.name || '').toUpperCase()
    if (!canonical) return [] // Guard against empty string matching everything
    const matchSupplier = (sc) => {
      const supplierName = (sc.supplier_match?.supplier || '').toUpperCase()
      if (!supplierName) return false
      return supplierName.includes(canonical) || canonical.includes(supplierName)
    }
    return integrityData.councillors
      .filter(c => (c.supplier_conflicts || []).some(matchSupplier))
      .map(c => ({
        name: c.name,
        party: c.party,
        ward: c.ward,
        risk_level: c.risk_level,
        conflicts: c.supplier_conflicts.filter(matchSupplier),
      }))
  }, [integrityData, profile])

  // Find procurement contracts for this supplier
  const supplierContracts = useMemo(() => {
    if (!procurementData?.contracts || !profile) return []
    const names = [profile.canonical, profile.name, ...(profile.aliases || [])].filter(Boolean)
    const normalise = s => (s || '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]/g, '')
    const normNames = names.map(normalise)
    return procurementData.contracts.filter(c => {
      if (!c.awarded_supplier) return false
      const norm = normalise(c.awarded_supplier)
      return normNames.some(n => norm.includes(n) || n.includes(norm))
    })
  }, [procurementData, profile])

  // Cross-council chart data (from lightweight profiles) — must be before early returns (Rules of Hooks)
  const councilChartData = useMemo(() => {
    const sp = profile?.spending || null
    if (sp?.by_council) {
      return sp.by_council.map(c => ({
        council: (c.council || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
        amount: c.total,
      })).sort((a, b) => b.amount - a.amount)
    }
    if (profile?.councils?.length > 1) {
      return null
    }
    return null
  }, [profile])

  useEffect(() => {
    if (profile) {
      document.title = `${profile.name} | Supplier Profile | ${councilName} Council Transparency`
    } else {
      document.title = `Supplier Profile | ${councilName} Council Transparency`
    }
    return () => {
      document.title = `${councilName} Council Transparency | Where Your Money Goes`
    }
  }, [profile, councilName])

  if (loading) {
    return <LoadingState message="Loading supplier profile..." />
  }

  // Both sources failed with network errors (not just 404)
  if (!profile && error1 && error2) {
    return (
      <div className="supplier-view animate-fade-in">
        <Link to="/suppliers" className="back-button">
          <ArrowLeft size={18} /> Back to Suppliers
        </Link>
        <div className="supplier-not-found">
          <AlertTriangle size={48} />
          <h2>Unable to load supplier data</h2>
          <p>There was an error loading supplier profiles. Please try again later.</p>
          <Link to="/suppliers" className="not-found-link">View all suppliers</Link>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="supplier-view animate-fade-in">
        <Link to="/suppliers" className="back-button">
          <ArrowLeft size={18} /> Back to Suppliers
        </Link>
        <div className="supplier-not-found">
          <AlertTriangle size={48} />
          <h2>Supplier not found</h2>
          <p>The supplier profile you are looking for does not exist or has been removed.</p>
          <Link to="/suppliers" className="not-found-link">View all suppliers</Link>
        </div>
      </div>
    )
  }

  // Handle both full profiles (nested objects) and lightweight index (flat fields)
  const spending = profile.spending || null
  const companies_house = profile.companies_house || (profile.ch_number ? {
    company_number: profile.ch_number,
    status: profile.ch_status,
    url: profile.ch_url,
    sic_codes: profile.ch_sic_codes,
    company_type: profile.ch_type,
    incorporated: profile.ch_incorporated,
  } : null)
  const compliance = profile.compliance || (profile.risk_level ? {
    risk_level: profile.risk_level,
  } : null)
  const governance = profile.governance || null
  const riskColor = compliance ? RISK_COLORS[compliance.risk_level] || RISK_COLORS.low : null
  const integrityScore = profile.integrity_score ?? null
  const integrityFlags = profile.integrity_flags || []

  // Prepare chart data
  const yearChartData = spending?.by_year
    ? Object.entries(spending.by_year)
        .map(([year, amount]) => ({ year, amount }))
        .sort((a, b) => a.year.localeCompare(b.year))
    : []

  const quarterChartData = spending?.by_quarter
    ? Object.entries(spending.by_quarter)
        .map(([q, amount]) => ({ quarter: `Q${q}`, amount }))
        .sort((a, b) => Number(a.quarter.replace('Q', '')) - Number(b.quarter.replace('Q', '')))
    : []

  const statusLabel = companies_house?.status
    ? companies_house.status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null

  const isActive = companies_house?.status === 'active'
  const isDissolved = companies_house?.dissolved != null
  const chUrl = companies_house?.url || (companies_house?.company_number
    ? `https://find-and-update.company-information.service.gov.uk/company/${companies_house.company_number}`
    : null)

  return (
    <div className="supplier-view animate-fade-in">
      {/* Back Button */}
      <Link to="/suppliers" className="back-button">
        <ArrowLeft size={18} /> Back to Suppliers
      </Link>

      {/* Hero Section */}
      <header className="supplier-hero">
        <div className="hero-title-row">
          <div className="hero-titles">
            <h1>{profile.name}</h1>
            {companies_house && companies_house.legal_name && companies_house.legal_name !== profile.name && (
              <p className="legal-name">
                <Building size={16} />
                Legal name: {companies_house.legal_name}
              </p>
            )}
          </div>
          <div className="hero-badges">
            {statusLabel && (
              <span
                className={`status-badge ${isActive ? 'active' : 'inactive'}`}
              >
                {isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {statusLabel}
              </span>
            )}
            {compliance && (
              <span
                className="risk-badge"
                style={{
                  background: `${riskColor}18`,
                  color: riskColor,
                  borderColor: `${riskColor}40`,
                }}
              >
                <Shield size={14} />
                {(compliance.risk_level || 'unknown').charAt(0).toUpperCase() + (compliance.risk_level || 'unknown').slice(1)} Risk
              </span>
            )}
            {integrityScore !== null && (
              <span className={`integrity-score-badge ${integrityScore >= 80 ? 'good' : integrityScore >= 50 ? 'medium' : 'poor'}`}>
                <Scale size={14} />
                Integrity: {integrityScore}/100
              </span>
            )}
            {chUrl && (
              <a
                href={chUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ch-hero-btn"
                onClick={e => e.stopPropagation()}
              >
                <Building2 size={14} />
                Companies House
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
        {profile.aliases && profile.aliases.length > 0 && (
          <div className="aliases">
            <span className="aliases-label">Also known as:</span>
            {profile.aliases.map((alias, i) => (
              <span key={i} className="alias-tag">{alias}</span>
            ))}
          </div>
        )}
      </header>

      {/* Stats Grid */}
      <section className="supplier-stats-grid">
        <div className="supplier-stat-card highlight">
          <span className="supplier-stat-value">{formatCurrency(spending?.total_all_councils || profile.total_spend, true)}</span>
          <span className="supplier-stat-label">Total Spend{(spending?.councils_count || profile.councils_count || 0) > 1 ? ' (All Councils)' : ''}</span>
        </div>
        <div className="supplier-stat-card">
          <span className="supplier-stat-value">{formatNumber(spending?.transaction_count || profile.transaction_count)}</span>
          <span className="supplier-stat-label">Transactions</span>
        </div>
        <div className="supplier-stat-card">
          <span className="supplier-stat-value">{formatCurrency(spending?.avg_payment, true)}</span>
          <span className="supplier-stat-label">Average Payment</span>
        </div>
        <div className="supplier-stat-card">
          <span className="supplier-stat-value">{formatCurrency(spending?.max_payment, true)}</span>
          <span className="supplier-stat-label">Max Payment</span>
        </div>
        <div className="supplier-stat-card">
          <span className="supplier-stat-value">{formatNumber(spending?.councils_count || profile.councils_count)}</span>
          <span className="supplier-stat-label">Councils Supplying</span>
        </div>
        {supplierContracts.length > 0 ? (
          <div className="supplier-stat-card">
            <span className="supplier-stat-value">{supplierContracts.length}</span>
            <span className="supplier-stat-label">Public Contracts</span>
          </div>
        ) : councillorConflicts.length > 0 ? (
          <div className="supplier-stat-card">
            <span className="supplier-stat-value" style={{ color: '#ff9f0a' }}>{councillorConflicts.length}</span>
            <span className="supplier-stat-label">Councillor Links</span>
          </div>
        ) : (
          <div className="supplier-stat-card">
            <span className="supplier-stat-value">
              {profile.metadata?.data_quality != null
                ? formatPercent(profile.metadata.data_quality * 100, 0)
                : '-'}
            </span>
            <span className="supplier-stat-label">Data Quality</span>
          </div>
        )}
      </section>

      {/* Charts Section */}
      {(yearChartData.length > 0 || quarterChartData.length > 0) && (
        <section className="supplier-charts">
          {yearChartData.length > 0 && (
            <div className="supplier-chart-card">
              <h3>Spending by Year</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yearChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatCurrency(value), 'Spend']}
                    labelFormatter={(l) => `FY ${l}`}
                  />
                  <Bar dataKey="amount" fill="#0a84ff" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {quarterChartData.length > 0 && (
            <div className="supplier-chart-card">
              <h3>Spending by Quarter</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={quarterChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="quarter"
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatCurrency(value), 'Spend']}
                  />
                  <Bar dataKey="amount" fill="#bf5af2" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      )}

      {/* Council Breakdown Table */}
      {spending?.by_council && spending.by_council.length > 0 && (
        <section className="supplier-section">
          <h2><Building size={22} /> Council Breakdown</h2>
          <div className="supplier-table-wrapper">
            <table className="supplier-table" role="table" aria-label="Supplier spending by council">
              <thead>
                <tr>
                  <th scope="col">Council</th>
                  <th scope="col">Total Spend</th>
                  <th scope="col">Transactions</th>
                  <th scope="col">Years Active</th>
                </tr>
              </thead>
              <tbody>
                {spending.by_council.map((row, i) => (
                  <tr key={i}>
                    <td className="council-name-cell">
                      {(row.council || '').charAt(0).toUpperCase() + (row.council || '').slice(1)}
                    </td>
                    <td className="amount-cell">{formatCurrency(row.total)}</td>
                    <td>{formatNumber(row.count)}</td>
                    <td className="years-cell">
                      {row.years && row.years.length > 0
                        ? row.years.join(', ')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Department Breakdown Table */}
      {spending?.by_department && spending.by_department.length > 0 && (
        <section className="supplier-section">
          <h2><Briefcase size={22} /> Department Breakdown</h2>
          <div className="supplier-table-wrapper">
            <table className="supplier-table" role="table" aria-label="Supplier spending by department">
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">Total Spend</th>
                  <th scope="col">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {spending.by_department.map((row, i) => (
                  <tr key={i}>
                    <td>{row.department}</td>
                    <td className="amount-cell">{formatCurrency(row.total)}</td>
                    <td>{formatNumber(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Companies House Section */}
      {companies_house && (
        <section className="supplier-section">
          <h2><FileText size={22} /> Companies House</h2>
          <div className="ch-card">
            <div className="ch-grid">
              <div className="ch-field">
                <span className="ch-label">Company Number</span>
                <a
                  href={companies_house.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ch-link"
                >
                  {companies_house.company_number}
                  <ExternalLink size={14} />
                </a>
              </div>
              <div className="ch-field">
                <span className="ch-label">Legal Name</span>
                <span className="ch-value">{companies_house.legal_name}</span>
              </div>
              <div className="ch-field">
                <span className="ch-label">Company Type</span>
                <span className="ch-value">{companies_house.company_type?.toUpperCase() || '-'}</span>
              </div>
              <div className="ch-field">
                <span className="ch-label">SIC Codes</span>
                <span className="ch-value">
                  {companies_house.sic_codes && companies_house.sic_codes.length > 0
                    ? companies_house.sic_codes.join(', ')
                    : '-'}
                </span>
              </div>
              <div className="ch-field">
                <span className="ch-label">Incorporated</span>
                <span className="ch-value">
                  <Calendar size={14} />
                  {formatDate(companies_house.incorporated)}
                </span>
              </div>
              {companies_house.dissolved && (
                <div className="ch-field">
                  <span className="ch-label">Dissolved</span>
                  <span className="ch-value ch-dissolved">
                    <XCircle size={14} />
                    {formatDate(companies_house.dissolved)}
                  </span>
                </div>
              )}
              {companies_house.address && (
                <div className="ch-field ch-field-wide">
                  <span className="ch-label">Registered Address</span>
                  <span className="ch-value">
                    <MapPin size={14} />
                    {[
                      companies_house.address.address_line_1,
                      companies_house.address.locality,
                      companies_house.address.region,
                      companies_house.address.postal_code,
                    ].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Compliance Section */}
      {compliance && (
        <section className="supplier-section">
          <h2><Shield size={22} /> Compliance</h2>
          <div className="compliance-card">
            <div className="compliance-header">
              <span
                className="risk-badge-lg"
                style={{
                  background: `${riskColor}18`,
                  color: riskColor,
                  borderColor: `${riskColor}40`,
                }}
              >
                <Shield size={18} />
                {(compliance.risk_level || 'unknown').charAt(0).toUpperCase() + (compliance.risk_level || 'unknown').slice(1)} Risk
              </span>
              {compliance.violation_count > 0 && (
                <span className="violation-count">
                  {compliance.violation_count} violation{compliance.violation_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="compliance-flags">
              <div className="compliance-flag">
                <span className="flag-label">Accounts Overdue</span>
                {compliance.filing_status?.accounts_overdue
                  ? <span className="flag-bad"><XCircle size={16} /> Yes</span>
                  : <span className="flag-good"><CheckCircle size={16} /> No</span>
                }
              </div>
              <div className="compliance-flag">
                <span className="flag-label">Confirmation Overdue</span>
                {compliance.filing_status?.confirmation_overdue
                  ? <span className="flag-bad"><XCircle size={16} /> Yes</span>
                  : <span className="flag-good"><CheckCircle size={16} /> No</span>
                }
              </div>
              <div className="compliance-flag">
                <span className="flag-label">Insolvency History</span>
                {compliance.insolvency_history
                  ? <span className="flag-bad"><XCircle size={16} /> Yes</span>
                  : <span className="flag-good"><CheckCircle size={16} /> No</span>
                }
              </div>
              <div className="compliance-flag">
                <span className="flag-label">Address Undeliverable</span>
                {compliance.address_flags?.undeliverable
                  ? <span className="flag-bad"><XCircle size={16} /> Yes</span>
                  : <span className="flag-good"><CheckCircle size={16} /> No</span>
                }
              </div>
              <div className="compliance-flag">
                <span className="flag-label">Address In Dispute</span>
                {compliance.address_flags?.in_dispute
                  ? <span className="flag-bad"><XCircle size={16} /> Yes</span>
                  : <span className="flag-good"><CheckCircle size={16} /> No</span>
                }
              </div>
            </div>

            {compliance.violations && compliance.violations.length > 0 && (
              <div className="violations-list">
                <h3>Violations</h3>
                {compliance.violations.map((v, i) => {
                  const sevColor = SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.info
                  return (
                    <div key={i} className="violation-item">
                      <div className="violation-header">
                        <span
                          className="severity-badge"
                          style={{
                            background: `${sevColor}18`,
                            color: sevColor,
                            borderColor: `${sevColor}40`,
                          }}
                        >
                          {v.severity.charAt(0).toUpperCase() + v.severity.slice(1)}
                        </span>
                        {!v.current && (
                          <span className="historical-badge">Historical</span>
                        )}
                        {v.law && (
                          <span className="law-ref">{v.law}</span>
                        )}
                      </div>
                      <h4 className="violation-title">{v.title}</h4>
                      <p className="violation-detail">{v.detail}</p>
                      {(v.active_from || v.active_to) && (
                        <div className="violation-dates">
                          <Calendar size={14} />
                          {v.active_from && <span>From: {formatDate(v.active_from)}</span>}
                          {v.active_to && <span>To: {formatDate(v.active_to)}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Governance Section */}
      {governance && (
        <section className="supplier-section">
          <h2><Users size={22} /> Governance</h2>
          <div className="governance-card">
            <div className="governance-summary">
              <span className="governance-stat">
                <Users size={18} />
                <strong>{governance.active_directors}</strong> Active Director{governance.active_directors !== 1 ? 's' : ''}
              </span>
            </div>

            {governance.directors && governance.directors.length > 0 && (
              <div className="governance-subsection">
                <h3>Directors</h3>
                <div className="directors-grid">
                  {governance.directors.map((d, i) => (
                    <div key={i} className="director-card">
                      <span className="director-name">{d.name}</span>
                      <span className="director-role">{d.role}</span>
                      <span className="director-appointed">
                        <Calendar size={12} />
                        Appointed {formatDate(d.appointed)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {governance.pscs && governance.pscs.length > 0 && (
              <div className="governance-subsection">
                <h3>Persons with Significant Control</h3>
                <div className="pscs-list">
                  {governance.pscs.map((psc, i) => (
                    <div key={i} className="psc-item">
                      <div className="psc-info">
                        <span className="psc-name">{psc.name}</span>
                        <span className="psc-kind">{psc.kind.replace(/-/g, ' ')}</span>
                      </div>
                      {psc.sanctioned && (
                        <span className="sanctioned-badge">
                          <AlertTriangle size={14} /> Sanctioned
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Cross-Council Comparison Chart */}
      {councilChartData && councilChartData.length > 1 && (
        <section className="supplier-section">
          <h2><Building2 size={22} /> Cross-Council Comparison</h2>
          <div className="supplier-chart-card">
            <ResponsiveContainer width="100%" height={Math.max(200, councilChartData.length * 45)}>
              <BarChart data={councilChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, true)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="council"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  width={120}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatCurrency(value), 'Spend']}
                />
                <Bar dataKey="amount" fill="#bf5af2" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Integrity Flags (from lightweight index) */}
      {integrityFlags.length > 0 && (
        <section className="supplier-section">
          <h2><Scale size={22} /> Supplier Integrity Assessment</h2>
          <div className="integrity-assessment-card">
            <div className="integrity-score-header">
              <div className={`integrity-score-circle ${integrityScore >= 80 ? 'good' : integrityScore >= 50 ? 'medium' : 'poor'}`}>
                <span className="score-value">{integrityScore}</span>
                <span className="score-max">/100</span>
              </div>
              <div className="integrity-score-detail">
                <h4>{integrityScore >= 80 ? 'Good Standing' : integrityScore >= 50 ? 'Some Concerns' : 'Significant Issues'}</h4>
                <p>{integrityFlags.length} issue{integrityFlags.length !== 1 ? 's' : ''} identified from Companies House records</p>
              </div>
            </div>
            <div className="integrity-flags-list">
              {integrityFlags.map((flag, i) => {
                const sevColor = flag.severity === 'critical' ? '#ff453a' : flag.severity === 'high' ? '#ff9f0a' : flag.severity === 'medium' ? '#ffd60a' : '#8e8e93'
                return (
                  <div key={i} className="integrity-flag-item">
                    <span className="integrity-flag-badge" style={{ background: `${sevColor}18`, color: sevColor, borderColor: `${sevColor}40` }}>
                      {flag.severity}
                    </span>
                    <span className="integrity-flag-type">{(flag.type || '').replace(/_/g, ' ')}</span>
                    <span className="integrity-flag-detail">{flag.detail}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Councillor Conflicts Section */}
      {councillorConflicts.length > 0 && (
        <section className="supplier-section">
          <h2><Handshake size={22} /> Councillor Connections</h2>
          <p className="section-subtitle">Councillors whose business interests match this supplier</p>
          <div className="councillor-conflicts-list">
            {councillorConflicts.map((cllr, i) => (
              <div key={i} className="councillor-conflict-card">
                <div className="conflict-cllr-info">
                  <Link to="/integrity" className="conflict-cllr-name">{cllr.name}</Link>
                  <div className="conflict-cllr-meta">
                    <span className="conflict-party">{cllr.party}</span>
                    {cllr.ward && <span className="conflict-ward">{cllr.ward}</span>}
                    <span className={`conflict-risk-badge risk-${cllr.risk_level}`}>{cllr.risk_level} risk</span>
                  </div>
                </div>
                <div className="conflict-details">
                  {cllr.conflicts.map((conf, j) => (
                    <div key={j} className="conflict-detail-item">
                      <AlertTriangle size={14} className="conflict-icon" />
                      <span>{conf.supplier_match?.company_name || conf.type || 'Business interest match'}</span>
                      {conf.supplier_match?.ch_url && (
                        <a href={conf.supplier_match.ch_url} target="_blank" rel="noopener noreferrer" className="conflict-ch-link">
                          <Building2 size={12} /> CH
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Procurement Contracts Section */}
      {supplierContracts.length > 0 && (
        <section className="supplier-section">
          <h2><PoundSterling size={22} /> Public Contracts</h2>
          <p className="section-subtitle">{supplierContracts.length} contract{supplierContracts.length !== 1 ? 's' : ''} found on Contracts Finder</p>
          <div className="supplier-table-wrapper">
            <table className="supplier-table" role="table" aria-label="Procurement contracts for this supplier">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Value</th>
                  <th scope="col">Published</th>
                  <th scope="col">Link</th>
                </tr>
              </thead>
              <tbody>
                {supplierContracts.map((contract, i) => (
                  <tr key={i}>
                    <td className="contract-title-cell">{contract.title}</td>
                    <td>
                      <span className={`contract-status-badge ${(contract.status || '').toLowerCase().replace(/\s/g, '-')}`}>
                        {contract.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="amount-cell">{contract.value_low ? formatCurrency(contract.value_low) : '-'}</td>
                    <td className="date-cell">{contract.published_date ? formatDate(contract.published_date) : '-'}</td>
                    <td>
                      {contract.link && (
                        <a
                          href={contract.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="contract-ext-link"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="supplier-cta">
        <h3>Explore full transaction history</h3>
        <p>View every payment made to {profile.name} in the spending explorer.</p>
        <div className="cta-buttons">
          <Link
            to={`/spending?supplier=${encodeURIComponent(profile.canonical || profile.name)}`}
            className="cta-link"
          >
            View Transactions <ExternalLink size={16} />
          </Link>
          {chUrl && (
            <a
              href={chUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cta-link cta-ch"
            >
              <Building2 size={16} /> Companies House <ExternalLink size={14} />
            </a>
          )}
        </div>
      </section>
    </div>
  )
}

export default SupplierView
