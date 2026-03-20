import { useMemo } from 'react'
import { formatCurrency } from '../../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../../utils/constants'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'
import { Shield, AlertTriangle, ArrowRight } from 'lucide-react'
import WaterfallChart from '../ui/WaterfallChart'
import './LGRRiskAdjusted.css'

/**
 * LGRRiskAdjusted — Risk-adjusted financial model integrating ALL risk factors.
 *
 * Props:
 *   riskAdjusted       — output of computeRiskAdjustedCashflow()
 *   baseCashflow        — raw cashflow array from computeCashflow()
 *   deprivationAdjusted — deprivation adjustment result (for annotations)
 *   ccaAdjustment       — CCA adjustment result (for annotations)
 */

function LGRRiskAdjusted({ riskAdjusted, baseCashflow, deprivationAdjusted, ccaAdjustment }) {
  if (!riskAdjusted?.cashflow?.length) return null

  const baseNPV = baseCashflow?.[baseCashflow.length - 1]?.npv || 0
  const adjustedNPV = riskAdjusted.npv || 0
  const npvGap = baseNPV - adjustedNPV

  // Waterfall data — shows progressive reduction from headline to risk-adjusted
  const waterfallData = useMemo(() => {
    const adj = riskAdjusted.adjustments || {}
    const items = [
      { name: 'Headline NPV', value: baseNPV, type: 'income' },
    ]

    // DOGE realisation reduction
    if (adj.realisationRate && adj.realisationRate < 0.75) {
      const realisationImpact = -Math.round(baseNPV * (1 - adj.realisationRate / 0.75) * 0.5)
      if (realisationImpact !== 0) items.push({ name: 'DOGE Realisation', value: realisationImpact, type: 'expense' })
    }

    // Deprivation multiplier
    if (adj.deprivationMultiplier && adj.deprivationMultiplier < 1.0) {
      const depImpact = -Math.round(baseNPV * (1 - adj.deprivationMultiplier) * 0.3)
      if (depImpact !== 0) items.push({ name: 'Deprivation', value: depImpact, type: 'expense' })
    }

    // Timeline probability
    if (adj.timelineProbability && adj.timelineProbability < 0.5) {
      const timelineImpact = -Math.round(baseNPV * (1 - adj.timelineProbability) * 0.15)
      if (timelineImpact !== 0) items.push({ name: 'Timeline Risk', value: timelineImpact, type: 'expense' })
    }

    // Distraction
    if (adj.distractionLoss > 0) {
      items.push({ name: 'Distraction', value: -adj.distractionLoss, type: 'expense' })
    }

    // Service failure
    if (adj.serviceFailureCost > 0) {
      items.push({ name: 'Service Failure', value: -adj.serviceFailureCost, type: 'expense' })
    }

    items.push({ name: 'Risk-Adjusted', value: adjustedNPV, type: 'total' })

    return items
  }, [riskAdjusted, baseNPV, adjustedNPV])

  // Dual-line comparison data
  const comparisonData = useMemo(() => {
    if (!baseCashflow?.length) return []
    return baseCashflow.map((base, i) => {
      const adj = riskAdjusted.cashflow[i] || {}
      return {
        year: base.year,
        headline: Math.round((base.cumulative || 0) / 1e6),
        riskAdjusted: Math.round((adj.cumulative || 0) / 1e6),
      }
    })
  }, [baseCashflow, riskAdjusted])

  // Headline breakeven
  const headlineBreakeven = useMemo(() => {
    if (!baseCashflow?.length) return null
    for (const y of baseCashflow) {
      if (y.cumulative > 0) return y.year
    }
    return null
  }, [baseCashflow])

  return (
    <section className="lgr-risk-adjusted" aria-label="Risk-Adjusted Financial Model">
      <p className="section-desc">
        The headline LGR cashflow assumes 75% savings realisation, on-time delivery, zero distraction,
        and no service failures. This model integrates all identified risks into a single honest projection.
      </p>

      {/* StatCards */}
      <div className="ra-stat-grid">
        <div className="ra-stat-card">
          <span className="ra-stat-label">Risk-Adjusted NPV</span>
          <span className="ra-stat-value" style={{ color: adjustedNPV >= 0 ? '#30d158' : '#ff453a' }}>
            {formatCurrency(adjustedNPV, true)}
          </span>
        </div>
        <div className="ra-stat-card">
          <span className="ra-stat-label">Risk-Adjusted Breakeven</span>
          <span className="ra-stat-value" style={{ color: riskAdjusted.breakeven ? '#ff9f0a' : '#ff453a' }}>
            {riskAdjusted.breakeven || 'Never'}
          </span>
        </div>
        <div className="ra-stat-card">
          <span className="ra-stat-label">Headline vs Adjusted Gap</span>
          <span className="ra-stat-value" style={{ color: '#ff453a' }}>
            -{formatCurrency(npvGap, true)}
          </span>
          <span className="ra-stat-note">Lost to risk adjustments</span>
        </div>
      </div>

      {/* Waterfall chart */}
      <div className="ra-chart-card">
        <h3>NPV Adjustment Waterfall</h3>
        <p className="ra-chart-desc">How headline savings erode when real-world risks are factored in.</p>
        <WaterfallChart data={waterfallData} height={320} />
      </div>

      {/* Dual-line comparison */}
      {comparisonData.length > 0 && (
        <div className="ra-chart-card">
          <h3>Cumulative Cashflow: Headline vs Risk-Adjusted</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name) => [`£${v}M`, name === 'headline' ? 'Headline' : 'Risk-Adjusted']}
              />
              <Legend />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
              <Line
                type="monotone" dataKey="headline" name="Headline"
                stroke="#30d158" strokeWidth={2.5} dot={{ fill: '#30d158', r: 3 }}
                {...CHART_ANIMATION}
              />
              <Line
                type="monotone" dataKey="riskAdjusted" name="Risk-Adjusted"
                stroke="#ff453a" strokeWidth={2.5} dot={{ fill: '#ff453a', r: 3 }}
                strokeDasharray="8 4"
                {...CHART_ANIMATION}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Adjustment annotations */}
      <div className="ra-annotations">
        <h3><Shield size={18} /> Applied Adjustments</h3>
        <div className="ra-annotation-grid">
          {riskAdjusted.adjustments?.realisationRate != null && (
            <div className="ra-annotation-card">
              <span className="ra-anno-label">Savings Realisation</span>
              <span className="ra-anno-value">{(riskAdjusted.adjustments.realisationRate * 100).toFixed(0)}%</span>
              <span className="ra-anno-note">DOGE governance-adjusted</span>
            </div>
          )}
          {riskAdjusted.adjustments?.deprivationMultiplier != null && riskAdjusted.adjustments.deprivationMultiplier < 1.0 && (
            <div className="ra-annotation-card">
              <span className="ra-anno-label">Deprivation Multiplier</span>
              <span className="ra-anno-value">&times;{riskAdjusted.adjustments.deprivationMultiplier.toFixed(2)}</span>
              <span className="ra-anno-note">
                <a href="#lgr-deprivation" className="ra-cross-ref">See Deprivation section <ArrowRight size={12} /></a>
              </span>
            </div>
          )}
          {riskAdjusted.adjustments?.timelineProbability != null && (
            <div className="ra-annotation-card">
              <span className="ra-anno-label">On-Time Probability</span>
              <span className="ra-anno-value">{(riskAdjusted.adjustments.timelineProbability * 100).toFixed(0)}%</span>
              <span className="ra-anno-note">
                <a href="#lgr-timeline-risk" className="ra-cross-ref">See Timeline Risk <ArrowRight size={12} /></a>
              </span>
            </div>
          )}
          {riskAdjusted.adjustments?.distractionLoss > 0 && (
            <div className="ra-annotation-card">
              <span className="ra-anno-label">Distraction Loss</span>
              <span className="ra-anno-value">{formatCurrency(riskAdjusted.adjustments.distractionLoss, true)}</span>
              <span className="ra-anno-note">
                <a href="#lgr-hidden-costs" className="ra-cross-ref">See Hidden Costs <ArrowRight size={12} /></a>
              </span>
            </div>
          )}
          {riskAdjusted.adjustments?.serviceFailureCost > 0 && (
            <div className="ra-annotation-card">
              <span className="ra-anno-label">Service Failure Risk</span>
              <span className="ra-anno-value">{formatCurrency(riskAdjusted.adjustments.serviceFailureCost, true)}</span>
              <span className="ra-anno-note">Probability-weighted expected cost</span>
            </div>
          )}
        </div>
      </div>

      {/* Breakeven comparison */}
      {headlineBreakeven && (
        <div className="ra-breakeven-compare">
          <AlertTriangle size={16} />
          <span>
            Headline breakeven: <strong>{headlineBreakeven}</strong>
            {riskAdjusted.breakeven
              ? <> &rarr; Risk-adjusted: <strong style={{ color: '#ff453a' }}>{riskAdjusted.breakeven}</strong></>
              : <> &rarr; Risk-adjusted: <strong style={{ color: '#ff453a' }}>Never reaches breakeven</strong></>
            }
          </span>
        </div>
      )}

      {/* Evidence factors */}
      {riskAdjusted.factors?.length > 0 && (
        <div className="ra-evidence">
          <ul className="ra-factors-list">
            {riskAdjusted.factors.map((f, i) => (
              <li key={i}><span className="ra-bullet">&bull;</span>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default LGRRiskAdjusted
