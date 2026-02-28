import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Shield, ChevronRight, TrendingUp, Building,
  PoundSterling, Users, Repeat, GitCompareArrows, Eye,
  CheckCircle, XCircle, HelpCircle, FileText, Scale,
  BarChart3, Search, ArrowUpRight, Info, ChevronDown, ChevronUp,
  Clock, Zap, Activity, ShieldAlert, Target
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis, Legend
} from 'recharts'
import { formatCurrency, formatNumber, formatPercent, slugify } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import CouncillorLink from '../components/CouncillorLink'
import IntegrityBadge from '../components/IntegrityBadge'
import { SEVERITY_COLORS as severityColors, TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../utils/constants'
import './DogeInvestigation.css'

// Confidence badge
function ConfidenceBadge({ level }) {
  const map = {
    high: { icon: CheckCircle, color: '#30d158', label: 'High Confidence' },
    medium: { icon: HelpCircle, color: '#ff9f0a', label: 'Medium Confidence' },
    low: { icon: XCircle, color: '#ff453a', label: 'Low Confidence' },
    verified: { icon: Shield, color: '#30d158', label: 'Verified' },
  }
  const conf = map[level] || map.medium
  const Icon = conf.icon
  return (
    <span className="confidence-badge" style={{ color: conf.color, borderColor: `${conf.color}33` }}>
      <Icon size={14} /> {conf.label}
    </span>
  )
}

// Expandable section
function ExpandableSection({ title, subtitle, defaultOpen = false, severity = 'info', children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`expandable-section ${open ? 'open' : ''} severity-${severity}`}>
      <button className="expandable-header" onClick={() => setOpen(!open)}>
        <div className="expandable-title-group">
          <h3>{title}</h3>
          {subtitle && <span className="expandable-subtitle">{subtitle}</span>}
        </div>
        {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {open && <div className="expandable-content">{children}</div>}
    </div>
  )
}

// Self-verification panel
function VerificationPanel({ checks }) {
  if (!checks || checks.length === 0) return null
  return (
    <div className="verification-panel">
      <div className="verification-header">
        <Shield size={18} />
        <h4>Self-Verification Checks</h4>
      </div>
      <div className="verification-checks">
        {checks.map((check, i) => (
          <div key={i} className={`verification-check ${check.status}`}>
            {check.status === 'pass' ? <CheckCircle size={16} /> :
             check.status === 'fail' ? <XCircle size={16} /> :
             <HelpCircle size={16} />}
            <div>
              <span className="check-label">{check.label}</span>
              <span className="check-detail">{check.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Reusable supplier evidence link — links to Spending filtered by supplier name
function SupplierLink({ name, hasSpending, maxLen = 30 }) {
  const display = (name || '').length > maxLen ? (name || '').substring(0, maxLen) + '...' : (name || '')
  if (!hasSpending || !name) return <span className="supplier-name">{display}</span>
  return (
    <Link
      to={`/spending?supplier=${encodeURIComponent(name)}&ref=doge`}
      className="supplier-name supplier-evidence-link"
      title={`View all payments to ${name}`}
    >
      {display}
    </Link>
  )
}

function DogeInvestigation() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const dataSources = config.data_sources || {}
  const hasSpending = !!dataSources.spending
  const spendingLink = hasSpending ? '/spending' : null
  const dogeContext = config.doge_context || {}

  const dataUrls = [
    '/data/doge_findings.json',
    '/data/insights.json',
    '/data/doge_verification.json',
    '/data/shared/legal_framework.json',
    '/data/outcomes.json',
  ]

  const { data, loading, error } = useData(dataUrls)
  // doge_knowledge.json is optional — only exists for some councils
  const { data: dogeKnowledge } = useData('/data/doge_knowledge.json')
  // Integrity data for councillor-supplier cross-reference
  const { data: integrityData } = useData('/data/integrity.json')

  // Build supplier→councillor map from integrity data for cross-reference badges
  const supplierCouncillorMap = useMemo(() => {
    const map = new Map()
    if (!integrityData?.councillors) return map
    integrityData.councillors.forEach(c => {
      c.supplier_conflicts?.forEach(conflict => {
        const name = (conflict.supplier_match?.supplier || '').toLowerCase()
        if (name) {
          if (!map.has(name)) map.set(name, [])
          map.get(name).push({ name: c.name, id: c.councillor_id, risk: c.risk_level })
        }
      })
      c.network_crossover?.links?.forEach(link => {
        const name = (link.supplier_company || '').toLowerCase()
        if (name) {
          if (!map.has(name)) map.set(name, [])
          map.get(name).push({ name: c.name, id: c.councillor_id, risk: c.risk_level, indirect: true })
        }
      })
    })
    return map
  }, [integrityData])

  useEffect(() => {
    document.title = `DOGE Investigation | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  if (loading) return <LoadingState message="Loading investigation data..." />

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load investigation data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  const [dogeFindings, insights, verification, legalFramework, outcomes] = data || []

  if (!dogeFindings) {
    return (
      <div className="doge-page animate-fade-in">
        <h1>DOGE Investigation</h1>
        <p>Investigation data is not yet available for {councilName}.</p>
      </div>
    )
  }

  const findings = dogeFindings.findings || []
  const keyFindings = dogeFindings.key_findings || []
  const analysesRun = dogeFindings.analyses_run || []
  const generated = dogeFindings.generated

  // Knowledge data
  const profile = dogeKnowledge?.council_profile || dogeContext
  const dataQuality = dogeKnowledge?.data_quality || {}
  const verifiedFindings = dogeKnowledge?.verified_findings || {}
  const crossCouncil = dogeKnowledge?.cross_council_context || {}

  // Stats
  const totalSpend = insights?.summary?.total_spend || insights?.summary?.total_transaction_spend || 0
  const totalRecords = insights?.summary?.transaction_count || 0
  const uniqueSuppliers = insights?.summary?.unique_suppliers || 0

  // Data quality radar chart
  const qualityData = dataQuality.overall_score ? [
    { metric: 'Overall', score: dataQuality.overall_score },
    { metric: 'Dates', score: parseFloat(dataQuality.date_completeness) || 0 },
    { metric: 'Departments', score: parseFloat(dataQuality.department_completeness) || 0 },
    { metric: 'Descriptions', score: parseFloat(dataQuality.description_completeness) || 0 },
    { metric: 'CH Match', score: parseFloat(dataQuality.ch_match_rate) || 0 },
  ].filter(d => !isNaN(d.score)) : []

  // Finding severity breakdown for chart
  const severityBreakdown = findings.reduce((acc, f) => {
    const sev = f.severity || 'info'
    acc[sev] = (acc[sev] || 0) + 1
    return acc
  }, {})

  const severityChartData = Object.entries(severityBreakdown).map(([sev, count]) => ({
    severity: sev.charAt(0).toUpperCase() + sev.slice(1),
    count,
    fill: severityColors[sev] || '#808080'
  }))

  // Build verification checks — prefer live automated checks, fallback to knowledge
  const autoChecks = verification?.checks || []
  const autoWarnings = verification?.warnings || []
  const verificationScore = verification?.score ?? null
  const verificationPassed = verification?.passed ?? 0
  const verificationTotal = verification?.total_checks ?? 0

  // Merge automated verification checks with knowledge-derived checks
  const verificationChecks = autoChecks.length > 0
    ? autoChecks
    : (() => {
        // Fallback: build from knowledge data
        const fallback = []
        if (verifiedFindings.ch_breach_spend) {
          const ch = verifiedFindings.ch_breach_spend
          fallback.push({
            label: 'Companies House breach temporal verification',
            detail: `${ch.confidence} confidence — payments cross-referenced against violation dates. ${ch.note || ''}`,
            status: ch.confidence === 'high' ? 'pass' : 'warning'
          })
        }
        if (verifiedFindings.split_payments) {
          const sp = verifiedFindings.split_payments
          fallback.push({
            label: 'Split payment threshold analysis',
            detail: `${sp.confidence} confidence — ${sp.instances || sp.value || 'multiple'} instances detected. ${sp.note || ''}`,
            status: sp.confidence === 'high' ? 'pass' : sp.confidence === 'medium' ? 'warning' : 'info'
          })
        }
        fallback.push({
          label: `${analysesRun.length} analysis pipelines executed`,
          detail: `Analyses: ${analysesRun.join(', ')}. Generated ${generated ? new Date(generated).toLocaleDateString('en-GB') : 'date unknown'}.`,
          status: analysesRun.length >= 3 ? 'pass' : 'warning'
        })
        return fallback
      })()

  return (
    <div className="doge-page animate-fade-in">
      {/* Hero */}
      <header className="doge-hero">
        <div className="doge-hero-badge">
          <Shield size={20} />
          AI-Powered Public Scrutiny
        </div>
        <h1>DOGE Investigation: {councilName}</h1>
        <p className="doge-hero-subtitle">
          Automated efficiency audit of {formatCurrency(totalSpend, true)} in public spending
          across {formatNumber(totalRecords)} transactions to {formatNumber(uniqueSuppliers)} suppliers.
          Every finding is algorithmically generated and self-verified.
        </p>
        <div className="doge-hero-stats">
          <div className="doge-hero-stat">
            <span className="stat-value">{findings.length + keyFindings.length}</span>
            <span className="stat-label">Findings</span>
          </div>
          <div className="doge-hero-stat">
            <span className="stat-value">{analysesRun.length}</span>
            <span className="stat-label">Analyses Run</span>
          </div>
          <div className="doge-hero-stat">
            <span className="stat-value">{verificationPassed || verificationChecks.filter(c => c.status === 'pass').length}/{verificationTotal || verificationChecks.length}</span>
            <span className="stat-label">Checks Passed</span>
          </div>
          <div className="doge-hero-stat">
            <span className="stat-value">{verificationScore ?? dataQuality.overall_score ?? '—'}</span>
            <span className="stat-label">Verification Score</span>
          </div>
        </div>
      </header>

      {/* Methodology note */}
      <div className="methodology-banner">
        <Info size={18} />
        <div>
          <strong>How this works:</strong> Our analysis pipeline subjects every transaction to automated checks
          for duplicates, split payments, Companies House compliance, and cross-council price comparison.
          Findings are categorised by severity and confidence level. Each result includes self-verification
          explaining the evidence basis and known limitations.
          <Link to="/about"> Learn more about our methodology →</Link>
        </div>
      </div>

      {/* Limited Data Warning */}
      {totalRecords > 0 && totalRecords < 5000 && (
        <div className="methodology-banner" style={{ background: 'rgba(255, 159, 10, 0.08)', borderColor: 'rgba(255, 159, 10, 0.2)' }}>
          <AlertTriangle size={18} style={{ color: '#ff9f0a' }} />
          <div>
            <strong>Limited dataset:</strong> This council has {formatNumber(totalRecords)} transactions in the dataset.
            Some analysis sections may show fewer findings or lower statistical significance compared to councils with larger
            datasets (e.g. Burnley with 30,000+ or Pendle with 49,000+). Findings should be interpreted with this context.
          </div>
        </div>
      )}

      {/* Critical Findings */}
      <section className="doge-findings-section" aria-label="Key findings">
        <h2>Key Findings</h2>
        <p className="section-intro">
          The most significant patterns identified in {councilName}&apos;s spending data.
        </p>

        <div className="doge-findings-overview">
          {findings.map((f, i) => {
            // Build evidence-aware link: append ref=doge for evidence trail
            const baseLink = f.link || (hasSpending ? '/spending' : '/doge')
            const evidenceLink = baseLink.includes('?')
              ? `${baseLink}&ref=doge`
              : `${baseLink}?ref=doge`
            return (
              <Link key={i} to={evidenceLink} className={`doge-finding-card ${f.severity || 'info'}`}>
                <div className="finding-severity-bar" style={{ background: severityColors[f.severity] || severityColors.info }} />
                <span className="doge-finding-value">{f.value}</span>
                <span className="doge-finding-label">
                  {f.label}
                  {f.confidence && <ConfidenceBadge level={f.confidence} />}
                </span>
                <span className="doge-finding-detail">{f.detail}</span>
                {f.statistics && (
                  <span className="doge-finding-stats">
                    <Activity size={12} />
                    <span>n={f.statistics.n?.toLocaleString()}</span>
                    {f.statistics.chi_squared && <span>χ²={f.statistics.chi_squared}</span>}
                    {f.statistics.df && <span>df={f.statistics.df}</span>}
                    <span className={f.statistics.significant ? 'stat-significant' : 'stat-ns'}>
                      {f.statistics.significant ? '● Significant' : '○ Not significant'}
                    </span>
                  </span>
                )}
                {f.context_note && (
                  <span className="doge-finding-context">
                    <Info size={12} /> {f.context_note}
                  </span>
                )}
                <span className="finding-link-arrow"><ArrowUpRight size={16} /></span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Detailed Analysis Sections */}
      <section className="doge-detail-section">
        <h2>Detailed Analysis</h2>
        <p className="section-intro">
          Expand each section for full findings, evidence, and verification.
        </p>

        {/* Companies House Compliance */}
        {verifiedFindings.ch_breach_spend && (
          <ExpandableSection
            title="Companies House Compliance"
            subtitle={verifiedFindings.ch_breach_spend.value}
            defaultOpen={true}
            severity="critical"
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <p>
                  <strong>{verifiedFindings.ch_breach_spend.suppliers || 0} suppliers</strong> received
                  payments while in active breach of the Companies Act 2006. This includes companies with
                  no active directors, overdue accounts, or facing strike-off proceedings.
                </p>
                {verifiedFindings.ch_breach_spend.top_cases && (
                  <div className="top-cases">
                    <h4>Highest-Risk Suppliers</h4>
                    <div className="cases-table">
                      {verifiedFindings.ch_breach_spend.top_cases.map((c, i) => (
                        <div key={i} className="case-row">
                          {hasSpending ? (
                            <Link
                              to={`/spending?supplier=${encodeURIComponent((c.supplier || c.name || '').toUpperCase())}&ref=doge`}
                              className="case-name case-name-link"
                            >
                              {c.supplier || c.name}
                            </Link>
                          ) : (
                            <span className="case-name">{c.supplier || c.name}</span>
                          )}
                          <span className="case-amount">{c.spend || c.amount}</span>
                          <span className="case-issue">{c.issue || c.note}</span>
                          {hasSpending && (
                            <Link
                              to={`/spending?supplier=${encodeURIComponent((c.supplier || c.name || '').toUpperCase())}&ref=doge`}
                              className="case-evidence-link"
                            >
                              View transactions →
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'Temporal cross-reference',
                  detail: 'Each payment date checked against Companies House violation active periods. Only "during breach" payments flagged.',
                  status: 'pass'
                },
                {
                  label: 'Companies House API data',
                  detail: `${verifiedFindings.ch_breach_spend.confidence} confidence. Company numbers matched via official API.`,
                  status: verifiedFindings.ch_breach_spend.confidence === 'high' ? 'pass' : 'warning'
                },
                {
                  label: 'Limitation: name matching',
                  detail: 'Suppliers matched by canonical name. Some legitimate variations may be missed or incorrectly matched.',
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}

        {/* Transparency Gap */}
        {verifiedFindings.transparency_gap && (
          <ExpandableSection
            title="Transparency & Data Quality"
            subtitle={verifiedFindings.transparency_gap.value}
            severity={parseFloat(verifiedFindings.transparency_gap.value) < 50 ? 'critical' : 'warning'}
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <p>{verifiedFindings.transparency_gap.note || `Description completeness: ${verifiedFindings.transparency_gap.value}`}</p>
                {qualityData.length > 0 && (
                  <div className="quality-chart">
                    <h4>Data Quality Breakdown</h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={qualityData}>
                        <PolarGrid stroke={GRID_STROKE} />
                        <PolarAngleAxis
                          dataKey="metric"
                          tick={AXIS_TICK_STYLE}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          tick={AXIS_TICK_STYLE}
                        />
                        <Radar
                          name="Quality %"
                          dataKey="score"
                          stroke="#0a84ff"
                          fill="#0a84ff"
                          fillOpacity={0.2}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'Field completeness analysis',
                  detail: 'Every record checked for: date, supplier, amount, department, description fields.',
                  status: 'pass'
                },
                {
                  label: 'Cross-council comparison',
                  detail: 'Quality benchmarked against 3 neighbouring councils for context.',
                  status: 'pass'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}

        {/* Split Payments */}
        {verifiedFindings.split_payments && (
          <ExpandableSection
            title="Suspected Split Payments"
            subtitle={verifiedFindings.split_payments.value}
            severity="warning"
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <p>
                  <strong>{verifiedFindings.split_payments.instances || 'Multiple'} instances</strong> where
                  payments to the same supplier in the same week fall just below approval thresholds
                  (£500, £1,000, £5,000, £10,000, £25,000, £50,000, £100,000). This pattern can indicate
                  deliberate threshold avoidance — but may also reflect legitimate batch processing.
                </p>
                {verifiedFindings.split_payments.note && (
                  <div className="analysis-note">
                    <Info size={16} />
                    <span>{verifiedFindings.split_payments.note}</span>
                  </div>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'Threshold analysis',
                  detail: '3+ payments to same supplier in same week, all below the same threshold. Minimum 3 payments required to flag.',
                  status: 'pass'
                },
                {
                  label: 'False positive risk',
                  detail: 'Medium — batch processing, staged invoices, and legitimate recurring payments can trigger this pattern.',
                  status: 'warning'
                },
                {
                  label: 'Limitation',
                  detail: 'Cannot determine intent. Recommended action: FOI request for procurement approval chain.',
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}

        {/* Year-End Pattern */}
        {verifiedFindings.year_end_pattern && (
          <ExpandableSection
            title="Year-End Spending Patterns"
            subtitle={verifiedFindings.year_end_pattern.value}
            severity={verifiedFindings.year_end_pattern.confidence === 'retired' ? 'info' : 'warning'}
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <p>{verifiedFindings.year_end_pattern.note || 'March spending compared to monthly averages.'}</p>
                {verifiedFindings.year_end_pattern.public_interest && (
                  <p className="public-interest"><strong>Public interest:</strong> {verifiedFindings.year_end_pattern.public_interest}</p>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'Statistical method',
                  detail: 'March spend / average monthly spend. Departments flagged at 1.5x+ threshold. Requires 6+ months data.',
                  status: 'pass'
                },
                {
                  label: 'Known limitation',
                  detail: 'Year-end spikes are common in public sector. Not all spikes indicate waste — some are scheduled capital programmes.',
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}

        {/* Payment Velocity */}
        {dogeFindings.payment_velocity && (
          <ExpandableSection
            title="Payment Velocity Analysis"
            subtitle={`${dogeFindings.payment_velocity.total_analysed} suppliers analysed`}
            severity="info"
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <p>
                  Analysis of payment frequency patterns across all suppliers with 10+ transactions.
                  Rapid payers receive payments every &lt;14 days on average. Clock-like regularity
                  (std deviation &lt;5 days) may indicate standing orders, retainer arrangements,
                  or automated payments.
                </p>

                {dogeFindings.payment_velocity.rapid_payers?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><Zap size={16} /> Rapid Payment Suppliers (&lt;14 day average)</h4>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Payments</th>
                            <th>Avg Days</th>
                            <th>Total Spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.payment_velocity.rapid_payers.map((p, i) => (
                            <tr key={i}>
                              <td>
                                {hasSpending ? (
                                  <Link to={`/spending?supplier=${encodeURIComponent(p.supplier)}&ref=doge`}>
                                    {p.supplier.length > 30 ? p.supplier.substring(0, 30) + '...' : p.supplier}
                                  </Link>
                                ) : (
                                  <span>{p.supplier.length > 30 ? p.supplier.substring(0, 30) + '...' : p.supplier}</span>
                                )}
                              </td>
                              <td>{formatNumber(p.payments)}</td>
                              <td>{p.avg_days}</td>
                              <td>{formatCurrency(p.total_spend, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {dogeFindings.payment_velocity.regular_payers?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><Clock size={16} /> Clock-Like Regular Payers (std dev &lt;5 days)</h4>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Payments</th>
                            <th>Avg Days</th>
                            <th>Std Dev</th>
                            <th>Total Spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.payment_velocity.regular_payers.map((p, i) => (
                            <tr key={i}>
                              <td>
                                {hasSpending ? (
                                  <Link to={`/spending?supplier=${encodeURIComponent(p.supplier)}&ref=doge`}>
                                    {p.supplier.length > 30 ? p.supplier.substring(0, 30) + '...' : p.supplier}
                                  </Link>
                                ) : (
                                  <span>{p.supplier.length > 30 ? p.supplier.substring(0, 30) + '...' : p.supplier}</span>
                                )}
                              </td>
                              <td>{formatNumber(p.payments)}</td>
                              <td>{p.avg_days}</td>
                              <td>{p.std_dev} days</td>
                              <td>{formatCurrency(p.total_spend, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {dogeFindings.payment_velocity.day_of_week?.length > 0 && (
                  <div className="day-of-week-chart">
                    <h4>Payments by Day of Week</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dogeFindings.payment_velocity.day_of_week}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="day" tick={AXIS_TICK_STYLE} tickFormatter={d => d.slice(0, 3)} />
                        <YAxis tick={AXIS_TICK_STYLE} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v, name) => [name === 'count' ? formatNumber(v) : formatCurrency(v, true), name === 'count' ? 'Transactions' : 'Total Value']}
                        />
                        <Bar dataKey="count" fill="#0a84ff" radius={[4, 4, 0, 0]} name="count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'Payment interval calculation',
                  detail: 'Days between consecutive payments to each supplier. Same-day payments excluded. Minimum 10 payments required.',
                  status: 'pass'
                },
                {
                  label: 'Context',
                  detail: 'Rapid payment patterns often reflect legitimate arrangements (retainers, agency staff, utilities). Not inherently suspicious.',
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}

        {/* Supplier Concentration */}
        {dogeFindings.supplier_concentration && (
          <ExpandableSection
            title="Supplier Concentration"
            subtitle={`HHI: ${dogeFindings.supplier_concentration.hhi} (${dogeFindings.supplier_concentration.concentration_level})`}
            severity="info"
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <p>
                  Top 5 suppliers account for <strong>{dogeFindings.supplier_concentration.top5?.pct}%</strong> of
                  total spend ({formatCurrency(dogeFindings.supplier_concentration.top5?.total, true)}).
                  Top 10 account for {dogeFindings.supplier_concentration.top10_pct}%.
                  The HHI (Herfindahl-Hirschman Index) of {dogeFindings.supplier_concentration.hhi} indicates
                  {dogeFindings.supplier_concentration.concentration_level === 'high' ? ' a highly concentrated market — a few suppliers dominate.'
                   : dogeFindings.supplier_concentration.concentration_level === 'moderate' ? ' moderate concentration.'
                   : ' a competitive supplier market with spending spread across many providers.'}
                </p>

                {dogeFindings.supplier_concentration.top5?.suppliers?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><TrendingUp size={16} /> Top 5 Suppliers by Total Spend</h4>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Transactions</th>
                            <th>Total Spend</th>
                            <th>Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.supplier_concentration.top5.suppliers.map((s, i) => (
                            <tr key={i}>
                              <td>
                                {hasSpending ? (
                                  <Link to={`/spending?supplier=${encodeURIComponent(s.supplier)}&ref=doge`}>
                                    {s.supplier.length > 30 ? s.supplier.substring(0, 30) + '...' : s.supplier}
                                  </Link>
                                ) : (
                                  <span>{s.supplier.length > 30 ? s.supplier.substring(0, 30) + '...' : s.supplier}</span>
                                )}
                              </td>
                              <td>{formatNumber(s.count)}</td>
                              <td>{formatCurrency(s.total, true)}</td>
                              <td><strong>{s.pct}%</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'HHI methodology',
                  detail: `Herfindahl-Hirschman Index: sum of squared market shares. <1500 = competitive, 1500-2500 = moderate, >2500 = concentrated. Score: ${dogeFindings.supplier_concentration.hhi}.`,
                  status: 'pass'
                },
                {
                  label: 'Context',
                  detail: `Based on ${formatNumber(dogeFindings.supplier_concentration.unique_suppliers)} unique suppliers. High concentration in local government is common for outsourced services (waste, IT, leisure).`,
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}

        {/* Procurement Compliance */}
        {dogeFindings.procurement_compliance && (
          <ExpandableSection
            title="Procurement Compliance"
            subtitle={`${dogeFindings.procurement_compliance.awarded_contracts} contracts analysed`}
            severity={dogeFindings.procurement_compliance.threshold_suspect_count > 3 ? 'warning' : 'info'}
          >
            <div className="analysis-content">
              <div className="analysis-summary">
                <div className="procurement-stats-row">
                  <div className="proc-stat">
                    <span className="proc-stat-value">{dogeFindings.procurement_compliance.threshold_suspect_count}</span>
                    <span className="proc-stat-label">Threshold Suspects</span>
                  </div>
                  <div className="proc-stat">
                    <span className="proc-stat-value">{dogeFindings.procurement_compliance.repeat_winner_count}</span>
                    <span className="proc-stat-label">Repeat Winners</span>
                  </div>
                  <div className="proc-stat">
                    <span className="proc-stat-value">{dogeFindings.procurement_compliance.transparency_gap?.pct}%</span>
                    <span className="proc-stat-label">Value Gap</span>
                  </div>
                  <div className="proc-stat">
                    <span className="proc-stat-value">{dogeFindings.procurement_compliance.timing_cluster_count}</span>
                    <span className="proc-stat-label">Timing Clusters</span>
                  </div>
                  {dogeFindings.procurement_compliance.late_publication_count > 0 && (
                    <div className="proc-stat" style={{ borderLeft: '2px solid #ff453a' }}>
                      <span className="proc-stat-value" style={{ color: '#ff453a' }}>{dogeFindings.procurement_compliance.late_publication_count}</span>
                      <span className="proc-stat-label">Late Publications</span>
                    </div>
                  )}
                  {dogeFindings.procurement_compliance.weak_competition_count > 0 && (
                    <div className="proc-stat" style={{ borderLeft: '2px solid #ff9f0a' }}>
                      <span className="proc-stat-value" style={{ color: '#ff9f0a' }}>{dogeFindings.procurement_compliance.weak_competition_count}</span>
                      <span className="proc-stat-label">Weak Competition</span>
                    </div>
                  )}
                  {dogeFindings.procurement_compliance.monopoly_category_count > 0 && (
                    <div className="proc-stat" style={{ borderLeft: '2px solid #ff6b35' }}>
                      <span className="proc-stat-value" style={{ color: '#ff6b35' }}>{dogeFindings.procurement_compliance.monopoly_category_count}</span>
                      <span className="proc-stat-label">Category Monopolies</span>
                    </div>
                  )}
                </div>

                {dogeFindings.procurement_compliance.threshold_suspects?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><AlertTriangle size={16} /> Contracts Near Procurement Thresholds</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-sm)' }}>
                      Contracts valued within 15% below a procurement threshold may indicate threshold avoidance.
                    </p>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Contract</th>
                            <th>Value</th>
                            <th>Threshold</th>
                            <th>% of Limit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.procurement_compliance.threshold_suspects.map((s, i) => (
                            <tr key={i}>
                              <td title={s.title}>{s.title.length > 40 ? s.title.substring(0, 40) + '...' : s.title}</td>
                              <td>{formatCurrency(s.value, true)}</td>
                              <td>{s.threshold_label}</td>
                              <td>{s.pct_of_threshold}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {dogeFindings.procurement_compliance.repeat_winners?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><Repeat size={16} /> Repeat Contract Winners</h4>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Supplier</th>
                            <th>Contracts</th>
                            <th>Total Value</th>
                            <th>Avg Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.procurement_compliance.repeat_winners.map((w, i) => (
                            <tr key={i}>
                              <td>
                                {hasSpending ? (
                                  <Link to={`/spending?supplier=${encodeURIComponent(w.supplier)}&ref=doge`}>
                                    {w.supplier.length > 30 ? w.supplier.substring(0, 30) + '...' : w.supplier}
                                  </Link>
                                ) : (
                                  <span>{w.supplier.length > 30 ? w.supplier.substring(0, 30) + '...' : w.supplier}</span>
                                )}
                              </td>
                              <td>{w.contracts}</td>
                              <td>{formatCurrency(w.total_value, true)}</td>
                              <td>{formatCurrency(w.avg_value, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {dogeFindings.procurement_compliance.late_publications?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><Clock size={16} /> Late Contract Publications</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-sm)' }}>
                      Contracts where the notice was published <strong>after</strong> the award date — indicating the public was
                      only informed retrospectively. Transparency Code requires timely publication.
                    </p>
                    {dogeFindings.procurement_compliance.publication_timing && (
                      <div className="procurement-stats-row" style={{ marginBottom: 'var(--space-md)' }}>
                        <div className="proc-stat">
                          <span className="proc-stat-value">{dogeFindings.procurement_compliance.publication_timing.avg_delay_days} days</span>
                          <span className="proc-stat-label">Avg Publication Delay</span>
                        </div>
                        <div className="proc-stat">
                          <span className="proc-stat-value">{dogeFindings.procurement_compliance.publication_timing.median_delay_days} days</span>
                          <span className="proc-stat-label">Median Delay</span>
                        </div>
                      </div>
                    )}
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Contract</th>
                            <th>Supplier</th>
                            <th>Awarded</th>
                            <th>Published</th>
                            <th>Days Late</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.procurement_compliance.late_publications.map((lp, i) => (
                            <tr key={i}>
                              <td title={lp.title}>{lp.title.length > 35 ? lp.title.substring(0, 35) + '...' : lp.title}</td>
                              <td>{lp.supplier}</td>
                              <td>{lp.awarded_date}</td>
                              <td>{lp.published_date}</td>
                              <td style={{ color: lp.days_late > 90 ? '#ff453a' : lp.days_late > 30 ? '#ff9f0a' : 'inherit', fontWeight: lp.days_late > 90 ? 600 : 400 }}>{lp.days_late}</td>
                              <td>{lp.awarded_value ? formatCurrency(lp.awarded_value, true) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {dogeFindings.procurement_compliance.weak_competition?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><ShieldAlert size={16} /> Weak Competition Indicators</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-sm)' }}>
                      Contracts with short tender periods (&lt;14 days) or rapid award after deadline (&lt;7 days)
                      may indicate limited competitive bidding. Contracts Finder does not publish bid counts directly.
                    </p>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Contract</th>
                            <th>Supplier</th>
                            <th>Value</th>
                            <th>Flags</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.procurement_compliance.weak_competition.map((wc, i) => (
                            <tr key={i}>
                              <td title={wc.title}>{wc.title.length > 35 ? wc.title.substring(0, 35) + '...' : wc.title}</td>
                              <td>{wc.supplier}</td>
                              <td>{wc.awarded_value ? formatCurrency(wc.awarded_value, true) : '—'}</td>
                              <td style={{ fontSize: '0.75rem', color: '#ff9f0a' }}>{wc.flags.join('; ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {dogeFindings.procurement_compliance.monopoly_categories?.length > 0 && (
                  <div className="velocity-table-section">
                    <h4><Target size={16} /> Category Monopolies</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 'var(--space-sm)' }}>
                      Service categories where only one supplier has ever won a contract. May indicate market failure,
                      specification bias, or a genuinely niche service area.
                    </p>
                    <div className="velocity-table-wrap">
                      <table className="velocity-table">
                        <thead>
                          <tr>
                            <th>Category (CPV)</th>
                            <th>Sole Supplier</th>
                            <th>Contracts</th>
                            <th>Total Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dogeFindings.procurement_compliance.monopoly_categories.map((mc, i) => (
                            <tr key={i}>
                              <td title={mc.cpv}>{mc.cpv.length > 30 ? mc.cpv.substring(0, 30) + '...' : mc.cpv}</td>
                              <td>
                                {hasSpending ? (
                                  <Link to={`/spending?supplier=${encodeURIComponent(mc.supplier)}&ref=doge`}>
                                    {mc.supplier.length > 25 ? mc.supplier.substring(0, 25) + '...' : mc.supplier}
                                  </Link>
                                ) : (
                                  <span>{mc.supplier.length > 25 ? mc.supplier.substring(0, 25) + '...' : mc.supplier}</span>
                                )}
                              </td>
                              <td>{mc.contracts}</td>
                              <td>{formatCurrency(mc.total_value, true)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              <VerificationPanel checks={[
                {
                  label: 'Threshold avoidance detection',
                  detail: 'Contracts valued within 15% below UK procurement thresholds (£30K, £138,760, £5.37M) flagged for review.',
                  status: 'pass'
                },
                {
                  label: 'Late publication detection',
                  detail: 'Contracts published after award date indicate retrospective compliance — the public was informed after the decision was made.',
                  status: dogeFindings.procurement_compliance.late_publication_count > 5 ? 'fail' : 'pass'
                },
                {
                  label: 'Weak competition detection',
                  detail: 'Proxy signals used: tender periods <14 days and awards <7 days after deadline. Contracts Finder does not publish bid counts.',
                  status: dogeFindings.procurement_compliance.weak_competition_count > 10 ? 'fail' : dogeFindings.procurement_compliance.weak_competition_count > 0 ? 'warning' : 'pass'
                },
                {
                  label: 'Limitation',
                  detail: 'Proximity to thresholds alone does not prove avoidance. Late publication may reflect admin delay rather than intent to conceal. Short tender periods may reflect framework call-offs or genuine urgency.',
                  status: 'info'
                },
                {
                  label: 'Data source',
                  detail: 'Contracts Finder API — only published notices are available. Some contracts below threshold may not be published. Bid counts are not available.',
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}
      </section>

      {/* Fraud Triangle Risk Assessment */}
      {dogeFindings.fraud_triangle && (
        <ExpandableSection
          title="Risk Assessment: Fraud Triangle"
          subtitle={`Overall: ${dogeFindings.fraud_triangle.overall_score}/100 (${dogeFindings.fraud_triangle.risk_level})`}
          severity={dogeFindings.fraud_triangle.risk_level === 'elevated' ? 'critical' : dogeFindings.fraud_triangle.risk_level === 'moderate' ? 'warning' : 'info'}
        >
          <div className="analysis-content">
            <div className="analysis-summary">
              <p>
                The fraud triangle model (Cressey 1953) identifies three conditions that increase fraud risk:
                <strong> Opportunity</strong> (weak controls), <strong>Pressure</strong> (budget stress),
                and <strong>Rationalization</strong> (cultural tolerance of non-compliance).
                This is a <em>screening tool</em> — elevated scores warrant investigation, not accusation.
              </p>

              <div className="fraud-triangle-scores">
                {['opportunity', 'pressure', 'rationalization'].map(dim => {
                  const d = dogeFindings.fraud_triangle.dimensions[dim]
                  const color = d.score >= 50 ? '#ff453a' : d.score >= 25 ? '#ff9f0a' : '#30d158'
                  return (
                    <div key={dim} className="ft-dimension">
                      <div className="ft-dim-header">
                        <span className="ft-dim-label">{dim.charAt(0).toUpperCase() + dim.slice(1)}</span>
                        <span className="ft-dim-score" style={{ color }}>{d.score}/100</span>
                      </div>
                      <div className="ft-bar-track">
                        <div className="ft-bar-fill" style={{ width: `${d.score}%`, background: color }} />
                      </div>
                      {d.signals.length > 0 && (
                        <ul className="ft-signals">
                          {d.signals.map((s, i) => (
                            <li key={i}>{s.signal}</li>
                          ))}
                        </ul>
                      )}
                      {d.signals.length === 0 && (
                        <p className="ft-no-signals">No signals detected in this dimension.</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {dogeFindings.fraud_triangle.dimensions && (() => {
                const dims = dogeFindings.fraud_triangle.dimensions
                const radarData = [
                  { metric: 'Opportunity', score: dims.opportunity.score },
                  { metric: 'Pressure', score: dims.pressure.score },
                  { metric: 'Rationalization', score: dims.rationalization.score },
                ]
                return (
                  <div className="quality-chart">
                    <h4>Risk Dimensions</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke={GRID_STROKE} />
                        <PolarAngleAxis
                          dataKey="metric"
                          tick={AXIS_TICK_STYLE}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          tick={AXIS_TICK_STYLE}
                        />
                        <Radar
                          name="Risk Score"
                          dataKey="score"
                          stroke="#ff9f0a"
                          fill="#ff9f0a"
                          fillOpacity={0.2}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )
              })()}
            </div>
            <VerificationPanel checks={[
              {
                label: 'Methodology',
                detail: 'Fraud triangle (Cressey 1953): scores synthesised from existing DOGE analysis signals. Overall score is geometric mean of three dimensions.',
                status: 'pass'
              },
              {
                label: 'Signal count',
                detail: `${dogeFindings.fraud_triangle.total_signals} signals detected across 3 dimensions from ${dogeFindings.fraud_triangle.dimensions ? Object.keys(dogeFindings.fraud_triangle.dimensions).length : 3} risk categories.`,
                status: 'pass'
              },
              {
                label: 'Critical limitation',
                detail: 'This is a screening tool based on publicly available spending data. It cannot detect collusion, bribery, or other forms of fraud that leave no paper trail. High scores warrant investigation, not accusation.',
                status: 'info'
              }
            ]} />
          </div>
        </ExpandableSection>
      )}

      {/* ═══ ADVANCED FORENSIC ANALYSIS SECTIONS ═══ */}

      {/* Supplier Risk Intelligence */}
      {dogeFindings.supplier_risk?.top_20_risk?.length > 0 && (
        <ExpandableSection
          title="Supplier Risk Intelligence"
          subtitle={`${dogeFindings.supplier_risk.high_risk || 0} high-risk, ${dogeFindings.supplier_risk.elevated_risk || 0} elevated-risk suppliers`}
          severity={dogeFindings.supplier_risk.high_risk > 0 ? 'warning' : 'info'}
        >
          <div className="forensic-section">
            <p className="section-methodology">
              Composite risk score (0-100) combining Companies House flags, payment anomalies
              (Benford&apos;s MAD), concentration risk, and transparency indicators. Methodology:
              ACFE Fraud Examiners Manual, Moody&apos;s KYC framework.
            </p>

            <div className="risk-summary-stats">
              <div className="stat-pill warning">
                <strong>{dogeFindings.supplier_risk.high_risk || 0}</strong> High Risk
                ({formatCurrency(dogeFindings.supplier_risk.high_risk_spend)})
              </div>
              <div className="stat-pill info">
                <strong>{dogeFindings.supplier_risk.elevated_risk || 0}</strong> Elevated
                ({formatCurrency(dogeFindings.supplier_risk.elevated_risk_spend)})
              </div>
              <div className="stat-pill">
                <strong>{dogeFindings.supplier_risk.total_suppliers_scored || 0}</strong> Total Scored
              </div>
            </div>

            <div className="table-container">
              <table className="doge-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Risk Score</th>
                    <th>CH</th>
                    <th>Payment</th>
                    <th>Conc.</th>
                    <th>Transp.</th>
                    <th>Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {dogeFindings.supplier_risk.top_20_risk.slice(0, 15).map((s, i) => (
                    <tr key={i} className={`risk-${s.risk_level}`}>
                      <td><SupplierLink name={s.supplier} hasSpending={hasSpending} maxLen={35} /></td>
                      <td><strong className={`risk-score risk-${s.risk_level}`}>{s.risk_score}</strong></td>
                      <td>{s.ch_risk}</td>
                      <td>{s.payment_risk}</td>
                      <td>{s.concentration_risk}</td>
                      <td>{s.transparency_risk}</td>
                      <td>{formatCurrency(s.total_spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <VerificationPanel checks={[
              { label: 'Methodology', detail: 'Multi-dimensional scoring: CH Risk (0-25), Payment Risk (0-25), Concentration Risk (0-25), Transparency Risk (0-25). ACFE/Moody\'s aligned.', status: 'pass' },
              { label: 'Limitation', detail: 'High risk score indicates statistical anomalies warranting investigation, not confirmed fraud. Many triggers have legitimate explanations.', status: 'info' },
            ]} />
          </div>
        </ExpandableSection>
      )}

      {/* Advanced Benford's Analysis */}
      {dogeFindings.benfords_advanced && (
        <ExpandableSection
          title="Advanced Benford's Law Analysis"
          subtitle={`4 tests: first-two digits, last-two digits, summation, per-supplier MAD`}
          severity={
            dogeFindings.benfords_advanced.first_two_digits?.conformity === 'non_conforming' ? 'warning' : 'info'
          }
        >
          <div className="forensic-section">
            <p className="section-methodology">
              Nigrini (2012) advanced Benford&apos;s Law suite. Goes beyond basic first-digit testing
              to detect specific fraud patterns. Used by ACFE certified fraud examiners worldwide.
            </p>

            {/* First-Two Digits */}
            {dogeFindings.benfords_advanced.first_two_digits?.spikes?.length > 0 && (
              <div className="benford-subsection">
                <h4>First-Two Digits Test (Nigrini Primary Audit Tool)</h4>
                <p>Analyses digits 10-99. Spikes indicate manufactured amount ranges.</p>
                <div className="benford-stats">
                  <span>χ²={dogeFindings.benfords_advanced.first_two_digits.chi_squared} (df=89)</span>
                  <span className={`conformity-badge ${dogeFindings.benfords_advanced.first_two_digits.conformity}`}>
                    {dogeFindings.benfords_advanced.first_two_digits.p_description}
                  </span>
                </div>
                {dogeFindings.benfords_advanced.first_two_digits.spikes.length > 0 && (
                  <div className="spike-list">
                    <strong>Amount range spikes:</strong>
                    {dogeFindings.benfords_advanced.first_two_digits.spikes.slice(0, 5).map((s, i) => (
                      <span key={i} className="spike-badge">
                        £{s.digits}xx: {s.ratio}x expected
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Last-Two Digits */}
            {dogeFindings.benfords_advanced.last_two_digits?.total_tested > 0 && (
              <div className="benford-subsection">
                <h4>Last-Two Digits Uniformity Test</h4>
                <p>Detects round-number fabrication with statistical rigour. Should be uniform (1% each for 00-99).</p>
                <div className="benford-stats">
                  <span>χ²={dogeFindings.benfords_advanced.last_two_digits.chi_squared} (df=99)</span>
                  <span className={`conformity-badge ${dogeFindings.benfords_advanced.last_two_digits.conformity}`}>
                    {dogeFindings.benfords_advanced.last_two_digits.p_description}
                  </span>
                  <span>Round-number excess: {dogeFindings.benfords_advanced.last_two_digits.round_number_excess_pct}%</span>
                </div>
              </div>
            )}

            {/* Summation Test */}
            {dogeFindings.benfords_advanced.summation?.distortions?.length > 0 && (
              <div className="benford-subsection">
                <h4>Summation Test (Large Fraud Detection)</h4>
                <p>Each first-digit group should contribute ~11.1% of total value. Distortions indicate outsized payments.</p>
                <div className="summation-bars">
                  {dogeFindings.benfords_advanced.summation.digit_analysis?.map((d) => (
                    <div key={d.digit} className="summation-bar-row">
                      <span className="digit-label">{d.digit}</span>
                      <div className="bar-container">
                        <div
                          className={`bar-fill ${Math.abs(d.deviation) > 5 ? 'anomaly' : ''}`}
                          style={{ width: `${Math.min(d.pct_of_total * 3, 100)}%` }}
                        />
                      </div>
                      <span className="bar-value">{d.pct_of_total}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-Supplier MAD */}
            {dogeFindings.benfords_advanced.per_supplier_mad?.top_20_outliers?.length > 0 && (
              <div className="benford-subsection">
                <h4>Per-Supplier Benford&apos;s Conformity (MAD Scoring)</h4>
                <p>
                  Suppliers with MAD &gt; 0.015 are nonconforming (Nigrini thresholds).
                  {' '}{dogeFindings.benfords_advanced.per_supplier_mad.nonconforming || 0} nonconforming
                  of {dogeFindings.benfords_advanced.per_supplier_mad.suppliers_tested || 0} tested.
                </p>
                <div className="table-container">
                  <table className="doge-table compact">
                    <thead>
                      <tr><th>Supplier</th><th>MAD</th><th>Txns</th><th>Spend</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {dogeFindings.benfords_advanced.per_supplier_mad.top_20_outliers.slice(0, 10).map((s, i) => (
                        <tr key={i}>
                          <td><SupplierLink name={s.supplier} hasSpending={hasSpending} /></td>
                          <td><strong>{s.mad}</strong></td>
                          <td>{s.transaction_count}</td>
                          <td>{formatCurrency(s.total_spend)}</td>
                          <td className={`conformity-${s.conformity}`}>{s.conformity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <VerificationPanel checks={[
              { label: 'Reference', detail: 'Nigrini, M.J. (2012). Benford\'s Law: Applications for Forensic Accounting, Auditing, and Fraud Detection. Wiley.', status: 'pass' },
              { label: 'Limitation', detail: 'Benford\'s Law applies to naturally occurring datasets. Municipal spending typically conforms, but high χ² values alone don\'t prove fraud — they identify audit samples.', status: 'info' },
            ]} />
          </div>
        </ExpandableSection>
      )}

      {/* Forensic Accounting Classics */}
      {dogeFindings.forensic_classics && (
        <ExpandableSection
          title="Forensic Accounting Analysis"
          subtitle="Same-same-different, vendor integrity, credit patterns, description quality"
          severity={
            (dogeFindings.forensic_classics.vendor_integrity?.total_suspect_pairs > 5 ||
             dogeFindings.forensic_classics.credit_patterns?.total_zero_credit > 20) ? 'warning' : 'info'
          }
        >
          <div className="forensic-section">
            {/* Same-Same-Different */}
            {dogeFindings.forensic_classics.same_same_different?.rebilling?.total_flags > 0 && (
              <div className="forensic-subsection">
                <h4>Same-Same-Different Testing</h4>
                <p className="section-methodology">
                  Classic forensic technique: finds payments matching on 2 fields but differing on a third.
                </p>
                <div className="risk-summary-stats">
                  <div className="stat-pill warning">
                    <strong>{dogeFindings.forensic_classics.same_same_different.rebilling.total_flags}</strong> Re-billing flags
                    ({formatCurrency(dogeFindings.forensic_classics.same_same_different.rebilling.total_value)})
                  </div>
                  <div className="stat-pill info">
                    <strong>{dogeFindings.forensic_classics.same_same_different.cross_department?.total_flags || 0}</strong> Cross-dept flags
                  </div>
                  <div className="stat-pill">
                    <strong>{dogeFindings.forensic_classics.same_same_different.collusion_indicators?.total_flags || 0}</strong> Collusion indicators
                  </div>
                </div>
              </div>
            )}

            {/* Vendor Integrity */}
            {(dogeFindings.forensic_classics.vendor_integrity?.total_suspect_pairs > 0 ||
              dogeFindings.forensic_classics.vendor_integrity?.total_single_payment > 0) && (
              <div className="forensic-subsection">
                <h4>Fictitious Vendor Detection</h4>
                <p className="section-methodology">
                  ACFE methodology: fuzzy name matching, single-payment high-value vendors, unverified high-spend suppliers.
                </p>
                <div className="risk-summary-stats">
                  <div className="stat-pill warning">
                    <strong>{dogeFindings.forensic_classics.vendor_integrity.total_suspect_pairs}</strong> Suspect name pairs
                  </div>
                  <div className="stat-pill">
                    <strong>{dogeFindings.forensic_classics.vendor_integrity.total_single_payment}</strong> Single-payment vendors (&gt;£10K)
                    ({formatCurrency(dogeFindings.forensic_classics.vendor_integrity.single_payment_value)})
                  </div>
                  <div className="stat-pill">
                    <strong>{dogeFindings.forensic_classics.vendor_integrity.total_unverified}</strong> Unverified high-spend
                    ({formatCurrency(dogeFindings.forensic_classics.vendor_integrity.unverified_spend)})
                  </div>
                </div>
                {dogeFindings.forensic_classics.vendor_integrity.suspect_vendor_pairs?.length > 0 && (
                  <div className="table-container">
                    <table className="doge-table compact">
                      <thead>
                        <tr><th>Similar Names</th><th>Combined Spend</th><th>Txns</th><th>CH Match</th></tr>
                      </thead>
                      <tbody>
                        {dogeFindings.forensic_classics.vendor_integrity.suspect_vendor_pairs.slice(0, 8).map((p, i) => (
                          <tr key={i}>
                            <td>{(p.names || []).map((n, j) => (
                              <span key={j}>{j > 0 && ' / '}<SupplierLink name={n} hasSpending={hasSpending} maxLen={25} /></span>
                            ))}</td>
                            <td>{formatCurrency(p.combined_spend)}</td>
                            <td>{p.combined_transactions}</td>
                            <td>{p.has_ch_match ? '✓' : '✗'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Credit/Refund Patterns */}
            {dogeFindings.forensic_classics.credit_patterns?.total_zero_credit > 0 && (
              <div className="forensic-subsection">
                <h4>Credit &amp; Refund Pattern Analysis</h4>
                <p className="section-methodology">
                  ACFE indicator: long-standing suppliers with zero credits may indicate fictitious vendors
                  (real suppliers occasionally have refunds/credits).
                </p>
                <div className="risk-summary-stats">
                  <div className="stat-pill warning">
                    <strong>{dogeFindings.forensic_classics.credit_patterns.total_zero_credit}</strong> Zero-credit suppliers (2+ years)
                    ({formatCurrency(dogeFindings.forensic_classics.credit_patterns.zero_credit_spend)})
                  </div>
                  <div className="stat-pill">
                    <strong>{dogeFindings.forensic_classics.credit_patterns.total_exact_offsets}</strong> Exact-offset credits
                  </div>
                  <div className="stat-pill">
                    Credit ratio: {dogeFindings.forensic_classics.credit_patterns.credit_stats?.credit_ratio || 0}%
                  </div>
                </div>
              </div>
            )}

            {/* Description Quality */}
            {dogeFindings.forensic_classics.description_quality?.vague_rate > 0 && (
              <div className="forensic-subsection">
                <h4>Description Quality &amp; Transparency</h4>
                <p className="section-methodology">
                  Vague descriptions correlate with fraud risk (ACFE). Transparency score = % of spend with meaningful descriptions.
                </p>
                <div className="risk-summary-stats">
                  <div className={`stat-pill ${dogeFindings.forensic_classics.description_quality.transparency_score < 70 ? 'warning' : ''}`}>
                    Transparency: <strong>{dogeFindings.forensic_classics.description_quality.transparency_score}/100</strong>
                  </div>
                  <div className="stat-pill">
                    Vague: {dogeFindings.forensic_classics.description_quality.vague_rate}% ({formatCurrency(dogeFindings.forensic_classics.description_quality.vague_spend)})
                  </div>
                  <div className="stat-pill">
                    Empty: {dogeFindings.forensic_classics.description_quality.empty_descriptions} descriptions
                  </div>
                </div>
                {dogeFindings.forensic_classics.description_quality.priority_investigation?.length > 0 && (
                  <div className="priority-alert">
                    <AlertTriangle size={16} />
                    <strong>Priority:</strong> {dogeFindings.forensic_classics.description_quality.priority_investigation.length} departments
                    with &gt;30% vague descriptions AND &gt;£50K spend flagged for investigation.
                  </div>
                )}
              </div>
            )}

            <VerificationPanel checks={[
              { label: 'Framework', detail: 'ACFE Report to the Nations 2024, Journal of Accountancy forensic data analytics methodology.', status: 'pass' },
              { label: 'False positives', detail: 'Fuzzy name matching may flag legitimate name variations (Ltd vs Limited). Zero-credit flags require manual review of supplier relationship.', status: 'info' },
            ]} />
          </div>
        </ExpandableSection>
      )}

      {/* Temporal Intelligence */}
      {dogeFindings.temporal_intelligence && (
        <ExpandableSection
          title="Temporal Intelligence"
          subtitle={`Year-end acceleration, change-points, statistical process control`}
          severity={dogeFindings.temporal_intelligence.dept_acceleration?.length > 5 ? 'warning' : 'info'}
        >
          <div className="forensic-section">
            {/* Year-End Acceleration */}
            {dogeFindings.temporal_intelligence.year_end_acceleration?.length > 0 && (
              <div className="forensic-subsection">
                <h4>Year-End Acceleration Index</h4>
                <p className="section-methodology">
                  March spend / average monthly spend. Index &gt; 2.0 indicates year-end budget dumping.
                </p>
                <div className="acceleration-chart">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dogeFindings.temporal_intelligence.year_end_acceleration}>
                      <CartesianGrid stroke={GRID_STROKE} />
                      <XAxis dataKey="financial_year" tick={AXIS_TICK_STYLE} />
                      <YAxis tick={AXIS_TICK_STYLE} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="acceleration_index" name="Acceleration Index" fill="#ff9f0a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {dogeFindings.temporal_intelligence.dept_acceleration?.length > 0 && (
                  <div className="dept-flags">
                    <strong>{dogeFindings.temporal_intelligence.dept_acceleration.length} departments</strong> exceeded
                    2.0x year-end acceleration threshold.
                  </div>
                )}
              </div>
            )}

            {/* Change-Point Detection */}
            {dogeFindings.temporal_intelligence.change_points?.length > 0 && (
              <div className="forensic-subsection">
                <h4>Change-Point Detection (CUSUM)</h4>
                <p className="section-methodology">
                  Detects moments when a supplier&apos;s spending pattern fundamentally shifts — potential
                  contract kickback start, price manipulation, or relationship change.
                </p>
                <div className="table-container">
                  <table className="doge-table compact">
                    <thead>
                      <tr><th>Supplier</th><th>Change Month</th><th>Shift Ratio</th><th>Total Spend</th></tr>
                    </thead>
                    <tbody>
                      {dogeFindings.temporal_intelligence.change_points.slice(0, 10).map((cp, i) => (
                        <tr key={i}>
                          <td><SupplierLink name={cp.supplier} hasSpending={hasSpending} /></td>
                          <td>{cp.change_month}</td>
                          <td><strong>{cp.shift_ratio}x</strong> mean</td>
                          <td>{formatCurrency(cp.total_spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SPC Control Charts */}
            {dogeFindings.temporal_intelligence.spc_charts?.length > 0 && (
              <div className="forensic-subsection">
                <h4>Statistical Process Control</h4>
                <p className="section-methodology">
                  Control charts for top suppliers. Payments beyond 3σ (action limit) indicate
                  out-of-control processes.
                </p>
                <div className="spc-summary">
                  {dogeFindings.temporal_intelligence.spc_charts.slice(0, 5).map((spc, i) => (
                    <div key={i} className={`spc-card ${spc.out_of_control > 0 ? 'alert' : ''}`}>
                      <strong><SupplierLink name={spc.supplier} hasSpending={hasSpending} maxLen={25} /></strong>
                      <div className="spc-stats">
                        <span>μ={formatCurrency(spc.mean)}/mo</span>
                        <span>σ={formatCurrency(spc.std_dev)}</span>
                        {spc.out_of_control > 0 && (
                          <span className="ooc-badge">{spc.out_of_control} out of control</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <VerificationPanel checks={[
              { label: 'Methodology', detail: 'CUSUM change-point detection, Shewhart control charts (2σ warning, 3σ action limits). INTOSAI ISSAI 3000 aligned.', status: 'pass' },
              { label: 'Limitation', detail: 'Year-end acceleration is common in public sector. Change-points may reflect legitimate contract changes. SPC assumes stable process.', status: 'info' },
            ]} />
          </div>
        </ExpandableSection>
      )}

      {/* Procurement Intelligence */}
      {dogeFindings.procurement_intelligence && (
        <ExpandableSection
          title="Procurement Intelligence"
          subtitle="Maverick spend, price escalation, cross-department splitting"
          severity={dogeFindings.procurement_intelligence.maverick_spend?.overall_maverick_pct > 30 ? 'warning' : 'info'}
        >
          <div className="forensic-section">
            {/* Maverick Spend */}
            {dogeFindings.procurement_intelligence.maverick_spend?.has_procurement_data && (
              <div className="forensic-subsection">
                <h4>Maverick Spend Detection</h4>
                <p className="section-methodology">
                  Off-contract spending: payments to suppliers not in any Contracts Finder procurement record.
                  Deloitte estimates 10-20% is typical; above 30% warrants review.
                </p>
                <div className="risk-summary-stats">
                  <div className={`stat-pill ${dogeFindings.procurement_intelligence.maverick_spend.overall_maverick_pct > 30 ? 'warning' : ''}`}>
                    Overall: <strong>{dogeFindings.procurement_intelligence.maverick_spend.overall_maverick_pct}%</strong> maverick
                  </div>
                  <div className="stat-pill">
                    {formatCurrency(dogeFindings.procurement_intelligence.maverick_spend.total_maverick_spend)} off-contract
                  </div>
                </div>
              </div>
            )}

            {/* Price Escalation */}
            {dogeFindings.procurement_intelligence.price_escalation?.alerts?.length > 0 && (
              <div className="forensic-subsection">
                <h4>Contract Price Escalation</h4>
                <p className="section-methodology">
                  Suppliers with real-terms price increases exceeding 20% (CPI-adjusted).
                </p>
                <div className="table-container">
                  <table className="doge-table compact">
                    <thead>
                      <tr><th>Supplier</th><th>Period</th><th>Real Growth</th><th>Total Spend</th></tr>
                    </thead>
                    <tbody>
                      {dogeFindings.procurement_intelligence.price_escalation.alerts.slice(0, 10).map((a, i) => (
                        <tr key={i}>
                          <td><SupplierLink name={a.supplier} hasSpending={hasSpending} /></td>
                          <td>{a.first_year}→{a.last_year}</td>
                          <td className="escalation">{a.real_growth_pct > 0 ? '+' : ''}{a.real_growth_pct}%</td>
                          <td>{formatCurrency(a.total_spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cross-Department Splitting */}
            {dogeFindings.procurement_intelligence.cross_dept_splitting?.flags?.length > 0 && (
              <div className="forensic-subsection">
                <h4>Cross-Department Contract Splitting</h4>
                <p className="section-methodology">
                  Same supplier paid across multiple departments — combined spend exceeds procurement thresholds
                  but individual department spend stays below.
                </p>
                <div className="risk-summary-stats">
                  <div className="stat-pill warning">
                    <strong>{dogeFindings.procurement_intelligence.cross_dept_splitting.total_flags}</strong> split flags
                    ({formatCurrency(dogeFindings.procurement_intelligence.cross_dept_splitting.total_value)})
                  </div>
                </div>
                <div className="table-container">
                  <table className="doge-table compact">
                    <thead>
                      <tr><th>Supplier</th><th>Year</th><th>Combined</th><th>Depts</th><th>Threshold</th></tr>
                    </thead>
                    <tbody>
                      {dogeFindings.procurement_intelligence.cross_dept_splitting.flags.slice(0, 10).map((f, i) => (
                        <tr key={i}>
                          <td><SupplierLink name={f.supplier} hasSpending={hasSpending} /></td>
                          <td>{f.financial_year}</td>
                          <td>{formatCurrency(f.combined_spend)}</td>
                          <td>{f.departments}</td>
                          <td>{formatCurrency(f.threshold_exceeded)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <VerificationPanel checks={[
              { label: 'Reference', detail: 'CIPS Procurement Best Practice, Deloitte Procurement Analytics, UK Public Contracts Regulations 2015.', status: 'pass' },
              { label: 'Limitation', detail: 'Maverick spend depends on Contracts Finder data completeness. Price escalation may reflect genuine scope changes.', status: 'info' },
            ]} />
          </div>
        </ExpandableSection>
      )}

      {/* Audit Standards & Materiality */}
      {dogeFindings.audit_standards && (
        <ExpandableSection
          title="Audit Standards & Materiality"
          subtitle={`INTOSAI materiality, ACFE risk matrix, peer benchmarking`}
          severity="info"
        >
          <div className="forensic-section">
            <p className="section-methodology">
              Aligned with international audit standards: INTOSAI ISSAI 3000, ACFE Report to the Nations 2024,
              CIPFA Financial Resilience Index, NAO Value for Money framework.
            </p>

            {/* Materiality */}
            {dogeFindings.audit_standards.materiality && (
              <div className="forensic-subsection">
                <h4>INTOSAI Materiality Threshold</h4>
                <div className="materiality-display">
                  <div className="materiality-value">
                    <strong>{formatCurrency(dogeFindings.audit_standards.materiality.threshold)}</strong>
                    <span>Materiality ({dogeFindings.audit_standards.materiality.threshold_pct}% of expenditure)</span>
                  </div>
                  <div className="materiality-value">
                    <strong>{formatCurrency(dogeFindings.audit_standards.materiality.planning_materiality)}</strong>
                    <span>Planning Materiality (0.5%)</span>
                  </div>
                </div>
                <p className="materiality-note">
                  Findings above materiality threshold would be &quot;likely to influence the decisions of intended
                  users&quot; (INTOSAI ISSAI 1320). Sub-material findings are still disclosed for transparency.
                </p>
              </div>
            )}

            {/* ACFE Risk Matrix */}
            {dogeFindings.audit_standards.acfe_risk_matrix && (
              <div className="forensic-subsection">
                <h4>ACFE Occupational Fraud Risk Matrix</h4>
                <div className="acfe-matrix">
                  {[
                    { key: 'asset_misappropriation', label: 'Asset Misappropriation', desc: 'Duplicates, fictitious vendors, credits' },
                    { key: 'corruption', label: 'Corruption', desc: 'Concentration, sole-source, CH breaches' },
                    { key: 'financial_statement', label: 'Financial Statement', desc: 'Budget variance, year-end spikes, reserves' },
                  ].map(({ key, label, desc }) => {
                    const score = dogeFindings.audit_standards.acfe_risk_matrix[key] || 0
                    return (
                      <div key={key} className="acfe-category">
                        <div className="acfe-label">
                          <strong>{label}</strong>
                          <span>{desc}</span>
                        </div>
                        <div className="acfe-bar-container">
                          <div
                            className={`acfe-bar ${score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <strong className="acfe-score">{score}/100</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Peer Benchmark */}
            {dogeFindings.audit_standards.peer_benchmark?.fraud_triangle_rank > 0 && (
              <div className="forensic-subsection">
                <h4>Lancashire Peer Benchmark</h4>
                <p>
                  Fraud triangle rank: <strong>{dogeFindings.audit_standards.peer_benchmark.fraud_triangle_rank}</strong>
                  /{dogeFindings.audit_standards.peer_benchmark.total_councils} councils
                  (percentile: {dogeFindings.audit_standards.peer_benchmark.fraud_triangle_percentile}%)
                </p>
              </div>
            )}
          </div>
        </ExpandableSection>
      )}

      {/* Supplier Lifecycle */}
      {dogeFindings.supplier_lifecycle?.total_pump_dump > 0 && (
        <ExpandableSection
          title="Supplier Lifecycle Analysis"
          subtitle={`${dogeFindings.supplier_lifecycle.total_pump_dump} pump-and-dump flags, ${dogeFindings.supplier_lifecycle.total_escalations} escalation alerts`}
          severity={dogeFindings.supplier_lifecycle.total_pump_dump > 3 ? 'warning' : 'info'}
        >
          <div className="forensic-section">
            <div className="forensic-subsection">
              <h4>Pump-and-Dump Detection</h4>
              <p className="section-methodology">
                Suppliers active &lt;6 months, receiving &gt;£50K, then disappearing. May indicate
                fictitious vendor fraud or phoenix company behaviour.
              </p>
              {dogeFindings.supplier_lifecycle.pump_dump?.length > 0 && (
                <div className="table-container">
                  <table className="doge-table compact">
                    <thead>
                      <tr><th>Supplier</th><th>Spend</th><th>Active Days</th><th>Last Payment</th></tr>
                    </thead>
                    <tbody>
                      {dogeFindings.supplier_lifecycle.pump_dump.slice(0, 10).map((p, i) => (
                        <tr key={i}>
                          <td><SupplierLink name={p.supplier} hasSpending={hasSpending} /></td>
                          <td>{formatCurrency(p.total_spend)}</td>
                          <td>{p.active_days} days</td>
                          <td>{p.last_payment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </ExpandableSection>
      )}

      {/* Methodology & Technique Inventory */}
      <ExpandableSection
        title="Methodology & Standards"
        subtitle={`${dogeFindings.technique_count || analysesRun.length} forensic techniques applied`}
        severity="info"
      >
        <div className="forensic-section">
          <div className="methodology-overview">
            <h4>Analysis Framework</h4>
            <p>
              This investigation applies <strong>{dogeFindings.technique_count || analysesRun.length} forensic analysis techniques</strong> across
              6 categories, aligned with international audit and fraud examination standards.
            </p>

            <div className="standards-grid">
              <div className="standard-card">
                <strong>ACFE</strong>
                <span>Association of Certified Fraud Examiners — Report to the Nations 2024</span>
              </div>
              <div className="standard-card">
                <strong>INTOSAI</strong>
                <span>International Standards of Supreme Audit Institutions — ISSAI 3000</span>
              </div>
              <div className="standard-card">
                <strong>Nigrini</strong>
                <span>Benford&apos;s Law: Applications for Forensic Accounting (2012)</span>
              </div>
              <div className="standard-card">
                <strong>CIPFA</strong>
                <span>Chartered Institute of Public Finance — Financial Resilience Index</span>
              </div>
              <div className="standard-card">
                <strong>NAO</strong>
                <span>National Audit Office — Value for Money (3Es) Framework</span>
              </div>
              <div className="standard-card">
                <strong>OECD</strong>
                <span>Guidelines for Fighting Bid Rigging in Public Procurement (2025)</span>
              </div>
            </div>

            <h4>Technique Inventory</h4>
            <div className="technique-categories">
              {[
                { name: 'Statistical', techniques: ['Benford 1st digit', 'Benford 2nd digit', 'First-two digits', 'Last-two digits', 'Summation test', 'Per-supplier MAD', 'Chi-squared', 'Z-scores', 'Gini coefficient'] },
                { name: 'Forensic', techniques: ['Duplicate detection', 'Same-same-different', 'Fictitious vendor', 'Credit patterns', 'Description quality', 'Round-number analysis'] },
                { name: 'Supplier Risk', techniques: ['Composite risk score', 'Lifecycle analysis', 'Pump-and-dump', 'Dependency escalation', 'Shell company indicators'] },
                { name: 'Temporal', techniques: ['Year-end acceleration', 'Change-point (CUSUM)', 'SPC control charts', 'Payment cadence'] },
                { name: 'Procurement', techniques: ['Maverick spend', 'Price escalation', 'Contract splitting', 'Threshold avoidance', 'Weak competition'] },
                { name: 'Audit Standards', techniques: ['Materiality (INTOSAI)', 'ACFE risk matrix', 'Fraud triangle', 'Peer benchmarking', 'Budget variance'] },
              ].map((cat) => (
                <div key={cat.name} className="technique-category">
                  <strong>{cat.name}</strong>
                  <div className="technique-list">
                    {cat.techniques.map((t) => (
                      <span key={t} className="technique-badge">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ExpandableSection>

      {/* Cross-Council Comparison */}
      {crossCouncil && (crossCouncil.shared_suppliers || crossCouncil.shared_supplier_count) && (
        <section className="doge-cross-council">
          <h2>Cross-Council Intelligence</h2>
          <p className="section-intro">
            How {councilName} compares with neighbouring Lancashire councils.
          </p>

          <div className="cross-council-stats">
            <div className="cc-stat">
              <span className="cc-value">{crossCouncil.shared_suppliers || crossCouncil.shared_supplier_count || '—'}</span>
              <span className="cc-label">Shared Suppliers</span>
            </div>
            <div className="cc-stat">
              <span className="cc-value">{crossCouncil.combined_spend || crossCouncil.total_shared_spend || '—'}</span>
              <span className="cc-label">Combined Spend</span>
            </div>
            {crossCouncil.price_gap_example && (
              <div className="cc-stat highlight">
                <span className="cc-value">{crossCouncil.price_gap_example.disparity}</span>
                <span className="cc-label">Worst Price Gap ({crossCouncil.price_gap_example.supplier})</span>
              </div>
            )}
          </div>

          <div className="cross-council-insight">
            <p>
              Multiple Lancashire councils use the same suppliers — but often pay very different prices.
              Cross-council procurement analysis can identify where councils could negotiate better value.
            </p>
            <Link to="/compare" className="insight-link">
              View full cross-council comparison <ChevronRight size={16} />
            </Link>
          </div>
        </section>
      )}

      {/* Key Findings Detail */}
      {keyFindings.length > 0 && (
        <section className="doge-key-findings">
          <h2>Investigation Highlights</h2>
          <p className="section-intro">
            Specific patterns and anomalies worth further investigation.
          </p>

          <div className="key-findings-grid">
            {keyFindings.map((f, i) => {
              const baseLink = f.link || (hasSpending ? '/spending' : '/doge')
              const evidenceLink = baseLink.includes('?')
                ? `${baseLink}&ref=doge`
                : `${baseLink}?ref=doge`
              return (
                <Link key={i} to={evidenceLink} className={`key-finding-card ${f.severity || 'info'}`}>
                  <div className="kf-header">
                    <span className={`kf-badge ${f.severity || 'info'}`}>{f.badge}</span>
                    {f.confidence && <ConfidenceBadge level={f.confidence} />}
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.description}</p>
                  {f.context_note && (
                    <p className="kf-context-note">
                      <Info size={12} /> {f.context_note}
                    </p>
                  )}
                  <span className="kf-link">{f.link_text || 'Investigate →'}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* What Changed? — Accountability Tracking */}
      {outcomes?.outcomes?.length > 0 && (
        <section className="doge-outcomes-section">
          <h2>
            <Activity size={24} />
            What Changed?
          </h2>
          <p className="section-intro">
            Tracking whether our findings lead to real accountability.
            {outcomes.summary?.council_responses_received > 0
              ? ` ${outcomes.summary.council_responses_received} council response(s) received so far.`
              : ' No council responses received yet.'
            }
          </p>

          <div className="outcomes-grid">
            {outcomes.outcomes.map((o) => (
              <div key={o.id} className={`outcome-card status-${o.status}`}>
                <div className="outcome-header">
                  <span className={`outcome-status ${o.status}`}>
                    {o.status === 'resolved' ? <CheckCircle size={14} /> :
                     o.status === 'monitoring' ? <Eye size={14} /> :
                     <FileText size={14} />}
                    {o.status}
                  </span>
                  <span className="outcome-date">{new Date(o.date).toLocaleDateString('en-GB')}</span>
                </div>
                <h4>{o.finding}</h4>
                <p className="outcome-response">{o.response}</p>
                {o.next_steps?.length > 0 && (
                  <div className="outcome-next-steps">
                    <span className="next-steps-label">Next steps:</span>
                    <ul>
                      {o.next_steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="outcomes-summary">
            <div className="os-stat">
              <span className="os-value">{outcomes.summary?.total_findings_published || 0}</span>
              <span className="os-label">Findings Published</span>
            </div>
            <div className="os-stat">
              <span className="os-value">{outcomes.summary?.council_responses_received || 0}</span>
              <span className="os-label">Council Responses</span>
            </div>
            <div className="os-stat">
              <span className="os-value">{outcomes.summary?.policy_changes_tracked || 0}</span>
              <span className="os-label">Policy Changes</span>
            </div>
            <div className="os-stat">
              <span className="os-value">{outcomes.summary?.foi_requests_submitted || 0}</span>
              <span className="os-label">FOI Requests</span>
            </div>
          </div>
        </section>
      )}

      {/* Self-Verification Summary */}
      <section className="doge-verification-section" aria-label="Analysis verification">
        <h2>
          <Shield size={24} />
          Analysis Verification
        </h2>
        <p className="section-intro">
          Every finding is subjected to automated verification checks.
          Here is the full verification status for this investigation.
        </p>

        <VerificationPanel checks={verificationChecks} />

        {/* Automated warnings — challenges to our own findings */}
        {autoWarnings.length > 0 && (
          <div className="verification-warnings">
            <h4><AlertTriangle size={18} /> Self-Challenges</h4>
            <p className="warnings-intro">
              Our verification engine identified the following concerns about this analysis:
            </p>
            {autoWarnings.map((w, i) => (
              <div key={i} className="warning-item">
                <AlertTriangle size={16} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="verification-methodology">
          <h4>Our Verification Framework</h4>
          <div className="methodology-grid">
            <div className="methodology-card">
              <CheckCircle size={20} />
              <h5>Temporal Logic</h5>
              <p>Payment dates cross-referenced against violation periods. Only confirmed overlaps flagged.</p>
            </div>
            <div className="methodology-card">
              <Scale size={20} />
              <h5>Confidence Scoring</h5>
              <p>Each finding rated high/medium/low based on data quality and matching certainty.</p>
            </div>
            <div className="methodology-card">
              <GitCompareArrows size={20} />
              <h5>Cross-Validation</h5>
              <p>Results compared across neighbouring Lancashire councils to identify systemic vs local issues.</p>
            </div>
            <div className="methodology-card">
              <Eye size={20} />
              <h5>Limitation Disclosure</h5>
              <p>Every analysis includes known limitations and false positive risks.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Legal & Data Context */}
      <section className="doge-legal-context">
        <h2>
          <Scale size={24} />
          Legal Framework
        </h2>
        <p className="section-intro">
          {legalFramework && legalFramework.length > 0
            ? `${legalFramework.length} laws and regulations underpin this investigation. Every finding is mapped to specific statutory requirements.`
            : 'The laws and regulations that govern council spending transparency.'}
        </p>

        <div className="legal-grid">
          {legalFramework && legalFramework.length > 0
            ? legalFramework.slice(0, 12).map((law, i) => (
                <div key={i} className={`legal-card legal-${law.category}`}>
                  <div className="legal-card-header">
                    <span className={`legal-category-badge ${law.category}`}>{law.category}</span>
                  </div>
                  <h4>{law.title}</h4>
                  <p className="legal-summary">{law.summary}</p>
                  <p className="legal-relevance">{law.relevance}</p>
                  {law.signals && law.signals.length > 0 && (
                    <div className="legal-signals">
                      <span className="signals-label">Detection signals:</span>
                      {law.signals.slice(0, 3).map((s, j) => (
                        <span key={j} className="signal-tag">{s}</span>
                      ))}
                    </div>
                  )}
                  {law.url && (
                    <a href={law.url} target="_blank" rel="noopener noreferrer" className="legal-link">
                      View legislation <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              ))
            : <>
                <div className="legal-card">
                  <FileText size={20} />
                  <h4>Transparency Code 2015</h4>
                  <p>Requires councils to publish spending over £500 quarterly, contracts over £5,000, and maintain a public contracts register.</p>
                </div>
                <div className="legal-card">
                  <Scale size={20} />
                  <h4>Public Contract Regulations</h4>
                  <p>UK procurement thresholds: £30,000 (low value), £138,760 (goods/services), £5,372,609 (works). Split payments to circumvent thresholds are illegal.</p>
                </div>
                <div className="legal-card">
                  <Building size={20} />
                  <h4>Companies Act 2006</h4>
                  <p>Companies must have at least one active director and file accounts annually. Paying companies in breach creates governance risk.</p>
                </div>
              </>
          }
        </div>
      </section>

      {/* Take Action */}
      <section className="doge-action-section">
        <h2>Take Action</h2>
        <p className="section-intro">
          Public scrutiny only works when people use it. Here&apos;s how you can help.
        </p>

        <div className="action-grid">
          {hasSpending && (
            <Link to="/spending?ref=doge" className="action-card">
              <Search size={24} />
              <h4>Search the Data</h4>
              <p>Explore every transaction yourself. Filter by supplier, department, or date.</p>
            </Link>
          )}
          {dataSources.foi && (
            <Link to="/foi" className="action-card">
              <FileText size={24} />
              <h4>Submit an FOI</h4>
              <p>Use our pre-written templates to request more detail from the council.</p>
            </Link>
          )}
          {dataSources.meetings && (
            <Link to="/meetings" className="action-card">
              <Users size={24} />
              <h4>Attend a Meeting</h4>
              <p>Ask questions at Full Council. Hold decision-makers to account in person.</p>
            </Link>
          )}
          <Link to="/compare" className="action-card">
            <GitCompareArrows size={24} />
            <h4>Compare Councils</h4>
            <p>See how {councilName} stacks up against neighbouring councils.</p>
          </Link>
        </div>
      </section>

      {/* Footer disclaimer */}
      <div className="doge-disclaimer">
        <Shield size={16} />
        <p>
          This analysis is generated algorithmically from publicly available data under the
          Local Government Transparency Code 2015. It represents independent public scrutiny,
          not accusations of wrongdoing. All findings should be verified through official channels.
          <Link to="/legal"> Full legal disclaimer</Link>
        </p>
      </div>
    </div>
  )
}

export default DogeInvestigation
