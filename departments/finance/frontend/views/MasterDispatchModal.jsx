import { useState } from 'react'
import { financeApi } from '../financeApi.js'
import { exportToJson } from '../utils/exportHelper'

const DATA_ENTITIES = [
  { id: 'invoices', label: 'Guest & Corporate Folios', desc: 'Invoices, room charges, and balance receivables' },
  { id: 'payments', label: 'Customer Settlements', desc: 'Cash, card, GCash, bank transfer receipts' },
  { id: 'expenses', label: 'Operating Expenses', desc: 'Departmental OpEx vouchers and supplier payouts' },
  { id: 'payroll', label: 'Staff Payroll Records', desc: 'Gross earnings, statutory deductions, net wages' },
  { id: 'leave', label: 'Staff Leave Filings', desc: 'Vacation, sick, statutory leaves, and compensations' },
  { id: 'hkDamages', label: 'Housekeeping Room Damages', desc: 'Damaged item recovery billed to guest stays' },
  { id: 'sales', label: 'Marketing & Sales Deals', desc: 'Corporate contracts and milestone folios' },
  { id: 'maintenance', label: 'Maintenance Engineering', desc: 'Work order vouchers and CapEx asset tracking' },
  { id: 'audit', label: 'Finance Audit Trail', desc: 'Recorded Finance actions' },
]

const SUBSYSTEM_DESTINATIONS = [
  {
    id: 'SUPER_ADMIN',
    label: 'Super Admin Central Repository',
    desc: 'Project Manager universal oversight and multi-department records master',
    recommended: true,
  },
  {
    id: 'FRONT_OFFICE',
    label: 'Front Office PMS',
    desc: 'Room folios, active guest billings, and cash collections',
  },
  {
    id: 'HOUSEKEEPING',
    label: 'Housekeeping Department',
    desc: 'Damage restitution vouchers and inventory restocking releases',
  },
  {
    id: 'MAINTENANCE',
    label: 'Maintenance & Engineering',
    desc: 'Facility work order reimbursements and OpEx/CapEx status',
  },
  {
    id: 'SALES_MARKETING',
    label: 'Sales & Marketing',
    desc: 'Corporate banquet contracts and City Ledger accounts receivable',
  },
  {
    id: 'HUMAN_RESOURCES',
    label: 'Human Resources (HR)',
    desc: 'Payroll salary disbursements and staff leave compensation records',
  },
]

export default function MasterDispatchModal({ isOpen, onClose, showToast }) {
  const [selectedEntities, setSelectedEntities] = useState(DATA_ENTITIES.map((d) => d.id))
  const [selectedDestinations, setSelectedDestinations] = useState(SUBSYSTEM_DESTINATIONS.map((s) => s.id))
  const [dispatchMemo, setDispatchMemo] = useState('Master financial reconciliation & multi-department sync')
  const [exporting, setExporting] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResults, setDispatchResults] = useState(null)

  if (!isOpen) return null

  function toggleEntity(id) {
    if (selectedEntities.includes(id)) {
      setSelectedEntities(selectedEntities.filter((e) => e !== id))
    } else {
      setSelectedEntities([...selectedEntities, id])
    }
  }

  function selectAllEntities(select) {
    setSelectedEntities(select ? DATA_ENTITIES.map((d) => d.id) : [])
  }

  function toggleDestination(id) {
    if (selectedDestinations.includes(id)) {
      setSelectedDestinations(selectedDestinations.filter((d) => d !== id))
    } else {
      setSelectedDestinations([...selectedDestinations, id])
    }
  }

  function selectAllDestinations(select) {
    setSelectedDestinations(select ? SUBSYSTEM_DESTINATIONS.map((s) => s.id) : [])
  }

  async function handleExport(format = 'json') {
    if (!selectedEntities.length) {
      showToast?.('Select at least one data category to export.')
      return
    }
    setExporting(true)
    try {
      const res = await financeApi.exportData('all', format)
      if (format === 'json') {
        const fullPayload = res.data || res
        // Filter by selected entities if not all selected
        const filteredPayload = {
          subsystem: 'FINANCE_AND_ACCOUNTING',
          exportedAt: new Date().toISOString(),
          selectedCategories: selectedEntities,
        }
        selectedEntities.forEach((ent) => {
          if (ent === 'invoices') filteredPayload.invoices = fullPayload.invoices || []
          if (ent === 'payments') filteredPayload.payments = fullPayload.payments || []
          if (ent === 'expenses') filteredPayload.expenses = fullPayload.expenses || []
          if (ent === 'payroll') filteredPayload.payroll = fullPayload.payroll || []
          if (ent === 'leave') filteredPayload.leaveRequests = fullPayload.leaveRequests || []
          if (ent === 'hkDamages') filteredPayload.housekeepingDamages = fullPayload.housekeepingDamages || []
          if (ent === 'sales') filteredPayload.salesMarketingDeals = fullPayload.salesMarketingDeals || []
          if (ent === 'maintenance') filteredPayload.maintenanceFinance = fullPayload.maintenanceFinance || {}
          if (ent === 'audit') filteredPayload.auditLog = fullPayload.auditLog || []
        })

        exportToJson(`hosis-finance-bulk-export-${Date.now()}`, filteredPayload)
      } else {
        const csvData = typeof res === 'string' ? res : res.data || ''
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `hosis-finance-bulk-export-${Date.now()}.csv`
        link.click()
        URL.revokeObjectURL(url)
      }
      showToast?.(`Selected financial data successfully exported as ${format.toUpperCase()}.`)
    } catch (err) {
      console.error('Bulk export failed:', err)
      showToast?.('Error generating bulk data export.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDispatch(e) {
    e.preventDefault()
    if (!selectedDestinations.length) {
      showToast?.('Select at least one destination subsystem or Super Admin.')
      return
    }
    if (!selectedEntities.length) {
      showToast?.('Select at least one data category to include in the dispatch.')
      return
    }

    setDispatching(true)
    try {
      const res = await financeApi.dispatchSubsystems({
        targetSubsystems: selectedDestinations,
        includedEntities: selectedEntities,
        notes: dispatchMemo,
      })
      const data = res.data || res
      setDispatchResults(data.dispatches || [])
      showToast?.(`Recorded summaries for ${selectedDestinations.length} destination(s) in Finance Audit Trail.`)
    } catch (err) {
      console.error('Dispatch failed:', err)
      showToast?.(err.message || 'Error dispatching data to subsystems.')
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className="fin-modal-overlay" onClick={onClose}>
      <div className="fin-modal-window" style={{ maxWidth: '780px', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="fin-modal-header">
          <div>
            <h3 className="fin-modal-title">Mass Bulk Export &amp; Subsystem Dispatch Hub</h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Universal export &amp; multi-subsystem data transmission for Department Head &amp; Super Admin
            </span>
          </div>
          <button type="button" className="fin-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleDispatch}>
          <div className="fin-modal-body">
            {/* STEP 1: SELECT DATA ENTITIES TO EXPORT / DISPATCH */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>1. Select Financial Ledgers &amp; Data Records</strong>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                    Choose the exact records to include in the file export or send to other departments:
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ fontSize: '10.5px', padding: '3px 8px' }}
                    onClick={() => selectAllEntities(true)}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ fontSize: '10.5px', padding: '3px 8px' }}
                    onClick={() => selectAllEntities(false)}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                {DATA_ENTITIES.map((ent) => {
                  const isChecked = selectedEntities.includes(ent.id)
                  return (
                    <label
                      key={ent.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: isChecked ? '1.5px solid #4334ad' : '1px solid #cbd5e1',
                        background: isChecked ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEntity(ent.id)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <strong style={{ fontSize: '11.5px', color: '#0f172a', display: 'block' }}>{ent.label}</strong>
                        <span style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.2, display: 'block' }}>{ent.desc}</span>
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Direct Download Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4334ad' }}>
                  {selectedEntities.length} of {DATA_ENTITIES.length} Data Sets Selected
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11.5px' }}
                    disabled={exporting}
                    onClick={() => handleExport('csv')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {exporting ? 'Exporting...' : 'Export Selected (CSV)'}
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11.5px' }}
                    disabled={exporting}
                    onClick={() => handleExport('json')}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    {exporting ? 'Packaging...' : 'Export Selected (JSON)'}
                  </button>
                </div>
              </div>
            </div>

            {/* STEP 2: SELECT RECIPIENT SUBSYSTEMS OR SUPER ADMIN */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>2. Record summaries for other departments or Admin</strong>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                    Push the selected financial records to connected subsystems and the project manager superadmin:
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ fontSize: '10.5px', padding: '3px 8px' }}
                    onClick={() => selectAllDestinations(true)}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="fin-btn fin-btn-secondary"
                    style={{ fontSize: '10.5px', padding: '3px 8px' }}
                    onClick={() => selectAllDestinations(false)}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '14px' }}>
                {SUBSYSTEM_DESTINATIONS.map((dest) => {
                  const isChecked = selectedDestinations.includes(dest.id)
                  return (
                    <label
                      key={dest.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: isChecked ? '1.5px solid #4334ad' : '1px solid #cbd5e1',
                        background: isChecked ? '#f5f3ff' : '#fafafa',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDestination(dest.id)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '12px', color: '#0f172a' }}>{dest.label}</strong>
                          {dest.recommended && (
                            <span style={{ fontSize: '9px', fontWeight: 700, background: '#4334ad', color: '#ffffff', padding: '1px 5px', borderRadius: '4px' }}>
                              SUPER ADMIN
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>{dest.desc}</span>
                      </div>
                    </label>
                  )
                })}
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                  DISPATCH MEMO / AUDIT REASON
                </label>
                <input
                  type="text"
                  className="fin-input"
                  value={dispatchMemo}
                  onChange={(e) => setDispatchMemo(e.target.value)}
                  placeholder="e.g. Periodic financial reconciliation & superadmin audit package"
                  style={{ padding: '8px 12px', fontSize: '12px' }}
                />
              </div>

              <button
                type="submit"
                className="fin-btn fin-btn-primary"
                disabled={dispatching || selectedDestinations.length === 0}
                style={{ width: '100%', minHeight: '38px', fontSize: '12.5px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                {dispatching
                  ? 'Recording summaries...'
                  : `Send Selected Data to ${selectedDestinations.length} Destination(s) (including Super Admin)`}
              </button>
            </div>

            {/* DISPATCH CONFIRMATION FEEDBACK */}
            {dispatchResults && dispatchResults.length > 0 && (
              <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '13px' }}>
                    ✓ Subsystem &amp; Super Admin Synchronization Completed
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {dispatchResults.map((r, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#1e293b', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '4px' }}>
                      <span><strong>{r.subsystem}</strong>: Status {r.status}</span>
                      <span style={{ color: '#64748b' }}>
                        {Object.entries(r.summary || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="fin-modal-footer">
            <button type="button" className="fin-btn fin-btn-secondary" onClick={onClose}>
              Close Hub
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
