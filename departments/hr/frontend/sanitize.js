import DOMPurify from 'dompurify'

export function sanitizeHrHtml(html) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ['a', 'base', 'form', 'iframe', 'img', 'link', 'style'],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['data-hr-action', 'data-hr-change', 'data-department', 'data-record', 'data-decision', 'data-tab'],
  })
}
