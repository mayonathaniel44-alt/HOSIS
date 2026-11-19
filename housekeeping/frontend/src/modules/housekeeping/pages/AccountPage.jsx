import { useRef, useState } from 'react'
import { api } from '../api.js'
import StaffAvatar from '../components/StaffAvatar.jsx'
import { photoChanged } from '../photos.js'
import { Badge, Card, Field, LoadState, Notice } from '../components/ui.jsx'
import { label, longDate, staffId } from '../format.js'
import { useLoad } from '../useLoad.js'

const MIN_PASSWORD = 8

// Account: the signed-in staff member's user ID, email and password.
export default function AccountPage({ onSessionChange }) {
  const { data, error, loading } = useLoad(() => api.account(), [], { refresh: false })
  if (!data) return <LoadState loading={loading} error={error} />
  const a = data.account

  return (
    <div className="hk-grid hk-grid--even">
      <Card title="Account details" subtitle="The account you use to sign in to Housekeeping">
        <div className="hk-account-head">
          <StaffAvatar
            userId={a.user_id}
            name={`${a.first_name} ${a.last_name}`}
            version={a.photo_version}
            className="hk-account-head__avatar"
          />
          <div>
            <strong>{a.first_name} {a.last_name}</strong>
            <small>Housekeeping {label(a.position)}</small>
          </div>
          <Badge value={a.employment_status === 'ACTIVE' ? 'AVAILABLE' : 'CLOSED'}>{label(a.employment_status)}</Badge>
        </div>
        <dl className="hk-facts">
          <dt>User ID</dt>
          <dd><strong>{staffId(a.user_id)}</strong></dd>
          <dt>Username</dt>
          <dd>{a.username}</dd>
          <dt>Email</dt>
          <dd className="hk-break">{a.email || 'No email on file'}</dd>
          <dt>Department</dt>
          <dd>{label(a.role)}</dd>
          <dt>Position</dt>
          <dd>{label(a.position)}</dd>
          <dt>Account created</dt>
          <dd>{longDate(a.created_at.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' })}</dd>
        </dl>
        <ProfilePhoto account={a} />
        <Notice tone="violet" title="Sign in with your email or username">
          To change your name or email, ask your supervisor or HR to update your staff record.
        </Notice>
      </Card>

      <PasswordForm onChanged={(res) => onSessionChange?.({ token: res.token, user: res.user })} />
    </div>
  )
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_MB = 5
const PHOTO_SIZE = 320 // the saved photo is a 320 x 320 square

// Reads the chosen file, crops the middle square and shrinks it, so every
// photo is small (well under the 2 MB server limit) and looks right in a circle.
function preparePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      if (!side) return reject(new Error('That photo could not be read. Try another file.'))
      const canvas = document.createElement('canvas')
      canvas.width = PHOTO_SIZE
      canvas.height = PHOTO_SIZE
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff' // see-through PNG parts become white, not black
      ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE)
      ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        PHOTO_SIZE,
        PHOTO_SIZE
      )
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not a photo the browser can open. Use a JPEG, PNG or WebP photo.'))
    }
    img.src = url
  })
}

// Upload, change or remove the signed-in user's profile photo.
function ProfilePhoto({ account }) {
  const input = useRef(null)
  const [version, setVersion] = useState(account.photo_version)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [message, setMessage] = useState(null)
  const hasPhoto = Boolean(version)
  const name = `${account.first_name} ${account.last_name}`

  async function choose(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // picking the same file again still works
    if (!file) return
    setMessage(null)
    setConfirmRemove(false)
    if (!PHOTO_TYPES.includes(file.type)) {
      setMessage({ tone: 'red', title: 'Photo not saved', text: 'Choose a JPEG, PNG or WebP photo.' })
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setMessage({ tone: 'red', title: 'Photo not saved', text: `The photo must be ${MAX_FILE_MB} MB or smaller.` })
      return
    }
    setBusy(true)
    try {
      const image = await preparePhoto(file)
      const res = await api.uploadPhoto(image)
      setVersion(res.photo_version)
      photoChanged(account.user_id, res.photo_version)
      setMessage({ tone: 'green', title: hasPhoto ? 'Photo changed' : 'Photo added', text: 'Your photo now shows instead of your initials.' })
    } catch (err) {
      setMessage({ tone: 'red', title: 'Photo not saved', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setMessage(null)
    try {
      await api.removePhoto()
      setVersion(null)
      photoChanged(account.user_id, null)
      setMessage({ tone: 'green', title: 'Photo removed', text: 'Your initials show again.' })
    } catch (err) {
      setMessage({ tone: 'red', title: 'Photo not removed', text: err.message })
    } finally {
      setBusy(false)
      setConfirmRemove(false)
    }
  }

  return (
    <section className="hk-photo" aria-label="Profile photo">
      <button
        type="button"
        className="hk-photo__pick"
        onClick={() => input.current?.click()}
        disabled={busy}
        title={hasPhoto ? 'Change photo' : 'Upload photo'}
      >
        <StaffAvatar userId={account.user_id} name={name} version={version} className="hk-photo__avatar" />
        <span className="hk-photo__overlay">{busy ? 'Saving...' : hasPhoto ? 'Change' : 'Upload'}</span>
        <span className="hk-sr-only">{hasPhoto ? 'Change profile photo' : 'Upload profile photo'}</span>
      </button>
      <div className="hk-photo__body">
        <strong>Profile photo</strong>
        <small>JPEG, PNG or WebP, up to {MAX_FILE_MB} MB. It is cropped to a square and shown to your team.</small>
        <div className="hk-actions hk-actions--tight">
          <button type="button" className="hk-btn hk-btn--primary hk-btn--small" onClick={() => input.current?.click()} disabled={busy}>
            {hasPhoto ? 'Change photo' : 'Upload photo'}
          </button>
          {hasPhoto && !confirmRemove && (
            <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" onClick={() => setConfirmRemove(true)} disabled={busy}>
              Remove photo
            </button>
          )}
          {hasPhoto && confirmRemove && (
            <>
              <button type="button" className="hk-btn hk-btn--danger hk-btn--small" onClick={remove} disabled={busy}>
                Yes, remove
              </button>
              <button type="button" className="hk-btn hk-btn--secondary hk-btn--small" onClick={() => setConfirmRemove(false)} disabled={busy}>
                Cancel
              </button>
            </>
          )}
        </div>
        {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}
      </div>
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        onChange={choose}
        hidden
      />
    </section>
  )
}

// Also used on its own when a temporary password must be replaced.
export function PasswordForm({ onChanged, currentLabel = 'Current password' }) {
  const empty = { currentPassword: '', newPassword: '', confirm: '' }
  const [form, setForm] = useState(empty)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const tooShort = form.newPassword.length > 0 && form.newPassword.length < MIN_PASSWORD
  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword
  const ready = form.currentPassword && form.newPassword.length >= MIN_PASSWORD && form.confirm === form.newPassword

  async function save(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm(empty)
      setMessage({ tone: 'green', title: 'Password changed', text: 'Use your new password the next time you sign in. Other devices signed in with the old password are signed out.' })
      // The old token no longer works; keep this device signed in with the new one.
      onChanged?.(res)
    } catch (err) {
      setMessage({ tone: 'red', title: 'Password not changed', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const type = show ? 'text' : 'password'
  return (
    <Card title="Change password" subtitle="Keep your account private; never share your password">
      <form className="hk-stack" onSubmit={save}>
        <Field label={currentLabel}>
          <input type={type} value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
        </Field>
        <Field label="New password">
          <input type={type} value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" aria-invalid={tooShort || undefined} />
        </Field>
        <Field label="Confirm new password">
          <input type={type} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" aria-invalid={mismatch || undefined} />
        </Field>
        <label className="hk-check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
        <ul className="hk-rules">
          <li className={form.newPassword.length >= MIN_PASSWORD ? 'is-ok' : ''}>At least {MIN_PASSWORD} characters</li>
          <li className={form.confirm && !mismatch ? 'is-ok' : ''}>Both new passwords match</li>
        </ul>
        {message && <Notice tone={message.tone} title={message.title}>{message.text}</Notice>}
        <div className="hk-actions">
          <button type="submit" className="hk-btn hk-btn--primary" disabled={!ready || busy}>
            {busy ? 'Saving...' : 'Change password'}
          </button>
        </div>
      </form>
    </Card>
  )
}
