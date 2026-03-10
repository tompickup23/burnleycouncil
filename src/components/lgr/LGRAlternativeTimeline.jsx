import { useMemo, useState } from 'react'
import { Clock, AlertTriangle, CheckCircle, ArrowRight, TrendingUp, FileText, Landmark, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { LGA_SEQUENCING_LETTER, LGR_PRECEDENT_EXPERIENCES } from '../../utils/lgrModel'
import './LGRAlternativeTimeline.css'

/**
 * LGRAlternativeTimeline — Side-by-side comparison of government vs AI DOGE
 * proposed timeline with evidence from precedents, LGA sequencing letter,
 * and qualitative lessons from completed reorganisations.
 *
 * Props:
 *   alternativeTimeline — from computeAlternativeTimeline()
 *   serviceRisks — from computeServiceContinuityRisk()
 */

function LGRAlternativeTimeline({ alternativeTimeline, serviceRisks }) {
  const [expandedPrecedent, setExpandedPrecedent] = useState(null)

  // All hooks must be called before conditional returns (React rules of hooks)
  const ganttData = useMemo(() => {
    if (!alternativeTimeline) return []
    return alternativeTimeline.workstreams.map(w => ({
      name: w.name.replace(/&/g, '&').length > 20 ? w.name.slice(0, 18) + '...' : w.name,
      fullName: w.name,
      minMonths: w.minMonths,
      idealMonths: w.idealMonths,
      gap: w.idealMonths - w.minMonths,
      evidence: w.evidence,
    }))
  }, [alternativeTimeline])

  const precedentCompare = useMemo(() => {
    if (!alternativeTimeline) return []
    const { government, alternative, precedentAvgMonths, criticalPath } = alternativeTimeline
    return [
      { name: 'Govt Plan', months: government.months, fill: '#ff453a' },
      { name: 'AI DOGE', months: alternative.months, fill: '#30d158' },
      { name: 'Precedent Avg', months: Math.round(precedentAvgMonths), fill: '#12B6CF' },
      { name: 'Critical Path', months: criticalPath, fill: '#ff9f0a' },
    ]
  }, [alternativeTimeline])

  if (!alternativeTimeline) return null

  const { government, alternative, workstreams, criticalPath, shortfall,
          precedentAvgMonths, riskComparison, factors } = alternativeTimeline

  const govRiskColor = government.riskRating === 'critical' ? '#ff453a'
    : government.riskRating === 'high' ? '#ff9f0a' : '#ffd60a'
  const altRiskColor = alternative.riskRating === 'low' ? '#30d158'
    : alternative.riskRating === 'medium' ? '#ffd60a' : '#ff9f0a'

  return (
    <section className="lgr-alt" aria-label="Alternative Timeline">
      <h2><Clock size={20} /> Alternative Timeline Proposal</h2>
      <p className="lgr-alt-intro">
        Evidence-based timeline analysis. The government proposes 22 months — precedent data suggests
        30 months minimum for Lancashire&apos;s complexity.
      </p>

      {/* Side-by-side comparison cards */}
      <div className="lgr-alt-compare">
        <div className="lgr-alt-card lgr-alt-card-govt">
          <div className="lgr-alt-card-header">
            <AlertTriangle size={18} style={{ color: govRiskColor }} />
            <span>Government Timeline</span>
          </div>
          <div className="lgr-alt-card-body">
            <div className="lgr-alt-stat">
              <span className="lgr-alt-stat-value" style={{ color: govRiskColor }}>{government.months} months</span>
              <span className="lgr-alt-stat-label">Decision to vesting</span>
            </div>
            <div className="lgr-alt-dates">
              <div><strong>Shadow elections:</strong> May 2027</div>
              <div><strong>Vesting day:</strong> April 2028</div>
            </div>
            <div className="lgr-alt-probability">
              <span className="lgr-alt-prob-value" style={{ color: govRiskColor }}>{government.onTimeProbability}%</span>
              <span className="lgr-alt-prob-label">on-time probability</span>
            </div>
            <span className={`lgr-alt-risk-badge lgr-alt-risk-${government.riskRating}`}>
              {government.riskRating} risk
            </span>
          </div>
        </div>

        <div className="lgr-alt-arrow"><ArrowRight size={24} /></div>

        <div className="lgr-alt-card lgr-alt-card-proposed">
          <div className="lgr-alt-card-header">
            <CheckCircle size={18} style={{ color: altRiskColor }} />
            <span>AI DOGE Proposed</span>
          </div>
          <div className="lgr-alt-card-body">
            <div className="lgr-alt-stat">
              <span className="lgr-alt-stat-value" style={{ color: altRiskColor }}>{alternative.months} months</span>
              <span className="lgr-alt-stat-label">Decision to vesting</span>
            </div>
            <div className="lgr-alt-dates">
              <div><strong>Shadow elections:</strong> May 2028</div>
              <div><strong>Vesting day:</strong> April 2029</div>
            </div>
            <div className="lgr-alt-probability">
              <span className="lgr-alt-prob-value" style={{ color: altRiskColor }}>{alternative.onTimeProbability}%</span>
              <span className="lgr-alt-prob-label">on-time probability</span>
            </div>
            <span className={`lgr-alt-risk-badge lgr-alt-risk-${alternative.riskRating}`}>
              {alternative.riskRating} risk
            </span>
          </div>
        </div>
      </div>

      {/* Critical path Gantt */}
      <div className="lgr-alt-section">
        <h3>Critical Path Analysis</h3>
        <p className="lgr-alt-section-desc">
          Minimum and ideal durations for each workstream. The longest workstream defines the critical path.
        </p>
        <div className="lgr-alt-chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ganttData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `${v}mo`} domain={[0, 36]} />
              <YAxis dataKey="name" type="category" tick={AXIS_TICK_STYLE} width={130} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, props) => {
                  const item = props.payload
                  if (name === 'minMonths') return [`${v} months (minimum)`, 'Minimum']
                  return [`${v} months (buffer)`, 'Ideal buffer']
                }}
              />
              <ReferenceLine x={government.months} stroke="#ff453a" strokeDasharray="5 3" label={{ value: 'Govt deadline', fill: '#ff453a', fontSize: 11 }} />
              <Bar dataKey="minMonths" stackId="a" fill="#12B6CF" radius={[0, 0, 0, 0]} />
              <Bar dataKey="gap" stackId="a" fill="rgba(18, 182, 207, 0.3)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Precedent comparison */}
      <div className="lgr-alt-section">
        <h3><TrendingUp size={18} /> Timeline Comparison</h3>
        <div className="lgr-alt-chart-wrap">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={precedentCompare} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `${v}mo`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v) => [`${v} months`, 'Duration']}
              />
              <Bar dataKey="months" radius={[6, 6, 0, 0]}>
                {precedentCompare.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost of delay vs rushing */}
      <div className="lgr-alt-section">
        <h3>Cost of Delay vs Cost of Rushing</h3>
        <div className="lgr-alt-cost-cards">
          <div className="lgr-alt-cost-card lgr-alt-cost-rush">
            <span className="lgr-alt-cost-label">Cost of Rushing</span>
            <span className="lgr-alt-cost-value" style={{ color: '#ff453a' }}>
              ~{riskComparison.rushOverrunPct * 100}%
            </span>
            <span className="lgr-alt-cost-desc">median transition cost overrun</span>
            <span className="lgr-alt-cost-source">Grant Thornton 2023</span>
          </div>
          <div className="lgr-alt-cost-card">
            <span className="lgr-alt-cost-label">Cost of 12-Month Delay</span>
            <span className="lgr-alt-cost-value" style={{ color: '#ff9f0a' }}>
              ~£{riskComparison.delayCostM}M
            </span>
            <span className="lgr-alt-cost-desc">foregone annual savings</span>
            <span className="lgr-alt-cost-source">Based on central savings estimate</span>
          </div>
          <div className="lgr-alt-cost-card">
            <span className="lgr-alt-cost-label">Net Benefit of Extension</span>
            <span className="lgr-alt-cost-value" style={{ color: riskComparison.netBenefitOfDelay > 0 ? '#30d158' : '#ff453a' }}>
              £{Math.abs(riskComparison.netBenefitOfDelay)}M
            </span>
            <span className="lgr-alt-cost-desc">
              {riskComparison.netBenefitOfDelay > 0 ? 'net savings from avoided overruns' : 'net cost'}
            </span>
            <span className="lgr-alt-cost-source">Overrun avoided minus foregone savings</span>
          </div>
        </div>
      </div>

      {/* LGA Sequencing Letter */}
      <div className="lgr-alt-section">
        <h3><FileText size={18} /> LGA Sequencing &amp; Risk Letter</h3>
        <p className="lgr-alt-section-desc">
          On {LGA_SEQUENCING_LETTER.date}, {LGA_SEQUENCING_LETTER.author} wrote to the Secretary of State
          warning that the government&apos;s LGR programme is unprecedented in scale and timeline.
        </p>
        <div className="lgr-alt-lga-stats">
          <div className="lgr-alt-lga-stat">
            <span className="lgr-alt-lga-stat-value" style={{ color: '#ff453a' }}>~{LGA_SEQUENCING_LETTER.keyStats.areasReorganising}</span>
            <span className="lgr-alt-lga-stat-label">areas reorganising</span>
          </div>
          <div className="lgr-alt-lga-stat">
            <span className="lgr-alt-lga-stat-value" style={{ color: '#ff9f0a' }}>{(LGA_SEQUENCING_LETTER.keyStats.residentsAffected / 1000000)}M</span>
            <span className="lgr-alt-lga-stat-label">residents affected</span>
          </div>
          <div className="lgr-alt-lga-stat">
            <span className="lgr-alt-lga-stat-value" style={{ color: '#12B6CF' }}>~{LGA_SEQUENCING_LETTER.keyStats.safeReorgPerYear}/yr</span>
            <span className="lgr-alt-lga-stat-label">safe maximum (Rowsell)</span>
          </div>
          <div className="lgr-alt-lga-stat">
            <span className="lgr-alt-lga-stat-value" style={{ color: '#30d158' }}>£{LGA_SEQUENCING_LETTER.keyStats.capacityFundingM}M</span>
            <span className="lgr-alt-lga-stat-label">capacity funding</span>
          </div>
        </div>
        <div className="lgr-alt-lga-arguments">
          <strong>Key Arguments</strong>
          <ul>
            {LGA_SEQUENCING_LETTER.keyArguments.map((arg, i) => (
              <li key={i}>{arg}</li>
            ))}
          </ul>
        </div>
        <div className="lgr-alt-lga-requests">
          <strong>Formal Requests to Secretary of State</strong>
          <ol>
            {LGA_SEQUENCING_LETTER.requests.map((req, i) => (
              <li key={i}>{req}</li>
            ))}
          </ol>
        </div>
        <p className="lgr-alt-lga-source">
          Source: <a href={LGA_SEQUENCING_LETTER.source} target="_blank" rel="noopener noreferrer">
            LGA letter, {LGA_SEQUENCING_LETTER.date}
          </a>
        </p>
      </div>

      {/* LGR Precedent Experiences */}
      <div className="lgr-alt-section">
        <h3><Landmark size={18} /> LGR Precedent Experiences</h3>
        <p className="lgr-alt-section-desc">
          Qualitative lessons from completed English reorganisations — what actually happened vs what was planned.
        </p>
        <div className="lgr-alt-precedents">
          {Object.entries(LGR_PRECEDENT_EXPERIENCES).map(([name, exp]) => (
            <div key={name} className="lgr-alt-precedent-card">
              <button
                className="lgr-alt-precedent-header"
                onClick={() => setExpandedPrecedent(prev => prev === name ? null : name)}
                aria-expanded={expandedPrecedent === name}
              >
                <div className="lgr-alt-precedent-title">
                  <strong>{name}</strong>
                  <span className="lgr-alt-precedent-meta">
                    {exp.merged} councils merged &middot; {(exp.population / 1000).toFixed(0)}K pop &middot; {exp.vestingDay.slice(0, 4)}
                  </span>
                </div>
                {expandedPrecedent === name ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <div className="lgr-alt-precedent-outcome">
                {exp.financialOutcome}
              </div>
              {expandedPrecedent === name && (
                <div className="lgr-alt-precedent-detail">
                  <strong>Key Findings</strong>
                  <ul>
                    {exp.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  <div className="lgr-alt-precedent-relevance">
                    <strong>Relevance to Lancashire:</strong> {exp.relevanceToLancashire}
                  </div>
                  <span className="lgr-alt-precedent-source">{exp.source}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Evidence basis */}
      <div className="lgr-alt-evidence">
        {factors.map((f, i) => (
          <p key={i} className="lgr-alt-factor">{f}</p>
        ))}
      </div>
    </section>
  )
}

export default LGRAlternativeTimeline
