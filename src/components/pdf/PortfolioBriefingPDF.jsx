/**
 * PortfolioBriefingPDF - Per-portfolio Cabinet Command briefing.
 *
 * World-class intelligence document covering:
 *  P1: Cover
 *  P2: Portfolio Overview (budget, team, duties, workforce, demand)
 *  P3: Savings Pipeline & Directives (priority table, by-category, evidence strength)
 *  P4: Governance & Decision Pipeline (upcoming decisions, routing, dependencies)
 *  P5: Service Intelligence (conditional per model - SEND/ASC/Highways/Waste/Children/PH/Property)
 *  P6: Political & Fiscal Trajectory
 *  P7: Key Contracts (full detail cards)
 *  P8+: Savings Levers Detail (evidence chains, implementation steps, political framing)
 *  P9: Communication Points (factual, from evidence - NOT speculative)
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, CoverPage, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, Table, Divider,
  KeyValue, ProgressBar, HorizontalBarChart,
  formatCurrency, formatPct, formatNumber,
} from './PDFComponents.jsx'

// ── Helpers ──

/** True when a service-intel result contains real data (not just empty fallback) */
const hasData = {
  send:     o => o?.yearly?.length > 0,
  asc:      o => o?.yearly?.length > 0,
  highway:  o => o?.yearly?.length > 0,
  waste:    o => o?.scenarios?.length > 0,
  children: o => o?.yearly?.length > 0,
  ph:       o => o?.base_grant > 0,
  property: o => (o?.base_cost > 0 || o?.disposal_pipeline > 0),
  interventionROI: o => o?.programmes?.length > 0,
  lac:      o => o?.placements_moved?.length > 0,
  ascMarket: o => o?.risk_score > 0,
  chc:      o => o?.gap > 0,
}

/** Risk colour helper */
const riskColor = r => {
  const rl = (r || '').toLowerCase()
  if (rl === 'high') return COLORS.danger
  if (rl === 'medium') return COLORS.warning
  if (rl === 'low') return COLORS.success
  return COLORS.textSecondary
}

/** Tier label */
const tierLabel = t => (t || 'general').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

/** Governance routing helper */
const governanceRoute = (savingsM) => {
  if (savingsM >= 1000000) return 'Full Council'
  if (savingsM >= 500000) return 'Cabinet'
  if (savingsM >= 250000) return 'Exec Director'
  return 'Officer'
}

export function PortfolioBriefingPDF({
  portfolio, directives, narrative, serviceIntel, councilName,
  politicalCtx, upcomingDecisions, dependencies, fiscalTrajectory,
  demandPressures, playbook, evidenceStrengths,
  budgetsData, workforce, spendingSummary,
}) {
  if (!portfolio) return <Document><Page size="A4" style={styles.page}><Text>No portfolio data available</Text></Page></Document>

  const title = portfolio.short_title || portfolio.title || portfolio.id
  const totalSavings = (directives || []).reduce((s, d) => s + (d.save_central || 0), 0)
  const immediateSavings = (directives || []).filter(d => /immediate|0-3/i.test(d.timeline || '')).reduce((s, d) => s + (d.save_central || 0), 0)
  const budget = portfolio.budget_total || portfolio.budget?.total || 0
  const levers = portfolio.savings_levers || []
  const contracts = portfolio.key_contracts || []

  // Group directives by category
  const byCategory = {}
  ;(directives || []).forEach(d => {
    const cat = d.category || 'general'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(d)
  })

  // Filter dependencies relevant to this portfolio
  const portfolioDeps = (dependencies || []).filter(dep =>
    dep.from === portfolio.id || dep.to === portfolio.id ||
    dep.portfolios?.includes(portfolio.id)
  )

  // Determine which service intelligence sections have real data
  const si = serviceIntel || {}
  const showSEND = hasData.send(si.sendProjection)
  const showASC = hasData.asc(si.ascProjection)
  const showHighway = hasData.highway(si.highwayTrajectory)
  const showWaste = hasData.waste(si.wasteComparison)
  const showChildren = hasData.children(si.childrenProjection)
  const showPH = hasData.ph(si.phProjection)
  const showProperty = hasData.property(si.propertyProjection)
  const showIntervention = hasData.interventionROI(si.interventionROI)
  const showLAC = hasData.lac(si.lacOptimisation)
  const showASCMarket = hasData.ascMarket(si.ascMarket)
  const showCHC = hasData.chc(si.chcRecovery)
  const hasAnyServiceIntel = showSEND || showASC || showHighway || showWaste || showChildren || showPH || showProperty

  // Spending intelligence for this portfolio
  const portfolioSpend = spendingSummary?.by_portfolio?.[portfolio.id]
  const pTopSuppliers = portfolioSpend?.top_suppliers?.slice(0, 5) || []
  const pHHI = portfolioSpend?.hhi || 0
  const pTotalSpend = portfolioSpend?.total || 0
  const pUniqueSuppliers = portfolioSpend?.unique_suppliers || 0
  // Annualise if less than 12 months of data
  const pMonthCount = portfolioSpend?.by_month?.length || 1
  const pAnnualised = pMonthCount < 12 && pTotalSpend > 0 ? (pTotalSpend / pMonthCount) * 12 : pTotalSpend

  // Budget context from budgetsData
  const reserves = Array.isArray(budgetsData?.reserves_trajectory) ? budgetsData.reserves_trajectory : []
  const latestReserves = reserves[reserves.length - 1]

  // Collect all political_framing texts from levers for communication section
  const communicationPoints = levers
    .filter(l => l.evidence?.political_framing)
    .map(l => ({ lever: l.lever, framing: l.evidence.political_framing, saving: l.est_saving }))

  return (
    <Document>
      {/* ─── COVER ─── */}
      <CoverPage
        title={title}
        subtitle="Portfolio Intelligence Briefing"
        meta={`${portfolio.cabinet_member?.name || 'Cabinet Member'} | Budget: ${formatCurrency(budget)} | Savings Pipeline: ${formatCurrency(totalSavings)} | ${levers.length} savings levers | Generated ${new Date().toLocaleDateString('en-GB')}`}
        classification="CONFIDENTIAL - CABINET USE ONLY"
        councilName={councilName || 'Lancashire County Council'}
      />

      {/* ─── PAGE 2: Portfolio Overview ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
        <PDFHeader title={title} subtitle="Portfolio Overview" classification="CABINET" />

        <StatsRow>
          <StatCard value={formatCurrency(budget)} label="Total Budget" />
          <StatCard value={formatCurrency(totalSavings)} label="Savings Identified" color={COLORS.success} />
          <StatCard value={formatCurrency(immediateSavings)} label="Immediate Wins" color={COLORS.warning} />
          <StatCard value={(directives || []).length.toString()} label="Active Directives" />
        </StatsRow>

        {/* Portfolio Details */}
        <Card>
          <KeyValue label="Cabinet Member" value={portfolio.cabinet_member?.name || '-'} color={COLORS.accent} />
          <KeyValue label="Lead Officer" value={portfolio.lead_officer?.name || '-'} />
          <KeyValue label="Directorate" value={portfolio.directorate || '-'} />
          {portfolio.statutory_duties?.length > 0 && (
            <View>
              <Divider />
              <SubsectionHeading title="Statutory Duties" />
              <BulletList items={portfolio.statutory_duties.slice(0, 6).map(d => typeof d === 'string' ? d : d.duty || d.description || '')} />
            </View>
          )}
        </Card>

        {/* Demand Pressures */}
        {portfolio.demand_pressures?.length > 0 && (
          <View>
            <SectionHeading title="Demand Pressures" />
            {portfolio.demand_pressures.slice(0, 5).map((dp, i) => (
              <Card key={i}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.warning }}>
                  {typeof dp === 'string' ? dp : dp.pressure || dp.title || ''}
                </Text>
                {typeof dp === 'object' && dp.detail && (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textSecondary, marginTop: 2 }}>{dp.detail}</Text>
                )}
                {typeof dp === 'object' && dp.trend && (
                  <Text style={{ fontSize: FONT.micro, color: dp.trend === 'increasing' ? COLORS.danger : COLORS.success }}>
                    Trend: {dp.trend}
                  </Text>
                )}
              </Card>
            ))}
          </View>
        )}

        {/* Quantified Demand Pressures from engine */}
        {demandPressures?.total_annual > 0 && (
          <Card highlight>
            <SubsectionHeading title="Demand Quantification" />
            <KeyValue label="Annual Demand Pressure" value={formatCurrency(demandPressures.total_annual)} color={COLORS.danger} />
            {demandPressures.demand_growth_rate > 0 && <KeyValue label="Growth Rate" value={formatPct(demandPressures.demand_growth_rate)} color={COLORS.danger} />}
            {demandPressures.unfunded_gap > 0 && <KeyValue label="Unfunded Gap" value={formatCurrency(demandPressures.unfunded_gap)} color={COLORS.danger} />}
          </Card>
        )}

        {/* Workforce Summary */}
        {workforce?.fte_headcount > 0 && (
          <View>
            <SectionHeading title="Workforce" />
            <StatsRow>
              <StatCard label="FTE Headcount" value={formatNumber(workforce.fte_headcount)} />
              <StatCard label="Vacancy Rate" value={`${workforce.vacancy_rate_pct}%`} color={workforce.vacancy_rate_pct > 10 ? COLORS.danger : COLORS.textPrimary} />
              <StatCard label="Agency Spend" value={formatCurrency(workforce.agency_spend)} color={workforce.agency_spend > 2000000 ? COLORS.danger : COLORS.textPrimary} />
            </StatsRow>
            <Card>
              <KeyValue label="Agency FTE" value={formatNumber(workforce.agency_fte)} />
              <KeyValue label="Average Salary" value={formatCurrency(workforce.average_salary)} />
              <KeyValue label="Span of Control" value={workforce.span_of_control ? `1:${workforce.span_of_control}` : '-'} />
              <KeyValue label="Management Layers" value={workforce.management_layers?.toString() || '-'} />
              <KeyValue label="Payscale Range" value={workforce.payscale_range || '-'} />
              <KeyValue label="Voluntary Turnover" value={`${workforce.voluntary_turnover_pct}%`} color={workforce.voluntary_turnover_pct > 15 ? COLORS.danger : COLORS.textPrimary} />
            </Card>
          </View>
        )}

        {/* Spending Intelligence */}
        {pTotalSpend > 0 && (
          <View>
            <SectionHeading title="Spending Intelligence" />
            <StatsRow>
              <StatCard label="Actual Spend" value={formatCurrency(pTotalSpend)} />
              <StatCard label="Suppliers" value={pUniqueSuppliers.toString()} />
              <StatCard label="HHI" value={Math.round(pHHI).toString()} color={pHHI > 2500 ? COLORS.danger : pHHI > 1500 ? COLORS.warning : COLORS.success} />
            </StatsRow>
            {pTopSuppliers.length > 0 ? (
              <Card>
                <SubsectionHeading title="Top 5 Suppliers" />
                <HorizontalBarChart
                  data={pTopSuppliers.map((s, i) => ({
                    label: (s.name || s.supplier || 'Unknown').substring(0, 22),
                    value: s.total || s.amount || 0,
                    color: COLORS.chart[i % COLORS.chart.length],
                  }))}
                  maxBars={5}
                />
              </Card>
            ) : <View />}
            {budget > 0 ? (
              <Card accent>
                <KeyValue label="Budget" value={formatCurrency(budget)} />
                <KeyValue label="Spend to Date" value={formatCurrency(pTotalSpend)} />
                {pMonthCount < 12 ? <KeyValue label="Annualised" value={formatCurrency(pAnnualised)} color={COLORS.warning} /> : <View />}
                <KeyValue
                  label="Variance (annualised vs budget)"
                  value={`${((pAnnualised - budget) / budget * 100) > 0 ? '+' : ''}${((pAnnualised - budget) / budget * 100).toFixed(1)}%`}
                  color={Math.abs((pAnnualised - budget) / budget) > 0.1 ? COLORS.danger : COLORS.success}
                />
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
                  Based on {pMonthCount} month{pMonthCount !== 1 ? 's' : ''} of data | {pUniqueSuppliers} unique suppliers
                </Text>
              </Card>
            ) : <View />}
          </View>
        )}

        {/* Budget Context */}
        {latestReserves ? (
          <Card>
            <SubsectionHeading title="Council Reserves Context" />
            <KeyValue label="Reserves" value={formatCurrency(latestReserves.total)} />
            <KeyValue label="Months Cover" value={`${latestReserves.months_cover} months`} color={latestReserves.months_cover < 3 ? COLORS.danger : COLORS.success} />
            <KeyValue label="Adequacy" value={latestReserves.adequacy_rating || '-'} color={latestReserves.adequacy_rating === 'Low' ? COLORS.danger : COLORS.success} />
          </Card>
        ) : <View />}

        <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
      </Page>

      {/* ─── PAGE 3: Savings Pipeline ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
        <PDFHeader title={title} subtitle="Savings Pipeline & Directives" classification="CABINET" />

        {/* Top Directives Table */}
        <SectionHeading title="Priority Directives" />
        <Table
          columns={[
            { key: 'action', label: 'Action', flex: 3 },
            { key: 'savings', label: 'Savings', width: 65, align: 'right', bold: true },
            { key: 'timeline', label: 'Timeline', width: 70 },
            { key: 'route', label: 'Route', width: 60 },
          ]}
          rows={(directives || []).sort((a, b) => (b.save_central || 0) - (a.save_central || 0)).slice(0, 15).map(d => ({
            action: d.action?.substring(0, 70) || '-',
            savings: formatCurrency(d.save_central || 0),
            timeline: d.timeline || '-',
            route: d.route || governanceRoute(d.save_central || 0),
          }))}
        />

        {/* By Category */}
        {Object.entries(byCategory).map(([cat, items]) => {
          const catSavings = items.reduce((s, d) => s + (d.save_central || 0), 0)
          return (
            <Card key={cat}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.textPrimary }}>
                  {cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                  {formatCurrency(catSavings)}
                </Text>
              </View>
              <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                {items.length} directive{items.length !== 1 ? 's' : ''}
              </Text>
              <ProgressBar value={catSavings} max={totalSavings || 1} color={COLORS.accent} showPct={false} />
            </Card>
          )
        })}

        {/* Evidence Chain Strength */}
        {evidenceStrengths?.length > 0 && evidenceStrengths.some(e => e.strength > 0) && (
          <View>
            <SectionHeading title="Evidence Chain Confidence" />
            {evidenceStrengths.filter(e => e.strength > 0).slice(0, 10).map((e, i) => (
              <View key={i} style={{ marginBottom: 3 }}>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, marginBottom: 1 }}>
                  {e.action?.substring(0, 60) || '-'}
                </Text>
                <ProgressBar
                  value={e.strength}
                  max={100}
                  label={`${e.strength}/100`}
                  color={e.strength >= 70 ? COLORS.success : e.strength >= 40 ? COLORS.warning : COLORS.danger}
                />
              </View>
            ))}
          </View>
        )}

        <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
      </Page>

      {/* ─── PAGE 4: Governance & Decisions ─── */}
      {(upcomingDecisions?.length > 0 || portfolioDeps.length > 0) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Governance & Decision Pipeline" classification="CABINET" />

          {upcomingDecisions?.length > 0 && (
            <View>
              <SectionHeading title="Upcoming Decisions" />
              <Table
                columns={[
                  { key: 'title', label: 'Decision', flex: 3 },
                  { key: 'date', label: 'Date', width: 65 },
                  { key: 'committee', label: 'Committee', width: 80 },
                  { key: 'type', label: 'Type', width: 60 },
                ]}
                rows={(upcomingDecisions || []).slice(0, 10).map(d => ({
                  title: (d.title || d.subject || '-').substring(0, 60),
                  date: d.date ? new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '-',
                  committee: d.committee || '-',
                  type: d.type || d.decision_type || '-',
                }))}
              />
            </View>
          )}

          <SectionHeading title="Governance Routing" />
          <Card>
            <BulletList items={[
              '> £1M savings = Full Council approval',
              '> £500K = Cabinet Key Decision',
              '> £250K = Executive Director delegation',
              '< £250K = Officer delegation',
            ]} color={COLORS.accent} />
          </Card>
          <Table
            columns={[
              { key: 'action', label: 'Directive', flex: 3, bold: true },
              { key: 'savings', label: 'Savings', width: 65, align: 'right' },
              { key: 'route', label: 'Route', width: 80 },
            ]}
            rows={(directives || []).sort((a, b) => (b.save_central || 0) - (a.save_central || 0)).slice(0, 8).map(d => ({
              action: d.action?.substring(0, 60) || '-',
              savings: formatCurrency(d.save_central || 0),
              route: d.route || governanceRoute(d.save_central || 0),
            }))}
            filterEmptyColumns
          />

          {portfolioDeps.length > 0 && (
            <View>
              <SectionHeading title="Cross-Portfolio Dependencies" />
              {portfolioDeps.slice(0, 5).map((dep, i) => (
                <Card key={i}>
                  <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.accent }}>
                    {dep.description || dep.title || `${dep.from} > ${dep.to}`}
                  </Text>
                  {dep.risk && (
                    <Text style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 2 }}>
                      Risk: {dep.risk}
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 5: Service Intelligence (CONDITIONAL per model) ─── */}
      {hasAnyServiceIntel && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Service Intelligence" classification="CABINET" />

          {/* SEND Cost Intelligence - only for education_skills */}
          {showSEND && (
            <View>
              <SectionHeading title="SEND Cost Intelligence" />
              <Card highlight>
                {si.sendProjection.base_year_cost > 0 && <KeyValue label="Base Year Cost" value={formatCurrency(si.sendProjection.base_year_cost)} />}
                <KeyValue label="5yr Total Cost" value={formatCurrency(si.sendProjection.total_5yr_cost)} color={COLORS.danger} />
                {si.sendProjection.growth_rate > 0 && <KeyValue label="Annual Growth" value={formatPct(si.sendProjection.growth_rate)} color={COLORS.danger} />}
                {si.sendProjection.cost_driver_breakdown && Object.entries(si.sendProjection.cost_driver_breakdown).filter(([, v]) => v > 0).slice(0, 5).map(([k, v]) => (
                  <KeyValue key={k} label={k.replace(/_/g, ' ')} value={formatCurrency(v)} />
                ))}
                {si.sendProjection.dsg_trajectory && (
                  <KeyValue label="DSG Deficit Trajectory" value={si.sendProjection.dsg_trajectory} color={COLORS.warning} />
                )}
              </Card>
              {showIntervention && (
                <Card>
                  <SubsectionHeading title="Early Intervention ROI" />
                  <KeyValue label="Investment Required" value={formatCurrency(si.interventionROI.intervention_cost)} />
                  <KeyValue label="Annual Return" value={formatCurrency(si.interventionROI.net_saving)} color={COLORS.success} />
                  {si.interventionROI.children_diverted > 0 && <KeyValue label="Children Diverted" value={si.interventionROI.children_diverted.toString()} />}
                  {si.interventionROI.payback_years > 0 && <KeyValue label="Payback Period" value={`${si.interventionROI.payback_years} years`} />}
                </Card>
              )}
              {showLAC && (
                <Card>
                  <SubsectionHeading title="LAC Placement Optimisation" />
                  <KeyValue label="Current Cost" value={formatCurrency(si.lacOptimisation.current_cost)} />
                  <KeyValue label="Optimised Cost" value={formatCurrency(si.lacOptimisation.optimised_cost)} />
                  <KeyValue label="Potential Saving" value={formatCurrency(si.lacOptimisation.saving)} color={COLORS.success} />
                  {si.lacOptimisation.saving_pct > 0 && <KeyValue label="Saving %" value={formatPct(si.lacOptimisation.saving_pct)} color={COLORS.success} />}
                </Card>
              )}
            </View>
          )}

          {/* ASC Demand Intelligence - only for adult_social_care */}
          {showASC && (
            <View>
              <SectionHeading title="ASC Demand Intelligence" />
              <Card highlight>
                {si.ascProjection.base_cost > 0 && <KeyValue label="Base Year Cost" value={formatCurrency(si.ascProjection.base_cost)} />}
                <KeyValue label="5yr Total Growth" value={formatCurrency(si.ascProjection.total_growth)} color={COLORS.danger} />
                {si.ascProjection.blended_growth_rate > 0 && <KeyValue label="Blended Growth Rate" value={formatPct(si.ascProjection.blended_growth_rate)} />}
                {si.ascProjection.yearly?.slice(0, 3).map((y, i) => (
                  <KeyValue key={i} label={`Year ${y.year || i + 1}`} value={formatCurrency(y.total_cost)} />
                ))}
              </Card>
              {showASCMarket && (
                <Card>
                  <SubsectionHeading title="Market Risk Assessment" />
                  <KeyValue label="Risk Level" value={si.ascMarket.risk_level} color={riskColor(si.ascMarket.risk_level)} />
                  <KeyValue label="Risk Score" value={`${si.ascMarket.risk_score}/100`} />
                  {si.ascMarket.provider_count > 0 && <KeyValue label="Provider Count" value={si.ascMarket.provider_count.toString()} />}
                  {si.ascMarket.vacancy_rate > 0 && <KeyValue label="Vacancy Rate" value={formatPct(si.ascMarket.vacancy_rate)} />}
                  {si.ascMarket.fair_cost_gap > 0 && <KeyValue label="Fair Cost Gap" value={formatCurrency(si.ascMarket.fair_cost_gap)} color={COLORS.danger} />}
                  {si.ascMarket.inflation_pressure > 0 && <KeyValue label="Inflation Pressure" value={formatCurrency(si.ascMarket.inflation_pressure)} color={COLORS.warning} />}
                </Card>
              )}
              {showCHC && (
                <Card>
                  <SubsectionHeading title="CHC Recovery Pipeline" />
                  <KeyValue label="Current Recovery" value={formatCurrency(si.chcRecovery.current_income)} />
                  <KeyValue label="Target Recovery" value={formatCurrency(si.chcRecovery.target_income)} color={COLORS.accent} />
                  <KeyValue label="Recovery Gap" value={formatCurrency(si.chcRecovery.gap)} color={COLORS.success} />
                  <KeyValue label="Net Benefit" value={formatCurrency(si.chcRecovery.net_benefit)} color={COLORS.success} />
                  {si.chcRecovery.implementation_cost > 0 && <KeyValue label="Implementation Cost" value={formatCurrency(si.chcRecovery.implementation_cost)} />}
                </Card>
              )}
            </View>
          )}

          {/* Children's Services - only for children_families */}
          {showChildren && (
            <View>
              <SectionHeading title="Children's Services Intelligence" />
              <Card highlight>
                {si.childrenProjection.base_cost > 0 && <KeyValue label="Base Year Cost" value={formatCurrency(si.childrenProjection.base_cost)} />}
                <KeyValue label="5yr Total Cost" value={formatCurrency(si.childrenProjection.total_5yr_cost)} color={COLORS.danger} />
                {si.childrenProjection.growth_rate > 0 && <KeyValue label="Annual Growth" value={formatPct(si.childrenProjection.growth_rate)} color={COLORS.danger} />}
                {si.childrenProjection.yearly?.slice(0, 3).map((y, i) => (
                  <KeyValue key={i} label={`Year ${y.year || i + 1}`} value={formatCurrency(y.total_cost || y.cost)} />
                ))}
                {si.childrenProjection.wocl_trajectory?.length > 0 && (
                  <View style={{ marginTop: SPACE.xs }}>
                    <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold }}>WOCL Programme Trajectory</Text>
                    {si.childrenProjection.wocl_trajectory.slice(0, 3).map((w, i) => (
                      <KeyValue key={i} label={`Year ${w.year || i + 1}`} value={`${w.homes || '-'} homes, saving ${formatCurrency(w.saving || 0)}`} />
                    ))}
                  </View>
                )}
              </Card>
            </View>
          )}

          {/* Public Health - only for health_wellbeing */}
          {showPH && (
            <View>
              <SectionHeading title="Public Health Intelligence" />
              <Card highlight>
                <KeyValue label="Base Grant" value={formatCurrency(si.phProjection.base_grant)} />
                {si.phProjection.grant_decline_5yr > 0 && <KeyValue label="5yr Grant Decline" value={formatCurrency(si.phProjection.grant_decline_5yr)} color={COLORS.danger} />}
                {si.phProjection.total_prevention_roi > 0 && <KeyValue label="Prevention ROI" value={formatCurrency(si.phProjection.total_prevention_roi)} color={COLORS.success} />}
                {si.phProjection.monopoly_risk_value > 0 && <KeyValue label="Monopoly Risk" value={formatCurrency(si.phProjection.monopoly_risk_value)} color={COLORS.warning} />}
              </Card>
            </View>
          )}

          {/* Property Estate - only for resources */}
          {showProperty && (
            <View>
              <SectionHeading title="Property Estate Intelligence" />
              <Card highlight>
                {si.propertyProjection.base_cost > 0 && <KeyValue label="Estate Running Cost" value={formatCurrency(si.propertyProjection.base_cost)} />}
                {si.propertyProjection.disposal_pipeline > 0 && <KeyValue label="Disposal Pipeline" value={formatCurrency(si.propertyProjection.disposal_pipeline)} color={COLORS.success} />}
                {si.propertyProjection.backlog_trajectory > 0 && <KeyValue label="Maintenance Backlog" value={formatCurrency(si.propertyProjection.backlog_trajectory)} color={COLORS.danger} />}
                {si.propertyProjection.co_location_potential > 0 && <KeyValue label="Co-location Saving" value={formatCurrency(si.propertyProjection.co_location_potential)} color={COLORS.success} />}
                {si.propertyProjection.care_home_liability > 0 && <KeyValue label="Care Home Liability" value={formatCurrency(si.propertyProjection.care_home_liability)} color={COLORS.warning} />}
              </Card>
            </View>
          )}

          {/* Highway Asset - only for highways_transport */}
          {showHighway && (
            <View>
              <SectionHeading title="Highway Asset Intelligence" />
              <Card highlight>
                {si.highwayTrajectory.optimal_spend > 0 && <KeyValue label="Optimal Annual Spend" value={formatCurrency(si.highwayTrajectory.optimal_spend)} />}
                {si.highwayTrajectory.current_gap > 0 && <KeyValue label="Investment Gap" value={formatCurrency(si.highwayTrajectory.current_gap)} color={COLORS.danger} />}
                {si.highwayTrajectory.cumulative_shortfall > 0 && <KeyValue label="Cumulative Shortfall" value={formatCurrency(si.highwayTrajectory.cumulative_shortfall)} color={COLORS.danger} />}
                {si.highwayTrajectory.dft_allocation > 0 && <KeyValue label="DfT Allocation" value={formatCurrency(si.highwayTrajectory.dft_allocation)} color={COLORS.success} />}
                {si.highwayTrajectory.managed_service_saving_pct > 0 && <KeyValue label="Managed Service Saving" value={formatPct(si.highwayTrajectory.managed_service_saving_pct)} color={COLORS.success} />}
              </Card>
              {si.highwayTrajectory.condition_trends && (
                <Card>
                  <SubsectionHeading title="Road Condition" />
                  {si.highwayTrajectory.condition_trends.a_roads && <KeyValue label="A Roads (red)" value={`${si.highwayTrajectory.condition_trends.a_roads.red_pct}% (national avg ${si.highwayTrajectory.condition_trends.a_roads.national_avg}%)`} color={si.highwayTrajectory.condition_trends.a_roads.trend === 'deteriorating' ? COLORS.danger : COLORS.textPrimary} />}
                  {si.highwayTrajectory.condition_trends.b_c_roads && <KeyValue label="B/C Roads (red)" value={`${si.highwayTrajectory.condition_trends.b_c_roads.red_pct}% (national avg ${si.highwayTrajectory.condition_trends.b_c_roads.national_avg}%)`} color={si.highwayTrajectory.condition_trends.b_c_roads.trend?.includes('deteriorating') ? COLORS.danger : COLORS.textPrimary} />}
                  {si.highwayTrajectory.condition_trends.unclassified && <KeyValue label="Unclassified (red)" value={`${si.highwayTrajectory.condition_trends.unclassified.red_pct}% (national avg ${si.highwayTrajectory.condition_trends.unclassified.national_avg}%)`} color={COLORS.danger} />}
                </Card>
              )}
              {si.highwayTrajectory.led && (
                <Card>
                  <SubsectionHeading title="LED Programme" />
                  <KeyValue label="Converted" value={`${formatNumber(si.highwayTrajectory.led.converted)} of ${formatNumber(si.highwayTrajectory.led.total_columns)}`} />
                  {si.highwayTrajectory.led.conversion_pct > 0 && <KeyValue label="Conversion" value={formatPct(si.highwayTrajectory.led.conversion_pct)} color={COLORS.success} />}
                  {si.highwayTrajectory.led.dimming_saving_pa > 0 && <KeyValue label="Annual Dimming Saving" value={formatCurrency(si.highwayTrajectory.led.dimming_saving_pa)} color={COLORS.success} />}
                </Card>
              )}
              {si.highwayTrajectory.s59 && si.highwayTrajectory.s59.potential_income > 0 && (
                <Card>
                  <SubsectionHeading title="S59 Enforcement Revenue" />
                  <KeyValue label="Potential Income" value={formatCurrency(si.highwayTrajectory.s59.potential_income)} color={COLORS.success} />
                  {si.highwayTrajectory.s59.utility_works_pa > 0 && <KeyValue label="Utility Works p.a." value={formatNumber(si.highwayTrajectory.s59.utility_works_pa)} />}
                </Card>
              )}
            </View>
          )}

          {/* Waste Disposal - only for environment_communities */}
          {showWaste && (
            <View>
              <SectionHeading title="Waste Disposal Intelligence" />
              <Card highlight>
                <KeyValue label="Current Disposal Cost" value={formatCurrency(si.wasteComparison.current_cost)} />
                {si.wasteComparison.landfill_rate_pct > 0 && <KeyValue label="Landfill Rate" value={`${si.wasteComparison.landfill_rate_pct}% (national avg ${si.wasteComparison.national_avg_landfill_pct}%)`} color={si.wasteComparison.ratio_to_national > 3 ? COLORS.danger : COLORS.warning} />}
                {si.wasteComparison.market_hhi > 0 && <KeyValue label="Market HHI" value={formatNumber(si.wasteComparison.market_hhi)} color={si.wasteComparison.market_hhi > 2500 ? COLORS.danger : COLORS.warning} />}
                {si.wasteComparison.duopoly_pct > 0 && <KeyValue label="Duopoly Market Share" value={formatPct(si.wasteComparison.duopoly_pct)} color={COLORS.danger} />}
              </Card>
              {si.wasteComparison.scenarios.length > 0 && (
                <Card>
                  <SubsectionHeading title="Disposal Scenarios" />
                  {si.wasteComparison.scenarios.map((s, i) => (
                    <KeyValue key={i} label={s.name || `Scenario ${i + 1}`} value={formatCurrency(s.annual_cost)} color={i === 0 ? COLORS.textPrimary : COLORS.success} />
                  ))}
                  {si.wasteComparison.food_waste_impact > 0 && <KeyValue label="Food Waste Mandate Cost" value={formatCurrency(si.wasteComparison.food_waste_impact)} color={COLORS.warning} />}
                  {si.wasteComparison.efw_saving > 0 && <KeyValue label="EfW Potential Saving" value={formatCurrency(si.wasteComparison.efw_saving)} color={COLORS.success} />}
                </Card>
              )}
            </View>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 6: Political & Fiscal Trajectory ─── */}
      {(politicalCtx || (fiscalTrajectory?.yearly?.length > 0)) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Political & Fiscal Intelligence" classification="CABINET" />

          {politicalCtx && (
            <View>
              <SectionHeading title="Political Context" />
              <Card highlight>
                {politicalCtx.scrutiny_level && <KeyValue label="Scrutiny Level" value={politicalCtx.scrutiny_level} color={politicalCtx.scrutiny_level === 'high' ? COLORS.danger : COLORS.warning} />}
                {politicalCtx.media_risk && <KeyValue label="Media Risk" value={politicalCtx.media_risk} color={politicalCtx.media_risk === 'high' ? COLORS.danger : COLORS.warning} />}
                {politicalCtx.opposition_angle && <KeyValue label="Opposition Angle" value={politicalCtx.opposition_angle} />}
              </Card>
              {politicalCtx.talking_points?.length > 0 && (
                <Card>
                  <SubsectionHeading title="Political Talking Points" />
                  <BulletList items={politicalCtx.talking_points.slice(0, 5)} color={COLORS.accent} />
                </Card>
              )}
              {politicalCtx.attack_vectors?.length > 0 && (
                <Card>
                  <SubsectionHeading title="Opposition Attack Vectors" />
                  <BulletList items={politicalCtx.attack_vectors.slice(0, 4)} color={COLORS.danger} />
                </Card>
              )}
            </View>
          )}

          {fiscalTrajectory?.yearly?.length > 0 && (
            <View>
              <SectionHeading title="Net Fiscal Trajectory" />
              <StatsRow>
                {fiscalTrajectory.trajectory && fiscalTrajectory.trajectory !== 'unknown' && <StatCard value={fiscalTrajectory.trajectory} label="Trajectory" color={fiscalTrajectory.trajectory === 'improving' ? COLORS.success : COLORS.danger} />}
                {fiscalTrajectory.breakeven_year && <StatCard value={fiscalTrajectory.breakeven_year.toString()} label="Breakeven Year" />}
                {fiscalTrajectory.net_5yr != null && <StatCard value={formatCurrency(fiscalTrajectory.net_5yr)} label="5yr Net Position" color={fiscalTrajectory.net_5yr >= 0 ? COLORS.success : COLORS.danger} />}
              </StatsRow>
              <Table
                columns={[
                  { key: 'year', label: 'Year', width: 50, bold: true },
                  { key: 'demand', label: 'Demand', width: 70, align: 'right' },
                  { key: 'savings', label: 'Savings', width: 70, align: 'right' },
                  { key: 'net', label: 'Net Position', width: 70, align: 'right' },
                ]}
                rows={fiscalTrajectory.yearly.slice(0, 5).map(y => ({
                  year: (y.year || '-').toString(),
                  demand: formatCurrency(y.demand || y.demand_cost),
                  savings: formatCurrency(y.savings || y.savings_value),
                  net: formatCurrency(y.net || y.net_position),
                  _colors: { net: (y.net || y.net_position || 0) >= 0 ? COLORS.success : COLORS.danger },
                }))}
              />
            </View>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 7: Key Contracts (detailed cards) ─── */}
      {contracts.length > 0 && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Key Contracts" classification="CABINET" />

          <SectionHeading title={`Key Contracts (${contracts.length})`} />
          {contracts.map((c, i) => (
            <Card key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent, flex: 1 }}>
                  {c.name || '-'}
                </Text>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                  {c.value || '-'}
                </Text>
              </View>
              <KeyValue label="Provider" value={c.provider || '-'} />
              <KeyValue label="Duration" value={c.duration || '-'} />
              {c.note && (
                <Text style={{ fontSize: FONT.small, color: COLORS.textSecondary, marginTop: SPACE.xs, lineHeight: 1.4 }}>
                  {c.note}
                </Text>
              )}
              {c.contracts_finder_ids?.length > 0 && (
                <Text style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 2 }}>
                  DOGE tracked: {c.contracts_finder_ids.length} contract{c.contracts_finder_ids.length !== 1 ? 's' : ''} on Contracts Finder
                </Text>
              )}
            </Card>
          ))}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 8+: Savings Levers Detail (evidence chains) ─── */}
      {levers.length > 0 && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Savings Levers Detail" classification="CABINET" />

          <SectionHeading title={`Savings Levers (${levers.length})`} subtitle={`Total estimated savings: ${levers.reduce((s, l) => s + (l.est_saving ? 1 : 0), 0)} levers with costed estimates`} />

          {levers.map((l, i) => (
            <View key={i} style={{ marginBottom: SPACE.md }} wrap={false}>
              {/* Lever header */}
              <View style={{ backgroundColor: COLORS.bgCard, borderRadius: 6, padding: SPACE.md, borderWidth: 1, borderColor: COLORS.borderLight, borderLeftWidth: 3, borderLeftColor: riskColor(l.risk) }}>
                {/* Title row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
                  <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent, flex: 1 }}>
                    {l.lever || l.action || '-'}
                  </Text>
                  <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                    {l.est_saving || '-'}
                  </Text>
                </View>

                {/* Meta row */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACE.xs }}>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>Timeline: {l.timeline || '-'}</Text>
                  <Text style={{ fontSize: FONT.micro, color: riskColor(l.risk) }}>Risk: {l.risk || '-'}</Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>Tier: {tierLabel(l.tier)}</Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>Owner: {l.owner || '-'}</Text>
                </View>

                {/* Description */}
                {l.description && (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, lineHeight: 1.4, marginBottom: SPACE.xs }}>
                    {l.description}
                  </Text>
                )}

                {/* Legal constraints */}
                {l.legal_constraints && (
                  <Text style={{ fontSize: FONT.micro, color: COLORS.warning, marginBottom: SPACE.xs }}>
                    Legal: {l.legal_constraints}
                  </Text>
                )}

                {/* Evidence Chain */}
                {l.evidence && (
                  <View style={{ marginTop: SPACE.xs, paddingTop: SPACE.xs, borderTopWidth: 1, borderTopColor: COLORS.borderLight }}>
                    {/* Data points */}
                    {l.evidence.data_points?.length > 0 && (
                      <View style={{ marginBottom: SPACE.xs }}>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold, marginBottom: 2 }}>EVIDENCE</Text>
                        {l.evidence.data_points.map((dp, di) => (
                          <View key={di} style={{ flexDirection: 'row', marginBottom: 1, paddingLeft: 2 }}>
                            <Text style={{ fontSize: FONT.micro, color: COLORS.accent, width: 8 }}>*</Text>
                            <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, flex: 1, lineHeight: 1.3 }}>{dp}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Benchmark */}
                    {l.evidence.benchmark && (
                      <View style={{ marginBottom: SPACE.xs }}>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold }}>BENCHMARK</Text>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, lineHeight: 1.3 }}>{l.evidence.benchmark}</Text>
                      </View>
                    )}

                    {/* Calculation */}
                    {l.evidence.calculation && (
                      <View style={{ marginBottom: SPACE.xs }}>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold }}>CALCULATION</Text>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, lineHeight: 1.3 }}>{l.evidence.calculation}</Text>
                      </View>
                    )}

                    {/* Implementation steps */}
                    {l.evidence.implementation_steps?.length > 0 && (
                      <View style={{ marginBottom: SPACE.xs }}>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold, marginBottom: 2 }}>IMPLEMENTATION</Text>
                        {l.evidence.implementation_steps.map((st, si2) => (
                          <View key={si2} style={{ flexDirection: 'row', marginBottom: 1, paddingLeft: 2 }}>
                            <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, width: 50 }}>M{st.month}:</Text>
                            <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, flex: 1, lineHeight: 1.3 }}>
                              {st.step}{st.cost ? ` (${st.cost})` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* KPI link */}
                    {l.evidence.kpi_link && (
                      <View style={{ marginBottom: SPACE.xs }}>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold }}>KPI IMPACT</Text>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, lineHeight: 1.3 }}>{l.evidence.kpi_link}</Text>
                      </View>
                    )}

                    {/* Political framing - highlighted */}
                    {l.evidence.political_framing && (
                      <View style={{ backgroundColor: COLORS.bgHighlight, borderRadius: 4, padding: SPACE.xs, marginTop: 2 }}>
                        <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold, marginBottom: 1 }}>PUBLIC MESSAGING</Text>
                        <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.4 }}>
                          "{l.evidence.political_framing}"
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 9: Communication Points (factual, from evidence) ─── */}
      {(communicationPoints.length > 0 || playbook) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Communication & Action Plan" classification="CABINET" />

          {/* Key Communication Points from evidence chains */}
          {communicationPoints.length > 0 && (
            <View>
              <SectionHeading title="Key Communication Points" subtitle="Factual messaging drawn from evidence-backed savings levers" />
              {communicationPoints.slice(0, 8).map((cp, i) => (
                <Card key={i} accent>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.accent, flex: 1 }}>
                      {cp.lever}
                    </Text>
                    <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>
                      {cp.saving}
                    </Text>
                  </View>
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                    "{cp.framing}"
                  </Text>
                </Card>
              ))}
            </View>
          )}

          {/* Reform Playbook */}
          {playbook && (
            <View>
              {playbook.quick_wins?.length > 0 && (
                <View>
                  <SectionHeading title="Quick Wins (0-3 months)" />
                  <BulletList items={playbook.quick_wins.slice(0, 6).map(w => typeof w === 'string' ? w : w.action || w.title || '')} color={COLORS.success} />
                </View>
              )}
              {playbook.structural_reforms?.length > 0 && (
                <View>
                  <SectionHeading title="Structural Reforms (6-18 months)" />
                  <BulletList items={playbook.structural_reforms.slice(0, 6).map(r => typeof r === 'string' ? r : r.action || r.title || '')} color={COLORS.accent} />
                </View>
              )}
            </View>
          )}

          {/* Constituency talking points - only if data-driven */}
          {narrative?.constituency_talking_points?.length > 0 && (
            <View>
              <SectionHeading title="Constituency Talking Points" />
              <BulletList items={narrative.constituency_talking_points} color={COLORS.accent} />
            </View>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}
    </Document>
  )
}
