import { useMemo } from 'react'
import { formatCurrency } from '../../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_ANIMATION } from '../../utils/constants'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, BarChart, Bar, Cell } from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown, Scale, Clock } from 'lucide-react'
import './LGRCounterfactual.css'

/**
 * LGRCounterfactual — Status Quo vs LGR side-by-side comparison.
 * The climax section: shows the honest counterfactual analysis.
 *
 * Props:
 *   comparison    — output of computeCounterfactualComparison()
 *   statusQuoSavings — output of computeStatusQuoSavings()
 *   cashflowData — raw LGR cashflow array
 */

function LGRCounterfactual({ comparison, statusQuoSavings, cashflowData }) {
  if (!comparison || !comparison.lgrPath?.length) return null

  // Dual-line chart data — merge LGR and SQ paths
  const chartData = useMemo(() => {
    return comparison.lgrPath.map((lgr, i) => {
      const sq = comparison.statusQuoPath[i] || {}
      return {
        year: lgr.year,
        lgrCumulative: Math.round((lgr.cumulative || 0) / 1e6),
        sqCumulative: Math.round((sq.cumulative || 0) / 1e6),
        lgrNet: Math.round((lgr.adjustedNet || 0) / 1e6),
        sqNet: Math.round((sq.savings || 0) / 1e6),
      }
    })
  }, [comparison])

  // Hidden costs breakdown for stacked bar
  const hiddenCostsData = useMemo(() => {
    if (!comparison.hiddenCosts) return []
    return [
      { name: 'Distraction', value: Math.round((comparison.hiddenCosts.distraction || 0) / 1e6), color: '#ff453a' },
      { name: 'Opportunity', value: Math.round((comparison.hiddenCosts.opportunity || 0) / 1e6), color: '#ff9f0a' },
      { name: 'Service Failure', value: Math.round((comparison.hiddenCosts.serviceFailure || 0) / 1e6), color: '#ffd60a' },
    ].filter(d => d.value > 0)
  }, [comparison])

  // Determine verdict styling
  const verdictClass = comparison.netIncrementalBenefit < 0 ? 'verdict-negative'
    : comparison.netIncrementalBenefit < 50000000 ? 'verdict-marginal'
    : 'verdict-positive'

  const verdictIcon = comparison.netIncrementalBenefit < 0
    ? <TrendingDown size={24} />
    : comparison.netIncrementalBenefit < 50000000
    ? <Scale size={24} />
    : <TrendingUp size={24} />

  return (
    <section className="lgr-counterfactual" aria-label="Status Quo vs LGR Comparison">
      <p className="section-desc">
        What happens if Lancashire keeps the current two-tier structure and pursues efficiency through shared services
        instead of reorganisation? This counterfactual comparison includes hidden costs that headline LGR figures ignore.
      </p>

      {/* Verdict banner */}
      <div className={`cf-verdict ${verdictClass}`} role="alert">
        {verdictIcon}
        <div className="cf-verdict-content">
          <strong>Verdict</strong>
          <p>{comparison.verdict}</p>
        </div>
      </div>

      {/* StatCards */}
      <div className="cf-stat-grid">
        <div className="cf-stat-card">
          <span className="cf-stat-label">LGR 10yr NPV</span>
          <span className="cf-stat-value" style={{ color: comparison.lgrNPV >= 0 ? '#30d158' : '#ff453a' }}>
            {formatCurrency(comparison.lgrNPV, true)}
          </span>
          <span className="cf-stat-note">After hidden costs</span>
        </div>
        <div className="cf-stat-card">
          <span className="cf-stat-label">Status Quo 10yr NPV</span>
          <span className="cf-stat-value" style={{ color: '#12B6CF' }}>
            {formatCurrency(comparison.sqNPV, true)}
          </span>
          <span className="cf-stat-note">Organic efficiency + shared services</span>
        </div>
        <div className="cf-stat-card">
          <span className="cf-stat-label">Net LGR Benefit</span>
          <span className="cf-stat-value" style={{ color: comparison.netIncrementalBenefit >= 0 ? '#30d158' : '#ff453a' }}>
            {comparison.netIncrementalBenefit >= 0 ? '+' : ''}{formatCurrency(comparison.netIncrementalBenefit, true)}
          </span>
          <span className="cf-stat-note">{comparison.netIncrementalBenefit >= 0 ? 'LGR exceeds status quo' : 'Status quo is better'}</span>
        </div>
        <div className="cf-stat-card">
          <span className="cf-stat-label">LGR Breakeven</span>
          <span className="cf-stat-value" style={{ color: comparison.breakEvenYear ? '#ff9f0a' : '#ff453a' }}>
            {comparison.breakEvenYear || 'Never'}
          </span>
          <span className="cf-stat-note">{comparison.breakEvenYear ? 'Year LGR exceeds status quo' : 'Within modelled period'}</span>
        </div>
      </div>

      {/* Dual-line cumulative comparison chart */}
      <div className="cf-chart-card">
        <h3>Cumulative Savings: LGR Path vs Status Quo</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
            <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v, name) => [`£${v}M`, name === 'lgrCumulative' ? 'LGR Path' : 'Status Quo']}
            />
            <Legend />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            <Line
              type="monotone" dataKey="sqCumulative" name="Status Quo"
              stroke="#12B6CF" strokeWidth={2.5} dot={{ fill: '#12B6CF', r: 3 }}
              {...CHART_ANIMATION}
            />
            <Line
              type="monotone" dataKey="lgrCumulative" name="LGR Path"
              stroke="#ff453a" strokeWidth={2.5} dot={{ fill: '#ff453a', r: 3 }}
              strokeDasharray="8 4"
              {...CHART_ANIMATION}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Hidden costs breakdown */}
      {hiddenCostsData.length > 0 && (
        <div className="cf-hidden-costs-section">
          <h3>
            <AlertTriangle size={18} />
            Hidden Costs Ignored in Headline Figures
          </h3>
          <div className="cf-hidden-costs-total">
            Total: <strong>{formatCurrency(comparison.hiddenCosts.total, true)}</strong>
          </div>
          <div className="cf-chart-card">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hiddenCostsData} layout="vertical" margin={{ top: 10, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_TICK_STYLE} tickFormatter={v => `£${v}M`} />
                <YAxis type="category" dataKey="name" tick={AXIS_TICK_STYLE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`£${v}M`, 'Cost']} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} {...CHART_ANIMATION}>
                  {hiddenCostsData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Evidence factors */}
      {comparison.factors?.length > 0 && (
        <div className="cf-evidence">
          <h3>Analysis Methodology</h3>
          <ul className="cf-factors-list">
            {comparison.factors.map((f, i) => (
              <li key={i}>
                <span className="cf-bullet">&bull;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Status quo detail */}
      {statusQuoSavings?.factors?.length > 0 && (
        <div className="cf-evidence">
          <h3>Status Quo Evidence Base</h3>
          <ul className="cf-factors-list">
            {statusQuoSavings.factors.map((f, i) => (
              <li key={i}>
                <span className="cf-bullet">&bull;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default LGRCounterfactual
