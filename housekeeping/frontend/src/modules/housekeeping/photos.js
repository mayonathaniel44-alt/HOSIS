import { api, fetchImage } from './api.js'

// Shared state for staff profile photos (see components/StaffAvatar.jsx).

const cache = new Map() // path -> Promise<blob URL | null>
const overrides = new Map() // userId -> latest photo version set on this device
export const PHOTO_EVENT = 'hk-photo-changed'

// The photo's address for a user and version, or null when there is none.
export function photoPath(userId, version) {
  const id = Number(userId)
  if (!id || version === null) return null
  return api.staffPhotoPath(id, version)
}

// Loads a photo once per address; resolves to null when it cannot be loaded
// (e.g. the person has no photo), so the initials show instead.
export function loadPhoto(path) {
  if (!cache.has(path)) {
    cache.set(path, fetchImage(path).catch(() => null))
  }
  return cache.get(path)
}

// The newest version known on this device, if the person changed it here.
export function currentVersion(userId, version) {
  const id = Number(userId)
  return overrides.has(id) ? overrides.get(id) : version
}

// Called after an upload, change or removal: every avatar of that person on
// the page (top bar, Account, lists) updates straight away.
export function photoChanged(userId, version) {
  const id = Number(userId)
  overrides.set(id, version)
  window.dispatchEvent(new CustomEvent(PHOTO_EVENT, { detail: { userId: id, version } }))
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}
