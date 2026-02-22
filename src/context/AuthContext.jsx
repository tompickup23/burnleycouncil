/**
 * AuthContext — Firebase authentication + Firestore RBAC permissions.
 *
 * Provides:
 * - user: Firebase user object (or null)
 * - permissions: { role, council_access, page_access, constituency_access }
 * - role: shorthand for permissions.role
 * - loading: true while auth/permissions are loading
 * - hasCouncilAccess(councilId) → boolean
 * - hasPageAccess(councilId, page) → boolean
 * - hasConstituencyAccess(slug) → boolean
 * - isAdmin → boolean
 * - signOut() → void
 *
 * When Firebase is not configured (dev mode), this context is not used —
 * the app falls back to PasswordGate.
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

const DEFAULT_PERMISSIONS = {
  role: 'unassigned',
  council_access: [],
  page_access: {},
  constituency_access: [],
  display_name: '',
  email: '',
  user_type: '',
  party: '',
  constituency: '',
  profile_complete: false,
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS)
  const [loading, setLoading] = useState(true)

  // Listen to Firebase auth state
  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)

      if (!firebaseUser) {
        setPermissions(DEFAULT_PERMISSIONS)
        setLoading(false)
        return
      }

      // Load permissions from Firestore
      try {
        const userDocRef = doc(db, 'users', firebaseUser.uid)
        const userDoc = await getDoc(userDocRef)

        if (userDoc.exists()) {
          const data = userDoc.data()
          setPermissions({
            role: data.role || 'unassigned',
            council_access: data.council_access || [],
            page_access: data.page_access || {},
            constituency_access: data.constituency_access || [],
            display_name: data.display_name || firebaseUser.displayName || '',
            email: data.email || firebaseUser.email || '',
            user_type: data.user_type || '',
            party: data.party || '',
            constituency: data.constituency || '',
            profile_complete: data.profile_complete || false,
          })
        } else {
          // First login — user doc doesn't exist yet, role = unassigned
          setPermissions({
            ...DEFAULT_PERMISSIONS,
            display_name: firebaseUser.displayName || '',
            email: firebaseUser.email || '',
          })
        }
      } catch (err) {
        console.error('Failed to load user permissions:', err)
        setPermissions(DEFAULT_PERMISSIONS)
      }

      setLoading(false)
    })

    return () => unsubAuth()
  }, [])

  // Real-time permission updates (so admin changes take effect without refresh)
  useEffect(() => {
    if (!auth || !db || !user) return

    const userDocRef = doc(db, 'users', user.uid)
    const unsubSnapshot = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        setPermissions({
          role: data.role || 'unassigned',
          council_access: data.council_access || [],
          page_access: data.page_access || {},
          constituency_access: data.constituency_access || [],
          display_name: data.display_name || user.displayName || '',
          email: data.email || user.email || '',
          user_type: data.user_type || '',
          party: data.party || '',
          constituency: data.constituency || '',
          profile_complete: data.profile_complete || false,
        })
      }
    }, (err) => {
      console.warn('Permission snapshot error:', err)
    })

    return () => unsubSnapshot()
  }, [user])

  // Permission check helpers
  const hasCouncilAccess = useCallback((councilId) => {
    if (!permissions) return false
    if (permissions.role === 'admin') return true
    if (permissions.role === 'unassigned') return false
    const access = permissions.council_access || []
    return access.includes('*') || access.includes(councilId)
  }, [permissions])

  const hasPageAccess = useCallback((councilId, page) => {
    if (!permissions) return false
    if (permissions.role === 'admin') return true
    if (permissions.role === 'unassigned') return false
    if (!hasCouncilAccess(councilId)) return false
    const pageAccess = permissions.page_access?.[councilId] || permissions.page_access?.['*'] || []
    return pageAccess.includes('*') || pageAccess.includes(page)
  }, [permissions, hasCouncilAccess])

  const hasConstituencyAccess = useCallback((slug) => {
    if (!permissions) return false
    if (permissions.role === 'admin') return true
    if (permissions.role === 'unassigned') return false
    const access = permissions.constituency_access || []
    return access.includes('*') || access.includes(slug)
  }, [permissions])

  const handleSignOut = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth)
    }
    setUser(null)
    setPermissions(DEFAULT_PERMISSIONS)
  }, [])

  const value = useMemo(() => ({
    user,
    permissions,
    role: permissions.role,
    loading,
    isAdmin: permissions.role === 'admin',
    isStrategist: permissions.role === 'strategist' || permissions.role === 'admin',
    hasCouncilAccess,
    hasPageAccess,
    hasConstituencyAccess,
    signOut: handleSignOut,
  }), [user, permissions, loading, hasCouncilAccess, hasPageAccess, hasConstituencyAccess, handleSignOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
