import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, AlertTriangle, Users, Building, PoundSterling, FileText,
  Search, ChevronRight, Shield, Eye, Info, Newspaper, FileQuestion,
  Calendar, Repeat, GitCompareArrows, Zap, Scale, BarChart3, Target,
  ArrowDown, HelpCircle, ExternalLink
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState, DataFreshness } from '../components/ui'
import ReformShowcase from '../components/ReformShowcase'
import './Home.css'

// Map icon names from doge_findings.json to Lucide components
const iconMap = {
  'alert-triangle': AlertTriangle,
  'repeat': Repeat,
  'users': Users,
  'trending-up': TrendingUp,
  'building': Building,
  'pound-sterling': PoundSterling,
  'git-compare-arrows': GitCompareArrows,
}

// Party colors — static, safe at module scope
const partyColors = {
  'Independent': '#800080',
  'Labour': '#DC241F',
  'Labour & Co-operative Party': '#DC241F',
  'Lab & Co-op': '#DC241F',
  'Liberal Democrats': '#FAA61A',
  'Conservative': '#0087DC',
  'Green Party': '#6AB023',
  'Green': '#6AB023',
  'Reform UK': '#12B6CF',
  'Our West Lancs': '#8B4DAB',
  'Labour and Co-operative': '#DC241F',
}

function Home() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const officialUrl = config.official_website || '#'
  const dataSources = config.data_sources || {}
  const spendingThreshold = config.spending_threshold || 500
  const spendingPeriod = config.spending_data_period || 'Recent years'

  // Build list of data files to fetch — only request what exists
  const dataUrls = ['/data/insights.json']
  if (dataSources.doge_investigation) dataUrls.push('/data/doge_findings.json')
  if (dataSources.politics) dataUrls.push('/data/politics_summary.json')
  if (dataSources.news) dataUrls.push('/data/articles-index.json')
  if (dataSources.budget_trends) dataUrls.push('/data/revenue_trends.json')
  // Reform transformation showcase (only LCC currently)
  const hasReformShowcase = config.council_id === 'lancashire_cc'
  if (hasReformShowcase) dataUrls.push('/data/reform_transformation.json')

  const { data, loading, error } = useData(dataUrls)

  useEffect(() => {
    document.title = `Home | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  // JSON-LD structured data for SEO (schema.org/WebSite)
  useEffect(() => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: `${councilName} Council Transparency`,
      url: window.location.origin + (window.location.pathname.split('/').slice(0, -1).join('/') || '/'),
      description: `Independent transparency platform for ${councilName} Borough Council public spending, budgets, and accountability.`,
      publisher: { '@type': 'Organization', name: 'AI DOGE' },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${window.location.origin}${window.location.pathname}spending?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    }
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [councilName])

  // Unpack data based on what was requested (must be before any early return)
  let idx = 0
  const insights = data?.[idx++]
  const dogeFindings = dataSources.doge_investigation ? data?.[idx++] : null
  const politicsSummary = dataSources.politics ? data?.[idx++] : null
  const articlesRaw = dataSources.news ? data?.[idx++] : null
  // Guard against both plain array and {articles: [...]} wrapper formats
  const articlesIndex = Array.isArray(articlesRaw) ? articlesRaw : articlesRaw?.articles || articlesRaw || []
  const revenueTrends = dataSources.budget_trends ? data?.[idx++] : null
  const reformTransformation = hasReformShowcase ? data?.[idx++] : null

  // Summary stats — handle both field name variants
  const totalSpend = insights?.summary?.total_spend || insights?.summary?.total_transaction_spend || 0
  const totalRecords = insights?.summary?.transaction_count || insights?.transparency_metrics?.total_records || 0
  const uniqueSuppliers = insights?.summary?.unique_suppliers || 0
  const topSupplierConcentration = insights?.supplier_analysis?.concentration_ratio || 0

  // Date range label from insights
  const dateRange = insights?.summary?.date_range
  const periodLabel = dateRange
    ? `${new Date(dateRange.min).getFullYear()}-${String(new Date(dateRange.max).getFullYear()).slice(-2)}`
    : spendingPeriod

  // DOGE savings calculation from efficiency flags
  const dogeStats = useMemo(() => {
    const flags = insights?.efficiency_flags || []
    const duplicates = flags.find(f => f.type === 'same_day_duplicates')
    const roundNumbers = flags.find(f => f.type === 'round_number_payments')
    const frequentSmall = flags.find(f => f.type === 'frequent_small_transactions')

    const potentialSavings = (duplicates?.potential_value || 0)
    const flagsCount = flags.reduce((sum, f) => sum + (f.count || 0), 0)

    return { potentialSavings, flagsCount, duplicates, roundNumbers, frequentSmall }
  }, [insights])

  // Prepare chart data for top suppliers
  const topSuppliersChart = useMemo(() => insights?.supplier_analysis?.top_20_suppliers?.slice(0, 8)?.map(s => ({
    name: s.supplier.split(' ').slice(0, 2).join(' '),
    fullName: s.supplier,
    amount: s.total / 1_000_000,
  })) || [], [insights])

  // Prepare spending by year chart data
  const spendByYearChart = useMemo(() => Object.entries(insights?.yoy_analysis?.spend_by_year || {}).map(([year, amount]) => ({
    year,
    amount: amount / 1_000_000,
  })), [insights])

  const partyData = useMemo(() => politicsSummary?.by_party?.map(p => ({
    name: p.party,
    value: p.count,
    color: partyColors[p.party] || '#808080',
  })) || [], [politicsSummary])

  if (loading) {
    return <LoadingState message="Loading dashboard data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  // DOGE findings from data file
  const findings = dogeFindings?.findings || []
  const keyFindings = dogeFindings?.key_findings || []

  return (
    <div className="home-page animate-fade-in" aria-busy={loading}>
      {/* Disclaimer Banner */}
      <div className="disclaimer-banner">
        <Shield size={16} />
        <span>
          <strong>Independent Transparency Tool</strong> — NOT affiliated with {councilFullName}.
          Data may contain errors — always <a href={officialUrl} target="_blank" rel="noopener noreferrer">verify with official sources</a>. <Link to="/legal">Legal disclaimer</Link>
        </span>
      </div>

      {/* ===== NEW HERO: Impact-First Dashboard ===== */}
      <header className="hero-section" aria-label="Council spending overview">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <Shield size={16} />
            <span>AI DOGE — Department of Government Efficiency</span>
          </div>
          <h1>We Audited Every Pound<br /><span className="highlight">{councilFullName} Spent.</span></h1>
          <p className="hero-subtitle">
            Every payment your council makes with public money is published by law.
            We collected it all, ran 12 automated forensic checks, and here&apos;s what we found.
          </p>
        </div>

        {/* Impact Stats — the headline numbers */}
        <div className="impact-grid">
          <div className="impact-card impact-spend">
            <PoundSterling size={20} className="impact-icon" />
            <span className="impact-value">{formatCurrency(totalSpend, true)}</span>
            <span className="impact-label">Total Spending Tracked</span>
            <span className="impact-period">{periodLabel}</span>
          </div>
          <div className="impact-card impact-transactions">
            <FileText size={20} className="impact-icon" />
            <span className="impact-value">{formatNumber(totalRecords)}</span>
            <span className="impact-label">Individual Payments</span>
            <span className="impact-period">Each one checked</span>
          </div>
          <div className="impact-card impact-suppliers">
            <Building size={20} className="impact-icon" />
            <span className="impact-value">{formatNumber(uniqueSuppliers)}</span>
            <span className="impact-label">Companies Paid</span>
            <span className="impact-period">Cross-referenced</span>
          </div>
          {dogeStats.potentialSavings > 0 && (
            <div className="impact-card impact-savings">
              <Zap size={20} className="impact-icon" />
              <span className="impact-value">{formatCurrency(dogeStats.potentialSavings, true)}</span>
              <span className="impact-label">Potential Savings Identified</span>
              <span className="impact-period">Flagged for investigation</span>
            </div>
          )}
        </div>

        <div className="hero-actions">
          <Link to="/spending" className="btn-primary">
            <Search size={18} />
            Search Every Payment
          </Link>
          {dataSources.doge_investigation && (
            <Link to="/doge" className="btn-accent">
              <Shield size={18} />
              Read the Full Audit
            </Link>
          )}
          {dataSources.budgets && (
            <Link to="/budgets" className="btn-secondary">
              View Budgets
              <ChevronRight size={18} />
            </Link>
          )}
        </div>
        <DataFreshness source="Spending data" />
      </header>

      {/* ===== WHAT IS THIS? — For complete novices ===== */}
      <section className="explainer-section">
        <div className="explainer-card">
          <h2><HelpCircle size={22} /> What Is This?</h2>
          <div className="explainer-grid">
            <div className="explainer-item">
              <div className="explainer-step">1</div>
              <div>
                <h4>Your council spends your money</h4>
                <p>
                  {councilFullName} collects council tax and spends it on local services.
                  By law, they must publish every payment over {formatCurrency(spendingThreshold)}.
                </p>
              </div>
            </div>
            <div className="explainer-item">
              <div className="explainer-step">2</div>
              <div>
                <h4>We collected all the data</h4>
                <p>
                  We downloaded {formatNumber(totalRecords)} payment records covering {periodLabel} and
                  built a searchable database anyone can explore.
                </p>
              </div>
            </div>
            <div className="explainer-item">
              <div className="explainer-step">3</div>
              <div>
                <h4>AI ran 12 forensic checks</h4>
                <p>
                  Duplicate payments, split payment evasion, Companies House compliance,
                  Benford&apos;s Law screening, and more — all automated, all transparent.
                </p>
              </div>
            </div>
            <div className="explainer-item">
              <div className="explainer-step">4</div>
              <div>
                <h4>You hold them to account</h4>
                <p>
                  Use this data at council meetings, in FOI requests, or just to understand
                  where your money goes. Democracy works best when people are informed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Service Scope — shows what this council tier handles */}
      <ServiceScope tier={config.council_tier} councilName={councilName} />

      {/* ===== DOGE FINDINGS — Lead with the audit results ===== */}
      {findings.length > 0 && (
        <section className="doge-section">
          <div className="doge-header">
            <div className="doge-header-text">
              <h2><Shield size={22} /> DOGE Audit Results</h2>
              <p className="section-intro">
                Our automated checks flagged {dogeStats.flagsCount > 0 ? formatNumber(dogeStats.flagsCount) + ' anomalies' : 'these patterns'} across {formatNumber(totalRecords)} transactions.
                Anomalies are not accusations — they&apos;re starting points for investigation.
              </p>
            </div>
          </div>

          <div className="doge-findings-grid">
            {findings.slice(0, 4).map((f, i) => (
              <Link key={i} to={f.link || '/spending'} className={`doge-card ${f.severity || 'info'}`}>
                <div className="doge-card-header">
                  <span className={`doge-severity ${f.severity || 'info'}`}>{f.severity || 'info'}</span>
                  {f.confidence && <span className="doge-confidence">{f.confidence} confidence</span>}
                </div>
                <span className="doge-value">{f.value}</span>
                <span className="doge-label">{f.label}</span>
                <span className="doge-detail">{f.detail}</span>
              </Link>
            ))}
          </div>

          {findings.length > 4 && (
            <div className="doge-more-findings">
              {findings.slice(4).map((f, i) => (
                <Link key={i} to={f.link || '/spending'} className={`doge-mini-card ${f.severity || 'info'}`}>
                  <span className="doge-mini-value">{f.value}</span>
                  <span className="doge-mini-label">{f.label}</span>
                </Link>
              ))}
            </div>
          )}

          <Link to="/doge" className="doge-cta">
            Read the full DOGE investigation with methodology &amp; evidence <ChevronRight size={16} />
          </Link>
        </section>
      )}

      {/* ===== KEY FINDINGS — Data-driven investigation cards ===== */}
      {keyFindings.length > 0 && (
        <section className="findings-section">
          <h2>Key Findings</h2>
          <p className="section-intro">
            Specific patterns in the spending data worth knowing about.
          </p>

          <div className="findings-grid">
            {keyFindings.slice(0, 4).map((f, i) => {
              const IconComponent = iconMap[f.icon] || AlertTriangle
              return (
                <Link key={i} to={f.link || '/spending'} className={`finding-card ${f.severity || 'info'}`}>
                  <div className="finding-header">
                    <IconComponent size={24} className="finding-icon" />
                    <span className="finding-badge">{f.badge}</span>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.description}</p>
                  <span className="finding-link">{f.link_text || 'View details \u2192'}</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ===== FOLLOW THE MONEY — Charts ===== */}
      <section className="charts-section">
        <h2><BarChart3 size={22} /> Follow the Money</h2>
        <p className="section-intro">
          Where does your council tax actually go? Here are the biggest recipients and spending trends.
        </p>

        <div className="charts-grid">
          {/* Top Suppliers Chart */}
          <div className="chart-card">
            <h3>Largest Suppliers ({periodLabel})</h3>
            <p className="chart-description">
              These 8 companies received the most public money. Top 20 suppliers account
              for {formatPercent(topSupplierConcentration * 100)} of all payments.
            </p>
            <div className="chart-container" role="img" aria-label="Bar chart showing top 8 suppliers by total payment value">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSuppliersChart} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `\u00A3${v}M`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
                    formatter={(value, name, props) => [`\u00A3${value.toFixed(2)}M`, props.payload.fullName]}
                  />
                  <Bar dataKey="amount" fill="var(--accent-orange)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Link to="/spending" className="chart-link">Search all supplier payments &rarr;</Link>
          </div>

          {/* Spending by Year */}
          {spendByYearChart.length > 0 && (
            <div className="chart-card">
              <h3>Annual External Payments</h3>
              <p className="chart-description">Total payments to suppliers by financial year (millions)</p>
              <div className="chart-container" role="img" aria-label="Bar chart showing annual external payment totals by financial year">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={spendByYearChart} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                      tickFormatter={(v) => `\u00A3${v}M`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                      }}
                      formatter={(value) => [`\u00A3${value.toFixed(2)}M`, 'External Payments']}
                    />
                    <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Data Context Banner */}
      <div className="context-banner">
        <Info size={18} />
        <div>
          <strong>Understanding the numbers:</strong> The spending data shows external payments to suppliers
          (invoices over {formatCurrency(spendingThreshold)}, contracts over {formatCurrency(5000)}, purchase cards) — covering <em>both</em> revenue spending
          (day-to-day running costs) and capital spending (one-off investments like construction projects).
          {revenueTrends?.latest_budget && (
            <> The council&apos;s <strong>Net Revenue Budget</strong> is {formatCurrency(revenueTrends.latest_budget, true)}, funded
            by council tax and business rates.</>
          )}
          {dataSources.budgets && <Link to="/budgets"> See full budget breakdown &rarr;</Link>}
        </div>
      </div>

      {/* ===== SUPPLIER CONCENTRATION — Always available from insights ===== */}
      <section className="findings-section">
        <h2><Target size={22} /> Supplier Concentration</h2>
        <p className="section-intro">
          {formatNumber(uniqueSuppliers)} companies were paid by the council. But the money isn&apos;t spread evenly.
        </p>

        <div className="concentration-grid">
          <div className="concentration-stat">
            <span className="concentration-value">{formatPercent(topSupplierConcentration * 100)}</span>
            <span className="concentration-label">of all payments go to just 20 suppliers</span>
          </div>
          <div className="concentration-stat">
            <span className="concentration-value">{formatNumber(insights?.supplier_analysis?.single_transaction_suppliers || 0)}</span>
            <span className="concentration-label">suppliers were paid only once</span>
          </div>
        </div>

        <Link to="/spending" className="doge-cta" style={{ marginTop: 'var(--space-md)' }}>
          Explore all supplier payments <ChevronRight size={16} />
        </Link>
      </section>

      {/* ===== REFORM TRANSFORMATION — LCC only ===== */}
      {reformTransformation && (
        <ReformShowcase data={reformTransformation} />
      )}

      {/* ===== WHO RUNS YOUR COUNCIL — Politics section ===== */}
      {politicsSummary && partyData.length > 0 && (
        <section className="politics-section">
          <h2><Users size={22} /> Who Runs Your Council?</h2>
          <p className="section-intro">
            {politicsSummary.total_councillors || ''} elected councillors make decisions about how your money is spent.
            They set the budget, approve contracts, and answer to you.
          </p>

          <div className="politics-grid">
            <div className="council-composition">
              <div className="composition-visual">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={partyData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      label={({ value }) => `${value}`}
                      labelLine={false}
                    >
                      {partyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                      }}
                      formatter={(value, name) => [`${value} seats`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="party-breakdown">
                <h4>Council Seats</h4>
                {politicsSummary.by_party?.map((party, i) => (
                  <div key={i} className="party-row">
                    <span
                      className="party-dot"
                      style={{ background: partyColors[party.party] || '#808080' }}
                    />
                    <span className="party-name">{party.party}</span>
                    <span className="party-count">{party.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {politicsSummary.coalition && (
              <div className="coalition-info">
                <div className="coalition-card ruling">
                  <h4>Ruling Coalition</h4>
                  <div className="coalition-seats">
                    <span className="seat-count">{politicsSummary.coalition.total_seats || 0}</span>
                    <span className="seat-label">of {politicsSummary.total_councillors || ''} seats</span>
                  </div>
                  <p className="coalition-parties">
                    {politicsSummary.coalition.parties?.join(' + ') || 'Coalition'}
                  </p>
                </div>

                <Link to="/politics" className="view-councillors-btn">
                  <Users size={18} />
                  View All Councillors
                  <ChevronRight size={18} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===== LATEST NEWS — Investigations and analysis ===== */}
      {articlesIndex.length > 0 && (
        <section className="news-preview-section">
          <h2><Newspaper size={24} /> Latest Investigations</h2>
          <p className="section-intro">
            Data-driven investigations and analysis for {councilName} Council.
          </p>

          <div className="news-preview-grid">
            {articlesIndex.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3).map((article, i) => (
              <Link key={article.id} to={`/news/${article.id}`} className={`news-preview-card${i === 0 ? ' featured' : ''}`}>
                <span className={`category-badge ${(article.category || 'analysis').toLowerCase()}`}>{article.category || 'Analysis'}</span>
                <h4>{article.title}</h4>
                <p>{article.summary?.slice(0, 180)}{article.summary?.length > 180 ? '\u2026' : ''}</p>
                <span className="read-more">Read more <ChevronRight size={14} /></span>
              </Link>
            ))}
          </div>

          <Link to="/news" className="view-all-link">
            View all investigations <ChevronRight size={16} />
          </Link>
        </section>
      )}

      {/* ===== UPCOMING MEETINGS ===== */}
      {dataSources.meetings && (
        <section className="meetings-preview-section">
          <h2><Calendar size={24} /> Upcoming Meetings</h2>
          <p className="section-intro">
            Council meetings where decisions are made about your money. Attend, ask questions, hold them to account.
          </p>
          <div className="meetings-preview-grid">
            <Link to="/meetings" className="meetings-preview-card highlight">
              <span className="meeting-preview-label">Full Council</span>
              <h4>Public Question Time</h4>
              <p>Every resident can ask questions at Full Council. Use our DOGE findings to challenge spending decisions.</p>
              <span className="read-more">View meetings calendar <ChevronRight size={14} /></span>
            </Link>
            <Link to="/meetings" className="meetings-preview-card">
              <span className="meeting-preview-label">Scrutiny</span>
              <h4>Hold the Cabinet to Account</h4>
              <p>Scrutiny committees review Executive decisions and can investigate concerns raised by the public.</p>
              <span className="read-more">See upcoming scrutiny <ChevronRight size={14} /></span>
            </Link>
          </div>
        </section>
      )}

      {/* ===== DATA SOURCES — Trust and credibility ===== */}
      <section className="sources-section">
        <h2><Eye size={22} /> About the Data</h2>
        <p className="section-intro">
          Everything on this site comes from publicly available sources. Here&apos;s exactly where.
        </p>

        <div className="sources-grid">
          <div className="source-card">
            <FileText size={24} />
            <h4>Council Spending Data</h4>
            <p>
              Every payment over {formatCurrency(spendingThreshold)} published under the Local Government Transparency Code 2015.
              Councils are legally required to publish this data.
            </p>
            <span className="source-period">{spendingPeriod}</span>
          </div>
          {dataSources.politics && (
            <div className="source-card">
              <Users size={24} />
              <h4>Councillor Data</h4>
              <p>Names, wards, and party affiliations from the council&apos;s committee management system (ModernGov).</p>
              <span className="source-period">Current members</span>
            </div>
          )}
          <div className="source-card">
            <Shield size={24} />
            <h4>Companies House</h4>
            <p>Every supplier cross-referenced against the official company register to check compliance status.</p>
            <span className="source-period">Live API checks</span>
          </div>
          <div className="source-card">
            <Scale size={24} />
            <h4>Data Quality</h4>
            <p>
              {insights?.transparency_metrics
                ? `${formatPercent(
                    (insights.transparency_metrics.has_dates +
                      insights.transparency_metrics.has_suppliers +
                      (insights.transparency_metrics.has_departments || 0)) / 3
                  )} average completeness across ${formatNumber(totalRecords)} records.`
                : `${formatNumber(totalRecords)} records analysed.`
              }
            </p>
            <span className="source-period">May contain errors — always verify</span>
          </div>
        </div>
      </section>

      {/* ===== CTA — What to do next ===== */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>What Do You Want to Know?</h2>
          <p>
            This is your data. Search it, share it, use it to ask better questions.
          </p>
          <div className="cta-actions">
            <Link to="/spending" className="btn-primary">
              <Search size={18} />
              Search Spending
            </Link>
            {dataSources.doge_investigation && (
              <Link to="/doge" className="btn-secondary">
                <Shield size={18} />
                DOGE Audit
              </Link>
            )}
            {dataSources.meetings && (
              <Link to="/meetings" className="btn-secondary">
                <Calendar size={18} />
                Meetings
              </Link>
            )}
            {dataSources.foi && (
              <Link to="/foi" className="btn-secondary">
                <FileQuestion size={18} />
                Submit an FOI
              </Link>
            )}
            {dataSources.my_area && (
              <Link to="/my-area" className="btn-secondary">
                <Users size={18} />
                Find Your Councillors
              </Link>
            )}
            {dataSources.lgr_tracker && (
              <Link to="/lgr" className="btn-secondary">
                <GitCompareArrows size={18} />
                LGR Tracker
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

// Service scope badges — shows which services each council tier provides
const SERVICE_SCOPE = {
  district: {
    provides: ['Housing', 'Planning', 'Waste Collection', 'Leisure', 'Parking', 'Council Tax Collection'],
    doesNotProvide: ['Education', 'Social Care', 'Highways', 'Fire', 'Libraries'],
    note: 'Education, social care and highways are provided by Lancashire County Council.',
  },
  county: {
    provides: ['Education', 'Social Care', 'Highways', 'Fire', 'Libraries', 'Public Health', 'Waste Disposal'],
    doesNotProvide: ['Housing', 'Planning', 'Waste Collection', 'Leisure', 'Parking'],
    note: 'Housing, planning and waste collection are provided by the 12 district councils.',
  },
  unitary: {
    provides: ['Housing', 'Planning', 'Education', 'Social Care', 'Highways', 'Waste', 'Leisure', 'Fire'],
    doesNotProvide: [],
    note: 'Unitary authorities provide all council services.',
  },
}

function ServiceScope({ tier, councilName }) {
  const scope = SERVICE_SCOPE[tier || 'district']
  if (!scope) return null

  return (
    <div className="service-scope">
      <div className="service-scope-header">
        <Building size={16} />
        <strong>{councilName} is a {tier === 'county' ? 'county council' : tier === 'unitary' ? 'unitary authority' : 'district council'}</strong>
        <span className="scope-explainer">
          — {tier === 'county' ? 'responsible for major services across Lancashire'
             : tier === 'unitary' ? 'responsible for all council services'
             : 'responsible for local services in your area'}
        </span>
      </div>
      <div className="service-scope-badges">
        {scope.provides.map(s => (
          <span key={s} className="scope-badge scope-yes">{s}</span>
        ))}
        {scope.doesNotProvide.map(s => (
          <span key={s} className="scope-badge scope-no">{s}</span>
        ))}
      </div>
      {scope.note && <p className="service-scope-note">{scope.note}</p>}
    </div>
  )
}

export default Home
