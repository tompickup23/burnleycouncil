import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// Suppress console.error during expected error tests
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
})

afterEach(() => {
  console.error = originalConsoleError
})

function ThrowingChild({ shouldThrow = true }) {
  if (shouldThrow) throw new Error('Test error message')
  return <div>Child content</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('renders fallback message for errors without message', () => {
    function ThrowNull() {
      throw null
    }
    render(
      <ErrorBoundary>
        <ThrowNull />
      </ErrorBoundary>
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('An unexpected error occurred while loading this page.')).toBeInTheDocument()
  })

  it('shows a try again button', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('resets error state when try again is clicked', () => {
    let shouldThrow = true
    function ConditionalThrow() {
      if (shouldThrow) throw new Error('Boom')
      return <div>Recovered content</div>
    }

    render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Fix the child before clicking retry
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })

  it('calls console.error on catch', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(console.error).toHaveBeenCalled()
  })

  it('shows reload button alongside try again', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
  })

  it('attempts reload on dynamic import failure', () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    sessionStorage.removeItem('chunk_reload')

    function ThrowChunkError() {
      throw new Error('Failed to fetch dynamically imported module: /assets/AdminPanel-abc123.js')
    }

    render(
      <ErrorBoundary>
        <ThrowChunkError />
      </ErrorBoundary>
    )

    // Should have attempted a reload (may be called multiple times due to React re-renders in jsdom)
    expect(reloadMock).toHaveBeenCalled()
    sessionStorage.removeItem('chunk_reload')
  })

  it('shows error UI for non-chunk errors without reloading', () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    sessionStorage.removeItem('chunk_reload')

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    )

    // Non-chunk errors should NOT trigger auto-reload
    expect(reloadMock).not.toHaveBeenCalled()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
