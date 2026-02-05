import './PageHeader.css'

function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div className="header-content">
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  )
}

export default PageHeader
