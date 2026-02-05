import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, AlertTriangle, Users, Building, PoundSterling, FileText, Search, ChevronRight, Shield, Eye, Info, Newspaper, FileQuestion } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { formatCurrency, formatNumber, formatPercent } from '../utils/format'
import './Home.css'

function Home() {
  const [insights, setInsights] = useState(null)
  const [budgetInsights, setBudgetInsights] = useState(null)
  const [politicsSummary, setPoliticsSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/data/insights.json').then(r => r.json()),
      fetch('/data/budget_insights.json').then(r => r.json()),
      fetch('/data/politics_summary.json').then(r => r.json()),
    ])
      .then(([insightsData, budgetData, politicsData]) => {
        setInsights(insightsData)
        setBudgetInsights(budgetData)
        setPoliticsSummary(politicsData)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load data:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  const latestBudget = budgetInsights?.efficiency_metrics?.latest_budget || 0
  const totalSpend = insights?.summary?.total_transaction_spend || 0
  const totalRecords = insights?.transparency_metrics?.total_records || 0
  const uniqueSuppliers = insights?.summary?.unique_suppliers || 0
  const topSupplierConcentration = insights?.supplier_analysis?.concentration_ratio || 0

  // Prepare chart data for top suppliers
  const topSuppliersChart = insights?.supplier_analysis?.top_20_suppliers?.slice(0, 8).map(s => ({
    name: s.supplier.split(' ').slice(0, 2).join(' '),
    fullName: s.supplier,
    amount: s.total / 1_000_000,
  })) || []

  // Prepare spending by year chart data
  const spendByYearChart = Object.entries(insights?.yoy_analysis?.spend_by_year || {}).map(([year, amount]) => ({
    year: year.replace('/', '/'),
    amount: amount / 1_000_000,
  }))

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

  const partyData = politicsSummary?.by_party?.map(p => ({
    name: p.party,
    value: p.count,
    color: partyColors[p.party] || '#808080',
  })) || []

  return (
    <div className="home-page animate-fade-in">
      {/* Disclaimer Banner */}
      <div className="disclaimer-banner">
        <Shield size={16} />
        <span>
          <strong>Independent Transparency Tool</strong> — NOT affiliated with Burnley Borough Council.
          Data may contain errors — always <a href="https://burnley.gov.uk" target="_blank" rel="noopener noreferrer">verify with official sources</a>. <Link to="/legal">Legal disclaimer</Link>
        </span>
      </div>

      {/* Hero Section */}
      <header className="hero-section">
        <div className="hero-content">
          <h1>Your Money. Your Council. <span className="highlight">Your Right to Know.</span></h1>
          <p className="hero-subtitle">
            Explore how Burnley Borough Council spends public money.
            All data comes from publicly available council documents.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">{formatCurrency(totalSpend, true)}</span>
              <span className="hero-stat-label">External Payments (2021-25)</span>
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
            <Link to="/budgets" className="btn-secondary">
              View Budgets
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </header>

      {/* Data Context Banner */}
      <div className="context-banner">
        <Info size={18} />
        <div>
          <strong>Understanding the numbers:</strong> The spending data shows external payments to suppliers
          (invoices over £500, contracts over £5,000, purchase cards) — covering <em>both</em> revenue spending
          (day-to-day running costs) and capital spending (one-off investments like construction projects).
          The council's <strong>Net Revenue Budget</strong> is {formatCurrency(latestBudget, true)} (2025/26), funded
          by council tax and business rates. The <strong>Capital Programme</strong> is separate — a 5-year, £42.5M
          investment plan funded by borrowing and government grants.
          <Link to="/budgets"> See full budget breakdown →</Link>
        </div>
      </div>

      {/* DOGE Investigation Banner */}
      <section className="doge-section">
        <div className="doge-header">
          <h2>🔍 DOGE Investigation</h2>
          <p className="section-intro">
            We audited every pound. Here's what we found in {formatNumber(totalRecords)} transactions.
          </p>
        </div>

        <div className="doge-findings-grid">
          <Link to="/news" className="doge-card critical">
            <span className="doge-value">£2.48M</span>
            <span className="doge-label">Exact Duplicate Payments</span>
            <span className="doge-detail">1,284 records in 503 duplicate groups found in council's own published data</span>
          </Link>

          <Link to="/news" className="doge-card critical">
            <span className="doge-value">£10.5M</span>
            <span className="doge-label">No Contract on File</span>
            <span className="doge-detail">9 top-100 suppliers — including £4.4M to one law firm — with no published contract</span>
          </Link>

          <Link to="/news" className="doge-card warning">
            <span className="doge-value">£19.8M</span>
            <span className="doge-label">Single Capital Payment to Geldards</span>
            <span className="doge-detail">One capital programme payment exceeding the entire annual revenue budget — for the Pioneer Place development</span>
          </Link>

          <Link to="/news" className="doge-card warning">
            <span className="doge-value">£596K</span>
            <span className="doge-label">Purchase Card Spending</span>
            <span className="doge-detail">6,831 transactions including Netflix, Domino's, ChatGPT, and £2.5K at Aldi</span>
          </Link>
        </div>

        <Link to="/news" className="doge-cta">
          Read the full DOGE investigation <ChevronRight size={16} />
        </Link>
      </section>

      {/* Key Findings Section */}
      <section className="findings-section">
        <h2>Key Findings</h2>
        <p className="section-intro">
          Patterns in the spending data worth knowing about.
        </p>

        <div className="findings-grid">
          {/* Supplier Concentration */}
          <Link to="/spending" className="finding-card warning">
            <div className="finding-header">
              <AlertTriangle size={24} className="finding-icon" />
              <span className="finding-badge">Concentration</span>
            </div>
            <h3>20 Suppliers Receive {formatPercent(topSupplierConcentration * 100)} of Payments</h3>
            <p>
              Out of {formatNumber(uniqueSuppliers)} suppliers, just 20 (less than 0.5%) receive over 61% of all
              external payments. This concentration is common in councils but worth scrutinising.
            </p>
            <span className="finding-link">See top suppliers →</span>
          </Link>

          {/* Outsourcing */}
          <Link to="/spending?supplier=LIBERATA" className="finding-card alert">
            <div className="finding-header">
              <Building size={24} className="finding-icon" />
              <span className="finding-badge">Outsourcing</span>
            </div>
            <h3>£34M Outsourcing Contract — Now Coming Back In-House</h3>
            <p>
              Liberata UK Ltd has a 10-year contract (2016-2026) worth £34M. 40% of affected staff lost their jobs.
              The council is now bringing services back in-house — was it worth it?
            </p>
            <span className="finding-link">Read the investigation →</span>
          </Link>

          {/* Budget */}
          <Link to="/budgets" className="finding-card info">
            <div className="finding-header">
              <TrendingUp size={24} className="finding-icon" />
              <span className="finding-badge">Revenue Budget</span>
            </div>
            <h3>Net Revenue Budget: {formatCurrency(latestBudget, true)} (2025/26)</h3>
            <p>
              The council's day-to-day running costs, funded mainly by council tax (44%) and business rates.
              Earmarked reserves slashed from £1.33M to just £2,250 — plus a £42.5M capital investment programme.
            </p>
            <span className="finding-link">View full budget breakdown →</span>
          </Link>

          {/* Disabled Facilities Grants */}
          <Link to="/spending?category=Grants" className="finding-card">
            <div className="finding-header">
              <PoundSterling size={24} className="finding-icon" />
              <span className="finding-badge">Grants</span>
            </div>
            <h3>£11M+ in Disabled Facilities Grants</h3>
            <p>
              Most "grant" payments go to construction contractors (Stannah, N I Constructions) for
              home adaptations for disabled residents — funded by government, administered by the council.
            </p>
            <span className="finding-link">See grant payments →</span>
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
            <h3>Largest Suppliers (2021-25)</h3>
            <p className="chart-description">Top 8 suppliers by total payments received (£ millions)</p>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topSuppliersChart} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => `£${v}M`}
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
                    formatter={(value, name, props) => [`£${value.toFixed(2)}M`, props.payload.fullName]}
                  />
                  <Bar dataKey="amount" fill="var(--accent-orange)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Link to="/spending" className="chart-link">Explore all suppliers →</Link>
          </div>

          {/* Spending by Year */}
          <div className="chart-card">
            <h3>Annual External Payments</h3>
            <p className="chart-description">Total payments to suppliers by financial year (£ millions)</p>
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
                    tickFormatter={(v) => `£${v}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                    }}
                    formatter={(value) => [`£${value.toFixed(2)}M`, 'External Payments']}
                  />
                  <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-note">Note: 2025/26 is partial year. 2021/22 includes COVID grants.</p>
          </div>
        </div>
      </section>

      {/* Who Runs the Council Section */}
      <section className="politics-section">
        <h2>Who Runs Your Council?</h2>
        <p className="section-intro">
          45 councillors make decisions about how your money is spent.
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
              {politicsSummary?.by_party?.map((party, i) => (
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

          <div className="coalition-info">
            <div className="coalition-card ruling">
              <h4>Ruling Coalition</h4>
              <div className="coalition-seats">
                <span className="seat-count">{politicsSummary?.coalition?.total_seats || 0}</span>
                <span className="seat-label">of 45 seats</span>
              </div>
              <p className="coalition-parties">
                Burnley Independent Group + Liberal Democrats + Green Party
              </p>
              <p className="coalition-note">Majority threshold: 23 seats</p>
            </div>

            <Link to="/politics" className="view-councillors-btn">
              <Users size={18} />
              View All Councillors
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </section>

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
              Payments over £500, contracts over £5,000, and purchase card transactions.
              Published under the Transparency Code.
            </p>
            <span className="source-period">April 2021 – present</span>
          </div>
          <div className="source-card">
            <TrendingUp size={24} />
            <h4>Budget Information</h4>
            <p>Annual budget books covering revenue budgets, capital programme, treasury management and investment strategy.</p>
            <span className="source-period">2020/21 – 2025/26</span>
          </div>
          <div className="source-card">
            <Users size={24} />
            <h4>Councillor Data</h4>
            <p>Names, wards, and party affiliations from the committee system.</p>
            <span className="source-period">Current members</span>
          </div>
          <div className="source-card">
            <Eye size={24} />
            <h4>Data Quality</h4>
            <p>{formatPercent(insights?.transparency_metrics?.overall_score)} completeness across {formatNumber(totalRecords)} records.</p>
            <span className="source-period">May contain errors</span>
          </div>
        </div>
      </section>

      {/* Latest News Preview */}
      <section className="news-preview-section">
        <h2><Newspaper size={24} /> Latest Findings</h2>
        <p className="section-intro">
          Analysis and investigations based on council spending data.
        </p>

        <div className="news-preview-grid">
          <Link to="/news" className="news-preview-card featured">
            <span className="category-badge investigation">DOGE Investigation</span>
            <h4>£2.5M Duplicates, £10.5M Without Contracts, Netflix on the Council Card</h4>
            <p>Our comprehensive audit of 19,865 records uncovered duplicate payments, missing contracts, and questionable purchase card spending.</p>
            <span className="read-more">Read the full investigation <ChevronRight size={14} /></span>
          </Link>
          <Link to="/news" className="news-preview-card">
            <span className="category-badge investigation">Investigation</span>
            <h4>One Law Firm, One Day, £19.8 Million</h4>
            <p>A single capital programme payment to Geldards for the Pioneer Place development exceeds the council's entire annual revenue budget.</p>
            <span className="read-more">Read more <ChevronRight size={14} /></span>
          </Link>
          <Link to="/news" className="news-preview-card">
            <span className="category-badge investigation">Investigation</span>
            <h4>ChatGPT, Aldi, and Domino's: What's on the Council Cards?</h4>
            <p>£1,397 on ChatGPT, £2,498 at Aldi on the Chief Exec's card, and food delivery orders — all on the taxpayer.</p>
            <span className="read-more">Read more <ChevronRight size={14} /></span>
          </Link>
        </div>

        <Link to="/news" className="view-all-link">
          View all findings <ChevronRight size={16} />
        </Link>
      </section>

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
            <Link to="/foi" className="btn-secondary">
              <FileQuestion size={18} />
              Submit an FOI
            </Link>
            <Link to="/my-area" className="btn-secondary">
              Find Your Councillors
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
