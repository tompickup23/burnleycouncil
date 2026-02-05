import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, CheckCircle, Clock, Send } from 'lucide-react'
import './FOI.css'

const foiCategories = [
  {
    id: 'spending',
    title: 'Spending & Contracts',
    description: 'Questions about how the council spends public money',
    requests: [
      {
        title: 'Liberata Contract Full Details',
        why: 'Liberata UK Ltd is one of the council\'s largest suppliers. Understanding the full contract terms helps assess value for money.',
        template: `Under the Freedom of Information Act 2000, I request the following information regarding the council's contract with Liberata UK Ltd:

1. The full contract value and duration (start and end dates)
2. Any contract extensions or variations agreed since the original contract was signed
3. Key performance indicators (KPIs) and the most recent performance report
4. Any penalty clauses and whether penalties have been applied
5. The cost comparison analysis (if any) between outsourced delivery and in-house provision that informed the decision to outsource`,
        status: 'suggested',
        context: 'FOI requests about outsourcing contracts have revealed significant issues at other councils. Reading Borough Council\'s travel expenses were exposed through FOI, and Elmbridge Borough Council\'s £400k consultancy spend on a project with "little to show for it" was uncovered through similar requests.'
      },
      {
        title: 'Geldards LLP Legal Services Breakdown',
        why: 'Geldards LLP appears as one of the council\'s highest-paid suppliers. Understanding what legal services this covers helps assess whether the expenditure is proportionate.',
        template: `Under the Freedom of Information Act 2000, I request the following information regarding payments to Geldards LLP:

1. A breakdown of the legal services provided by Geldards LLP by category (e.g. property, planning, employment, litigation) for each financial year from 2021/22 to 2024/25
2. Whether Geldards LLP are appointed under a framework agreement or through competitive tender
3. The hourly rates or fee structure agreed with Geldards LLP
4. Whether the council has considered alternative providers or conducted any benchmarking exercise`,
        status: 'suggested',
        context: 'Legal fees are one of the largest categories of council spending nationally. Understanding the breakdown helps residents assess whether costs are proportionate to the services received.'
      },
      {
        title: 'Purchase Card Policy and Oversight',
        why: 'Purchase cards allow council staff to make direct purchases. Understanding the controls in place helps ensure public money is properly managed.',
        template: `Under the Freedom of Information Act 2000, I request:

1. The council's current Purchase Card Policy document
2. The number of active purchase cards issued to staff
3. The approval and oversight process for purchase card transactions
4. Any internal audit reports relating to purchase card usage from 2021 onwards
5. Whether any purchase card transactions have been flagged as inappropriate or required repayment in the last 3 years`,
        status: 'suggested',
        context: 'In 2025, a national review found Whitehall procurement card spending had reached £675 million over five years, leading to approximately 10,000 cards being cancelled.'
      },
    ]
  },
  {
    id: 'governance',
    title: 'Governance & Decision Making',
    description: 'Questions about how decisions are made and who is accountable',
    requests: [
      {
        title: 'Senior Officer Pay and Structure',
        why: 'Understanding senior pay helps assess whether the council\'s management structure represents value for money.',
        template: `Under the Freedom of Information Act 2000, I request:

1. The current pay scales for all officers at Head of Service level and above
2. The total remuneration package (including pension contributions, bonuses, and benefits) for each post at this level
3. Any severance or redundancy payments made to senior officers since April 2021
4. The current management structure chart showing all posts at Head of Service level and above`,
        status: 'suggested',
        context: 'Councils are required to publish a Pay Policy Statement annually, but these often lack the detail needed to fully understand senior pay arrangements.'
      },
      {
        title: 'Councillor Allowances and Expenses',
        why: 'Councillors receive allowances from public funds. Full transparency about these costs supports democratic accountability.',
        template: `Under the Freedom of Information Act 2000, I request:

1. The total allowances paid to each individual councillor for each financial year from 2021/22 to 2024/25
2. A breakdown by type of allowance (basic, special responsibility, travel, subsistence)
3. Any claims for equipment, broadband, or other expenses
4. The recommendations of the Independent Remuneration Panel and whether they were accepted or modified`,
        status: 'suggested',
        context: 'Councillor allowances are published but often not in a format that makes comparison easy. Full breakdowns help residents understand the total cost of their elected representatives.'
      },
    ]
  },
  {
    id: 'property',
    title: 'Property & Assets',
    description: 'Questions about council-owned land, buildings, and investments',
    requests: [
      {
        title: 'Charter Walk Shopping Centre Performance',
        why: 'The council purchased Charter Walk for £20.7 million of public money. Residents deserve to know how this investment is performing.',
        template: `Under the Freedom of Information Act 2000, I request:

1. The annual rental income received from Charter Walk Shopping Centre for each year since purchase
2. The current occupancy rate and a list of current tenants
3. Annual running costs, maintenance, and management fees
4. The net income (after all costs) for each financial year
5. Any valuations carried out since purchase and the current estimated value
6. The business case or investment appraisal that supported the purchase decision`,
        status: 'suggested',
        context: 'The council purchased Charter Walk in 2021/22 for £20.7 million, stating a net initial yield of 11%. Performance data helps assess whether this investment is delivering as planned.'
      },
      {
        title: 'Council Property Asset Register',
        why: 'Understanding what assets the council owns helps assess how effectively public property is being used.',
        template: `Under the Freedom of Information Act 2000, I request:

1. A complete list of all land and property assets owned by Burnley Borough Council
2. For each asset: the current use, estimated value, and any rental income generated
3. A list of any properties that are currently vacant or unused
4. Any disposals (sales) of council property since April 2021 and the sale prices achieved`,
        status: 'suggested',
        context: 'Councils are required to publish an asset register under the Transparency Code, but the published data is often incomplete or outdated.'
      },
    ]
  },
  {
    id: 'services',
    title: 'Services & Performance',
    description: 'Questions about how well council services are performing',
    requests: [
      {
        title: 'Waste Collection Contract Performance',
        why: 'Urbaser Ltd receives millions for waste collection. Understanding contract performance helps assess value for money.',
        template: `Under the Freedom of Information Act 2000, I request:

1. The current waste collection contract value, duration, and key terms with Urbaser Ltd
2. Performance data including missed collections, complaints, and recycling rates for each year since 2021
3. Any penalty deductions applied under the contract
4. Benchmarking data comparing Burnley's waste collection costs per household with similar authorities`,
        status: 'suggested',
        context: 'Waste collection is one of the most visible council services. Comparing costs and performance with other councils helps assess whether residents are getting good value.'
      },
      {
        title: 'Council Tax Collection Rates',
        why: 'With nearly £13 million in council tax debt reported, understanding collection performance and costs is important.',
        template: `Under the Freedom of Information Act 2000, I request:

1. The council tax collection rate for each year from 2021/22 to 2024/25
2. The total outstanding council tax debt as at 31 March each year
3. The amount spent on council tax recovery and enforcement each year
4. The amount of council tax debt written off each year
5. Whether any collection cases have been referred to bailiffs and the associated costs`,
        status: 'suggested',
        context: 'Burnley reportedly has nearly £13 million in outstanding council tax debt. Understanding the full picture of collection costs versus debt recovered helps assess whether the approach is effective.'
      },
    ]
  },
]

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
  ]
}

function FOI() {
  const [expandedCategory, setExpandedCategory] = useState('spending')
  const [expandedRequest, setExpandedRequest] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const copyTemplate = (template, id) => {
    navigator.clipboard.writeText(template).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="foi-page animate-fade-in">
      <header className="page-header">
        <h1>Freedom of Information</h1>
        <p className="subtitle">
          Your right to ask questions. Suggested FOI requests you can send to Burnley Borough Council.
        </p>
      </header>

      {/* What is FOI Section */}
      <section className="foi-intro">
        <div className="foi-intro-card">
          <h2>What is Freedom of Information?</h2>
          <p>
            The Freedom of Information Act 2000 gives you the right to request any information
            held by a public body, including your local council. You don't need to give a reason.
            The council must respond within 20 working days.
          </p>
          <div className="foi-action">
            <a
              href="https://burnley.gov.uk/council-democracy/freedom-of-information-foi/"
              target="_blank"
              rel="noopener noreferrer"
              className="foi-btn primary"
            >
              <Send size={16} />
              Submit an FOI to Burnley Council
              <ExternalLink size={14} />
            </a>
            <a
              href="https://www.whatdotheyknow.com/new/burnley_borough_council"
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

      {/* Suggested Requests */}
      <section className="foi-requests">
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
                <h3>{category.title}</h3>
                <p>{category.description}</p>
              </div>
              {expandedCategory === category.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {expandedCategory === category.id && (
              <div className="category-requests">
                {category.requests.map((request, i) => {
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
                              href="https://burnley.gov.uk/council-democracy/freedom-of-information-foi/"
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
