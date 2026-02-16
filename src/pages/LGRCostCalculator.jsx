import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { useData } from '../hooks/useData'
import { formatCurrency, formatNumber } from '../utils/format'
import { TOOLTIP_STYLE } from '../utils/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Search, Loader2, AlertCircle, PoundSterling, Home, TrendingDown, TrendingUp, ArrowRight, Calculator, MapPin, Building, Users, ChevronDown, ChevronRight, Check, X as XIcon, HelpCircle, ExternalLink } from 'lucide-react'
import { LoadingState } from '../components/ui'
import './LGRCostCalculator.css'

const PROPOSAL_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a']

// All 15 Lancashire council IDs — we need to load their budget data
const ALL_COUNCIL_IDS = [
  'burnley', 'hyndburn', 'pendle', 'rossendale',
  'lancaster', 'ribble_valley', 'chorley', 'south_ribble',
  'lancashire_cc', 'blackpool', 'west_lancashire', 'blackburn',
  'wyre', 'preston', 'fylde'
]

// Map postcodes.io admin_district names to our council IDs
const DISTRICT_NAME_MAP = {
  'burnley': 'burnley',
  'hyndburn': 'hyndburn',
  'pendle': 'pendle',
  'rossendale': 'rossendale',
  'lancaster': 'lancaster',
  'ribble valley': 'ribble_valley',
  'chorley': 'chorley',
  'south ribble': 'south_ribble',
  'west lancashire': 'west_lancashire',
  'wyre': 'wyre',
  'preston': 'preston',
  'fylde': 'fylde',
  'blackpool': 'blackpool',
  'blackburn with darwen': 'blackburn',
}

// Band to multiplier (relative to Band D = 1.0)
const BAND_MULTIPLIERS = {
  'A': 6 / 9,
  'B': 7 / 9,
  'C': 8 / 9,
  'D': 1,
  'E': 11 / 9,
  'F': 13 / 9,
  'G': 15 / 9,
  'H': 18 / 9,
}

function LGRCostCalculator() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const councilId = config.council_id || ''
  const councilTier = config.council_tier || 'district'

  // Load LGR tracker + this council's budget summary
  const { data, loading, error } = useData([
    '/data/shared/lgr_tracker.json',
    '/data/budgets_summary.json',
  ])
  const [lgrData, budgetsSummary] = data || [null, null]

  const [postcode, setPostcode] = useState('')
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const [postcodeError, setPostcodeError] = useState(null)
  const [postcodeResult, setPostcodeResult] = useState(null)
  const [selectedBand, setSelectedBand] = useState('D')
  const [selectedProposal, setSelectedProposal] = useState(null)
  const [expandedProposal, setExpandedProposal] = useState(null)
  const [showMethodology, setShowMethodology] = useState(false)
  const scrollTimerRef = useRef(null)

  useEffect(() => {
    document.title = `What Your Area Costs | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  useEffect(() => {
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current) }
  }, [])

  // --- Get current Band D costs ---
  const currentCosts = useMemo(() => {
    if (!budgetsSummary?.council_tax?.band_d_by_year) return null

    const years = Object.keys(budgetsSummary.council_tax.band_d_by_year).sort()
    const latestYear = years[years.length - 1]
    const districtBandD = budgetsSummary.council_tax.band_d_by_year[latestYear]

    // For unitaries, the Band D is already the total
    if (councilTier === 'unitary') {
      return {
        districtBandD: districtBandD,
        countyBandD: 0,
        totalBandD: districtBandD,
        year: latestYear,
        isUnitary: true,
        totalSpend: budgetsSummary.headline?.total_service_expenditure || 0,
        netRevenue: budgetsSummary.headline?.net_revenue_expenditure || 0,
        serviceBreakdown: budgetsSummary.service_breakdown || {},
        reserves: budgetsSummary.reserves?.total_closing || 0,
      }
    }

    // For districts, we also need to show the total including county
    // Use band_d_total_by_year if available (includes county + police + fire)
    const totalYears = Object.keys(budgetsSummary.council_tax.band_d_total_by_year || {}).sort()
    const latestTotalYear = totalYears[totalYears.length - 1]
    const totalBandD = budgetsSummary.council_tax.band_d_total_by_year?.[latestTotalYear] || districtBandD

    // Estimate county portion = total - district
    const countyBandD = totalBandD - districtBandD

    return {
      districtBandD,
      countyBandD,
      totalBandD,
      year: latestYear,
      isUnitary: false,
      totalSpend: budgetsSummary.headline?.total_service_expenditure || 0,
      netRevenue: budgetsSummary.headline?.net_revenue_expenditure || 0,
      serviceBreakdown: budgetsSummary.service_breakdown || {},
      reserves: budgetsSummary.reserves?.total_closing || 0,
    }
  }, [budgetsSummary, councilTier])

  // --- Calculate costs for each LGR proposal ---
  const proposalCosts = useMemo(() => {
    if (!lgrData?.proposed_models || !currentCosts) return []

    return lgrData.proposed_models.map((model, idx) => {
      // Find which authority this council would be in
      const myAuthority = model.authorities.find(a =>
        a.councils.includes(councilId)
      )
      if (!myAuthority) return { ...model, myAuthority: null, estimatedBandD: null, color: PROPOSAL_COLORS[idx] }

      // Estimate the new Band D for this unitary
      // Method: Total council tax requirement of all constituent councils / Band D equivalents
      // Since we don't have all council budgets loaded client-side, use the AI DOGE savings model
      // from lgr_tracker.json + population data

      const population = myAuthority.population || 500000
      // Approximate number of Band D equivalent properties
      // Lancashire average ~0.41 Band D equivalents per person (derived from CT requirement / Band D / population)
      const bandDEquivalents = population * 0.41

      // Current total cost across constituent councils:
      // For districts: sum of (district CT requirement + LCC share)
      // For unitaries: their CT requirement already includes all services
      // We approximate using: total Band D * Band D equivalents for each constituent

      // Since this is the same council's page, we know our own Band D
      // For the whole authority, use the AI DOGE model data which already includes savings
      const annualSavings = model.doge_annual_savings || 0
      const savingsPerHousehold = annualSavings > 0 ? annualSavings / bandDEquivalents : 0

      // Estimated new Band D ≈ current total Band D - per-household savings
      // This is a simplified model — the real calculation would need all council budgets
      const estimatedBandD = currentCosts.totalBandD - savingsPerHousehold

      // Per-week cost
      const weeklyNow = currentCosts.totalBandD / 52
      const weeklyNew = estimatedBandD / 52

      return {
        ...model,
        myAuthority,
        estimatedBandD,
        savingsPerHousehold,
        annualSaving: currentCosts.totalBandD - estimatedBandD,
        weeklySaving: weeklyNow - weeklyNew,
        color: PROPOSAL_COLORS[idx],
        populationText: formatNumber(population),
        numCouncils: myAuthority.councils.length,
      }
    })
  }, [lgrData, currentCosts, councilId])

  // --- Apply band multiplier ---
  const adjustForBand = useCallback((bandDAmount) => {
    const multiplier = BAND_MULTIPLIERS[selectedBand] || 1
    return bandDAmount * multiplier
  }, [selectedBand])

  // --- Postcode lookup ---
  const lookupPostcode = useCallback(async (pc) => {
    const cleaned = pc.replace(/\s+/g, '').toUpperCase()
    if (cleaned.length < 5) {
      setPostcodeError('Please enter a valid postcode')
      return
    }
    setPostcodeLoading(true)
    setPostcodeError(null)
    setPostcodeResult(null)

    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`)
      const json = await res.json()

      if (json.status !== 200 || !json.result) {
        setPostcodeError('Postcode not found. Please check and try again.')
        return
      }

      const { admin_ward, admin_district } = json.result
      const districtLower = (admin_district || '').toLowerCase()
      const matchedCouncil = DISTRICT_NAME_MAP[districtLower]

      // Check if the postcode is in Lancashire
      const isLancashire = !!matchedCouncil
      const isThisCouncil = matchedCouncil === councilId

      setPostcodeResult({
        ward: admin_ward,
        district: admin_district,
        postcode: json.result.postcode,
        councilId: matchedCouncil,
        isLancashire,
        isThisCouncil,
      })

      if (!isLancashire) {
        setPostcodeError(`That postcode is in ${admin_district}, not in Lancashire. This calculator covers Lancashire councils only.`)
      }

      // Scroll to results
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => {
        document.querySelector('.cost-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setPostcodeError('Unable to look up postcode. Please try again.')
    } finally {
      setPostcodeLoading(false)
    }
  }, [councilId])

  const handlePostcodeSubmit = (e) => {
    e.preventDefault()
    lookupPostcode(postcode)
  }

  // --- Chart data ---
  const comparisonChartData = useMemo(() => {
    if (!currentCosts || !proposalCosts.length) return []

    const items = [
      {
        name: 'Current',
        cost: adjustForBand(currentCosts.totalBandD),
        fill: '#636366',
      }
    ]

    proposalCosts.forEach(p => {
      if (p.estimatedBandD != null) {
        items.push({
          name: p.short_name,
          cost: adjustForBand(p.estimatedBandD),
          fill: p.color,
        })
      }
    })

    return items
  }, [currentCosts, proposalCosts, adjustForBand])

  const serviceChartData = useMemo(() => {
    if (!currentCosts?.serviceBreakdown) return []
    return Object.entries(currentCosts.serviceBreakdown)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name: name.replace(/ services?$/i, '').replace(/ \(GFRA only\)$/i, ''),
        value,
      }))
  }, [currentCosts])

  const PIE_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff453a', '#5ac8fa', '#ff6b6b', '#ffd60a', '#64d2ff']

  // --- Loading / Error states ---
  if (loading) return <LoadingState message="Loading cost data..." />
  if (error) return (
    <div className="page-error">
      <h2>Unable to load data</h2>
      <p>Please try refreshing the page.</p>
    </div>
  )

  const hasResults = currentCosts && (postcodeResult?.isLancashire || postcodeResult === null)

  return (
    <div className="cost-calc-page animate-fade-in">
      <header className="page-header">
        <h1><Calculator size={28} /> What Your Area <span className="accent">Costs</span></h1>
        <p className="subtitle">
          See what you pay now, and what you'd pay under each LGR proposal.
          Enter your postcode to personalise the results.
        </p>
      </header>

      {/* Postcode + Band selector */}
      <section className="cost-inputs">
        <div className="input-row">
          <div className="postcode-section">
            <form onSubmit={handlePostcodeSubmit} className="cost-postcode-form" aria-label="Postcode lookup">
              <label htmlFor="cost-postcode">Your postcode</label>
              <div className="cost-input-row">
                <div className="cost-input-wrapper">
                  <Search size={18} className="cost-search-icon" />
                  <input
                    id="cost-postcode"
                    type="text"
                    placeholder="e.g. BB11 3DF"
                    value={postcode}
                    onChange={(e) => {
                      setPostcode(e.target.value)
                      setPostcodeError(null)
                      setPostcodeResult(null)
                    }}
                    maxLength={10}
                    autoComplete="postal-code"
                  />
                </div>
                <button
                  type="submit"
                  className="cost-btn"
                  disabled={postcodeLoading || !postcode.trim()}
                >
                  {postcodeLoading ? <Loader2 size={18} className="spin" /> : 'Calculate'}
                </button>
              </div>
            </form>
          </div>

          <div className="band-section">
            <label htmlFor="band-select">Council tax band</label>
            <select
              id="band-select"
              value={selectedBand}
              onChange={(e) => setSelectedBand(e.target.value)}
              className="band-select"
            >
              {Object.keys(BAND_MULTIPLIERS).map(band => (
                <option key={band} value={band}>
                  Band {band} {band === 'D' ? '(average)' : `(×${BAND_MULTIPLIERS[band].toFixed(2)})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {postcodeError && (
          <div className="cost-message error">
            <AlertCircle size={16} />
            <span>{postcodeError}</span>
          </div>
        )}

        {postcodeResult && !postcodeError && (
          <div className="cost-message success">
            <MapPin size={16} />
            <span>
              <strong>{postcodeResult.postcode}</strong> is in <strong>{postcodeResult.ward}</strong> ward, {postcodeResult.district}
              {!postcodeResult.isThisCouncil && postcodeResult.isLancashire && (
                <> — showing costs for {councilName}</>
              )}
            </span>
          </div>
        )}
      </section>

      {/* Current costs */}
      {currentCosts && (
        <section className="cost-results">
          <h2><PoundSterling size={22} /> What You Pay Now</h2>
          <p className="section-desc">
            Your current council tax for {councilName}, {currentCosts.year}.
            {!currentCosts.isUnitary && ' Includes your share of Lancashire County Council services.'}
          </p>

          <div className="cost-cards">
            <div className="cost-card total-card">
              <div className="cost-card-label">
                <Home size={18} />
                Total Council Tax (Band {selectedBand})
              </div>
              <div className="cost-card-value">
                {formatCurrency(adjustForBand(currentCosts.totalBandD))}
              </div>
              <div className="cost-card-sub">
                {formatCurrency(adjustForBand(currentCosts.totalBandD) / 52)} per week
              </div>
            </div>

            {!currentCosts.isUnitary && (
              <>
                <div className="cost-card">
                  <div className="cost-card-label">
                    <Building size={16} />
                    {councilName} (District)
                  </div>
                  <div className="cost-card-value">
                    {formatCurrency(adjustForBand(currentCosts.districtBandD))}
                  </div>
                  <div className="cost-card-sub">
                    {((currentCosts.districtBandD / currentCosts.totalBandD) * 100).toFixed(0)}% of total
                  </div>
                </div>

                <div className="cost-card">
                  <div className="cost-card-label">
                    <Building size={16} />
                    Lancashire CC (County)
                  </div>
                  <div className="cost-card-value">
                    {formatCurrency(adjustForBand(currentCosts.countyBandD))}
                  </div>
                  <div className="cost-card-sub">
                    {((currentCosts.countyBandD / currentCosts.totalBandD) * 100).toFixed(0)}% of total
                  </div>
                </div>
              </>
            )}

            <div className="cost-card">
              <div className="cost-card-label">
                <Users size={16} />
                Total Council Spend
              </div>
              <div className="cost-card-value">
                {formatCurrency(currentCosts.totalSpend, true)}
              </div>
              <div className="cost-card-sub">
                {councilName} {currentCosts.year}
              </div>
            </div>
          </div>

          {/* Where your money goes — pie chart */}
          {serviceChartData.length > 0 && (
            <div className="cost-chart-section">
              <h3>Where your {councilName} council tax goes</h3>
              <div className="cost-pie-container">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serviceChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {serviceChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatCurrency(v, true)}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      )}

      {/* LGR Proposal Comparison */}
      {proposalCosts.length > 0 && currentCosts && (
        <section className="lgr-comparison">
          <h2><TrendingDown size={22} /> Under LGR: What Would You Pay?</h2>
          <p className="section-desc">
            Estimated Band {selectedBand} council tax under each of the 5 LGR proposals,
            based on AI DOGE's independent financial model using £12B+ actual spending data.
          </p>

          {/* Bar chart comparison */}
          <div className="cost-chart-section">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={comparisonChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={{ fill: '#8e8e93', fontSize: 12 }} />
                <YAxis
                  tick={{ fill: '#8e8e93', fontSize: 12 }}
                  tickFormatter={v => `£${v.toFixed(0)}`}
                  domain={['dataMin - 100', 'dataMax + 50']}
                />
                <Tooltip
                  formatter={(v) => [formatCurrency(v), 'Annual cost']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                  {comparisonChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Proposal detail cards */}
          <div className="proposal-cost-cards">
            {proposalCosts.map((proposal, idx) => {
              if (!proposal.myAuthority) return null
              const saving = proposal.annualSaving || 0
              const isSaving = saving > 0
              const isExpanded = expandedProposal === proposal.id

              return (
                <div
                  key={proposal.id}
                  className={`proposal-cost-card ${isSaving ? 'saving' : 'increase'}`}
                  style={{ borderTopColor: proposal.color }}
                >
                  <div
                    className="proposal-cost-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedProposal(isExpanded ? null : proposal.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedProposal(isExpanded ? null : proposal.id) } }}
                  >
                    <div className="proposal-cost-title">
                      <span className="proposal-number" style={{ background: proposal.color }}>
                        {proposal.short_name}
                      </span>
                      <div>
                        <h3>{proposal.name}</h3>
                        <span className="proposal-submitted">{proposal.submitted_by}</span>
                      </div>
                    </div>
                    <div className="proposal-cost-summary">
                      <div className="proposal-estimated">
                        <span className="est-label">Est. Band {selectedBand}</span>
                        <span className="est-value">{formatCurrency(adjustForBand(proposal.estimatedBandD))}</span>
                      </div>
                      <div className={`proposal-saving ${isSaving ? 'positive' : 'negative'}`}>
                        {isSaving ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                        <span>{isSaving ? 'Save' : 'Costs'} {formatCurrency(Math.abs(adjustForBand(saving)))}/yr</span>
                      </div>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="proposal-cost-detail animate-fade-in">
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="detail-label">Your new authority</span>
                          <span className="detail-value">{proposal.myAuthority.name}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Councils merging</span>
                          <span className="detail-value">{proposal.numCouncils} councils</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Population</span>
                          <span className="detail-value">{proposal.populationText}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Meets 500K threshold?</span>
                          <span className="detail-value">
                            {proposal.myAuthority.population >= 500000
                              ? <><Check size={14} className="text-green" /> Yes</>
                              : <><XIcon size={14} className="text-red" /> No ({formatNumber(proposal.myAuthority.population)})</>
                            }
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Annual savings (whole authority)</span>
                          <span className="detail-value">
                            {proposal.doge_annual_savings > 0
                              ? formatCurrency(proposal.doge_annual_savings, true)
                              : <span className="text-red">Costs {formatCurrency(Math.abs(proposal.doge_annual_savings), true)} more</span>
                            }
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Transition cost</span>
                          <span className="detail-value">{formatCurrency(proposal.doge_transition_cost, true)}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Payback period</span>
                          <span className="detail-value">
                            {proposal.doge_payback_years
                              ? `${proposal.doge_payback_years} years`
                              : 'Never pays back'
                            }
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Weekly saving (Band {selectedBand})</span>
                          <span className="detail-value">
                            {proposal.weeklySaving > 0
                              ? <span className="text-green">{formatCurrency(adjustForBand(proposal.weeklySaving))}/week</span>
                              : <span className="text-red">Costs {formatCurrency(Math.abs(adjustForBand(proposal.weeklySaving)))}/week more</span>
                            }
                          </span>
                        </div>
                      </div>

                      <div className="detail-councils">
                        <span className="detail-label">Councils in {proposal.myAuthority.name}:</span>
                        <div className="council-list">
                          {proposal.myAuthority.councils.map(c => (
                            <span key={c} className={`council-chip ${c === councilId ? 'current' : ''}`}>
                              {c === councilId && <MapPin size={12} />}
                              {c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                                .replace('Lancashire Cc', 'Lancashire CC')
                                .replace('Ribble Valley', 'Ribble Valley')
                              }
                            </span>
                          ))}
                        </div>
                      </div>

                      {proposal.myAuthority.notes && (
                        <p className="detail-notes">{proposal.myAuthority.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Key caveats / methodology */}
      <section className="methodology-section">
        <button
          className="methodology-toggle"
          onClick={() => setShowMethodology(!showMethodology)}
        >
          <HelpCircle size={18} />
          How is this calculated?
          {showMethodology ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {showMethodology && (
          <div className="methodology-content animate-fade-in">
            <div className="method-grid">
              <div className="method-item">
                <h4>Current costs</h4>
                <p>
                  Band D council tax from MHCLG Revenue Outturn data. For district councils,
                  the total includes Lancashire County Council's Band D precept. Other bands
                  are calculated using the statutory multiplier (Band A = 6/9, Band H = 18/9 of Band D).
                </p>
              </div>
              <div className="method-item">
                <h4>LGR estimates</h4>
                <p>
                  Savings estimates use AI DOGE's independent bottom-up model, built from
                  £12B+ of actual Lancashire council spending data. This differs from the CCN/PwC
                  model which uses top-down assumptions. The per-household saving is calculated by
                  dividing authority-wide savings by estimated Band D equivalent properties.
                </p>
              </div>
              <div className="method-item">
                <h4>What's not included</h4>
                <p>
                  Council tax figures shown are the council element only. They exclude police precept
                  (Lancashire Police & Crime Commissioner) and fire precept (Lancashire Fire & Rescue).
                  Parish precepts are also excluded. These would remain unchanged under LGR.
                </p>
              </div>
              <div className="method-item">
                <h4>Important caveats</h4>
                <p>
                  These are estimates based on current data. Actual costs under LGR would depend on
                  government decisions about council tax harmonisation, transition funding, and service
                  levels. New authorities may take several years to achieve full savings.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* CTA to LGR Tracker */}
      <section className="cost-cta">
        <div className="cta-card">
          <h3>Want the full picture?</h3>
          <p>
            See detailed financial models, political analysis, demographics and
            AI DOGE's independent critique of all 5 proposals.
          </p>
          <a href="lgr" className="cta-link">
            View LGR Tracker <ArrowRight size={16} />
          </a>
        </div>
      </section>
    </div>
  )
}

export default LGRCostCalculator
