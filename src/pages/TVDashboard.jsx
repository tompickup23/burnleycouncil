import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useData } from '../hooks/useData'
import { useSpendingSummary } from '../hooks/useSpendingSummary'
import {
  buildDirectorateSavingsProfile,
  evidenceChainStrength,
  directorateRiskProfile,
  parseSavingRange,
} from '../utils/savingsEngine'
import './TVDashboard.css'

const TIER_COLORS = {
  service_redesign: '#ff9f0a',
  procurement_reform: '#12B6CF',
  immediate_recovery: '#30d158',
  demand_management: '#bf5af2',
  income_generation: '#64d2ff',
  staffing: '#ff6482',
  structural: '#ffd60a',
}

const PARTY_COLORS = {
  'Reform UK': '#12B6CF',
  'Conservative': '#0087DC',
  'Labour': '#E4003B',
  'Liberal Democrat': '#FAA61A',
  'Liberal Democrats': '#FAA61A',
  'Green': '#6AB023',
  'Independent': '#888',
  'Progressive Lancashire': '#9B59B6',
  'OWL': '#E67E22',
}

const SLIDESHOW_INTERVAL = 15000 // 15 seconds per slide

/**
 * TVDashboard v6 — Full-screen leadership dashboard for County Hall TV screens.
 * Route: /tv — Auto-cycling slideshow: Overview → each directorate → repeat
 * Route: /tv/:directorateId — Deep-dive into specific directorate
 * Click or arrow keys to navigate manually (pauses auto-cycle for 60s).
 * 1920×1080 optimised, readable at 3–5m viewing distance.
 */
export default function TVDashboard() {
  const { directorateId } = useParams()
  const navigate = useNavigate()
  const [clock, setClock] = useState(new Date())
  const [showIntro, setShowIntro] = useState(true)
  const [introPhase, setIntroPhase] = useState(0) // 0=black, 1=circle, 2=text, 3=tagline, 4=fade-out
  const [slideTransition, setSlideTransition] = useState('enter') // 'enter' | 'exit' | null
  const [autoPlay, setAutoPlay] = useState(true)

  // Intro sequence timing
  useEffect(() => {
    if (!showIntro) return
    const timers = [
      setTimeout(() => setIntroPhase(1), 400),    // Circle appears
      setTimeout(() => setIntroPhase(2), 1200),    // "AI DOGE" text
      setTimeout(() => setIntroPhase(3), 2200),    // "Challenge Everything" tagline
      setTimeout(() => setIntroPhase(4), 3800),    // Fade out
      setTimeout(() => setShowIntro(false), 4600),  // Remove intro, show dashboard
    ]
    return () => timers.forEach(clearTimeout)
  }, [showIntro])
  const autoResumeTimer = useRef(null)
  const slideshowTimer = useRef(null)
  const isOverview = !directorateId || directorateId === 'overview'

  const { data: allData, loading, error } = useData([
    '/data/cabinet_portfolios.json',
    '/data/doge_findings.json',
    '/data/budgets.json',
    '/data/councillors.json',
    '/data/politics_summary.json',
    '/data/roadworks.json',
  ])

  const [portfolioData, findingsData, budgetsData, councillorsData, politicsData, roadworksData] = allData || [null, null, null, null, null, null]
  const { summary: spendingSummary } = useSpendingSummary()

  useEffect(() => {
    if (loading) return
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [loading])

  const directorates = portfolioData?.directorates || []
  const allPortfolios = portfolioData?.portfolios || []
  const mtfs = portfolioData?.administration?.mtfs

  // Navigation — overview is index -1 conceptually, then directorates 0..N
  const navItems = useMemo(() => {
    const items = [{ id: 'overview', title: 'Overview' }]
    for (const d of directorates) items.push({ id: d.id, title: d.title })
    return items
  }, [directorates])

  const navIdx = useMemo(() => {
    if (isOverview) return 0
    const idx = navItems.findIndex(n => n.id === directorateId)
    return idx >= 0 ? idx : 0
  }, [navItems, directorateId, isOverview])

  // Navigate to a slide with exit/enter animation
  const navigateTo = useCallback((targetIdx) => {
    if (!navItems.length || targetIdx === navIdx) return
    setSlideTransition('exit')
    setTimeout(() => {
      const targetId = navItems[targetIdx]?.id || 'overview'
      // Use React Router paths (relative to basename), NOT window.location.pathname
      navigate(targetId === 'overview' ? '/tv' : `/tv/${targetId}`, { replace: true })
      setSlideTransition('enter')
      setTimeout(() => setSlideTransition(null), 600)
    }, 400)
  }, [navItems, navIdx, navigate])

  // Pause auto-play on manual interaction, resume after 60s
  const pauseAutoPlay = useCallback(() => {
    setAutoPlay(false)
    if (autoResumeTimer.current) clearTimeout(autoResumeTimer.current)
    autoResumeTimer.current = setTimeout(() => setAutoPlay(true), 60000)
  }, [])

  // Auto-slideshow
  useEffect(() => {
    if (!autoPlay || !navItems.length || navItems.length < 2 || loading) return
    slideshowTimer.current = setInterval(() => {
      const next = (navIdx + 1) % navItems.length
      navigateTo(next)
    }, SLIDESHOW_INTERVAL)
    return () => { if (slideshowTimer.current) clearInterval(slideshowTimer.current) }
  }, [autoPlay, navItems, navIdx, loading, navigateTo])

  // Keyboard navigation
  useEffect(() => {
    if (!navItems.length) return
    const handler = (e) => {
      let next
      if (e.key === 'ArrowRight') next = (navIdx + 1) % navItems.length
      else if (e.key === 'ArrowLeft') next = (navIdx - 1 + navItems.length) % navItems.length
      else if (e.key === ' ') { e.preventDefault(); setAutoPlay(p => !p); return }
      else return
      pauseAutoPlay()
      navigateTo(next)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navItems, navIdx, navigateTo, pauseAutoPlay])

  // Transition class for enter trigger
  useEffect(() => {
    setSlideTransition('enter')
    const t = setTimeout(() => setSlideTransition(null), 600)
    return () => clearTimeout(t)
  }, []) // Only on mount

  // Cleanup timers
  useEffect(() => () => {
    if (autoResumeTimer.current) clearTimeout(autoResumeTimer.current)
    if (slideshowTimer.current) clearInterval(slideshowTimer.current)
  }, [])

  const directorate = useMemo(() => {
    if (isOverview || !portfolioData?.directorates) return null
    return portfolioData.directorates.find(d => d.id === directorateId) || portfolioData.directorates[0]
  }, [portfolioData, directorateId, isOverview])

  // ─── Build profiles for ALL directorates (for overview + directorate view) ───
  const allProfiles = useMemo(() => {
    if (!directorates.length || !allPortfolios.length) return {}
    const profiles = {}
    for (const d of directorates) {
      profiles[d.id] = {
        profile: buildDirectorateSavingsProfile(d, allPortfolios, findingsData, portfolioData),
        risk: directorateRiskProfile(d, allPortfolios, [], { findings: findingsData }),
        portfolios: allPortfolios.filter(p => d.portfolio_ids?.includes(p.id)),
      }
    }
    return profiles
  }, [directorates, allPortfolios, findingsData, portfolioData])

  const profile = directorate ? allProfiles[directorate.id]?.profile : null
  const risk = directorate ? allProfiles[directorate.id]?.risk : null
  const portfolios = directorate ? (allProfiles[directorate.id]?.portfolios || []) : []

  // ─── Council-wide totals (for overview) ───
  const councilTotals = useMemo(() => {
    if (!directorates.length) return null
    let totalBudget = 0, totalTarget = 0, totalSavings = 0, totalFTE = 0
    let totalAgency = 0, criticalPressures = 0, totalLevers = 0
    for (const d of directorates) {
      totalBudget += d.net_budget || 0
      totalTarget += d.mtfs_savings_target || 0
      const p = allProfiles[d.id]?.profile
      if (p?.savings_range?.midpoint) totalSavings += p.savings_range.midpoint
      totalLevers += p?.lever_count || 0
      const ports = allProfiles[d.id]?.portfolios || []
      for (const port of ports) {
        const w = port.workforce
        if (w) { totalFTE += w.fte_headcount || 0; totalAgency += w.agency_fte || 0 }
        for (const dp of (port.demand_pressures || [])) {
          if (dp.severity === 'critical') criticalPressures++
        }
      }
      for (const dp of (d.demand_pressures || [])) {
        if (dp.severity === 'critical') criticalPressures++
      }
    }
    return {
      totalBudget, totalTarget, totalSavings, totalFTE, totalAgency,
      criticalPressures, totalLevers,
      coveragePct: totalTarget > 0 ? Math.round((totalSavings / totalTarget) * 100) : 0,
      gap: totalTarget - totalSavings,
    }
  }, [directorates, allProfiles])

  // ─── Political composition ───
  const politics = useMemo(() => {
    if (!politicsData) return null
    const parties = politicsData.parties || politicsData.composition || []
    if (Array.isArray(parties)) {
      return parties.sort((a, b) => (b.seats || b.count || 0) - (a.seats || a.count || 0))
    }
    return null
  }, [politicsData])

  const totalSeats = useMemo(() => {
    if (!politics) return 0
    return politics.reduce((s, p) => s + (p.seats || p.count || 0), 0)
  }, [politics])

  // ─── Roadworks summary (for Growth directorate) ───
  const roadworksSummary = useMemo(() => {
    if (!roadworksData) return null
    const works = Array.isArray(roadworksData) ? roadworksData : roadworksData?.works || roadworksData?.roadworks || []
    const active = works.filter(w => {
      const end = w.end_date || w.expected_end
      return !end || new Date(end) >= new Date()
    })
    const bySeverity = { major: 0, standard: 0, minor: 0, other: 0 }
    for (const w of active) {
      const sev = (w.severity || w.traffic_management || 'other').toLowerCase()
      if (sev.includes('major') || sev.includes('road closure')) bySeverity.major++
      else if (sev.includes('standard') || sev.includes('multi-way')) bySeverity.standard++
      else if (sev.includes('minor') || sev.includes('two-way')) bySeverity.minor++
      else bySeverity.other++
    }
    return { total: works.length, active: active.length, bySeverity }
  }, [roadworksData])

  // ─── Spending by directorate ───
  const dirSpending = useMemo(() => {
    if (!spendingSummary?.by_portfolio || !portfolios.length) return null
    let total = 0, count = 0, suppliers = 0
    for (const p of portfolios) {
      const ps = spendingSummary.by_portfolio?.[p.id]
      if (ps) { total += ps.total || 0; count += ps.count || 0; suppliers += ps.unique_suppliers || 0 }
    }
    return { total, count, suppliers }
  }, [spendingSummary, portfolios])

  // ─── Total spending across all portfolios ───
  const totalSpending = useMemo(() => {
    if (!spendingSummary) return null
    return {
      total: spendingSummary.total_spend || 0,
      count: spendingSummary.transaction_count || 0,
    }
  }, [spendingSummary])

  // ─── All KPIs (directorate view) ───
  const allKPIs = useMemo(() => {
    if (!directorate) return []
    const kpis = [...(directorate.performance_metrics || [])]
    for (const p of portfolios) {
      for (const m of (p.performance_metrics || [])) {
        if (!kpis.some(k => k.name === m.name)) kpis.push({ ...m, portfolio: p.short_title || p.title })
      }
    }
    return kpis
  }, [directorate, portfolios])

  // ─── All savings levers ───
  const allLevers = useMemo(() => {
    if (!portfolios.length) return []
    const levers = []
    for (const p of portfolios) {
      for (const l of (p.savings_levers || [])) {
        levers.push({ ...l, portfolio: p.short_title || p.title, evidence_score: evidenceChainStrength(l), range: parseSavingRange(l.est_saving) })
      }
    }
    return levers.sort((a, b) => (b.range?.high || 0) - (a.range?.high || 0))
  }, [portfolios])

  // ─── Demand pressures ───
  const demandPressures = useMemo(() => {
    const pressures = []
    for (const dp of (directorate?.demand_pressures || [])) pressures.push({ ...dp })
    for (const p of portfolios) {
      for (const dp of (p.demand_pressures || [])) {
        if (!pressures.some(x => x.name === dp.name)) pressures.push({ ...dp, portfolio: p.short_title || p.title })
      }
    }
    return pressures.sort((a, b) => {
      const ord = { critical: 0, high: 1, medium: 2, low: 3 }
      return (ord[a.severity] ?? 4) - (ord[b.severity] ?? 4)
    })
  }, [directorate, portfolios])

  // ─── Workforce (directorate view) ───
  const workforce = useMemo(() => {
    let fte = 0, agencySpend = 0, agencyFte = 0, vacancySum = 0, vacancyCount = 0
    for (const p of portfolios) {
      const w = p.workforce
      if (w) {
        fte += w.fte_headcount || 0
        agencySpend += w.agency_spend || 0
        agencyFte += w.agency_fte || 0
        if (w.vacancy_rate_pct != null) { vacancySum += w.vacancy_rate_pct; vacancyCount++ }
      }
    }
    if (!fte) return null
    return { fte, agencySpend, agencyFte, vacancyPct: vacancyCount > 0 ? Math.round(vacancySum / vacancyCount * 10) / 10 : null }
  }, [portfolios])

  // ─── Inspections ───
  const inspections = useMemo(() => {
    const items = []
    const searchPorts = directorate ? portfolios : allPortfolios
    for (const p of searchPorts) {
      const ctx = p.operational_context || {}
      if (ctx.cqc_rating) items.push({ name: 'CQC', rating: ctx.cqc_rating, date: ctx.cqc_date, portfolio: p.short_title })
      if (ctx.ofsted_rating) items.push({ name: 'Ofsted', rating: ctx.ofsted_rating, date: ctx.ofsted_date, portfolio: p.short_title })
      if (ctx.send_inspection?.rating) items.push({ name: 'SEND', rating: ctx.send_inspection.rating, date: ctx.send_inspection.date, portfolio: p.short_title })
      if (ctx.dft_rating) items.push({ name: 'DfT Highways', rating: ctx.dft_rating, portfolio: p.short_title })
    }
    return items
  }, [directorate, portfolios, allPortfolios])

  // ─── Portfolio spending map ───
  const portfolioSpendMap = useMemo(() => {
    if (!spendingSummary?.by_portfolio) return {}
    return spendingSummary.by_portfolio
  }, [spendingSummary])

  // ─── All council-wide demand pressures (for overview) ───
  const allDemandPressures = useMemo(() => {
    if (!directorates.length) return []
    const all = []
    for (const d of directorates) {
      for (const dp of (d.demand_pressures || [])) {
        all.push({ ...dp, directorate: d.title?.split(',')[0] || d.title })
      }
      const ports = allProfiles[d.id]?.portfolios || []
      for (const p of ports) {
        for (const dp of (p.demand_pressures || [])) {
          if (!all.some(x => x.name === dp.name)) {
            all.push({ ...dp, directorate: d.title?.split(',')[0] || d.title })
          }
        }
      }
    }
    return all.sort((a, b) => {
      const ord = { critical: 0, high: 1, medium: 2, low: 3 }
      return (ord[a.severity] ?? 4) - (ord[b.severity] ?? 4)
    })
  }, [directorates, allProfiles])

  // ─── Top savings levers council-wide (for overview) ───
  const topCouncilLevers = useMemo(() => {
    if (!allPortfolios.length) return []
    const levers = []
    for (const p of allPortfolios) {
      for (const l of (p.savings_levers || [])) {
        levers.push({ ...l, portfolio: p.short_title || p.title, range: parseSavingRange(l.est_saving) })
      }
    }
    return levers.sort((a, b) => (b.range?.high || 0) - (a.range?.high || 0)).slice(0, 8)
  }, [allPortfolios])

  const deliveryHistory = directorate?.savings_delivery_history || []
  const coveragePct = profile?.coverage_pct || 0
  const deliveryPct = directorate?.prior_year_achieved != null && directorate?.prior_year_target
    ? Math.round((directorate.prior_year_achieved / directorate.prior_year_target) * 100)
    : deliveryHistory.length > 0 ? deliveryHistory[0].pct : null

  const tierData = useMemo(() => {
    if (!profile?.by_tier) return []
    return Object.entries(profile.by_tier)
      .filter(([, v]) => v > 0)
      .map(([tier, value]) => ({ tier: tier.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: Math.round(value / 1e6 * 10) / 10, rawKey: tier }))
      .sort((a, b) => b.value - a.value)
  }, [profile])

  // ─── Intro Ident (EA Sports style) ───
  if (showIntro) return (
    <div className="tv-dashboard tv-intro">
      <div className={`tv-intro-circle ${introPhase >= 1 ? 'visible' : ''}`}>
        <svg className="tv-intro-eye" viewBox="0 0 120 80" width="120" height="80">
          <path d="M60 10 C25 10, 2 40, 2 40 C2 40, 25 70, 60 70 C95 70, 118 40, 118 40 C118 40, 95 10, 60 10 Z" fill="none" stroke="#12B6CF" strokeWidth="2.5" />
          <circle cx="60" cy="40" r="16" fill="none" stroke="#12B6CF" strokeWidth="2" />
          <circle cx="60" cy="40" r="7" fill="#12B6CF" className="tv-intro-pupil" />
        </svg>
      </div>
      <div className={`tv-intro-title ${introPhase >= 2 ? 'visible' : ''}`}>AI DOGE</div>
      <div className={`tv-intro-tagline ${introPhase >= 3 ? 'visible' : ''}`}>Challenge Everything</div>
      <div className={`tv-intro-sweep ${introPhase >= 1 ? 'active' : ''}`} />
      <div className={`tv-intro-fade ${introPhase >= 4 ? 'active' : ''}`} />
    </div>
  )

  // ─── Loading / Error ───
  if (loading) return (
    <div className="tv-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="tv-reform-badge" style={{ fontSize: '1.5rem', marginBottom: 20 }}>AI DOGE</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.2rem' }}>Loading council intelligence...</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="tv-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#ff453a', fontSize: '1.5rem' }}>{error?.message || 'Failed to load data'}</div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERVIEW MODE — All directorates + council-wide intelligence
  // ═══════════════════════════════════════════════════════════════════════════
  if (isOverview) {
    const ct = councilTotals || {}
    return (
      <div className="tv-dashboard">
        <TVHeader clock={clock} title="Council Overview" subtitle={`${directorates.length} Directorates · ${allPortfolios.length} Portfolios · ${ct.totalFTE?.toLocaleString() || '—'} FTE`}
          autoPlay={autoPlay} onToggleAutoPlay={() => setAutoPlay(p => !p)} />
        {autoPlay && <div className="tv-progress-bar"><div className="tv-progress-fill" style={{ animationDuration: `${SLIDESHOW_INTERVAL}ms` }} /></div>}

        <div className={`tv-body ${slideTransition ? `tv-slide-${slideTransition}` : ''}`}>
          {/* Hero Stats — Council-Wide */}
          <div className="tv-hero-row tv-hero-row-7">
            <HeroStat label="Total Budget" value={fmtLarge(ct.totalBudget)} variant="accent"
              sub={mtfs?.total_net_budget ? `of ${fmtLarge(mtfs.total_net_budget)} gross` : ''} />
            <HeroStat label="MTFS Target" value={fmtLarge(ct.totalTarget)} variant="danger"
              sub={mtfs?.savings_targets?.['2026_27'] ? `FY 26/27` : ''} />
            <HeroStat label="Savings Found" value={fmtLarge(ct.totalSavings)} variant="info"
              sub={`${ct.totalLevers} levers identified`} />
            <HeroStat label="MTFS Coverage" value={`${ct.coveragePct}%`}
              variant={ct.coveragePct >= 100 ? 'success' : ct.coveragePct >= 60 ? 'warning' : 'danger'}
              sub={ct.coveragePct >= 100 ? 'Target covered' : `Gap: ${fmtLarge(ct.gap)}`} />
            <HeroStat label="Spend Tracked" value={totalSpending ? fmtLarge(totalSpending.total) : '—'} variant="accent"
              sub={totalSpending ? `${totalSpending.count.toLocaleString()} transactions` : ''} />
            <HeroStat label="Critical Pressures" value={String(ct.criticalPressures)} variant={ct.criticalPressures > 5 ? 'danger' : 'warning'}
              sub="Across all directorates" />
            <HeroStat label="Savings Levers" value={String(ct.totalLevers)} variant="info"
              sub="Across all portfolios" />
          </div>

          {/* ═══ Main Grid — 2 rows ═══ */}
          <div className="tv-overview-grid">
            {/* ─── Row 1: 5 Directorate Cards ─── */}
            {directorates.map((d) => {
              const dp = allProfiles[d.id]
              const prof = dp?.profile
              const rsk = dp?.risk
              const ports = dp?.portfolios || []
              const cov = prof?.coverage_pct || 0
              const riskScore = rsk?.risk_score || 0
              const riskColor = riskScore >= 70 ? '#ff453a' : riskScore >= 40 ? '#ff9f0a' : '#30d158'
              const mid = prof?.savings_range?.midpoint || 0
              const tgt = d.mtfs_savings_target || 0
              const fillPct = tgt > 0 ? Math.min(100, (mid / tgt) * 100) : 0
              const fillClass = fillPct >= 100 ? 'covered' : fillPct >= 60 ? 'partial' : 'gap'
              // Count critical KPIs
              const critKPIs = [...(d.performance_metrics || []), ...ports.flatMap(p => p.performance_metrics || [])]
                .filter(k => getKPIStatus(k) === 'critical').length
              // Directorate spending
              let dSpend = 0
              for (const p of ports) {
                const ps = portfolioSpendMap[p.id]
                if (ps) dSpend += ps.total || 0
              }

              return (
                <div key={d.id} className="tv-dir-card"
                  onClick={() => { pauseAutoPlay(); const idx = navItems.findIndex(n => n.id === d.id); if (idx >= 0) navigateTo(idx) }}>
                  <div className="tv-dir-card-header">
                    <div className="tv-dir-card-title">{d.title?.replace(/ & /g, ' &\n').split(',')[0] || d.title}</div>
                    <div className="tv-dir-card-risk" style={{ color: riskColor }}>
                      <span className="tv-dir-risk-score">{Math.round(riskScore)}</span>
                      <span className="tv-dir-risk-label">RISK</span>
                    </div>
                  </div>

                  <div className="tv-dir-card-stats">
                    <div className="tv-dir-mini-stat">
                      <span className="tv-dir-mini-label">Budget</span>
                      <span className="tv-dir-mini-value" style={{ color: '#12B6CF' }}>{fmtLarge(d.net_budget)}</span>
                    </div>
                    <div className="tv-dir-mini-stat">
                      <span className="tv-dir-mini-label">Target</span>
                      <span className="tv-dir-mini-value" style={{ color: '#ff453a' }}>{fmtLarge(tgt)}</span>
                    </div>
                    <div className="tv-dir-mini-stat">
                      <span className="tv-dir-mini-label">Coverage</span>
                      <span className="tv-dir-mini-value" style={{ color: cov >= 100 ? '#30d158' : cov >= 60 ? '#ff9f0a' : '#ff453a' }}>{Math.round(cov)}%</span>
                    </div>
                  </div>

                  {/* MTFS mini bar */}
                  <div className="tv-dir-mtfs-bar">
                    <div className={`tv-dir-mtfs-fill ${fillClass}`} style={{ width: `${fillPct}%` }} />
                  </div>

                  {/* Portfolios */}
                  <div className="tv-dir-portfolios">
                    {ports.map(p => {
                      const ps = portfolioSpendMap[p.id]
                      return (
                        <div key={p.id} className="tv-dir-portfolio-row">
                          <span className="tv-dir-portfolio-name">{p.short_title || p.title}</span>
                          <span className="tv-dir-portfolio-spend">{ps ? fmtLarge(ps.total) : '—'}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Bottom stats */}
                  <div className="tv-dir-card-footer">
                    {critKPIs > 0 && <span className="tv-dir-alert-badge">{critKPIs} critical KPI{critKPIs > 1 ? 's' : ''}</span>}
                    <span className="tv-dir-footer-info">{prof?.lever_count || 0} levers · {ports.length} portfolio{ports.length > 1 ? 's' : ''}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ═══ Bottom Row: 3 panels ═══ */}
          <div className="tv-overview-bottom">
            {/* Political Composition */}
            <div className="tv-panel tv-panel-compact">
              <div className="tv-panel-header">
                <div className="tv-panel-title"><span className="icon">◉</span> Political Control</div>
                <div className="tv-panel-badge live">{totalSeats} seats</div>
              </div>
              {politics && politics.length > 0 ? (
                <>
                  <div className="tv-politics-bar">
                    {politics.map((p, i) => {
                      const seats = p.seats || p.count || 0
                      const pct = totalSeats > 0 ? (seats / totalSeats) * 100 : 0
                      const color = PARTY_COLORS[p.party || p.name] || '#666'
                      return pct > 0 ? (
                        <div key={i} className="tv-politics-segment"
                          style={{ width: `${pct}%`, background: color }}
                          title={`${p.party || p.name}: ${seats}`} />
                      ) : null
                    })}
                  </div>
                  <div className="tv-politics-legend">
                    {politics.filter(p => (p.seats || p.count || 0) > 0).map((p, i) => (
                      <div key={i} className="tv-politics-item">
                        <div className="tv-politics-dot" style={{ background: PARTY_COLORS[p.party || p.name] || '#666' }} />
                        <span className="tv-politics-party">{p.party || p.name}</span>
                        <span className="tv-politics-seats" style={{ color: PARTY_COLORS[p.party || p.name] || '#666' }}>{p.seats || p.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem' }}>No political data</div>
              )}

            </div>

            {/* Inspections & Critical Alerts */}
            <div className="tv-panel tv-panel-compact">
              <div className="tv-panel-header">
                <div className="tv-panel-title"><span className="icon">◎</span> Inspections & Alerts</div>
              </div>
              {inspections.length > 0 && (
                <div className="tv-inspection-row" style={{ flexWrap: 'wrap' }}>
                  {inspections.map((insp, i) => {
                    const isGood = /good|outstanding/i.test(insp.rating)
                    const isBad = /inadequate|requires improvement|widespread|failing/i.test(insp.rating)
                    return (
                      <div key={i} className={`tv-inspection-card ${isBad ? 'bad' : isGood ? 'good' : 'neutral'}`}>
                        <div className="tv-inspection-body">{insp.name}</div>
                        <div className="tv-inspection-rating" style={{ color: isBad ? '#ff453a' : isGood ? '#30d158' : '#ff9f0a' }}>
                          {insp.rating}
                        </div>
                        {insp.portfolio && <div className="tv-inspection-date">{insp.portfolio}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Top critical demand pressures */}
              <div className="tv-section-label" style={{ marginTop: 6 }}>Top Demand Pressures</div>
              <div className="tv-demand-list">
                {allDemandPressures.filter(d => d.severity === 'critical').slice(0, 4).map((dp, i) => (
                  <div key={i} className={`tv-demand-row ${dp.severity}`}>
                    <span className={`tv-demand-sev ${dp.severity}`}>{dp.severity}</span>
                    <span className="tv-demand-name" title={dp.name}>{dp.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Savings Levers */}
            <div className="tv-panel tv-panel-compact">
              <div className="tv-panel-header">
                <div className="tv-panel-title"><span className="icon">◈</span> Top Savings Levers</div>
                <div className="tv-panel-badge live">{topCouncilLevers.length} top</div>
              </div>
              <div className="tv-lever-rows">
                {topCouncilLevers.slice(0, 6).map((lever, i) => {
                  const maxVal = topCouncilLevers[0]?.range?.high || 1
                  const barPct = Math.min(100, ((lever.range?.high || 0) / maxVal) * 100)
                  const tierColor = TIER_COLORS[lever.tier?.split('_')?.slice(0, 2)?.join('_')] || TIER_COLORS[lever.tier] || '#12B6CF'
                  return (
                    <div key={i} className="tv-lever-row">
                      <div className="tv-lever-name" title={lever.lever}>{lever.lever}</div>
                      <div className="tv-lever-amount">{lever.est_saving}</div>
                      <div className="tv-lever-bar-wrap">
                        <div className="tv-lever-bar-fill" style={{ width: `${barPct}%`, background: `linear-gradient(90deg, ${tierColor}, ${tierColor}aa)` }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Roadworks summary if available */}
              {roadworksSummary && (
                <div className="tv-roadworks-mini" style={{ marginTop: 6 }}>
                  <div className="tv-section-label">Highways Intelligence</div>
                  <div className="tv-integrity-row">
                    <div className="tv-integrity-stat">
                      <span className="tv-integrity-label">Active Works</span>
                      <span className="tv-integrity-value" style={{ color: '#ff9f0a' }}>{roadworksSummary.active}</span>
                    </div>
                    <div className="tv-integrity-stat">
                      <span className="tv-integrity-label">Major</span>
                      <span className="tv-integrity-value" style={{ color: '#ff453a' }}>{roadworksSummary.bySeverity.major}</span>
                    </div>
                    <div className="tv-integrity-stat">
                      <span className="tv-integrity-label">Standard</span>
                      <span className="tv-integrity-value" style={{ color: '#ff9f0a' }}>{roadworksSummary.bySeverity.standard}</span>
                    </div>
                    <div className="tv-integrity-stat">
                      <span className="tv-integrity-label">Total</span>
                      <span className="tv-integrity-value" style={{ color: '#12B6CF' }}>{roadworksSummary.total}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <TVFooter navItems={navItems} navIdx={navIdx} councilTotals={ct} totalSpending={totalSpending}
          onNavigate={(idx) => { pauseAutoPlay(); navigateTo(idx) }} />
        <div className="tv-nav-hint">← → navigate · space to {autoPlay ? 'pause' : 'resume'} · click directorate to drill down</div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTORATE VIEW — Deep-dive with portfolio breakdown
  // ═══════════════════════════════════════════════════════════════════════════
  if (!directorate) return (
    <div className="tv-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#ff453a', fontSize: '1.5rem' }}>Directorate "{directorateId}" not found</div>
    </div>
  )

  const riskScore = risk?.risk_score || 0
  const risks = risk?.all_risks || []
  const riskColor = riskScore >= 70 ? '#ff453a' : riskScore >= 40 ? '#ff9f0a' : '#30d158'
  const midpoint = profile?.savings_range?.midpoint || 0
  const target = directorate.mtfs_savings_target || 0
  const mtfsFillPct = target > 0 ? Math.min(100, (midpoint / target) * 100) : 0
  const mtfsFillClass = mtfsFillPct >= 100 ? 'covered' : mtfsFillPct >= 60 ? 'partial' : 'gap'

  // ─── Directorate-specific intelligence ───
  const isGrowth = directorate.id === 'growth_environment'
  const isAdults = directorate.id === 'adults_health'
  const isChildren = directorate.id === 'education_children'
  const isResources = directorate.id === 'resources_digital'
  const isChief = directorate.id === 'chief_executive'

  return (
    <div className="tv-dashboard">
      <TVHeader clock={clock} title={directorate.title}
        subtitle={`${directorate.executive_director} · ${portfolios.length} portfolio${portfolios.length !== 1 ? 's' : ''}${workforce ? ` · ${workforce.fte.toLocaleString()} FTE` : ''}`}
        autoPlay={autoPlay} onToggleAutoPlay={() => setAutoPlay(p => !p)} />
      {autoPlay && <div className="tv-progress-bar"><div className="tv-progress-fill" style={{ animationDuration: `${SLIDESHOW_INTERVAL}ms` }} /></div>}

      <div className={`tv-body ${slideTransition ? `tv-slide-${slideTransition}` : ''}`}>
        {/* Hero Stats */}
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
            sub={deliveryPct != null && directorate.prior_year_achieved != null
              ? `${fmtLarge(directorate.prior_year_achieved)} of ${fmtLarge(directorate.prior_year_target)}`
              : deliveryHistory.length > 0 ? `${deliveryHistory[0].year}` : ''} />
        </div>

        {/* Headline Alert */}
        {directorate.kpi_headline && <div className="tv-headline-alert">{directorate.kpi_headline}</div>}

        {/* Portfolio Cards Row */}
        {portfolios.length > 1 && (
          <div className="tv-portfolio-cards">
            {portfolios.map(p => {
              const ps = portfolioSpendMap[p.id]
              const pLevers = (p.savings_levers || []).length
              const pKPIs = (p.performance_metrics || [])
              const critCount = pKPIs.filter(k => getKPIStatus(k) === 'critical').length
              const cm = p.cabinet_member || {}
              return (
                <div key={p.id} className="tv-portfolio-card">
                  <div className="tv-portfolio-card-name">{p.short_title || p.title}</div>
                  <div className="tv-portfolio-card-member">{cm.name || '—'}</div>
                  <div className="tv-portfolio-card-stats">
                    <div className="tv-portfolio-card-stat">
                      <span className="tv-portfolio-card-stat-label">Spend</span>
                      <span className="tv-portfolio-card-stat-value" style={{ color: '#12B6CF' }}>{ps ? fmtLarge(ps.total) : '—'}</span>
                    </div>
                    <div className="tv-portfolio-card-stat">
                      <span className="tv-portfolio-card-stat-label">Levers</span>
                      <span className="tv-portfolio-card-stat-value">{pLevers}</span>
                    </div>
                    {critCount > 0 && (
                      <div className="tv-portfolio-card-stat">
                        <span className="tv-portfolio-card-stat-label">Critical</span>
                        <span className="tv-portfolio-card-stat-value" style={{ color: '#ff453a' }}>{critCount}</span>
                      </div>
                    )}
                    {p.workforce && (
                      <div className="tv-portfolio-card-stat">
                        <span className="tv-portfolio-card-stat-label">FTE</span>
                        <span className="tv-portfolio-card-stat-value">{(p.workforce.fte_headcount || 0).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Main 3-Column Grid ═══ */}
        <div className="tv-main-grid">
          {/* ─── Col 1: Performance KPIs ─── */}
          <div className="tv-panel">
            <div className="tv-panel-header">
              <div className="tv-panel-title"><span className="icon">◉</span> Performance KPIs</div>
              <div className="tv-panel-badge live">{allKPIs.length} metrics</div>
            </div>
            <div className="tv-kpi-tiles">
              {allKPIs.slice(0, 8).map((kpi, i) => {
                const status = getKPIStatus(kpi)
                const statusClass = status === 'critical' ? 'status-red' : status === 'warning' ? 'status-amber' : 'status-green'
                const valueColor = status === 'critical' ? '#ff453a' : status === 'warning' ? '#ff9f0a' : '#30d158'
                return (
                  <div key={i} className={`tv-kpi-tile ${statusClass}`}>
                    <div className="tv-kpi-status-dot" />
                    <div className="tv-kpi-tile-name">{kpi.name}</div>
                    <div className="tv-kpi-tile-value" style={{ color: valueColor }}>{formatKPIValue(kpi)}</div>
                    <div className="tv-kpi-tile-meta">
                      {kpi.target != null ? `Target: ${kpi.target}${kpi.unit || ''}` : kpi.benchmark || kpi.trend || ''}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Inspections */}
            {inspections.length > 0 && (
              <div className="tv-inspection-row" style={{ marginTop: 4 }}>
                {inspections.map((insp, i) => {
                  const isGood = /good|outstanding/i.test(insp.rating)
                  const isBad = /inadequate|requires improvement|widespread|failing/i.test(insp.rating)
                  return (
                    <div key={i} className={`tv-inspection-card ${isBad ? 'bad' : isGood ? 'good' : 'neutral'}`}>
                      <div className="tv-inspection-body">{insp.name}</div>
                      <div className="tv-inspection-rating" style={{ color: isBad ? '#ff453a' : isGood ? '#30d158' : '#ff9f0a' }}>
                        {insp.rating}
                      </div>
                      {insp.date && <div className="tv-inspection-date">{insp.date}</div>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Workforce mini stats */}
            {workforce && (
              <div className="tv-workforce-row" style={{ marginTop: 4 }}>
                <div className="tv-workforce-stat">
                  <div className="tv-workforce-label">FTE</div>
                  <div className="tv-workforce-value" style={{ color: '#12B6CF' }}>{workforce.fte.toLocaleString()}</div>
                </div>
                <div className="tv-workforce-stat">
                  <div className="tv-workforce-label">Vacancy</div>
                  <div className="tv-workforce-value" style={{ color: workforce.vacancyPct > 10 ? '#ff9f0a' : '#30d158' }}>
                    {workforce.vacancyPct != null ? `${workforce.vacancyPct}%` : '—'}
                  </div>
                </div>
                <div className="tv-workforce-stat">
                  <div className="tv-workforce-label">Agency</div>
                  <div className="tv-workforce-value" style={{ color: workforce.agencyFte > 50 ? '#ff453a' : '#ff9f0a' }}>
                    {workforce.agencyFte.toLocaleString()}
                  </div>
                </div>
                <div className="tv-workforce-stat">
                  <div className="tv-workforce-label">Agency £</div>
                  <div className="tv-workforce-value" style={{ color: '#ff9f0a' }}>{fmtLarge(workforce.agencySpend)}</div>
                </div>
              </div>
            )}

            {/* Directorate-specific intelligence panels */}
            {isGrowth && roadworksSummary && (
              <div className="tv-special-intel" style={{ marginTop: 4 }}>
                <div className="tv-section-label">Highways & Transport Intelligence</div>
                <div className="tv-integrity-row">
                  <div className="tv-integrity-stat">
                    <span className="tv-integrity-label">Active</span>
                    <span className="tv-integrity-value" style={{ color: '#ff9f0a' }}>{roadworksSummary.active}</span>
                  </div>
                  <div className="tv-integrity-stat">
                    <span className="tv-integrity-label">Major</span>
                    <span className="tv-integrity-value" style={{ color: '#ff453a' }}>{roadworksSummary.bySeverity.major}</span>
                  </div>
                  <div className="tv-integrity-stat">
                    <span className="tv-integrity-label">Standard</span>
                    <span className="tv-integrity-value" style={{ color: '#ff9f0a' }}>{roadworksSummary.bySeverity.standard}</span>
                  </div>
                  <div className="tv-integrity-stat">
                    <span className="tv-integrity-label">Total Logged</span>
                    <span className="tv-integrity-value" style={{ color: '#12B6CF' }}>{roadworksSummary.total}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Col 2: MTFS & Risk Centre ─── */}
          <div className="tv-panel glow">
            <div className="tv-panel-header">
              <div className="tv-panel-title"><span className="icon">◎</span> Risk & MTFS</div>
              {riskScore >= 60 && <div className="tv-panel-badge alert">High Risk</div>}
            </div>

            <div className="tv-gauge-centre">
              <TVGauge value={riskScore} max={100} color={riskColor} label={risk?.risk_level?.toUpperCase() || 'RISK'} />
            </div>

            {/* MTFS Progress */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span className="tv-mtfs-label">MTFS Progress</span>
                <span className="tv-mtfs-pct" style={{ color: coveragePct >= 100 ? '#30d158' : '#ff9f0a' }}>{Math.round(mtfsFillPct)}%</span>
              </div>
              <div className="tv-mtfs-track">
                <div className={`tv-mtfs-fill ${mtfsFillClass}`} style={{ width: `${mtfsFillPct}%` }} />
                <div className="tv-mtfs-marker" style={{ left: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="tv-mtfs-detail">Identified: <strong>{fmtLarge(midpoint)}</strong></span>
                <span className="tv-mtfs-detail">Target: <strong style={{ color: '#fff' }}>{fmtLarge(target)}</strong></span>
              </div>
            </div>

            {/* Delivery History */}
            {deliveryHistory.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div className="tv-section-label">Delivery Track Record</div>
                {deliveryHistory.slice(0, 3).map((h, i) => {
                  const barColor = h.pct >= 70 ? '#30d158' : h.pct >= 40 ? '#ff9f0a' : '#ff453a'
                  return (
                    <div key={i} className="tv-delivery-row">
                      <span className="tv-delivery-year">{h.year}</span>
                      <div className="tv-delivery-track">
                        <div className="tv-delivery-fill" style={{ width: `${Math.min(100, h.pct)}%`, background: barColor }} />
                      </div>
                      <span className="tv-delivery-pct" style={{ color: barColor }}>{h.pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Demand Pressures */}
            {demandPressures.length > 0 && (
              <div style={{ marginTop: 6, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="tv-section-label">Demand Pressures ({demandPressures.filter(d => d.severity === 'critical').length} critical)</div>
                <div className="tv-demand-list">
                  {demandPressures.slice(0, 5).map((dp, i) => (
                    <div key={i} className={`tv-demand-row ${dp.severity}`}>
                      <span className={`tv-demand-sev ${dp.severity}`}>{dp.severity}</span>
                      <span className="tv-demand-name" title={dp.name}>{dp.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Summary */}
            <div className="tv-evidence-mini">
              <div>
                <div className="tv-evidence-stat-label">Avg Evidence</div>
                <div className="tv-evidence-stat-value" style={{ color: '#12B6CF' }}>
                  {Math.round(profile?.avg_evidence_strength || 0)}<span style={{ fontSize: '0.6rem', fontWeight: 400 }}>/100</span>
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

          {/* ─── Col 3: Savings & Risk ─── */}
          <div className="tv-panel">
            <div className="tv-panel-header">
              <div className="tv-panel-title"><span className="icon">◈</span> Savings Pipeline</div>
              <div className="tv-panel-badge live">{allLevers.length} levers</div>
            </div>

            <div className="tv-lever-rows">
              {allLevers.slice(0, 6).map((lever, i) => {
                const maxVal = allLevers[0]?.range?.high || 1
                const barPct = Math.min(100, ((lever.range?.high || 0) / maxVal) * 100)
                const tierColor = TIER_COLORS[lever.tier?.split('_')?.slice(0, 2)?.join('_')] || TIER_COLORS[lever.tier] || '#12B6CF'
                return (
                  <div key={i} className="tv-lever-row">
                    <div className="tv-lever-name" title={lever.lever}>{lever.lever}</div>
                    <div className="tv-lever-amount">{lever.est_saving}</div>
                    <div className="tv-lever-bar-wrap">
                      <div className="tv-lever-bar-fill" style={{ width: `${barPct}%`, background: `linear-gradient(90deg, ${tierColor}, ${tierColor}aa)` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Tier breakdown */}
            {tierData.length > 0 && (
              <div className="tv-tier-bars" style={{ marginTop: 6 }}>
                <div className="tv-section-label">By Category</div>
                {tierData.slice(0, 4).map((t, i) => {
                  const maxVal = tierData[0]?.value || 1
                  const color = TIER_COLORS[t.rawKey] || '#12B6CF'
                  return (
                    <div key={i} className="tv-tier-item">
                      <div className="tv-tier-label">{t.tier}</div>
                      <div className="tv-tier-track">
                        <div className="tv-tier-fill" style={{ width: `${(t.value / maxVal) * 100}%`, background: color }} />
                      </div>
                      <div className="tv-tier-value" style={{ color }}>£{t.value}M</div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Risk register */}
            {risks.length > 0 && (
              <div className="tv-risk-list" style={{ marginTop: 6 }}>
                <div className="tv-section-label">Risk Register</div>
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
                <span className="tv-footer-label">Txns</span>
                <span className="tv-footer-value">{dirSpending.count.toLocaleString()}</span>
              </div>
              <div className="tv-footer-stat">
                <span className="tv-footer-label">Suppliers</span>
                <span className="tv-footer-value">{dirSpending.suppliers.toLocaleString()}</span>
              </div>
            </>
          )}
          {demandPressures.length > 0 && (
            <div className="tv-footer-stat">
              <span className="tv-footer-label">Pressures</span>
              <span className="tv-footer-value" style={{ color: '#ff9f0a' }}>{demandPressures.length}</span>
            </div>
          )}
        </div>
        <div className="tv-footer-right">
          <div className="tv-page-dots">
            {navItems.map((n, i) => (
              <div key={n.id} className={`tv-page-dot ${i === navIdx ? 'active' : ''}`}
                onClick={() => { pauseAutoPlay(); navigateTo(i) }}
                title={n.title} />
            ))}
          </div>
          <div className="tv-brand">Lancashire County Council · Reform UK · AI DOGE</div>
        </div>
      </div>
      <div className="tv-nav-hint">← → navigate · space to {autoPlay ? 'pause' : 'resume'} · click to select</div>
    </div>
  )
}

/* ═══ Shared Sub-components ═══ */

function TVHeader({ clock, title, subtitle, autoPlay, onToggleAutoPlay }) {
  return (
    <div className="tv-header">
      <div className="tv-header-left">
        <div className="tv-reform-badge">
          <span className="tv-badge-icon">◆</span>
          <span className="tv-badge-text">AI DOGE</span>
        </div>
        <div>
          <div className="tv-directorate-title">{title}</div>
          <div className="tv-director-name">{subtitle}</div>
        </div>
      </div>
      <div className="tv-header-right">
        {onToggleAutoPlay && (
          <div className={`tv-autoplay-toggle ${autoPlay ? 'playing' : 'paused'}`} onClick={onToggleAutoPlay} title={autoPlay ? 'Pause slideshow' : 'Resume slideshow'}>
            {autoPlay ? '▮▮' : '▶'}
          </div>
        )}
        <div className="tv-live-indicator">
          <div className="tv-live-dot" />
          <span className="tv-live-text">Live</span>
        </div>
        <div className="tv-clock">{clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        <div className="tv-last-updated">{clock.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      </div>
    </div>
  )
}

function TVFooter({ navItems, navIdx, councilTotals, totalSpending, onNavigate }) {
  return (
    <div className="tv-footer">
      <div className="tv-footer-left">
        <div className="tv-footer-stat">
          <span className="tv-footer-label">Budget</span>
          <span className="tv-footer-value">{fmtLarge(councilTotals?.totalBudget)}</span>
        </div>
        <div className="tv-footer-stat">
          <span className="tv-footer-label">MTFS Gap</span>
          <span className="tv-footer-value" style={{ color: councilTotals?.gap > 0 ? '#ff453a' : '#30d158' }}>
            {fmtLarge(councilTotals?.gap)}
          </span>
        </div>
        <div className="tv-footer-stat">
          <span className="tv-footer-label">FTE</span>
          <span className="tv-footer-value">{councilTotals?.totalFTE?.toLocaleString() || '—'}</span>
        </div>
        <div className="tv-footer-stat">
          <span className="tv-footer-label">Agency</span>
          <span className="tv-footer-value" style={{ color: '#ff9f0a' }}>{councilTotals?.totalAgency?.toLocaleString() || '—'}</span>
        </div>
        {totalSpending && (
          <div className="tv-footer-stat">
            <span className="tv-footer-label">Spend</span>
            <span className="tv-footer-value">{fmtLarge(totalSpending.total)}</span>
          </div>
        )}
      </div>
      <div className="tv-footer-right">
        <div className="tv-page-dots">
          {navItems.map((n, i) => (
            <div key={n.id} className={`tv-page-dot ${i === navIdx ? 'active' : ''}`}
              onClick={() => onNavigate?.(i)}
              title={n.title} />
          ))}
        </div>
        <div className="tv-brand">Lancashire County Council · Reform UK · AI DOGE</div>
      </div>
    </div>
  )
}

function HeroStat({ label, value, variant, sub }) {
  return (
    <div className={`tv-hero-stat ${variant}`}>
      <div className="tv-stat-label">{label}</div>
      <div className={`tv-stat-value ${variant}`}>{value}</div>
      {sub && <div className="tv-stat-sub">{sub}</div>}
    </div>
  )
}

function TVGauge({ value, max, color, label }) {
  const radius = 72, stroke = 10, size = 170, centre = size / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(1, Math.max(0, value / max))
  const dashOffset = circumference * (1 - pct)
  return (
    <div className="tv-gauge-ring">
      <svg className="tv-gauge-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="tv-gauge-track" cx={centre} cy={centre} r={radius} strokeWidth={stroke} />
        <circle className="tv-gauge-fill" cx={centre} cy={centre} r={radius} strokeWidth={stroke}
          stroke={color} strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ color }} />
      </svg>
      <div className="tv-gauge-centre-text">
        <div className="tv-gauge-value" style={{ color }}>{Math.round(value)}</div>
        <div className="tv-gauge-unit">{label}</div>
      </div>
    </div>
  )
}

/* ═══ Utilities ═══ */

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
