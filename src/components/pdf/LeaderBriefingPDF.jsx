/**
 * LeaderBriefingPDF - Comprehensive leader overview covering all portfolios.
 *
 * The "Monday Morning" document: fiscal system overview, all directorates,
 * top savings opportunities, MTFS comparison, political impact, key actions.
 *
 * Pages:
 *  P1: Cover
 *  P2: Fiscal System Overview
 *  P3: Monday Morning List
 *  P4: Spending Intelligence (top suppliers, portfolio spend, concentration alerts)
 *  P5: Per-Portfolio Summary
 *  P6: MTFS Comparison
 *  P7: Political Impact
 *  P8: Treasury & Workforce (reserves chart, Band D trend, revenue summary)
 *  P9: Loss Trajectory & Bond Analysis (Statement of Accounts 8-year analysis)
 *  P10: Year-End Sprint (11-day action plan, 20-31 March, addressed to Leader + Cabinet Member for Data & Digital)
 *  P11: Risk Register & Inspections
 *
 * IMPORTANT: @react-pdf/renderer does NOT filter null/undefined/boolean children
 * like React DOM. All conditional rendering uses explicit arrays with .filter(Boolean)
 * or ternary operators, NEVER {condition && <Component>} patterns.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, CoverPage, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, Table, Divider,
  KeyValue, ProgressBar, HorizontalBarChart, VerticalBarChart, DonutChart,
  formatCurrency, formatPct, formatNumber,
} from './PDFComponents.jsx'

export function LeaderBriefingPDF({
  portfolios, directorates, allDirectives, fiscalOverview,
  mtfsComparison, politicalImpact, mondayMorningList, councilName,
  riskProfiles, spendingByDirectorate, totals,
  budgetsData, treasurySummary, workforceSummary, treasuryRaw,
  spendingSummary, lossTrajectory, bondAnalysis,
}) {
  // Aggregate stats
  const totalSavings = (allDirectives || []).reduce((s, d) => s + (d.save_central || 0), 0)
  const immediateDirectives = (allDirectives || []).filter(d => /immediate|0-3/i.test(d.timeline || ''))
  const immediateSavings = immediateDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
  const totalBudget = (portfolios || []).reduce((s, p) => s + (p.budget_total || p.budget?.total || 0), 0)

  // MTFS coverage (savings vs target, matching dashboard)
  const coveragePct = totals?.coveragePct || 0
  // Fiscal system model coverage
  const modelsComplete = fiscalOverview?.service_model_count || 0
  const modelsTotal = fiscalOverview?.total_portfolios || 10
  // Demand-based coverage from fiscal overview (different metric)
  const demandCoveragePct = fiscalOverview?.coverage_pct || 0

  // Transform mtfsComparison into gaps format for rendering
  const fmtCur = v => v != null ? formatCurrency(v) : '-'
  const mtfsGaps = mtfsComparison ? {
    gaps: [
      { area: 'Year 1 Target (2026/27)', mtfs_value: fmtCur(mtfsComparison.mtfs_year1_target),
        doge_value: fmtCur(mtfsComparison.year1_deliverable),
        implication: `Year 1 coverage: ${mtfsComparison.year1_coverage_pct ?? 0}%` },
      { area: 'Two-Year Total', mtfs_value: fmtCur(mtfsComparison.mtfs_two_year_target),
        doge_value: fmtCur(mtfsComparison.identified_central),
        implication: mtfsComparison.gap_or_surplus >= 0 ? `Surplus: ${fmtCur(mtfsComparison.gap_or_surplus)}` : `Gap: ${fmtCur(Math.abs(mtfsComparison.gap_or_surplus))}` },
      { area: 'Cost Pressures (26/27)', mtfs_value: fmtCur(mtfsComparison.cost_pressures),
        doge_value: '-', implication: 'Unfunded demand pressure on top of savings targets' },
      ...(mtfsComparison.prior_year_shortfall > 0 ? [{
        area: 'Prior Year ASC Shortfall', mtfs_value: fmtCur(mtfsComparison.prior_year_shortfall),
        doge_value: '-', implication: 'Carried forward demand not addressed' }] : []),
    ],
    overall_assessment: `AI DOGE identifies ${mtfsComparison.two_year_coverage_pct ?? 0}% of the two-year MTFS target.`
      + (mtfsComparison.gap_or_surplus >= 0
        ? ` Surplus position of ${fmtCur(mtfsComparison.gap_or_surplus)}.`
        : ` Shortfall of ${fmtCur(Math.abs(mtfsComparison.gap_or_surplus))}. Structural reform needed.`)
      + (mtfsComparison.redundancy_provision > 0
        ? ` Redundancy provision: ${fmtCur(mtfsComparison.redundancy_provision)}.`
        : ''),
  } : null

  // ── Spending Intelligence data (from useSpendingSummary) ──
  const topSuppliers = spendingSummary?.top_suppliers?.slice(0, 10) || []
  const spendByPortfolio = spendingSummary?.by_portfolio || {}
  const spendByCategory = spendingSummary?.by_category || spendByPortfolio
  const portfolioSpendRows = (portfolios || [])
    .map(p => {
      const ps = spendByPortfolio[p.id]
      if (!ps?.total) return null
      const budget = p.budget_latest?.gross_expenditure || p.budget_total || p.budget?.total || 0
      // Annualise if less than 12 months of data
      const monthCount = ps.by_month?.length || 1
      const annualised = monthCount < 12 ? (ps.total / monthCount) * 12 : ps.total
      const variancePct = budget > 0 ? Math.round(((annualised - budget) / budget) * 100) : null
      return {
        portfolio: p.short_title || p.title,
        spend: formatCurrency(ps.total),
        annualised: monthCount < 12 ? formatCurrency(annualised) : '-',
        budget: budget > 0 ? formatCurrency(budget) : '-',
        variance: variancePct != null ? `${variancePct > 0 ? '+' : ''}${variancePct}%` : '-',
        suppliers: (ps.unique_suppliers || 0).toString(),
        hhi: ps.hhi ? Math.round(ps.hhi).toString() : '-',
        _colors: {
          variance: variancePct > 10 ? COLORS.danger : variancePct > 5 ? COLORS.warning : variancePct < -10 ? COLORS.accent : COLORS.success,
          hhi: (ps.hhi || 0) > 2500 ? COLORS.danger : (ps.hhi || 0) > 1500 ? COLORS.warning : COLORS.textSecondary,
        },
      }
    })
    .filter(Boolean)

  // Concentration alerts across all portfolios
  const concentrationAlerts = (portfolios || [])
    .map(p => {
      const ps = spendByPortfolio[p.id]
      if (!ps || (ps.hhi || 0) <= 2500) return null
      const topSup = ps.top_suppliers?.[0]
      return `${p.short_title || p.title}: HHI ${Math.round(ps.hhi)} (${topSup?.name || 'unknown'} = ${formatCurrency(topSup?.total || 0)}, ${formatPct(topSup?.pct)} of spend)`
    })
    .filter(Boolean)

  // ── Budget data: Reserves trajectory, Council Tax, Revenue departments ──
  const reservesData = Array.isArray(budgetsData?.reserves_trajectory) ? budgetsData.reserves_trajectory : []
  const ctHistory = budgetsData?.council_tax_history?.band_d_element || {}
  const ctEntries = Object.entries(ctHistory)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-10) // Last 10 years
  const revBudgets = Array.isArray(budgetsData?.revenue_budgets) ? budgetsData.revenue_budgets : []
  const latestRevenue = revBudgets[revBudgets.length - 1] || null
  const topDepts = latestRevenue?.departments
    ? Object.entries(latestRevenue.departments)
        .sort(([, a], [, b]) => (b || 0) - (a || 0))
        .slice(0, 8)
    : []

  // ── Build risk page children safely (no null children) ──
  const riskPageChildren = []
  if (riskProfiles && Object.keys(riskProfiles).length > 0) {
    riskPageChildren.push(<SectionHeading key="rp-h" title="Directorate Risk Profiles" />)
    Object.entries(riskProfiles).filter(([, p]) => p).forEach(([dirId, profile]) => {
      const dirName = (directorates || []).find(d => d.directorate_id === dirId)?.title?.split(',')[0] || dirId
      riskPageChildren.push(
        <Card key={`rp-${dirId}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
            <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>{dirName}</Text>
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: profile.risk_color || COLORS.warning }}>
              {profile.risk_level || '-'} ({profile.risk_score || 0}/100)
            </Text>
          </View>
          {profile.top_risks?.length > 0 ? (
            <BulletList
              items={profile.top_risks.slice(0, 3).map(r => typeof r === 'string' ? r : r.risk || r.title || r.description || '')}
              color={profile.risk_level === 'high' || profile.risk_level === 'critical' ? COLORS.danger : COLORS.warning}
            />
          ) : <View />}
        </Card>
      )
    })
  }
  if (spendingByDirectorate && Object.values(spendingByDirectorate).some(d => d.alerts?.length > 0)) {
    riskPageChildren.push(<SectionHeading key="sa-h" title="Spending Intelligence Alerts" />)
    riskPageChildren.push(
      <Card key="sa-c" highlight>
        <BulletList
          items={Object.entries(spendingByDirectorate).flatMap(([, ds]) =>
            (ds.alerts || []).map(a =>
              a.type === 'variance'
                ? `${a.portfolio}: ${a.pct > 0 ? '+' : ''}${a.pct}% budget variance, investigate immediately`
                : `${a.portfolio}: HHI ${a.hhi} supplier concentration (top: ${a.top})`
            )
          ).slice(0, 8)}
          color={COLORS.danger}
        />
      </Card>
    )
  }

  // Portfolio risks
  const portfolioRiskCards = (portfolios || [])
    .filter(p => (p.known_pressures || p.demand_pressures || []).length > 0)
    .map((p, i) => (
      <Card key={`pr-${i}`}>
        <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
          {p.short_title || p.title}
        </Text>
        <BulletList
          items={(p.known_pressures || p.demand_pressures).slice(0, 3).map(r => typeof r === 'string' ? r : r.pressure || r.title || '')}
          color={COLORS.warning}
        />
      </Card>
    ))

  // Inspection status
  const inspectionSection = fiscalOverview?.inspection_summary?.length > 0 ? [
    <SectionHeading key="ins-h" title="Inspection Status" />,
    <Table key="ins-t"
      columns={[
        { key: 'portfolio', label: 'Portfolio', flex: 2, bold: true },
        { key: 'rating', label: 'Current', width: 90 },
        { key: 'target', label: 'Target', width: 90 },
      ]}
      rows={fiscalOverview.inspection_summary.map(ins => ({
        portfolio: ins.portfolio || '-',
        rating: ins.current_rating || '-',
        target: ins.target_rating || '-',
        _colors: {
          rating: ins.current_rating?.toLowerCase().includes('requires') ? COLORS.danger
            : ins.current_rating?.toLowerCase().includes('good') ? COLORS.success : COLORS.warning,
        },
      }))}
      filterEmptyColumns
    />,
  ] : []

  // ── Treasury page children (built as array, no null children) ──
  const treasuryChildren = []

  // Treasury position from raw data
  if (treasuryRaw) {
    treasuryChildren.push(<SectionHeading key="tr-h" title="Treasury Position" />)
    treasuryChildren.push(
      <StatsRow key="tr-s">
        <StatCard label="Total Borrowing" value={formatCurrency(treasuryRaw.total_borrowing)} />
        <StatCard label="Debt Service" value={`${formatCurrency(treasuryRaw.annual_debt_service)}/yr`} />
        <StatCard label="Cash Balances" value={formatCurrency(treasuryRaw.cash_balances_average)} />
      </StatsRow>
    )
    treasuryChildren.push(
      <Card key="tr-c">
        <Table
          columns={[
            { key: 'metric', label: 'Treasury Metric', flex: 2, bold: true },
            { key: 'value', label: 'Current', width: 120 },
            { key: 'note', label: 'Action', flex: 2 },
          ]}
          rows={[
            { metric: 'Average Interest Rate', value: `${treasuryRaw.average_interest_rate_pct}%`, note: `Legacy loans at ${treasuryRaw.average_legacy_rate_pct}% vs current ${treasuryRaw.current_pwlb_rate_pct}%` },
            { metric: 'Investment Income', value: formatCurrency(treasuryRaw.investment_income_actual), note: `Benchmark: ${formatCurrency(treasuryRaw.investment_income_benchmark)}` },
            { metric: 'MRP Method', value: treasuryRaw.mrp_method || 'regulatory', note: `Asset life method saves ${formatCurrency(treasuryRaw.asset_life_mrp_saving)}/yr` },
            { metric: 'Idle Cash Opportunity', value: formatCurrency(treasuryRaw.idle_cash_opportunity || 0), note: 'Move to MMFs and short gilts' },
          ]}
          filterEmptyColumns
        />
      </Card>
    )
    if (treasurySummary) {
      treasuryChildren.push(
        <Card key="tr-ts" accent>
          <SubsectionHeading title="Treasury Savings Identified" />
          <BulletList items={[
            `Idle cash optimisation: ${formatCurrency(treasurySummary.idle_cash_cost)}`,
            `Debt refinancing potential: ${formatCurrency(treasurySummary.refinancing_potential)}`,
            `MRP method switch: ${formatCurrency(treasurySummary.mrp_method_saving)}`,
            `Total treasury savings: ${formatCurrency(treasurySummary.total)}`,
          ]} color={COLORS.success} />
        </Card>
      )
    }
  }

  // Reserves trajectory chart (from budgets.json)
  if (reservesData.length > 0) {
    treasuryChildren.push(<SectionHeading key="res-h" title="Reserves Trajectory" />)
    treasuryChildren.push(
      <Card key="res-chart">
        <HorizontalBarChart
          data={reservesData.map(r => ({
            label: r.year,
            value: r.total || 0,
            color: r.adequacy_rating === 'Adequate' ? COLORS.success
              : r.adequacy_rating === 'Low' ? COLORS.danger : COLORS.warning,
          }))}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.xs }}>
          <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
            Latest: {reservesData[reservesData.length - 1]?.months_cover} months cover
          </Text>
          <Text style={{ fontSize: FONT.micro, color: reservesData[reservesData.length - 1]?.adequacy_rating === 'Adequate' ? COLORS.success : COLORS.danger }}>
            Rating: {reservesData[reservesData.length - 1]?.adequacy_rating}
          </Text>
        </View>
      </Card>
    )
  }

  // Council Tax Band D trend (from budgets.json)
  if (ctEntries.length > 0) {
    treasuryChildren.push(<SectionHeading key="ct-h" title="Council Tax Band D Trend (10 Years)" />)
    treasuryChildren.push(
      <Card key="ct-chart">
        <VerticalBarChart
          data={ctEntries.map(([yr, val]) => ({
            label: yr.replace('20', '').replace('/', '/'),
            value: val,
            color: COLORS.accent,
          }))}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.xs }}>
          <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
            {ctEntries[0]?.[0]}: {'\u00A3'}{Number(ctEntries[0]?.[1]).toFixed(2)}
          </Text>
          <Text style={{ fontSize: FONT.micro, color: COLORS.accent, fontFamily: FONT.bold }}>
            {ctEntries[ctEntries.length - 1]?.[0]}: {'\u00A3'}{Number(ctEntries[ctEntries.length - 1]?.[1]).toFixed(2)}
          </Text>
        </View>
      </Card>
    )
  }

  // Revenue budget departments (latest year)
  if (topDepts.length > 0) {
    treasuryChildren.push(<SectionHeading key="rev-h" title={`Revenue Budget ${latestRevenue.financial_year || ''}`} />)
    treasuryChildren.push(
      <Card key="rev-chart">
        <HorizontalBarChart
          data={topDepts.map(([dept, val], i) => ({
            label: dept.replace(' services', '').replace('and related', ''),
            value: val || 0,
            color: COLORS.chart[i % COLORS.chart.length],
          }))}
        />
      </Card>
    )
  }

  // Workforce overview
  if (workforceSummary) {
    treasuryChildren.push(<SectionHeading key="wf-h" title="Workforce Overview" />)
    treasuryChildren.push(
      <StatsRow key="wf-s">
        <StatCard label="Total FTE" value={formatNumber(workforceSummary.fte)} />
        <StatCard label="Vacancies" value={formatNumber(workforceSummary.vacancies)} />
        <StatCard label="Agency Spend" value={formatCurrency(workforceSummary.agency_spend)} />
      </StatsRow>
    )
    treasuryChildren.push(
      <Card key="wf-c">
        <Table
          columns={[
            { key: 'portfolio', label: 'Portfolio', flex: 2, bold: true },
            { key: 'fte', label: 'FTE', width: 60, align: 'right' },
            { key: 'vacancy', label: 'Vacancy %', width: 70, align: 'right' },
            { key: 'agency', label: 'Agency', width: 90, align: 'right' },
            { key: 'span', label: 'Span', width: 50, align: 'right' },
          ]}
          rows={(portfolios || []).filter(p => p.workforce).map(p => ({
            portfolio: p.short_title || p.title,
            fte: formatNumber(p.workforce.fte_headcount),
            vacancy: `${p.workforce.vacancy_rate_pct}%`,
            agency: formatCurrency(p.workforce.agency_spend),
            span: p.workforce.span_of_control ? `1:${p.workforce.span_of_control}` : '-',
            _colors: {
              vacancy: p.workforce.vacancy_rate_pct > 10 ? COLORS.danger : p.workforce.vacancy_rate_pct > 7 ? COLORS.warning : COLORS.success,
              agency: p.workforce.agency_spend > 5000000 ? COLORS.danger : COLORS.textSecondary,
            },
          }))}
          filterEmptyColumns
        />
      </Card>
    )
  }

  // ── Build fiscal page inner children safely ──
  const fiscalInnerChildren = [
    totals ? (
      <Card key="mtfs-card" highlight>
        <SubsectionHeading title="MTFS Position" />
        <StatsRow>
          <StatCard value={formatCurrency(totals.mtfsTarget)} label="Year 1 Target" />
          <StatCard value={formatCurrency(totals.midpoint)} label="Identified (midpoint)" color={COLORS.success} />
          <StatCard value={`${totals.priorPct}%`} label="Prior Year Delivery" color={totals.priorPct >= 80 ? COLORS.success : COLORS.danger} />
          <StatCard value={formatCurrency(totals.priorGap)} label="Prior Year Gap" color={COLORS.danger} />
        </StatsRow>
        <ProgressBar value={totals.midpoint} max={totals.mtfsTarget || 1} label={`${coveragePct}% of MTFS target`} color={coveragePct >= 100 ? COLORS.success : COLORS.danger} showPct />
      </Card>
    ) : null,
    fiscalOverview ? (
      <Card key="fiscal-health">
        <SubsectionHeading title="Demand vs Savings Assessment" />
        {[
          <KeyValue key="td" label="Quantified Demand Pressure" value={formatCurrency(fiscalOverview.total_demand)} color={COLORS.danger} />,
          <KeyValue key="ts" label="Savings vs Demand" value={`${demandCoveragePct}%`} color={demandCoveragePct >= 100 ? COLORS.success : COLORS.warning} />,
          fiscalOverview.net_position != null ? <KeyValue key="np" label="Net Position" value={formatCurrency(fiscalOverview.net_position)} color={fiscalOverview.net_position >= 0 ? COLORS.success : COLORS.danger} /> : null,
          fiscalOverview.net_trajectory ? <KeyValue key="nt" label="Net Fiscal Trajectory" value={fiscalOverview.net_trajectory} /> : null,
        ].filter(Boolean)}
      </Card>
    ) : null,
  ].filter(Boolean)

  // ─── Build all pages as an array, then filter(Boolean) to remove nulls ───
  const allPages = [
    // Cover
    <CoverPage
      key="cover"
      title="Leader's Briefing"
      subtitle="Lancashire County Council: Reform Operations Command"
      meta={[
        `${(portfolios || []).length} portfolios`,
        `${formatCurrency(totalSavings)} savings identified (range: ${formatCurrency(totals?.totalLow || 0)}-${formatCurrency(totals?.totalHigh || 0)})`,
        `${coveragePct}% MTFS coverage`,
        spendingSummary?.total_spend ? `${formatCurrency(spendingSummary.total_spend)} spending analysed (${formatNumber(spendingSummary.record_count || 0)} transactions)` : null,
        `Generated ${new Date().toLocaleDateString('en-GB')}`,
      ].filter(Boolean).join(' | ')}
      classification="CONFIDENTIAL - LEADER USE ONLY"
      councilName={councilName || 'Lancashire County Council'}
    />,

    // PAGE 2: Fiscal System Overview (always shown)
    <Page key="fiscal" size="A4" style={styles.page}>
      <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
      <PDFHeader title="Fiscal System Overview" subtitle="Reform Operations Command" classification="LEADER" />
      <StatsRow>
        <StatCard value={formatCurrency(totalBudget)} label="Total Budget" />
        <StatCard value={formatCurrency(totalSavings)} label="Savings Identified" color={COLORS.success} detail={`Range: ${formatCurrency(totals?.totalLow || 0)}-${formatCurrency(totals?.totalHigh || 0)}`} />
        <StatCard value={formatCurrency(immediateSavings)} label="Immediate Wins" color={COLORS.warning} detail={`${immediateDirectives.length} actions, 0-6 months`} />
        <StatCard value={`${coveragePct}%`} label="MTFS Coverage" color={coveragePct >= 100 ? COLORS.success : coveragePct >= 80 ? COLORS.warning : COLORS.danger} detail={`${formatCurrency(totals?.midpoint || 0)} of ${formatCurrency(totals?.mtfsTarget || 0)}`} />
      </StatsRow>
      {fiscalInnerChildren}
      <SectionHeading title="Directorate Summary" />
      <Table
        columns={[
          { key: 'name', label: 'Directorate', flex: 2, bold: true },
          { key: 'portfolios', label: 'Port.', width: 35, align: 'right' },
          { key: 'budget', label: 'Budget', width: 60, align: 'right' },
          { key: 'savings', label: 'Savings Range', width: 85, align: 'right' },
          { key: 'coverage', label: 'Coverage', width: 50, align: 'right' },
          { key: 'evidence', label: 'Evid.', width: 40, align: 'right' },
          { key: 'risk', label: 'Risk', width: 45 },
        ]}
        rows={(directorates || []).map(d => {
          const riskLevel = d.risk_level || riskProfiles?.[d.directorate_id]?.risk_level || '-'
          return {
            name: (d.title || d.name || d.id || '-').split(',')[0],
            portfolios: d.portfolio_count?.toString() || '-',
            budget: formatCurrency(d.net_budget || d.total_budget),
            savings: d.savings_range ? `${formatCurrency(d.savings_range.low)}-${formatCurrency(d.savings_range.high)}` : formatCurrency(d.total_savings || 0),
            coverage: `${d.coverage_pct || 0}%`,
            evidence: `${d.avg_evidence_strength || 0}%`,
            risk: riskLevel,
            _colors: {
              risk: riskLevel === 'high' || riskLevel === 'critical' ? COLORS.danger
                : riskLevel === 'medium' ? COLORS.warning : COLORS.success,
              coverage: (d.coverage_pct || 0) >= 100 ? COLORS.success : (d.coverage_pct || 0) >= 80 ? COLORS.warning : COLORS.danger,
            },
          }
        })}
        filterEmptyColumns
      />
      <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
    </Page>,

    // PAGE 3: Monday Morning List (always shown)
    <Page key="monday" size="A4" style={styles.page}>
      <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
      <PDFHeader title="Monday Morning List" subtitle={`Top ${Math.min(15, (mondayMorningList || immediateDirectives).length)} Priority Actions`} classification="LEADER" />
      {(mondayMorningList || immediateDirectives).slice(0, 15).map((d, i) => (
        <Card key={i} accent={i < 3}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 3 }}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: i < 3 ? COLORS.accent : COLORS.textPrimary }}>
                {i + 1}. {d.action?.substring(0, 90) || '-'}
              </Text>
              <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
                {d.portfolio_title || d.portfolio || '-'} | {d.category?.replace(/_/g, ' ') || '-'} | {d.timeline || '-'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', minWidth: 65 }}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                {formatCurrency(d.save_central || 0)}
              </Text>
              <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                {d.save_low && d.save_high ? `${formatCurrency(d.save_low)}-${formatCurrency(d.save_high)}` : '-'}
              </Text>
            </View>
          </View>
          {[
            d.how ? <Text key="how" style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 3 }}>HOW: {d.how.substring(0, 140)}</Text> : null,
            d.route ? <Text key="route" style={{ fontSize: FONT.micro, color: COLORS.accent, marginTop: 2 }}>ROUTE: {d.route}</Text> : null,
            d.legal ? <Text key="legal" style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 1 }}>LEGAL: {d.legal.substring(0, 100)}</Text> : null,
          ].filter(Boolean)}
        </Card>
      ))}
      <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
    </Page>,

    // PAGE 4: Spending Intelligence (NEW - only if spending data available)
    (topSuppliers.length > 0 || portfolioSpendRows.length > 0) ? (
      <Page key="spending" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
        <PDFHeader title="Spending Intelligence" subtitle={`${formatCurrency(spendingSummary?.total_spend || 0)} tracked across ${formatNumber(spendingSummary?.record_count || 0)} transactions`} classification="LEADER" />
        <StatsRow>
          <StatCard value={formatCurrency(spendingSummary?.total_spend || 0)} label="Gross Spend" />
          <StatCard value={formatCurrency(Math.abs(spendingSummary?.total_income || 0))} label="Income/Credits" color={COLORS.accent} />
          <StatCard value={formatCurrency(spendingSummary?.net || 0)} label="Net Spend" />
          <StatCard value={`${spendingSummary?.coverage?.pct || 0}%`} label="Category Match" color={(spendingSummary?.coverage?.pct || 0) >= 70 ? COLORS.success : COLORS.warning} />
        </StatsRow>

        {topSuppliers.length > 0 ? (
          <View>
            <SectionHeading title="Top 10 Suppliers by Spend" />
            <Card>
              <HorizontalBarChart
                data={topSuppliers.map((s, i) => ({
                  label: (s.name || s.supplier || 'Unknown').substring(0, 22),
                  value: s.total || s.amount || 0,
                  color: COLORS.chart[i % COLORS.chart.length],
                }))}
              />
            </Card>
          </View>
        ) : <View />}

        {portfolioSpendRows.length > 0 ? (
          <View>
            <SectionHeading title="Spend vs Budget by Portfolio" />
            <Table
              columns={[
                { key: 'portfolio', label: 'Portfolio', flex: 2, bold: true },
                { key: 'spend', label: 'Actual', width: 65, align: 'right' },
                { key: 'annualised', label: 'Annual\'d', width: 65, align: 'right' },
                { key: 'budget', label: 'Budget', width: 65, align: 'right' },
                { key: 'variance', label: 'Var %', width: 45, align: 'right' },
                { key: 'suppliers', label: 'Suppliers', width: 45, align: 'right' },
                { key: 'hhi', label: 'HHI', width: 40, align: 'right' },
              ]}
              rows={portfolioSpendRows}
              filterEmptyColumns
            />
            <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
              HHI: Herfindahl-Hirschman Index. Above 2,500 = high supplier concentration risk. Variance = annualised spend vs budget.
            </Text>
          </View>
        ) : <View />}

        {concentrationAlerts.length > 0 ? (
          <Card accent>
            <SubsectionHeading title="Supplier Concentration Alerts (HHI > 2500)" />
            <BulletList items={concentrationAlerts} color={COLORS.danger} />
          </Card>
        ) : <View />}

        {Object.keys(spendByCategory).length > 0 ? (
          <View>
            <SectionHeading title="Spend by Service Category" />
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              <View style={{ flex: 1 }}>
                <DonutChart
                  data={Object.entries(spendByCategory)
                    .filter(([cat]) => cat !== 'other')
                    .sort(([, a], [, b]) => (b?.total || 0) - (a?.total || 0))
                    .slice(0, 8)
                    .map(([, data], i) => ({
                      value: data?.total || 0,
                      color: COLORS.chart[i % COLORS.chart.length],
                    }))}
                  size={90}
                  label="By Category"
                />
              </View>
              <View style={{ flex: 2 }}>
                <HorizontalBarChart
                  data={Object.entries(spendByCategory)
                    .filter(([cat]) => cat !== 'other')
                    .sort(([, a], [, b]) => (b?.total || 0) - (a?.total || 0))
                    .slice(0, 8)
                    .map(([cat, data], i) => ({
                      label: (data?.label || cat.replace(/_/g, ' ')).substring(0, 22),
                      value: data?.total || 0,
                      color: COLORS.chart[i % COLORS.chart.length],
                    }))}
                  maxBars={8}
                />
              </View>
            </View>
          </View>
        ) : <View />}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    ) : null,

    // PAGE 5: Per-Portfolio Summary (always shown)
    <Page key="portfolio" size="A4" style={styles.page}>
      <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
      <PDFHeader title="Portfolio Summary" subtitle={`All ${(portfolios || []).length} Portfolios at a Glance`} classification="LEADER" />
      {(portfolios || []).map((p, i) => {
        const pDirectives = (allDirectives || []).filter(d => d.portfolio_id === p.id || d.portfolio === p.id)
        const pSavings = pDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
        const pBudget = p.budget_latest?.gross_expenditure || p.budget_total || p.budget?.total || 0
        const ps = spendByPortfolio[p.id]
        const savingsPct = pBudget > 0 ? Math.round((pSavings / pBudget) * 100) : 0
        return (
          <Card key={i}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <View style={{ flex: 2 }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                  {p.short_title || p.title || p.id}
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                  {p.cabinet_member?.name || '-'} | {p.lead_officer?.name || '-'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>
                  {formatCurrency(pSavings)} ({savingsPct}% of budget)
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                  Budget: {formatCurrency(pBudget)}
                </Text>
              </View>
            </View>
            <ProgressBar
              value={pSavings}
              max={totalSavings || 1}
              label={`${pDirectives.length} directives | ${formatCurrency(pSavings)} of ${formatCurrency(totalSavings)} total`}
              color={COLORS.chart[i % COLORS.chart.length]}
              showPct={false}
            />
            {[
              pDirectives[0] ? (
                <Text key="top" style={{ fontSize: FONT.micro, color: COLORS.textSecondary, marginTop: 2 }}>
                  Priority: {pDirectives[0].action?.substring(0, 100)}
                </Text>
              ) : null,
              ps?.total ? (
                <Text key="spend" style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 1 }}>
                  Spend tracked: {formatCurrency(ps.total)} | {ps.unique_suppliers || 0} suppliers | HHI: {ps.hhi ? Math.round(ps.hhi) : 'n/a'}
                </Text>
              ) : null,
              p.demand_pressures?.length > 0 ? (
                <Text key="demand" style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 1 }}>
                  Pressures: {p.demand_pressures.slice(0, 2).map(dp => typeof dp === 'string' ? dp.substring(0, 50) : (dp.pressure || '').substring(0, 50)).join('; ')}
                </Text>
              ) : null,
            ].filter(Boolean)}
          </Card>
        )
      })}
      <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
    </Page>,

    // PAGE 6: MTFS Comparison (conditional)
    mtfsGaps ? (
      <Page key="mtfs" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
        <PDFHeader title="MTFS Comparison" subtitle="AI DOGE vs Official Medium Term Financial Strategy" classification="LEADER" />
        <Card highlight>
          <SubsectionHeading title="Key Differences" />
          {mtfsGaps.gaps.map((gap, i) => (
            <View key={i} style={{ marginBottom: SPACE.sm }}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.warning }}>{gap.area}</Text>
              <View style={styles.row}>
                <View style={styles.col2}>
                  <KeyValue label="MTFS Says" value={gap.mtfs_value || '-'} />
                </View>
                <View style={styles.col2}>
                  <KeyValue label="AI DOGE Says" value={gap.doge_value || '-'} color={COLORS.accent} />
                </View>
              </View>
              {gap.implication ? (
                <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 2 }}>
                  {gap.implication}
                </Text>
              ) : <View />}
            </View>
          ))}
        </Card>
        <StatsRow>
          <StatCard value={`${mtfsComparison.year1_coverage_pct ?? 0}%`} label="Year 1 Coverage" color={mtfsComparison.year1_coverage_pct >= 100 ? COLORS.success : mtfsComparison.year1_coverage_pct >= 80 ? COLORS.warning : COLORS.danger} detail={`${fmtCur(mtfsComparison.year1_deliverable)} of ${fmtCur(mtfsComparison.mtfs_year1_target)}`} />
          <StatCard value={`${mtfsComparison.two_year_coverage_pct ?? 0}%`} label="Two-Year Coverage" color={mtfsComparison.two_year_coverage_pct >= 100 ? COLORS.success : mtfsComparison.two_year_coverage_pct >= 80 ? COLORS.warning : COLORS.danger} detail={`${fmtCur(mtfsComparison.identified_central)} of ${fmtCur(mtfsComparison.mtfs_two_year_target)}`} />
          <StatCard value={fmtCur(Math.abs(mtfsComparison.gap_or_surplus))} label={mtfsComparison.gap_or_surplus >= 0 ? 'Surplus' : 'Shortfall'} color={mtfsComparison.gap_or_surplus >= 0 ? COLORS.success : COLORS.danger} />
        </StatsRow>
        {mtfsGaps.overall_assessment ? (
          <Card accent>
            <SubsectionHeading title="Overall Assessment" />
            <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
              {mtfsGaps.overall_assessment}
            </Text>
          </Card>
        ) : <View />}
        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    ) : null,

    // PAGE 7: Political Impact (conditional)
    politicalImpact ? (
      <Page key="political" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
        <PDFHeader title="Political Impact Assessment" subtitle="Electoral Ripple from LCC Reform Operations" classification="LEADER" />
        <StatsRow>
          <StatCard value={formatCurrency(totalSavings)} label="Total Savings Pipeline" color={COLORS.success} />
          <StatCard value={(allDirectives || []).length.toString()} label="Active Directives" />
          <StatCard value={`${politicalImpact.overall_score || 0}/100`} label="Political Impact" color={politicalImpact.overall_score >= 70 ? COLORS.success : COLORS.warning} />
          <StatCard value={`${(portfolios || []).length}`} label="Portfolios" />
        </StatsRow>
        <Card highlight>
          <SubsectionHeading title="Borough Election Impact" />
          <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5, marginBottom: SPACE.sm }}>
            Every Reform action at LCC ripples across 12 borough districts. Reform as a new governing party gets 2-3x media scrutiny. Use this, don't fear it.
          </Text>
        </Card>
        {[
          politicalImpact.district_impact?.length > 0 ? (
            <Table key="di-t"
              columns={[
                { key: 'district', label: 'District', flex: 2, bold: true },
                { key: 'score', label: 'Impact', width: 50, align: 'right' },
                { key: 'talking_point', label: 'Talking Point', flex: 3 },
              ]}
              rows={politicalImpact.district_impact.slice(0, 12).map(di => ({
                district: di.district || di.name || '-',
                score: `${di.impact_score ?? di.score ?? 0}/100`,
                talking_point: di.talking_point || '-',
                _colors: { score: (di.impact_score ?? di.score ?? 0) >= 60 ? COLORS.success : COLORS.warning },
              }))}
              filterEmptyColumns
            />
          ) : null,
          politicalImpact.constituency_impact?.national_narrative ? (
            <Card key="nn" accent style={{ marginTop: SPACE.md }}>
              <SubsectionHeading title="National Narrative" />
              <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                "{politicalImpact.constituency_impact.national_narrative}"
              </Text>
            </Card>
          ) : null,
        ].filter(Boolean)}
        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    ) : null,

    // PAGE 8: Treasury & Workforce (conditional)
    treasuryChildren.length > 0 ? (
      <Page key="treasury" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
        <PDFHeader title="Treasury, Budget & Workforce" subtitle="Cash Management, Reserves, Council Tax & Staffing" classification="LEADER" />
        {treasuryChildren}
        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    ) : null,

    // PAGE 9: Loss Trajectory & Bond Analysis (conditional on data)
    lossTrajectory ? (
      <Page key="losses" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
        <PDFHeader title="Loss Trajectory" subtitle={`Statement of Accounts ${lossTrajectory.years_covered || 8}-Year Analysis (Conservative Administration)`} classification="LEADER" />
        <StatsRow>
          <StatCard label="Strict Audited" value={formatCurrency(lossTrajectory.strict_audited_total)} color={COLORS.danger} />
          <StatCard label="Broader Official" value={formatCurrency(lossTrajectory.broader_official_total)} color={COLORS.danger} />
          <StatCard label="Annual Average" value={formatCurrency(lossTrajectory.annual_average)} color={COLORS.warning} />
          <StatCard label="Trend" value={(lossTrajectory.trend || '').replace(/_/g, ' ')} color={lossTrajectory.trend === 'worsening' ? COLORS.danger : COLORS.warning} />
        </StatsRow>
        <SectionHeading title="Year-by-Year Audited Losses" />
        <Table
          columns={[
            { key: 'year', label: 'Year', width: 55, bold: true },
            { key: 'fi', label: 'Financial Instruments', flex: 1, align: 'right' },
            { key: 'disp', label: 'Disposals/Academy', flex: 1, align: 'right' },
            { key: 'total', label: 'Annual Total', flex: 1, align: 'right' },
            { key: 'cumulative', label: 'Cumulative', flex: 1, align: 'right' },
          ]}
          rows={(lossTrajectory.by_year || []).map(y => ({
            year: y.year,
            fi: formatCurrency(y.financial_instruments),
            disp: formatCurrency(y.disposals),
            total: formatCurrency(y.total),
            cumulative: formatCurrency(y.cumulative),
          }))}
        />
        <SectionHeading title="Loss Categories" />
        <StatsRow>
          {Object.entries(lossTrajectory.loss_categories || {}).filter(([,v]) => v > 0).map(([key, value]) => (
            <StatCard key={key} label={key.replace(/_/g, ' ')} value={formatCurrency(value)} color={COLORS.danger} />
          ))}
        </StatsRow>
        {bondAnalysis && bondAnalysis.total_face_value > 0 ? (
          <View>
            <SectionHeading title="UKMBA Bond Portfolio" />
            <StatsRow>
              <StatCard label="Face Value" value={formatCurrency(bondAnalysis.total_face_value)} color={COLORS.accent} />
              <StatCard label="Sale Loss" value={formatCurrency(bondAnalysis.estimated_sale_loss)} color={COLORS.danger} />
              <StatCard label="Loss Ratio" value={`${bondAnalysis.loss_ratio_pct}%`} color={bondAnalysis.loss_ratio_pct > 50 ? COLORS.danger : COLORS.warning} />
              <StatCard label="Coupon Income" value={formatCurrency(bondAnalysis.annual_coupon_income)} color={COLORS.success} />
            </StatsRow>
            <Card accent>
              <SubsectionHeading title={`Recommendation: ${(bondAnalysis.hold_recommendation || '').replace(/_/g, ' ')}`} />
              <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted }}>
                {bondAnalysis.hold_recommendation === 'hold_to_maturity'
                  ? 'Hold to maturity. Selling now would crystallise the £350M mark-to-market loss. Bonds recover face value at maturity assuming no default.'
                  : 'Review position with treasury advisors.'}
                {' '}Risk: {(bondAnalysis.risk_rating || 'unknown').toUpperCase()}.
              </Text>
            </Card>
          </View>
        ) : <View />}
        {lossTrajectory.veltip_estimate > 0 ? (
          <Card>
            <SubsectionHeading title="Upper Bound Note" />
            <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted }}>
              Adding the VeLTIP sale-loss estimate ({formatCurrency(lossTrajectory.veltip_estimate)}) gives a political headline of {formatCurrency((lossTrajectory.broader_official_total || 0) + lossTrajectory.veltip_estimate)}, but this likely overlaps with audited financial instrument losses already counted.
            </Text>
          </Card>
        ) : <View />}
        <Card accent>
          <SubsectionHeading title="Reform Actions Required" />
          <BulletList items={[
            'Stop risky treasury exposure: financial instrument losses alone = ' + formatCurrency(lossTrajectory.loss_categories?.financial_instruments || 0),
            'Stop avoidable write-downs: disposal/academy charges = ' + formatCurrency(lossTrajectory.loss_categories?.disposals_academy || 0),
            'Restore budget control: school overspends ' + formatCurrency(lossTrajectory.loss_categories?.school_overspends || 0) + ', council ' + formatCurrency(lossTrajectory.loss_categories?.council_overspends || 0),
          ]} color={COLORS.accent} />
        </Card>
        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    ) : null,

    // PAGE 10: Year-End Sprint — what can be done in 11 days (20-31 March)
    (directorates || []).length > 0 ? (
      <Page key="yearend" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER + CABINET MEMBER FOR DATA & DIGITAL — MOST RESTRICTED" />
        <PDFHeader title="Year-End Sprint: 20-31 March" subtitle="11 days to improve the outturn position Reform inherits." classification="LEADER" />

        <StatsRow>
          <StatCard value="£3-8M" label="Realistic 11-Day Impact" color={COLORS.success} detail="Outturn improvement range" />
          <StatCard value="£1-2M" label="Direct Spend Avoided" color={COLORS.accent} detail="Discretionary freeze" />
          <StatCard value="£2-5M" label="Accrual/Provision Challenge" color={COLORS.warning} detail="Reduce inflated provisions" />
          <StatCard value="£0-1M" label="Payment Deferrals" color={COLORS.textSecondary} detail="Invoices pushed to 2026/27" />
        </StatsRow>

        <Card highlight>
          <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.6 }}>
            The financial year closes on 31 March. Every accrual posted and provision set in the next 11 days determines the outturn position reported to Full Council and the external auditor. Last year: council-wide 48% savings delivery; Adults 11%. The realistic impact of this sprint is £3-8M improvement on the outturn — not transformational, but it establishes the discipline and intelligence infrastructure that will deliver £30-50M in 2026/27.
          </Text>
        </Card>

        <SectionHeading title="This Week: 20-26 March" />
        <Card accent>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <SubsectionHeading title="1. Payment Run Oversight" />
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>Impact: £0.5-1M</Text>
          </View>
          <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginBottom: 3 }}>
            LCC processes ~50,000 invoices/month. The final two payment runs (w/c 24 and 28 March) will total £150-200M. Oversight alone catches errors and premature payments.
          </Text>
          <BulletList items={[
            'S151 Officer to flag every payment > £500K in the final two runs — Leader and Cabinet Member copied on exceptions',
            'Request schedule of all creditor invoices received but not yet processed — these become accruals if unpaid by 31 March',
            'Identify invoices being held to push costs into 2026/27 — lawful but distorts both years. Must be a conscious decision not an accident',
          ]} color={COLORS.accent} />
        </Card>
        <Card accent>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <SubsectionHeading title="2. Accruals & Provisions Challenge" />
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>Impact: £2-5M</Text>
          </View>
          <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginBottom: 3 }}>
            This is the highest-impact action. Provisions are estimates. The outgoing administration set provisions that may be precautionary or inflated. Every £1M of unnecessary provision worsens the outturn Reform inherits. The S151 Officer has latitude on provisions within accounting standards.
          </Text>
          <BulletList items={[
            'Draft accruals schedule from each Exec Director by 26 March — this is where the outturn is shaped',
            'Challenge any provision increase > £1M: evidenced or precautionary? MTFS already includes £11M redundancy provision — is more needed?',
            'ASC fee uplift accrual: confirm the figure for 2025/26 provider settlements. Providers demanding 7-8% — what is the council booking?',
            'SEND transport: is the £17.7M growth accrued in 2025/26 or deferred? This single decision swings the outturn by £17.7M',
          ]} color={COLORS.accent} />
        </Card>
        <Card accent>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <SubsectionHeading title="3. Discretionary Spend Freeze" />
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>Impact: £1-2M</Text>
          </View>
          <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginBottom: 3 }}>
            11 days of discretionary freeze across a £2B council = ~£500K-£2M depending on compliance. More importantly, it establishes that Reform is watching and sets the tone for 2026/27.
          </Text>
          <BulletList items={[
            'Email all Exec Directors today: no new purchase orders for non-essential goods/services until 1 April',
            'Target: consultancy, training, conferences, corporate subscriptions, non-urgent IT purchases, stationery bulk orders',
            'Exception: statutory services, safeguarding, contractual obligations, already-committed capital projects',
          ]} color={COLORS.accent} />
        </Card>

        <SectionHeading title="Next Week: 27-31 March" />
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <SubsectionHeading title="4. Outturn Narrative" />
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.warning }}>Political value: HIGH</Text>
          </View>
          <BulletList items={[
            'Pre-outturn briefing from S151 by 28 March: projected position, key variances, provisions set',
            'Agree the narrative BEFORE publication: every overspend is attributed to pre-May 2025 decisions',
            'Written statement for Full Council: Reform identified the problem in 11 days. The previous administration created it over 8 years',
            'Commission AI DOGE variance report: actual vs budget by directorate and portfolio, ready for May cabinet',
          ]} color={COLORS.warning} />
        </Card>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <SubsectionHeading title="5. Agency & Workforce Audit" />
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.warning }}>2026/27 saving: £5-10M</Text>
          </View>
          <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginBottom: 3 }}>
            No direct 2025/26 saving — but this data is essential for 2026/27. Every agency worker identified now is a conversion or termination decision in April.
          </Text>
          <BulletList items={[
            'Full agency register by 31 March: name, role, daily rate, start date, commissioning manager, extension history',
            'Education: 110 agency EPs at ~£350-500/day vs £45K permanent. Converting 20 saves £1.5-2M/year',
            'Adults: agency social workers at 30-50% premium. Quantify by 31 March, convert from 1 April',
            'Corporate: 4 interim directors at ~£30K premium each. Gary Fielding (S151) arriving June — plan for remaining',
          ]} color={COLORS.warning} />
        </Card>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
            <SubsectionHeading title="6. Contract Exposure Scan" />
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.warning }}>Risk avoidance: £1-3M</Text>
          </View>
          <BulletList items={[
            'List all contracts auto-renewing between 20 March and 30 April — any > £100K needs cabinet member sight',
            'Check: waste, IT managed services, facilities, legal retainers, HR systems, payroll processing',
            'Do NOT block statutory renewals — but every one must have a named Reform owner who has reviewed it',
            'Any contract renewed without review is a missed opportunity for renegotiation or termination',
          ]} color={COLORS.warning} />
        </Card>

        <SectionHeading title="Data & Digital: Cabinet Member Asks" />
        <Card highlight>
          <BulletList items={[
            'Oracle Fusion: read-only dashboard access for Reform cabinet members by 28 March — live spend visibility is non-negotiable',
            'Daily payment extract: automated list of payments > £100K for 24-31 March period — emailed to Leader each morning',
            'Invoice backlog: total invoices in queue, average days-to-pay, and value of unprocessed invoices as at 25 March',
            'Three-way match rate: % of invoices auto-matched (PO + goods receipt + invoice). The gap = duplicate payment risk',
            'March data extract: full spending data to AI DOGE by 7 April for year-end pattern analysis and 2026/27 baseline',
          ]} color={COLORS.accent} />
        </Card>

        <Card accent>
          <SubsectionHeading title="Realistic Expectation" />
          <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
            Realistic outturn improvement from this sprint: £3-8M. The accrual/provision challenge is the highest-leverage action — every £1M of unnecessary provision removed directly improves the outturn. The discretionary freeze adds £1-2M. Payment oversight catches errors worth £0.5-1M. The agency audit and contract scan deliver no 2025/26 saving but create the intelligence base for £15-20M of 2026/27 savings. The political value of demonstrating grip in 11 days is worth more than the cash.
          </Text>
        </Card>

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    ) : null,

    // PAGE 11: Risk Register & Inspections (always shown)
    <Page key="risk" size="A4" style={styles.page}>
      <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
      <PDFHeader title="Risk Register & Inspections" subtitle="Key Risk Exposures Across All Portfolios" classification="LEADER" />
      {riskPageChildren}
      <SectionHeading title="Top Risks by Portfolio" />
      {portfolioRiskCards}
      {inspectionSection}
      <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
    </Page>,
  ].filter(Boolean)

  return (
    <Document>
      {allPages}
    </Document>
  )
}
