/**
 * PasswordGate — dual-mode authentication gate.
 *
 * Production (VITE_FIREBASE_API_KEY set): Uses Firebase Auth via AuthGate
 * Development (no Firebase config): Uses simple password gate
 */
import { useState, useRef, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { isFirebaseEnabled } from '../firebase'
import './PasswordGate.css'

const GATE_PASSWORD = 'DOGEReform2026!'

function DogeEyeLogo({ size = 48 }) {
  return (
    <svg viewBox="0 0 120 80" width={size * 1.5} height={size} style={{ filter: 'drop-shadow(0 0 12px rgba(18,182,207,0.5))' }}>
      <path d="M60 10 C25 10, 2 40, 2 40 C2 40, 25 70, 60 70 C95 70, 118 40, 118 40 C118 40, 95 10, 60 10 Z" fill="none" stroke="#12B6CF" strokeWidth="2.5" />
      <circle cx="60" cy="40" r="16" fill="none" stroke="#12B6CF" strokeWidth="2" />
      <circle cx="60" cy="40" r="7" fill="#12B6CF" />
    </svg>
  )
}

export default function PasswordGate({ onUnlock }) {
  // In Firebase mode, don't render the password gate — AuthGate handles it
  // (This component shouldn't be reached in Firebase mode, but just in case)
  if (isFirebaseEnabled) return null

  return <DevPasswordGate onUnlock={onUnlock} />
}

/** Dev-only password gate — simple shared password for local testing */
function DevPasswordGate({ onUnlock }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === GATE_PASSWORD) {
      sessionStorage.setItem('aidoge_auth', 'true')
      onUnlock()
    } else {
      setError('Incorrect password')
      setPassword('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="password-gate">
      <div className="password-gate-card">
        <div className="password-gate-icon">
          <DogeEyeLogo size={48} />
        </div>
        <h1>AI DOGE</h1>
        <p>Council spending transparency platform. Enter the password to continue.</p>

        <form onSubmit={handleSubmit}>
          <div className="password-input-group">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              autoComplete="off"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {error && <div className="password-error">{error}</div>}
          <button type="submit" className="password-submit">
            Unlock
          </button>
        </form>

        <div className="password-dev-badge">
          Dev Mode
        </div>
      </div>
    </div>
  )
}
