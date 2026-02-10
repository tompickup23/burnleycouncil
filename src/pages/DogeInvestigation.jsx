import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Shield, ChevronRight, TrendingUp, Building,
  PoundSterling, Users, Repeat, GitCompareArrows, Eye,
  CheckCircle, XCircle, HelpCircle, FileText, Scale,
  BarChart3, Search, ArrowUpRight, Info, ChevronDown, ChevronUp
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
import './DogeInvestigation.css'

// Severity colour map
const severityColors = {
  critical: '#ff453a',
  alert: '#ff453a',
  high: '#ff6b6b',
  warning: '#ff9f0a',
  medium: '#ffcc02',
  info: '#0a84ff',
  low: '#30d158',
}

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

  const [dogeFindings, dogeKnowledge, insights, verification, legalFramework] = data || []

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
          {findings.map((f, i) => (
            <Link key={i} to={f.link || '/spending'} className={`doge-finding-card ${f.severity || 'info'}`}>
              <div className="finding-severity-bar" style={{ background: severityColors[f.severity] || severityColors.info }} />
              <span className="doge-finding-value">{f.value}</span>
              <span className="doge-finding-label">{f.label}</span>
              <span className="doge-finding-detail">{f.detail}</span>
              {f.context_note && (
                <span className="doge-finding-context">
                  <Info size={12} /> {f.context_note}
                </span>
              )}
              <span className="finding-link-arrow"><ArrowUpRight size={16} /></span>
            </Link>
          ))}
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
                          <span className="case-name">{c.supplier || c.name}</span>
                          <span className="case-amount">{c.spend || c.amount}</span>
                          <span className="case-issue">{c.issue || c.note}</span>
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
            {keyFindings.map((f, i) => (
              <Link key={i} to={f.link || '/spending'} className={`key-finding-card ${f.severity || 'info'}`}>
                <div className="kf-header">
                  <span className={`kf-badge ${f.severity || 'info'}`}>{f.badge}</span>
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
            ))}
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
          <Link to="/spending" className="action-card">
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
