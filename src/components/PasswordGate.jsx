import { useState, useRef, useEffect } from 'react'
import { Lock, Eye, EyeOff } from 'lucide-react'
import './PasswordGate.css'

const GATE_PASSWORD = 'DOGEReform2026!'

export default function PasswordGate({ onUnlock }) {
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
          <Lock size={48} />
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
      </div>
    </div>
  )
}
