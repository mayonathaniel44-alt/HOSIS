// PDF, Excel and CSV downloads for the Housekeeping lists and reports. The
// PDF and Excel libraries load only when someone downloads, so normal page
// loads stay small.
//
// Every export takes { title, fileName } plus either
//   { columns, rows }               one table, or
//   { sections: [{ heading, columns, rows }] }   several tables (e.g. My Record),
// and optional summary: [[label, value], ...] lines printed above the tables.

function stamp() {
  return new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function tables({ columns, rows, sections }) {
  return sections || [{ heading: null, columns, rows }]
}

function cell(column, row) {
  return String(column.value(row) ?? '')
}

export async function exportPdf(report) {
  const { title, fileName, summary } = report
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const list = tables(report)
  const wide = list.some((t) => t.columns.length > 5)
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait' })
  doc.setFontSize(14)
  doc.text(`Grand Horizon Hotel - ${title}`, 14, 16)
  doc.setFontSize(9)
  doc.text(`HOSIS Housekeeping · generated ${stamp()}`, 14, 22)
  let y = 27
  if (summary?.length) {
    autoTable(doc, {
      startY: y,
      body: summary.map(([k, v]) => [k, String(v ?? '')]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    })
    y = doc.lastAutoTable.finalY + 6
  }
  for (const t of list) {
    if (t.heading) {
      if (y > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage()
        y = 16
      }
      doc.setFontSize(11)
      doc.text(t.heading, 14, y)
      y += 3
    }
    autoTable(doc, {
      startY: y,
      head: [t.columns.map((c) => c.title)],
      body: t.rows.length ? t.rows.map((r) => t.columns.map((c) => cell(c, r))) : [[{ content: 'No records.', colSpan: t.columns.length }]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [18, 13, 92] },
    })
    y = doc.lastAutoTable.finalY + 8
  }
  doc.save(`${fileName}.pdf`)
}

export async function exportExcel(report) {
  const { title, fileName, summary } = report
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const list = tables(report)
  const data = [
    [{ value: `Grand Horizon Hotel - ${title}`, fontWeight: 'bold' }],
    [{ value: `Generated ${stamp()}` }],
    [],
  ]
  if (summary?.length) {
    summary.forEach(([k, v]) => data.push([{ value: k, fontWeight: 'bold' }, { value: String(v ?? '') }]))
    data.push([])
  }
  for (const t of list) {
    if (t.heading) data.push([{ value: t.heading, fontWeight: 'bold' }])
    data.push(t.columns.map((c) => ({ value: c.title, fontWeight: 'bold' })))
    t.rows.forEach((r) => data.push(t.columns.map((c) => ({ value: cell(c, r) }))))
    data.push([])
  }
  const width = Math.max(...list.map((t) => t.columns.length), 2)
  await writeXlsxFile(data, { columns: Array.from({ length: width }, () => ({ width: 24 })) }).toFile(`${fileName}.xlsx`)
}

// One CSV value. Text that a spreadsheet would run as a formula (starting with
// = + - or @) gets a leading apostrophe, so opening the file is safe.
function csvValue(value) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportCsv(report) {
  const { title, fileName, summary } = report
  const lines = [[`Grand Horizon Hotel - ${title}`], [`Generated ${stamp()}`], []]
  if (summary?.length) {
    summary.forEach(([k, v]) => lines.push([k, v]))
    lines.push([])
  }
  for (const t of tables(report)) {
    if (t.heading) lines.push([t.heading])
    lines.push(t.columns.map((c) => c.title))
    t.rows.forEach((r) => lines.push(t.columns.map((c) => cell(c, r))))
    lines.push([])
  }
  // The byte-order mark makes Excel open the file as UTF-8 (peso signs, ñ, etc.).
  const text = '﻿' + lines.map((l) => l.map(csvValue).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
