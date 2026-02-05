import { useState, useEffect } from 'react'
import { MapPin, User, Mail, Phone } from 'lucide-react'
import { useData } from '../hooks/useData'
import { LoadingState } from '../components/ui'
import './MyArea.css'

function MyArea() {
  const { data, loading } = useData([
    '/data/wards.json',
    '/data/councillors.json',
  ])
  const [wards, councillors] = data || [{}, []]
  const [selectedWard, setSelectedWard] = useState(null)

  useEffect(() => {
    document.title = 'My Area | Burnley Council Transparency'
    return () => { document.title = 'Burnley Council Transparency' }
  }, [])

  if (loading) {
    return <LoadingState message="Loading ward data..." />
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
          Find your ward and councillors in Burnley. Each ward has 3 councillors.
        </p>
      </header>

      {/* Ward Selector */}
      <section className="ward-selector">
        <label htmlFor="ward-select">Select your ward:</label>
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

      {/* Find Your Ward */}
      <section className="find-ward">
        <h2>Not sure which ward you're in?</h2>
        <div className="find-ward-card">
          <p>
            You can find your ward by entering your postcode on the official Burnley Council website.
          </p>
          <a
            href="https://burnley.gov.uk/council-democracy/councillors-mps/find-your-councillor/"
            target="_blank"
            rel="noopener noreferrer"
            className="find-ward-link"
          >
            Find Your Councillor on burnley.gov.uk →
          </a>
        </div>
      </section>
    </div>
  )
}

export default MyArea
