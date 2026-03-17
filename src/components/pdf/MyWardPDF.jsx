/**
 * MyWardPDF - Per-ward intelligence briefing for strategists and canvassers.
 *
 * Comprehensive ward-level data briefing designed for print (A4).
 * Combines: councillors, deprivation, demographics, housing, health, economy,
 * crime links, planning, HMO, property assets, integrity, and ward intelligence.
 *
 * Triggered from the My Ward page when a ward is selected.
 */
import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles, COLORS, FONT, SPACE } from './PDFDesignSystem.js'
import {
  PDFHeader, PDFFooter, ConfidentialBanner, SectionHeading,
  Card, StatCard, StatsRow, BulletList, Divider,
  KeyValue, partyColor, formatPct, formatNumber, formatCurrency,
} from './PDFComponents.jsx'

const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-GB') : 'N/A'
const pct = (n, d) => (d && typeof n === 'number' && d > 0) ? `${((n / d) * 100).toFixed(1)}%` : 'N/A'

export function MyWardPDF({ wardName, councillors, deprivation, demographics, housing, health, economy, hmo, planning, propertyAssets, integrity, demoFiscal, wardBriefingPoints, councilName }) {
  if (!wardName) return (
    <Document><Page size="A4" style={styles.page}><Text style={{ color: COLORS.textPrimary }}>No ward selected.</Text></Page></Document>
  )

  const dep = deprivation || {}
  const wardDemo = demographics || {}
  const wardHousing = housing || {}
  const wardHealth = health || {}
  const wardEconomy = economy || {}
  const wardHmo = hmo || {}
  const wardPlanning = planning || {}
  const wardProperties = propertyAssets || []
  const wardCouncillors = councillors || []
  const wardIntegrity = integrity || []
  const briefingPoints = wardBriefingPoints || []

  // Population
  const population = wardDemo?.population?.total

  // Deprivation
  const imdScore = dep?.avg_imd_score
  const imdDecile = dep?.avg_imd_decile
  const depLevel = dep?.deprivation_level
  const natPctile = dep?.national_percentile

  // Housing stats
  const tenure = wardHousing?.tenure || {}
  const totalHouseholds = tenure['Total: All households'] || Object.values(tenure).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) || 0
  const owned = tenure['Owned'] || 0
  const socialRented = tenure['Social rented'] || 0
  const privateRented = tenure['Private rented'] || 0
  const overcrowding = wardHousing?.overcrowding || {}
  const overcrowdedCount = (overcrowding['Occupancy rating of bedrooms: -1'] || 0) + (overcrowding['Occupancy rating of bedrooms: -2 or less'] || 0)
  const overcrowdedTotal = overcrowding['Total: All households'] || 1

  // Health stats
  const generalHealth = wardHealth?.general_health || {}
  const badHealth = (generalHealth['Bad health'] || 0) + (generalHealth['Very bad health'] || 0)
  const healthTotal = Object.values(generalHealth).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) || 1
  const disability = wardHealth?.disability || {}
  const disabledCount = (disability['Disabled under the Equality Act: Day-to-day activities limited a lot'] || 0) + (disability['Disabled under the Equality Act: Day-to-day activities limited a little'] || 0)
  const disabilityTotal = Object.values(disability).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) || 1

  // Economy
  const claimantRate = wardEconomy?.rate_pct
  const claimantCount = wardEconomy?.count

  // Top ethnicities
  const ethnicities = wardDemo?.ethnicity
    ? Object.entries(wardDemo.ethnicity)
        .filter(([k]) => !/total/i.test(k) && !k.includes(': '))
        .map(([k, v]) => ({ name: k.split(',')[0].trim(), value: typeof v === 'object' ? (v.count || 0) : v }))
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6)
    : []

  // Religion
  const religions = wardDemo?.religion
    ? Object.entries(wardDemo.religion)
        .filter(([k]) => !/total/i.test(k))
        .map(([k, v]) => ({ name: k, value: typeof v === 'object' ? (v.count || 0) : v }))
        .filter(e => e.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
    : []

  return (
    <Document>
      {/* PAGE 1: Ward Overview + Councillors */}
      <Page size="A4" style={styles.page}>
        <ConfidentialBanner text="WARD INTELLIGENCE BRIEFING - INTERNAL USE ONLY" />
        <PDFHeader title={`${wardName} Ward Briefing`} subtitle={`${councilName} | Generated ${new Date().toLocaleDateString('en-GB')}`} />

        {/* Quick Stats Row */}
        <StatsRow>
          <StatCard label="Population" value={population ? fmt(population) : 'N/A'} color={COLORS.accent} />
          <StatCard label="Deprivation" value={depLevel || 'N/A'} color={imdScore > 30 ? COLORS.danger : imdScore > 20 ? COLORS.warning : COLORS.success} />
          <StatCard label="IMD Score" value={imdScore != null ? String(imdScore) : 'N/A'} color={COLORS.textAccent} />
          <StatCard label="Claimant Rate" value={claimantRate != null ? `${claimantRate}%` : 'N/A'} color={claimantRate > 5 ? COLORS.danger : COLORS.success} />
        </StatsRow>

        {/* Councillors */}
        <SectionHeading title="Your Councillors" />
        {wardCouncillors.length > 0 ? wardCouncillors.map((c, i) => {
          const integrityRecord = wardIntegrity.find(ic => ic?.name === c.name)
          const flags = integrityRecord?.total_flags || integrityRecord?.flags || 0
          return (
            <Card key={i}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: FONT.md, fontWeight: 700, color: COLORS.textPrimary }}>{c.name}</Text>
                <Text style={{ fontSize: FONT.xs, fontWeight: 600, color: partyColor(c.party), backgroundColor: partyColor(c.party) + '20', padding: '2 8', borderRadius: 4 }}>
                  {c.party}
                </Text>
              </View>
              {c.roles?.length > 0 && (
                <Text style={{ fontSize: FONT.xs, color: COLORS.textSecondary, marginBottom: 2 }}>
                  Roles: {c.roles.join(', ')}
                </Text>
              )}
              {c.email && (
                <Text style={{ fontSize: FONT.xs, color: COLORS.textMuted }}>
                  {c.email}
                </Text>
              )}
              {flags > 0 && (
                <Text style={{ fontSize: FONT.xs, color: COLORS.warning, marginTop: 2 }}>
                  {flags} integrity flag{flags > 1 ? 's' : ''} - check dossier
                </Text>
              )}
            </Card>
          )
        }) : (
          <Text style={{ fontSize: FONT.sm, color: COLORS.textMuted }}>No councillor data available.</Text>
        )}

        {/* Deprivation Detail */}
        {imdScore != null && (
          <View>
            <SectionHeading title="Deprivation Index" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <KeyValue label="Level" value={depLevel || 'N/A'} />
                <KeyValue label="IMD Score" value={String(imdScore)} />
                <KeyValue label="Decile" value={imdDecile != null ? `${imdDecile} (1=most deprived)` : 'N/A'} />
                <KeyValue label="National %" value={natPctile != null ? `${natPctile}%` : 'N/A'} />
                {dep?.lsoa_count && <KeyValue label="LSOAs" value={String(dep.lsoa_count)} />}
              </View>
              {imdScore > 30 && (
                <Text style={{ fontSize: FONT.xs, color: COLORS.danger, marginTop: 6 }}>
                  Above national deprivation threshold (30). This ward faces significant socioeconomic pressures.
                </Text>
              )}
            </Card>
          </View>
        )}

        {/* Demographic Fiscal Pressure */}
        {demoFiscal?.fiscal_resilience_score != null && (
          <View>
            <SectionHeading title="Fiscal Pressure" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <KeyValue label="Council Fiscal Score" value={`${demoFiscal.fiscal_resilience_score}/100`} />
                <KeyValue label="Service Demand" value={`${demoFiscal.service_demand_pressure_score}/100`} />
              </View>
            </Card>
          </View>
        )}

        <PDFFooter page={1} total={2} />
      </Page>

      {/* PAGE 2: Housing, Health, Economy, Planning, HMO, Demographics */}
      <Page size="A4" style={styles.page}>
        <PDFHeader title={`${wardName} - Data Profile`} subtitle={councilName} />

        {/* Housing */}
        {totalHouseholds > 0 && (
          <View>
            <SectionHeading title="Housing" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <KeyValue label="Households" value={fmt(totalHouseholds)} />
                <KeyValue label="Owner-occupied" value={pct(owned, totalHouseholds)} />
                <KeyValue label="Social rented" value={pct(socialRented, totalHouseholds)} />
                <KeyValue label="Private rented" value={pct(privateRented, totalHouseholds)} />
                <KeyValue label="Overcrowded" value={overcrowdedCount > 0 ? pct(overcrowdedCount, overcrowdedTotal) : 'N/A'} />
              </View>
              {privateRented > 0 && (privateRented / totalHouseholds) > 0.25 && (
                <Text style={{ fontSize: FONT.xs, color: COLORS.warning, marginTop: 4 }}>
                  High private rented sector ({pct(privateRented, totalHouseholds)}) - potential HMO/landlord issues.
                </Text>
              )}
            </Card>
          </View>
        )}

        {/* HMO */}
        {wardHmo?.total > 0 && (
          <View>
            <SectionHeading title="HMOs (Houses in Multiple Occupation)" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {wardHmo.licensed_hmos > 0 && <KeyValue label="Licensed HMOs" value={String(wardHmo.licensed_hmos)} />}
                {wardHmo.planning_applications > 0 && <KeyValue label="HMO Planning Apps" value={String(wardHmo.planning_applications)} />}
                {wardHmo.density_per_1000 > 0 && <KeyValue label="Density" value={`${wardHmo.density_per_1000} per 1,000`} />}
                {wardHmo.population > 0 && <KeyValue label="Ward Pop" value={fmt(wardHmo.population)} />}
              </View>
              {wardHmo.density_per_1000 > 5 && (
                <Text style={{ fontSize: FONT.xs, color: COLORS.danger, marginTop: 4 }}>
                  HMO density well above average - raise with residents on the doorstep.
                </Text>
              )}
            </Card>
          </View>
        )}

        {/* Health */}
        {healthTotal > 1 && (
          <View>
            <SectionHeading title="Health" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <KeyValue label="Bad/Very Bad Health" value={badHealth > 0 ? pct(badHealth, healthTotal) : 'N/A'} />
                <KeyValue label="Disabled (EqAct)" value={disabledCount > 0 ? pct(disabledCount, disabilityTotal) : 'N/A'} />
              </View>
            </Card>
          </View>
        )}

        {/* Economy */}
        {(claimantRate != null || claimantCount != null) && (
          <View>
            <SectionHeading title="Economy" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {claimantRate != null && <KeyValue label="Claimant Rate" value={`${claimantRate}%`} />}
                {claimantCount != null && <KeyValue label="Claimant Count" value={fmt(claimantCount)} />}
              </View>
            </Card>
          </View>
        )}

        {/* Planning */}
        {wardPlanning?.total > 0 && (
          <View>
            <SectionHeading title="Planning Activity" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <KeyValue label="Applications" value={fmt(wardPlanning.total || wardPlanning)} />
              </View>
            </Card>
          </View>
        )}

        {/* Property Assets (LCC only) */}
        {wardProperties.length > 0 && (
          <View>
            <SectionHeading title="LCC Property Assets" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <KeyValue label="Assets" value={String(wardProperties.length)} />
                <KeyValue label="Linked Spend" value={wardProperties.reduce((s, a) => s + (a.linked_spend || 0), 0) > 0 ? formatCurrency(wardProperties.reduce((s, a) => s + (a.linked_spend || 0), 0)) : 'N/A'} />
                <KeyValue label="Disposal Candidates" value={String(wardProperties.filter(a => a.disposal?.category === 'A' || a.disposal?.category === 'B').length)} />
              </View>
            </Card>
          </View>
        )}

        {/* Demographics */}
        {ethnicities.length > 0 && (
          <View>
            <SectionHeading title="Demographics" />
            <Card>
              <Text style={{ fontSize: FONT.xs, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>Ethnic Composition</Text>
              {ethnicities.map((e, i) => {
                const totalEth = ethnicities.reduce((s, x) => s + x.value, 0) || 1
                return (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontSize: FONT.xs, color: COLORS.textPrimary }}>{e.name}</Text>
                    <Text style={{ fontSize: FONT.xs, color: COLORS.textSecondary }}>{fmt(e.value)} ({((e.value / totalEth) * 100).toFixed(1)}%)</Text>
                  </View>
                )
              })}
              {religions.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: FONT.xs, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 4 }}>Religion</Text>
                  {religions.map((r, i) => {
                    const totalRel = religions.reduce((s, x) => s + x.value, 0) || 1
                    return (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ fontSize: FONT.xs, color: COLORS.textPrimary }}>{r.name}</Text>
                        <Text style={{ fontSize: FONT.xs, color: COLORS.textSecondary }}>{fmt(r.value)} ({((r.value / totalRel) * 100).toFixed(1)}%)</Text>
                      </View>
                    )
                  })}
                </View>
              )}
            </Card>
          </View>
        )}

        {/* Ward Intelligence Briefing Points */}
        {briefingPoints.length > 0 && (
          <View>
            <SectionHeading title="Ward Intelligence" />
            <Card>
              <BulletList items={briefingPoints.map(pt => `[${pt.category}] ${pt.text}`)} />
            </Card>
          </View>
        )}

        <PDFFooter page={2} total={2} />
      </Page>
    </Document>
  )
}
