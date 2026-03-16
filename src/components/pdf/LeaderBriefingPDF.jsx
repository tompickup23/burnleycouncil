/**
 * LeaderBriefingPDF — Comprehensive leader overview covering all portfolios.
 *
 * The "Monday Morning" document: fiscal system overview, all directorates,
 * top savings opportunities, MTFS comparison, political impact, key actions.
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

export function LeaderBriefingPDF({
  portfolios, directorates, allDirectives, fiscalOverview,
  mtfsComparison, politicalImpact, mondayMorningList, councilName,
  riskProfiles, spendingByDirectorate, totals,
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

  // Transform mtfsComparison flat numeric fields into gaps format for rendering
  const fmtCur = v => v != null ? formatCurrency(v * 1e6) : '—'
  const mtfsGaps = mtfsComparison ? {
    gaps: [
      { area: 'Year 1 Target (2026/27)', mtfs_value: fmtCur(mtfsComparison.mtfs_year1_target),
        doge_value: fmtCur(mtfsComparison.year1_deliverable),
        implication: `Year 1 coverage: ${mtfsComparison.year1_coverage_pct ?? 0}%` },
      { area: 'Two-Year Total', mtfs_value: fmtCur(mtfsComparison.mtfs_two_year_target),
        doge_value: fmtCur(mtfsComparison.identified_central),
        implication: mtfsComparison.gap_or_surplus >= 0 ? `Surplus: ${fmtCur(mtfsComparison.gap_or_surplus)}` : `Gap: ${fmtCur(Math.abs(mtfsComparison.gap_or_surplus))}` },
      { area: 'Cost Pressures (26/27)', mtfs_value: fmtCur(mtfsComparison.cost_pressures),
        doge_value: '—', implication: 'Unfunded demand pressure on top of savings targets' },
      ...(mtfsComparison.prior_year_shortfall > 0 ? [{
        area: 'Prior Year ASC Shortfall', mtfs_value: fmtCur(mtfsComparison.prior_year_shortfall),
        doge_value: '—', implication: 'Carried forward demand not addressed' }] : []),
    ],
    overall_assessment: `AI DOGE identifies ${mtfsComparison.two_year_coverage_pct ?? 0}% of the two-year MTFS target.`
      + (mtfsComparison.gap_or_surplus >= 0
        ? ` Surplus position of ${fmtCur(mtfsComparison.gap_or_surplus)}.`
        : ` Shortfall of ${fmtCur(Math.abs(mtfsComparison.gap_or_surplus))} — structural reform needed.`)
      + (mtfsComparison.redundancy_provision > 0
        ? ` Redundancy provision: ${fmtCur(mtfsComparison.redundancy_provision)}.`
        : ''),
  } : null

  return (
    <Document>
      {/* Cover */}
      <CoverPage
        title="Leader's Briefing"
        subtitle="Lancashire County Council — Reform Operations Command"
        meta={`${(portfolios || []).length} portfolios • ${formatCurrency(totalSavings * 1e6)} savings pipeline • Generated ${new Date().toLocaleDateString('en-GB')}`}
        classification="CONFIDENTIAL — LEADER USE ONLY"
        councilName={councilName || 'Lancashire County Council'}
      />

      {/* ─── PAGE 2: Fiscal System Overview ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Fiscal System Overview" subtitle="Reform Operations Command" classification="LEADER" />

        <StatsRow>
          <StatCard value={formatCurrency(totalBudget)} label="Total Budget" />
          <StatCard value={formatCurrency(totalSavings * 1e6)} label="Savings Pipeline" color={COLORS.success} />
          <StatCard value={formatCurrency(immediateSavings * 1e6)} label="Immediate Wins" color={COLORS.warning} />
          <StatCard value={`${coveragePct}%`} label="Model Coverage" color={coveragePct > 60 ? COLORS.success : COLORS.warning} detail={`${modelsComplete}/${modelsTotal} modelled`} />
        </StatsRow>

        {/* MTFS headline stats */}
        {totals && (
          <StatsRow>
            <StatCard value={formatCurrency(totals.mtfsTarget)} label="MTFS Year 1" />
            <StatCard value={`${totals.coveragePct}%`} label="Coverage" color={totals.coveragePct >= 100 ? COLORS.success : COLORS.danger} />
            <StatCard value={`${totals.priorPct}%`} label="Prior Year Delivery" color={totals.priorPct >= 80 ? COLORS.success : COLORS.danger} />
            <StatCard value={formatCurrency(totals.priorGap)} label="Prior Year Gap" color={COLORS.danger} />
          </StatsRow>
        )}

        {/* Directorate Summary */}
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
            name: (d.title || d.name || d.id || '—').split(',')[0],
            portfolios: d.portfolio_count?.toString() || '—',
            budget: formatCurrency(d.net_budget || d.total_budget),
            savings: d.savings_range ? `${formatCurrency(d.savings_range.low)}–${formatCurrency(d.savings_range.high)}` : formatCurrency((d.total_savings || 0) * 1e6),
            coverage: `${d.coverage_pct || 0}%`,
            evidence: `${d.avg_evidence_strength || 0}/100`,
            directives: d.directive_count?.toString() || d.lever_count?.toString() || '—',
            risk: d.risk_level || (riskProfiles?.[d.directorate_id]?.risk_level) || '—',
            _colors: {
              risk: (d.risk_level || riskProfiles?.[d.directorate_id]?.risk_level) === 'high' ? COLORS.danger
                : (d.risk_level || riskProfiles?.[d.directorate_id]?.risk_level) === 'medium' ? COLORS.warning : COLORS.success,
              coverage: (d.coverage_pct || 0) >= 100 ? COLORS.success : COLORS.danger,
            },
          }))}
        />

        {/* Fiscal Health */}
        {fiscalOverview && (
          <Card highlight>
            <SubsectionHeading title="Fiscal Health Assessment" />
            {fiscalOverview.demand_growth && <KeyValue label="Demand Growth" value={formatPct(fiscalOverview.demand_growth)} color={COLORS.danger} />}
            {fiscalOverview.savings_coverage && <KeyValue label="Savings vs Demand" value={formatPct(fiscalOverview.savings_coverage)} color={COLORS.accent} />}
            {fiscalOverview.net_trajectory && <KeyValue label="Net Fiscal Trajectory" value={fiscalOverview.net_trajectory} />}
            {fiscalOverview.breakeven_year && <KeyValue label="Breakeven Year" value={fiscalOverview.breakeven_year.toString()} />}
          </Card>
        )}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>

      {/* ─── PAGE 3: Monday Morning List ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Monday Morning List" subtitle="Priority Actions This Week" classification="LEADER" />

        {(mondayMorningList || immediateDirectives).slice(0, 15).map((d, i) => (
          <Card key={i} accent={i < 3}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 3 }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: i < 3 ? COLORS.accent : COLORS.textPrimary }}>
                  {i + 1}. {d.action?.substring(0, 80) || '—'}
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 2 }}>
                  {d.portfolio_title || d.portfolio || '—'} • {d.category?.replace(/_/g, ' ') || '—'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.success }}>
                  {formatCurrency((d.save_central || 0) * 1e6)}
                </Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>{d.timeline || '—'}</Text>
              </View>
            </View>
            {d.how && (
              <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 3 }}>
                HOW: {d.how.substring(0, 120)}
              </Text>
            )}
            {d.route && (
              <Text style={{ fontSize: FONT.micro, color: COLORS.accent, marginTop: 2 }}>
                ROUTE: {d.route}
              </Text>
            )}
          </Card>
        ))}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>

      {/* ─── PAGE 4: Per-Portfolio Summary ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Portfolio Summary" subtitle="All 10 Portfolios at a Glance" classification="LEADER" />

        {(portfolios || []).map((p, i) => {
          const pDirectives = (allDirectives || []).filter(d => d.portfolio_id === p.id || d.portfolio === p.id)
          const pSavings = pDirectives.reduce((s, d) => s + (d.save_central || 0), 0)
          const pBudget = p.budget_total || p.budget?.total || 0

          return (
            <Card key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                    {p.short_title || p.title || p.id}
                  </Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>
                    {p.cabinet_member?.name || '—'} • {p.lead_officer?.name || '—'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.success }}>
                    {formatCurrency(pSavings * 1e6)}
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
              {/* Top directive for this portfolio */}
              {pDirectives[0] && (
                <Text style={{ fontSize: FONT.micro, color: COLORS.textSecondary, marginTop: 2 }}>
                  Top: {pDirectives[0].action?.substring(0, 100)}
                </Text>
              )}
            </Card>
          )
        })}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>

      {/* ─── PAGE 5: MTFS Comparison ─── */}
      {mtfsGaps && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
          <PDFHeader title="MTFS Comparison" subtitle="AI DOGE vs Official Medium Term Financial Strategy" classification="LEADER" />

          <Card highlight>
            <SubsectionHeading title="Key Differences" />
            {mtfsGaps.gaps.map((gap, i) => (
              <View key={i} style={{ marginBottom: SPACE.sm }}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.warning }}>{gap.area}</Text>
                <View style={styles.row}>
                  <View style={styles.col2}>
                    <KeyValue label="MTFS Says" value={gap.mtfs_value || '—'} />
                  </View>
                  <View style={styles.col2}>
                    <KeyValue label="AI DOGE Says" value={gap.doge_value || '—'} color={COLORS.accent} />
                  </View>
                </View>
                {gap.implication && (
                  <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginTop: 2 }}>
                    {gap.implication}
                  </Text>
                )}
              </View>
            ))}
          </Card>

          {/* MTFS headline numbers */}
          <StatsRow>
            <StatCard value={`${mtfsComparison.year1_coverage_pct ?? 0}%`} label="Year 1 Coverage" color={mtfsComparison.year1_coverage_pct >= 80 ? COLORS.success : COLORS.danger} />
            <StatCard value={`${mtfsComparison.two_year_coverage_pct ?? 0}%`} label="Two-Year Coverage" color={mtfsComparison.two_year_coverage_pct >= 80 ? COLORS.success : COLORS.danger} />
            <StatCard value={fmtCur(Math.abs(mtfsComparison.gap_or_surplus))} label={mtfsComparison.gap_or_surplus >= 0 ? 'Surplus' : 'Shortfall'} color={mtfsComparison.gap_or_surplus >= 0 ? COLORS.success : COLORS.danger} />
          </StatsRow>

          {mtfsGaps.overall_assessment && (
            <Card accent>
              <SubsectionHeading title="Overall Assessment" />
              <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
                {mtfsGaps.overall_assessment}
              </Text>
            </Card>
          )}

          <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 6: Political Impact & Electoral Ripple ─── */}
      {politicalImpact && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
          <PDFHeader title="Political Impact Assessment" subtitle="Electoral Ripple from LCC Reform Operations" classification="LEADER" />

          <StatsRow>
            <StatCard value={formatCurrency(totalSavings * 1e6)} label="Savings Narrative" color={COLORS.accent} />
            <StatCard value={(allDirectives || []).length.toString()} label="Active Directives" />
            <StatCard value={`${politicalImpact.overall_score || 0}/100`} label="Overall Impact" color={politicalImpact.overall_score >= 70 ? COLORS.success : COLORS.warning} />
          </StatsRow>

          <Card highlight>
            <SubsectionHeading title="Borough Election Impact" />
            <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5, marginBottom: SPACE.sm }}>
              Every Reform action at LCC ripples across 12 borough districts. Reform as a new governing party gets 2-3x media scrutiny — use this, don't fear it.
            </Text>
          </Card>

          {/* District Impact Table */}
          {politicalImpact.district_impact?.length > 0 && (
            <Table
              columns={[
                { key: 'district', label: 'District', flex: 2, bold: true },
                { key: 'score', label: 'Impact', width: 50, align: 'right' },
                { key: 'talking_point', label: 'Talking Point', flex: 3 },
              ]}
              rows={politicalImpact.district_impact.slice(0, 12).map(di => ({
                district: di.district || di.name || '—',
                score: `${di.impact_score ?? di.score ?? 0}/100`,
                talking_point: di.talking_point || '—',
                _colors: { score: (di.impact_score ?? di.score ?? 0) >= 60 ? COLORS.success : COLORS.warning },
              }))}
            />
          )}

          {/* National Narrative */}
          {politicalImpact.constituency_impact?.national_narrative && (
            <Card accent style={{ marginTop: SPACE.md }}>
              <SubsectionHeading title="National Narrative" />
              <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                "{politicalImpact.constituency_impact.national_narrative}"
              </Text>
            </Card>
          )}

          <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 7: Risk Register & Inspections ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="LEADER BRIEFING — MOST RESTRICTED" />
        <PDFHeader title="Risk Register & Inspections" subtitle="Key Risk Exposures Across All Portfolios" classification="LEADER" />

        {/* Directorate Risk Profiles (computed, not hardcoded) */}
        {riskProfiles && Object.keys(riskProfiles).length > 0 && (
          <>
            <SectionHeading title="Directorate Risk Profiles" />
            {Object.entries(riskProfiles).map(([dirId, profile]) => {
              if (!profile) return null
              const dirName = (directorates || []).find(d => d.directorate_id === dirId)?.title?.split(',')[0] || dirId
              return (
                <Card key={dirId}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>{dirName}</Text>
                    <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: profile.risk_color || COLORS.warning }}>
                      {profile.risk_level || '—'} ({profile.risk_score || 0}/100)
                    </Text>
                  </View>
                  {profile.top_risks?.length > 0 && (
                    <BulletList
                      items={profile.top_risks.slice(0, 3).map(r => typeof r === 'string' ? r : r.risk || r.title || r.description || '')}
                      color={profile.risk_level === 'high' || profile.risk_level === 'critical' ? COLORS.danger : COLORS.warning}
                    />
                  )}
                </Card>
              )
            })}
          </>
        )}

        {/* Spending Concentration Alerts */}
        {spendingByDirectorate && Object.values(spendingByDirectorate).some(d => d.alerts?.length > 0) && (
          <>
            <SectionHeading title="Spending Intelligence Alerts" />
            <Card highlight>
              <BulletList
                items={Object.entries(spendingByDirectorate).flatMap(([dirId, ds]) =>
                  (ds.alerts || []).map(a =>
                    a.type === 'variance'
                      ? `${a.portfolio}: ${a.pct > 0 ? '+' : ''}${a.pct}% budget variance — investigate immediately`
                      : `${a.portfolio}: HHI ${a.hhi} supplier concentration (top: ${a.top})`
                  )
                ).slice(0, 8)}
                color={COLORS.danger}
              />
            </Card>
          </>
        )}

        {/* Portfolio-level risks (fallback: from portfolio data) */}
        <SectionHeading title="Top Risks by Portfolio" />
        {(portfolios || []).map((p, i) => {
          const risks = p.known_pressures || p.demand_pressures || []
          if (risks.length === 0) return null
          return (
            <Card key={i}>
              <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                {p.short_title || p.title}
              </Text>
              <BulletList
                items={risks.slice(0, 3).map(r => typeof r === 'string' ? r : r.pressure || r.title || '')}
                color={COLORS.warning}
              />
            </Card>
          )
        }).filter(Boolean)}

        {/* Inspection Status */}
        {fiscalOverview?.inspection_summary?.length > 0 && (
          <>
            <SectionHeading title="Inspection Status" />
            <Table
              columns={[
                { key: 'portfolio', label: 'Portfolio', flex: 2, bold: true },
                { key: 'rating', label: 'Current', width: 90 },
                { key: 'target', label: 'Target', width: 90 },
              ]}
              rows={fiscalOverview.inspection_summary.map(ins => ({
                portfolio: ins.portfolio || '—',
                rating: ins.current_rating || '—',
                target: ins.target_rating || '—',
                _colors: {
                  rating: ins.current_rating?.toLowerCase().includes('requires') ? COLORS.danger
                    : ins.current_rating?.toLowerCase().includes('good') ? COLORS.success : COLORS.warning,
                },
              }))}
            />
          </>
        )}

        <PDFFooter councilName={councilName} classification="LEADER BRIEFING" />
      </Page>
    </Document>
  )
}
