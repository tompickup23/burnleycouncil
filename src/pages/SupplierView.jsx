import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Building, Shield, AlertTriangle, Users, FileText, Calendar, ExternalLink, MapPin, Briefcase, CheckCircle, XCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatNumber, formatDate, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { SEVERITY_COLORS, TOOLTIP_STYLE } from '../utils/constants'
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
  const { data: profilesData, loading, error } = useData('/data/supplier_profiles.json')

  const profile = profilesData?.profiles?.find(p => p.id === supplierId)

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

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
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

  const { spending, companies_house, compliance, governance } = profile
  const riskColor = compliance ? RISK_COLORS[compliance.risk_level] || RISK_COLORS.low : null

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
          <span className="supplier-stat-value">{formatCurrency(spending?.total_all_councils, true)}</span>
          <span className="supplier-stat-label">Total Spend (All Councils)</span>
        </div>
        <div className="supplier-stat-card">
          <span className="supplier-stat-value">{formatNumber(spending?.transaction_count)}</span>
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
          <span className="supplier-stat-value">{formatNumber(spending?.councils_count)}</span>
          <span className="supplier-stat-label">Councils Supplying</span>
        </div>
        <div className="supplier-stat-card">
          <span className="supplier-stat-value">
            {profile.metadata?.data_quality != null
              ? formatPercent(profile.metadata.data_quality * 100, 0)
              : '-'}
          </span>
          <span className="supplier-stat-label">Data Quality</span>
        </div>
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

      {/* CTA */}
      <section className="supplier-cta">
        <h3>Explore full transaction history</h3>
        <p>View every payment made to {profile.name} in the spending explorer.</p>
        <Link
          to={`/spending?supplier=${encodeURIComponent(profile.canonical)}`}
          className="cta-link"
        >
          View Transactions <ExternalLink size={16} />
        </Link>
      </section>
    </div>
  )
}

export default SupplierView
