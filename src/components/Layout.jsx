import { NavLink, useLocation } from 'react-router-dom'
import { Home, Newspaper, PoundSterling, PieChart, Users, MapPin, Menu, X, Info, FileQuestion, Calendar, BadgePoundSterling, GitCompareArrows, Building, Shield, FileText, Megaphone, Globe, Landmark, Fingerprint, Calculator, Vote, LayoutGrid, Settings, LogOut } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useCouncilConfig } from '../context/CouncilConfig'
import { isFirebaseEnabled } from '../firebase'
import { useAuth as useAuthHook } from '../context/AuthContext'
import { preloadData } from '../hooks/useData'
import './Layout.css'

// Nav items grouped into sections with optional data_sources key for conditional display
const navSections = [
  {
    items: [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/doge', icon: Shield, label: 'DOGE', requires: 'doge_investigation' },
      { path: '/news', icon: Newspaper, label: 'News', requires: 'news' },
    ],
  },
  {
    items: [
      { path: '/spending', icon: PoundSterling, label: 'Spending', requires: 'spending' },
      { path: '/budgets', icon: PieChart, label: 'Budgets', requires: ['budgets', 'budget_trends'] },
      { path: '/procurement', icon: FileText, label: 'Contracts', requires: 'procurement' },
      { path: '/suppliers', icon: Building, label: 'Suppliers', requires: ['supplier_profiles', 'supplier_index'] },
      { path: '/pay', icon: BadgePoundSterling, label: 'Executive Pay', requires: 'pay_comparison' },
    ],
  },
  {
    items: [
      { path: '/politics', icon: Users, label: 'Politics', requires: 'politics' },
      { path: '/integrity', icon: Fingerprint, label: 'Integrity', requires: 'integrity' },
      { path: '/my-area', icon: MapPin, label: 'My Area', requires: 'my_area' },
      { path: '/demographics', icon: Globe, label: 'Demographics', requires: 'demographics' },
      { path: '/lgr', icon: Landmark, label: 'LGR Tracker', requires: 'lgr_tracker' },
      { path: '/elections', icon: Vote, label: 'Elections', requires: 'elections' },
      { path: '/constituencies', icon: Landmark, label: 'MPs', requires: 'constituencies' },
      { path: '/lgr-calculator', icon: Calculator, label: 'LGR Cost', requires: 'lgr_tracker' },
      { path: '/meetings', icon: Calendar, label: 'Meetings', requires: 'meetings' },
    ],
  },
  {
    items: [
      { path: '/compare', icon: GitCompareArrows, label: 'Compare' },
      { path: '/foi', icon: FileQuestion, label: 'FOI', requires: 'foi' },
      { path: '/press', icon: Megaphone, label: 'Press' },
      { path: '/about', icon: Info, label: 'About' },
    ],
  },
]

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const config = useCouncilConfig()
  const councilName = config.council_name || 'Council'
  const officialUrl = config.official_website || '#'
  const officialDomain = officialUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const dataSources = config.data_sources || {}

  // Auth context — returns null when no AuthProvider (dev mode)
  const authCtx = useAuthHook()

  // Preload data for likely next routes based on current page
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname
    if (path === '/') {
      // From Home, users most often visit Spending or DOGE
      preloadData(['/data/spending.json', '/data/doge_findings.json'])
    } else if (path === '/spending') {
      // From Spending, users often check suppliers or budgets
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
          // requires can be a string or array — show if ANY flag is truthy
          const keys = Array.isArray(item.requires) ? item.requires : [item.requires]
          return keys.some(key => dataSources[key])
        }),
      }))
      .filter(section => section.items.length > 0)
  }, [dataSources])

  return (
    <div className="layout">
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
              {si > 0 && <div className="nav-divider" />}
              {section.items.map(({ path, icon: Icon, label }) => (
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

      {/* Main content */}
      <main id="main-content" className="main-content" role="main">
        {children}
      </main>
    </div>
  )
}

export default Layout
