/**
 * LGRDeprivationMap — Deprivation concentration analysis per LGR authority.
 *
 * Shows per-authority deprivation comparison (bar chart: avg IMD, % wards in decile 1-2),
 * and deprivation-adjusted savings calculation using adjustSavingsForDeprivation from lgrModel.
 *
 * Props:
 *   deprivation {object}      — deprivation data (ward-level or summary per authority)
 *   fiscalProfile {array}     — computeDemographicFiscalProfile() result for selectedModel
 *   selectedModel {string}    — current LGR model ID (e.g. 'two_unitary')
 *   grossSavings {number}     — gross annual savings for the selected model (optional)
 */
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { AlertTriangle, TrendingDown, MapPin } from 'lucide-react'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE } from '../../utils/constants'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/format'
import { adjustSavingsForDeprivation } from '../../utils/lgrModel'
import './LGRDeprivationMap.css'

const AUTH_COLORS = ['#12B6CF', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#64d2ff']

/** Classify IMD score to severity color. */
function imdColor(score) {
  if (score > 35) return '#ff453a'
  if (score > 25) return '#ff9f0a'
  if (score > 15) return '#ffd60a'
  return '#30d158'
}

/** Build per-authority deprivation summary from fiscal profile and deprivation data. */
function buildAuthorityDeprivation(fiscalProfile, deprivation) {
  if (!fiscalProfile?.length) return []

  return fiscalProfile.map((auth, i) => {
    // Try to extract authority-level deprivation from the profile or deprivation data
    const avgImd = auth.avg_imd_score || auth.deprivation_avg_imd || null
    const wardsDecile12Pct = auth.wards_in_decile_1_2_pct || auth.most_deprived_wards_pct || null

    // Build deprivation summary for adjustSavingsForDeprivation
    const depSummary = avgImd != null ? { avg_imd_score: avgImd } : null

    return {
      authority: auth.authority?.replace('Lancashire', 'Lancs') || `Authority ${i + 1}`,
      authorityFull: auth.authority || `Authority ${i + 1}`,
      population: auth.population || 0,
      avg_imd: avgImd,
      wards_decile_12_pct: wardsDecile12Pct,
      depSummary,
      color: AUTH_COLORS[i % AUTH_COLORS.length],
    }
  })
}

export default function LGRDeprivationMap({ deprivation, fiscalProfile, selectedModel, grossSavings }) {
  // Build per-authority deprivation data
  const authorityData = useMemo(
    () => buildAuthorityDeprivation(fiscalProfile, deprivation),
    [fiscalProfile, deprivation]
  )

  // Compute deprivation-adjusted savings for each authority
  const savingsData = useMemo(() => {
    if (!grossSavings || !authorityData.length) return []
    // Divide gross savings proportionally by population
    const totalPop = authorityData.reduce((s, a) => s + a.population, 0)
    if (totalPop === 0) return []

    return authorityData.map(auth => {
      const authShare = totalPop > 0 ? (auth.population / totalPop) * grossSavings : 0
      const result = adjustSavingsForDeprivation(auth.depSummary, authShare)
      return {
        authority: auth.authority,
        authorityFull: auth.authorityFull,
        grossShare: Math.round(authShare),
        adjustedSavings: result.adjustedSavings,
        multiplier: result.deprivationMultiplier,
        factors: result.factors,
        reduction: Math.round(authShare - result.adjustedSavings),
        color: auth.color,
      }
    })
  }, [authorityData, grossSavings])

  // Total adjusted vs gross
  const totalAdjusted = useMemo(
    () => savingsData.reduce((s, d) => s + d.adjustedSavings, 0),
    [savingsData]
  )

  // Bar chart data for IMD comparison
  const imdChartData = useMemo(() => {
    return authorityData
      .filter(a => a.avg_imd != null)
      .map(a => ({
        authority: a.authority,
        'Avg IMD Score': a.avg_imd,
        'Wards in Decile 1-2': a.wards_decile_12_pct || 0,
      }))
  }, [authorityData])

  // Savings bar chart data
  const savingsChartData = useMemo(() => {
    return savingsData.map(s => ({
      authority: s.authority,
      Gross: s.grossShare,
      Adjusted: s.adjustedSavings,
      Reduction: s.reduction,
    }))
  }, [savingsData])

  // Early return for missing data
  if (!fiscalProfile?.length) return null

  const hasImdData = imdChartData.length > 0
  const hasSavingsData = savingsData.length > 0 && grossSavings > 0

  return (
    <div className="lgr-dep-container" role="region" aria-label="LGR Deprivation Analysis">
      {/* IMD Comparison */}
      {hasImdData && (
        <div className="lgr-dep-panel">
          <h3>
            <MapPin size={16} />
            Deprivation by Authority
          </h3>
          <p className="lgr-dep-desc">
            Average IMD score per proposed authority. Higher scores indicate greater deprivation,
            which correlates with higher service complexity and lower savings realisation.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={imdChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => name === 'Wards in Decile 1-2' ? `${v.toFixed(1)}%` : v.toFixed(1)} />
              <Bar dataKey="Avg IMD Score" fill="#ff9f0a">
                {imdChartData.map((d, i) => (
                  <Cell key={i} fill={imdColor(d['Avg IMD Score'])} />
                ))}
              </Bar>
              <Bar dataKey="Wards in Decile 1-2" fill="#ff453a" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>

          {/* Per-authority IMD summary cards */}
          <div className="lgr-dep-cards">
            {authorityData.filter(a => a.avg_imd != null).map(auth => (
              <div key={auth.authority} className="lgr-dep-card" style={{ borderLeftColor: auth.color }}>
                <div className="lgr-dep-card-header">
                  <span className="lgr-dep-card-name">{auth.authorityFull}</span>
                  <span className="lgr-dep-card-imd" style={{ color: imdColor(auth.avg_imd) }}>
                    IMD {auth.avg_imd.toFixed(1)}
                  </span>
                </div>
                <div className="lgr-dep-card-stats">
                  <span>Pop: {formatNumber(auth.population)}</span>
                  {auth.wards_decile_12_pct != null && (
                    <span style={{ color: auth.wards_decile_12_pct > 30 ? '#ff453a' : '#8e8e93' }}>
                      {formatPercent(auth.wards_decile_12_pct, 0)} most deprived
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deprivation-Adjusted Savings */}
      {hasSavingsData && (
        <div className="lgr-dep-panel">
          <h3>
            <TrendingDown size={16} />
            Deprivation-Adjusted Savings
          </h3>
          <p className="lgr-dep-desc">
            Gross LGR savings adjusted for deprivation complexity. More deprived areas have
            higher service costs, reducing achievable savings.
          </p>

          {/* Headline figures */}
          <div className="lgr-dep-headline-row">
            <div className="lgr-dep-headline">
              <span className="lgr-dep-headline-label">Gross Savings</span>
              <span className="lgr-dep-headline-value">{formatCurrency(grossSavings, true)}</span>
            </div>
            <div className="lgr-dep-headline lgr-dep-headline--arrow" aria-hidden="true">
              <TrendingDown size={20} />
            </div>
            <div className="lgr-dep-headline">
              <span className="lgr-dep-headline-label">Adjusted Savings</span>
              <span className="lgr-dep-headline-value" style={{ color: '#ff9f0a' }}>
                {formatCurrency(totalAdjusted, true)}
              </span>
            </div>
            <div className="lgr-dep-headline">
              <span className="lgr-dep-headline-label">Reduction</span>
              <span className="lgr-dep-headline-value" style={{ color: '#ff453a' }}>
                -{formatCurrency(grossSavings - totalAdjusted, true)}
              </span>
            </div>
          </div>

          {/* Savings bar chart */}
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={savingsChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => `£${(v / 1_000_000).toFixed(1)}M`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v, true)} />
              <Bar dataKey="Gross" fill="rgba(48, 209, 88, 0.4)" name="Gross Share" />
              <Bar dataKey="Adjusted" fill="#30d158" name="Adjusted" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>

          {/* Per-authority adjustment factors */}
          <div className="lgr-dep-factors">
            {savingsData.filter(s => s.factors.length > 0).map(s => (
              <div key={s.authority} className="lgr-dep-factor-item">
                <div className="lgr-dep-factor-header">
                  <AlertTriangle size={12} />
                  <strong>{s.authority}</strong>
                  <span className="lgr-dep-factor-mult">x{s.multiplier.toFixed(2)}</span>
                </div>
                {s.factors.map((f, i) => (
                  <p key={i} className="lgr-dep-factor-text">{f}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data fallback */}
      {!hasImdData && !hasSavingsData && (
        <div className="lgr-dep-panel lgr-dep-empty">
          <AlertTriangle size={16} />
          <p>Deprivation data not available for this model. Ward-level IMD scores are needed for deprivation-adjusted savings analysis.</p>
        </div>
      )}
    </div>
  )
}
