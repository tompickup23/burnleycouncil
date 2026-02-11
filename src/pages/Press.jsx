import { useState } from 'react'
import { Newspaper, Download, Mail, ExternalLink, Copy, Check, BarChart3, Building2, PoundSterling, FileText, Scale, Quote, Globe, Users, Shield } from 'lucide-react'
import { useCouncilConfig } from '../context/CouncilConfig'
import './Press.css'

const PLATFORM_STATS = {
  councils: 8,
  county: 'Lancashire',
  totalSpend: '£1 billion+',
  totalTransactions: '200,000+',
  dataYears: '10+ years',
  dogeChecks: '12 automated checks',
  articles: '100+ investigations',
  freeForever: true,
}

const CITATION_EXAMPLES = [
  {
    label: 'News article',
    text: 'According to AI DOGE analysis of {council} spending data, [finding]. (Source: aidoge.co.uk)',
  },
  {
    label: 'Academic',
    text: 'AI DOGE. ({year}). {council} Council Transparency. Retrieved from https://aidoge.co.uk/lancashire/{slug}/',
  },
  {
    label: 'Social media',
    text: '{council} council spent {amount} on {item} — data from @aidoge aidoge.co.uk',
  },
]

function Press() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const [copiedIdx, setCopiedIdx] = useState(null)

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    })
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="press-page animate-fade-in">
      <header className="page-header">
        <h1><Newspaper size={28} /> Press &amp; Media Kit</h1>
        <p className="subtitle">
          Resources for journalists, researchers, and anyone covering {councilFullName} spending
        </p>
      </header>

      {/* What is AI DOGE */}
      <section className="press-section">
        <h2><Shield size={20} /> What is AI DOGE?</h2>
        <div className="press-card elevator-pitch">
          <p className="pitch-text">
            <strong>AI DOGE</strong> (Department of Government Efficiency) is an independent, open-access
            transparency platform that analyses UK local council spending data. We process raw payment
            records published by councils and apply automated forensic checks — including duplicate detection,
            split payment analysis, Benford's Law screening, and Companies House cross-referencing — to
            identify patterns that warrant public scrutiny.
          </p>
          <p className="pitch-text">
            We are <strong>not affiliated with any council, political party, or government body</strong>.
            All data comes from publicly available sources. The platform is free to use, has no paywall,
            and will remain free forever.
          </p>
        </div>
      </section>

      {/* Key stats */}
      <section className="press-section">
        <h2><BarChart3 size={20} /> Platform at a Glance</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <Building2 size={24} />
            <span className="stat-value">{PLATFORM_STATS.councils}</span>
            <span className="stat-label">{PLATFORM_STATS.county} councils</span>
          </div>
          <div className="stat-card">
            <PoundSterling size={24} />
            <span className="stat-value">{PLATFORM_STATS.totalSpend}</span>
            <span className="stat-label">spending tracked</span>
          </div>
          <div className="stat-card">
            <FileText size={24} />
            <span className="stat-value">{PLATFORM_STATS.totalTransactions}</span>
            <span className="stat-label">transactions analysed</span>
          </div>
          <div className="stat-card">
            <Shield size={24} />
            <span className="stat-value">{PLATFORM_STATS.dogeChecks}</span>
            <span className="stat-label">forensic checks per council</span>
          </div>
        </div>
      </section>

      {/* What we cover */}
      <section className="press-section">
        <h2><Globe size={20} /> Coverage</h2>
        <div className="press-card">
          <h3>Currently live ({PLATFORM_STATS.county})</h3>
          <div className="council-list">
            <div className="council-group">
              <h4>East Lancashire</h4>
              <ul>
                <li>Burnley Borough Council — 30,580 transactions, {'>'}10 years of data</li>
                <li>Hyndburn Borough Council — 29,804 transactions, 10 years</li>
                <li>Pendle Borough Council — 49,741 transactions, 5 years</li>
                <li>Rossendale Borough Council — 42,536 transactions, 5 years</li>
              </ul>
            </div>
            <div className="council-group">
              <h4>Central &amp; South Lancashire</h4>
              <ul>
                <li>Lancaster City Council — 24,593 transactions, multi-year</li>
                <li>Ribble Valley Borough Council — 3,767 transactions, multi-year</li>
                <li>Chorley Council — 885 transactions (purchase card data)</li>
                <li>South Ribble Borough Council — 16,065 transactions, multi-year</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How to cite */}
      <section className="press-section">
        <h2><Quote size={20} /> How to Cite</h2>
        <p className="section-intro">
          You are free to reference AI DOGE data and analysis in your reporting.
          We ask that you attribute the source. Here are suggested citation formats:
        </p>
        <div className="citation-cards">
          {CITATION_EXAMPLES.map((ex, i) => {
            const filled = ex.text
              .replace('{council}', councilName)
              .replace('{year}', String(currentYear))
              .replace('{slug}', (config.council_id || 'burnley') + 'council')
              .replace('{amount}', '[amount]')
              .replace('{item}', '[item]')
            return (
              <div className="citation-card" key={i}>
                <span className="citation-label">{ex.label}</span>
                <p className="citation-text">{filled}</p>
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(filled, i)}
                  aria-label={`Copy ${ex.label} citation`}
                >
                  {copiedIdx === i ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Data methodology */}
      <section className="press-section">
        <h2><Scale size={20} /> Data &amp; Methodology</h2>
        <div className="press-card">
          <h3>Where does the data come from?</h3>
          <p>
            All spending data is sourced from CSV files published by each council under the
            Local Government Transparency Code 2015. This is public information that councils
            are legally required to publish for payments over their declared threshold
            (typically {'\u00A3'}500).
          </p>

          <h3>What automated checks do we run?</h3>
          <ul className="method-list">
            <li><strong>Duplicate detection</strong> — same supplier, amount, and date combinations</li>
            <li><strong>Split payment analysis</strong> — multiple payments just below threshold on same day</li>
            <li><strong>Benford's Law</strong> — statistical distribution of leading digits for anomaly screening</li>
            <li><strong>Companies House cross-reference</strong> — verifying suppliers against the official register</li>
            <li><strong>Year-end spending spikes</strong> — detecting budget-dumping patterns in March</li>
            <li><strong>Round-number analysis</strong> — flagging suspiciously round payment amounts</li>
            <li><strong>Payment velocity</strong> — measuring supplier payment timing patterns</li>
            <li><strong>Supplier concentration</strong> — HHI index for market dominance</li>
            <li><strong>Cross-council pricing</strong> — comparing what different councils pay for similar services</li>
            <li><strong>Procurement compliance</strong> — checking against statutory procurement thresholds</li>
          </ul>

          <h3>Important caveats</h3>
          <p>
            Findings are flagged for further investigation — they are not accusations of wrongdoing.
            Statistical anomalies can have perfectly legitimate explanations. We encourage councils
            and the public to engage with the data and provide context where our automated analysis
            may lack it.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="press-section">
        <h2><Mail size={20} /> Contact</h2>
        <div className="press-card contact-card">
          <div className="contact-row">
            <Users size={20} />
            <div>
              <strong>Publisher</strong>
              <p>{config.publisher || 'Tom Pickup'}</p>
            </div>
          </div>
          <div className="contact-row">
            <Mail size={20} />
            <div>
              <strong>Press enquiries</strong>
              <p><a href="mailto:press@aidoge.co.uk">press@aidoge.co.uk</a></p>
            </div>
          </div>
          <div className="contact-row">
            <Globe size={20} />
            <div>
              <strong>Website</strong>
              <p><a href="https://aidoge.co.uk" target="_blank" rel="noopener noreferrer">aidoge.co.uk <ExternalLink size={12} /></a></p>
            </div>
          </div>
          {config.publisher_social?.map((s, i) => (
            <div className="contact-row" key={i}>
              <ExternalLink size={20} />
              <div>
                <strong>{s.platform === 'x' ? 'X (Twitter)' : s.platform}</strong>
                <p><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label} <ExternalLink size={12} /></a></p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Licence */}
      <section className="press-section">
        <h2><FileText size={20} /> Data Licence</h2>
        <div className="press-card">
          <p>
            The underlying council spending data is public sector information published under the
            Open Government Licence. Our analysis, articles, and the AI DOGE platform code are
            proprietary but our findings are freely quotable with attribution.
          </p>
          <p>
            <strong>You may:</strong> quote findings, reference statistics, link to our pages,
            embed our data in your reporting.
          </p>
          <p>
            <strong>We ask that you:</strong> attribute AI DOGE as the source, link back to the
            relevant page, and note that findings are flagged for investigation rather than
            confirmed wrongdoing.
          </p>
        </div>
      </section>
    </div>
  )
}

export default Press
