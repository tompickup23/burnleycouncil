/**
 * ProtectedRoute — wraps routes with permission checks.
 *
 * Usage:
 *   <ProtectedRoute page="spending">
 *     <Spending />
 *   </ProtectedRoute>
 *
 * Checks:
 * 1. User is authenticated (handled by AuthGate/PasswordGate upstream)
 * 2. User has council access (via AuthContext.hasCouncilAccess)
 * 3. User has page access (via AuthContext.hasPageAccess)
 * 4. For strategy pages: user has strategist or admin role
 *
 * When Firebase is not enabled (dev mode), all routes are accessible.
 */
import { isFirebaseEnabled } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useCouncilConfig } from '../context/CouncilConfig'

export default function ProtectedRoute({ children, page, requireStrategist = false }) {
  // Hooks must be called unconditionally (React Rules of Hooks)
  const auth = useAuth()
  const config = useCouncilConfig()

  // In dev mode (no Firebase), allow everything
  if (!isFirebaseEnabled) return children

  const { hasPageAccess, isAdmin, isStrategist } = auth
  const councilId = config.council_id || 'unknown'

  // Admin sees everything
  if (isAdmin) return children

  // Strategy pages require strategist role
  if (requireStrategist && !isStrategist) {
    return (
      <div className="protected-route-denied">
        <h2>Access Restricted</h2>
        <p>You need strategist access to view this page.</p>
      </div>
    )
  }

  // Check page-level access (if page prop provided)
  if (page && !hasPageAccess(councilId, page)) {
    return (
      <div className="protected-route-denied">
        <h2>Access Restricted</h2>
        <p>You don't have permission to view this page for {config.council_name || 'this council'}.</p>
      </div>
    )
  }

  return children
}
