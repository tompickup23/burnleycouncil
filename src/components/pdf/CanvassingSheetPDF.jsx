/**
 * CanvassingSheetPDF — 2-page per-ward canvassing sheet for door-knockers.
 *
 * Designed to be printed (A4) and carried on the doorstep.
 * Contains: quick ward stats, ward DNA strip, key issues, opening scripts,
 * objection handling, Q&A, quick facts, dos/don'ts, core messages, GOTV.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, SectionHeading,
  Card, StatCard, StatsRow, BulletList, TierBadge, Divider,
  KeyValue, partyColor, formatPct, formatNumber, formatCurrency,
} from './PDFComponents.jsx'
import { BURNLEY_WARD_INTEL } from '../../utils/strategyEngine.js'

// Ward-specific article-sourced intelligence
const WARD_ARTICLE_ISSUES = {
  'Hapton with Park': [
    'LCC Envirofuel gasification facility at Hapton Valley — processes ~89,400t/yr of East Lancashire waste. £60.3M contract (Dec 2025). Residents have raised environmental concerns.',
    'Reform secured competitive tender for Hapton facility — first open procurement in a generation. Previously waste went 25 miles to SUEZ Whinney Hill landfill.',
    'Reform position: waste processed locally in Burnley rather than trucked to Accrington. Residents can raise concerns directly with LCC instead of external contractor.',
  ],
  'Whittlefield with Ightenhill': [
    'Council tax value: Burnley share £344.58 (2025/26). Total Band D £2,455.83. Push value-for-money message.',
  ],
  'Daneshouse with Stoneyholme': [
    'Highest deprivation in Burnley (IMD 59.1). 10% unemployment. 39.4% private rented stock — HMO abuse area.',
    'Peter Gill won here twice for UKIP — Reform heritage vote exists.',
  ],
  'Trinity': [
    'Most deprived ward in Burnley (IMD 63.1). Estimated 248 HMOs (8.9% of ward stock). Article 4 Direction in force to control HMO growth.',
    'Jeff Sumner already holds 1 seat. Push for 2nd seat. Tom Commis UKIP heritage.',
  ],
  'Queensgate': [
    'Karen Ingham got 40% for UKIP in 2015. Estimated 115 HMOs (4.2% of ward). High deprivation area.',
  ],
  'Coalclough with Deerplay': [
    'Gordon Birtwistle (Lib Dem) has held this seat since 1983 — 43 years. Margins collapsed from 83% (2006) to 2.4% in 2019 (only 30 votes).',
    '"When did Birtwistle last knock on your door?" Frame as generational change. 43 years is too long.',
  ],
}

export function CanvassingSheetPDF({ wardName, playbook, dossier, councilName, electionDate, rawData }) {
  if (!playbook && !dossier) return null
  const intel = BURNLEY_WARD_INTEL[wardName] || {}
  const articleIssues = WARD_ARTICLE_ISSUES[wardName] || []
  const tier = playbook?.wardTier || intel.tier || dossier?.wardStrategy?.tier || 'unknown'
  const profile = dossier?.profile || {}
  const election = dossier?.election || {}
  const defender = election?.defender || {}

  // Extract rawData for ward DNA + quick facts
  const economyData = rawData?.economyData
  const hmoData = rawData?.hmoData
  const healthData = rawData?.healthData
  const dogeFindings = rawData?.dogeFindings
  const deprivationData = rawData?.deprivationData

  // Ward-level lookups
  const hmoWard = hmoData?.modelling?.hotspot_wards?.find(w => w.ward === wardName)
  const econWard = economyData?.claimant_count?.ward_latest
    ? Object.values(economyData.claimant_count.ward_latest).find(w => w?.name === wardName || w?.ward === wardName)
    : null
  const depWard = deprivationData?.wards?.[wardName]
  const defenderIntegrity = dossier?.councillors?.[0]?.integrity
  const prediction = election?.prediction || {}

  // Constituency Reform GE2024 %
  const ge2024Reform = dossier?.constituency?.ge2024?.results?.find(r => /reform/i.test(r?.party))
  const fiscalCtx = dossier?.fiscalContext || {}
  const councilPerf = dossier?.councilPerformance || {}

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CANVASSING SHEET — DO NOT DISTRIBUTE PUBLICLY" />
        <PDFHeader
          title={`${wardName}`}
          subtitle={`Canvassing Sheet — ${councilName || 'Burnley'} ${electionDate || '7 May 2026'}`}
          classification="CANVASSER"
        />

        {/* Quick Stats — 6 cards */}
        <StatsRow>
          <StatCard
            value={tier?.replace(/_/g, ' ').toUpperCase()}
            label="Priority"
            color={COLORS[tier] || COLORS.textMuted}
          />
          <StatCard
            value={defender?.name || '—'}
            label="Defending"
            detail={defender?.party}
            color={partyColor(defender?.party)}
          />
          <StatCard
            value={prediction?.winProbability != null ? `${Math.round(prediction.winProbability * 100)}%` : '—'}
            label="Win Probability"
            color={prediction?.winProbability > 0.6 ? COLORS.success : prediction?.winProbability > 0.3 ? COLORS.warning : COLORS.danger}
          />
          <StatCard
            value={prediction?.swingRequired != null ? formatPct(prediction.swingRequired) : '—'}
            label="Swing Required"
            color={COLORS.warning}
          />
          <StatCard
            value={profile?.population?.toLocaleString() || '—'}
            label="Electorate"
          />
          <StatCard
            value={formatPct(profile?.turnout, 0) || '—'}
            label="Last Turnout"
          />
        </StatsRow>

        {/* Ward DNA Strip */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[
              { label: 'IMD Decile', value: profile?.deprivation?.decile || depWard?.decile || '—', color: (profile?.deprivation?.decile || 99) <= 2 ? COLORS.danger : COLORS.textPrimary },
              { label: 'White British', value: profile?.whiteBritishPct != null ? `${Math.round(profile.whiteBritishPct)}%` : '—' },
              { label: 'Over 65', value: profile?.over65Pct != null ? `${Math.round(profile.over65Pct)}%` : '—' },
              { label: 'Claimant %', value: econWard?.rate != null ? formatPct(econWard.rate) : intel.claimants_pct ? formatPct(intel.claimants_pct) : '—', color: (econWard?.rate || intel.claimants_pct || 0) > 5 ? COLORS.danger : COLORS.textPrimary },
              { label: 'HMOs', value: hmoWard ? formatNumber(hmoWard.estimated_hmos) : '0', color: hmoWard?.risk_level === 'high' ? COLORS.danger : COLORS.textPrimary },
              { label: 'Integrity', value: defenderIntegrity?.score != null ? `${defenderIntegrity.score}/100` : '—', color: defenderIntegrity?.riskLevel === 'high' ? COLORS.danger : COLORS.textPrimary },
            ].map((item, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontFamily: FONT.bold, color: item.color || COLORS.textPrimary }}>{item.value}</Text>
                <Text style={{ fontSize: 5.5, color: COLORS.textMuted, marginTop: 1 }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Key Issues — What people will ask about */}
        <SectionHeading title="Key Issues for This Ward" />
        <Card accent>
          <BulletList
            items={[
              ...(playbook?.localIssues || intel.local_issues || []),
              ...articleIssues,
            ]}
            color={COLORS.warning}
          />
        </Card>

        {/* Opening Line */}
        <SectionHeading title="Opening Line" />
        {playbook?.openingLines?.slice(0, 2).map((line, i) => (
          <Card key={i}>
            <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 3 }}>
              {line.scenario}
            </Text>
            <Text style={{ fontSize: FONT.body, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
              "{line.script}"
            </Text>
            {line.note && (
              <Text style={{ fontSize: FONT.micro, color: COLORS.accent, marginTop: 3 }}>
                TIP: {line.note}
              </Text>
            )}
          </Card>
        ))}

        {/* Top Q&A — Issue Responses */}
        <SectionHeading title="If They Ask About..." />
        {(playbook?.issueResponses || []).slice(0, 4).map((ir, i) => (
          <View key={i} style={{ marginBottom: SPACE.sm }} wrap={false}>
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.warning, marginBottom: 2 }}>
              Q: {ir.issue}
            </Text>
            <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, lineHeight: 1.4, paddingLeft: SPACE.sm }}>
              {ir.response}
            </Text>
            {ir.wardEvidence?.length > 0 && (
              <View style={{ paddingLeft: SPACE.sm, marginTop: 2 }}>
                {ir.wardEvidence.map((ev, j) => (
                  <Text key={j} style={{ fontSize: FONT.micro, color: COLORS.accent }}>→ {ev}</Text>
                ))}
              </View>
            )}
          </View>
        ))}

        <PDFFooter councilName={councilName} classification="CANVASSING SHEET" />
      </Page>

      {/* Page 2: Objections, Quick Facts, Closing, Do's/Don'ts */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="CANVASSING SHEET — DO NOT DISTRIBUTE PUBLICLY" />
        <PDFHeader title={wardName} subtitle="Canvassing Sheet — Page 2" classification="CANVASSER" />

        {/* Objection Handling */}
        <SectionHeading title="Objection Handling" />
        {(playbook?.objectionHandling || []).slice(0, 5).map((obj, i) => (
          <View key={i} style={{ marginBottom: SPACE.sm }} wrap={false}>
            <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.danger }}>
              {obj.objection}
            </Text>
            <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, lineHeight: 1.4, paddingLeft: SPACE.sm, marginTop: 2 }}>
              {obj.response}
            </Text>
            <Text style={{ fontSize: FONT.micro, color: COLORS.textMuted, paddingLeft: SPACE.sm, marginTop: 1 }}>
              {obj.tone}
            </Text>
          </View>
        ))}

        {/* Quick Facts for Doorstep */}
        <SectionHeading title="Quick Facts for Doorstep" />
        <Card accent>
          <View style={styles.row}>
            <View style={styles.col2}>
              <KeyValue label="Council Tax Band D" value={councilPerf?.councilTaxBandD ? `£${councilPerf.councilTaxBandD.toFixed(2)}` : '—'} />
              <KeyValue label="Reserves Rating" value={fiscalCtx?.reserves_rating || '—'} color={fiscalCtx?.overall_health === 'critical' ? COLORS.danger : COLORS.textPrimary} />
              <KeyValue label="Council Health" value={fiscalCtx?.overall_health?.toUpperCase() || '—'} />
              <KeyValue label="Fraud Triangle" value={councilPerf?.fraudTriangleScore ? `${councilPerf.fraudTriangleScore.toFixed(0)}/100` : '—'} color={councilPerf?.fraudTriangleScore > 60 ? COLORS.danger : COLORS.textPrimary} />
            </View>
            <View style={styles.col2}>
              <KeyValue label="GE2024 Reform %" value={ge2024Reform?.pct != null ? formatPct(ge2024Reform.pct) : '—'} color={COLORS.accent} />
              <KeyValue label="Collection Rate" value={councilPerf?.collectionRate?.latest ? formatPct(councilPerf.collectionRate.latest) : '—'} />
              {economyData?.earnings?.median_weekly_pay && (
                <KeyValue label="Median Weekly Pay" value={`£${economyData.earnings.median_weekly_pay}`} />
              )}
              {healthData?.indicators?.life_expectancy_male && (
                <KeyValue label="Life Exp (M/F)" value={`${healthData.indicators.life_expectancy_male?.toFixed(1)}/${healthData.indicators.life_expectancy_female?.toFixed(1)}`} />
              )}
            </View>
          </View>
        </Card>

        {/* Closing */}
        <SectionHeading title="Closing the Conversation" />
        {(playbook?.closingTechniques || []).slice(0, 3).map((ct, i) => (
          <Card key={i}>
            <Text style={{ fontSize: FONT.tiny, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 2 }}>
              {ct.scenario}
            </Text>
            <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.4 }}>
              "{ct.script}"
            </Text>
          </Card>
        ))}

        {/* Do's and Don'ts */}
        <View style={styles.row}>
          <View style={styles.col2}>
            <Text style={{ ...styles.sectionSubtitle, color: COLORS.success }}>DO</Text>
            <BulletList items={playbook?.doorstepDos || ['Listen first', 'Smile', 'Leave leaflet', 'Note their concerns']} color={COLORS.success} />
          </View>
          <View style={styles.col2}>
            <Text style={{ ...styles.sectionSubtitle, color: COLORS.danger }}>DO NOT</Text>
            <BulletList items={playbook?.doorstepDonts || ['Argue', 'Promise specifics', 'Criticise voters', 'Stay too long']} color={COLORS.danger} />
          </View>
        </View>

        {/* Messaging Pillars */}
        {playbook?.messagingPillars?.length > 0 && (
          <>
            <SectionHeading title="Core Messages" />
            {playbook.messagingPillars.slice(0, 4).map((mp, i) => (
              <View key={i} style={{ marginBottom: SPACE.xs }}>
                <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.accent }}>
                  {typeof mp === 'object' ? mp.pillar || mp.title : mp}
                </Text>
                {typeof mp === 'object' && mp.detail && (
                  <Text style={{ fontSize: FONT.small, color: COLORS.textSecondary, paddingLeft: SPACE.sm }}>
                    {mp.detail}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* GOTV */}
        {playbook?.gotv && (
          <>
            <Divider />
            <Text style={{ ...styles.subsectionTitle, color: COLORS.success }}>GOTV — Election Day</Text>
            <BulletList items={
              typeof playbook.gotv === 'string' ? [playbook.gotv] :
              Array.isArray(playbook.gotv) ? playbook.gotv :
              playbook.gotv?.strategy ? [playbook.gotv.strategy] : ['Standard GOTV approach']
            } color={COLORS.success} />
          </>
        )}

        <PDFFooter councilName={councilName} classification="CANVASSING SHEET" />
      </Page>
    </Document>
  )
}

/**
 * Generate all-wards canvassing pack — one canvassing sheet per ward.
 */
export function AllWardsCanvassingPDF({ wards, councilName, electionDate }) {
  return (
    <Document>
      {wards.map(({ wardName, playbook, dossier }) => {
        const intel = BURNLEY_WARD_INTEL[wardName] || {}
        const articleIssues = WARD_ARTICLE_ISSUES[wardName] || []
        const tier = playbook?.wardTier || intel.tier || 'unknown'
        const profile = dossier?.profile || {}
        const election = dossier?.election || {}
        const defender = election?.defender || {}

        return (
          <Page key={wardName} size="A4" style={styles.page}>
            <ConfidentialBanner text="CANVASSING PACK — DO NOT DISTRIBUTE PUBLICLY" />
            <PDFHeader
              title={wardName}
              subtitle={`${tier?.replace(/_/g, ' ').toUpperCase()} — ${defender?.party || 'Unknown'} defending`}
              classification="CANVASSER"
            />

            <StatsRow>
              <StatCard value={tier?.replace(/_/g, ' ').toUpperCase()} label="Priority" color={COLORS[tier] || COLORS.textMuted} />
              <StatCard value={defender?.name?.split(' ').slice(-1)[0] || '—'} label="Defender" color={partyColor(defender?.party)} />
              <StatCard value={formatPct(profile?.turnout, 0) || '—'} label="Turnout" />
              <StatCard value={intel.opportunity?.toString() || '—'} label="Opportunity" />
            </StatsRow>

            {/* Key Issues */}
            <Text style={styles.sectionSubtitle}>Key Issues</Text>
            <Card accent>
              <BulletList items={[...(playbook?.localIssues || intel.local_issues || []), ...articleIssues].slice(0, 8)} color={COLORS.warning} />
            </Card>

            {/* Best Opening */}
            {playbook?.openingLines?.[0] && (
              <>
                <Text style={styles.sectionSubtitle}>Opening Line</Text>
                <Text style={{ fontSize: FONT.small, color: COLORS.textPrimary, fontStyle: 'italic', lineHeight: 1.5 }}>
                  "{playbook.openingLines[0].script}"
                </Text>
              </>
            )}

            {/* Top 3 Objections */}
            <Text style={{ ...styles.sectionSubtitle, marginTop: SPACE.md }}>Top Objections</Text>
            {(playbook?.objectionHandling || []).slice(0, 3).map((obj, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: FONT.tiny, fontFamily: FONT.bold, color: COLORS.danger }}>{obj.objection}</Text>
                <Text style={{ fontSize: FONT.tiny, color: COLORS.textPrimary, lineHeight: 1.3, paddingLeft: SPACE.xs }}>{obj.response}</Text>
              </View>
            ))}

            {/* Core Message */}
            {intel.messaging && (
              <>
                <Divider />
                <Text style={{ fontSize: FONT.small, fontFamily: FONT.bold, color: COLORS.accent }}>{intel.messaging}</Text>
              </>
            )}

            <PDFFooter councilName={councilName} classification="CANVASSING PACK" />
          </Page>
        )
      })}
    </Document>
  )
}
