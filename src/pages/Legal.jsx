import { useState } from 'react'
import { Shield, FileText, Cookie, Eye, Scale, Mail } from 'lucide-react'
import { useCouncilConfig } from '../context/CouncilConfig'
import './Legal.css'

function Legal() {
  const config = useCouncilConfig()
  const councilFullName = config.council_full_name || 'Borough Council'
  const officialUrl = config.official_website || '#'
  const officialDomain = officialUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const [activeTab, setActiveTab] = useState('disclaimer')

  const tabs = [
    { id: 'disclaimer', label: 'Disclaimer', icon: Shield },
    { id: 'privacy', label: 'Privacy Policy', icon: Eye },
    { id: 'cookies', label: 'Cookies', icon: Cookie },
    { id: 'terms', label: 'Terms of Use', icon: FileText },
    { id: 'accessibility', label: 'Accessibility', icon: Scale },
  ]

  return (
    <div className="legal-page animate-fade-in">
      <header className="page-header">
        <h1>Legal Information</h1>
        <p className="subtitle">
          Important information about this website, your data, and how to use this tool responsibly
        </p>
      </header>

      <div className="legal-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`legal-tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      <div className="legal-content">
        {activeTab === 'disclaimer' && (
          <div className="legal-section">
            <h2><Shield size={24} /> Important Disclaimer</h2>

            <div className="warning-box">
              <h3>⚠️ Independent Website — Not Official</h3>
              <p>
                <strong>This website is an independent transparency tool.</strong> It presents
                publicly available data about {councilFullName} in an accessible format.
                Data has been processed automatically and may contain errors.
              </p>
            </div>

            <h3>Digital Imprint (Elections Act 2022)</h3>
            <p>
              Published by Tom Pickup.<br />
              Contact: tom.pickup@lancashire.gov.uk<br />
              Address: c/o Lancashire County Council, County Hall, Preston PR1 8XJ
            </p>

            <h3>Not an Official Council Website</h3>
            <p>
              This website is <strong>NOT</strong> the official {councilFullName} website and is
              <strong>NOT</strong> affiliated with, endorsed by, or connected to {councilFullName}
              in any way. For official council services, please visit{' '}
              <a href={officialUrl} target="_blank" rel="noopener noreferrer">{officialDomain}</a>.
            </p>

            <h3>No Political Party Affiliation</h3>
            <p>
              This website has <strong>no connection to any political party</strong>. While the
              creator is an elected councillor, this website operates independently and does not
              represent the views of any political party, council, or organisation.
            </p>

            <h3>Data Accuracy and Errors</h3>
            <p>
              While every effort has been made to ensure the accuracy of the data presented, this
              website may contain errors, omissions, or inaccuracies. Data has been processed
              automatically and may contain mistakes. Specific limitations include:
            </p>
            <ul>
              <li>Data may be out of date or superseded by more recent information</li>
              <li>Automated processing of documents may contain extraction errors</li>
              <li>Categorisation and analysis may not reflect official council classifications</li>
              <li>Councillor information may change following elections or resignations</li>
              <li>Budget figures are plans; actual spending may differ</li>
            </ul>

            <h3>Fair Comment and Public Interest</h3>
            <p>
              All analysis and commentary on this website is presented as honest opinion based on
              publicly available data, published in the public interest to promote transparency and
              democratic accountability. Where questions are raised about spending patterns, these
              are presented as questions worthy of scrutiny, not as allegations of wrongdoing.
              There may be legitimate explanations for any patterns identified.
            </p>

            <h3>No Liability Accepted</h3>
            <p>
              The creators of this website accept <strong>no liability whatsoever</strong> for any
              loss, damage, or inconvenience arising from the use of this website or reliance on
              any information contained herein. This includes, but is not limited to:
            </p>
            <ul>
              <li>Financial decisions made based on spending or budget data</li>
              <li>Actions taken based on councillor or political information</li>
              <li>Any errors in data analysis or visualisation</li>
              <li>Reputational impact arising from content on this site</li>
            </ul>

            <h3>Always Verify Information</h3>
            <p>
              Users are strongly advised to <strong>always verify any information</strong> found on
              this website against official sources before acting upon it. Official sources include:
            </p>
            <ul>
              <li><a href={officialUrl} target="_blank" rel="noopener noreferrer">{councilFullName} official website</a></li>
              {config.moderngov_url && <li><a href={config.moderngov_url} target="_blank" rel="noopener noreferrer">Council committee papers (ModernGov)</a></li>}
              <li>Freedom of Information requests to the council</li>
              <li>Published Statement of Accounts and Budget Books</li>
            </ul>

            <h3>Purpose of This Tool</h3>
            <p>
              This website is intended as a <strong>public transparency and accountability tool</strong> to
              help residents understand how their council spends public money. It is provided as a
              public service to promote democratic engagement and is not intended for commercial use.
            </p>

            <h3>Contact</h3>
            <p>
              If you believe any information on this website is incorrect or if you have concerns,
              please contact us so we can investigate and correct any errors.
            </p>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="legal-section">
            <h2><Eye size={24} /> Privacy Policy</h2>
            <p><em>Last updated: 5 February 2025</em></p>

            <h3>Introduction</h3>
            <p>
              This Privacy Policy explains how we collect, use, and protect your personal data when
              you visit this website. We are committed to protecting your privacy and complying with
              the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.
            </p>

            <h3>Data Controller</h3>
            <p>
              This website is operated as an independent public transparency project. For data
              protection enquiries, please use the contact information provided on this page.
            </p>

            <h3>What Data We Collect</h3>
            <p>We collect minimal data to operate this website:</p>
            <ul>
              <li><strong>Technical data:</strong> IP addresses, browser type, and device information
              (collected automatically through server logs)</li>
              <li><strong>Usage data:</strong> Pages visited and navigation patterns are collected
              via Cloudflare Web Analytics — a privacy-first, cookieless service that does not
              track individual users or collect personal data</li>
              <li><strong>No personal data:</strong> We do not collect names, email addresses, or
              other personally identifiable information unless you contact us directly</li>
            </ul>

            <h3>How We Use Your Data</h3>
            <p>We use collected data solely for:</p>
            <ul>
              <li>Operating and maintaining the website</li>
              <li>Understanding how visitors use the site to improve functionality</li>
              <li>Protecting against security threats</li>
            </ul>

            <h3>Legal Basis for Processing</h3>
            <p>
              Our legal basis for processing any personal data is <strong>legitimate interests</strong>
              in operating a public transparency tool and ensuring website security.
            </p>

            <h3>Data Sharing</h3>
            <p>
              We do not sell, trade, or share your personal data with third parties, except:
            </p>
            <ul>
              <li>With hosting providers who process data on our behalf</li>
              <li>Where required by law or to protect our legal rights</li>
            </ul>

            <h3>Data Retention</h3>
            <p>
              Server logs are retained for a maximum of 30 days. We do not retain any personal
              data beyond what is necessary for website operation.
            </p>

            <h3>Your Rights</h3>
            <p>Under UK GDPR, you have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Lodge a complaint with the Information Commissioner's Office (ICO)</li>
            </ul>

            <h3>Contact the ICO</h3>
            <p>
              If you have concerns about how we handle your data, you can contact the
              Information Commissioner's Office at{' '}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>
            </p>
          </div>
        )}

        {activeTab === 'cookies' && (
          <div className="legal-section">
            <h2><Cookie size={24} /> Cookie Policy</h2>
            <p><em>Last updated: 5 February 2025</em></p>

            <h3>What Are Cookies?</h3>
            <p>
              Cookies are small text files stored on your device when you visit a website. They
              help websites function properly and provide information to site owners.
            </p>

            <h3>Cookies We Use</h3>
            <p>This website uses minimal cookies:</p>

            <div className="cookie-table">
              <table role="table" aria-label="Cookie information">
                <thead>
                  <tr>
                    <th scope="col">Cookie Type</th>
                    <th scope="col">Purpose</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Essential</td>
                    <td>Required for basic website functionality</td>
                    <td>Session</td>
                  </tr>
                  <tr>
                    <td>Preferences</td>
                    <td>Remember your settings (e.g., dark mode)</td>
                    <td>1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3>Third-Party Cookies</h3>
            <p>
              This website is hosted on GitHub Pages. GitHub may set cookies for their own
              purposes. Please refer to{' '}
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
                 target="_blank" rel="noopener noreferrer">
                GitHub's Privacy Statement
              </a>{' '}
              for more information.
            </p>

            <h3>Managing Cookies</h3>
            <p>
              You can control and delete cookies through your browser settings. However,
              disabling cookies may affect website functionality. For instructions on managing
              cookies, visit your browser's help pages.
            </p>

            <h3>No Tracking or Advertising Cookies</h3>
            <p>
              We do <strong>not</strong> use tracking cookies, advertising cookies, or any
              cookies that track you across other websites.
            </p>
          </div>
        )}

        {activeTab === 'terms' && (
          <div className="legal-section">
            <h2><FileText size={24} /> Terms of Use</h2>
            <p><em>Last updated: 5 February 2025</em></p>

            <h3>Acceptance of Terms</h3>
            <p>
              By accessing and using this website, you accept and agree to be bound by these
              Terms of Use. If you do not agree, please do not use this website.
            </p>

            <h3>Permitted Use</h3>
            <p>You may use this website to:</p>
            <ul>
              <li>View and explore public spending data for personal, educational, or journalistic purposes</li>
              <li>Share links to pages on this website</li>
              <li>Reference data with appropriate attribution</li>
            </ul>

            <h3>Prohibited Use</h3>
            <p>You must not:</p>
            <ul>
              <li>Use the website for any unlawful purpose</li>
              <li>Attempt to gain unauthorised access to any part of the website</li>
              <li>Use automated tools to scrape data without permission</li>
              <li>Present information from this site as official council data</li>
              <li>Use the website to defame, harass, or harm any person</li>
            </ul>

            <h3>Intellectual Property</h3>
            <p>
              The design, layout, and original content of this website are protected by
              copyright. The underlying spending data is public information published by
              {councilFullName} under the Local Government Transparency Code.
            </p>

            <h3>Attribution</h3>
            <p>
              If you use data or analysis from this website, please attribute it as:
              "Source: {config.council_name} Council Transparency (aidoge.co.uk) - independent analysis
              of publicly available council data."
            </p>

            <h3>Links to Other Websites</h3>
            <p>
              This website contains links to external websites. We are not responsible for
              the content, privacy practices, or accuracy of external sites.
            </p>

            <h3>Modifications</h3>
            <p>
              We reserve the right to modify these Terms of Use at any time. Continued use
              of the website after changes constitutes acceptance of the new terms.
            </p>

            <h3>Governing Law</h3>
            <p>
              These terms are governed by the laws of England and Wales. Any disputes will
              be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </div>
        )}

        {activeTab === 'accessibility' && (
          <div className="legal-section">
            <h2><Scale size={24} /> Accessibility Statement</h2>
            <p><em>Last updated: 5 February 2025</em></p>

            <h3>Our Commitment</h3>
            <p>
              We are committed to making this website accessible to as many people as possible,
              including those with disabilities. We aim to comply with the Web Content
              Accessibility Guidelines (WCAG) 2.1 at Level AA.
            </p>

            <h3>Accessibility Features</h3>
            <p>This website includes the following accessibility features:</p>
            <ul>
              <li><strong>Keyboard navigation:</strong> All functionality is accessible via keyboard</li>
              <li><strong>Screen reader compatibility:</strong> Semantic HTML structure for assistive technologies</li>
              <li><strong>High contrast:</strong> Dark theme with sufficient colour contrast</li>
              <li><strong>Responsive design:</strong> Works on devices of all sizes</li>
              <li><strong>Text resizing:</strong> Text can be resized up to 200% without loss of functionality</li>
              <li><strong>Alt text:</strong> Images include alternative text descriptions</li>
            </ul>

            <h3>Known Limitations</h3>
            <p>
              We are aware of the following accessibility limitations:
            </p>
            <ul>
              <li>Some interactive charts may not be fully accessible to screen readers</li>
              <li>PDF documents linked from this site may not be fully accessible</li>
              <li>Some complex data tables may be difficult to navigate with screen readers</li>
            </ul>

            <h3>Reporting Accessibility Issues</h3>
            <p>
              If you experience any difficulty accessing content on this website, please
              contact us describing the problem. We will try to address issues and improve
              accessibility where possible.
            </p>

            <h3>Enforcement Procedure</h3>
            <p>
              The Equality and Human Rights Commission (EHRC) is responsible for enforcing
              the Public Sector Bodies (Websites and Mobile Applications) (No. 2) Accessibility
              Regulations 2018. If you're not satisfied with our response, you can contact
              the Equality Advisory Support Service (EASS).
            </p>
          </div>
        )}
      </div>

      <footer className="legal-footer">
        <p>
          <strong>Questions?</strong> This website is an independent public transparency project.
          For corrections or concerns, please raise an issue on our public repository or contact
          us through the official channels.
        </p>
      </footer>
    </div>
  )
}

export default Legal
