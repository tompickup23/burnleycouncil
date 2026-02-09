import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, AlertTriangle, Users, Building, PoundSterling, FileText, Search, ChevronRight, Shield, Eye, Info, Newspaper, FileQuestion, Calendar, Repeat, GitCompareArrows } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState, DataFreshness } from '../components/ui'
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

  const { data, loading, error } = useData(dataUrls)

  useEffect(() => {
    document.title = `Home | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

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

  // Unpack data based on what was requested
  let idx = 0
  const insights = data?.[idx++]
  const dogeFindings = dataSources.doge_investigation ? data?.[idx++] : null
  const politicsSummary = dataSources.politics ? data?.[idx++] : null
  const articlesIndex = dataSources.news ? data?.[idx++] : null
  const revenueTrends = dataSources.budget_trends ? data?.[idx++] : null

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

  // Party colors for pie chart
  const partyColors = {
    'Independent': '#800080',
    'Labour': '#DC241F',
    'Labour & Co-operative Party': '#DC241F',
    'Liberal Democrats': '#FAA61A',
    'Conservative': '#0087DC',
    'Green Party': '#6AB023',
    'Reform UK': '#12B6CF',
  }

  const partyData = useMemo(() => politicsSummary?.by_party?.map(p => ({
    name: p.party,
    value: p.count,
    color: partyColors[p.party] || '#808080',
  })) || [], [politicsSummary])

  // DOGE findings from data file
  const findings = dogeFindings?.findings || []
  const keyFindings = dogeFindings?.key_findings || []

  return (
    <div className="home-page animate-fade-in">
      {/* Disclaimer Banner */}
      <div className="disclaimer-banner">
        <Shield size={16} />
        <span>
          <strong>Independent Transparency Tool</strong> — NOT affiliated with {councilFullName}.
          Data may contain errors — always <a href={officialUrl} target="_blank" rel="noopener noreferrer">verify with official sources</a>. <Link to="/legal">Legal disclaimer</Link>
        </span>
      </div>

      {/* Hero Section */}
      <header className="hero-section">
        <div className="hero-content">
          <h1>Your Money. Your Council. <span className="highlight">Your Right to Know.</span></h1>
          <p className="hero-subtitle">
            {config.hero_subtitle || `Explore how ${councilFullName} spends public money. All data comes from publicly available council documents.`}
          </p>
          <DataFreshness source="Spending data" />
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">{formatCurrency(totalSpend, true)}</span>
              <span className="hero-stat-label">External Payments ({periodLabel})</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">{formatNumber(totalRecords)}</span>
              <span className="hero-stat-label">Transactions</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">{formatNumber(uniqueSuppliers)}</span>
              <span className="hero-stat-label">Suppliers</span>
            </div>
          </div>
          <div className="hero-actions">
            <Link to="/spending" className="btn-primary">
              <Search size={18} />
              Explore Spending Data
            </Link>
            {dataSources.budgets && (
              <Link to="/budgets" className="btn-secondary">
                View Budgets
                <ChevronRight size={18} />
              </Link>
            )}
          </div>
        </div>
      </header>

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

      {/* DOGE Investigation Banner — data-driven from doge_findings.json */}
      {findings.length > 0 && (
        <section className="doge-section">
          <div className="doge-header">
            <h2>DOGE Investigation</h2>
            <p className="section-intro">
              We audited every pound. Here&apos;s what we found in {formatNumber(totalRecords)} transactions.
            </p>
          </div>

          <div className="doge-findings-grid">
            {findings.slice(0, 4).map((f, i) => (
              <Link key={i} to={f.link || '/spending'} className={`doge-card ${f.severity || 'info'}`}>
                <span className="doge-value">{f.value}</span>
                <span className="doge-label">{f.label}</span>
                <span className="doge-detail">{f.detail}</span>
              </Link>
            ))}
          </div>

          <Link to="/news" className="doge-cta">
            Read the full DOGE investigation <ChevronRight size={16} />
          </Link>
        </section>
      )}

      {/* Key Findings Section — data-driven */}
      {keyFindings.length > 0 && (
        <section className="findings-section">
          <h2>Key Findings</h2>
          <p className="section-intro">
            Patterns in the spending data worth knowing about.
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

      {/* Supplier Concentration — always available from insights */}
      <section className="findings-section">
        <h2>Supplier Analysis</h2>
        <p className="section-intro">
          {formatNumber(uniqueSuppliers)} suppliers received payments. Here&apos;s where the money goes.
        </p>

        <div className="findings-grid">
          <Link to="/suppliers" className="finding-card warning">
            <div className="finding-header">
              <AlertTriangle size={24} className="finding-icon" />
              <span className="finding-badge">Concentration</span>
            </div>
            <h3>20 Suppliers Receive {formatPercent(topSupplierConcentration * 100)} of Payments</h3>
            <p>
              Out of {formatNumber(uniqueSuppliers)} suppliers, just 20 receive the majority of all
              external payments. This concentration is common in councils but worth scrutinising.
            </p>
            <span className="finding-link">See all suppliers &rarr;</span>
          </Link>
        </div>
      </section>

      {/* Visualizations Section */}
      <section className="charts-section">
        <h2>Follow the Money</h2>
        <p className="section-intro">
          External payments to suppliers by year and by recipient.
        </p>

        <div className="charts-grid">
          {/* Top Suppliers Chart */}
          <div className="chart-card">
            <h3>Largest Suppliers ({periodLabel})</h3>
            <p className="chart-description">Top 8 suppliers by total payments received (millions)</p>
            <div className="chart-container">
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
            <Link to="/suppliers" className="chart-link">Explore all suppliers &rarr;</Link>
          </div>

          {/* Spending by Year */}
          {spendByYearChart.length > 0 && (
            <div className="chart-card">
              <h3>Annual External Payments</h3>
              <p className="chart-description">Total payments to suppliers by financial year (millions)</p>
              <div className="chart-container">
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

      {/* Who Runs the Council Section — only if politics data exists */}
      {politicsSummary && partyData.length > 0 && (
        <section className="politics-section">
          <h2>Who Runs Your Council?</h2>
          <p className="section-intro">
            {politicsSummary.total_councillors || ''} councillors make decisions about how your money is spent.
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

      {/* Data Sources */}
      <section className="sources-section">
        <h2>About the Data</h2>
        <p className="section-intro">
          All information comes from publicly available council documents.
        </p>

        <div className="sources-grid">
          <div className="source-card">
            <FileText size={24} />
            <h4>Spending Data</h4>
            <p>
              Payments over {formatCurrency(spendingThreshold)}, contracts over {formatCurrency(5000)}, and purchase card transactions.
              Published under the Transparency Code.
            </p>
            <span className="source-period">{spendingPeriod}</span>
          </div>
          {dataSources.politics && (
            <div className="source-card">
              <Users size={24} />
              <h4>Councillor Data</h4>
              <p>Names, wards, and party affiliations from the committee system.</p>
              <span className="source-period">Current members</span>
            </div>
          )}
          <div className="source-card">
            <Eye size={24} />
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
            <span className="source-period">May contain errors</span>
          </div>
        </div>
      </section>

      {/* Latest News Preview — only if news data exists */}
      {articlesIndex && articlesIndex.length > 0 && (
        <section className="news-preview-section">
          <h2><Newspaper size={24} /> Latest News &amp; Findings</h2>
          <p className="section-intro">
            Investigations, analysis, and democracy coverage for {councilName} Council.
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
            View all findings <ChevronRight size={16} />
          </Link>
        </section>
      )}

      {/* Upcoming Meetings — only if meetings data source is enabled */}
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
              <p>Every resident can ask questions at Full Council. Use our DOGE findings to challenge decisions.</p>
              <span className="read-more">View meetings calendar <ChevronRight size={14} /></span>
            </Link>
            <Link to="/meetings" className="meetings-preview-card">
              <span className="meeting-preview-label">Scrutiny</span>
              <h4>Hold the Cabinet to Account</h4>
              <p>Scrutiny reviews Executive decisions and can investigate concerns.</p>
              <span className="read-more">See upcoming scrutiny <ChevronRight size={14} /></span>
            </Link>
          </div>
        </section>
      )}

      {/* Call to Action */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Explore the Data</h2>
          <p>
            Search suppliers, view contracts, understand where your council tax goes.
          </p>
          <div className="cta-actions">
            <Link to="/spending" className="btn-primary">
              Search Spending
            </Link>
            <Link to="/suppliers" className="btn-secondary">
              <Building size={18} />
              All Suppliers
            </Link>
            {dataSources.meetings && (
              <Link to="/meetings" className="btn-secondary">
                <Calendar size={18} />
                Meetings Calendar
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
                Find Your Councillors
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
