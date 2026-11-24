import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'

export default function IntegrationsView({ showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('housekeeping') // 'housekeeping' | 'maintenance' | 'sales'
  const [loading, setLoading] = useState(true)

  // 1. Housekeeping state
  const [hkDamages, setHkDamages] = useState([])
  const [selectedDamage, setSelectedDamage] = useState(null)
  const [damageCharge, setDamageCharge] = useState('0')
  const [damageNotes, setDamageNotes] = useState('')
  const [billingDamage, setBillingDamage] = useState(false)

  // 2. Maintenance state
  const [maintenanceData, setMaintenanceData] = useState(null)
  const [showMaintModal, setShowMaintModal] = useState(false)
  const [maintCategory, setMaintCategory] = useState('HVAC Chiller Compressor Maintenance')
  const [maintAmount, setMaintAmount] = useState('15000')
  const [maintNotes, setMaintNotes] = useState('')
  const [submittingMaint, setSubmittingMaint] = useState(false)

  // 3. Sales & Marketing state
  const [salesRecords, setSalesRecords] = useState([])
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [syncingDeal, setSyncingDeal] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [hkRes, maintRes, salesRes] = await Promise.all([
        financeApi.hkDamages('').catch(() => ({ data: [] })),
        financeApi.maintenanceRecords('').catch(() => ({ data: {} })),
        financeApi.salesRecords('').catch(() => ({ data: [] })),
      ])

      setHkDamages(hkRes.data || hkRes || [])
      setMaintenanceData(maintRes.data || maintRes || {})
      setSalesRecords(salesRes.data || salesRes || [])
    } catch (err) {
      console.error('Failed to load integration records:', err)
      showToast('Error connecting to subsystem records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Housekeeping Billing Action
  function openBillDamageModal(dmg) {
    setSelectedDamage(dmg)
    setDamageCharge(String(dmg.estimatedCost || 1500))
    setDamageNotes(`Room condition report: ${dmg.damagedItem}`)
  }

  async function handleBillDamageSubmit(e) {
    e.preventDefault()
    if (!selectedDamage) return
    setBillingDamage(true)
    try {
      const res = await financeApi.billHkDamage({
        incidentId: selectedDamage.id,
        incidentCode: selectedDamage.incidentCode,
        guestName: selectedDamage.guestName,
        roomNumber: selectedDamage.roomNumber,
        reservationCode: selectedDamage.reservationCode,
        damagedItem: selectedDamage.damagedItem,
        chargeAmount: Number(damageCharge),
        notes: damageNotes,
      })

      showToast(res.data?.message || res.message || 'Damage charge successfully billed to guest folio.')
      setSelectedDamage(null)
      loadData()
    } catch (err) {
      console.error('Failed to bill damage:', err)
      showToast(err.message || 'Failed to bill damage.')
    } finally {
      setBillingDamage(false)
    }
  }

  // Maintenance Voucher Submission
  async function handleCreateMaintenanceExpense(e) {
    e.preventDefault()
    setSubmittingMaint(true)
    try {
      await financeApi.createMaintenanceExpense({
        category: maintCategory,
        amount: Number(maintAmount),
        notes: maintNotes || 'Engineering & Maintenance work order reimbursement',
      })
      showToast('Maintenance expense voucher submitted to Finance for approval.')
      setShowMaintModal(false)
      loadData()
    } catch (err) {
      console.error('Failed to create maintenance expense:', err)
      showToast(err.message || 'Failed to record maintenance expense.')
    } finally {
      setSubmittingMaint(false)
    }
  }

  // Sales Sync to Finance Invoice
  async function handleSyncSalesInvoice(deal) {
    setSyncingDeal(true)
    try {
      const res = await financeApi.syncSalesInvoice({
        dealId: deal.id,
        dealCode: deal.dealCode,
        clientName: deal.clientName,
        packageName: deal.packageName,
        contractAmount: Number(deal.contractAmount),
      })
      showToast(res.data?.message || res.message || `Sales deal ${deal.dealCode} successfully connected to Finance invoice.`)
      loadData()
    } catch (err) {
      console.error('Failed to sync sales deal:', err)
      showToast(err.message || 'Failed to sync sales deal.')
    } finally {
      setSyncingDeal(false)
    }
  }

  // Bulk Exporters for each tab
  function handleExportHkCsv() {
    const headers = [
      { key: 'incidentCode', label: 'Incident Code' },
      { key: 'roomNumber', label: 'Room' },
      { key: 'guestName', label: 'Guest Name' },
      { key: 'reservationCode', label: 'Reservation Code' },
      { key: 'damagedItem', label: 'Damaged Item / Inventory' },
      { key: 'damageCategory', label: 'Category' },
      { key: 'estimatedCost', label: 'Estimated Cost (PHP)' },
      { key: 'billingStatus', label: 'Billing Status' },
      { key: 'reportedBy', label: 'Reported By' },
      { key: 'reportedAt', label: 'Reported Timestamp' },
    ]
    exportToCsv('hosis-housekeeping-damage-reports', hkDamages, headers)
    showToast('Exported Housekeeping damage records to CSV.')
  }

  function handleExportMaintCsv() {
    const records = maintenanceData?.records || []
    const headers = [
      { key: 'voucherCode', label: 'Voucher Code' },
      { key: 'department', label: 'Department' },
      { key: 'category', label: 'Maintenance Category' },
      { key: 'amount', label: 'Expense Amount (PHP)' },
      { key: 'status', label: 'Finance Status' },
      { key: 'approvedBy', label: 'Approved By' },
      { key: 'expenseDate', label: 'Expense Date' },
      { key: 'notes', label: 'Notes / Scope' },
    ]
    exportToCsv('hosis-maintenance-finance-records', records, headers)
    showToast('Exported Maintenance finance records to CSV.')
  }

  function handleExportSalesCsv() {
    const headers = [
      { key: 'dealCode', label: 'Deal Code' },
      { key: 'clientName', label: 'Corporate Client' },
      { key: 'packageName', label: 'Package Title' },
      { key: 'contractAmount', label: 'Contract Amount (PHP)' },
      { key: 'eventDate', label: 'Event Date' },
      { key: 'salesRep', label: 'Sales Rep' },
      { key: 'status', label: 'Sales Status' },
      { key: 'invoiceCode', label: 'Linked Finance Invoice' },
    ]
    exportToCsv('hosis-sales-marketing-records', salesRecords, headers)
    showToast('Exported Sales & Marketing records to CSV.')
  }

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Subsystem Integrations</div>

      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Subsystem Integrations</h1>
          <p>Direct connectivity with Housekeeping damage billing, Maintenance finance records, and Sales &amp; Marketing booking folios.</p>
        </div>
      </header>

      {/* Sub-tab Navigation */}
      <section className="fin-toolbar" style={{ marginBottom: '20px', gap: '8px' }}>
        <button
          type="button"
          className={`fin-pill-btn ${activeSubTab === 'housekeeping' ? 'active' : ''}`}
          style={{ padding: '8px 18px', fontSize: '14px' }}
          onClick={() => setActiveSubTab('housekeeping')}
        >
          🧹 Housekeeping Damage Billing ({hkDamages.filter((d) => d.billingStatus === 'PENDING_BILLING').length} Pending)
        </button>
        <button
          type="button"
          className={`fin-pill-btn ${activeSubTab === 'maintenance' ? 'active' : ''}`}
          style={{ padding: '8px 18px', fontSize: '14px' }}
          onClick={() => setActiveSubTab('maintenance')}
        >
          🛠️ Maintenance Finance Records ({maintenanceData?.records?.length || 0})
        </button>
        <button
          type="button"
          className={`fin-pill-btn ${activeSubTab === 'sales' ? 'active' : ''}`}
          style={{ padding: '8px 18px', fontSize: '14px' }}
          onClick={() => setActiveSubTab('sales')}
        >
          📈 Marketing &amp; Sales Connection ({salesRecords.length})
        </button>
      </section>

      {/* TAB 1: Housekeeping Damage Billing from Guest */}
      {activeSubTab === 'housekeeping' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: '#f8fafc' }}>
                Housekeeping Inventory Damage Billed to Guest
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Inspect damaged inventory reported by Housekeeping and generate official billing charges to guest folios.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportHkCsv}
              >
                📥 Bulk Export CSV
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => exportToJson('hosis-hk-damages', hkDamages)}
              >
                📋 Bulk Export JSON
              </button>
            </div>
          </div>

          <div className="fin-surface">
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>INCIDENT CODE</th>
                    <th>ROOM #</th>
                    <th>GUEST NAME</th>
                    <th>DAMAGED ITEM / INVENTORY</th>
                    <th>CATEGORY</th>
                    <th style={{ textAlign: 'right' }}>ESTIMATED COST</th>
                    <th>REPORTED BY</th>
                    <th>BILLING STATUS</th>
                    <th style={{ textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading Housekeeping damage reports...
                      </td>
                    </tr>
                  )}
                  {!loading && hkDamages.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        No Housekeeping damage incidents reported.
                      </td>
                    </tr>
                  )}
                  {!loading && hkDamages.map((dmg) => (
                    <tr key={dmg.id}>
                      <td>
                        <strong style={{ color: '#d4af37' }}>{dmg.incidentCode}</strong>
                      </td>
                      <td>
                        <strong>Room {dmg.roomNumber}</strong>
                        {dmg.reservationCode && <small style={{ display: 'block', color: '#64748b' }}>{dmg.reservationCode}</small>}
                      </td>
                      <td>{dmg.guestName}</td>
                      <td>
                        <strong>{dmg.damagedItem}</strong>
                        {dmg.description && <small style={{ display: 'block', color: '#94a3b8' }}>{dmg.description}</small>}
                      </td>
                      <td>
                        <span className="fin-badge fin-badge-blue">{dmg.damageCategory}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                        ₱{Number(dmg.estimatedCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontSize: '13px' }}>{dmg.reportedBy}</td>
                      <td>
                        <span
                          className={`fin-badge ${
                            dmg.billingStatus === 'BILLED'
                              ? 'fin-badge-green'
                              : dmg.billingStatus === 'WAIVED'
                              ? 'fin-badge-gray'
                              : 'fin-badge-gold'
                          }`}
                        >
                          {dmg.billingStatus === 'BILLED' ? 'Billed to Guest' : 'Pending Billing'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {dmg.billingStatus === 'BILLED' ? (
                          <span style={{ fontSize: '12px', color: '#86efac' }}>✓ Invoiced</span>
                        ) : (
                          <button
                            type="button"
                            className="fin-btn fin-btn-primary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => openBillDamageModal(dmg)}
                          >
                            💳 Bill to Guest Folio
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: Maintenance Need Our Finance Records */}
      {activeSubTab === 'maintenance' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: '#f8fafc' }}>
                Engineering &amp; Maintenance Financial Records
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Maintenance subsystem records: approved work order expenses, parts restocking vouchers, and budget allocations.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportMaintCsv}
                title="Export finance records for the Maintenance team"
              >
                📥 Export for Maintenance (CSV)
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => exportToJson('hosis-maintenance-finance', maintenanceData)}
              >
                📋 Bulk Export JSON
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => setShowMaintModal(true)}
              >
                ➕ Record Maintenance Expense
              </button>
            </div>
          </div>

          {/* Budget Overview Cards */}
          <section className="fin-kpi-grid fin-kpi-grid-4" style={{ marginBottom: '16px' }}>
            <div className="fin-kpi-card">
              <span className="fin-kpi-label">Allocated Maintenance Budget</span>
              <div className="fin-kpi-val" style={{ color: '#38bdf8' }}>
                ₱{Number(maintenanceData?.allocatedBudget || 250000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="fin-kpi-note neutral">Fiscal Year 2026 Facility Allocation</span>
            </div>
            <div className="fin-kpi-card">
              <span className="fin-kpi-label">Total Approved Expenditures</span>
              <div className="fin-kpi-val" style={{ color: '#22c55e' }}>
                ₱{Number(maintenanceData?.totalApproved || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="fin-kpi-note positive">Authorized Engineering Vouchers</span>
            </div>
            <div className="fin-kpi-card">
              <span className="fin-kpi-label">Pending Review</span>
              <div className="fin-kpi-val" style={{ color: '#f59e0b' }}>
                ₱{Number(maintenanceData?.totalPending || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="fin-kpi-note warning">Awaiting Department Head Review</span>
            </div>
            <div className="fin-kpi-card">
              <span className="fin-kpi-label">Remaining Maintenance Budget</span>
              <div className="fin-kpi-val" style={{ color: '#d4af37' }}>
                ₱{Number(maintenanceData?.remainingBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="fin-kpi-note positive">Available balance</span>
            </div>
          </section>

          {/* Maintenance Records Table */}
          <div className="fin-surface">
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>VOUCHER CODE</th>
                    <th>MAINTENANCE CATEGORY / JOB</th>
                    <th>DEPARTMENT</th>
                    <th style={{ textAlign: 'right' }}>AMOUNT</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>APPROVED BY</th>
                    <th>NOTES / WORK ORDER REF</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading Maintenance finance records...
                      </td>
                    </tr>
                  )}
                  {!loading && (maintenanceData?.records || []).length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        No Maintenance finance records found.
                      </td>
                    </tr>
                  )}
                  {!loading && (maintenanceData?.records || []).map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <strong style={{ color: '#d4af37' }}>{rec.voucherCode}</strong>
                      </td>
                      <td>
                        <strong>{rec.category}</strong>
                      </td>
                      <td>
                        <span className="fin-badge fin-badge-blue">{rec.department}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                        ₱{Number(rec.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {rec.expenseDate || '—'}
                      </td>
                      <td>
                        <span
                          className={`fin-badge ${
                            rec.status === 'APPROVED' || rec.status === 'PAID'
                              ? 'fin-badge-green'
                              : 'fin-badge-gold'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td>{rec.approvedBy || 'Pending'}</td>
                      <td style={{ fontSize: '13px', color: '#cbd5e1' }}>{rec.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Marketing and Sales Records Connect to Finance */}
      {activeSubTab === 'sales' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: '#f8fafc' }}>
                Marketing &amp; Sales Revenue Connection
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                Synchronize confirmed sales bookings, corporate event contracts, and wedding banquets into Finance revenue invoices.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportSalesCsv}
              >
                📥 Bulk Export CSV
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => exportToJson('hosis-sales-records', salesRecords)}
              >
                📋 Bulk Export JSON
              </button>
            </div>
          </div>

          <div className="fin-surface">
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>DEAL CODE</th>
                    <th>CORPORATE CLIENT / EVENT</th>
                    <th>PACKAGE TITLE</th>
                    <th>CATEGORY</th>
                    <th style={{ textAlign: 'right' }}>CONTRACT VALUE</th>
                    <th>EVENT DATE</th>
                    <th>SALES REP</th>
                    <th>FINANCE SYNC STATUS</th>
                    <th style={{ textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading Sales &amp; Marketing deals...
                      </td>
                    </tr>
                  )}
                  {!loading && salesRecords.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        No Sales &amp; Marketing deals found.
                      </td>
                    </tr>
                  )}
                  {!loading && salesRecords.map((deal) => (
                    <tr key={deal.id}>
                      <td>
                        <strong style={{ color: '#d4af37' }}>{deal.dealCode}</strong>
                      </td>
                      <td>
                        <strong>{deal.clientName}</strong>
                        {deal.clientEmail && <small style={{ display: 'block', color: '#64748b' }}>{deal.clientEmail}</small>}
                      </td>
                      <td>
                        <strong>{deal.packageName}</strong>
                        {deal.notes && <small style={{ display: 'block', color: '#94a3b8' }}>{deal.notes}</small>}
                      </td>
                      <td>
                        <span className="fin-badge fin-badge-blue">{deal.packageCategory}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                        ₱{Number(deal.contractAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontSize: '13px', color: '#94a3b8' }}>{deal.eventDate || '—'}</td>
                      <td style={{ fontSize: '13px' }}>{deal.salesRep}</td>
                      <td>
                        <span
                          className={`fin-badge ${
                            deal.status === 'INVOICED'
                              ? 'fin-badge-green'
                              : 'fin-badge-gold'
                          }`}
                        >
                          {deal.status === 'INVOICED' ? `Invoiced (${deal.invoiceCode || 'Linked'})` : 'Ready to Connect'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {deal.status === 'INVOICED' ? (
                          <span style={{ fontSize: '12px', color: '#86efac' }}>✓ Connected</span>
                        ) : (
                          <button
                            type="button"
                            className="fin-btn fin-btn-primary"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            disabled={syncingDeal}
                            onClick={() => handleSyncSalesInvoice(deal)}
                          >
                            🔗 Connect to Finance
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Modal: Bill Housekeeping Damage to Guest */}
      {selectedDamage && (
        <div className="fin-modal-overlay" onClick={() => setSelectedDamage(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleBillDamageSubmit}>
              <div className="fin-modal-header">
                <h3 className="fin-modal-title">Bill Housekeeping Damage to Guest</h3>
                <button
                  type="button"
                  className="fin-modal-close-btn"
                  onClick={() => setSelectedDamage(null)}
                >
                  ✕
                </button>
              </div>

              <div className="fin-modal-body">
                <div style={{ background: 'rgba(212, 175, 55, 0.08)', border: '1px solid rgba(212, 175, 55, 0.25)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>INCIDENT CODE</span>
                      <div style={{ fontWeight: 700, color: '#d4af37' }}>{selectedDamage.incidentCode}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>ROOM # &amp; RESERVATION</span>
                      <div style={{ fontWeight: 600 }}>Room {selectedDamage.roomNumber} ({selectedDamage.reservationCode || 'Checked out'})</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>GUEST NAME</span>
                      <div style={{ fontWeight: 600 }}>{selectedDamage.guestName}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>DAMAGED ITEM / CATEGORY</span>
                      <div style={{ fontWeight: 600 }}>{selectedDamage.damagedItem} ({selectedDamage.damageCategory})</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Damage Charge Amount (PHP) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="fin-input"
                    style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}
                    required
                    value={damageCharge}
                    onChange={(e) => setDamageCharge(e.target.value)}
                  />
                  <small style={{ color: '#94a3b8' }}>
                    12% VAT will be calculated and added to the official billing folio.
                  </small>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Folio Notes / Damage Justification</label>
                  <textarea
                    className="fin-input"
                    rows="3"
                    value={damageNotes}
                    onChange={(e) => setDamageNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setSelectedDamage(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                  disabled={billingDamage}
                >
                  {billingDamage ? 'Invoicing…' : '💳 Generate & Issue Damage Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Maintenance Expense Voucher */}
      {showMaintModal && (
        <div className="fin-modal-overlay" onClick={() => setShowMaintModal(false)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateMaintenanceExpense}>
              <div className="fin-modal-header">
                <h3 className="fin-modal-title">Record Maintenance Expense Voucher</h3>
                <button
                  type="button"
                  className="fin-modal-close-btn"
                  onClick={() => setShowMaintModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="fin-modal-body">
                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Maintenance Job / Category *</label>
                  <input
                    type="text"
                    className="fin-input"
                    required
                    value={maintCategory}
                    onChange={(e) => setMaintCategory(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Expense Amount (PHP) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="fin-input"
                    required
                    value={maintAmount}
                    onChange={(e) => setMaintAmount(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Work Order Reference / Technician Scope</label>
                  <textarea
                    className="fin-input"
                    rows="3"
                    placeholder="Enter technician work order ref, parts replaced, contractor name..."
                    value={maintNotes}
                    onChange={(e) => setMaintNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowMaintModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                  disabled={submittingMaint}
                >
                  {submittingMaint ? 'Submitting…' : '✓ Submit to Finance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
