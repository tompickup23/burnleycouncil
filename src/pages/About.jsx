import { Link } from 'react-router-dom'
import { Database, Shield, ExternalLink, Mail } from 'lucide-react'
import { useCouncilConfig } from '../context/CouncilConfig'
import './About.css'

function About() {
  const config = useCouncilConfig()
  const councilFullName = config.council_full_name || 'Borough Council'
  const officialUrl = config.official_website || '#'
  const officialDomain = officialUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const spendingThreshold = config.spending_threshold || 500
  const dataPeriod = config.spending_data_period || 'April 2021 to present'

  return (
    <div className="about-page animate-fade-in">
      {/* Hero Section */}
      <header className="about-hero">
        <div className="hero-content">
          <h1>About This Tool</h1>
          <p className="hero-tagline">
            Making public spending data accessible and searchable.
          </p>
        </div>
      </header>

      {/* What This Is Section */}
      <section className="intro-section">
        <div className="intro-content">
          <p>
            Every year, {councilFullName} spends tens of millions of pounds of public money.
            By law, they publish details of this spending — but it's buried in spreadsheets and
            PDFs that most people never see.
          </p>
          <p>
            This tool makes that data searchable. You can explore payments to suppliers,
            see who receives the most public money, and understand where your council tax goes.
          </p>
          <p>
            {config.publisher_bio || `This website was created by ${config.publisher || 'Tom Pickup'}, County Councillor for Padiham & Burnley West and Clowbridge with Dunnockshaw. Formerly part of the Reform UK internal DOGE team and former Lead Member for Finance & Resources at Lancashire County Council, Tom has helped deliver £5 of efficiency savings for every £100 spent since May 2025, the lowest council tax rise in 12 years and the lowest of any upper-tier authority in England.`}
          </p>
          <p className="highlight-text">
            Nothing more, nothing less. Just public data, made accessible.
          </p>
        </div>
      </section>

      {/* Creator Section */}
      <section className="creator-section">
        <div className="creator-card">
          <div className="creator-image">
            <img src="/images/tom-pickup.jpg" alt="Tom Pickup" />
          </div>
          <div className="creator-content">
            <h2>Created by Tom Pickup</h2>
            <div className="creator-titles">
              {(config.publisher_titles || ['County Councillor for Padiham & Burnley West', 'County Councillor for Clowbridge with Dunnockshaw']).map((title, i) => (
                <span key={i} className="title-badge">{title}</span>
              ))}
            </div>
            <blockquote className="creator-quote">
              "It's your money. The more people understand where it goes, the better."
            </blockquote>

            <div className="social-links">
              <a href="https://x.com/tompickup" target="_blank" rel="noopener noreferrer" className="social-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                @tompickup
              </a>
              <a href="https://facebook.com/tompickupburnley" target="_blank" rel="noopener noreferrer" className="social-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Facebook
              </a>
              <a href="https://instagram.com/tompickupburnley" target="_blank" rel="noopener noreferrer" className="social-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                Instagram
              </a>
              <a href="https://tiktok.com/@tompickupburnley" target="_blank" rel="noopener noreferrer" className="social-btn">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                TikTok
              </a>
              <a href="mailto:tom.pickup@lancashire.gov.uk" className="social-btn">
                <Mail size={18} />
                Email
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="data-section">
        <h2><Database size={24} /> Where the Data Comes From</h2>
        <p className="section-intro">
          Everything on this site comes from publicly available council documents.
        </p>

        <div className="data-grid">
          <div className="data-card">
            <h4>Spending Data</h4>
            <p>
              Payments over £{spendingThreshold.toLocaleString()}, contracts over £5,000, and purchase card transactions.
              Published quarterly under the Local Government Transparency Code.
            </p>
            <span className="data-note">Covers {dataPeriod}</span>
          </div>
          <div className="data-card">
            <h4>Budget Information</h4>
            <p>
              Annual budget books showing planned spending and income.
              These are the council's financial plans for each year.
            </p>
            <span className="data-note">Budget years 2021/22 to 2025/26</span>
          </div>
          <div className="data-card">
            <h4>Councillor Details</h4>
            <p>
              Names, wards, and party affiliations from the council's
              committee management system.
            </p>
            <span className="data-note">Current elected members</span>
          </div>
        </div>

        <div className="data-warning">
          <strong>Important:</strong> This data may be out of date. Council data is published
          quarterly and there can be delays. Always check official sources for the latest information.
        </div>
      </section>

      {/* Disclaimer */}
      <section className="disclaimer-section">
        <h2><Shield size={24} /> Important Information</h2>
        <div className="disclaimer-content">
          <div className="disclaimer-item critical">
            <h4>This is NOT an official council website</h4>
            <p>
              This is an independent tool. For official services, visit{' '}
              <a href={officialUrl} target="_blank" rel="noopener noreferrer">
                {officialDomain} <ExternalLink size={12} />
              </a>
            </p>
          </div>

          <div className="disclaimer-item">
            <h4>No political party affiliation</h4>
            <p>
              This website has no connection to any political party. The data and analysis
              are independent.
            </p>
          </div>

          <div className="disclaimer-item">
            <h4>Data may contain errors</h4>
            <p>
              Information has been processed automatically and may contain mistakes.
              Always verify important figures against official sources.
            </p>
          </div>

          <div className="disclaimer-item">
            <h4>No liability accepted</h4>
            <p>
              No responsibility is accepted for the accuracy of any information on this site.
              Do not make financial or legal decisions based solely on this data.
            </p>
          </div>
        </div>

        <p className="legal-link">
          See our full <Link to="/legal">legal disclaimer, privacy policy, and terms of use</Link>.
        </p>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2>Start Exploring</h2>
        <p>See where your council tax goes.</p>
        <div className="cta-buttons">
          <Link to="/spending" className="btn-primary">
            View Spending Data
          </Link>
          <Link to="/budgets" className="btn-secondary">
            View Budgets
          </Link>
        </div>
      </section>
    </div>
  )
}

export default About
