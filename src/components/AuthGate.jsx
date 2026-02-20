/**
 * AuthGate — Login/register screen with social providers + email/password.
 * Shown when Firebase Auth is enabled and user is not authenticated,
 * or when authenticated but role === 'unassigned'.
 */
import { useState, useRef, useEffect } from 'react'
import { Lock, Mail, Eye, EyeOff, LogIn, UserPlus, Loader2, AlertCircle } from 'lucide-react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  FacebookAuthProvider,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import './AuthGate.css'

const googleProvider = new GoogleAuthProvider()
const appleProvider = new OAuthProvider('apple.com')
const facebookProvider = new FacebookAuthProvider()

/**
 * Ensure a Firestore user doc exists after sign-in/register.
 * If doc already exists, don't overwrite (admin may have set permissions).
 */
async function ensureUserDoc(user) {
  if (!db || !user) return
  const userRef = doc(db, 'users', user.uid)
  const existing = await getDoc(userRef)
  if (!existing.exists()) {
    await setDoc(userRef, {
      email: user.email || '',
      display_name: user.displayName || '',
      role: 'unassigned',
      council_access: [],
      page_access: {},
      constituency_access: [],
      created_at: new Date().toISOString(),
      provider: user.providerData?.[0]?.providerId || 'email',
    })
  }
}

export default function AuthGate() {
  const { user, role, loading: authLoading, signOut } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const emailRef = useRef(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [mode])

  const clearMessages = () => { setError(''); setSuccess('') }

  // Email/password login
  const handleEmailLogin = async (e) => {
    e.preventDefault()
    clearMessages()
    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      await ensureUserDoc(cred.user)
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  // Email/password register
  const handleEmailRegister = async (e) => {
    e.preventDefault()
    clearMessages()
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      if (name) {
        await updateProfile(cred.user, { displayName: name })
      }
      await ensureUserDoc(cred.user)
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  // Social sign-in
  const handleSocial = async (provider) => {
    clearMessages()
    setLoading(true)
    try {
      const cred = await signInWithPopup(auth, provider)
      await ensureUserDoc(cred.user)
    } catch (err) {
      // Don't show error for user-cancelled popups
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(friendlyError(err.code))
      }
    } finally {
      setLoading(false)
    }
  }

  // Password reset
  const handleReset = async (e) => {
    e.preventDefault()
    clearMessages()
    if (!email) {
      setError('Enter your email address')
      return
    }
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setSuccess('Password reset email sent. Check your inbox.')
    } catch (err) {
      setError(friendlyError(err.code))
    } finally {
      setLoading(false)
    }
  }

  // Authenticated but unassigned — show waiting screen
  if (user && role === 'unassigned') {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-icon awaiting">
            <Loader2 size={48} className="spin" />
          </div>
          <h1>Awaiting Access</h1>
          <p>
            Your account has been created. An administrator needs to assign
            your access permissions before you can view any content.
          </p>
          <div className="auth-user-info">
            <span>{user.displayName || user.email}</span>
          </div>
          <button className="auth-btn auth-btn-secondary" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-icon">
            <Loader2 size={48} className="spin" />
          </div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  // Password reset mode
  if (mode === 'reset') {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-icon">
            <Mail size={48} />
          </div>
          <h1>Reset Password</h1>
          <p>Enter your email and we'll send a reset link.</p>

          <form onSubmit={handleReset}>
            <div className="auth-input-group">
              <Mail size={18} className="auth-input-icon" />
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearMessages() }}
                placeholder="Email address"
                autoComplete="email"
                required
              />
            </div>

            {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}
            {success && <div className="auth-success">{success}</div>}

            <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
              {loading ? <Loader2 size={20} className="spin" /> : 'Send Reset Email'}
            </button>
          </form>

          <div className="auth-switch">
            <button onClick={() => { setMode('login'); clearMessages() }}>
              Back to login
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Login / Register mode
  const isRegister = mode === 'register'

  return (
    <div className="auth-gate">
      <div className="auth-gate-card">
        <div className="auth-gate-icon">
          <Lock size={48} />
        </div>
        <h1>AI DOGE</h1>
        <p>Council spending transparency platform</p>

        {/* Social providers */}
        <div className="auth-social-buttons">
          <button
            className="auth-btn auth-btn-social auth-google"
            onClick={() => handleSocial(googleProvider)}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <button
            className="auth-btn auth-btn-social auth-apple"
            onClick={() => handleSocial(appleProvider)}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Continue with Apple
          </button>
          <button
            className="auth-btn auth-btn-social auth-facebook"
            onClick={() => handleSocial(facebookProvider)}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Continue with Facebook
          </button>
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {/* Email form */}
        <form onSubmit={isRegister ? handleEmailRegister : handleEmailLogin}>
          {isRegister && (
            <div className="auth-input-group">
              <UserPlus size={18} className="auth-input-icon" />
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); clearMessages() }}
                placeholder="Full name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-input-group">
            <Mail size={18} className="auth-input-icon" />
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearMessages() }}
              placeholder="Email address"
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-input-group">
            <Lock size={18} className="auth-input-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearMessages() }}
              placeholder="Password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : undefined}
            />
            <button
              type="button"
              className="auth-toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <div className="auth-error"><AlertCircle size={16} /> {error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
            {loading ? (
              <Loader2 size={20} className="spin" />
            ) : isRegister ? (
              <><UserPlus size={18} /> Create Account</>
            ) : (
              <><LogIn size={18} /> Sign In</>
            )}
          </button>
        </form>

        <div className="auth-switch">
          {isRegister ? (
            <button onClick={() => { setMode('login'); clearMessages() }}>
              Already have an account? <strong>Sign in</strong>
            </button>
          ) : (
            <>
              <button onClick={() => { setMode('register'); clearMessages() }}>
                Need an account? <strong>Register</strong>
              </button>
              <button onClick={() => { setMode('reset'); clearMessages() }}>
                Forgot password?
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Map Firebase error codes to user-friendly messages */
function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'An account with this email already exists',
    'auth/invalid-email': 'Invalid email address',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/invalid-credential': 'Invalid email or password',
    'auth/weak-password': 'Password must be at least 8 characters',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/popup-blocked': 'Popup blocked. Please allow popups for this site.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact the administrator.',
  }
  return map[code] || 'Something went wrong. Please try again.'
}
