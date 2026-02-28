import { NavLink, useLocation } from 'react-router-dom'
import { Home, Newspaper, PoundSterling, PieChart, Users, MapPin, Menu, X, Info, FileQuestion, Calendar, BadgePoundSterling, GitCompareArrows, Building, Shield, FileText, Megaphone, Globe, Landmark, Fingerprint, Calculator, Vote, LayoutGrid, Settings, LogOut, Crosshair, ChevronDown, Search } from 'lucide-react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth as useAuthHook } from '../context/AuthContext'
import { preloadData, useData } from '../hooks/useData'
import GlobalSearch from './GlobalSearch'
import DataFreshnessStamp from './DataFreshnessStamp'
import './Layout.css'

// Nav items grouped into labelled collapsible sections
const navSections = [
  {
    items: [
      { path: '/', icon: Home, label: 'Home' },
    ],
  },
  {
    title: 'Transparency',
    collapsible: true,
    items: [
      { path: '/spending', icon: PoundSterling, label: 'Spending', requires: 'spending' },
      { path: '/budgets', icon: PieChart, label: 'Budgets', requires: ['budgets', 'budget_trends'] },
      { path: '/doge', icon: Shield, label: 'DOGE', requires: 'doge_investigation' },
      { path: '/suppliers', icon: Building, label: 'Suppliers', requires: ['supplier_profiles', 'supplier_index'] },
      { path: '/procurement', icon: FileText, label: 'Contracts', requires: 'procurement' },
      { path: '/foi', icon: FileQuestion, label: 'FOI', requires: 'foi' },
    ],
  },
  {
    title: 'People',
    collapsible: true,
    items: [
      { path: '/politics', icon: Users, label: 'Councillors', requires: 'politics' },
      { path: '/integrity', icon: Fingerprint, label: 'Integrity', requires: 'integrity' },
      { path: '/pay', icon: BadgePoundSterling, label: 'Executive Pay', requires: 'pay_comparison' },
      { path: '/constituencies', icon: Landmark, label: 'MPs', requires: 'constituencies' },
    ],
  },
  {
    title: 'Democracy',
    collapsible: true,
    items: [
      { path: '/elections', icon: Vote, label: 'Elections', requires: 'elections' },
      { path: '/meetings', icon: Calendar, label: 'Meetings', requires: 'meetings' },
      { path: '/news', icon: Newspaper, label: 'News', requires: 'news' },
    ],
  },
  {
    title: 'Area',
    collapsible: true,
    items: [
      { path: '/my-area', icon: MapPin, label: 'My Area', requires: 'my_area' },
      { path: '/demographics', icon: Globe, label: 'Demographics', requires: 'demographics' },
      { path: '/compare', icon: GitCompareArrows, label: 'Cross-Council' },
    ],
  },
  {
    title: 'Analysis',
    collapsible: true,
    items: [
      { path: '/lgr', icon: Landmark, label: 'LGR Tracker', requires: 'lgr_tracker' },
      { path: '/lgr-calculator', icon: Calculator, label: 'LGR Cost', requires: 'lgr_tracker' },
      { path: '/press', icon: Megaphone, label: 'Press' },
      { path: '/about', icon: Info, label: 'About' },
    ],
  },
]

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({})
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const officialUrl = config.official_website || '#'
  const officialDomain = officialUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const dataSources = config.data_sources || {}

  // Auth context — returns null when no AuthProvider (dev mode)
  const authCtx = useAuthHook()

  // Load data for GlobalSearch
  const { data: searchData } = useData(['/data/councillors.json', '/data/config.json', '/data/property_assets.json'])
  const [councillorsForSearch, configForSearch, propertyAssetsForSearch] = searchData || [[], null, null]
  const propertiesForSearch = propertyAssetsForSearch?.assets || []

  // Keyboard shortcut: Cmd+K / Ctrl+K for GlobalSearch
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggleSection = useCallback((title) => {
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }))
  }, [])

  // Preload data for likely next routes based on current page
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname
    if (path === '/') {
      preloadData(['/data/spending.json', '/data/doge_findings.json'])
    } else if (path === '/spending') {
      preloadData(['/data/supplier_profiles.json', '/data/taxonomy.json'])
    }
  }, [location.pathname])

  // Filter nav sections based on data_sources flags AND user permissions
  const visibleSections = useMemo(() => {
    return navSections
      .map(section => ({
        ...section,
        items: section.items.filter(item => {
          if (!item.requires) return true
          const keys = Array.isArray(item.requires) ? item.requires : [item.requires]
          return keys.some(key => dataSources[key])
        }),
      }))
      .filter(section => section.items.length > 0)
  }, [dataSources])

  return (
    <div className="layout noise-overlay">
      {/* Skip to main content — accessibility */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Mobile header */}
      <header className="mobile-header" role="banner">
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1 className="mobile-title">{councilName} Council</h1>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-header">
          <h1 className="site-title">{councilName}</h1>
          <span className="site-subtitle">Council Transparency</span>
        </div>

        <nav className="sidebar-nav" aria-label="Site navigation">
          {/* Search trigger */}
          <div className="nav-section">
            <button
              className="nav-item nav-search-trigger"
              onClick={() => setSearchOpen(true)}
              style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
            >
              <Search size={20} />
              <span>Search</span>
              <kbd className="nav-shortcut">⌘K</kbd>
            </button>
          </div>

          {/* Hub link — back to all councils directory */}
          <div className="nav-section">
            <a
              href={import.meta.env.BASE_URL?.replace(/\/lancashire\/[^/]+\/$/, '/') || '/'}
              className="nav-item nav-hub-link"
              onClick={() => setSidebarOpen(false)}
            >
              <LayoutGrid size={20} />
              <span>All Councils</span>
            </a>
            <div className="nav-divider" />
          </div>
          {visibleSections.map((section, si) => (
            <div key={si} className="nav-section">
              {si > 0 && !section.title && <div className="nav-divider" />}
              {section.title && (
                <>
                  <div className="nav-divider" />
                  <button
                    className="nav-section-title"
                    onClick={() => section.collapsible && toggleSection(section.title)}
                    style={{
                      background: 'none', border: 'none', width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 16px 2px', cursor: section.collapsible ? 'pointer' : 'default',
                      color: 'var(--text-secondary, #94a3b8)', fontSize: '0.6rem',
                      fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}
                  >
                    {section.title}
                    {section.collapsible && (
                      <ChevronDown
                        size={12}
                        style={{
                          transform: collapsedSections[section.title] ? 'rotate(-90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    )}
                  </button>
                </>
              )}
              {!collapsedSections[section.title] && section.items.map(({ path, icon: Icon, label }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}

          {/* Strategy link — visible to strategist and admin roles, requires elections data */}
          {authCtx?.isStrategist && dataSources.elections && (
            <div className="nav-section">
              <div className="nav-divider" />
              <NavLink
                to="/strategy"
                className={({ isActive }) => `nav-item nav-strategy-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Crosshair size={20} />
                <span>Strategy</span>
              </NavLink>
            </div>
          )}

          {/* Intelligence link — visible to strategist and admin roles, requires intelligence data */}
          {authCtx?.isStrategist && dataSources.intelligence && (
            <div className="nav-section">
              <NavLink
                to="/intelligence"
                className={({ isActive }) => `nav-item nav-intelligence-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Shield size={20} />
                <span>Intelligence</span>
              </NavLink>
            </div>
          )}

          {/* Property Estate — strategist-only, requires property_assets data */}
          {authCtx?.isStrategist && dataSources.property_assets && (
            <div className="nav-section">
              <NavLink
                to="/properties"
                className={({ isActive }) => `nav-item nav-property-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Building size={20} />
                <span>Property Estate</span>
              </NavLink>
            </div>
          )}

          {/* Admin link — only visible to admins in Firebase mode */}
          {authCtx?.isAdmin && (
            <div className="nav-section">
              <div className="nav-divider" />
              <NavLink
                to="/admin"
                className={({ isActive }) => `nav-item nav-admin-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Settings size={20} />
                <span>Admin</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          {/* User info + sign out in Firebase mode */}
          {authCtx?.user && (
            <div className="sidebar-user">
              <span className="sidebar-user-name">
                {authCtx.permissions?.display_name || authCtx.user.email}
              </span>
              <button className="sidebar-signout" onClick={authCtx.signOut} title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          )}

          <div className="disclaimer-badge">
            <span className="disclaimer-icon">⚠️</span>
            <span className="disclaimer-text">NOT an official council website</span>
          </div>
          <p className="footer-text">
            Independent public scrutiny tool
          </p>
          <p className="footer-link">
            <a href={officialUrl} target="_blank" rel="noopener noreferrer">
              Official Council → {officialDomain}
            </a>
          </p>
          <p className="footer-imprint">
            Published by {config.publisher || 'AI DOGE'}
          </p>
          <DataFreshnessStamp lastUpdated={configForSearch?.last_updated || config.last_updated} />
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
          role="button"
          tabIndex={-1}
        />
      )}

      {/* GlobalSearch modal */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        councillors={Array.isArray(councillorsForSearch) ? councillorsForSearch : councillorsForSearch?.councillors || []}
        properties={propertiesForSearch}
      />

      {/* Main content */}
      <main id="main-content" className="main-content" role="main">
        {children}
      </main>
    </div>
  )
}

export default Layout
