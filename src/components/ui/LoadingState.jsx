import './LoadingState.css'

function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <span className="loading-message">{message}</span>
    </div>
  )
}

function LoadingSkeleton({ lines = 3 }) {
  return (
    <div className="loading-skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            width: i === lines - 1 ? '60%' : '100%',
            height: '16px',
            marginBottom: '12px',
          }}
        />
      ))}
    </div>
  )
}

function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="skeleton-stat-row">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card skeleton-stat-card">
          <div className="skeleton skeleton-icon" />
          <div className="skeleton-stat-content">
            <div className="skeleton skeleton-value" />
            <div className="skeleton skeleton-label" />
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton({ height = 300 }) {
  return (
    <div className="chart-card">
      <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height, width: '100%', borderRadius: 'var(--radius-md)' }} />
    </div>
  )
}

export { LoadingState, LoadingSkeleton, StatCardSkeleton, ChartSkeleton }
export default LoadingState
