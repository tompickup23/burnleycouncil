import { Link } from 'react-router-dom'
import { Cpu, Database, Code, Shield, Target, Zap, ExternalLink, Twitter, Mail, TrendingDown, Award, AlertTriangle } from 'lucide-react'
import './About.css'

function About() {
  return (
    <div className="about-page animate-fade-in">
      {/* Hero Section */}
      <header className="about-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Cpu size={16} />
            100% AI-Powered
          </div>
          <h1>Built by AI. <span className="highlight">Powered by Transparency.</span></h1>
          <p className="hero-tagline">
            The world's first AI-generated local government transparency tool — created entirely
            by artificial intelligence to empower citizens with unprecedented insight into public spending.
          </p>
        </div>
      </header>

      {/* Creator Section */}
      <section className="creator-section">
        <div className="creator-card">
          <div className="creator-image">
            <img src="/images/tom-pickup.jpg" alt="Tom Pickup - County Councillor" />
            <div className="creator-badge">Lead Member for Finance</div>
          </div>
          <div className="creator-content">
            <h2>Created by Tom Pickup</h2>
            <div className="creator-titles">
              <span className="title-badge primary">County Councillor for Padiham and Burnley West</span>
              <span className="title-badge">County Councillor for Clowbridge with Dunnockshaw</span>
              <span className="title-badge accent">Lead Member for Finance and Resources</span>
              <span className="title-badge highlight">Reform UK Internal DOGE Team</span>
            </div>
            <p className="creator-bio">
              Tom Pickup is pioneering a new era of political transparency in Lancashire. As part of
              the internal Department of Government Efficiency (DOGE) team, he's leveraging
              cutting-edge AI technology to build tools that hold public institutions accountable.
            </p>
            <p className="creator-bio">
              Since May 2025, Lancashire County Council has delivered <strong>the lowest council tax
              increase in 12 years</strong> — just 3.8%, a full 1.2% below the government maximum.
              This makes it the lowest increase of any upper-tier authority in England.
              The new administration has also rejected the recommended councillor pay rise (saving
              £115,000), choosing instead to freeze allowances while the council finds over £100m
              in savings.
            </p>
            <p className="creator-bio">
              DOGE scrutiny has also uncovered significant financial challenges, including a
              <strong> £332 million loss on bond investments</strong> — where bonds purchased by
              the previous administration have depreciated to just two-thirds of their original
              value, restricting access to council reserves. Additionally, questions were raised
              about councillors serving as paid directors of pension-related companies, receiving
              tens of thousands in director fees.
            </p>
            <p className="creator-bio">
              This project represents Tom's vision of what's possible when innovation meets
              public service — a demonstration that AI can be harnessed not for corporate profit,
              but for democratic empowerment. In a world where councils spend millions with limited
              scrutiny, tools like this shift power back to the people.
            </p>
            <blockquote className="creator-quote">
              "It's your money. The more people are engaged with politics and understand what's
              happening and why, the better. This tool exists to make that possible."
            </blockquote>
            <span className="quote-attribution">— Tom Pickup</span>
          </div>
        </div>
      </section>

      {/* LCC Achievements Section */}
      <section className="achievements-section">
        <h2><Award size={24} /> Delivering Results at Lancashire County Council</h2>
        <p className="section-intro">
          Since the new administration took control of Lancashire County Council in May 2025,
          a focus on efficiency and transparency has delivered tangible results for taxpayers.
        </p>

        <div className="achievements-grid">
          <div className="achievement-card highlight">
            <TrendingDown size={32} />
            <h3>Lowest Tax Rise in 12 Years</h3>
            <p>
              Council tax increase of just 3.8% — the lowest in Lancashire for over a decade
              and the lowest of any upper-tier authority in England. A full 1.2% below the
              government maximum.
            </p>
          </div>
          <div className="achievement-card">
            <Shield size={32} />
            <h3>Councillor Pay Rise Rejected</h3>
            <p>
              In a rare move, councillors voted 75-0 to freeze their own allowances, rejecting
              a recommended pay rise. This saved £115,000 that would otherwise have gone to
              politician expenses.
            </p>
          </div>
          <div className="achievement-card warning">
            <AlertTriangle size={32} />
            <h3>£332M Bond Loss Exposed</h3>
            <p>
              DOGE scrutiny uncovered that previous bond investments have lost two-thirds of
              their value — a £332 million paper loss that restricts the council's access to
              its own reserves.
            </p>
          </div>
        </div>
      </section>

      {/* The AI Story */}
      <section className="ai-section">
        <h2><Cpu size={24} /> Built Entirely by Artificial Intelligence</h2>
        <div className="ai-grid">
          <div className="ai-card feature">
            <Code size={32} />
            <h3>100% AI-Generated Code</h3>
            <p>
              Every line of code in this application was written by Claude, Anthropic's AI assistant.
              From React components to data visualisations, the entire codebase was generated through
              natural language conversation.
            </p>
          </div>
          <div className="ai-card feature">
            <Database size={32} />
            <h3>AI-Powered Data Analysis</h3>
            <p>
              The spending analysis, pattern detection, and anomaly identification were all performed
              by AI systems trained on publicly available council data. The AI identified millions
              in potential duplicate payments and suspicious spending patterns.
            </p>
          </div>
          <div className="ai-card feature">
            <Zap size={32} />
            <h3>Rapid Development</h3>
            <p>
              What would traditionally take a development team weeks or months was accomplished in
              hours through AI collaboration. This demonstrates the transformative potential of AI
              for public service applications.
            </p>
          </div>
        </div>

        <div className="tech-stack">
          <h3>Technology Stack</h3>
          <div className="tech-badges">
            <span>Claude AI (Anthropic)</span>
            <span>React</span>
            <span>Vite</span>
            <span>Recharts</span>
            <span>GitHub Pages</span>
            <span>Python (Data Processing)</span>
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="data-section">
        <h2><Database size={24} /> All Data from the Public Domain</h2>
        <p className="section-intro">
          Every piece of data on this website comes from official, publicly available sources.
          No private information, no leaked documents — just transparency data that councils are
          legally required to publish.
        </p>

        <div className="sources-grid">
          <div className="source-card">
            <h4>Spending Data</h4>
            <p>
              Payments over £500, contracts over £5,000, and purchase card transactions published
              under the Local Government Transparency Code 2015.
            </p>
            <a href="https://burnley.gov.uk/council-democracy/council-budgets-spending/payments-to-suppliers/"
               target="_blank" rel="noopener noreferrer">
              View Source <ExternalLink size={14} />
            </a>
          </div>
          <div className="source-card">
            <h4>Budget Documents</h4>
            <p>
              Annual budget books, Medium Term Financial Strategy, and Statement of Accounts
              published on the council's committee papers system.
            </p>
            <a href="https://burnley.moderngov.co.uk/"
               target="_blank" rel="noopener noreferrer">
              View Source <ExternalLink size={14} />
            </a>
          </div>
          <div className="source-card">
            <h4>Councillor Data</h4>
            <p>
              Names, wards, and party affiliations from the ModernGov committee management system —
              publicly available information about elected representatives.
            </p>
            <a href="https://burnley.moderngov.co.uk/mgMemberIndex.aspx"
               target="_blank" rel="noopener noreferrer">
              View Source <ExternalLink size={14} />
            </a>
          </div>
          <div className="source-card">
            <h4>Financial Reports</h4>
            <p>
              Treasury Management Strategy, Annual Governance Statement, and audit reports
              published as public committee papers.
            </p>
            <a href="https://burnley.moderngov.co.uk/ieListMeetings.aspx?CommitteeId=1"
               target="_blank" rel="noopener noreferrer">
              View Source <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="mission-section">
        <div className="mission-content">
          <h2><Target size={24} /> The Mission: Democratic Empowerment</h2>
          <p>
            This tool exists for one reason: to make public spending understandable to everyone.
            Councils publish data because they're legally required to, but that data is often
            buried in spreadsheets, PDFs, and committee papers that ordinary citizens never see.
          </p>
          <p>
            <strong>Burnley Council Transparency</strong> changes that. By using AI to process,
            analyse, and visualise public data, we've created something that didn't exist before —
            a citizen's guide to where your council tax actually goes.
          </p>

          <div className="mission-points">
            <div className="mission-point">
              <Shield size={20} />
              <div>
                <h4>Independent Scrutiny</h4>
                <p>Not affiliated with any council or political party's official communications</p>
              </div>
            </div>
            <div className="mission-point">
              <Database size={20} />
              <div>
                <h4>Verified Data</h4>
                <p>Every figure traceable to official council publications</p>
              </div>
            </div>
            <div className="mission-point">
              <Zap size={20} />
              <div>
                <h4>AI-Powered Analysis</h4>
                <p>Pattern detection humans might miss across millions of transactions</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="disclaimer-section">
        <h2><Shield size={24} /> Important Legal Information</h2>
        <div className="disclaimer-content">
          <p>
            <strong>THIS IS NOT AN OFFICIAL BURNLEY BOROUGH COUNCIL WEBSITE.</strong> This is an
            independent transparency tool created using artificial intelligence technology. For official
            council services, visit <a href="https://burnley.gov.uk" target="_blank" rel="noopener noreferrer">burnley.gov.uk</a>.
          </p>
          <p>
            <strong>NO POLITICAL PARTY AFFILIATION:</strong> This website is not affiliated with, endorsed by,
            or connected to any political party, including but not limited to Reform UK, Conservative,
            Labour, Liberal Democrats, or any other party. The views and analysis presented are
            independent and do not represent any political party's official position.
          </p>
          <p>
            <strong>NO LIABILITY ACCEPTED:</strong> The creators of this website accept absolutely no
            responsibility or liability for the accuracy, completeness, or reliability of any information
            presented. All data has been processed by artificial intelligence systems which can and do
            make errors. Financial figures, names, dates, and other data may contain inaccuracies.
          </p>
          <p>
            <strong>VERIFICATION REQUIRED:</strong> Users must independently verify all information
            against official sources before making any decisions or taking any actions based on
            content from this website. Do not rely on this website for financial, legal, or political
            decision-making.
          </p>
          <p>
            <strong>AI-GENERATED CONTENT:</strong> This entire website, including all code, analysis,
            and written content, was generated by artificial intelligence. AI systems can produce
            errors, hallucinations, and inaccuracies. All content should be treated as potentially
            unreliable until verified against official sources.
          </p>
          <p>
            See our full <Link to="/legal">legal disclaimer, privacy policy, and terms of use</Link>.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="contact-section">
        <h2>Get in Touch</h2>
        <p>
          Found an error? Have feedback? Want to discuss AI and transparency?
        </p>
        <div className="contact-links">
          <a href="https://twitter.com/tompickup" target="_blank" rel="noopener noreferrer" className="contact-btn">
            <Twitter size={18} />
            @tompickup
          </a>
          <a href="mailto:tom.pickup@lancashire.gov.uk" className="contact-btn">
            <Mail size={18} />
            tom.pickup@lancashire.gov.uk
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <h2>Ready to Explore?</h2>
        <p>Discover where your council tax goes and hold your representatives accountable.</p>
        <div className="cta-buttons">
          <Link to="/spending" className="btn-primary">
            Explore Spending Data
          </Link>
          <Link to="/news" className="btn-secondary">
            Read Our Findings
          </Link>
        </div>
      </section>
    </div>
  )
}

export default About
