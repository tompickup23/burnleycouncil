import { useState, useEffect, useCallback } from 'react'
import { MapPin, User, Mail, Phone, Search, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useData } from '../hooks/useData'
import { useCouncilConfig } from '../context/CouncilConfig'
import { LoadingState } from '../components/ui'
import './MyArea.css'

function MyArea() {
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const { data, loading, error } = useData([
    '/data/wards.json',
    '/data/councillors.json',
  ])
  const [wards, councillors] = data || [{}, []]
  const [selectedWard, setSelectedWard] = useState(null)
  const [postcode, setPostcode] = useState('')
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  const [postcodeError, setPostcodeError] = useState(null)
  const [postcodeResult, setPostcodeResult] = useState(null)

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
        setTimeout(() => {
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
                      <h3>{councillor.name}</h3>
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

            return (
              <div
                key={ward.name}
                className={`ward-card ${selectedWard === ward.name ? 'selected' : ''}`}
                onClick={() => setSelectedWard(ward.name)}
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
                  <div className="ward-councillor-names">
                    {wardCouncillors.map(c => (
                      <span key={c.id} className="councillor-name">{c.name}</span>
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
