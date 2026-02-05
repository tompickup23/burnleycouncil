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
      return (
        <div className="error-boundary">
          <AlertTriangle size={48} className="error-icon" />
          <h2>Something went wrong</h2>
          <p className="error-message">
            {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
          </p>
          <button
            className="error-retry-btn"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
