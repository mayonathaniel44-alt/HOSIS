import { useEffect, useState } from 'react'
import { financeApi } from '../financeApi.js'
import { peso } from './peso.js'

export default function ExpensesView({ showToast }) {
  const [expenses, setExpenses] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    department: 'Housekeeping',
    category: '',
    amount: '',
    notes: '',
  })

  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    financeApi.expenses()
      .then((records) => {
        if (!active) return
        const mapped = records.map((r) => ({
          id: r.voucherCode || `EXP-${r.id}`,
          dbId: r.id,
          date: r.expenseDate || 'Recent',
          department: r.department,
          category: r.category,
          amount: Number(r.amount),
          status: r.status === 'APPROVED' ? 'Approved' : 'Pending',
          approvedBy: r.approvedBy || 'Pending review',
        }))
        setExpenses(mapped)
      })
      .catch((error) => { if (active) showToast(error.message) })
    return () => { active = false }
  }, [revision, showToast])

  async function saveExpense(action, message) {
    if (busy) return
    setBusy(true)
    try {
      const result = await action()
      setRevision((value) => value + 1)
      showToast(result.voucherCode + message)
      return true
    } catch (error) {
      showToast(error.message)
    } finally {
      setBusy(false)
    }
  }

  function handleApprove(id) {
    const expense = expenses.find((record) => record.id === id)
    if (expense) void saveExpense(() => financeApi.approveExpense(expense.dbId), ' approved.')
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (await saveExpense(() => financeApi.createExpense(form), ' submitted for approval.')) {
      setShowModal(false)
      setForm({ department: 'Housekeeping', category: '', amount: '', notes: '' })
    }
  }

  const approvedTotal = expenses.filter((e) => e.status === 'Approved').reduce((s, e) => s + e.amount, 0)
  const pendingTotal = expenses.filter((e) => e.status === 'Pending').reduce((s, e) => s + e.amount, 0)
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Expenses</div>
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Operating expenses</h1>
          <p>Record, manage, and approve department operational expenditures.</p>
        </div>
        <button
          type="button"
          className="fin-btn fin-btn-primary"
          onClick={() => setShowModal(true)}
        >
          + Record expense
        </button>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Approved expenses</span>
          <div className="fin-kpi-val">{peso.format(approvedTotal)}</div>
          <span className="fin-kpi-note positive">
            {expenses.filter((e) => e.status === 'Approved').length} approved payments
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Pending review</span>
          <div className="fin-kpi-val">{peso.format(pendingTotal)}</div>
          <span className="fin-kpi-note warning">
            {expenses.filter((e) => e.status === 'Pending').length} pending approval
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total expenditures</span>
          <div className="fin-kpi-val">{peso.format(totalExp)}</div>
          <span className="fin-kpi-note neutral">Finance expense register</span>
        </div>
      </section>

      {/* Expenses Table Card */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <h3 className="fin-surface-title">Expense register</h3>
          <span className="fin-badge fin-badge-gray">{expenses.length} records</span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Voucher / date</th>
                <th>Department</th>
                <th>Expense category</th>
                <th>Amount (PHP)</th>
                <th>Status</th>
                <th>Approver</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td>
                    <strong>{exp.id}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{exp.date}</div>
                  </td>
                  <td><strong>{exp.department}</strong></td>
                  <td>{exp.category}</td>
                  <td style={{ fontWeight: 700 }}>{peso.format(exp.amount)}</td>
                  <td>
                    <span
                      className={`fin-badge ${
                        exp.status === 'Approved' ? 'fin-badge-green' : 'fin-badge-yellow'
                      }`}
                    >
                      {exp.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '11.5px', color: '#64748b' }}>{exp.approvedBy}</td>
                  <td>
                    {exp.status === 'Pending' ? (
                      <button
                        type="button"
                        onClick={() => handleApprove(exp.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Approve
                      </button>
                    ) : (
                      <span style={{ fontSize: '11.5px', color: '#16a34a' }}>✓ Disbursed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Record Expense */}
      {showModal && (
        <div className="finance-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="finance-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="finance-modal-heading">
              <h2>Record Operating Expense</h2>
              <button
                type="button"
                className="finance-modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="fin-form-group">
                <label>Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                >
                  <option value="Housekeeping">Housekeeping</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Front Office">Front Office</option>
                  <option value="Operations">Operations</option>
                  <option value="FAB Services">FAB Services</option>
                </select>
              </div>
              <div className="fin-form-group">
                <label>Category / Purpose</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Linens & Detergents"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
              <div className="fin-form-group">
                <label>Amount (PHP ₱)</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="1500"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="finance-modal-actions">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="fin-btn fin-btn-primary">
                  Save expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

