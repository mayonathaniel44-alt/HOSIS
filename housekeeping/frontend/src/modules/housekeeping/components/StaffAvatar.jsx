import { useEffect, useState } from 'react'
import { PHOTO_EVENT, currentVersion, initials, loadPhoto, photoPath } from '../photos.js'

// A staff member's profile photo, or their initials when they have none.
// Used in the top bar, Account, My Record and staff lists.
//
// `version` is the photo_version the API sends with each staff member:
//   null      -> no photo, show the initials (nothing is loaded)
//   "1700..." -> load that photo
//   undefined -> not known (e.g. the top bar); try to load it once
// After an upload, change or removal on this device (photoChanged in
// photos.js), every avatar of that person updates straight away.
export default function StaffAvatar({ userId, name, version, className = '', fallback }) {
  const id = Number(userId)
  const [, refresh] = useState(0)
  const [loaded, setLoaded] = useState({ path: null, url: null })

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail.userId === id) refresh((n) => n + 1)
    }
    window.addEventListener(PHOTO_EVENT, onChange)
    return () => window.removeEventListener(PHOTO_EVENT, onChange)
  }, [id])

  const path = photoPath(id, currentVersion(id, version))

  useEffect(() => {
    if (!path) return undefined
    let live = true
    loadPhoto(path).then((url) => {
      if (live) setLoaded({ path, url })
    })
    return () => {
      live = false
    }
  }, [path])

  const src = path && loaded.path === path ? loaded.url : null
  return (
    <span className={`hk-avatar ${src ? 'hk-avatar--photo' : ''} ${className}`.trim()} aria-hidden="true">
      {src ? <img src={src} alt="" /> : fallback ?? initials(name)}
    </span>
  )
}
