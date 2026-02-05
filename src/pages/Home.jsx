import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, AlertTriangle, Users, Building, PoundSterling, FileText, Search, ChevronRight, Shield, Eye, Info } from 'lucide-react'
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
          (invoices over £500, contracts over £5,000, purchase cards). This is different from the council's
          Net Revenue Budget of {formatCurrency(latestBudget, true)}, which is the day-to-day running cost funded by council tax.
          <Link to="/budgets"> Learn more →</Link>
        </div>
      </div>

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
            <h3>20 Suppliers Receive {formatPercent(topSupplierConcentration)} of Payments</h3>
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
            <h3>£34M Outsourcing Contract Over 10 Years</h3>
            <p>
              Liberata UK Ltd has a 10-year contract (2016-2026) worth £34M to run council tax, benefits,
              IT, and customer services. This saves the council an estimated £8M vs in-house delivery.
            </p>
            <span className="finding-link">View contract payments →</span>
          </Link>

          {/* Budget */}
          <Link to="/budgets" className="finding-card info">
            <div className="finding-header">
              <TrendingUp size={24} className="finding-icon" />
              <span className="finding-badge">Budget</span>
            </div>
            <h3>Net Budget: {formatCurrency(latestBudget, true)} (2025/26)</h3>
            <p>
              The council's day-to-day running costs, funded mainly by council tax (44%) and business rates.
              This is a plan — actual spending may differ.
            </p>
            <span className="finding-link">View budget breakdown →</span>
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
            <p>Annual budget books showing planned income and expenditure by service.</p>
            <span className="source-period">2021/22 – 2025/26</span>
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
            <p>{formatPercent(insights?.transparency_metrics?.overall_score / 100)} completeness across {formatNumber(totalRecords)} records.</p>
            <span className="source-period">May contain errors</span>
          </div>
        </div>
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
