export function exportToCsv(filename, data, headers) {
  if (!data || !data.length) {
    alert('No data to export.')
    return
  }

  const keys = headers ? headers.map((h) => h.key) : Object.keys(data[0])
  const headerLabels = headers ? headers.map((h) => h.label) : keys

  const csvRows = [headerLabels.join(',')]

  data.forEach((item) => {
    const row = keys.map((key) => {
      let val = item[key]
      if (val === null || val === undefined) return '""'
      if (typeof val === 'object') val = JSON.stringify(val)
      val = String(val).replace(/"/g, '""')
      return `"${val}"`
    })
    csvRows.push(row.join(','))
  })

  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportToJson(filename, data) {
  if (!data) {
    alert('No data to export.')
    return
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}-${new Date().toISOString().slice(0, 10)}.json`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
