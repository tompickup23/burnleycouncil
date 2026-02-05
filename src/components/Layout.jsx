import { NavLink } from 'react-router-dom'
import { Home, Newspaper, PoundSterling, PieChart, Users, MapPin, Menu, X, Info, FileQuestion, Calendar } from 'lucide-react'
import { useState } from 'react'
import './Layout.css'

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/news', icon: Newspaper, label: 'News' },
  { path: '/spending', icon: PoundSterling, label: 'Spending' },
  { path: '/budgets', icon: PieChart, label: 'Budgets' },
  { path: '/politics', icon: Users, label: 'Politics' },
  { path: '/my-area', icon: MapPin, label: 'My Area' },
  { path: '/meetings', icon: Calendar, label: 'Meetings' },
  { path: '/foi', icon: FileQuestion, label: 'FOI' },
  { path: '/about', icon: Info, label: 'About' },
]

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="layout">
      {/* Mobile header */}
      <header className="mobile-header">
        <button
          className="menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1 className="mobile-title">Burnley Council</h1>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="site-title">Burnley</h1>
          <span className="site-subtitle">Council Transparency</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ path, icon: Icon, label }) => (
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
        </nav>

        <div className="sidebar-footer">
          <div className="disclaimer-badge">
            <span className="disclaimer-icon">⚠️</span>
            <span className="disclaimer-text">NOT an official council website</span>
          </div>
          <p className="footer-text">
            Independent public scrutiny tool
          </p>
          <p className="footer-link">
            <a href="https://burnley.gov.uk" target="_blank" rel="noopener noreferrer">
              Official Council → burnley.gov.uk
            </a>
          </p>
          <p className="footer-imprint">
            Published by Tom Pickup
          </p>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}

export default Layout
