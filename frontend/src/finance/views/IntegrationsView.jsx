import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'
import { exportToCsv, exportToJson } from '../utils/exportHelper'
import MasterDispatchModal from './MasterDispatchModal'

export default function IntegrationsView({ showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('housekeeping') // 'housekeeping' | 'maintenance' | 'sales'
  const [loading, setLoading] = useState(true)

  // 1. Housekeeping state
  const [hkDamages, setHkDamages] = useState([])
  const [selectedDamage, setSelectedDamage] = useState(null)
  const [damageCharge, setDamageCharge] = useState('0')
  const [damageNotes, setDamageNotes] = useState('')
  const [attachToFolio, setAttachToFolio] = useState(true)
  const [billingDamage, setBillingDamage] = useState(false)

  // 2. Maintenance state
  const [maintenanceData, setMaintenanceData] = useState(null)
  const [showMaintModal, setShowMaintModal] = useState(false)
  const [maintCategory, setMaintCategory] = useState('HVAC Chiller Compressor Maintenance')
  const [maintAmount, setMaintAmount] = useState('15000')
  const [maintNotes, setMaintNotes] = useState('')
  const [workOrderId, setWorkOrderId] = useState('WO-2026-ENG-089')
  const [expenseClassification, setExpenseClassification] = useState('OPEX')
  const [submittingMaint, setSubmittingMaint] = useState(false)

  // 3. Sales & Marketing state
  const [salesRecords, setSalesRecords] = useState([])
  const [selectedDealForMilestone, setSelectedDealForMilestone] = useState(null)
  const [milestoneStage, setMilestoneStage] = useState('DEPOSIT_20')
  const [syncingDeal, setSyncingDeal] = useState(false)

  // 4. City Ledger Aging state
  const [cityLedger, setCityLedger] = useState(null)
  const [loadingAging, setLoadingAging] = useState(false)

  // 5. Master Bulk Export & Subsystem Dispatch state
  const [showDispatchModal, setShowDispatchModal] = useState(false)

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

  async function loadCityLedgerAging() {
    setLoadingAging(true)
    try {
      const res = await financeApi.cityLedgerAging()
      setCityLedger(res.data || res || null)
    } catch (err) {
      console.error('Failed to load City Ledger Aging:', err)
    } finally {
      setLoadingAging(false)
    }
  }

  useEffect(() => {
    loadData()
    loadCityLedgerAging()
  }, [])

  // Housekeeping Billing Action
  function openBillDamageModal(dmg) {
    setSelectedDamage(dmg)
    setDamageCharge(String(dmg.estimatedCost || 1500))
    setDamageNotes(`Room condition report: ${dmg.damagedItem}`)
    setAttachToFolio(true)
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
        guestFolioAttached: attachToFolio,
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
        workOrderId: workOrderId || null,
        expenseClassification,
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

  // Sales Sync to Finance Invoice with Milestone Invoicing
  function openMilestoneModal(deal) {
    setSelectedDealForMilestone(deal)
    setMilestoneStage('DEPOSIT_20')
  }

  async function handleSyncSalesMilestoneSubmit(e) {
    e.preventDefault()
    if (!selectedDealForMilestone) return
    setSyncingDeal(true)
    try {
      const deal = selectedDealForMilestone
      const res = await financeApi.syncSalesInvoice({
        dealId: deal.id,
        dealCode: deal.dealCode,
        clientName: deal.clientName,
        packageName: deal.packageName,
        contractAmount: Number(deal.contractAmount),
        milestoneStage,
      })
      showToast(res.data?.message || res.message || `Sales deal ${deal.dealCode} successfully connected to Finance milestone invoice.`)
      setSelectedDealForMilestone(null)
      loadData()
      loadCityLedgerAging()
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
      { key: 'guestFolioAttached', label: 'Folio Attached' },
      { key: 'inventoryWrittenOff', label: 'Inventory Written Off' },
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
      { key: 'workOrderId', label: 'Work Order ID' },
      { key: 'expenseClassification', label: 'Classification' },
      { key: 'approvalTier', label: 'Approval Tier' },
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
      { key: 'milestoneStage', label: 'Milestone Stage' },
      { key: 'contractAmount', label: 'Contract Amount (PHP)' },
      { key: 'eventDate', label: 'Event Date' },
      { key: 'salesRep', label: 'Sales Rep' },
      { key: 'status', label: 'Sales Status' },
      { key: 'invoiceCode', label: 'Linked Finance Invoice' },
    ]
    exportToCsv('hosis-sales-marketing-records', salesRecords, headers)
    showToast('Exported Sales & Marketing records to CSV.')
  }

  function handleExportCityLedgerCsv() {
    const debtors = cityLedger?.debtors || []
    const headers = [
      { key: 'invoiceCode', label: 'Invoice Code' },
      { key: 'clientName', label: 'Corporate Client / Debtor' },
      { key: 'totalAmount', label: 'Total Invoiced (PHP)' },
      { key: 'paidAmount', label: 'Paid Collections (PHP)' },
      { key: 'balanceDue', label: 'Outstanding Balance (PHP)' },
      { key: 'issueDate', label: 'Issue Date' },
      { key: 'daysPastDue', label: 'Days Past Due' },
      { key: 'agingBucket', label: 'Aging Category' },
    ]
    exportToCsv('hosis-city-ledger-ar-aging', debtors, headers)
    showToast('Exported City Ledger A/R Aging report to CSV.')
  }

  // Calculated tier preview for maintenance modal
  const computedTier = Number(maintAmount) <= 10000
    ? { tier: 'AUTO', label: 'Auto Approval (Tier 1: ≤ ₱10,000)', color: '#22c55e' }
    : Number(maintAmount) <= 50000
    ? { tier: 'STANDARD', label: 'Standard Approval (Tier 2: ₱10,001 - ₱50,000)', color: '#38bdf8' }
    : { tier: 'EXECUTIVE_APPROVAL', label: 'Executive Board Approval (Tier 3: > ₱50,000)', color: '#f59e0b' }

  // Milestone multiplier calculation
  const getMilestoneCalc = (stage, total) => {
    let pct = 0.20
    let label = '20% Initial Reservation Deposit'
    if (stage === 'MIDTERM_50') {
      pct = 0.50
      label = '50% Mid-Term Event Prep Milestone'
    } else if (stage === 'BALANCE_30') {
      pct = 0.30
      label = '30% Final Event Day Settlement Balance'
    } else if (stage === 'FULL_PAYMENT') {
      pct = 1.00
      label = '100% Upfront Full Contract'
    }
    const subtotal = Math.round(Number(total) * pct * 100) / 100
    const vat = Math.round(subtotal * 0.12 * 100) / 100
    const totalDue = subtotal + vat
    return { pct, label, subtotal, vat, totalDue }
  }

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Subsystem Integrations</div>

      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Subsystem Integrations</h1>
          <p>Direct connectivity with Housekeeping damage billing, Maintenance finance records, and Sales &amp; Marketing booking folios.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={() => {
              setShowDispatchModal(true)
              setDispatchResults(null)
            }}
            title="Export master ledger or dispatch data to all other hotel subsystems"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Master Bulk Export &amp; Subsystem Dispatch
          </button>
        </div>
      </header>

      {/* Sub-tab Navigation - Minimalist Segmented Tabs */}
      <div className="filter-tabs" role="tablist" style={{ marginBottom: '20px' }}>
        <button
          type="button"
          className={activeSubTab === 'housekeeping' ? 'tab-active' : ''}
          onClick={() => setActiveSubTab('housekeeping')}
        >
          Housekeeping Damage Billing ({hkDamages.filter((d) => d.billingStatus === 'PENDING_BILLING').length} Pending)
        </button>
        <button
          type="button"
          className={activeSubTab === 'maintenance' ? 'tab-active' : ''}
          onClick={() => setActiveSubTab('maintenance')}
        >
          Maintenance Finance Records ({maintenanceData?.records?.length || 0})
        </button>
        <button
          type="button"
          className={activeSubTab === 'sales' ? 'tab-active' : ''}
          onClick={() => setActiveSubTab('sales')}
        >
          Marketing &amp; Sales Connection ({salesRecords.length})
        </button>
      </div>

      {/* TAB 1: Housekeeping Damage Billing from Guest */}
      {activeSubTab === 'housekeeping' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--fin-text-heading, #0f172a)' }}>
                Housekeeping Inventory Damage Billed to Guest
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Inspect damaged inventory reported by Housekeeping and generate official billing charges linked to active Front Office guest stay folios.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportHkCsv}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => exportToJson('hosis-hk-damages', hkDamages)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export JSON
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
                    <th>FOLIO LINK</th>
                    <th>INVENTORY STATUS</th>
                    <th>BILLING STATUS</th>
                    <th style={{ textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading Housekeeping damage reports...
                      </td>
                    </tr>
                  )}
                  {!loading && hkDamages.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
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
                      <td>
                        <span className={`fin-badge ${dmg.guestFolioAttached ? 'fin-badge-green' : 'fin-badge-gray'}`}>
                          {dmg.guestFolioAttached ? 'Folio Linked' : 'Unlinked'}
                        </span>
                      </td>
                      <td>
                        <span className={`fin-badge ${dmg.inventoryWrittenOff ? 'fin-badge-green' : 'fin-badge-gold'}`}>
                          {dmg.inventoryWrittenOff ? '✓ Restocked' : 'Restock Pending'}
                        </span>
                      </td>
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
                          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ Invoiced</span>
                        ) : (
                          <button
                            type="button"
                            className="fin-btn fin-btn-primary"
                            style={{ padding: '5px 12px', fontSize: '11px' }}
                            onClick={() => openBillDamageModal(dmg)}
                          >
                            Bill to Guest Folio
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--fin-text-heading, #0f172a)' }}>
                Engineering &amp; Maintenance Financial Records
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Maintenance records: OpEx vs CapEx asset tracking, tiered approvals, and facility budget allocations.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportMaintCsv}
                title="Export finance records for the Maintenance team"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export Maintenance CSV
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => exportToJson('hosis-maintenance-finance', maintenanceData)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export JSON
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => setShowMaintModal(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Record Maintenance Expense
              </button>
            </div>
          </div>

          {/* Budget & CapEx/OpEx Breakdown Cards */}
          <section className="fin-kpi-grid fin-kpi-grid-4" style={{ marginBottom: '16px' }}>
            <div className="fin-kpi-card">
              <span className="fin-kpi-label">Allocated Maintenance Budget</span>
              <div className="fin-kpi-val" style={{ color: '#38bdf8' }}>
                ₱{Number(maintenanceData?.allocatedBudget || 250000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="fin-kpi-note neutral">FY 2026 Facility Allocation</span>
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
                    <th>VOUCHER / WORK ORDER</th>
                    <th>MAINTENANCE CATEGORY / JOB</th>
                    <th>CLASSIFICATION</th>
                    <th>APPROVAL TIER</th>
                    <th style={{ textAlign: 'right' }}>AMOUNT</th>
                    <th>DATE</th>
                    <th>STATUS</th>
                    <th>APPROVED BY</th>
                    <th>NOTES / SCOPE</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        Loading Maintenance finance records...
                      </td>
                    </tr>
                  )}
                  {!loading && (maintenanceData?.records || []).length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        No Maintenance finance records found.
                      </td>
                    </tr>
                  )}
                  {!loading && (maintenanceData?.records || []).map((rec) => (
                    <tr key={rec.id}>
                      <td>
                        <strong style={{ color: '#d4af37' }}>{rec.voucherCode}</strong>
                        {rec.workOrderId && (
                          <small style={{ display: 'block', color: '#38bdf8', fontWeight: 600 }}>
                            WO: {rec.workOrderId}
                          </small>
                        )}
                      </td>
                      <td>
                        <strong>{rec.category}</strong>
                      </td>
                      <td>
                        <span className={`fin-badge ${rec.expenseClassification === 'CAPEX' ? 'fin-badge-gold' : 'fin-badge-blue'}`}>
                          {rec.expenseClassification || 'OPEX'}
                        </span>
                      </td>
                      <td>
                        <span className={`fin-badge ${rec.approvalTier === 'EXECUTIVE_APPROVAL' ? 'fin-badge-gold' : rec.approvalTier === 'AUTO' ? 'fin-badge-green' : 'fin-badge-blue'}`}>
                          {rec.approvalTier === 'EXECUTIVE_APPROVAL' ? 'Executive Board' : rec.approvalTier === 'AUTO' ? 'Auto Tier 1' : 'Standard'}
                        </span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ fontSize: '18px', margin: 0, color: 'var(--fin-text-heading, #0f172a)' }}>
                Marketing &amp; Sales Revenue &amp; Corporate City Ledger
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Milestone contract invoicing (20% deposit, 50% prep, 30% balance, or full) and Corporate Accounts Receivable Aging.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportSalesCsv}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export Deals CSV
              </button>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={handleExportCityLedgerCsv}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export City Ledger CSV
              </button>
            </div>
          </div>

          {/* Sales Deals Table */}
          <div className="fin-surface" style={{ marginBottom: '24px' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--fin-text-heading, #0f172a)' }}>Confirmed Sales Deals &amp; Banquet Contracts</h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Select deal to invoice by milestone</span>
            </div>
            <div className="fin-table-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>DEAL CODE</th>
                    <th>CORPORATE CLIENT / EVENT</th>
                    <th>PACKAGE TITLE</th>
                    <th>STAGE</th>
                    <th style={{ textAlign: 'right' }}>CONTRACT VALUE</th>
                    <th>EVENT DATE</th>
                    <th>SALES REP</th>
                    <th>FINANCE STATUS</th>
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
                        <span className="fin-badge fin-badge-blue">{deal.milestoneStage || 'DEPOSIT_20'}</span>
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
                          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ Connected</span>
                        ) : (
                          <button
                            type="button"
                            className="fin-btn fin-btn-primary"
                            style={{ padding: '5px 12px', fontSize: '11px' }}
                            disabled={syncingDeal}
                            onClick={() => openMilestoneModal(deal)}
                          >
                            Milestone Invoice
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* City Ledger Corporate Accounts Receivable Aging Breakdown */}
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', margin: 0, color: 'var(--fin-text-heading, #0f172a)' }}>
                  City Ledger Accounts Receivable (A/R) Aging Analysis
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Aging buckets for corporate clients, travel agents, and banquets to minimize default risk.
                </p>
              </div>
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                style={{ fontSize: '11.5px', padding: '6px 14px' }}
                onClick={loadCityLedgerAging}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                Refresh Aging
              </button>
            </div>

            {/* Aging Summary Buckets Grid */}
            <section className="fin-kpi-grid fin-kpi-grid-4" style={{ marginBottom: '16px' }}>
              <div className="fin-kpi-card" style={{ borderLeft: '4px solid #22c55e' }}>
                <span className="fin-kpi-label">Current (0–30 Days)</span>
                <div className="fin-kpi-val" style={{ color: '#22c55e' }}>
                  ₱{Number(cityLedger?.agingSummary?.current_0_30 || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="fin-kpi-note positive">Standard credit terms</span>
              </div>
              <div className="fin-kpi-card" style={{ borderLeft: '4px solid #38bdf8' }}>
                <span className="fin-kpi-label">Past Due (31–60 Days)</span>
                <div className="fin-kpi-val" style={{ color: '#38bdf8' }}>
                  ₱{Number(cityLedger?.agingSummary?.past_31_60 || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="fin-kpi-note warning">Payment reminder dispatched</span>
              </div>
              <div className="fin-kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                <span className="fin-kpi-label">Aging (61–90 Days)</span>
                <div className="fin-kpi-val" style={{ color: '#f59e0b' }}>
                  ₱{Number(cityLedger?.agingSummary?.past_61_90 || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="fin-kpi-note warning">Escalated to collections</span>
              </div>
              <div className="fin-kpi-card" style={{ borderLeft: '4px solid #ef4444' }}>
                <span className="fin-kpi-label">Overdue (90+ Days)</span>
                <div className="fin-kpi-val" style={{ color: '#ef4444' }}>
                  ₱{Number(cityLedger?.agingSummary?.overdue_90_plus || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <span className="fin-kpi-note" style={{ color: '#ef4444' }}>Critical legal/recovery hold</span>
              </div>
            </section>

            {/* City Ledger Debtors Table */}
            <div className="fin-surface">
              <div className="fin-table-scroll">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>INVOICE #</th>
                      <th>CORPORATE DEBTOR / CLIENT</th>
                      <th>INVOICE TYPE</th>
                      <th style={{ textAlign: 'right' }}>TOTAL BILLED</th>
                      <th style={{ textAlign: 'right' }}>PAID</th>
                      <th style={{ textAlign: 'right' }}>BALANCE DUE</th>
                      <th>DAYS OVERDUE</th>
                      <th>AGING BUCKET</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingAging && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                          Calculating City Ledger aging matrix...
                        </td>
                      </tr>
                    )}
                    {!loadingAging && (!cityLedger?.debtors || cityLedger.debtors.length === 0) && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                          No outstanding City Ledger receivables. All corporate folios settled.
                        </td>
                      </tr>
                    )}
                    {!loadingAging && (cityLedger?.debtors || []).map((d) => (
                      <tr key={d.id}>
                        <td>
                          <strong style={{ color: '#d4af37' }}>{d.invoiceCode}</strong>
                        </td>
                        <td>
                          <strong>{d.clientName}</strong>
                        </td>
                        <td>
                          <span className="fin-badge fin-badge-blue">{d.invoiceType || 'STANDARD'}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          ₱{Number(d.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', color: '#86efac' }}>
                          ₱{Number(d.paidAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: Number(d.daysPastDue) > 60 ? '#ef4444' : '#f59e0b' }}>
                          ₱{Number(d.balanceDue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <strong>{d.daysPastDue} days</strong>
                        </td>
                        <td>
                          <span
                            className={`fin-badge ${
                              d.agingBucket === 'CURRENT_0_30'
                                ? 'fin-badge-green'
                                : d.agingBucket === 'PAST_31_60'
                                ? 'fin-badge-blue'
                                : d.agingBucket === 'PAST_61_90'
                                ? 'fin-badge-gold'
                                : 'fin-badge-gray'
                            }`}
                          >
                            {d.agingBucket === 'CURRENT_0_30'
                              ? '0–30 Days'
                              : d.agingBucket === 'PAST_31_60'
                              ? '31–60 Days'
                              : d.agingBucket === 'PAST_61_90'
                              ? '61–90 Days'
                              : '90+ Days Overdue'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#f8fafc' }}>
                    <input
                      type="checkbox"
                      checked={attachToFolio}
                      onChange={(e) => setAttachToFolio(e.target.checked)}
                    />
                    Attach directly to active guest stay folio in Front Office
                  </label>
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
                  {billingDamage ? 'Invoicing…' : 'Generate & Issue Damage Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Maintenance Expense Voucher with Work Order & CapEx/OpEx */}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label className="fin-label">Work Order Reference *</label>
                    <input
                      type="text"
                      className="fin-input"
                      placeholder="e.g. WO-2026-ENG-089"
                      required
                      value={workOrderId}
                      onChange={(e) => setWorkOrderId(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="fin-label">Expense Classification *</label>
                    <select
                      className="fin-input"
                      value={expenseClassification}
                      onChange={(e) => setExpenseClassification(e.target.value)}
                    >
                      <option value="OPEX">OPEX (Operating Expenditure)</option>
                      <option value="CAPEX">CAPEX (Capital Expenditure / Asset)</option>
                    </select>
                  </div>
                </div>

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
                  <div style={{ marginTop: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#94a3b8' }}>Governance Tier:</span>
                    <strong style={{ color: computedTier.color }}>{computedTier.label}</strong>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Technician Scope / Contractor Details</label>
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

      {/* Modal: Sales Milestone Invoicing */}
      {selectedDealForMilestone && (
        <div className="fin-modal-overlay" onClick={() => setSelectedDealForMilestone(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSyncSalesMilestoneSubmit}>
              <div className="fin-modal-header">
                <h3 className="fin-modal-title">Connect Sales Deal to Milestone Invoice</h3>
                <button
                  type="button"
                  className="fin-modal-close-btn"
                  onClick={() => setSelectedDealForMilestone(null)}
                >
                  ✕
                </button>
              </div>

              <div className="fin-modal-body">
                <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>DEAL CODE</span>
                      <div style={{ fontWeight: 700, color: '#38bdf8' }}>{selectedDealForMilestone.dealCode}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>TOTAL CONTRACT VALUE</span>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>
                        ₱{Number(selectedDealForMilestone.contractAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>CLIENT NAME</span>
                      <div style={{ fontWeight: 600 }}>{selectedDealForMilestone.clientName}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>EVENT / PACKAGE</span>
                      <div style={{ fontWeight: 600 }}>{selectedDealForMilestone.packageName}</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="fin-label">Select Invoicing Milestone Stage *</label>
                  <select
                    className="fin-input"
                    value={milestoneStage}
                    onChange={(e) => setMilestoneStage(e.target.value)}
                  >
                    <option value="DEPOSIT_20">20% Initial Reservation Deposit</option>
                    <option value="MIDTERM_50">50% Mid-Term Event Prep Milestone</option>
                    <option value="BALANCE_30">30% Final Event Day Settlement Balance</option>
                    <option value="FULL_PAYMENT">100% Upfront Full Contract Invoice</option>
                  </select>
                </div>

                {/* Calculation Breakdown Preview */}
                {(() => {
                  const calc = getMilestoneCalc(milestoneStage, selectedDealForMilestone.contractAmount)
                  return (
                    <div style={{ background: '#111827', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                        <span style={{ color: '#94a3b8' }}>Milestone Share ({(calc.pct * 100).toFixed(0)}%):</span>
                        <strong>₱{calc.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                        <span style={{ color: '#94a3b8' }}>12% Government VAT:</span>
                        <strong style={{ color: '#f59e0b' }}>₱{calc.vat.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '14px' }}>
                        <strong style={{ color: '#d4af37' }}>Total Milestone Due:</strong>
                        <strong style={{ color: '#22c55e', fontSize: '16px' }}>
                          ₱{calc.totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setSelectedDealForMilestone(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                  disabled={syncingDeal}
                >
                  {syncingDeal ? 'Invoicing…' : 'Generate Milestone Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Master Bulk Export & Subsystem Dispatch Hub */}
      <MasterDispatchModal
        isOpen={showDispatchModal}
        onClose={() => setShowDispatchModal(false)}
        showToast={showToast}
      />
    </>
  )
}
