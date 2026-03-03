import { useMemo } from 'react'
import { formatCurrency, formatNumber } from '../../utils/format'
import { TOOLTIP_STYLE, GRID_STROKE, AXIS_TICK_STYLE, CHART_COLORS } from '../../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { Building, AlertTriangle, Trash2, Wrench, BarChart3, PoundSterling, Layers, GitBranch } from 'lucide-react'
import './LGRPropertyDivision.css'

/**
 * LGR Property Division — shows how LCC's 1,200 assets would be split
 * between new unitary authorities under different LGR models.
 *
 * Includes valuations (Green Book + Red Book), ownership tiers,
 * subsidiary distributions, and disposal/revenue analysis.
 *
 * Props:
 *   propertyData  — property_division from lgr_enhanced.json
 *   selectedModel — currently selected model key (e.g. 'two_unitary')
 *   models        — array of { id, name } for all available models
 */

const AUTHORITY_COLORS = [
  '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a',
]

const TIER_LABELS = {
  county: 'Direct (County)',
  subsidiary: 'Subsidiary',
  jv: 'Joint Venture',
  third_party: 'Third Party',
}

const TIER_COLORS = {
  county: '#0a84ff',
  subsidiary: '#30d158',
  jv: '#ff9f0a',
  third_party: '#8e8e93',
}

function LGRPropertyDivision({ propertyData, selectedModel, models }) {
  if (!propertyData) return null

  const modelData = propertyData[selectedModel]
  if (!modelData) return null

  const authorities = Object.keys(modelData)

  // Build stacked bar chart data — one bar per authority, categories stacked
  const { stackedData, allCategories } = useMemo(() => {
    const catSet = new Set()
    authorities.forEach(auth => {
      const cats = modelData[auth]?.categories
      if (cats) Object.keys(cats).forEach(c => catSet.add(c))
    })
    const cats = Array.from(catSet).sort()

    const data = authorities.map(auth => {
      const entry = { authority: auth }
      const cats_data = modelData[auth]?.categories || {}
      cats.forEach(c => {
        entry[c] = cats_data[c] || 0
      })
      entry.total = modelData[auth]?.assets_count || 0
      return entry
    })

    return { stackedData: data, allCategories: cats }
  }, [modelData, authorities])

  // Condition backlog comparison data
  const backlogData = useMemo(() => {
    return authorities.map(auth => ({
      authority: auth,
      backlog: modelData[auth]?.condition_backlog || 0,
    }))
  }, [modelData, authorities])

  // Disposal candidates
  const disposalData = useMemo(() => {
    return authorities.map(auth => ({
      authority: auth,
      candidates: modelData[auth]?.disposal_candidates || 0,
    }))
  }, [modelData, authorities])

  // Total assets across all authorities
  const totalAssets = useMemo(() => {
    return authorities.reduce((sum, auth) => sum + (modelData[auth]?.assets_count || 0), 0)
  }, [modelData, authorities])

  // Total disposal candidates
  const totalDisposals = useMemo(() => {
    return authorities.reduce((sum, auth) => sum + (modelData[auth]?.disposal_candidates || 0), 0)
  }, [modelData, authorities])

  // Total valuations
  const totalEstValue = useMemo(() => {
    return authorities.reduce((sum, auth) => sum + (modelData[auth]?.estimated_value || 0), 0)
  }, [modelData, authorities])

  const totalRBValue = useMemo(() => {
    return authorities.reduce((sum, auth) => sum + (modelData[auth]?.rb_market_value || 0), 0)
  }, [modelData, authorities])

  // Valuation comparison data
  const valuationData = useMemo(() => {
    return authorities.map(auth => ({
      authority: auth,
      green_book: modelData[auth]?.estimated_value || 0,
      red_book: modelData[auth]?.rb_market_value || 0,
      euv: modelData[auth]?.rb_euv || 0,
    }))
  }, [modelData, authorities])

  // Ownership tier data for stacked bar
  const tierData = useMemo(() => {
    const allTiers = new Set()
    authorities.forEach(auth => {
      const tiers = modelData[auth]?.ownership_tiers
      if (tiers) Object.keys(tiers).forEach(t => allTiers.add(t))
    })
    const tiers = Array.from(allTiers).sort()
    const data = authorities.map(auth => {
      const entry = { authority: auth }
      const t = modelData[auth]?.ownership_tiers || {}
      tiers.forEach(tier => { entry[tier] = t[tier] || 0 })
      return entry
    })
    return { data, tiers }
  }, [modelData, authorities])

  // Subsidiary entities across all authorities
  const allSubsidiaries = useMemo(() => {
    const subs = {}
    authorities.forEach(auth => {
      const s = modelData[auth]?.subsidiaries || {}
      Object.entries(s).forEach(([name, count]) => {
        // Skip "NO LCC" entries — those are third-party flags, not real subsidiaries
        if (name.toUpperCase().includes('NO LCC')) return
        subs[name] = (subs[name] || 0) + count
      })
    })
    return Object.entries(subs)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [modelData, authorities])

  // Check for contested assets
  const contestedAssets = propertyData.contested_assets
  const hasContested = contestedAssets && (Array.isArray(contestedAssets) ? contestedAssets.length > 0 : contestedAssets.count > 0)

  const modelName = models?.find(m => m.id === selectedModel)?.name || selectedModel?.replace(/_/g, ' ')

  const hasValuations = totalEstValue > 0 || totalRBValue > 0

  return (
    <section className="lgr-property-division" aria-label="Property Division Analysis">
      <h2>
        <Building size={20} />
        Property Estate Division
      </h2>
      <p className="lgr-prop-desc">
        How Lancashire CC's {formatNumber(totalAssets)} assets would be distributed
        under the <strong>{modelName}</strong> model.
        {hasValuations && (
          <> Total estate valued at {formatCurrency(totalRBValue || totalEstValue)} (RICS Red Book).</>
        )}
      </p>

      {/* Summary stats — expanded with valuations */}
      <div className="lgr-prop-stats-grid">
        {authorities.map((auth, i) => {
          const d = modelData[auth] || {}
          return (
            <div key={auth} className="lgr-prop-stat-card lgr-prop-stat-card--expanded">
              <div className="lgr-prop-stat-dot" style={{ background: AUTHORITY_COLORS[i % AUTHORITY_COLORS.length] }} />
              <div className="lgr-prop-stat-content">
                <span className="lgr-prop-stat-label">{auth}</span>
                <span className="lgr-prop-stat-value">{formatNumber(d.assets_count || 0)}</span>
                <span className="lgr-prop-stat-sub">assets</span>
                {(d.rb_market_value > 0 || d.estimated_value > 0) && (
                  <span className="lgr-prop-stat-valuation">
                    {formatCurrency(d.rb_market_value || d.estimated_value)}
                  </span>
                )}
                {d.revenue_generating > 0 && (
                  <span className="lgr-prop-stat-revenue">
                    {formatNumber(d.revenue_generating)} revenue-generating
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Valuation comparison chart — Green Book vs Red Book per authority */}
      {hasValuations && (
        <div className="lgr-prop-chart-card">
          <h3><PoundSterling size={16} /> Estate Valuations by Authority</h3>
          <p className="lgr-prop-chart-desc">
            Green Book (HM Treasury NPV) vs Red Book (RICS market value) vs Existing Use Value
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={valuationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => formatCurrency(v, true)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [formatCurrency(value), name === 'green_book' ? 'Green Book NPV' : name === 'red_book' ? 'Red Book MV' : 'Existing Use Value']}
              />
              <Legend
                wrapperStyle={{ color: '#8e8e93', fontSize: 12 }}
                formatter={(value) => value === 'green_book' ? 'Green Book NPV' : value === 'red_book' ? 'Red Book MV' : 'Existing Use Value'}
              />
              <Bar dataKey="green_book" fill="#ff9f0a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="red_book" fill="#0a84ff" radius={[4, 4, 0, 0]} />
              <Bar dataKey="euv" fill="#30d158" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ownership tier breakdown */}
      {tierData.tiers.length > 1 && (
        <div className="lgr-prop-chart-card">
          <h3><Layers size={16} /> Ownership Tier Breakdown</h3>
          <p className="lgr-prop-chart-desc">
            Asset ownership type per authority — direct county, subsidiary, joint venture, and third party
          </p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tierData.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [formatNumber(value), TIER_LABELS[name] || name]}
              />
              <Legend
                wrapperStyle={{ color: '#8e8e93', fontSize: 12 }}
                formatter={(value) => TIER_LABELS[value] || value}
              />
              {tierData.tiers.map((tier, i) => (
                <Bar
                  key={tier}
                  dataKey={tier}
                  name={tier}
                  stackId="tiers"
                  fill={TIER_COLORS[tier] || CHART_COLORS[i % CHART_COLORS.length]}
                  radius={i === tierData.tiers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Subsidiary entities */}
      {allSubsidiaries.length > 0 && (
        <div className="lgr-prop-chart-card">
          <h3><GitBranch size={16} /> Subsidiary & JV Assets</h3>
          <p className="lgr-prop-chart-desc">
            Assets held through subsidiary companies and joint ventures requiring board-level transfer decisions
          </p>
          <div className="lgr-prop-subsidiary-grid">
            {allSubsidiaries.map(({ name, count }) => (
              <div key={name} className="lgr-prop-subsidiary-item">
                <span className="lgr-prop-subsidiary-name">{name}</span>
                <span className="lgr-prop-subsidiary-count">{count} assets</span>
              </div>
            ))}
          </div>
          <p className="lgr-prop-subsidiary-note">
            Subsidiary transfers require Companies House filings and board resolutions. Joint ventures need partner consent.
          </p>
        </div>
      )}

      {/* Stacked bar chart — assets by category per authority */}
      {stackedData.length > 0 && allCategories.length > 0 && (
        <div className="lgr-prop-chart-card">
          <h3><BarChart3 size={16} /> Assets by Category</h3>
          <p className="lgr-prop-chart-desc">Stacked breakdown showing asset categories per new authority</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stackedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [formatNumber(value), name]}
              />
              <Legend wrapperStyle={{ color: '#8e8e93', fontSize: 12 }} />
              {allCategories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="assets"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={i === allCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Condition backlog comparison */}
      {backlogData.some(d => d.backlog > 0) && (
        <div className="lgr-prop-chart-card">
          <h3><Wrench size={16} /> Condition Backlog by Authority</h3>
          <p className="lgr-prop-chart-desc">Maintenance and repair liabilities inherited by each new authority</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={backlogData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="authority" tick={AXIS_TICK_STYLE} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={v => formatCurrency(v, true)} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [formatCurrency(value), 'Condition Backlog']}
              />
              <Bar dataKey="backlog" radius={[6, 6, 0, 0]}>
                {backlogData.map((_, i) => (
                  <Cell key={i} fill={AUTHORITY_COLORS[i % AUTHORITY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Disposal candidates */}
      {totalDisposals > 0 && (
        <div className="lgr-prop-chart-card">
          <h3><Trash2 size={16} /> Disposal Candidates</h3>
          <p className="lgr-prop-chart-desc">
            {formatNumber(totalDisposals)} assets flagged for potential disposal across {authorities.length} authorities
          </p>
          <div className="lgr-prop-disposal-grid">
            {disposalData.map((d, i) => (
              <div key={d.authority} className="lgr-prop-disposal-item">
                <div
                  className="lgr-prop-disposal-bar"
                  style={{
                    width: `${totalDisposals > 0 ? (d.candidates / totalDisposals) * 100 : 0}%`,
                    background: AUTHORITY_COLORS[i % AUTHORITY_COLORS.length],
                  }}
                />
                <div className="lgr-prop-disposal-info">
                  <span className="lgr-prop-disposal-auth">{d.authority}</span>
                  <span className="lgr-prop-disposal-count">{formatNumber(d.candidates)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contested assets warning */}
      {hasContested && (
        <div className="lgr-prop-contested-panel" role="alert">
          <AlertTriangle size={18} />
          <div className="lgr-prop-contested-content">
            <strong>Contested Assets</strong>
            <p>
              {Array.isArray(contestedAssets)
                ? `${contestedAssets.length} assets sit on authority boundaries or serve cross-boundary populations. These require negotiated transfer agreements.`
                : `${contestedAssets.count || 0} assets sit on authority boundaries or serve cross-boundary populations. These require negotiated transfer agreements.`
              }
            </p>
            {Array.isArray(contestedAssets) && contestedAssets.length > 0 && (
              <ul className="lgr-prop-contested-list">
                {contestedAssets.slice(0, 5).map((asset, i) => (
                  <li key={i}>
                    {typeof asset === 'string' ? asset : asset.name || asset.description || `Asset ${i + 1}`}
                  </li>
                ))}
                {contestedAssets.length > 5 && (
                  <li className="lgr-prop-contested-more">
                    + {contestedAssets.length - 5} more contested assets
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default LGRPropertyDivision
