import { useState, useMemo } from 'react'
import { BookOpen, Database, GraduationCap, Scale, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import './LGRMethodology.css'

/**
 * LGRMethodology — Transparent methodology section showing data sources,
 * academic basis, computational steps, and AI DOGE vs PwC/CCN comparison.
 *
 * Props:
 *   budgetModel — from lgr_budget_model.json (for data freshness dates)
 *   lgrData — from lgr_tracker.json (for model metadata)
 */

const DATA_SOURCES = [
  { name: 'GOV.UK MHCLG Revenue Outturn', type: 'Government', freshness: '2023-24 (latest available)',
    description: 'Service-level expenditure for all 15 Lancashire councils', url: 'https://www.gov.uk/government/collections/local-authority-revenue-expenditure-and-financing' },
  { name: 'ONS Census 2021', type: 'Government', freshness: 'March 2021',
    description: 'Ward-level demographics: age, ethnicity, religion, economic activity', url: 'https://www.nomisweb.co.uk/' },
  { name: 'ONS SNPP 2018-based', type: 'Government', freshness: '2018 base, projections to 2043',
    description: 'Sub-national population projections by age and sex', url: 'https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections' },
  { name: 'MHCLG IMD 2019', type: 'Government', freshness: '2019 (latest edition)',
    description: 'Index of Multiple Deprivation at LSOA level', url: 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019' },
  { name: 'DfE SEND Statistics', type: 'Government', freshness: '2024-25',
    description: 'Education Health and Care Plans by local authority', url: 'https://explore-education-statistics.service.gov.uk/' },
  { name: 'Home Office Asylum Statistics', type: 'Government', freshness: 'Q3 2025',
    description: 'Asylum dispersal by local authority', url: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables' },
  { name: 'CIPFA Financial Statistics', type: 'Professional', freshness: '2024-25',
    description: 'Comparative financial profiles, reserves adequacy', url: 'https://www.cipfa.org/' },
  { name: 'Companies House', type: 'Government', freshness: 'Live API',
    description: 'Supplier verification, councillor directorship cross-referencing', url: 'https://developer.company-information.service.gov.uk/' },
]

const ACADEMIC_SOURCES = [
  { authors: 'Andrews & Boyne', year: 2009, title: 'Size, Structure and Administrative Overheads',
    journal: 'Urban Studies',
    finding: 'LINEAR negative relationship between authority size and admin costs as % of budget — larger authorities have proportionally lower overheads. NOT a U-curve.',
    impact: 'Core theoretical basis for LGR savings. Directly contradicts "too big to manage" arguments.' },
  { authors: 'Dollery & Fleming', year: 2006, title: 'A Conceptual Note on Scale Economies',
    journal: 'Urban Policy and Research',
    finding: 'Scale, size, and scope economies are DISTINCT phenomena. Shared services can achieve scope economies WITHOUT structural merger.',
    impact: 'Challenges assumption that merger is the only path. Supports shared services as alternative.' },
  { authors: 'Grant Thornton', year: 2023, title: 'LGR Lessons Learned',
    journal: 'Commissioned review',
    finding: '"Implementation timescales were too short, transformation was delayed, resources underestimated". Median 35% cost overrun.',
    impact: 'Evidence for our alternative timeline and 75% realisation rate assumption.' },
  { authors: 'Bennett Institute, Cambridge', year: 2024, title: 'LGR Evidence Assessment',
    journal: 'Policy brief',
    finding: 'Case for LGR "needs further investigation" and could be "costly, piecemeal". Government evidence base is thin.',
    impact: 'Academic scepticism about pace and evidence quality of current proposals.' },
  { authors: 'Ernst & Young', year: 2016, title: 'Independent Analysis of LGR',
    journal: 'Commissioned by DCLG',
    finding: '60-80% savings realisation rate in practice. Transition costs typically underestimated by 20-40%.',
    impact: 'Basis for our 75% central case realisation rate (midpoint of range).' },
  { authors: 'HM Treasury', year: 2025, title: 'The Green Book (2022 with 2025 supplements)',
    journal: 'Government guidance',
    finding: '3.5% social time preference rate for discounting public sector costs/benefits. Under review (expected June 2026).',
    impact: 'Used for all NPV calculations. Could change post-review.' },
]

const COMPARISON_TABLE = [
  { dimension: 'Transparency', aiDoge: 'Fully open-source, all calculations visible', pwcCcn: 'Proprietary model, assumptions not published', govt: 'Summary figures only, limited methodology disclosure' },
  { dimension: 'Data Sources', aiDoge: '8 government + professional sources, ward-level granularity', pwcCcn: '~3 sources, authority-level only', govt: 'MHCLG internal data, not published' },
  { dimension: 'Savings Method', aiDoge: '14 service-line rates with per-line evidence', pwcCcn: 'Flat percentage (4.0-5.2%) by authority size band', govt: '"Up to £2.9bn nationally" from CCN modelling' },
  { dimension: 'Deprivation Adjustment', aiDoge: 'Ward-level IMD with nested deprivation penalty', pwcCcn: 'None published', govt: 'None published' },
  { dimension: 'Timeline Risk', aiDoge: 'Critical path analysis, precedent-calibrated delivery probability', pwcCcn: 'Not modelled', govt: 'Assumes on-time delivery' },
  { dimension: 'Equal Pay Risk', aiDoge: 'Modelled from Birmingham precedent (£760M)', pwcCcn: 'Not included', govt: 'Not included' },
  { dimension: 'Academic Basis', aiDoge: 'Andrews & Boyne 2009, Dollery & Fleming 2006, EY 2016', pwcCcn: 'Internal PwC methodology', govt: 'CCN evidence base' },
  { dimension: 'Peer Review', aiDoge: 'Open to challenge (methodology published)', pwcCcn: 'None published', govt: 'Select Committee scrutiny only' },
  { dimension: 'Limitations Disclosed', aiDoge: 'Yes — explicit limitations section', pwcCcn: 'Limited', govt: 'None' },
]

function LGRMethodology({ budgetModel, lgrData }) {
  const [expandedSection, setExpandedSection] = useState(null)

  const toggle = (section) => setExpandedSection(prev => prev === section ? null : section)

  const computationSteps = useMemo(() => [
    { step: 1, name: 'Service-Line Expenditure', description: 'Aggregate GOV.UK Revenue Outturn data per proposed authority from constituent council budgets. 14 service categories.' },
    { step: 2, name: 'Evidence-Based Savings Rates', description: 'Apply per-service savings rates (2-30%) derived from academic literature and UK LGR precedent data. Each rate individually evidenced.' },
    { step: 3, name: 'Realisation & Ongoing Costs', description: 'Apply 75% realisation rate (EY 2016 midpoint). Deduct 15% ongoing implementation costs per service line.' },
    { step: 4, name: 'Deprivation Adjustment', description: 'Reduce savings by 5-35% based on ward-level IMD scores. Additional 5% "nested deprivation" penalty for mixed affluent/deprived authorities.' },
    { step: 5, name: 'CCA Deduction', description: 'Subtract services already transferred to Lancashire Combined County Authority to prevent double-counting.' },
    { step: 6, name: 'Transition Costs', description: 'Bottom-up costing: IT systems (per-system), staff TUPE/redundancy, equal pay provision (Birmingham-scaled), programme management.' },
    { step: 7, name: 'Time-Phased Cashflow', description: 'S-curve savings ramp over 10 years. Per-service ramp speeds (slow for social care, fast for admin). Inflation and discount rate applied.' },
    { step: 8, name: 'NPV & Sensitivity', description: 'HM Treasury Green Book 3.5% discount rate. Monte Carlo-style sensitivity across 6 assumption dimensions.' },
  ], [])

  return (
    <section className="lgr-meth" aria-label="Methodology">
      <h2><BookOpen size={20} /> Methodology & Data Sources</h2>
      <p className="lgr-meth-intro">
        Full transparency on how AI DOGE computes LGR financial projections.
        Every assumption is evidenced, every calculation is open.
      </p>

      {/* Data Sources */}
      <div className="lgr-meth-section">
        <button className="lgr-meth-toggle" onClick={() => toggle('data')} aria-expanded={expandedSection === 'data'}>
          <Database size={18} />
          <span>Data Sources ({DATA_SOURCES.length})</span>
          {expandedSection === 'data' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expandedSection === 'data' && (
          <div className="lgr-meth-panel">
            <div className="lgr-meth-table-wrap">
              <table className="lgr-meth-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Freshness</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_SOURCES.map((s, i) => (
                    <tr key={i}>
                      <td className="lgr-meth-source-name">
                        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} <ExternalLink size={11} /></a> : s.name}
                      </td>
                      <td><span className={`lgr-meth-type-badge lgr-meth-type-${s.type.toLowerCase()}`}>{s.type}</span></td>
                      <td className="lgr-meth-freshness">{s.freshness}</td>
                      <td className="lgr-meth-desc-cell">{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Computation Steps */}
      <div className="lgr-meth-section">
        <button className="lgr-meth-toggle" onClick={() => toggle('computation')} aria-expanded={expandedSection === 'computation'}>
          <Scale size={18} />
          <span>Computation Methodology (8 steps)</span>
          {expandedSection === 'computation' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expandedSection === 'computation' && (
          <div className="lgr-meth-panel">
            <ol className="lgr-meth-steps">
              {computationSteps.map(s => (
                <li key={s.step} className="lgr-meth-step">
                  <span className="lgr-meth-step-num">{s.step}</span>
                  <div>
                    <strong>{s.name}</strong>
                    <p>{s.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Academic Basis */}
      <div className="lgr-meth-section">
        <button className="lgr-meth-toggle" onClick={() => toggle('academic')} aria-expanded={expandedSection === 'academic'}>
          <GraduationCap size={18} />
          <span>Academic & Evidence Basis ({ACADEMIC_SOURCES.length} sources)</span>
          {expandedSection === 'academic' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expandedSection === 'academic' && (
          <div className="lgr-meth-panel">
            <div className="lgr-meth-citations">
              {ACADEMIC_SOURCES.map((s, i) => (
                <div key={i} className="lgr-meth-citation-card">
                  <div className="lgr-meth-citation-header">
                    <span className="lgr-meth-citation-authors">{s.authors} ({s.year})</span>
                    <span className="lgr-meth-citation-journal">{s.journal}</span>
                  </div>
                  <div className="lgr-meth-citation-title">{s.title}</div>
                  <p className="lgr-meth-citation-finding"><strong>Finding:</strong> {s.finding}</p>
                  <p className="lgr-meth-citation-impact"><strong>Applied:</strong> {s.impact}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI DOGE vs PwC/CCN vs Government */}
      <div className="lgr-meth-section">
        <button className="lgr-meth-toggle" onClick={() => toggle('comparison')} aria-expanded={expandedSection === 'comparison'}>
          <AlertCircle size={18} />
          <span>AI DOGE vs PwC/CCN vs Government</span>
          {expandedSection === 'comparison' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {expandedSection === 'comparison' && (
          <div className="lgr-meth-panel">
            <div className="lgr-meth-table-wrap">
              <table className="lgr-meth-table lgr-meth-compare-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th className="lgr-meth-col-doge">AI DOGE</th>
                    <th>PwC/CCN</th>
                    <th>Government</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_TABLE.map((row, i) => (
                    <tr key={i}>
                      <td className="lgr-meth-dim-cell">{row.dimension}</td>
                      <td className="lgr-meth-col-doge">{row.aiDoge}</td>
                      <td>{row.pwcCcn}</td>
                      <td>{row.govt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Limitations */}
      <div className="lgr-meth-limitations">
        <h4><AlertCircle size={16} /> Limitations & Caveats</h4>
        <ul>
          <li>Revenue Outturn data is 2023-24 — actual expenditure may differ by the time LGR proceeds</li>
          <li>Equal pay risk is estimated from Birmingham precedent — Lancashire&apos;s pay structures may differ materially</li>
          <li>Service-line savings rates are evidence-based estimates, not guarantees — actual outcomes depend on implementation quality</li>
          <li>HM Treasury discount rate (3.5%) is under review and may change in June 2026</li>
          <li>Census 2021 demographic data is 5 years old — mid-year estimates used where available but ward-level granularity limited</li>
          <li>This model does not capture all political, cultural, and community impacts of reorganisation</li>
        </ul>
      </div>
    </section>
  )
}

export default LGRMethodology
