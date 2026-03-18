import '@testing-library/jest-dom'
import './setup-recharts.jsx'

// IntersectionObserver mock (used by useReveal, scroll-triggered reveals)
globalThis.IntersectionObserver = class {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
