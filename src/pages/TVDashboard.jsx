import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { useSpendingSummary } from '../hooks/useSpendingSummary'
import {
  buildDirectorateSavingsProfile,
  evidenceChainStrength,
  directorateRiskProfile,
  parseSavingRange,
  formatCurrency,
  matchSpendingToPortfolio,
} from '../utils/savingsEngine'
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Cell, PieChart, Pie,
} from 'recharts'
import SparkLine from '../components/ui/SparkLine'
import './TVDashboard.css'

// ─── Tier colour map ──────────────────────────────────────────────────────────
const TIER_COLORS = {
  service_redesign: '#ff9f0a',
  procurement_reform: '#12B6CF',
  immediate_recovery: '#30d158',
  demand_management: '#bf5af2',
  income_generation: '#64d2ff',
  staffing: '#ff6482',
  structural: '#ffd60a',
}

const STATUS_COLORS = {
  critical: '#ff453a',
  high: '#ff9f0a',
  medium: '#ffc107',
  low: '#30d158',
}

/**
 * TVDashboard — Full-screen directorate KPI display for County Hall TV screens.
 *
 * Route: /tv/:directorateId (e.g. /tv/adults_health)
 * No navigation, no auth gate, persistent multi-panel view, auto-refreshing clock.
 * Designed for 1080p+ displays at 3-5m viewing distance.
 * Bloomberg terminal × mission control aesthetic.
 */
export default function TVDashboard() {
  const { directorateId } = useParams()
  const [clock, setClock] = useState(new Date())

  // Data loading — all hooks before conditional returns
  const { data: allData, loading, error } = useData([
    '/data/cabinet_portfolios.json',
    '/data/doge_findings.json',
    '/data/budgets.json',
  ])

  const [portfolioData, findingsData, budgetsData] = allData || [null, null, null]
  const { summary: spendingSummary } = useSpendingSummary()

  // Live clock (only after data loads)
  useEffect(() => {
    if (loading) return
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [loading])

  // Keyboard: ← → navigate directorates
  const directorates = portfolioData?.directorates || []
  const dirIdx = useMemo(() => {
    if (!directorates.length) return 0
    const idx = directorates.findIndex(d => d.id === directorateId)
    return idx >= 0 ? idx : 0
  }, [directorates, directorateId])

  useEffect(() => {
    if (!directorates.length) return
    const handler = (e) => {
      if (e.key === 'ArrowRight') {
        const next = (dirIdx + 1) % directorates.length
        window.location.href = window.location.pathname.replace(/\/tv\/?.*/, `/tv/${directorates[next].id}`)
      } else if (e.key === 'ArrowLeft') {
        const prev = (dirIdx - 1 + directorates.length) % directorates.length
        window.location.href = window.location.pathname.replace(/\/tv\/?.*/, `/tv/${directorates[prev].id}`)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [directorates, dirIdx])

  // Find directorate
  const directorate = useMemo(() => {
    if (!portfolioData?.directorates) return null
    return portfolioData.directorates.find(d => d.id === directorateId) || portfolioData.directorates[0]
  }, [portfolioData, directorateId])

  // Build savings profile
  const profile = useMemo(() => {
    if (!directorate || !portfolioData?.portfolios) return null
    return buildDirectorateSavingsProfile(directorate, portfolioData.portfolios, findingsData, portfolioData)
  }, [directorate, portfolioData, findingsData])

  // Build risk profile
  const risk = useMemo(() => {
    if (!directorate || !portfolioData?.portfolios) return null
    return directorateRiskProfile(directorate, portfolioData.portfolios, [], { findings: findingsData })
  }, [directorate, portfolioData, findingsData])

  // Get constituent portfolios
  const portfolios = useMemo(() => {
    if (!directorate || !portfolioData?.portfolios) return []
    return portfolioData.portfolios.filter(p => directorate.portfolio_ids?.includes(p.id))
  }, [directorate, portfolioData])

  // Spending data for this directorate
  const dirSpending = useMemo(() => {
    if (!spendingSummary?.by_portfolio || !portfolios.length) return null
    let total = 0, count = 0, suppliers = 0
    for (const p of portfolios) {
      const ps = spendingSummary.by_portfolio?.[p.id]
      if (ps) {
        total += ps.total || 0
        count += ps.count || 0
        suppliers += ps.unique_suppliers || 0
      }
    }
    return { total, count, suppliers }
  }, [spendingSummary, portfolios])

  // All KPIs from directorate + constituent portfolios
  const allKPIs = useMemo(() => {
    if (!directorate) return []
    const kpis = [...(directorate.performance_metrics || [])]
    for (const p of portfolios) {
      for (const m of (p.performance_metrics || [])) {
        if (!kpis.some(k => k.name === m.name)) {
          kpis.push({ ...m, portfolio: p.short_title || p.title })
        }
      }
    }
    return kpis
  }, [directorate, portfolios])

  // All savings levers
  const allLevers = useMemo(() => {
    if (!portfolios.length) return []
    const levers = []
    for (const p of portfolios) {
      for (const l of (p.savings_levers || [])) {
        levers.push({
          ...l,
          portfolio: p.short_title || p.title,
          evidence_score: evidenceChainStrength(l),
          range: parseSavingRange(l.est_saving),
        })
      }
    }
    return levers.sort((a, b) => (b.range?.high || 0) - (a.range?.high || 0))
  }, [portfolios])

  // Demand pressures
  const demandPressures = useMemo(() => {
    const pressures = []
    for (const p of portfolios) {
      for (const dp of (p.demand_pressures || [])) {
        pressures.push({ ...dp, portfolio: p.short_title || p.title })
      }
    }
    return pressures.sort((a, b) => {
      const ord = { critical: 0, high: 1, medium: 2, low: 3 }
      return (ord[a.severity] ?? 4) - (ord[b.severity] ?? 4)
    })
  }, [portfolios])

  // MTFS data
  const mtfs = portfolioData?.administration?.mtfs
  const deliveryHistory = directorate?.savings_delivery_history || []
  const coveragePct = profile?.coverage_pct || 0
  const deliveryPct = directorate?.prior_year_achieved != null && directorate?.prior_year_target
    ? Math.round((directorate.prior_year_achieved / directorate.prior_year_target) * 100)
    : null

  // Savings by tier for radar chart
  const tierData = useMemo(() => {
    if (!profile?.by_tier) return []
    return Object.entries(profile.by_tier)
      .filter(([, v]) => v > 0)
      .map(([tier, value]) => ({
        tier: tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value: Math.round(value / 1e6 * 10) / 10,
        rawKey: tier,
      }))
      .sort((a, b) => b.value - a.value)
  }, [profile])

  // Inspections
  const inspections = useMemo(() => {
    const items = []
    for (const p of portfolios) {
      const ctx = p.operational_context || {}
      if (ctx.cqc_rating) items.push({ name: 'CQC', rating: ctx.cqc_rating, date: ctx.cqc_date, portfolio: p.short_title })
      if (ctx.ofsted_rating) items.push({ name: 'Ofsted', rating: ctx.ofsted_rating, date: ctx.ofsted_date, portfolio: p.short_title })
      if (ctx.send_inspection?.rating) items.push({ name: 'SEND', rating: ctx.send_inspection.rating, date: ctx.send_inspection.date, portfolio: p.short_title })
      if (ctx.dft_rating) items.push({ name: 'DfT Highways', rating: ctx.dft_rating, portfolio: p.short_title })
    }
    return items
  }, [portfolios])

  // ─── Loading & Error states ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="tv-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="tv-reform-badge" style={{ fontSize: '1.5rem', marginBottom: 20 }}>AI DOGE</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem' }}>Loading directorate intelligence...</div>
        </div>
      </div>
    )
  }

  if (error || !directorate) {
    return (
      <div className="tv-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#ff453a', fontSize: '1.5rem' }}>
          {error?.message || `Directorate "${directorateId}" not found`}
        </div>
      </div>
    )
  }

  const riskScore = risk?.risk_score || 0
  const risks = risk?.all_risks || []
  const riskColor = riskScore >= 70 ? '#ff453a' : riskScore >= 40 ? '#ff9f0a' : '#30d158'
  const midpoint = profile?.savings_range?.midpoint || 0
  const target = directorate.mtfs_savings_target || 0
  const mtfsFillPct = target > 0 ? Math.min(100, (midpoint / target) * 100) : 0
  const mtfsFillClass = mtfsFillPct >= 100 ? 'covered' : mtfsFillPct >= 60 ? 'partial' : 'gap'

  return (
    <div className="tv-dashboard">
      {/* ═══ Header ═══════════════════════════════════════════════════════ */}
      <div className="tv-header">
        <div className="tv-header-left">
          <div className="tv-reform-badge">AI DOGE</div>
          <div>
            <div className="tv-directorate-title">{directorate.title}</div>
            <div className="tv-director-name">
              {directorate.executive_director} · {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div className="tv-header-right">
          <div className="tv-live-indicator">
            <div className="tv-live-dot" />
            <span className="tv-live-text">Live</span>
          </div>
          <div className="tv-clock">
            {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="tv-last-updated">
            {clock.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {/* ═══ Body ═════════════════════════════════════════════════════════ */}
      <div className="tv-body">
        {/* ─── Hero Stats ──────────────────────────────────────────────── */}
        <div className="tv-hero-row">
          <HeroStat label="Net Budget" value={fmtLarge(directorate.net_budget)} variant="accent"
            sub={`${Math.round((directorate.net_budget / (mtfs?.total_net_budget || 1)) * 100)}% of council`} />
          <HeroStat label="MTFS Target" value={fmtLarge(target)} variant="danger"
            sub={`${Math.round((target / (mtfs?.savings_targets?.['2026_27'] || 1)) * 100)}% of council target`} />
          <HeroStat label="Identified Savings" value={profile ? fmtLarge(midpoint) : '—'} variant="info"
            sub={profile ? `${fmtLarge(profile.savings_range?.low)} – ${fmtLarge(profile.savings_range?.high)}` : '—'} />
          <HeroStat label="MTFS Coverage" value={`${Math.round(coveragePct)}%`}
            variant={coveragePct >= 100 ? 'success' : coveragePct >= 60 ? 'warning' : 'danger'}
            sub={coveragePct >= 100 ? 'Target covered' : `Gap: ${fmtLarge(target - midpoint)}`} />
          <HeroStat label="Prior Delivery" value={deliveryPct != null ? `${deliveryPct}%` : 'N/A'}
            variant={deliveryPct != null ? (deliveryPct >= 70 ? 'success' : deliveryPct >= 40 ? 'warning' : 'danger') : 'info'}
            sub={deliveryPct != null ? `${fmtLarge(directorate.prior_year_achieved)} of ${fmtLarge(directorate.prior_year_target)}` : ''} />
        </div>

        {/* ─── Headline Alert ──────────────────────────────────────────── */}
        {directorate.kpi_headline && (
          <div className="tv-headline-alert">{directorate.kpi_headline}</div>
        )}

        {/* ─── Main 3-Column Grid ──────────────────────────────────────── */}
        <div className="tv-main-grid">
          {/* ═══ Col 1: Performance KPIs ═══════════════════════════════ */}
          <div className="tv-panel">
            <div className="tv-panel-header">
              <div className="tv-panel-title"><span className="icon">◉</span> Performance KPIs</div>
              <div className="tv-panel-badge live">Monitoring</div>
            </div>
            <div className="tv-kpi-tiles">
              {allKPIs.slice(0, 8).map((kpi, i) => {
                const status = getKPIStatus(kpi)
                const statusClass = status === 'critical' ? 'status-red' : status === 'warning' ? 'status-amber' : 'status-green'
                return (
                  <div key={i} className={`tv-kpi-tile ${statusClass}`}>
                    <div className="tv-kpi-tile-name">{kpi.name}</div>
                    <div className="tv-kpi-tile-value" style={{
                      color: status === 'critical' ? '#ff453a' : status === 'warning' ? '#ff9f0a' : '#30d158'
                    }}>
                      {formatKPIValue(kpi)}
                    </div>
                    <div className="tv-kpi-tile-meta">
                      {kpi.target != null ? `Target: ${kpi.target}${kpi.unit || ''}` : kpi.benchmark || kpi.trend || ''}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Inspections below KPIs */}
            {inspections.length > 0 && (
              <div className="tv-inspection-row" style={{ marginTop: 10 }}>
                {inspections.map((insp, i) => {
                  const isGood = /good|outstanding/i.test(insp.rating)
                  const isBad = /inadequate|requires improvement|widespread|failing/i.test(insp.rating)
                  return (
                    <div key={i} className={`tv-inspection-card ${isBad ? 'bad' : isGood ? 'good' : 'neutral'}`}>
                      <div className="tv-inspection-body">{insp.name}</div>
                      <div className="tv-inspection-rating" style={{
                        color: isBad ? '#ff453a' : isGood ? '#30d158' : '#ff9f0a'
                      }}>
                        {insp.rating}
                      </div>
                      {insp.date && <div className="tv-inspection-date">{insp.date}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ═══ Col 2: MTFS & Risk Centre ═════════════════════════════ */}
          <div className="tv-panel glow">
            <div className="tv-panel-header">
              <div className="tv-panel-title"><span className="icon">◎</span> MTFS Intelligence</div>
              {riskScore >= 60 && <div className="tv-panel-badge alert">High Risk</div>}
            </div>

            {/* Risk Gauge */}
            <div className="tv-gauge-centre">
              <TVGauge value={riskScore} max={100} color={riskColor} label={risk?.risk_level?.toUpperCase() || 'RISK'} />
            </div>

            {/* MTFS Progress */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  MTFS Progress
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: coveragePct >= 100 ? '#30d158' : '#ff9f0a' }}>
                  {Math.round(mtfsFillPct)}%
                </span>
              </div>
              <div className="tv-mtfs-track">
                <div className={`tv-mtfs-fill ${mtfsFillClass}`} style={{ width: `${mtfsFillPct}%` }} />
                <div className="tv-mtfs-marker" style={{ left: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>
                <span>Identified: <strong style={{ color: '#12B6CF' }}>{fmtLarge(midpoint)}</strong></span>
                <span>Target: <strong>{fmtLarge(target)}</strong></span>
              </div>
            </div>

            {/* Delivery History mini bars */}
            {deliveryHistory.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Delivery Track Record
                </div>
                {deliveryHistory.slice(0, 4).map((h, i) => {
                  const barColor = h.pct >= 70 ? '#30d158' : h.pct >= 40 ? '#ff9f0a' : '#ff453a'
                  return (
                    <div key={i} className="tv-delivery-row">
                      <span className="tv-delivery-year">{h.year}</span>
                      <div className="tv-delivery-track">
                        <div className="tv-delivery-fill" style={{
                          width: `${Math.min(100, h.pct)}%`,
                          background: barColor,
                        }} />
                      </div>
                      <span className="tv-delivery-pct" style={{ color: barColor }}>{h.pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Evidence Summary */}
            <div className="tv-evidence-mini">
              <div>
                <div className="tv-evidence-stat-label">Avg Evidence</div>
                <div className="tv-evidence-stat-value" style={{ color: '#12B6CF' }}>
                  {Math.round(profile?.avg_evidence_strength || 0)}
                  <span style={{ fontSize: '0.6rem', fontWeight: 400 }}>/100</span>
                </div>
              </div>
              <div>
                <div className="tv-evidence-stat-label">Levers</div>
                <div className="tv-evidence-stat-value" style={{ color: '#fff' }}>{profile?.lever_count || 0}</div>
              </div>
              <div>
                <div className="tv-evidence-stat-label">Evidenced</div>
                <div className="tv-evidence-stat-value" style={{ color: '#30d158' }}>{profile?.evidenced_count || 0}</div>
              </div>
            </div>
          </div>

          {/* ═══ Col 3: Savings & Risk ═════════════════════════════════ */}
          <div className="tv-panel">
            <div className="tv-panel-header">
              <div className="tv-panel-title"><span className="icon">◈</span> Savings Pipeline</div>
              <div className="tv-panel-badge live">{allLevers.length} levers</div>
            </div>

            {/* Top savings levers */}
            <div className="tv-lever-rows">
              {allLevers.slice(0, 7).map((lever, i) => {
                const maxVal = allLevers[0]?.range?.high || 1
                const barPct = Math.min(100, ((lever.range?.high || 0) / maxVal) * 100)
                const evColor = lever.evidence_score >= 60 ? '#30d158' : lever.evidence_score >= 30 ? '#ff9f0a' : '#ff453a'
                const tierColor = TIER_COLORS[lever.tier?.split('_')?.slice(0, 2)?.join('_')] ||
                  TIER_COLORS[lever.tier] || '#12B6CF'

                return (
                  <div key={i} className="tv-lever-row">
                    <div className="tv-lever-name" title={lever.lever}>{lever.lever}</div>
                    <div className="tv-lever-amount">{lever.est_saving}</div>
                    <div className="tv-lever-bar-wrap">
                      <div className="tv-lever-bar-fill" style={{
                        width: `${barPct}%`,
                        background: `linear-gradient(90deg, ${tierColor}, ${tierColor}aa)`,
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Savings by Tier */}
            {tierData.length > 0 && (
              <div className="tv-tier-bars" style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  By Category
                </div>
                {tierData.slice(0, 5).map((t, i) => {
                  const maxVal = tierData[0]?.value || 1
                  const barPct = (t.value / maxVal) * 100
                  const color = TIER_COLORS[t.rawKey] || '#12B6CF'
                  return (
                    <div key={i} className="tv-tier-item">
                      <div className="tv-tier-label">{t.tier}</div>
                      <div className="tv-tier-track">
                        <div className="tv-tier-fill" style={{ width: `${barPct}%`, background: color }} />
                      </div>
                      <div className="tv-tier-value" style={{ color }}>£{t.value}M</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Risk List */}
            {risks.length > 0 && (
              <div className="tv-risk-list" style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Risk Register
                </div>
                {risks.slice(0, 4).map((r, i) => {
                  const sev = r.severity || r.level || 'medium'
                  return (
                    <div key={i} className={`tv-risk-row ${sev}`}>
                      <span className={`tv-risk-sev ${sev}`}>{sev}</span>
                      <div className="tv-risk-info">
                        <div className="tv-risk-title">{r.name || r.type || 'Risk'}</div>
                        <div className="tv-risk-desc">{r.detail || r.description || ''}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Footer ═══════════════════════════════════════════════════ */}
      <div className="tv-footer">
        <div className="tv-footer-left">
          <div className="tv-footer-stat">
            <span className="tv-footer-label">Levers</span>
            <span className="tv-footer-value">{allLevers.length}</span>
          </div>
          <div className="tv-footer-stat">
            <span className="tv-footer-label">Portfolios</span>
            <span className="tv-footer-value">{portfolios.length}</span>
          </div>
          {dirSpending && (
            <>
              <div className="tv-footer-stat">
                <span className="tv-footer-label">Spend Tracked</span>
                <span className="tv-footer-value">{fmtLarge(dirSpending.total)}</span>
              </div>
              <div className="tv-footer-stat">
                <span className="tv-footer-label">Transactions</span>
                <span className="tv-footer-value">{dirSpending.count.toLocaleString()}</span>
              </div>
              <div className="tv-footer-stat">
                <span className="tv-footer-label">Suppliers</span>
                <span className="tv-footer-value">{dirSpending.suppliers.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
        <div className="tv-footer-right">
          <div className="tv-page-dots">
            {directorates.map((d, i) => (
              <div
                key={d.id}
                className={`tv-page-dot ${i === dirIdx ? 'active' : ''}`}
                onClick={() => {
                  window.location.href = window.location.pathname.replace(/\/tv\/?.*/, `/tv/${d.id}`)
                }}
                title={d.title}
              />
            ))}
          </div>
          <div className="tv-brand">Lancashire County Council · Reform UK · AI DOGE</div>
        </div>
      </div>

      <div className="tv-nav-hint">← → directorates</div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════════
 * Sub-components
 * ═══════════════════════════════════════════════════════════════════════════════ */

/** Hero stat tile */
function HeroStat({ label, value, variant, sub }) {
  return (
    <div className={`tv-hero-stat ${variant}`}>
      <div className="tv-stat-label">{label}</div>
      <div className={`tv-stat-value ${variant}`}>{value}</div>
      {sub && <div className="tv-stat-sub">{sub}</div>}
    </div>
  )
}

/** Custom SVG gauge ring — no external component dependency */
function TVGauge({ value, max, color, label }) {
  const radius = 78
  const stroke = 10
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(1, Math.max(0, value / max))
  const dashOffset = circumference * (1 - pct)

  return (
    <div className="tv-gauge-ring">
      <svg className="tv-gauge-svg" width="180" height="180" viewBox="0 0 180 180">
        <circle
          className="tv-gauge-track"
          cx="90" cy="90" r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="tv-gauge-fill"
          cx="90" cy="90" r={radius}
          strokeWidth={stroke}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ color }}
        />
      </svg>
      <div className="tv-gauge-centre-text">
        <div className="tv-gauge-value" style={{ color }}>{Math.round(value)}</div>
        <div className="tv-gauge-unit">{label}</div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════════════════
 * Utilities
 * ═══════════════════════════════════════════════════════════════════════════════ */

function fmtLarge(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `£${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `£${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `£${(n / 1e3).toFixed(0)}K`
  return `£${n.toLocaleString()}`
}

function getKPIStatus(kpi) {
  if (kpi.trend === 'critical_failure' || kpi.trend === 'rapidly_worsening' || kpi.trend === 'exponential') return 'critical'
  if (/requires improvement|failing|inadequate|widespread/i.test(String(kpi.value))) return 'critical'
  if (kpi.trend === 'declining' || kpi.trend === 'worsening' || kpi.trend === 'rising_20pct_pa') return 'critical'
  if (kpi.classification?.includes('HIGH')) return 'critical'
  if (kpi.target != null && typeof kpi.value === 'number') {
    const ratio = kpi.value / kpi.target
    if (kpi.target < kpi.value) return ratio > 2 ? 'critical' : 'warning'
    if (ratio >= 0.9) return 'good'
    if (ratio >= 0.6) return 'warning'
    return 'critical'
  }
  if (kpi.trend === 'improving' || kpi.trend === 'near_complete') return 'good'
  if (kpi.trend === 'stable' || kpi.trend === 'first_assessment') return 'warning'
  return 'warning'
}

function formatKPIValue(kpi) {
  const v = kpi.value
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (kpi.unit === '£') return fmtLarge(v)
  if (kpi.unit === '%') return `${v}%`
  if (typeof v === 'number') {
    if (v >= 1e6) return fmtLarge(v)
    return v.toLocaleString() + (kpi.unit ? ` ${kpi.unit}` : '')
  }
  return String(v)
}
