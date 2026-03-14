/**
 * AuthContext — Firebase authentication + Firestore RBAC permissions.
 *
 * 8-level hierarchical role system:
 *   0: unassigned — awaiting admin approval
 *   1: public — all public pages (renamed from viewer)
 *   2: councillor — public + strategy + intelligence + cabinet overview (renamed from strategist)
 *   3: champion — councillor + champion context for assigned areas
 *   4: lead_member — champion + portfolio read access for assigned area
 *   5: cabinet_member — lead + full portfolio tools, savings engine, reform playbook
 *   6: leader — cabinet + ALL portfolios, cross-cutting, officer structure
 *   7: admin — everything + user management
 *
 * Provides:
 * - user, permissions, role, loading
 * - hasMinRole(roleName) → boolean (hierarchical check)
 * - hasCouncilAccess(councilId) → boolean
 * - hasPageAccess(councilId, page) → boolean
 * - hasConstituencyAccess(slug) → boolean
 * - hasPortfolioAccess(portfolioId) → boolean
 * - isAdmin, isCouncillor, isCabinetLevel, isStrategist (backward compat)
 * - signOut() → void
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

/** Role hierarchy — higher number = more access */
export const ROLE_LEVELS = {
  unassigned: 0,
  public: 1,
  viewer: 1,       // backward compat alias
  councillor: 2,
  strategist: 2,   // backward compat alias
  champion: 3,
  lead_member: 4,
  cabinet_member: 5,
  leader: 6,
  admin: 7,
}

/** Canonical role names (excludes backward compat aliases) */
export const ROLES = [
  'unassigned', 'public', 'councillor', 'champion',
  'lead_member', 'cabinet_member', 'leader', 'admin',
]

/** Human-readable role descriptions */
export const ROLE_DESCRIPTIONS = {
  unassigned: 'Awaiting admin approval',
  public: 'Public transparency pages',
  councillor: 'Strategy, intelligence & cabinet overview',
  champion: 'Councillor + champion area context',
  lead_member: 'Champion + portfolio read access',
  cabinet_member: 'Full portfolio tools & savings engine',
  leader: 'All portfolios & cross-cutting',
  admin: 'Everything + user management',
}

/** Normalize legacy role names to canonical */
function normalizeRole(role) {
  if (role === 'viewer') return 'public'
  if (role === 'strategist') return 'councillor'
  return role || 'unassigned'
}

const DEFAULT_PERMISSIONS = {
  role: 'unassigned',
  council_access: [],
  page_access: {},
  constituency_access: [],
  portfolio_ids: [],
  champion_areas: [],
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
            role: normalizeRole(data.role),
            council_access: data.council_access || [],
            page_access: data.page_access || {},
            constituency_access: data.constituency_access || [],
            portfolio_ids: data.portfolio_ids || [],
            champion_areas: data.champion_areas || [],
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
          role: normalizeRole(data.role),
          council_access: data.council_access || [],
          page_access: data.page_access || {},
          constituency_access: data.constituency_access || [],
          portfolio_ids: data.portfolio_ids || [],
          champion_areas: data.champion_areas || [],
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

  /** Hierarchical role check — does user have at least this role level? */
  const hasMinRole = useCallback((roleName) => {
    if (!permissions) return false
    const userLevel = ROLE_LEVELS[permissions.role] ?? 0
    const requiredLevel = ROLE_LEVELS[roleName] ?? 99
    return userLevel >= requiredLevel
  }, [permissions])

  /** Does user have access to a specific cabinet portfolio? */
  const hasPortfolioAccess = useCallback((portfolioId) => {
    if (!permissions) return false
    // Leader and admin see all portfolios
    if (hasMinRole('leader')) return true
    // Cabinet members, lead members, champions see assigned portfolios
    const ids = permissions.portfolio_ids || []
    return ids.includes('*') || ids.includes(portfolioId)
  }, [permissions, hasMinRole])

  const hasCouncilAccess = useCallback((councilId) => {
    if (!permissions) return false
    if (hasMinRole('admin')) return true
    if (permissions.role === 'unassigned') return false
    const access = permissions.council_access || []
    return access.includes('*') || access.includes(councilId)
  }, [permissions, hasMinRole])

  const hasPageAccess = useCallback((councilId, page) => {
    if (!permissions) return false
    if (hasMinRole('admin')) return true
    if (permissions.role === 'unassigned') return false
    if (!hasCouncilAccess(councilId)) return false
    const pageAccess = permissions.page_access?.[councilId] || permissions.page_access?.['*'] || []
    return pageAccess.includes('*') || pageAccess.includes(page)
  }, [permissions, hasMinRole, hasCouncilAccess])

  const hasConstituencyAccess = useCallback((slug) => {
    if (!permissions) return false
    if (hasMinRole('admin')) return true
    if (permissions.role === 'unassigned') return false
    const access = permissions.constituency_access || []
    return access.includes('*') || access.includes(slug)
  }, [permissions, hasMinRole])

  const handleSignOut = useCallback(async () => {
    if (auth) {
      await firebaseSignOut(auth)
    }
    setUser(null)
    setPermissions(DEFAULT_PERMISSIONS)
  }, [])

  const roleLevel = ROLE_LEVELS[permissions.role] ?? 0

  const value = useMemo(() => ({
    user,
    permissions,
    role: permissions.role,
    roleLevel,
    loading,
    // Hierarchical checks
    hasMinRole,
    hasPortfolioAccess,
    // Convenience booleans
    isAdmin: roleLevel >= ROLE_LEVELS.admin,
    isCouncillor: roleLevel >= ROLE_LEVELS.councillor,
    isCabinetLevel: roleLevel >= ROLE_LEVELS.cabinet_member,
    isLeader: roleLevel >= ROLE_LEVELS.leader,
    // Backward compat — isStrategist maps to councillor+ level
    isStrategist: roleLevel >= ROLE_LEVELS.councillor,
    // Access checks
    hasCouncilAccess,
    hasPageAccess,
    hasConstituencyAccess,
    signOut: handleSignOut,
  }), [user, permissions, roleLevel, loading, hasMinRole, hasPortfolioAccess, hasCouncilAccess, hasPageAccess, hasConstituencyAccess, handleSignOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
