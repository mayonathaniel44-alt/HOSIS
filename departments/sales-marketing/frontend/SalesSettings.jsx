import { useEffect, useState } from 'react'
import { authApi, request } from '../../../frontend/src/services/api.js'

function positionLabel(position) {
  return position === 'SALES_HEAD' ? 'Sales Head' : 'Sales Staff'
}

const json = (method, body) => ({ method, body: JSON.stringify(body) })

export default function SalesSettings({
  page,
  api,
  user,
  onSessionChange,
  onRestore,
}) {
  const [users, setUsers] = useState([])
  const [account, setAccount] = useState(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const load =
      page === 'Users'
        ? api('/users')
        : page === 'My Account'
          ? request('/auth/account')
          : null
    load
      ?.then((data) => {
        if (!active) return
        if (page === 'Users') setUsers(data.users)
        else setAccount(data.account)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [api, page])

  async function run(work) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setNotice(await work())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function submit(event, work) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    void run(() => work(values, form))
  }

  async function download() {
    const backup = await api('/backup')
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download =
      'HOSIS-sales-backup-' + new Date().toISOString().slice(0, 10) + '.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'Sales backup downloaded.'
  }

  return (
    <section className="ws-panel">
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ws-notice" role="status">
          {notice}
        </p>
      )}
      {page === 'Users' && (
        <>
          <h2>Create a Sales account</h2>
          <p className="ws-muted">
            New users set their own password on first sign-in.
          </p>
          <form
            onSubmit={(event) =>
              submit(event, async (values, form) => {
                const { account: created } = await api('/users', 'POST', values)
                setUsers((rows) =>
                  [
                    ...rows,
                    {
                      ...created,
                      firstName: values.firstName,
                      lastName: values.lastName,
                    },
                  ].sort((a, b) => a.username.localeCompare(b.username)),
                )
                form.reset()
                return 'Sales account created.'
              })
            }
          >
            <div className="ws-fields">
              <label>
                Username
                <input name="username" required maxLength={80} />
              </label>
              <label>
                Temporary password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
              <label>
                First name
                <input name="firstName" maxLength={50} required />
              </label>
              <label>
                Last name
                <input name="lastName" maxLength={50} required />
              </label>
              <label>
                Email
                <input name="email" type="email" maxLength={100} />
              </label>
              <label>
                Position
                <select name="position">
                  <option value="SALES_STAFF">Sales Staff</option>
                  {user.role === 'Super Admin' && (
                    <option value="SALES_HEAD">Sales Head</option>
                  )}
                </select>
              </label>
            </div>
            <button className="ws-primary" disabled={busy}>
              Create account
            </button>
          </form>
          <div className="ws-backup-actions">
            <h2>Sales accounts</h2>
          </div>
          <div className="ws-table-panel">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((member) => (
                  <tr key={member.id}>
                    <td>{member.username}</td>
                    <td>
                      {member.firstName} {member.lastName}
                    </td>
                    <td>{positionLabel(member.position)}</td>
                    <td>{member.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {page === 'Backup & Restore' && (
        <>
          <h2>Sales records backup</h2>
          <p className="ws-muted">
            The backup contains Sales records, including archived records and
            reconciliation history. It may contain customer information.
          </p>
          <div className="ws-backup-actions">
            <button
              className="ws-primary"
              disabled={busy}
              onClick={() => run(download)}
            >
              Download backup
            </button>
          </div>
          <form
            onSubmit={(event) =>
              submit(event, async (_values, form) => {
                if (!file || file.size > 3 * 1024 * 1024)
                  throw new Error('Choose a Sales backup smaller than 3 MB.')
                let content
                try {
                  content = JSON.parse(await file.text())
                } catch {
                  throw new Error('Choose a valid HOSIS Sales backup file.')
                }
                const result = await api('/restore', 'POST', content)
                form.reset()
                setFile(null)
                if (result.restored) await onRestore()
                return result.restored
                  ? `Restored ${result.restored} Sales record(s).`
                  : 'No eligible Sales records needed recovery.'
              })
            }
          >
            <h2>Restore records</h2>
            <p className="ws-muted">
              Recover missing or archived working records that were active when
              the backup was made. Current records and shared financial history
              are preserved.
            </p>
            <div className="ws-fields">
              <label>
                Backup file
                <input
                  type="file"
                  accept=".json,application/json"
                  required
                  onChange={(event) => setFile(event.target.files[0] || null)}
                />
              </label>
              <label>
                <input type="checkbox" required /> Confirm restoration from this
                backup
              </label>
            </div>
            <button className="ws-primary" disabled={busy || !file}>
              Restore from backup
            </button>
          </form>
        </>
      )}
      {page === 'My Account' && account && (
        <>
          <h2>Profile</h2>
          <p className="ws-muted">
            {account.username} |{' '}
            {user.role === 'Super Admin'
              ? 'Administrator'
              : positionLabel(account.position)}
          </p>
          <form
            key={account.email}
            onSubmit={(event) =>
              submit(event, async (values) => {
                const session = await request(
                  '/auth/account',
                  json('PATCH', {
                    ...values,
                    remember: authApi.isRemembered(),
                  }),
                )
                setAccount(session.account)
                onSessionChange(session)
                return 'Profile updated.'
              })
            }
          >
            <div className="ws-fields">
              <label>
                First name
                <input
                  name="firstName"
                  defaultValue={account.first_name}
                  maxLength={50}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  name="lastName"
                  defaultValue={account.last_name}
                  maxLength={50}
                  required
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={account.email || ''}
                  maxLength={100}
                  required
                />
              </label>
            </div>
            <button className="ws-primary" disabled={busy}>
              Save profile
            </button>
          </form>
          <div className="ws-backup-actions">
            <h2>Change password</h2>
          </div>
          <form
            onSubmit={(event) =>
              submit(
                event,
                async (
                  { currentPassword, newPassword, confirmation },
                  form,
                ) => {
                  if (newPassword !== confirmation)
                    throw new Error('The new passwords must match.')
                  const session = await request(
                    '/auth/password',
                    json('POST', {
                      currentPassword,
                      newPassword,
                      remember: authApi.isRemembered(),
                    }),
                  )
                  onSessionChange(session)
                  form.reset()
                  return 'Password changed.'
                },
              )
            }
          >
            <div className="ws-fields">
              <label>
                Current password
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
            </div>
            <button className="ws-primary" disabled={busy}>
              Change password
            </button>
          </form>
        </>
      )}
    </section>
  )
}
