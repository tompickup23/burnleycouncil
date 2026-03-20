import { useMemo } from 'react'
import { formatCurrency } from '../../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Users, PoundSterling, AlertTriangle, TrendingDown } from 'lucide-react'
import './LGRHiddenCosts.css'

/**
 * LGRHiddenCosts — Detailed breakdown of costs ignored in headline LGR figures.
 *
 * Props:
 *   distractionLoss   — output of computeDistractionLoss()
 *   opportunityCost   — output of computeOpportunityCost()
 *   serviceFailureRisk — output of computeServiceFailureRisk()
 */

const DISTRACTION_COLORS = ['#ff453a', '#ff6482', '#ff9f0a', '#bf5af2', '#ffd60a']
const OPPORTUNITY_COLORS = ['#12B6CF', '#64d2ff', '#30d158']

function LGRHiddenCosts({ distractionLoss, opportunityCost, serviceFailureRisk }) {
  const totalHidden = (distractionLoss?.totalDistractionCost || 0) +
    (opportunityCost?.totalOpportunityCost || 0) +
    (serviceFailureRisk?.totalExpectedCost || 0)

  if (totalHidden === 0) return null

  // Distraction chart data
  const distractionChartData = useMemo(() => {
    if (!distractionLoss) return []
    return [
      { name: 'Productivity', value: Math.round((distractionLoss.productivityCost || 0) / 1e6) },
      { name: 'Turnover', value: Math.round((distractionLoss.turnoverCost || 0) / 1e6) },
      { name: 'Knowledge', value: Math.round((distractionLoss.knowledgeLossCost || 0) / 1e6) },
      { name: 'Senior FTE', value: Math.round((distractionLoss.seniorFTECost || 0) / 1e6) },
      { name: 'Paralysis', value: Math.round((distractionLoss.decisionParalysis || 0) / 1e6) },
    ].filter(d => d.value > 0)
  }, [distractionLoss])

  // Opportunity cost chart data
  const opportunityChartData = useMemo(() => {
    if (!opportunityCost) return []
    return [
      { name: 'Financial', value: Math.round((opportunityCost.financialOpportunityCost || 0) / 1e6) },
      { name: 'CT Foregone', value: Math.round((opportunityCost.ctForeGone || 0) / 1e6) },
      { name: 'Capital Delay', value: Math.round((opportunityCost.capitalDelay || 0) / 1e6) },
    ].filter(d => d.value > 0)
  }, [opportunityCost])

  return (
    <section className="lgr-hidden-costs" aria-label="Hidden Costs of Reorganisation">
      <p className="section-desc">
        These costs are real but absent from every published LGR business case. They represent the price
        paid in diverted attention, foregone investment, and elevated service risk during the 3-year transition.
      </p>

      {/* Total banner */}
      <div className="hc-total-banner">
        <AlertTriangle size={20} />
        <div>
          <span className="hc-total-label">Total Hidden Costs</span>
          <span className="hc-total-value">{formatCurrency(totalHidden, true)}</span>
        </div>
      </div>

      {/* A. Distraction & Productivity Loss */}
      {distractionLoss && (
        <div className="hc-section">
          <h3><Users size={18} /> Distraction &amp; Productivity Loss</h3>
          <p className="hc-section-desc">
            Senior leadership diverted from service delivery. Not captured in transition budgets.
          </p>

          <div className="hc-stat-grid">
            <div className="hc-stat-card">
              <span className="hc-stat-label">Productivity Loss</span>
              <span className="hc-stat-value">{formatCurrency(distractionLoss.productivityCost, true)}</span>
              <span className="hc-stat-note">17.5% of central services × 3yr</span>
            </div>
            <div className="hc-stat-card">
              <span className="hc-stat-label">Staff Turnover</span>
              <span className="hc-stat-value">{formatCurrency(distractionLoss.turnoverCost, true)}</span>
              <span className="hc-stat-note">{(distractionLoss.additionalLeavers || 0).toLocaleString()} additional leavers</span>
            </div>
            <div className="hc-stat-card">
              <span className="hc-stat-label">Knowledge Drain</span>
              <span className="hc-stat-value">{formatCurrency(distractionLoss.knowledgeLossCost, true)}</span>
              <span className="hc-stat-note">{(distractionLoss.keyPersonLosses || 0).toLocaleString()} key person losses</span>
            </div>
            <div className="hc-stat-card">
              <span className="hc-stat-label">Decision Paralysis</span>
              <span className="hc-stat-value">{formatCurrency(distractionLoss.decisionParalysis, true)}</span>
              <span className="hc-stat-note">Deferred procurement &amp; contracts</span>
            </div>
          </div>

          {distractionChartData.length > 0 && (
            <div className="hc-chart-card">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distractionChartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v}M`, 'Cost']} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} {...CHART_ANIMATION}>
                    {distractionChartData.map((_, i) => <Cell key={i} fill={DISTRACTION_COLORS[i]} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {distractionLoss.factors?.length > 0 && (
            <ul className="hc-factors-list">
              {distractionLoss.factors.map((f, i) => (
                <li key={i}><span className="hc-bullet">&bull;</span>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* B. Opportunity Cost */}
      {opportunityCost && (
        <div className="hc-section">
          <h3><PoundSterling size={18} /> Opportunity Cost</h3>
          <p className="hc-section-desc">
            What the transition investment could have achieved if deployed for service improvement instead.
          </p>

          <div className="hc-stat-grid">
            <div className="hc-stat-card">
              <span className="hc-stat-label">Financial Cost</span>
              <span className="hc-stat-value">{formatCurrency(opportunityCost.financialOpportunityCost, true)}</span>
              <span className="hc-stat-note">Green Book 3.5% rate</span>
            </div>
            <div className="hc-stat-card">
              <span className="hc-stat-label">CT Rise Foregone</span>
              <span className="hc-stat-value">{formatCurrency(opportunityCost.ctForeGone, true)}</span>
              <span className="hc-stat-note">Political pressure to freeze</span>
            </div>
            <div className="hc-stat-card">
              <span className="hc-stat-label">Capital Delay</span>
              <span className="hc-stat-value">{formatCurrency(opportunityCost.capitalDelay, true)}</span>
              <span className="hc-stat-note">Projects paused during transition</span>
            </div>
          </div>

          {opportunityChartData.length > 0 && (
            <div className="hc-chart-card">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={opportunityChartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
                  <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v}M`, 'Cost']} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} {...CHART_ANIMATION}>
                    {opportunityChartData.map((_, i) => <Cell key={i} fill={OPPORTUNITY_COLORS[i]} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {opportunityCost.factors?.length > 0 && (
            <ul className="hc-factors-list">
              {opportunityCost.factors.map((f, i) => (
                <li key={i}><span className="hc-bullet">&bull;</span>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* C. Service Failure Risk Matrix */}
      {serviceFailureRisk && (
        <div className="hc-section">
          <h3><TrendingDown size={18} /> Service Failure Risk</h3>
          <p className="hc-section-desc">
            Probability-weighted expected costs of critical service failures during transition.
            These risks are not independent — one failure increases the likelihood of others.
          </p>

          <div className="hc-risk-table-wrap">
            <table className="hc-risk-table" role="table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col" className="hc-col-num">Probability</th>
                  <th scope="col" className="hc-col-num">Cost if Fails</th>
                  <th scope="col" className="hc-col-num">Expected Cost</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {(serviceFailureRisk.risks || []).map((r, i) => (
                  <tr key={i}>
                    <td className="hc-service-name">{r.service}</td>
                    <td className="hc-col-num" style={{ color: r.probability >= 0.15 ? '#ff453a' : r.probability >= 0.10 ? '#ff9f0a' : '#ffd60a' }}>
                      {(r.probability * 100).toFixed(0)}%
                    </td>
                    <td className="hc-col-num">{formatCurrency(r.costIfFails, true)}</td>
                    <td className="hc-col-num" style={{ color: '#ff453a', fontWeight: 600 }}>
                      {formatCurrency(r.expectedCost, true)}
                    </td>
                    <td className="hc-evidence-cell">{r.evidence}</td>
                  </tr>
                ))}
                {serviceFailureRisk.correlationPenalty > 0 && (
                  <tr className="hc-correlation-row">
                    <td className="hc-service-name" colSpan={3}>Correlation Penalty (+15%)</td>
                    <td className="hc-col-num" style={{ color: '#ff453a', fontWeight: 600 }}>
                      {formatCurrency(serviceFailureRisk.correlationPenalty, true)}
                    </td>
                    <td className="hc-evidence-cell">Failures cascade: children&apos;s &rarr; ASC &rarr; financial</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="hc-service-name" colSpan={3}><strong>Total Expected Cost</strong></td>
                  <td className="hc-col-num" style={{ color: '#ff453a', fontWeight: 700, fontSize: '1rem' }}>
                    {formatCurrency(serviceFailureRisk.totalExpectedCost, true)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

export default LGRHiddenCosts
