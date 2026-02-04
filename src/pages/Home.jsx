import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, TrendingDown, AlertTriangle, Users, Building, PoundSterling, FileText } from 'lucide-react'
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

  return (
    <div className="home-page animate-fade-in">
      <header className="page-header">
        <h1>Burnley Council Transparency</h1>
        <p className="subtitle">
          Public scrutiny of spending, budgets, and governance at Burnley Borough Council
        </p>
      </header>

      {/* Key Stats */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <PoundSterling size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatCurrency(insights?.total_spend, true)}</span>
            <span className="stat-label">Total Spending Analysed</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Building size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatNumber(insights?.unique_suppliers)}</span>
            <span className="stat-label">Unique Suppliers</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <FileText size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatCurrency(latestBudget, true)}</span>
            <span className="stat-label">2025/26 Budget</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{politicsSummary?.total_councillors || 45}</span>
            <span className="stat-label">Councillors</span>
          </div>
        </div>
      </section>

      {/* Key Findings */}
      <section className="findings-section">
        <h2>Key Findings</h2>
        <div className="findings-grid">
          {/* Supplier Concentration */}
          <Link to="/spending" className="finding-card warning">
            <AlertTriangle size={20} className="finding-icon" />
            <div className="finding-content">
              <h3>Supplier Concentration</h3>
              <p>Top 20 suppliers receive {formatPercent(insights?.political_angles?.top_20_concentration)} of all spending</p>
              <span className="finding-link">View Spending Data →</span>
            </div>
          </Link>

          {/* Budget Growth */}
          <Link to="/budgets" className="finding-card info">
            <TrendingUp size={20} className="finding-icon" />
            <div className="finding-content">
              <h3>Budget Growth</h3>
              <p>{formatPercent(budgetGrowth)} increase over {budgetInsights?.efficiency_metrics?.years_covered} years</p>
              <span className="finding-link">View Budget Analysis →</span>
            </div>
          </Link>

          {/* Outsourcing */}
          {insights?.political_angles?.outsourcing_total > 0 && (
            <Link to="/spending" className="finding-card alert">
              <Building size={20} className="finding-icon" />
              <div className="finding-content">
                <h3>Outsourcing Contracts</h3>
                <p>{formatCurrency(insights.political_angles.outsourcing_total, true)} to external contractors including Liberata</p>
                <span className="finding-link">Investigate →</span>
              </div>
            </Link>
          )}

          {/* Grants */}
          {insights?.political_angles?.grants_total > 0 && (
            <Link to="/spending" className="finding-card">
              <PoundSterling size={20} className="finding-icon" />
              <div className="finding-content">
                <h3>Grants Distributed</h3>
                <p>{formatCurrency(insights.political_angles.grants_total, true)} to {insights.political_angles.grants_recipients} organisations</p>
                <span className="finding-link">View Recipients →</span>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* Political Overview */}
      <section className="politics-overview">
        <h2>Council Composition</h2>
        <div className="politics-summary card">
          <div className="coalition-info">
            <h3>Ruling Coalition</h3>
            <p className="coalition-seats">
              <strong>{politicsSummary?.coalition?.total_seats || 0}</strong> of 45 seats
            </p>
            <p className="coalition-parties text-secondary">
              Burnley Independent Group + Liberal Democrats + Green
            </p>
          </div>
          <div className="party-breakdown">
            {politicsSummary?.by_party?.slice(0, 6).map((party, i) => (
              <div key={i} className="party-row">
                <span
                  className="party-dot"
                  style={{ background: party.color }}
                />
                <span className="party-name">{party.party}</span>
                <span className="party-count">{party.count}</span>
              </div>
            ))}
          </div>
          <Link to="/politics" className="view-all-link">
            View All Councillors →
          </Link>
        </div>
      </section>

      {/* Data Sources */}
      <section className="data-sources">
        <h2>Data Sources</h2>
        <div className="sources-grid">
          <div className="source-item">
            <h4>Spending Data</h4>
            <p>Payments over £500, contracts over £5,000, and purchase cards from {insights?.years_covered?.join(', ')}</p>
          </div>
          <div className="source-item">
            <h4>Budget Books</h4>
            <p>Annual revenue budgets from 2021/22 to 2025/26</p>
          </div>
          <div className="source-item">
            <h4>Councillor Data</h4>
            <p>From Burnley Council's ModernGov system</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
