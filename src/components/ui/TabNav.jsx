import './TabNav.css'

function TabNav({ tabs, activeTab, onChange }) {
  return (
    <nav className="tab-nav" role="tablist">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeTab === id}
          aria-controls={`tabpanel-${id}`}
          className={`tab-btn ${activeTab === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={18} />}
          {label}
        </button>
      ))}
    </nav>
  )
}

function TabPanel({ id, activeTab, children }) {
  if (activeTab !== id) return null
  return (
    <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`} className="tab-content">
      {children}
    </div>
  )
}

export { TabNav, TabPanel }
export default TabNav
