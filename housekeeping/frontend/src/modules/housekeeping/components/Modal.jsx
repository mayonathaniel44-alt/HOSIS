import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Pop-up window used for record details on the list pages.
// Keyboard and screen reader users: focus moves into the pop-up when it
// opens, Tab stays inside it, Escape closes it, and focus goes back to the
// button that opened it.
export default function Modal({ title, onClose, children, variant }) {
  const boxRef = useRef(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    const box = boxRef.current
    const first = box?.querySelector(FOCUSABLE)
    ;(first || box)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll(FOCUSABLE)]
      if (!items.length) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus()
    }
  }, [])

  return (
    <div className="hk-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={boxRef}
        tabIndex={-1}
        className={`hk-modal__box${variant ? ` hk-modal__box--${variant}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {!variant && (
          <button type="button" className="hk-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
