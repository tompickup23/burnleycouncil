/**
 * PortfolioBriefingPDF - Per-portfolio Cabinet Command briefing.
 *
 * Contains: portfolio overview, savings pipeline, governance & decisions,
 * service intelligence (all 7 models), political & fiscal trajectory,
 * key directives, risk assessment, PR material, reform playbook.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, CoverPage, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, Table, Divider,
  KeyValue, ProgressBar,
  formatCurrency, formatPct, formatNumber,
} from './PDFComponents.jsx'

export function PortfolioBriefingPDF({
  portfolio, directives, narrative, serviceIntel, councilName,
  politicalCtx, upcomingDecisions, dependencies, fiscalTrajectory,
  demandPressures, playbook, evidenceStrengths,
  budgetsData, workforce,
}) {
  if (!portfolio) return null

  const title = portfolio.short_title || portfolio.title || portfolio.id
  const totalSavings = (directives || []).reduce((s, d) => s + (d.save_central || 0), 0)
  const immediateSavings = (directives || []).filter(d => /immediate|0-3/i.test(d.timeline || '')).reduce((s, d) => s + (d.save_central || 0), 0)
  const budget = portfolio.budget_total || portfolio.budget?.total || 0

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

  // Governance routing helper
  const governanceRoute = (savingsM) => {
    if (savingsM >= 1) return 'Full Council'
    if (savingsM >= 0.5) return 'Cabinet'
    if (savingsM >= 0.25) return 'Exec Director'
    return 'Officer'
  }

  return (
    <Document>
      {/* Cover */}
      <CoverPage
        title={title}
        subtitle="Portfolio Intelligence Briefing"
        meta={`${portfolio.cabinet_member?.name || 'Cabinet Member'} • Budget: ${formatCurrency(budget)} • Savings Pipeline: ${formatCurrency(totalSavings * 1e6)} • Generated ${new Date().toLocaleDateString('en-GB')}`}
        classification="CONFIDENTIAL - CABINET USE ONLY"
        councilName={councilName || 'Lancashire County Council'}
      />

      {/* ─── PAGE 2: Portfolio Overview ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
        <PDFHeader title={title} subtitle="Portfolio Overview" classification="CABINET" />

        <StatsRow>
          <StatCard value={formatCurrency(budget)} label="Total Budget" />
          <StatCard value={formatCurrency(totalSavings * 1e6)} label="Savings Identified" color={COLORS.success} />
          <StatCard value={formatCurrency(immediateSavings * 1e6)} label="Immediate Wins" color={COLORS.warning} />
          <StatCard value={(directives || []).length.toString()} label="Active Directives" />
        </StatsRow>

        {/* Portfolio Details */}
        <Card>
          <KeyValue label="Cabinet Member" value={portfolio.cabinet_member?.name || '-'} color={COLORS.accent} />
          <KeyValue label="Lead Officer" value={portfolio.lead_officer?.name || '-'} />
          <KeyValue label="Directorate" value={portfolio.directorate || '-'} />
          {portfolio.statutory_duties?.length > 0 && (
            <>
              <Divider />
              <SubsectionHeading title="Statutory Duties" />
              <BulletList items={portfolio.statutory_duties.slice(0, 6).map(d => typeof d === 'string' ? d : d.duty || d.description || '')} />
            </>
          )}
        </Card>

        {/* Demand Pressures */}
        {portfolio.demand_pressures?.length > 0 && (
          <>
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
          </>
        )}

        {/* Quantified Demand Pressures from engine */}
        {demandPressures && (
          <Card highlight>
            <SubsectionHeading title="Demand Quantification" />
            {demandPressures.total_annual_demand > 0 && <KeyValue label="Annual Demand Pressure" value={formatCurrency(demandPressures.total_annual_demand)} color={COLORS.danger} />}
            {demandPressures.demand_growth_rate > 0 && <KeyValue label="Growth Rate" value={formatPct(demandPressures.demand_growth_rate)} color={COLORS.danger} />}
            {demandPressures.unfunded_gap > 0 && <KeyValue label="Unfunded Gap" value={formatCurrency(demandPressures.unfunded_gap)} color={COLORS.danger} />}
          </Card>
        )}

        {/* Workforce Summary */}
        {workforce && (
          <>
            <SectionHeading title="Workforce" />
            <StatsRow>
              <StatCard label="FTE Headcount" value={formatNumber(workforce.fte_headcount)} />
              <StatCard label="Vacancy Rate" value={`${workforce.vacancy_rate_pct}%`} color={workforce.vacancy_rate_pct > 10 ? COLORS.danger : COLORS.textPrimary} />
              <StatCard label="Agency Spend" value={formatCurrency(workforce.agency_spend)} color={workforce.agency_spend > 2000000 ? COLORS.danger : COLORS.textPrimary} />
            </StatsRow>
            <Card>
              <KeyValue label="Agency FTE" value={formatNumber(workforce.agency_fte)} />
              <KeyValue label="Average Salary" value={formatCurrency(workforce.average_salary)} />
              <KeyValue label="Span of Control" value={`1:${workforce.span_of_control}`} />
              <KeyValue label="Management Layers" value={workforce.management_layers?.toString() || '-'} />
              <KeyValue label="Payscale Range" value={workforce.payscale_range || '-'} />
              <KeyValue label="Voluntary Turnover" value={`${workforce.voluntary_turnover_pct}%`} color={workforce.voluntary_turnover_pct > 15 ? COLORS.danger : COLORS.textPrimary} />
            </Card>
          </>
        )}

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
            savings: formatCurrency((d.save_central || 0) * 1e6),
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
                  {formatCurrency(catSavings * 1e6)}
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
          <>
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
          </>
        )}

        <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
      </Page>

      {/* ─── PAGE 4: Governance & Decisions ─── */}
      {(upcomingDecisions?.length > 0 || portfolioDeps.length > 0) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Governance & Decision Pipeline" classification="CABINET" />

          {/* Decision Pipeline */}
          {upcomingDecisions?.length > 0 && (
            <>
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
            </>
          )}

          {/* Governance Routing for top savings directives */}
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
              savings: formatCurrency((d.save_central || 0) * 1e6),
              route: d.route || governanceRoute(d.save_central || 0),
            }))}
          />

          {/* Cross-Portfolio Dependencies */}
          {portfolioDeps.length > 0 && (
            <>
              <SectionHeading title="Cross-Portfolio Dependencies" />
              {portfolioDeps.slice(0, 5).map((dep, i) => (
                <Card key={i}>
                  <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.accent }}>
                    {dep.description || dep.title || `${dep.from} ↔ ${dep.to}`}
                  </Text>
                  {dep.risk && (
                    <Text style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 2 }}>
                      Risk: {dep.risk}
                    </Text>
                  )}
                </Card>
              ))}
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 5: Service Intelligence (expanded) ─── */}
      {serviceIntel && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Service Intelligence" classification="CABINET" />

          {serviceIntel.sendProjection && (
            <>
              <SectionHeading title="SEND Cost Intelligence" />
              <Card highlight>
                <KeyValue label="Base SEND Cost" value={formatCurrency(serviceIntel.sendProjection.base_cost)} />
                <KeyValue label="5yr Growth" value={formatCurrency(serviceIntel.sendProjection.total_growth)} color={COLORS.danger} />
                {serviceIntel.sendProjection.cost_breakdown && Object.entries(serviceIntel.sendProjection.cost_breakdown).slice(0, 5).map(([k, v]) => (
                  <KeyValue key={k} label={k.replace(/_/g, ' ')} value={formatCurrency(v)} />
                ))}
              </Card>
              {serviceIntel.interventionROI && (
                <Card>
                  <SubsectionHeading title="Early Intervention ROI" />
                  <KeyValue label="Investment Required" value={formatCurrency(serviceIntel.interventionROI.investment)} />
                  <KeyValue label="Annual Return" value={formatCurrency(serviceIntel.interventionROI.annual_return)} color={COLORS.success} />
                  {serviceIntel.interventionROI.roi_ratio && <KeyValue label="ROI Ratio" value={`${serviceIntel.interventionROI.roi_ratio}:1`} color={COLORS.accent} />}
                </Card>
              )}
              {serviceIntel.lacOptimisation && (
                <Card>
                  <SubsectionHeading title="LAC Placement Optimisation" />
                  {serviceIntel.lacOptimisation.total_saving && <KeyValue label="Potential Saving" value={formatCurrency(serviceIntel.lacOptimisation.total_saving)} color={COLORS.success} />}
                  {serviceIntel.lacOptimisation.placements_to_shift > 0 && <KeyValue label="Placements to Shift" value={serviceIntel.lacOptimisation.placements_to_shift.toString()} />}
                </Card>
              )}
            </>
          )}

          {serviceIntel.ascProjection && (
            <>
              <SectionHeading title="ASC Demand Intelligence" />
              <Card highlight>
                <KeyValue label="Demographic Pressure" value={serviceIntel.ascProjection.demographic_pressure || '-'} />
                <KeyValue label="Market Sustainability" value={serviceIntel.ascProjection.market_sustainability || '-'} />
                {serviceIntel.ascProjection.yearly?.slice(0, 3).map((y, i) => (
                  <KeyValue key={i} label={`Year ${y.year || i + 1}`} value={formatCurrency(y.total_cost)} />
                ))}
              </Card>
              {serviceIntel.ascMarket && (
                <Card>
                  <SubsectionHeading title="Market Risk" />
                  {serviceIntel.ascMarket.risk_level && <KeyValue label="Risk Level" value={serviceIntel.ascMarket.risk_level} color={serviceIntel.ascMarket.risk_level === 'high' ? COLORS.danger : COLORS.warning} />}
                  {serviceIntel.ascMarket.provider_concentration && <KeyValue label="Provider Concentration" value={serviceIntel.ascMarket.provider_concentration} />}
                </Card>
              )}
              {serviceIntel.chcRecovery && (
                <Card>
                  <SubsectionHeading title="CHC Recovery Pipeline" />
                  {serviceIntel.chcRecovery.recoverable && <KeyValue label="Recoverable" value={formatCurrency(serviceIntel.chcRecovery.recoverable)} color={COLORS.success} />}
                  {serviceIntel.chcRecovery.cases > 0 && <KeyValue label="Cases" value={serviceIntel.chcRecovery.cases.toString()} />}
                </Card>
              )}
            </>
          )}

          {serviceIntel.childrenProjection && (
            <>
              <SectionHeading title="Children's Services Intelligence" />
              <Card highlight>
                {serviceIntel.childrenProjection.base_cost && <KeyValue label="Base Cost" value={formatCurrency(serviceIntel.childrenProjection.base_cost)} />}
                {serviceIntel.childrenProjection.five_year_growth && <KeyValue label="5yr Growth" value={formatCurrency(serviceIntel.childrenProjection.five_year_growth)} color={COLORS.danger} />}
                {serviceIntel.childrenProjection.yearly?.slice(0, 3).map((y, i) => (
                  <KeyValue key={i} label={`Year ${y.year || i + 1}`} value={formatCurrency(y.total_cost || y.cost)} />
                ))}
              </Card>
            </>
          )}

          {serviceIntel.phProjection && (
            <>
              <SectionHeading title="Public Health Intelligence" />
              <Card highlight>
                {serviceIntel.phProjection.base_cost && <KeyValue label="Base Cost" value={formatCurrency(serviceIntel.phProjection.base_cost)} />}
                {serviceIntel.phProjection.grant_dependency_pct && <KeyValue label="Grant Dependency" value={formatPct(serviceIntel.phProjection.grant_dependency_pct)} color={COLORS.warning} />}
              </Card>
            </>
          )}

          {serviceIntel.propertyProjection && (
            <>
              <SectionHeading title="Property Estate Intelligence" />
              <Card highlight>
                {serviceIntel.propertyProjection.estate_value && <KeyValue label="Estate Value" value={formatCurrency(serviceIntel.propertyProjection.estate_value)} />}
                {serviceIntel.propertyProjection.disposal_pipeline && <KeyValue label="Disposal Pipeline" value={formatCurrency(serviceIntel.propertyProjection.disposal_pipeline)} color={COLORS.success} />}
                {serviceIntel.propertyProjection.maintenance_liability && <KeyValue label="Maintenance Liability" value={formatCurrency(serviceIntel.propertyProjection.maintenance_liability)} color={COLORS.danger} />}
              </Card>
            </>
          )}

          {serviceIntel.highwayTrajectory && (
            <>
              <SectionHeading title="Highway Asset Intelligence" />
              <Card highlight>
                <KeyValue label="Maintenance Backlog" value={formatCurrency(serviceIntel.highwayTrajectory.maintenance_gap)} color={COLORS.danger} />
                <KeyValue label="LED Conversion" value={formatPct(serviceIntel.highwayTrajectory.led?.conversion_pct)} />
                {serviceIntel.highwayTrajectory.condition_trend && <KeyValue label="Condition Trend" value={serviceIntel.highwayTrajectory.condition_trend} />}
              </Card>
            </>
          )}

          {serviceIntel.wasteComparison && (
            <>
              <SectionHeading title="Waste Disposal Intelligence" />
              <Card highlight>
                <KeyValue label="Market HHI" value={formatNumber(serviceIntel.wasteComparison.market_hhi)} />
                {serviceIntel.wasteComparison.scenarios?.slice(0, 3).map((s, i) => (
                  <KeyValue key={i} label={s.name || `Scenario ${i + 1}`} value={formatCurrency(s.annual_cost)} />
                ))}
              </Card>
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 6: Political & Fiscal Trajectory ─── */}
      {(politicalCtx || fiscalTrajectory) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Political & Fiscal Intelligence" classification="CABINET" />

          {/* Political Context */}
          {politicalCtx && (
            <>
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
            </>
          )}

          {/* Fiscal Trajectory */}
          {fiscalTrajectory && (
            <>
              <SectionHeading title="Net Fiscal Trajectory" />
              <StatsRow>
                {fiscalTrajectory.direction && <StatCard value={fiscalTrajectory.direction} label="Trajectory" color={fiscalTrajectory.direction === 'improving' ? COLORS.success : COLORS.danger} />}
                {fiscalTrajectory.breakeven_year && <StatCard value={fiscalTrajectory.breakeven_year.toString()} label="Breakeven Year" />}
                {fiscalTrajectory.cumulative_gap != null && <StatCard value={formatCurrency(fiscalTrajectory.cumulative_gap)} label="Cumulative Gap" color={fiscalTrajectory.cumulative_gap >= 0 ? COLORS.success : COLORS.danger} />}
              </StatsRow>

              {/* Yearly trajectory table */}
              {fiscalTrajectory.yearly?.length > 0 && (
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
              )}
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 7: PR & Reform Narrative ─── */}
      {narrative && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Reform Narrative & PR Material" classification="CABINET" />

          {/* Press Releases */}
          {narrative.press_releases?.length > 0 && (
            <>
              <SectionHeading title="Draft Press Releases" />
              {narrative.press_releases.map((pr, i) => (
                <Card key={i} accent>
                  <Text style={{ fontSize: FONT.h3, fontFamily: FONT.bold, color: COLORS.accent }}>{pr.headline}</Text>
                  <Text style={{ fontSize: FONT.body, color: COLORS.textSecondary, marginTop: 3 }}>{pr.standfirst}</Text>
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, marginTop: 3 }}>Key fact: {pr.key_fact}</Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.warning, marginTop: 3 }}>{pr.timing}</Text>
                </Card>
              ))}
            </>
          )}

          {/* Reform Playbook */}
          {playbook && (
            <>
              {playbook.quick_wins?.length > 0 && (
                <>
                  <SectionHeading title="Quick Wins (0-3 months)" />
                  <BulletList items={playbook.quick_wins.slice(0, 6).map(w => typeof w === 'string' ? w : w.action || w.title || '')} color={COLORS.success} />
                </>
              )}
              {playbook.structural_reforms?.length > 0 && (
                <>
                  <SectionHeading title="Structural Reforms (6-18 months)" />
                  <BulletList items={playbook.structural_reforms.slice(0, 6).map(r => typeof r === 'string' ? r : r.action || r.title || '')} color={COLORS.accent} />
                </>
              )}
            </>
          )}

          {/* Borough Campaign Material */}
          {narrative.borough_campaign && (
            <>
              <SectionHeading title="Borough Election Material" />
              <Card>
                <SubsectionHeading title="Social Media Post" />
                <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                  {narrative.borough_campaign.social_media}
                </Text>
              </Card>
              <Card>
                <SubsectionHeading title="Canvassing Script" />
                <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{narrative.borough_campaign.canvassing_script}"
                </Text>
              </Card>
            </>
          )}

          {/* Constituency Talking Points */}
          {narrative.constituency_talking_points?.length > 0 && (
            <>
              <SectionHeading title="Constituency Talking Points" />
              <BulletList items={narrative.constituency_talking_points} color={COLORS.accent} />
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}

      {/* ─── Key Contracts & Savings Levers ─── */}
      {(portfolio.key_contracts?.length > 0 || portfolio.savings_levers?.length > 0) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="CABINET BRIEFING - RESTRICTED DISTRIBUTION" />
          <PDFHeader title={title} subtitle="Key Contracts & Savings Levers" classification="CABINET" />

          {portfolio.key_contracts?.length > 0 && (
            <>
              <SectionHeading title="Key Contracts" />
              <Table
                columns={[
                  { key: 'supplier', label: 'Supplier', flex: 2, bold: true },
                  { key: 'value', label: 'Value', width: 70, align: 'right' },
                  { key: 'scope', label: 'Scope', flex: 2 },
                  { key: 'risk', label: 'Risk', width: 50 },
                ]}
                rows={(portfolio.key_contracts || []).map(c => ({
                  supplier: c.supplier || c.name || '-',
                  value: c.value || c.annual_value || '-',
                  scope: (c.scope || c.description || '-').substring(0, 50),
                  risk: c.risk_level || c.risk || '-',
                  _colors: { risk: c.risk_level === 'high' ? COLORS.danger : c.risk_level === 'medium' ? COLORS.warning : COLORS.textPrimary },
                }))}
              />
            </>
          )}

          {/* Savings Levers */}
          {portfolio.savings_levers?.length > 0 && (
            <>
              <SectionHeading title="Savings Levers" />
              <Table
                columns={[
                  { key: 'action', label: 'Lever', flex: 3 },
                  { key: 'saving', label: 'Est. Saving', width: 80, align: 'right', bold: true },
                  { key: 'timeline', label: 'Timeline', width: 80 },
                  { key: 'owner', label: 'Owner', width: 60 },
                ]}
                rows={(portfolio.savings_levers || []).map(l => ({
                  action: (l.action || '-').substring(0, 70),
                  saving: l.est_saving || l.saving || '-',
                  timeline: l.timeline || '-',
                  owner: l.owner || '-',
                }))}
              />
            </>
          )}

          <PDFFooter councilName={councilName} classification="PORTFOLIO BRIEFING" />
        </Page>
      )}
    </Document>
  )
}
