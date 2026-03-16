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
 *  P4: Spending Intelligence (NEW - top suppliers, portfolio spend, concentration alerts)
 *  P5: Per-Portfolio Summary
 *  P6: MTFS Comparison
 *  P7: Political Impact
 *  P8: Treasury & Workforce (enhanced with reserves chart, Band D trend, revenue summary)
 *  P9: Risk Register & Inspections
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
  spendingSummary,
}) {
  // Aggregate stats
  const totalSavings = (allDirectives || []).reduce((s, d) => s + (d.save_central || 0), 0)
  const immediateDirectives = (allDirectives || []).filter(d => /immediate|0-3/i.test(d.timeline || ''))
  const immediateSavings = immediateDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
  const totalBudget = (portfolios || []).reduce((s, p) => s + (p.budget_total || p.budget?.total || 0), 0)

  // Fiscal system coverage
  const coveragePct = fiscalOverview?.coverage_pct || 0
  const modelsComplete = fiscalOverview?.models_complete || 0
  const modelsTotal = fiscalOverview?.models_total || 10

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
  const portfolioSpendRows = (portfolios || [])
    .map(p => {
      const ps = spendByPortfolio[p.id]
      if (!ps?.total) return null
      const budget = p.budget_total || p.budget?.total || 0
      const variancePct = budget > 0 ? Math.round(((ps.total - budget) / budget) * 100) : null
      return {
        portfolio: p.short_title || p.title,
        spend: formatCurrency(ps.total),
        budget: budget > 0 ? formatCurrency(budget) : '-',
        variance: variancePct != null ? `${variancePct > 0 ? '+' : ''}${variancePct}%` : '-',
        suppliers: (ps.unique_suppliers || 0).toString(),
        hhi: ps.hhi ? Math.round(ps.hhi).toString() : '-',
        _colors: {
          variance: variancePct > 10 ? COLORS.danger : variancePct > 5 ? COLORS.warning : COLORS.success,
          hhi: (ps.hhi || 0) > 2500 ? COLORS.danger : (ps.hhi || 0) > 1500 ? COLORS.warning : COLORS.textSecondary,
        },
      }
    })
    .filter(Boolean)

  // Concentration alerts across all portfolios
  const concentrationAlerts = Object.entries(spendByPortfolio)
    .filter(([, ps]) => (ps.hhi || 0) > 2500)
    .map(([pid, ps]) => {
      const pName = (portfolios || []).find(p => p.id === pid)?.short_title || pid
      const topSup = ps.top_suppliers?.[0]
      return `${pName}: HHI ${Math.round(ps.hhi)} (${topSup?.name || 'unknown'} = ${formatCurrency(topSup?.total || 0)})`
    })

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
      <StatsRow key="mtfs-stats">
        <StatCard value={formatCurrency(totals.mtfsTarget)} label="MTFS Year 1" />
        <StatCard value={`${totals.coveragePct}%`} label="Coverage" color={totals.coveragePct >= 100 ? COLORS.success : COLORS.danger} />
        <StatCard value={`${totals.priorPct}%`} label="Prior Year Delivery" color={totals.priorPct >= 80 ? COLORS.success : COLORS.danger} />
        <StatCard value={formatCurrency(totals.priorGap)} label="Prior Year Gap" color={COLORS.danger} />
      </StatsRow>
    ) : null,
    fiscalOverview ? (
      <Card key="fiscal-health" highlight>
        <SubsectionHeading title="Fiscal Health Assessment" />
        {[
          fiscalOverview.demand_growth ? <KeyValue key="dg" label="Demand Growth" value={formatPct(fiscalOverview.demand_growth)} color={COLORS.danger} /> : null,
          fiscalOverview.savings_coverage ? <KeyValue key="sc" label="Savings vs Demand" value={formatPct(fiscalOverview.savings_coverage)} color={COLORS.accent} /> : null,
          fiscalOverview.net_trajectory ? <KeyValue key="nt" label="Net Fiscal Trajectory" value={fiscalOverview.net_trajectory} /> : null,
          fiscalOverview.breakeven_year ? <KeyValue key="by" label="Breakeven Year" value={fiscalOverview.breakeven_year.toString()} /> : null,
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
      meta={`${(portfolios || []).length} portfolios | ${formatCurrency(totalSavings)} savings pipeline | ${formatCurrency(spendingSummary?.total_spend || 0)} spending tracked | Generated ${new Date().toLocaleDateString('en-GB')}`}
      classification="CONFIDENTIAL - LEADER USE ONLY"
      councilName={councilName || 'Lancashire County Council'}
    />,

    // PAGE 2: Fiscal System Overview (always shown)
    <Page key="fiscal" size="A4" style={styles.page}>
      <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
      <PDFHeader title="Fiscal System Overview" subtitle="Reform Operations Command" classification="LEADER" />
      <StatsRow>
        <StatCard value={formatCurrency(totalBudget)} label="Total Budget" />
        <StatCard value={formatCurrency(totalSavings)} label="Savings Pipeline" color={COLORS.success} />
        <StatCard value={formatCurrency(immediateSavings)} label="Immediate Wins" color={COLORS.warning} />
        <StatCard value={`${coveragePct}%`} label="Model Coverage" color={coveragePct > 60 ? COLORS.success : COLORS.warning} detail={`${modelsComplete}/${modelsTotal} modelled`} />
      </StatsRow>
      {fiscalInnerChildren}
      <SectionHeading title="Directorate Summary" />
      <Table
        columns={[
          { key: 'name', label: 'Directorate', flex: 2, bold: true },
          { key: 'portfolios', label: 'Portfolios', width: 55, align: 'right' },
          { key: 'budget', label: 'Budget', width: 70, align: 'right' },
          { key: 'savings', label: 'Savings', width: 70, align: 'right' },
          { key: 'coverage', label: 'MTFS %', width: 50, align: 'right' },
          { key: 'evidence', label: 'Evidence', width: 50, align: 'right' },
          { key: 'risk', label: 'Risk', width: 50 },
        ]}
        rows={(directorates || []).map(d => ({
          name: (d.title || d.name || d.id || '-').split(',')[0],
          portfolios: d.portfolio_count?.toString() || '-',
          budget: formatCurrency(d.net_budget || d.total_budget),
          savings: d.savings_range ? `${formatCurrency(d.savings_range.low)}-${formatCurrency(d.savings_range.high)}` : formatCurrency(d.total_savings || 0),
          coverage: `${d.coverage_pct || 0}%`,
          evidence: `${d.avg_evidence_strength || 0}/100`,
          risk: d.risk_level || (riskProfiles?.[d.directorate_id]?.risk_level) || '-',
          _colors: {
            risk: (d.risk_level || riskProfiles?.[d.directorate_id]?.risk_level) === 'high' ? COLORS.danger
              : (d.risk_level || riskProfiles?.[d.directorate_id]?.risk_level) === 'medium' ? COLORS.warning : COLORS.success,
            coverage: (d.coverage_pct || 0) >= 100 ? COLORS.success : COLORS.danger,
          },
        }))}
        filterEmptyColumns
      />
      <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
    </Page>,

    // PAGE 3: Monday Morning List (always shown)
    <Page key="monday" size="A4" style={styles.page}>
      <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
      <PDFHeader title="Monday Morning List" subtitle="Priority Actions This Week" classification="LEADER" />
      {(mondayMorningList || immediateDirectives).slice(0, 15).map((d, i) => (
        <Card key={i} accent={i < 3}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 3 }}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: i < 3 ? COLORS.accent : COLORS.textPrimary }}>
                {i + 1}. {d.action?.substring(0, 80) || '-'}
              </Text>
              <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
                {d.portfolio_title || d.portfolio || '-'} | {d.category?.replace(/_/g, ' ') || '-'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                {formatCurrency(d.save_central || 0)}
              </Text>
              <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>{d.timeline || '-'}</Text>
            </View>
          </View>
          {[
            d.how ? <Text key="how" style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 3 }}>HOW: {d.how.substring(0, 120)}</Text> : null,
            d.route ? <Text key="route" style={{ fontSize: FONT.micro, color: COLORS.accent, marginTop: 2 }}>ROUTE: {d.route}</Text> : null,
          ].filter(Boolean)}
        </Card>
      ))}
      <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
    </Page>,

    // PAGE 4: Spending Intelligence (NEW - only if spending data available)
    (topSuppliers.length > 0 || portfolioSpendRows.length > 0) ? (
      <Page key="spending" size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING - MOST RESTRICTED" />
        <PDFHeader title="Spending Intelligence" subtitle={`${formatCurrency(spendingSummary?.total_spend || 0)} tracked | ${spendingSummary?.coverage?.pct || 0}% classified`} classification="LEADER" />
        <StatsRow>
          <StatCard value={formatCurrency(spendingSummary?.total_spend || 0)} label="Total Spend Tracked" />
          <StatCard value={formatNumber(spendingSummary?.total_transactions || 0)} label="Transactions" />
          <StatCard value={`${spendingSummary?.coverage?.pct || 0}%`} label="Classified" color={COLORS.accent} />
          <StatCard value={formatNumber(topSuppliers.length)} label="Top Suppliers Shown" />
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
                { key: 'spend', label: 'Actual Spend', width: 75, align: 'right' },
                { key: 'budget', label: 'Budget', width: 75, align: 'right' },
                { key: 'variance', label: 'Variance', width: 55, align: 'right' },
                { key: 'suppliers', label: 'Suppliers', width: 50, align: 'right' },
                { key: 'hhi', label: 'HHI', width: 45, align: 'right' },
              ]}
              rows={portfolioSpendRows}
              filterEmptyColumns
            />
          </View>
        ) : <View />}

        {concentrationAlerts.length > 0 ? (
          <Card accent>
            <SubsectionHeading title="Supplier Concentration Alerts (HHI > 2500)" />
            <BulletList items={concentrationAlerts} color={COLORS.danger} />
          </Card>
        ) : <View />}

        {spendingSummary?.by_category && Object.keys(spendingSummary.by_category).length > 0 ? (
          <View>
            <SectionHeading title="Spend by Category" />
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              <View style={{ flex: 1 }}>
                <DonutChart
                  data={Object.entries(spendingSummary.by_category)
                    .sort(([, a], [, b]) => (b?.total || 0) - (a?.total || 0))
                    .slice(0, 8)
                    .map(([cat, data], i) => ({
                      value: data?.total || 0,
                      color: COLORS.chart[i % COLORS.chart.length],
                    }))}
                  size={90}
                  label="By Category"
                />
              </View>
              <View style={{ flex: 2 }}>
                <HorizontalBarChart
                  data={Object.entries(spendingSummary.by_category)
                    .sort(([, a], [, b]) => (b?.total || 0) - (a?.total || 0))
                    .slice(0, 8)
                    .map(([cat, data], i) => ({
                      label: cat.replace(/_/g, ' ').substring(0, 20),
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
      <PDFHeader title="Portfolio Summary" subtitle="All 10 Portfolios at a Glance" classification="LEADER" />
      {(portfolios || []).map((p, i) => {
        const pDirectives = (allDirectives || []).filter(d => d.portfolio_id === p.id || d.portfolio === p.id)
        const pSavings = pDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
        const pBudget = p.budget_total || p.budget?.total || 0
        const ps = spendByPortfolio[p.id]
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
                  {formatCurrency(pSavings)}
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                  of {formatCurrency(pBudget)} budget
                </Text>
              </View>
            </View>
            <ProgressBar
              value={pSavings}
              max={totalSavings || 1}
              label={`${pDirectives.length} directives`}
              color={COLORS.chart[i % COLORS.chart.length]}
              showPct={false}
            />
            {[
              pDirectives[0] ? (
                <Text key="top" style={{ fontSize: FONT.micro, color: COLORS.textSecondary, marginTop: 2 }}>
                  Top: {pDirectives[0].action?.substring(0, 100)}
                </Text>
              ) : null,
              ps?.total ? (
                <Text key="spend" style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 1 }}>
                  Actual spend: {formatCurrency(ps.total)} | {ps.unique_suppliers || 0} suppliers
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
          <StatCard value={`${mtfsComparison.year1_coverage_pct ?? 0}%`} label="Year 1 Coverage" color={mtfsComparison.year1_coverage_pct >= 80 ? COLORS.success : COLORS.danger} />
          <StatCard value={`${mtfsComparison.two_year_coverage_pct ?? 0}%`} label="Two-Year Coverage" color={mtfsComparison.two_year_coverage_pct >= 80 ? COLORS.success : COLORS.danger} />
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
          <StatCard value={formatCurrency(totalSavings)} label="Savings Narrative" color={COLORS.accent} />
          <StatCard value={(allDirectives || []).length.toString()} label="Active Directives" />
          <StatCard value={`${politicalImpact.overall_score || 0}/100`} label="Overall Impact" color={politicalImpact.overall_score >= 70 ? COLORS.success : COLORS.warning} />
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

    // PAGE 9: Risk Register & Inspections (always shown)
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
