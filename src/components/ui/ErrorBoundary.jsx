import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import './ErrorBoundary.css'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Auto-reload on chunk load failures (caused by deployment cache invalidation)
      // Must be in render(), not componentDidCatch(), because React calls render first
      const msg = this.state.error?.message || ''
      const isChunkError =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Loading chunk') ||
        msg.includes('Loading CSS chunk')

      if (isChunkError && !sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1')
        window.location.reload()
        return null
      }

      // Clear the reload guard so future chunk errors can also auto-reload
      sessionStorage.removeItem('chunk_reload')

      return (
        <div className="error-boundary">
          <AlertTriangle size={48} className="error-icon" />
          <h2>Something went wrong</h2>
          <p className="error-message">
            {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
          </p>
          <div className="error-actions">
            <button
              className="error-retry-btn"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
            <button
              className="error-retry-btn error-reload-btn"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
