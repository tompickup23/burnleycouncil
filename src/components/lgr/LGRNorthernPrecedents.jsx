import { useMemo, useState } from 'react'
import { MapPin, AlertTriangle, TrendingDown, Users, ChevronDown, ChevronUp, Factory, Pickaxe, Building, Calendar, ArrowRight, Check, X as XIcon, BookOpen } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { PRECEDENT_DATA, LGR_PRECEDENT_EXPERIENCES } from '../../utils/lgrModel'
import './LGRNorthernPrecedents.css'

/**
 * LGRNorthernPrecedents — Northern post-industrial town comparison for LGR risk assessment.
 * Shows 10 reference towns (textile, mining, mixed) with broad socioeconomic data
 * to demonstrate that fiscal risk trajectories are driven by deindustrialisation,
 * deprivation and demand pressure — not by any single demographic factor.
 *
 * Props:
 *   northernComparison — from computeNorthernMillTownComparison()
 *   precedentBenchmark — from computePrecedentBenchmark()
 */

const TOWN_COLORS = {
  Bradford: '#ff453a',
  Oldham: '#ff9f0a',
  Rochdale: '#ffd60a',
  Bolton: '#00d4aa',
  Bury: '#30d158',
  Kirklees: '#bf5af2',
  Calderdale: '#64d2ff',
  Barnsley: '#8e8e93',
  Wigan: '#ac8e68',
  Wakefield: '#ff6482',
}

const TYPE_ICONS = { textile: Factory, mining: Pickaxe, mixed: Building }
const TYPE_LABELS = { textile: 'Textile/Mill', mining: 'Mining/Coal', mixed: 'Mixed Economy' }

const RISK_COLORS = {
  high: '#ff453a',
  medium: '#ff9f0a',
  low: '#30d158',
}

function LGRNorthernPrecedents({ northernComparison, precedentBenchmark }) {
  const [expandedTown, setExpandedTown] = useState(null)
  const [expandedPrecedent, setExpandedPrecedent] = useState(null)

  if (!northernComparison) return null

  const { comparisons: towns, lancashireAuthorities, deprivationPersistence, factors } = northernComparison

  // Comparison bar chart: key metrics across Lancashire authorities
  const authorityCompare = useMemo(() => {
    if (!lancashireAuthorities?.length) return []
    return lancashireAuthorities.map(a => ({
      name: a.authority?.length > 20 ? a.authority.slice(0, 18) + '...' : a.authority,
      fullName: a.authority,
      bradfordSimilarity: a.bradfordSimilarity || 0,
      collectionRate: a.collectionRate || 97,
      trajectoryRisk: a.trajectoryRisk,
    }))
  }, [lancashireAuthorities])

  // LGR precedent comparison data (kept for potential reuse)
  const precedentComparables = useMemo(() => {
    if (!precedentBenchmark?.comparables) return []
    return precedentBenchmark.comparables
  }, [precedentBenchmark])

  return (
    <section className="lgr-np" aria-label="Northern Precedents">
      <h2><MapPin size={20} /> Northern Post-Industrial Town Precedents</h2>
      <p className="lgr-np-intro">
        Lancashire&apos;s authorities share characteristics with post-industrial towns across the North.
        This comparison spans textile towns (Bradford, Oldham, Kirklees), mining communities (Barnsley, Wigan, Wakefield),
        and mixed economies (Bolton, Bury) to show that fiscal risk is driven by <strong>deindustrialisation,
        deprivation and demand pressure</strong> — not by any single demographic factor.
      </p>

      {/* Town profile cards */}
      <div className="lgr-np-towns">
        {towns.map(town => {
          const TypeIcon = TYPE_ICONS[town.type] || Factory
          return (
            <div key={town.name} className="lgr-np-town-card"
                 style={{ borderLeftColor: TOWN_COLORS[town.name] || '#636366' }}>
              <button className="lgr-np-town-header"
                      onClick={() => setExpandedTown(prev => prev === town.name ? null : town.name)}
                      aria-expanded={expandedTown === town.name}>
                <div className="lgr-np-town-title">
                  <strong>{town.name}</strong>
                  <span className="lgr-np-town-type-badge" style={{ color: TOWN_COLORS[town.name] || '#636366' }}>
                    <TypeIcon size={12} /> {TYPE_LABELS[town.type] || town.type}
                  </span>
                  <span className="lgr-np-town-region">{town.region}</span>
                </div>
                <div className="lgr-np-town-stats-mini">
                  <span>{(town.population / 1000).toFixed(0)}K pop</span>
                  <span>IMD #{town.imdRank}</span>
                  <span className={`lgr-np-risk-badge lgr-np-risk-${town.section114Risk}`}>
                    S114: {town.section114Risk}
                  </span>
                </div>
                {expandedTown === town.name ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {expandedTown === town.name && (
                <div className="lgr-np-town-detail">
                  {/* Demographics row */}
                  <div className="lgr-np-detail-section-label">Demographics</div>
                  <div className="lgr-np-town-grid">
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">White British</span>
                      <span className="lgr-np-metric-value">{town.whiteBritishPct || '—'}%</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Asian</span>
                      <span className="lgr-np-metric-value">{town.asianPct || '—'}%</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Under 20</span>
                      <span className="lgr-np-metric-value">{town.under20Pct}%</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Over 65</span>
                      <span className="lgr-np-metric-value">{town.over65Pct}%</span>
                    </div>
                  </div>

                  {/* Deprivation & economics row */}
                  <div className="lgr-np-detail-section-label">Deprivation &amp; Economics</div>
                  <div className="lgr-np-town-grid">
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Child Poverty</span>
                      <span className="lgr-np-metric-value" style={{ color: (town.childPovertyPct || 0) > 35 ? '#ff453a' : '#e5e5e7' }}>
                        {town.childPovertyPct || '—'}%
                      </span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Employment</span>
                      <span className="lgr-np-metric-value">{town.employmentRate}%</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">No Qualifications</span>
                      <span className="lgr-np-metric-value">{town.noQualsPct}%</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Avg House Price</span>
                      <span className="lgr-np-metric-value">£{town.avgHousePrice ? (town.avgHousePrice / 1000).toFixed(0) + 'K' : '—'}</span>
                    </div>
                  </div>

                  {/* Fiscal row */}
                  <div className="lgr-np-detail-section-label">Fiscal Capacity</div>
                  <div className="lgr-np-town-grid">
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Collection Rate</span>
                      <span className="lgr-np-metric-value">{town.collectionRate}%</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">CT Band D</span>
                      <span className="lgr-np-metric-value">£{town.ctBandD?.toLocaleString()}</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Social Care %</span>
                      <span className="lgr-np-metric-value" style={{ color: (town.socialCareBudgetPct || 0) > 65 ? '#ff453a' : '#e5e5e7' }}>
                        {town.socialCareBudgetPct || '—'}%
                      </span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">CT Rise</span>
                      <span className="lgr-np-metric-value" style={{ color: town.ctRisePct > 5 ? '#ff453a' : '#e5e5e7' }}>
                        {town.ctRisePct}%
                      </span>
                    </div>
                  </div>

                  {/* SEND row */}
                  <div className="lgr-np-detail-section-label">SEND &amp; Education</div>
                  <div className="lgr-np-town-grid">
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">SEND EHCPs</span>
                      <span className="lgr-np-metric-value">{(town.sendEhcps / 1000).toFixed(1)}K</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">DSG Deficit</span>
                      <span className="lgr-np-metric-value" style={{ color: (town.dsgDeficitM || 0) > 20 ? '#ff453a' : '#e5e5e7' }}>
                        {town.dsgDeficitM ? `£${town.dsgDeficitM}M` : 'N/A'}
                      </span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Life Exp Gap</span>
                      <span className="lgr-np-metric-value">{town.lifeExpGapYears ? `${town.lifeExpGapYears} yrs` : '—'}</span>
                    </div>
                    <div className="lgr-np-metric">
                      <span className="lgr-np-metric-label">Social Rented</span>
                      <span className="lgr-np-metric-value">{town.socialRentedPct}%</span>
                    </div>
                  </div>

                  <p className="lgr-np-town-trajectory">{town.trajectory}</p>

                  {town.lessons?.length > 0 && (
                    <div className="lgr-np-town-lessons">
                      <strong>Lessons for Lancashire:</strong>
                      <ul>
                        {town.lessons.map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                    </div>
                  )}

                  {town.capitalisationM > 0 && (
                    <div className="lgr-np-town-alert">
                      <AlertTriangle size={14} />
                      <span>Capitalisation direction: £{town.capitalisationM}M — exceptional financial support</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Control case callout */}
      <div className="lgr-np-control-callout">
        <strong>Why include Barnsley and Wigan?</strong>
        <p>
          These predominantly white post-industrial areas (97% and 95% white respectively) experience
          severe deprivation driven by deindustrialisation — Barnsley ranks 10th worst for education/skills
          deprivation and 15th worst for health deprivation nationally. This demonstrates that <strong>fiscal
          stress and service demand pressure are structural consequences of industrial decline</strong>,
          not products of demographic composition. The same deindustrialisation dynamics that affect
          Lancashire&apos;s Pennine towns apply regardless of ethnic makeup.
        </p>
      </div>

      {/* Lancashire authority similarity scoring */}
      {lancashireAuthorities?.length > 0 && (
        <div className="lgr-np-section">
          <h3><Users size={18} /> Lancashire Authority Similarity Scoring</h3>
          <p className="lgr-np-section-desc">
            Each proposed authority scored against 10 Northern reference towns across 12 socioeconomic
            metrics (deprivation, economics, demographics, fiscal capacity). High Bradford similarity
            indicates elevated fiscal risk trajectory.
          </p>

          <div className="lgr-np-table-wrap">
            <table className="lgr-np-table">
              <thead>
                <tr>
                  <th>Authority</th>
                  <th>Most Similar</th>
                  <th>Bradford Score</th>
                  <th>Trajectory Risk</th>
                  <th>Collection</th>
                </tr>
              </thead>
              <tbody>
                {lancashireAuthorities
                  .sort((a, b) => b.bradfordSimilarity - a.bradfordSimilarity)
                  .map((a, i) => (
                    <tr key={i} className={a.trajectoryRisk === 'high' ? 'lgr-np-row-highlight' : ''}>
                      <td className="lgr-np-auth-name">{a.authority}</td>
                      <td>
                        <span style={{ color: TOWN_COLORS[a.mostSimilarTown] || '#e5e5e7' }}>
                          {a.mostSimilarTown}
                        </span>
                        <span className="lgr-np-score-small"> ({a.similarityScore}%)</span>
                      </td>
                      <td>
                        <div className="lgr-np-bar-wrap">
                          <div className="lgr-np-bar" style={{
                            width: `${a.bradfordSimilarity}%`,
                            background: a.bradfordSimilarity > 70 ? '#ff453a' : a.bradfordSimilarity > 50 ? '#ff9f0a' : '#30d158'
                          }} />
                          <span>{a.bradfordSimilarity}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`lgr-np-risk-badge lgr-np-risk-${a.trajectoryRisk}`}>
                          {a.trajectoryRisk}
                        </span>
                      </td>
                      <td>{a.collectionRate?.toFixed(1) || '—'}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Bradford similarity chart */}
          {authorityCompare.length > 0 && (
            <div className="lgr-np-chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={authorityCompare} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [`${v}%`, 'Bradford Similarity']}
                    labelFormatter={(label) => {
                      const item = authorityCompare.find(a => a.name === label)
                      return item?.fullName || label
                    }}
                  />
                  <Bar dataKey="bradfordSimilarity" name="Bradford Similarity" radius={[6, 6, 0, 0]}>
                    {authorityCompare.map((entry, i) => (
                      <Cell key={i} fill={RISK_COLORS[entry.trajectoryRisk] || '#636366'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Deprivation persistence */}
      {deprivationPersistence && (
        <div className="lgr-np-section">
          <h3><TrendingDown size={18} /> Deprivation Persistence</h3>
          <div className="lgr-np-persistence-cards">
            <div className="lgr-np-persistence-card">
              <span className="lgr-np-persistence-value" style={{ color: '#ff453a' }}>
                {deprivationPersistence.persistencePct}%
              </span>
              <span className="lgr-np-persistence-label">
                of deprived neighbourhoods remain deprived
              </span>
              <span className="lgr-np-persistence-source">{deprivationPersistence.source}</span>
            </div>
            <div className="lgr-np-persistence-card">
              <span className="lgr-np-persistence-value" style={{ color: '#ff9f0a' }}>8%</span>
              <span className="lgr-np-persistence-label">
                probability of improvement when surrounded by other deprived areas
              </span>
              <span className="lgr-np-persistence-source">{deprivationPersistence.sourceAcademic}</span>
            </div>
          </div>

          <div className="lgr-np-nested-warning">
            <AlertTriangle size={16} />
            <div>
              <strong>&ldquo;Nested Deprivation&rdquo; Risk</strong>
              <p>{deprivationPersistence.nestedDeprivationRisk}</p>
            </div>
          </div>
        </div>
      )}

      {/* English LGR Precedent Benchmarks — ALL 8 reorganisations */}
      <div className="lgr-np-section">
        <h3><BookOpen size={18} /> English LGR Reorganisation Precedents</h3>
        <p className="lgr-np-section-desc">
          All {PRECEDENT_DATA.length} completed English reorganisations since 2009, providing the evidence base for
          savings estimates and implementation risk. {precedentBenchmark && <>Lancashire-adjusted central estimate:
          <strong> {precedentBenchmark.savingsPctRange?.central}%</strong> savings.</>}
        </p>

        {/* Summary benchmark cards */}
        {precedentBenchmark && (
          <div className="lgr-np-benchmark-cards">
            <div className="lgr-np-bench-card">
              <span className="lgr-np-bench-label">Savings Range</span>
              <span className="lgr-np-bench-value">
                {precedentBenchmark.savingsPctRange?.low}%–{precedentBenchmark.savingsPctRange?.high}%
              </span>
              <span className="lgr-np-bench-context">
                of net expenditure (central: {precedentBenchmark.savingsPctRange?.central}%)
              </span>
            </div>
            <div className="lgr-np-bench-card">
              <span className="lgr-np-bench-label">Transition Cost</span>
              <span className="lgr-np-bench-value">
                £{precedentBenchmark.transitionCostRangeM?.low}M–£{precedentBenchmark.transitionCostRangeM?.high}M
              </span>
              <span className="lgr-np-bench-context">
                central: £{precedentBenchmark.transitionCostRangeM?.central}M
              </span>
            </div>
            <div className="lgr-np-bench-card">
              <span className="lgr-np-bench-label">Payback Period</span>
              <span className="lgr-np-bench-value">
                {precedentBenchmark.paybackRange?.low}–{precedentBenchmark.paybackRange?.high} years
              </span>
              <span className="lgr-np-bench-context">
                central: {precedentBenchmark.paybackRange?.central} years
              </span>
            </div>
          </div>
        )}

        {/* Full precedent cards — ALL 8 reorganisations */}
        <div className="lgr-np-precedent-cards">
          {PRECEDENT_DATA.map(p => {
            const experience = LGR_PRECEDENT_EXPERIENCES[p.name]
            const isExpanded = expandedPrecedent === p.name
            return (
              <div key={p.name} className={`lgr-np-prec-card${p.onBudget === false ? ' lgr-np-prec-card--warning' : ''}`}>
                <button
                  className="lgr-np-prec-header"
                  onClick={() => setExpandedPrecedent(prev => prev === p.name ? null : p.name)}
                  aria-expanded={isExpanded}
                >
                  <div className="lgr-np-prec-title-row">
                    <strong className="lgr-np-prec-name">{p.name}</strong>
                    <span className="lgr-np-prec-year"><Calendar size={12} /> {p.year}</span>
                    <span className="lgr-np-prec-merge">
                      {p.before} <ArrowRight size={10} /> {p.after} {p.after === 1 ? 'council' : 'councils'}
                    </span>
                    {p.onBudget != null && (
                      <span className={`lgr-np-prec-budget-badge ${p.onBudget ? 'on-budget' : 'over-budget'}`}>
                        {p.onBudget ? <Check size={10} /> : <XIcon size={10} />}
                        {p.onBudget ? 'On budget' : 'Over budget'}
                      </span>
                    )}
                  </div>
                  <div className="lgr-np-prec-stats-mini">
                    <span>{(p.population / 1000).toFixed(0)}K pop</span>
                    {p.savingsPct != null && <span>{p.savingsPct}% savings</span>}
                    {p.annualSavingsM != null && <span>£{p.annualSavingsM}M/yr</span>}
                    <span>{p.monthsTaken} months</span>
                    <span className={`lgr-np-complexity-badge lgr-np-complexity-${p.complexity}`}>
                      {p.complexity}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {isExpanded && (
                  <div className="lgr-np-prec-detail">
                    {/* Key stats grid */}
                    <div className="lgr-np-prec-stats-grid">
                      <div className="lgr-np-metric">
                        <span className="lgr-np-metric-label">Councils Merged</span>
                        <span className="lgr-np-metric-value">{p.before} → {p.after}</span>
                      </div>
                      <div className="lgr-np-metric">
                        <span className="lgr-np-metric-label">Population</span>
                        <span className="lgr-np-metric-value">{(p.population / 1000).toFixed(0)}K</span>
                      </div>
                      {p.transitionCostM != null && (
                        <div className="lgr-np-metric">
                          <span className="lgr-np-metric-label">Transition Cost</span>
                          <span className="lgr-np-metric-value">£{p.transitionCostM}M</span>
                        </div>
                      )}
                      {p.fiveYearSavingsM != null && (
                        <div className="lgr-np-metric">
                          <span className="lgr-np-metric-label">5-Year Savings</span>
                          <span className="lgr-np-metric-value" style={{ color: '#30d158' }}>£{p.fiveYearSavingsM}M</span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {p.notes && <p className="lgr-np-prec-notes">{p.notes}</p>}
                    {p.source && <p className="lgr-np-prec-source">Source: {p.source}</p>}

                    {/* Detailed experience (if available) */}
                    {experience && (
                      <div className="lgr-np-prec-experience">
                        <div className="lgr-np-detail-section-label">Financial Outcome</div>
                        <p className="lgr-np-prec-outcome">{experience.financialOutcome}</p>

                        <div className="lgr-np-detail-section-label">Key Findings</div>
                        <ul className="lgr-np-prec-findings">
                          {experience.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>

                        <div className="lgr-np-detail-section-label">Relevance to Lancashire</div>
                        <p className="lgr-np-prec-relevance">{experience.relevanceToLancashire}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Comparison table — all 8 at a glance */}
        <div className="lgr-np-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="lgr-np-table">
            <thead>
              <tr>
                <th>Reorganisation</th>
                <th>Year</th>
                <th>Merged</th>
                <th>Population</th>
                <th>Savings</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {PRECEDENT_DATA.map((p, i) => (
                <tr key={i} className={p.onBudget === false ? 'lgr-np-row-highlight' : ''}>
                  <td className="lgr-np-auth-name">{p.name}</td>
                  <td>{p.year}</td>
                  <td>{p.before} → {p.after}</td>
                  <td>{(p.population / 1000).toFixed(0)}K</td>
                  <td>{p.savingsPct != null ? `${p.savingsPct}%` : p.annualSavingsM != null ? `£${p.annualSavingsM}M/yr` : '—'}</td>
                  <td>{p.monthsTaken} months</td>
                  <td>
                    {p.onBudget === true && <span style={{ color: '#30d158' }}>✓</span>}
                    {p.onBudget === false && <span style={{ color: '#ff453a' }}>✗</span>}
                    {p.onBudget == null && <span style={{ color: '#8e8e93' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evidence factors */}
      {factors?.length > 0 && (
        <div className="lgr-np-evidence">
          {factors.map((f, i) => (
            <p key={i} className="lgr-np-factor">{f}</p>
          ))}
        </div>
      )}
    </section>
  )
}

export default LGRNorthernPrecedents
