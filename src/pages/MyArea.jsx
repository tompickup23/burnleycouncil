import { useState, useEffect, useCallback, useRef } from 'react'
import { MapPin, User, Mail, Phone, Search, Loader2, AlertCircle, CheckCircle2, BarChart3, Building, FileText, Home } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import CouncillorLink from '../components/CouncillorLink'
import IntegrityBadge from '../components/IntegrityBadge'
import { slugify } from '../utils/format'
import './MyArea.css'

// Pure helper — no component deps, safe at module scope
const getDeprivationColor = (level) => {
  switch (level) {
    case 'Very High': return '#ff453a'
    case 'High': return '#ff6b35'
    case 'Medium-High': return '#ff9f0a'
    case 'Medium': return '#ffd60a'
    case 'Low': return '#30d158'
    case 'Very Low': return '#66d4cf'
    default: return '#86868b'
  }
}

function MyArea() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data, loading, error } = useData([
    '/data/wards.json',
    '/data/councillors.json',
    '/data/integrity.json',
  ])
  const [wards, councillors, integrityData] = data || [{}, [], null]
  // Deprivation is optional — LCC and other county councils don't have it
  const { data: deprivationRaw } = useData('/data/deprivation.json')
  const deprivation = deprivationRaw?.wards || {}
  // Property assets data (optional — only LCC has this currently)
  const { data: propertyRaw } = useData('/data/property_assets.json')
  const propertyAssets = propertyRaw?.assets || []
  // Planning data (optional — councils with planning ETL data)
  const { data: planningRaw } = useData('/data/planning.json')
  const planningData = planningRaw || null
  // HMO data (optional — councils with hmo ETL data)
  const { data: hmoRaw } = useData('/data/hmo.json')
  const hmoData = hmoRaw || null
  const [selectedWard, setSelectedWard] = useState(null)
  const [postcode, setPostcode] = useState('')
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const [postcodeError, setPostcodeError] = useState(null)
  const [postcodeResult, setPostcodeResult] = useState(null)
  const scrollTimerRef = useRef(null)

  // Cleanup scroll timer on unmount
  useEffect(() => {
    return () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current) }
  }, [])

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
      setPostcodeResult({ ward: admin_ward, district: admin_district, postcode: json.result.postcode })

      // Check if postcode is in this council area
      if (admin_district && admin_district.toLowerCase() !== councilName.toLowerCase()) {
        setPostcodeError(`That postcode is in ${admin_district}, not ${councilName}. Try a local postcode.`)
        return
      }

      // Try to match to ward data
      const wardMatch = Object.values(wards).find(w =>
        w.name.toLowerCase() === admin_ward?.toLowerCase()
      )

      if (wardMatch) {
        setSelectedWard(wardMatch.name)
        // Scroll to ward details
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
        scrollTimerRef.current = setTimeout(() => {
          document.querySelector('.ward-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      } else {
        // Ward exists but not in our dataset — still show the info
        setPostcodeResult(prev => ({ ...prev, noData: true }))
      }
    } catch {
      setPostcodeError('Unable to look up postcode. Please try again.')
    } finally {
      setPostcodeLoading(false)
    }
  }, [wards, councilName])

  const handlePostcodeSubmit = (e) => {
    e.preventDefault()
    lookupPostcode(postcode)
  }

  useEffect(() => {
    document.title = `My Area | ${councilName} Council Transparency`
    return () => { document.title = `${councilName} Council Transparency` }
  }, [councilName])

  if (loading) {
    return <LoadingState message="Loading ward data..." />
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Unable to load data</h2>
        <p>Please try refreshing the page.</p>
      </div>
    )
  }

  const wardList = Object.values(wards).sort((a, b) => a.name.localeCompare(b.name))

  const getDeprivationForWard = (wardName) => {
    if (!wardName || !deprivation) return null
    // Try exact match first, then case-insensitive
    return deprivation[wardName] || Object.entries(deprivation).find(
      ([k]) => k.toLowerCase() === wardName.toLowerCase()
    )?.[1] || null
  }

  const getWardCouncillors = (wardName) => {
    return councillors.filter(c => c.ward === wardName)
  }

  return (
    <div className="myarea-page animate-fade-in">
      <header className="page-header">
        <h1>My Area</h1>
        <p className="subtitle">
          Find your ward and councillors in {councilName}. Enter your postcode or select a ward below.
        </p>
      </header>

      {/* Postcode Lookup */}
      <section className="postcode-lookup">
        <form onSubmit={handlePostcodeSubmit} className="postcode-form" aria-label="Postcode lookup">
          <label htmlFor="postcode-input">Find your ward by postcode</label>
          <div className="postcode-input-row">
            <div className="postcode-input-wrapper">
              <Search size={18} className="postcode-search-icon" />
              <input
                id="postcode-input"
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
                aria-label="Enter your postcode"
              />
            </div>
            <button
              type="submit"
              className="postcode-btn"
              disabled={postcodeLoading || !postcode.trim()}
            >
              {postcodeLoading ? <Loader2 size={18} className="spin" /> : 'Look up'}
            </button>
          </div>
        </form>

        {postcodeError && (
          <div className="postcode-message error">
            <AlertCircle size={16} />
            <span>{postcodeError}</span>
          </div>
        )}

        {postcodeResult && !postcodeError && (
          <div className={`postcode-message ${postcodeResult.noData ? 'info' : 'success'}`}>
            {postcodeResult.noData ? (
              <>
                <AlertCircle size={16} />
                <span>Your ward is <strong>{postcodeResult.ward}</strong> in {postcodeResult.district}, but we don't have detailed councillor data for it yet.</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span><strong>{postcodeResult.postcode}</strong> is in <strong>{postcodeResult.ward}</strong> ward</span>
              </>
            )}
          </div>
        )}
      </section>

      {/* Ward Selector (dropdown) */}
      <section className="ward-selector">
        <label htmlFor="ward-select">Or select your ward:</label>
        <select
          id="ward-select"
          value={selectedWard || ''}
          onChange={(e) => setSelectedWard(e.target.value || null)}
        >
          <option value="">Choose a ward...</option>
          {wardList.map(ward => (
            <option key={ward.name} value={ward.name}>{ward.name}</option>
          ))}
        </select>
      </section>

      {/* Selected Ward Details */}
      {selectedWard && (
        <section className="ward-details animate-fade-in">
          <div className="ward-header">
            <MapPin size={24} className="ward-icon" />
            <div>
              <h2>{selectedWard}</h2>
              <p className="text-secondary">Your local councillors</p>
            </div>
          </div>

          {(() => {
            const depData = getDeprivationForWard(selectedWard)
            if (!depData) return null
            const color = getDeprivationColor(depData.deprivation_level)
            return (
              <div className="deprivation-panel">
                <h3><BarChart3 size={16} /> Deprivation Index</h3>
                <div className="deprivation-stats">
                  <div className="dep-stat">
                    <span className="dep-badge" style={{ background: color + '20', color, borderColor: color }}>
                      {depData.deprivation_level}
                    </span>
                    <span className="dep-label">Deprivation Level</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{depData.avg_imd_score}</span>
                    <span className="dep-label">IMD Score</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{depData.avg_imd_decile}</span>
                    <span className="dep-label">Decile (1=most deprived)</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{depData.national_percentile ? `${depData.national_percentile}%` : '—'}</span>
                    <span className="dep-label">National Percentile</span>
                  </div>
                </div>
                <p className="dep-note">
                  Based on the English Indices of Deprivation 2019 (MHCLG). A score above 30 indicates significant deprivation.
                  Averaged across {depData.lsoa_count} small areas (LSOAs) in this ward.
                </p>
              </div>
            )
          })()}

          {/* Property assets in this ward */}
          {(() => {
            const wardPropertyAssets = propertyAssets.filter(a =>
              a.ced === selectedWard || a.ward === selectedWard
            )
            if (wardPropertyAssets.length === 0) return null
            const totalSpend = wardPropertyAssets.reduce((s, a) => s + (a.linked_spend || 0), 0)
            const disposalCount = wardPropertyAssets.filter(a => a.disposal?.category === 'A' || a.disposal?.category === 'B').length
            const categories = {}
            wardPropertyAssets.forEach(a => { categories[a.category || 'other'] = (categories[a.category || 'other'] || 0) + 1 })
            return (
              <div className="deprivation-panel" style={{ marginTop: '1rem' }}>
                <h3><Building size={16} /> LCC Property Assets</h3>
                <div className="deprivation-stats">
                  <div className="dep-stat">
                    <span className="dep-value">{wardPropertyAssets.length}</span>
                    <span className="dep-label">Assets in Area</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{totalSpend > 0 ? `£${Math.round(totalSpend / 1000)}k` : '—'}</span>
                    <span className="dep-label">Linked Spend</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{disposalCount}</span>
                    <span className="dep-label">Disposal Candidates</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{Object.keys(categories).length}</span>
                    <span className="dep-label">Categories</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', margin: '0.75rem 0' }}>
                  {Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                    <span key={cat} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                      {cat.replace(/_/g, ' ')} ({count})
                    </span>
                  ))}
                </div>
                <a href="/properties" style={{ color: 'var(--accent-primary, #12B6CF)', fontSize: '0.8rem' }}>
                  View all assets →
                </a>
              </div>
            )
          })()}

          {/* Planning activity in this ward */}
          {(() => {
            if (!planningData?.summary?.by_ward) return null
            const wardApps = planningData.summary.by_ward[selectedWard] || 0
            if (wardApps === 0) return null
            const totalApps = planningData.summary.total || 1
            const wardPct = Math.round((wardApps / totalApps) * 100)
            const approvalRate = planningData.summary.approval_rate
            const efficiency = planningData.efficiency
            // Get recent applications for this ward
            const wardRecent = (planningData.applications || [])
              .filter(a => a.ward === selectedWard)
              .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
              .slice(0, 5)
            return (
              <div className="deprivation-panel" style={{ marginTop: '1rem' }}>
                <h3><FileText size={16} /> Planning Activity</h3>
                <div className="deprivation-stats">
                  <div className="dep-stat">
                    <span className="dep-value">{wardApps.toLocaleString()}</span>
                    <span className="dep-label">Applications ({wardPct}% of total)</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{approvalRate != null ? `${Math.round(approvalRate * 100)}%` : '—'}</span>
                    <span className="dep-label">Council Approval Rate</span>
                  </div>
                  <div className="dep-stat">
                    <span className="dep-value">{planningData.summary.avg_decision_days || '—'}</span>
                    <span className="dep-label">Avg Days to Decision</span>
                  </div>
                  {efficiency?.cost_per_application > 0 && (
                    <div className="dep-stat">
                      <span className="dep-value">£{efficiency.cost_per_application.toLocaleString()}</span>
                      <span className="dep-label">Cost per App ({efficiency.budget_year})</span>
                    </div>
                  )}
                </div>
                {wardRecent.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Recent applications:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {wardRecent.map((app, i) => (
                        <div key={app.uid || i} style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', padding: '0.35rem 0.5rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.description || app.address}</span>
                          <span style={{ flexShrink: 0, color: app.state?.includes('Approved') || app.state?.includes('Granted') ? '#30d158' : app.state?.includes('Refused') || app.state?.includes('Rejected') ? '#ff453a' : 'var(--text-secondary)', fontSize: '0.65rem' }}>
                            {app.state || 'Pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="dep-note">
                  Source: PlanIt planning portal. {planningData.meta?.years_back || 3}-year history.
                </p>
              </div>
            )
          })()}

          {/* HMO data for this ward */}
          {(() => {
            if (!hmoData?.summary?.by_ward) return null
            const wardHmo = hmoData.summary.by_ward[selectedWard]
            if (!wardHmo || wardHmo.total === 0) return null
            return (
              <div className="deprivation-panel" style={{ marginTop: '1rem' }}>
                <h3><Home size={16} /> Houses in Multiple Occupation</h3>
                <div className="deprivation-stats">
                  {wardHmo.licensed_hmos > 0 && (
                    <div className="dep-stat">
                      <span className="dep-value">{wardHmo.licensed_hmos}</span>
                      <span className="dep-label">Licensed HMOs</span>
                    </div>
                  )}
                  {wardHmo.planning_applications > 0 && (
                    <div className="dep-stat">
                      <span className="dep-value">{wardHmo.planning_applications}</span>
                      <span className="dep-label">HMO Planning Apps</span>
                    </div>
                  )}
                  {wardHmo.density_per_1000 > 0 && (
                    <div className="dep-stat">
                      <span className="dep-value" style={{ color: wardHmo.density_per_1000 > 5 ? '#ff453a' : wardHmo.density_per_1000 > 2 ? '#ff9500' : '#30d158' }}>
                        {wardHmo.density_per_1000}
                      </span>
                      <span className="dep-label">HMOs per 1,000 pop</span>
                    </div>
                  )}
                  {wardHmo.population > 0 && (
                    <div className="dep-stat">
                      <span className="dep-value">{wardHmo.population.toLocaleString()}</span>
                      <span className="dep-label">Ward Population</span>
                    </div>
                  )}
                </div>
                <p className="dep-note">
                  Source: {hmoData.meta?.register_name || 'Council HMO register'}.
                  {hmoData.meta?.coverage === 'planning_only' ? ' Planning applications only — register data via FOI.' : ''}
                  {hmoData.summary?.total_bed_spaces > 0 ? ` ${hmoData.summary.total_bed_spaces.toLocaleString()} bed spaces across ${hmoData.summary.total_licensed} licensed HMOs district-wide.` : ''}
                </p>
              </div>
            )
          })()}

          <div className="ward-councillors">
            {getWardCouncillors(selectedWard).map(councillor => (
              <div key={councillor.id} className="councillor-detail-card">
                <div
                  className="party-bar"
                  style={{ background: councillor.party_color }}
                />
                <div className="councillor-content">
                  <div className="councillor-main">
                    <User size={40} className="councillor-avatar" />
                    <div>
                      <h3>
                        <CouncillorLink
                          name={councillor.name}
                          councillorId={councillor.id || slugify(councillor.name)}
                          integrityData={integrityData}
                        />
                      </h3>
                      <span
                        className="party-badge"
                        style={{
                          background: councillor.party_color + '25',
                          color: councillor.party_color
                        }}
                      >
                        {councillor.party}
                      </span>
                    </div>
                  </div>

                  {councillor.roles?.length > 0 && (
                    <div className="councillor-roles">
                      {councillor.roles.map((role, i) => (
                        <span key={i} className="role-badge">{role}</span>
                      ))}
                    </div>
                  )}

                  <div className="councillor-contact">
                    {councillor.email && (
                      <a href={`mailto:${councillor.email}`} className="contact-link">
                        <Mail size={16} />
                        <span>{councillor.email}</span>
                      </a>
                    )}
                    {councillor.phone && (
                      <a href={`tel:${councillor.phone}`} className="contact-link">
                        <Phone size={16} />
                        <span>{councillor.phone}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Wards Grid */}
      <section className="all-wards">
        <h2>All Wards</h2>
        <div className="wards-grid">
          {wardList.map(ward => {
            const wardCouncillors = getWardCouncillors(ward.name)
            const wardDep = getDeprivationForWard(ward.name)
            const wardPlanningApps = planningData?.summary?.by_ward?.[ward.name] || 0
            const wardHmoCount = hmoData?.summary?.by_ward?.[ward.name]?.total || 0

            return (
              <div
                key={ward.name}
                className={`ward-card ${selectedWard === ward.name ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={selectedWard === ward.name}
                onClick={() => setSelectedWard(ward.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWard(ward.name) } }}
              >
                <div
                  className="ward-party-indicator"
                  style={{ background: ward.color }}
                />
                <div className="ward-content">
                  <h3>{ward.name}</h3>
                  <p className="ward-parties text-secondary">
                    {ward.parties?.join(', ')}
                  </p>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {wardDep && (
                      <span
                        className="ward-dep-badge"
                        style={{
                          background: getDeprivationColor(wardDep.deprivation_level) + '20',
                          color: getDeprivationColor(wardDep.deprivation_level),
                          borderColor: getDeprivationColor(wardDep.deprivation_level),
                        }}
                      >
                        {wardDep.deprivation_level} deprivation
                      </span>
                    )}
                    {wardPlanningApps > 0 && (
                      <span
                        className="ward-dep-badge"
                        style={{
                          background: wardPlanningApps > 50 ? 'rgba(255,149,0,0.15)' : 'rgba(48,209,88,0.15)',
                          color: wardPlanningApps > 50 ? '#ff9500' : '#30d158',
                          borderColor: wardPlanningApps > 50 ? '#ff9500' : '#30d158',
                        }}
                      >
                        {wardPlanningApps} planning apps
                      </span>
                    )}
                    {wardHmoCount > 0 && (
                      <span
                        className="ward-dep-badge"
                        style={{
                          background: wardHmoCount > 20 ? 'rgba(255,69,58,0.15)' : wardHmoCount > 5 ? 'rgba(255,149,0,0.15)' : 'rgba(175,130,255,0.15)',
                          color: wardHmoCount > 20 ? '#ff453a' : wardHmoCount > 5 ? '#ff9500' : '#af82ff',
                          borderColor: wardHmoCount > 20 ? '#ff453a' : wardHmoCount > 5 ? '#ff9500' : '#af82ff',
                        }}
                      >
                        {wardHmoCount} HMOs
                      </span>
                    )}
                  </div>
                  <div className="ward-councillor-names">
                    {wardCouncillors.map(c => (
                      <span key={c.id} className="councillor-name">
                        <CouncillorLink name={c.name} councillorId={c.id || slugify(c.name)} compact />
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Official Council Link */}
      <section className="find-ward">
        <h2>More Information</h2>
        <div className="find-ward-card">
          <p>
            For full councillor details and meeting schedules, visit the official {councilName} Council website.
          </p>
          <a
            href={config.find_councillor_url || `${config.official_website || '#'}/council-democracy/councillors-mps/find-your-councillor/`}
            target="_blank"
            rel="noopener noreferrer"
            className="find-ward-link"
          >
            Find Your Councillor on {(config.official_website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} →
          </a>
        </div>
      </section>
    </div>
  )
}

export default MyArea
