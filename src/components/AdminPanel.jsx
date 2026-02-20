/**
 * AdminPanel — user management interface for admins.
 *
 * Features:
 * - List all registered users with their roles
 * - Assign/change roles (unassigned, viewer, strategist, admin)
 * - Set per-council access (select councils from list)
 * - Set per-page access within each council
 * - Set constituency access
 */
import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { Users, Shield, ChevronDown, ChevronUp, Save, Check, X, Loader2, Search } from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import './AdminPanel.css'

// All 15 Lancashire council IDs
const COUNCILS = [
  { id: 'burnley', name: 'Burnley' },
  { id: 'hyndburn', name: 'Hyndburn' },
  { id: 'pendle', name: 'Pendle' },
  { id: 'rossendale', name: 'Rossendale' },
  { id: 'lancaster', name: 'Lancaster' },
  { id: 'ribble_valley', name: 'Ribble Valley' },
  { id: 'chorley', name: 'Chorley' },
  { id: 'south_ribble', name: 'South Ribble' },
  { id: 'lancashire_cc', name: 'Lancashire CC' },
  { id: 'blackpool', name: 'Blackpool' },
  { id: 'blackburn', name: 'Blackburn w/ Darwen' },
  { id: 'west_lancashire', name: 'West Lancashire' },
  { id: 'wyre', name: 'Wyre' },
  { id: 'preston', name: 'Preston' },
  { id: 'fylde', name: 'Fylde' },
]

// Available page slugs
const PAGES = [
  'spending', 'budgets', 'doge', 'news', 'procurement', 'suppliers',
  'pay', 'politics', 'integrity', 'my-area', 'demographics', 'lgr',
  'lgr-calculator', 'elections', 'constituencies', 'meetings', 'compare',
  'foi', 'press', 'about', 'strategy',
]

const ROLES = ['unassigned', 'viewer', 'strategist', 'admin']

export default function AdminPanel() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedUser, setExpandedUser] = useState(null)
  const [saving, setSaving] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  // Load all users
  const loadUsers = useCallback(async () => {
    if (!db || !isAdmin) return
    setLoading(true)
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      const userList = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }))
      userList.sort((a, b) => (a.email || '').localeCompare(b.email || ''))
      setUsers(userList)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { loadUsers() }, [loadUsers])

  if (!isAdmin) {
    return (
      <div className="admin-panel">
        <div className="admin-denied">
          <Shield size={48} />
          <h2>Admin Access Required</h2>
          <p>You need admin privileges to access this panel.</p>
        </div>
      </div>
    )
  }

  const filteredUsers = users.filter(u =>
    !search || (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1><Users size={24} /> User Management</h1>
        <span className="admin-count">{users.length} users</span>
      </div>

      <div className="admin-search">
        <Search size={18} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
        />
      </div>

      {loading ? (
        <div className="admin-loading"><Loader2 size={24} className="spin" /> Loading users...</div>
      ) : (
        <div className="admin-user-list">
          {filteredUsers.map(u => (
            <UserCard
              key={u.uid}
              user={u}
              expanded={expandedUser === u.uid}
              onToggle={() => setExpandedUser(expandedUser === u.uid ? null : u.uid)}
              saving={saving === u.uid}
              saveSuccess={saveSuccess === u.uid}
              onSave={async (updates) => {
                setSaving(u.uid)
                setSaveSuccess(null)
                try {
                  await updateDoc(doc(db, 'users', u.uid), updates)
                  setUsers(prev => prev.map(p => p.uid === u.uid ? { ...p, ...updates } : p))
                  setSaveSuccess(u.uid)
                  setTimeout(() => setSaveSuccess(null), 2000)
                } catch (err) {
                  console.error('Failed to update user:', err)
                }
                setSaving(null)
              }}
            />
          ))}
          {filteredUsers.length === 0 && (
            <div className="admin-empty">No users found</div>
          )}
        </div>
      )}
    </div>
  )
}

function UserCard({ user, expanded, onToggle, onSave, saving, saveSuccess }) {
  const [role, setRole] = useState(user.role || 'unassigned')
  const [councilAccess, setCouncilAccess] = useState(user.council_access || [])
  const [pageAccess, setPageAccess] = useState(user.page_access || {})
  const [constituencyAccess, setConstituencyAccess] = useState(user.constituency_access || [])
  const [dirty, setDirty] = useState(false)

  const toggleCouncil = (id) => {
    setDirty(true)
    if (id === '*') {
      setCouncilAccess(councilAccess.includes('*') ? [] : ['*'])
      return
    }
    setCouncilAccess(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev.filter(c => c !== '*'), id]
    )
  }

  const togglePage = (councilId, page) => {
    setDirty(true)
    const current = pageAccess[councilId] || []
    if (page === '*') {
      setPageAccess(prev => ({ ...prev, [councilId]: current.includes('*') ? [] : ['*'] }))
      return
    }
    const updated = current.includes(page)
      ? current.filter(p => p !== page)
      : [...current.filter(p => p !== '*'), page]
    setPageAccess(prev => ({ ...prev, [councilId]: updated }))
  }

  const handleRoleChange = (newRole) => {
    setRole(newRole)
    setDirty(true)
  }

  const handleSave = () => {
    onSave({
      role,
      council_access: councilAccess,
      page_access: pageAccess,
      constituency_access: constituencyAccess,
    })
    setDirty(false)
  }

  const roleBadgeClass = `admin-role-badge admin-role-${role}`

  return (
    <div className={`admin-user-card ${expanded ? 'expanded' : ''}`}>
      <div className="admin-user-header" onClick={onToggle}>
        <div className="admin-user-info">
          <span className="admin-user-name">{user.display_name || 'No name'}</span>
          <span className="admin-user-email">{user.email || 'No email'}</span>
        </div>
        <div className="admin-user-meta">
          <span className={roleBadgeClass}>{role}</span>
          {saving && <Loader2 size={16} className="spin" />}
          {saveSuccess && <Check size={16} className="admin-save-ok" />}
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {expanded && (
        <div className="admin-user-details">
          {/* Role selector */}
          <div className="admin-section">
            <h3>Role</h3>
            <div className="admin-role-buttons">
              {ROLES.map(r => (
                <button
                  key={r}
                  className={`admin-role-btn ${role === r ? 'active' : ''}`}
                  onClick={() => handleRoleChange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Council access */}
          <div className="admin-section">
            <h3>Council Access</h3>
            <div className="admin-checkbox-grid">
              <label className="admin-checkbox admin-checkbox-all">
                <input
                  type="checkbox"
                  checked={councilAccess.includes('*')}
                  onChange={() => toggleCouncil('*')}
                />
                <span>All Councils</span>
              </label>
              {COUNCILS.map(c => (
                <label key={c.id} className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={councilAccess.includes('*') || councilAccess.includes(c.id)}
                    onChange={() => toggleCouncil(c.id)}
                    disabled={councilAccess.includes('*')}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Page access — show per selected council */}
          {councilAccess.length > 0 && (
            <div className="admin-section">
              <h3>Page Access</h3>
              {(councilAccess.includes('*') ? COUNCILS : COUNCILS.filter(c => councilAccess.includes(c.id))).map(c => (
                <div key={c.id} className="admin-page-council">
                  <h4>{c.name}</h4>
                  <div className="admin-checkbox-grid admin-pages-grid">
                    <label className="admin-checkbox admin-checkbox-all">
                      <input
                        type="checkbox"
                        checked={(pageAccess[c.id] || []).includes('*')}
                        onChange={() => togglePage(c.id, '*')}
                      />
                      <span>All Pages</span>
                    </label>
                    {PAGES.map(p => (
                      <label key={p} className="admin-checkbox">
                        <input
                          type="checkbox"
                          checked={(pageAccess[c.id] || []).includes('*') || (pageAccess[c.id] || []).includes(p)}
                          onChange={() => togglePage(c.id, p)}
                          disabled={(pageAccess[c.id] || []).includes('*')}
                        />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Provider + timestamps info */}
          <div className="admin-section admin-meta-section">
            <span>Provider: {user.provider || 'email'}</span>
            <span>Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span>
          </div>

          {/* Save button */}
          {dirty && (
            <button className="admin-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
              Save Changes
            </button>
          )}
        </div>
      )}
    </div>
  )
}
