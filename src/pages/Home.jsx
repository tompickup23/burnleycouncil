import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, AlertTriangle, Users, Building, PoundSterling, FileText, Search, ChevronRight, Shield, Eye } from 'lucide-react'
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
  const budgetGrowth = budgetInsights?.efficiency_metrics?.total_budget_growth_pct || 0
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
          <strong>AI-Generated Independent Scrutiny Tool</strong> — Created using artificial intelligence
          trained on publicly available Burnley Council data. NOT affiliated with Burnley Borough Council.
          Data may contain errors — always <a href="https://burnley.gov.uk" target="_blank" rel="noopener noreferrer">verify with official sources</a>. <Link to="/legal">Legal disclaimer</Link>
        </span>
      </div>

      {/* Hero Section */}
      <header className="hero-section">
        <div className="hero-content">
          <h1>Your Money. Your Council. <span className="highlight">Your Right to Know.</span></h1>
          <p className="hero-subtitle">
            Every year, Burnley Borough Council spends millions of pounds of public money.
            This independent tool lets you explore exactly where it goes — because transparency
            is the foundation of democracy.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">{formatCurrency(totalSpend, true)}</span>
              <span className="hero-stat-label">Spending Analysed</span>
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
            <Link to="/news" className="btn-secondary">
              Latest Findings
              <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </header>

      {/* Key Findings Section */}
      <section className="findings-section">
        <h2>What We Found</h2>
        <p className="section-intro">
          Our analysis of council spending data reveals patterns that every taxpayer should know about.
        </p>

        <div className="findings-grid">
          {/* Supplier Concentration */}
          <Link to="/spending" className="finding-card warning">
            <div className="finding-header">
              <AlertTriangle size={24} className="finding-icon" />
              <span className="finding-badge">Key Finding</span>
            </div>
            <h3>Just 20 Companies Get {formatPercent(topSupplierConcentration)} of All Spending</h3>
            <p>
              Out of {formatNumber(uniqueSuppliers)} different suppliers, just 20 receive the majority of council payments.
              Is this good value for taxpayers, or should more contracts go to local businesses?
            </p>
            <span className="finding-link">See who gets your money →</span>
          </Link>

          {/* Outsourcing */}
          <Link to="/spending?category=Agency%20%26%20Contracted%20Services" className="finding-card alert">
            <div className="finding-header">
              <Building size={24} className="finding-icon" />
              <span className="finding-badge">Outsourcing</span>
            </div>
            <h3>£21 Million to One Company for Outsourced Services</h3>
            <p>
              Liberata UK Ltd receives over £21 million to run council tax, benefits, and debt collection services.
              Could these be delivered more efficiently in-house?
            </p>
            <span className="finding-link">Investigate contracts →</span>
          </Link>

          {/* Budget Growth */}
          <Link to="/budgets" className="finding-card info">
            <div className="finding-header">
              <TrendingUp size={24} className="finding-icon" />
              <span className="finding-badge">Budget</span>
            </div>
            <h3>Council Budget Up {formatPercent(budgetGrowth)} in {budgetInsights?.efficiency_metrics?.years_covered} Years</h3>
            <p>
              The net revenue budget has grown from {formatCurrency(budgetInsights?.efficiency_metrics?.earliest_budget, true)} to {formatCurrency(latestBudget, true)}.
              Are residents seeing {formatPercent(budgetGrowth)} better services?
            </p>
            <span className="finding-link">View budget analysis →</span>
          </Link>

          {/* Grants */}
          <Link to="/spending?category=Grants" className="finding-card">
            <div className="finding-header">
              <PoundSterling size={24} className="finding-icon" />
              <span className="finding-badge">Grants</span>
            </div>
            <h3>£{Math.round((insights?.political_angles?.[2]?.total_grants || 11000000) / 1_000_000)}M+ in Grants to External Organisations</h3>
            <p>
              The council distributes millions to voluntary organisations and community groups.
              Who receives these grants and what outcomes are delivered?
            </p>
            <span className="finding-link">See grant recipients →</span>
          </Link>
        </div>
      </section>

      {/* Visualizations Section */}
      <section className="charts-section">
        <h2>Follow the Money</h2>
        <p className="section-intro">
          Interactive charts help you understand where public money goes.
        </p>

        <div className="charts-grid">
          {/* Top Suppliers Chart */}
          <div className="chart-card">
            <h3>Largest Suppliers</h3>
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
            <h3>Annual Spending</h3>
            <p className="chart-description">Total payments by financial year (£ millions)</p>
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
                    formatter={(value) => [`£${value.toFixed(2)}M`, 'Total Spend']}
                  />
                  <Bar dataKey="amount" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Link to="/spending" className="chart-link">Filter by year →</Link>
          </div>
        </div>
      </section>

      {/* Who Runs the Council Section */}
      <section className="politics-section">
        <h2>Who Runs Your Council?</h2>
        <p className="section-intro">
          45 councillors make decisions about how your money is spent. Know who they are.
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
                    label={({ name, value }) => `${value}`}
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
              <h4>Council Makeup</h4>
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
        <h2>Verified Public Data</h2>
        <p className="section-intro">
          All data comes from official council publications and freedom of information disclosures.
        </p>

        <div className="sources-grid">
          <div className="source-card">
            <FileText size={24} />
            <h4>Spending Data</h4>
            <p>
              Payments over £500, contracts over £5,000, and purchase card transactions
              from {insights?.summary?.date_range?.min?.slice(0,4)} to {insights?.summary?.date_range?.max?.slice(0,4)}
            </p>
          </div>
          <div className="source-card">
            <TrendingUp size={24} />
            <h4>Budget Books</h4>
            <p>Annual revenue budget documents from 2021/22 to 2025/26</p>
          </div>
          <div className="source-card">
            <Users size={24} />
            <h4>Councillor Data</h4>
            <p>From Burnley Council's ModernGov committee management system</p>
          </div>
          <div className="source-card">
            <Eye size={24} />
            <h4>Transparency Score</h4>
            <p>{formatPercent(insights?.transparency_metrics?.overall_score / 100)} data completeness across {formatNumber(totalRecords)} records</p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Democracy Works Better When You're Watching</h2>
          <p>
            Explore the data, ask questions, hold your representatives accountable.
            This is your council, funded by your taxes, making decisions that affect your community.
          </p>
          <div className="cta-actions">
            <Link to="/spending" className="btn-primary">
              Start Exploring
            </Link>
            <Link to="/myarea" className="btn-secondary">
              Find Your Councillors
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
