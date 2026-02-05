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

export { LoadingState, LoadingSkeleton }
export default LoadingState
