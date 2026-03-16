/**
 * StrategistSheetPDF - Comprehensive per-ward strategist briefing (5-7 pages).
 *
 * Contains EVERYTHING: electoral history, demographics, deprivation, housing,
 * HMO, economy, crime, health, planning, DOGE findings, councillor voting record,
 * incumbent analysis, swing analysis, messaging strategy, attack vectors, GOTV.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, SectionHeading, SubsectionHeading,
  Card, StatCard, StatsRow, BulletList, TierBadge, Table, Divider, TalkingPoint,
  KeyValue, ElectionHistoryTable, WardIssuesCard, ProgressBar, HorizontalBarChart,
  partyColor, formatCurrency, formatPct, formatNumber, formatDate, daysUntil,
} from './PDFComponents.jsx'
import { BURNLEY_WARD_INTEL } from '../../utils/strategyEngine.js'

export function StrategistSheetPDF({ wardName, dossier, playbook, councilName, electionDate, rawData }) {
  if (!dossier) return (
    <Document><Page size="A4" style={styles.page}><Text style={{ color: COLORS.textPrimary }}>No dossier data available for strategist briefing.</Text></Page></Document>
  )

  const { profile, election, councillors, councilPerformance, constituency, talkingPoints,
          entrenchment, wardStrategy, fiscalContext, propertySummary, overallScore, scoringFactors, cheatSheet } = dossier
  const intel = BURNLEY_WARD_INTEL[wardName] || {}
  const elDate = electionDate || dossier.electionDate || '2026-05-07'
  const daysLeft = daysUntil(elDate)

  // Extract data from rawData if provided
  const housingData = rawData?.housingData
  const hmoData = rawData?.hmoData
  const economyData = rawData?.economyData
  const healthData = rawData?.healthData
  const electionsData = rawData?.electionsData
  const demographicsData = rawData?.demographicsData
  const deprivationData = rawData?.deprivationData
  const dogeFindings = rawData?.dogeFindings
  const planningData = rawData?.planningData
  const votingData = rawData?.votingData
  const budgetSummary = rawData?.budgetSummary
  const collectionRates = rawData?.collectionRates
  const wardElection = electionsData?.wards?.[wardName]

  // Ethnicity breakdown from demographics
  const wardDemo = demographicsData?.wards
    ? Object.values(demographicsData.wards).find(w => w?.name === wardName || w?.ward === wardName)
    : null
  const ethnicityData = wardDemo?.ethnicity
    ? Object.entries(wardDemo.ethnicity)
        .filter(([k]) => !/total/i.test(k))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label: label.replace(/^(White|Asian|Black|Mixed|Other)[,:]\s*/i, '').slice(0, 20), value }))
    : null
  const religionData = wardDemo?.religion
    ? Object.entries(wardDemo.religion)
        .filter(([k]) => !/total/i.test(k))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, value]) => ({ label: label.slice(0, 20), value }))
    : null

  // Health ward lookup
  const healthWard = healthData?.census?.wards
    ? Object.values(healthData.census.wards).find(w => w?.name === wardName || w?.ward === wardName)
    : null

  // Economy ward lookup
  const econWard = economyData?.claimant_count?.ward_latest
    ? Object.values(economyData.claimant_count.ward_latest).find(w => w?.name === wardName || w?.ward === wardName)
    : null

  // Planning ward lookup
  const planWard = planningData?.summary?.by_ward?.[wardName] || planningData?.ward_summary?.[wardName]

  // DOGE findings
  const fraudTriangle = dogeFindings?.fraud_triangle || dogeFindings?.meta?.fraud_triangle
  const topFindings = (dogeFindings?.findings || [])
    .filter(f => f.severity === 'critical' || f.severity === 'high' || f.severity === 'warning')
    .slice(0, 5)

  // Voting record for ward councillors
  const councillorNames = (councillors || []).map(c => c.name?.toLowerCase())
  const councillorVotes = votingData?.votes
    ? votingData.votes
        .filter(v => v.councillor_votes?.some(cv => councillorNames.includes(cv.name?.toLowerCase())))
        .slice(0, 8)
    : []

  return (
    <Document>
      {/* ─── PAGE 1: Overview + Electoral Intelligence ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader
          title={wardName}
          subtitle={`Strategist Briefing: ${councilName || 'Burnley'}`}
          classification="STRATEGIST"
          date={formatDate(new Date().toISOString())}
        />

        {/* Hero stats */}
        <StatsRow>
          <StatCard value={overallScore?.toFixed(0) || '-'} label="Priority Score" color={overallScore > 70 ? COLORS.success : overallScore > 40 ? COLORS.warning : COLORS.danger} />
          <StatCard value={intel.tier?.replace(/_/g, ' ').toUpperCase() || wardStrategy?.archetype?.replace(/_/g, ' ') || '-'} label="Classification" color={COLORS[intel.tier] || COLORS.accent} />
          <StatCard value={daysLeft != null ? `${daysLeft}` : '-'} label="Days to Election" color={daysLeft < 30 ? COLORS.danger : COLORS.warning} detail={elDate} />
          <StatCard value={entrenchment?.level?.toUpperCase() || '-'} label="Entrenchment" color={entrenchment?.level === 'vulnerable' ? COLORS.success : entrenchment?.level === 'fortress' ? COLORS.danger : COLORS.warning} />
        </StatsRow>

        {/* Election Intelligence */}
        <SectionHeading title="Election Intelligence" />
        <View style={styles.row}>
          <View style={styles.col2}>
            <Card>
              <SubsectionHeading title="Current Position" />
              <KeyValue label="Defender" value={election?.defender?.name || '-'} color={partyColor(election?.defender?.party)} />
              <KeyValue label="Party" value={election?.defender?.party || '-'} />
              <KeyValue label="Predicted Winner" value={election?.prediction?.winner || '-'} />
              <KeyValue label="Our Predicted %" value={formatPct(election?.prediction?.ourPct)} color={COLORS.accent} />
              <KeyValue label="Swing Required" value={formatPct(election?.prediction?.swingRequired)} color={COLORS.warning} />
              <KeyValue label="Win Probability" value={formatPct((election?.prediction?.winProbability || 0) * 100, 0)} color={COLORS.success} />
              <KeyValue label="Confidence" value={election?.prediction?.confidence || '-'} />
            </Card>
          </View>
          <View style={styles.col2}>
            <Card>
              <SubsectionHeading title="Swing Analysis" />
              <KeyValue label="Avg Swing" value={formatPct(election?.avgSwing)} />
              <KeyValue label="Trend" value={election?.trend?.toUpperCase() || '-'} color={election?.trend === 'positive' ? COLORS.success : COLORS.danger} />
              <KeyValue label="Volatility" value={election?.volatility || '-'} />
              {election?.history?.slice(0, 5).map((s, i) => (
                <KeyValue key={i} label={`${s.year} swing`} value={formatPct(s.swing)} color={s.swing > 0 ? COLORS.success : COLORS.danger} />
              ))}
            </Card>
          </View>
        </View>

        {/* Scoring Factors */}
        {scoringFactors?.length > 0 && (
          <Card>
            <SubsectionHeading title="Priority Score Breakdown" />
            {scoringFactors.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, flex: 2 }}>{f.factor}</Text>
                <Text style={{ fontSize: FONT.tiny, fontFamily: FONT.bold, color: COLORS.accent, width: 30, textAlign: 'right' }}>{f.score?.toFixed(0)}</Text>
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, flex: 2, textAlign: 'right' }}>{f.detail}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Full Electoral History */}
        <SectionHeading title="Electoral History" />
        <ElectionHistoryTable history={wardElection?.history || []} wardName={wardName} />

        {/* All current holders */}
        {election?.allHolders?.length > 0 && (
          <Card>
            <SubsectionHeading title="All Current Holders" />
            {election.allHolders.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ fontSize: FONT.small, color: partyColor(h.party), width: 80, fontFamily: FONT.bold }}>{h.party}</Text>
                <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary }}>{h.name} (elected {h.year})</Text>
              </View>
            ))}
          </Card>
        )}

        <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
      </Page>

      {/* ─── PAGE 2: Demographics + Ward Profile ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title={wardName} subtitle="Demographics & Ward Profile" classification="STRATEGIST" />

        <StatsRow>
          <StatCard value={formatNumber(profile?.population)} label="Population" />
          <StatCard value={formatPct(profile?.whiteBritishPct, 0)} label="White British" />
          <StatCard value={formatPct(profile?.over65Pct, 0)} label="Over 65" />
          <StatCard value={profile?.deprivation?.decile?.toString() || '-'} label="IMD Decile" detail={`Rank ${profile?.deprivation?.rank || '-'}`} color={profile?.deprivation?.decile <= 2 ? COLORS.danger : COLORS.textPrimary} />
        </StatsRow>

        {/* Deprivation Deep Dive */}
        {profile?.deprivation && (
          <Card>
            <SubsectionHeading title="Deprivation Profile" />
            <KeyValue label="IMD Score" value={intel.imd?.toFixed(1) || profile?.deprivation?.score?.toFixed(1) || '-'} />
            <KeyValue label="Decile" value={profile?.deprivation?.decile?.toString() || '-'} color={profile?.deprivation?.decile <= 2 ? COLORS.danger : COLORS.textPrimary} />
            <KeyValue label="Rank" value={formatNumber(profile?.deprivation?.rank)} />
            {profile?.deprivation?.domains && Object.entries(profile.deprivation.domains).map(([k, v]) => (
              <KeyValue key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'number' ? v.toFixed(1) : String(v)} />
            ))}
          </Card>
        )}

        {/* Ethnicity Breakdown */}
        {ethnicityData?.length > 0 && (
          <>
            <SubsectionHeading title="Ethnicity Breakdown" />
            <HorizontalBarChart data={ethnicityData} maxBars={6} />
          </>
        )}

        {/* Religion Breakdown */}
        {religionData?.length > 0 && (
          <>
            <SubsectionHeading title="Religion Breakdown" />
            <HorizontalBarChart data={religionData} maxBars={5} />
          </>
        )}

        {/* Housing */}
        <SectionHeading title="Housing" />
        <View style={styles.row}>
          <View style={styles.col2}>
            <Card>
              <SubsectionHeading title="Tenure" />
              {housingData?.wards && (() => {
                const wh = Object.values(housingData.wards).find(w => w.name === wardName)
                if (!wh?.tenure) return <Text style={styles.textSmall}>No ward data</Text>
                return Object.entries(wh.tenure).map(([k, v]) => (
                  <KeyValue key={k} label={k.replace(/_/g, ' ')} value={formatPct(v.pct)} />
                ))
              })()}
            </Card>
          </View>
          <View style={styles.col2}>
            <Card>
              <SubsectionHeading title="HMO Intelligence" />
              {hmoData?.modelling?.hotspot_wards && (() => {
                const wh = hmoData.modelling.hotspot_wards.find(w => w.ward === wardName)
                if (wh) {
                  return (
                    <>
                      <KeyValue label="Estimated HMOs" value={formatNumber(wh.estimated_hmos)} color={COLORS.warning} />
                      <KeyValue label="% of Ward Stock" value={formatPct(wh.pct_of_ward_stock)} />
                      <KeyValue label="Risk Level" value={wh.risk_level?.toUpperCase()} color={wh.risk_level === 'high' ? COLORS.danger : COLORS.warning} />
                    </>
                  )
                }
                return <Text style={styles.textSmall}>Low HMO density</Text>
              })()}
              {hmoData?.modelling?.article_4_direction?.status === 'in_force' && (
                <Text style={{ fontSize: FONT.micro, color: COLORS.accent, marginTop: 3 }}>
                  Article 4 Direction in force. HMO growth controlled
                </Text>
              )}
            </Card>
          </View>
        </View>

        {/* Homelessness Borough Context */}
        {housingData?.homelessness && (
          <Card highlight>
            <SubsectionHeading title="Borough Homelessness Pressure" />
            <View style={styles.row}>
              <View style={styles.col3}><KeyValue label="Enquiries" value={formatNumber(housingData.homelessness.enquiries)} color={COLORS.danger} /></View>
              <View style={styles.col3}><KeyValue label="Active Cases" value={formatNumber(housingData.homelessness.active_cases)} /></View>
              <View style={styles.col3}><KeyValue label="Waiting List" value={formatNumber(housingData.homelessness.waiting_list)} /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.col3}><KeyValue label="Temp Accommodation" value={formatNumber(housingData.homelessness.temporary_accommodation)} /></View>
              <View style={styles.col3}><KeyValue label="Rough Sleeping" value={housingData.homelessness.rough_sleeping?.count_2025?.toString() || '-'} /></View>
              <View style={styles.col3}><KeyValue label="Empty Homes" value={formatNumber(housingData.housing_pressure?.empty_homes?.total)} /></View>
            </View>
          </Card>
        )}

        {/* Economy */}
        <SectionHeading title="Economy" />
        <Card>
          <View style={styles.row}>
            <View style={styles.col2}>
              <KeyValue label="Claimant %" value={econWard?.rate != null ? formatPct(econWard.rate) : intel.claimants_pct ? formatPct(intel.claimants_pct) : '-'} color={(econWard?.rate || intel.claimants_pct || 0) > 5 ? COLORS.danger : COLORS.textPrimary} />
              {housingData?.housing_pressure?.universal_credit && (
                <KeyValue label="UC Borough Rate" value={formatPct(housingData.housing_pressure.universal_credit)} />
              )}
              {economyData?.earnings?.median_weekly_pay && (
                <KeyValue label="Median Weekly Pay" value={`£${economyData.earnings.median_weekly_pay}`} />
              )}
              {economyData?.earnings?.median_annual_pay && (
                <KeyValue label="Median Annual Pay" value={`£${formatNumber(economyData.earnings.median_annual_pay)}`} />
              )}
            </View>
            <View style={styles.col2}>
              {housingData?.housing_pressure?.private_rent && (
                <>
                  <KeyValue label="Avg Rent" value={`£${housingData.housing_pressure.private_rent.average_monthly}`} />
                  <KeyValue label="LHA Shortfall" value={`£${housingData.housing_pressure.lha_gap?.monthly_gap}/mo`} color={COLORS.danger} />
                </>
              )}
            </View>
          </View>
        </Card>

        <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
      </Page>

      {/* ─── PAGE 3: Crime, Health & Planning ─── */}
      {(healthWard || planWard || profile?.deprivation?.domains) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner />
          <PDFHeader title={wardName} subtitle="Crime, Health & Planning Intelligence" classification="STRATEGIST" />

          {/* Crime Intelligence - from deprivation domains */}
          {profile?.deprivation?.domains && (
            <>
              <SectionHeading title="Crime & Safety" />
              <Card>
                <SubsectionHeading title="IMD Crime Domain" />
                {profile.deprivation.domains.crime != null && (
                  <KeyValue label="Crime Domain Score" value={typeof profile.deprivation.domains.crime === 'number' ? profile.deprivation.domains.crime.toFixed(1) : String(profile.deprivation.domains.crime)} color={COLORS.danger} />
                )}
                {profile.deprivation.domains.living_environment != null && (
                  <KeyValue label="Living Environment" value={typeof profile.deprivation.domains.living_environment === 'number' ? profile.deprivation.domains.living_environment.toFixed(1) : String(profile.deprivation.domains.living_environment)} />
                )}
                <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, marginTop: 3 }}>
                  IMD Decile {profile.deprivation.decile || '-'}: {profile.deprivation.decile <= 2 ? 'Top 20% most deprived nationally' : profile.deprivation.decile <= 4 ? 'Top 40% most deprived' : 'Above average'}
                </Text>
              </Card>
            </>
          )}

          {/* Health Intelligence */}
          {(healthWard || healthData?.indicators) && (
            <>
              <SectionHeading title="Health Intelligence" />
              <Card>
                {healthData?.indicators?.life_expectancy_male && (
                  <View style={styles.row}>
                    <View style={styles.col2}><KeyValue label="Life Exp (Male)" value={`${healthData.indicators.life_expectancy_male.toFixed(1)} yrs`} /></View>
                    <View style={styles.col2}><KeyValue label="Life Exp (Female)" value={`${healthData.indicators.life_expectancy_female?.toFixed(1)} yrs`} /></View>
                  </View>
                )}
                {healthData?.indicators?.under_75_mortality && (
                  <KeyValue label="Under-75 Mortality" value={healthData.indicators.under_75_mortality.toFixed(1)} color={COLORS.danger} />
                )}
                {healthWard?.general_health && (
                  <>
                    <SubsectionHeading title="Self-Reported Health" />
                    {Object.entries(healthWard.general_health).filter(([k]) => !/total/i.test(k)).map(([k, v]) => (
                      <KeyValue key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'object' ? formatPct(v.pct) : formatNumber(v)} />
                    ))}
                  </>
                )}
                {healthWard?.disability && (
                  <>
                    <SubsectionHeading title="Disability" />
                    {Object.entries(healthWard.disability).filter(([k]) => !/total/i.test(k)).map(([k, v]) => (
                      <KeyValue key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'object' ? formatPct(v.pct) : formatNumber(v)} />
                    ))}
                  </>
                )}
                {healthWard?.unpaid_care && (
                  <>
                    <SubsectionHeading title="Unpaid Care" />
                    {Object.entries(healthWard.unpaid_care).filter(([k]) => !/total/i.test(k)).map(([k, v]) => (
                      <KeyValue key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'object' ? formatPct(v.pct) : formatNumber(v)} />
                    ))}
                  </>
                )}
              </Card>
            </>
          )}

          {/* Planning Intelligence */}
          {planWard && (
            <>
              <SectionHeading title="Planning Intelligence" />
              <Card>
                <View style={styles.row}>
                  <View style={styles.col2}><KeyValue label="Total Applications" value={formatNumber(planWard.total || planWard.count)} /></View>
                  <View style={styles.col2}><KeyValue label="Approval Rate" value={planWard.approval_rate != null ? formatPct(planWard.approval_rate) : '-'} color={COLORS.accent} /></View>
                </View>
                {planWard.by_type && Object.entries(planWard.by_type).slice(0, 4).map(([type, count]) => (
                  <KeyValue key={type} label={type.replace(/_/g, ' ')} value={formatNumber(count)} />
                ))}
              </Card>
            </>
          )}

          <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 4: DOGE & Financial Intelligence ─── */}
      {(topFindings.length > 0 || councillorVotes.length > 0 || fiscalContext) && (
        <Page size="A4" style={styles.page}>
          <ConfidentialBanner />
          <PDFHeader title={wardName} subtitle="DOGE & Financial Intelligence" classification="STRATEGIST" />

          {/* DOGE Findings */}
          {topFindings.length > 0 && (
            <>
              <SectionHeading title="DOGE Spending Anomalies" />
              <StatsRow>
                <StatCard value={fraudTriangle?.overall_score?.toFixed(0) || '-'} label="Fraud Triangle" color={fraudTriangle?.overall_score > 60 ? COLORS.danger : COLORS.warning} />
                <StatCard value={dogeFindings?.meta?.verification_score?.toFixed(0) || dogeFindings?.verification?.overall_score?.toFixed(0) || '-'} label="Verification" />
                <StatCard value={topFindings.length.toString()} label="Key Findings" color={COLORS.warning} />
              </StatsRow>
              <Table
                columns={[
                  { key: 'severity', label: 'Severity', width: 55 },
                  { key: 'category', label: 'Category', width: 80 },
                  { key: 'description', label: 'Finding', flex: 3 },
                ]}
                rows={topFindings.map(f => ({
                  severity: (f.severity || '').toUpperCase(),
                  category: (f.category || f.type || '').replace(/_/g, ' ').slice(0, 18),
                  description: (f.description || f.title || f.finding || '').slice(0, 80),
                  _colors: { severity: f.severity === 'critical' ? COLORS.danger : COLORS.warning },
                }))}
              />
            </>
          )}

          {/* Councillor Voting Record */}
          {councillorVotes.length > 0 && (
            <>
              <SectionHeading title="Councillor Voting Record" />
              <Table
                columns={[
                  { key: 'motion', label: 'Motion', flex: 3 },
                  { key: 'vote', label: 'Vote', width: 55 },
                  { key: 'date', label: 'Date', width: 65 },
                ]}
                rows={councillorVotes.map(v => {
                  const cv = v.councillor_votes?.find(cv2 => councillorNames.includes(cv2.name?.toLowerCase()))
                  return {
                    motion: (v.title || v.motion || v.description || '').slice(0, 60),
                    vote: cv?.vote || '-',
                    date: v.date || '-',
                    _colors: { vote: cv?.vote === 'For' ? COLORS.success : cv?.vote === 'Against' ? COLORS.danger : COLORS.textMuted },
                  }
                })}
              />
            </>
          )}

          {/* Financial Context */}
          {fiscalContext && (
            <>
              <SectionHeading title="Financial Context" />
              <Card highlight>
                <View style={styles.row}>
                  <View style={styles.col2}>
                    <KeyValue label="Reserves Rating" value={fiscalContext.reserves_rating || '-'} color={fiscalContext.reserves_rating === 'critical' ? COLORS.danger : COLORS.textPrimary} />
                    <KeyValue label="Reserves (months)" value={fiscalContext.reserves_months != null ? `${fiscalContext.reserves_months.toFixed(1)}` : '-'} color={fiscalContext.reserves_months < 3 ? COLORS.danger : COLORS.textPrimary} />
                  </View>
                  <View style={styles.col2}>
                    <KeyValue label="Collection Rate" value={fiscalContext.collection_efficiency ? formatPct(fiscalContext.collection_efficiency) : '-'} />
                    <KeyValue label="Overall Health" value={fiscalContext.overall_health?.toUpperCase() || '-'} color={fiscalContext.overall_color || COLORS.textPrimary} />
                  </View>
                </View>
              </Card>
            </>
          )}

          <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
        </Page>
      )}

      {/* ─── PAGE 5: Councillor Intelligence + Integrity ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title={wardName} subtitle="Councillor Intelligence & Attack Lines" classification="STRATEGIST" />

        {/* Incumbent Analysis */}
        <SectionHeading title="Incumbent Analysis" />
        {councillors?.length > 0 ? councillors.map((c, i) => (
          <Card key={i} accent={c.isDefender}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xs }}>
              <View>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: c.isDefender ? COLORS.accent : COLORS.textPrimary }}>
                  {c.name} {c.isDefender ? '(DEFENDING)' : ''}
                </Text>
                <Text style={{ fontSize: FONT.tiny, color: partyColor(c.party) }}>{c.party}</Text>
              </View>
              {c.integrity && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: c.integrity.riskLevel === 'high' ? COLORS.danger : COLORS.textPrimary }}>
                    {c.integrity.score}/100
                  </Text>
                  <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted }}>Integrity Score</Text>
                </View>
              )}
            </View>

            {c.roles?.length > 0 && (
              <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary, marginBottom: 3 }}>
                Roles: {c.roles.join(', ')}
              </Text>
            )}

            {c.integrity?.redFlags?.length > 0 && (
              <>
                <SubsectionHeading title="Red Flags" />
                <BulletList items={c.integrity.redFlags.map(f => typeof f === 'string' ? f : f.description || f.flag || JSON.stringify(f))} color={COLORS.danger} />
              </>
            )}

            {c.interests?.companies?.length > 0 && (
              <>
                <SubsectionHeading title="Declared Companies" />
                <BulletList items={c.interests.companies.map(co => typeof co === 'string' ? co : co.name || JSON.stringify(co))} />
              </>
            )}

            {c.interests?.employment?.length > 0 && (
              <>
                <SubsectionHeading title="Employment & Other Interests" />
                <BulletList items={c.interests.employment.slice(0, 3).map(e => typeof e === 'string' ? e : e.employer || e.name || JSON.stringify(e))} />
              </>
            )}

            {c.attackLines?.length > 0 && (
              <>
                <SubsectionHeading title="Attack Lines" />
                {c.attackLines.slice(0, 5).map((a, j) => (
                  <TalkingPoint key={j} text={typeof a === 'string' ? a : a.text || a.line || ''} category={a.category || 'Attack'} borderColor={COLORS.danger} />
                ))}
              </>
            )}
          </Card>
        )) : (
          <Card><Text style={styles.textSmall}>No councillor data available</Text></Card>
        )}

        {/* Entrenchment Score */}
        {entrenchment?.score > 0 && (
          <Card>
            <SubsectionHeading title={`Entrenchment Score: ${entrenchment.score}/100 (${entrenchment.level})`} />
            {entrenchment.factors?.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: FONT.tiny, color: COLORS.textSecondary }}>
                  {typeof f === 'object' ? f.factor : f}
                </Text>
                <Text style={{ fontSize: FONT.tiny, fontFamily: FONT.bold, color: COLORS.textPrimary }}>
                  {typeof f === 'object' ? `${f.value} (${f.detail || ''})` : ''}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Council Performance */}
        <SectionHeading title="Council Performance Context" />
        <Card>
          <KeyValue label="Political Control" value={councilPerformance?.politicalControl || '-'} />
          <KeyValue label="Fraud Triangle" value={councilPerformance?.fraudTriangleScore?.toFixed(1) || '-'} color={councilPerformance?.fraudTriangleScore > 60 ? COLORS.danger : COLORS.warning} />
          <KeyValue label="Collection Rate" value={formatPct(councilPerformance?.collectionRate?.latest)} />
          <KeyValue label="Council Tax Band D" value={councilPerformance?.councilTaxBandD ? `£${councilPerformance.councilTaxBandD.toFixed(2)}` : '-'} />
        </Card>

        <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
      </Page>

      {/* ─── PAGE 6: Strategy & Messaging ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title={wardName} subtitle="Strategy & Messaging Playbook" classification="STRATEGIST" />

        {/* Ward Strategy */}
        <SectionHeading title="Ward Strategy" />
        <Card highlight>
          <Text style={{ fontSize: FONT.h3, fontFamily: FONT.bold, color: COLORS.accent, marginBottom: SPACE.xs }}>
            {wardStrategy?.headline || 'General Campaign'}
          </Text>
          <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
            {wardStrategy?.approach || intel.messaging || 'Standard campaign approach.'}
          </Text>
          {wardStrategy?.archetype && (
            <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, marginTop: SPACE.xs }}>
              Archetype: {wardStrategy.archetype.replace(/_/g, ' ')}
            </Text>
          )}
        </Card>

        {/* Messaging Pillars */}
        {wardStrategy?.messagingPillars?.length > 0 && (
          <>
            <SubsectionHeading title="Messaging Pillars" />
            {wardStrategy.messagingPillars.map((mp, i) => (
              <Card key={i} accent>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.accent }}>
                  {typeof mp === 'object' ? mp.pillar || mp.title : mp}
                </Text>
                {typeof mp === 'object' && mp.detail && (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, marginTop: 2, lineHeight: 1.4 }}>
                    {mp.detail}
                  </Text>
                )}
              </Card>
            ))}
          </>
        )}

        {/* Attack Vectors */}
        {wardStrategy?.attackVectors?.length > 0 && (
          <>
            <SubsectionHeading title="Attack Vectors" />
            {wardStrategy.attackVectors.map((av, i) => (
              <Card key={i}>
                <Text style={{ fontSize: FONT.h4, fontFamily: FONT.bold, color: COLORS.danger }}>
                  {typeof av === 'object' ? av.vector || av.title : av}
                </Text>
                {typeof av === 'object' && av.detail && (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, marginTop: 2, lineHeight: 1.4 }}>
                    {av.detail}
                  </Text>
                )}
              </Card>
            ))}
          </>
        )}

        {/* Warnings */}
        {wardStrategy?.warnings?.length > 0 && (
          <>
            <SubsectionHeading title="Warnings: Do Not Say" />
            <BulletList items={wardStrategy.warnings} color={COLORS.danger} />
          </>
        )}

        <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
      </Page>

      {/* ─── PAGE 7: Talking Points + Constituency Context ─── */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner />
        <PDFHeader title={wardName} subtitle="Talking Points & Constituency Context" classification="STRATEGIST" />

        {/* Local Talking Points */}
        <SectionHeading title="Local Talking Points" />
        {(talkingPoints?.local || []).slice(0, 10).map((tp, i) => (
          <TalkingPoint key={i} text={tp.text} category={tp.category} priority={tp.priority} />
        ))}

        {/* Council Talking Points */}
        {talkingPoints?.council?.length > 0 && (
          <>
            <SectionHeading title="Council Attack Points" />
            {talkingPoints.council.slice(0, 6).map((tp, i) => (
              <TalkingPoint key={i} text={tp.text} category={tp.category} priority={tp.priority} borderColor={COLORS.danger} />
            ))}
          </>
        )}

        {/* Constituency Context */}
        {constituency && (
          <>
            <SectionHeading title="Constituency Context" />
            <Card>
              <KeyValue label="Constituency" value={constituency?.name || '-'} />
              <KeyValue label="MP" value={constituency?.mp?.name || '-'} />
              <KeyValue label="MP Party" value={constituency?.mp?.party || '-'} color={partyColor(constituency?.mp?.party)} />
              {constituency?.ge2024 && (
                <>
                  <Divider />
                  <SubsectionHeading title="GE2024 Results" />
                  {(constituency.ge2024.results || []).slice(0, 5).map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ fontSize: FONT.tiny, color: partyColor(r.party) }}>{r.party}</Text>
                      <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary }}>{formatNumber(r.votes)} ({formatPct(r.pct)})</Text>
                    </View>
                  ))}
                </>
              )}
              {constituency?.mpExpenses && (
                <>
                  <Divider />
                  <KeyValue label="MP Expenses Claimed" value={formatCurrency(constituency.mpExpenses.total)} />
                  <KeyValue label="Rank" value={`${constituency.mpExpenses.rank}/650`} />
                </>
              )}
            </Card>
          </>
        )}

        {/* National / Polling */}
        {talkingPoints?.national?.length > 0 && (
          <>
            <SectionHeading title="National & Polling Context" />
            {talkingPoints.national.slice(0, 4).map((tp, i) => (
              <TalkingPoint key={i} text={tp.text} category={tp.category} priority={tp.priority} />
            ))}
          </>
        )}

        {/* Ward-specific article issues */}
        <WardIssuesCard
          wardName={wardName}
          wardIntel={intel}
          hmoData={hmoData}
          housingData={housingData}
          economyData={economyData}
        />

        {/* GOTV & Resource */}
        <SectionHeading title="GOTV & Resource Allocation" />
        <Card>
          <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, lineHeight: 1.5 }}>
            {wardStrategy?.gotvApproach || playbook?.gotv?.strategy || 'Standard GOTV approach'}
          </Text>
          {playbook?.wardOpportunity != null && (
            <ProgressBar value={playbook.wardOpportunity} label={`Opportunity Score: ${playbook.wardOpportunity}/100`} color={COLORS.accent} />
          )}
        </Card>

        <PDFFooter councilName={councilName} classification="STRATEGIST BRIEFING" />
      </Page>
    </Document>
  )
}
