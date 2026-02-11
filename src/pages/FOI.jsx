import { useState, useRef, useEffect } from 'react'
import { FileText, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle, Clock, Send, Award } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './FOI.css'

const foiGuide = {
  rights: [
    'Anyone can make an FOI request — you don\'t need to give a reason',
    'The council must respond within 20 working days',
    'Information should be free, though the council can charge for printing',
    'If refused, you can request an internal review',
    'If still unsatisfied, you can appeal to the Information Commissioner\'s Office (ICO)',
  ],
  tips: [
    'Be specific — vague requests are easier to refuse',
    'Ask for documents, not opinions or explanations',
    'Reference specific time periods (e.g. "from April 2021 to March 2025")',
    'If you know a specific document exists, ask for it by name',
    'Keep requests focused on one topic for faster responses',
  ],
  otherCouncilScandals: [
    {
      council: 'Reading Borough Council',
      issue: 'FOI revealed £80,000+ spent on staff travel expenses, including the Mayor attending a UEFA reception in Germany',
      year: '2024',
    },
    {
      council: 'Elmbridge Borough Council',
      issue: 'FOI revealed £402,000 paid to consultants for a flagship project with "little to show for it"',
      year: '2024',
    },
    {
      council: 'Cardiff City Council',
      issue: 'Whistleblower exposed £417,000 waste disposal fraud; five men sentenced for bribery',
      year: '2023',
    },
    {
      council: 'Birmingham City Council',
      issue: 'Section 114 "bankruptcy" notice issued with £87 million deficit, rising to £165 million',
      year: '2023',
    },
    {
      council: 'Nottingham City Council',
      issue: 'Section 114 notice with £23 million overspend; Robin Hood Energy collapse',
      year: '2023',
    },
    {
      council: 'Southend Council',
      issue: 'Counter-fraud partnership itself found mired in fraud allegations; £272,000 payments uncovered via FOI',
      year: '2025',
    },
  ],
  localSuccesses: [
    {
      topic: 'Council Executive Pay',
      outcome: 'FOI requests across East Lancashire revealed senior officer pay packages, enabling cross-council comparisons that showed some councils paying above-average rates for similar roles.',
      impact: 'Greater public scrutiny of executive remuneration decisions'
    },
    {
      topic: 'Outsourcing Contract Costs',
      outcome: 'FOI requests helped uncover the scale of outsourcing to companies like Liberata and Capita across Lancashire councils, revealing multi-million pound contracts with limited public reporting.',
      impact: 'Several councils now publish more contract details proactively'
    },
    {
      topic: 'COVID Grant Distribution',
      outcome: 'FOI requests revealed how councils distributed emergency COVID business grants, including processing times and error rates in eligibility checking.',
      impact: 'Improved transparency in emergency grant administration'
    },
  ]
}

// Fallback for clipboard API (HTTP contexts, older browsers)
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch { return false }
}

function FOI() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilFullName = config.council_full_name || 'Borough Council'
  const officialUrl = config.official_website || '#'

  const { data: foiData, loading, error } = useData('/data/foi_templates.json')
  const foiCategories = foiData?.categories || []

  const [expandedCategory, setExpandedCategory] = useState('spending')
  const [expandedRequest, setExpandedRequest] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const copyTimerRef = useRef(null)

  // Cleanup copy feedback timer on unmount
  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }
  }, [])

  const copyTemplate = (template, id) => {
    const onSuccess = () => {
      setCopiedId(id)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(template).then(onSuccess).catch(() => {
        // Fallback for HTTP or older browsers
        fallbackCopy(template) && onSuccess()
      })
    } else {
      fallbackCopy(template) && onSuccess()
    }
  }

  // Build FOI submission URL (prefer config, fall back to generic pattern)
  const foiUrl = config.foi_url || `${officialUrl}${officialUrl.endsWith('/') ? '' : '/'}council-democracy/freedom-of-information-foi/`
  const wdtkSlug = councilFullName.toLowerCase().replace(/\s+/g, '_')

  if (loading) {
    return <LoadingState message="Loading FOI templates..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  return (
    <div className="foi-page animate-fade-in">
      <header className="page-header">
        <h1>Freedom of Information</h1>
        <p className="subtitle">
          Your right to ask questions. Suggested FOI requests you can send to {councilFullName}.
        </p>
      </header>

      {/* What is FOI Section */}
      <section className="foi-intro" aria-label="What is Freedom of Information">
        <div className="foi-intro-card">
          <h2>What is Freedom of Information?</h2>
          <p>
            The Freedom of Information Act 2000 gives you the right to request any information
            held by a public body, including your local council. You don't need to give a reason.
            The council must respond within 20 working days.
          </p>
          <div className="foi-action">
            <a
              href={foiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="foi-btn primary"
            >
              <Send size={16} />
              Submit an FOI to {councilName} Council
              <ExternalLink size={14} />
            </a>
            <a
              href={`https://www.whatdotheyknow.com/new/${wdtkSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="foi-btn secondary"
            >
              Use WhatDoTheyKnow.com
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Your Rights */}
      <section className="foi-rights">
        <div className="rights-grid">
          <div className="rights-card">
            <h3><CheckCircle size={20} /> Your Rights</h3>
            <ul>
              {foiGuide.rights.map((right, i) => (
                <li key={i}>{right}</li>
              ))}
            </ul>
          </div>
          <div className="rights-card">
            <h3><FileText size={20} /> Tips for Effective Requests</h3>
            <ul>
              {foiGuide.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Suggested Requests — loaded from JSON */}
      {foiCategories.length > 0 && (
        <section className="foi-requests" aria-label="FOI request templates">
          <h2>Suggested Requests</h2>
          <p className="section-intro">
            Ready-to-use FOI request templates. Click to expand, then copy and submit to the council.
          </p>

          {foiCategories.map(category => (
            <div key={category.id} className="foi-category">
              <button
                className={`category-header ${expandedCategory === category.id ? 'active' : ''}`}
                onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
              >
                <div>
                  <h3>{category.name || category.title}</h3>
                  <p>{category.description}</p>
                </div>
                {expandedCategory === category.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {expandedCategory === category.id && (
                <div className="category-requests">
                  {(category.templates || category.requests || []).map((request, i) => {
                    const requestId = `${category.id}-${i}`
                    return (
                      <div key={requestId} className="request-card">
                        <button
                          className="request-header"
                          onClick={() => setExpandedRequest(expandedRequest === requestId ? null : requestId)}
                        >
                          <div className="request-title-area">
                            <h4>{request.title}</h4>
                            <p className="request-why">{request.why}</p>
                          </div>
                          {expandedRequest === requestId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {expandedRequest === requestId && (
                          <div className="request-detail">
                            {request.context && (
                              <div className="request-context">
                                <AlertTriangle size={16} />
                                <p><strong>Context:</strong> {request.context}</p>
                              </div>
                            )}
                            <div className="template-area">
                              <div className="template-header">
                                <span>FOI Request Template</span>
                                <button
                                  className="copy-btn"
                                  onClick={() => copyTemplate(request.template, requestId)}
                                >
                                  {copiedId === requestId ? (
                                    <><CheckCircle size={14} /> Copied</>
                                  ) : (
                                    'Copy Template'
                                  )}
                                </button>
                              </div>
                              <pre className="template-text">{request.template}</pre>
                            </div>
                            <div className="request-actions">
                              <a
                                href={foiUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="submit-btn"
                              >
                                <Send size={14} />
                                Submit This Request
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* What FOI Has Uncovered Elsewhere */}
      <section className="foi-scandals">
        <h2>What FOI Has Uncovered at Other Councils</h2>
        <p className="section-intro">
          Freedom of Information requests have been instrumental in exposing financial issues
          at councils across the UK.
        </p>

        <div className="scandals-grid">
          {foiGuide.otherCouncilScandals.map((scandal, i) => (
            <div key={i} className="scandal-card">
              <div className="scandal-header">
                <span className="scandal-council">{scandal.council}</span>
                <span className="scandal-year">{scandal.year}</span>
              </div>
              <p>{scandal.issue}</p>
            </div>
          ))}
        </div>

        <div className="foi-national-stats">
          <h3>The Scale of the Problem</h3>
          <p>
            According to estimates by CIPFA, NAO, and the LGA, UK local government loses up to
            <strong> £7.3 billion annually</strong> to fraud, error, and waste. Procurement fraud
            alone accounts for an estimated 57% of all local government fraud by value. FOI requests
            are one of the most effective tools the public has to hold councils accountable.
          </p>
        </div>
      </section>

      {/* Local FOI Successes */}
      <section className="foi-successes">
        <h2><Award size={24} /> FOI Successes in East Lancashire</h2>
        <p className="section-intro">
          Freedom of Information has made a real difference in understanding how local councils operate.
        </p>
        <div className="successes-list">
          {foiGuide.localSuccesses.map((success, i) => (
            <div key={i} className="success-card">
              <h4>{success.topic}</h4>
              <p>{success.outcome}</p>
              <div className="success-impact">
                <CheckCircle size={14} />
                <span>{success.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How to Submit */}
      <section className="foi-how">
        <h2>How to Submit a Request</h2>
        <div className="steps-grid">
          <div className="step-card">
            <span className="step-number">1</span>
            <h4>Choose a Template</h4>
            <p>Pick a ready-made request above, or write your own</p>
          </div>
          <div className="step-card">
            <span className="step-number">2</span>
            <h4>Send It</h4>
            <p>Email it to the council or use WhatDoTheyKnow.com</p>
          </div>
          <div className="step-card">
            <span className="step-number">3</span>
            <h4>Wait 20 Days</h4>
            <p>The council must respond within 20 working days</p>
          </div>
          <div className="step-card">
            <span className="step-number">4</span>
            <h4>Appeal if Refused</h4>
            <p>Request an internal review, then escalate to the ICO</p>
          </div>
        </div>
      </section>

      {/* Track Your Requests */}
      <section className="foi-tracking">
        <h2>Track FOI Responses</h2>
        <p className="section-intro">
          Keep track of your requests and see what others have asked {councilFullName}.
        </p>
        <div className="tracking-grid">
          <div className="tracking-card">
            <div className="tracking-icon">
              <Clock size={24} />
            </div>
            <h4>Check Response Status</h4>
            <p>
              If you submitted via WhatDoTheyKnow, your request and the council's response
              are publicly tracked and timestamped.
            </p>
            <a
              href={`https://www.whatdotheyknow.com/body/${wdtkSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tracking-link"
            >
              View {councilName}'s FOI history <ExternalLink size={14} />
            </a>
          </div>
          <div className="tracking-card">
            <div className="tracking-icon">
              <AlertTriangle size={24} />
            </div>
            <h4>Request Overdue?</h4>
            <p>
              Councils must respond within 20 working days. If they haven't, you can
              request an internal review, then escalate to the ICO.
            </p>
            <a
              href="https://ico.org.uk/make-a-complaint/foi-and-eir-complaints/"
              target="_blank"
              rel="noopener noreferrer"
              className="tracking-link"
            >
              Complain to the ICO <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      <div className="foi-disclaimer">
        <p>
          <strong>Note:</strong> These suggested requests are provided as templates only.
          The council may apply exemptions under the Freedom of Information Act 2000 to withhold
          certain information. This page does not constitute legal advice.
        </p>
      </div>
    </div>
  )
}

export default FOI
