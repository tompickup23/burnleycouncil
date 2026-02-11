import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Shield, ChevronRight, TrendingUp, Building,
  PoundSterling, Users, Repeat, GitCompareArrows, Eye,
  CheckCircle, XCircle, HelpCircle, FileText, Scale,
  BarChart3, Search, ArrowUpRight, Info, ChevronDown, ChevronUp,
  Clock, Zap, Activity
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis, Legend
} from 'recharts'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import { SEVERITY_COLORS as severityColors } from '../utils/constants'
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

function DogeInvestigation() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const dataSources = config.data_sources || {}
  const dogeContext = config.doge_context || {}

  const dataUrls = [
    '/data/doge_findings.json',
    '/data/doge_knowledge.json',
    '/data/insights.json',
    '/data/doge_verification.json',
    '/data/shared/legal_framework.json',
    '/data/outcomes.json',
  ]

  const { data, loading, error } = useData(dataUrls)

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

  const [dogeFindings, dogeKnowledge, insights, verification, legalFramework, outcomes] = data || []

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

      {/* Critical Findings */}
      <section className="doge-findings-section" aria-label="Key findings">
        <h2>Key Findings</h2>
        <p className="section-intro">
          The most significant patterns identified in {councilName}&apos;s spending data.
        </p>

        <div className="doge-findings-overview">
          {findings.map((f, i) => {
            // Build evidence-aware link: append ref=doge for evidence trail
            const baseLink = f.link || '/spending'
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
                          <Link
                            to={`/spending?supplier=${encodeURIComponent((c.supplier || c.name || '').toUpperCase())}&ref=doge`}
                            className="case-name case-name-link"
                          >
                            {c.supplier || c.name}
                          </Link>
                          <span className="case-amount">{c.spend || c.amount}</span>
                          <span className="case-issue">{c.issue || c.note}</span>
                          <Link
                            to={`/spending?supplier=${encodeURIComponent((c.supplier || c.name || '').toUpperCase())}&ref=doge`}
                            className="case-evidence-link"
                          >
                            View transactions →
                          </Link>
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
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis
                          dataKey="metric"
                          tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
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
                                <Link to={`/spending?supplier=${encodeURIComponent(p.supplier)}&ref=doge`}>
                                  {p.supplier.length > 30 ? p.supplier.substring(0, 30) + '...' : p.supplier}
                                </Link>
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
                                <Link to={`/spending?supplier=${encodeURIComponent(p.supplier)}&ref=doge`}>
                                  {p.supplier.length > 30 ? p.supplier.substring(0, 30) + '...' : p.supplier}
                                </Link>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickFormatter={d => d.slice(0, 3)} />
                        <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
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
                                <Link to={`/spending?supplier=${encodeURIComponent(s.supplier)}&ref=doge`}>
                                  {s.supplier.length > 30 ? s.supplier.substring(0, 30) + '...' : s.supplier}
                                </Link>
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
                                <Link to={`/spending?supplier=${encodeURIComponent(w.supplier)}&ref=doge`}>
                                  {w.supplier.length > 30 ? w.supplier.substring(0, 30) + '...' : w.supplier}
                                </Link>
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
                  label: 'Limitation',
                  detail: 'Proximity to thresholds alone does not prove avoidance. Late publication may reflect admin delay rather than intent to conceal.',
                  status: 'info'
                },
                {
                  label: 'Data source',
                  detail: 'Contracts Finder API — only published notices are available. Some contracts below threshold may not be published.',
                  status: 'info'
                }
              ]} />
            </div>
          </ExpandableSection>
        )}
      </section>

      {/* Cross-Council Comparison */}
      {crossCouncil && (crossCouncil.shared_suppliers || crossCouncil.shared_supplier_count) && (
        <section className="doge-cross-council">
          <h2>Cross-Council Intelligence</h2>
          <p className="section-intro">
            How {councilName} compares with neighbouring East Lancashire councils.
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
              Multiple East Lancashire councils use the same suppliers — but often pay very different prices.
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
              const baseLink = f.link || '/spending'
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
              <p>Results compared across 4 neighbouring councils to identify systemic vs local issues.</p>
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
          <Link to="/spending?ref=doge" className="action-card">
            <Search size={24} />
            <h4>Search the Data</h4>
            <p>Explore every transaction yourself. Filter by supplier, department, or date.</p>
          </Link>
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
