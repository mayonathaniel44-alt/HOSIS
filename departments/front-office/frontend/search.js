export function matchesSearch(query, ...fields) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const text = fields.filter((value) => value != null).join(' ').toLowerCase()
  return terms.every((term) => text.includes(term))
}

export function matchesStay(query, stay) {
  return matchesSearch(query, stay.code, stay.guest, stay.roomLabel, stay.type,
    stay.checkIn, stay.checkOut, stay.dates, stay.statusLabel)
}
