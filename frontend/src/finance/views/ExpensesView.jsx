import { useState, useEffect } from 'react'
import { financeApi } from '../../services/api'

export default function ExpensesView({ user, showToast }) {
  const isChecker = ['DEPARTMENT_HEAD', 'HEAD', 'FINANCE_HEAD', 'FINANCE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(
    user?.role?.toUpperCase()
  )
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [budgetLimits, setBudgetLimits] = useState({
    Housekeeping: 50000,
    Maintenance: 100000,
    'Front Office': 35000,
    'Food & Beverage': 120000,
  })

  const approverTitle = user?.role === 'DEPARTMENT_HEAD'
    ? 'Department Head'
    : user?.role === 'FINANCE_ADMIN'
    ? 'Finance Admin'
    : 'Finance Manager'

  // Modals state
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false)

  // Add Expense form state
  const [form, setForm] = useState({
    department: 'Housekeeping',
    category: 'Linens & Supplies',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    submittedBy: user?.username || 'Elena Ramos',
    notes: '',
  })

  async function loadExpenses() {
    setLoading(true)
    try {
      const res = await financeApi.expenses('')
      const raw = res.data || res || []
      const mapped = raw.map((exp) => ({
        id: exp.voucherCode || `EXP-${exp.id}`,
        dbId: exp.id,
        date: exp.expenseDate
          ? new Date(exp.expenseDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        department: exp.department,
        category: exp.category,
        amount: Number(exp.amount || 0),
        status: exp.status === 'APPROVED' ? 'Approved' : exp.status === 'PENDING' ? 'Pending' : exp.status,
        approvedBy: exp.approvedBy || (exp.status === 'APPROVED' ? 'D. Villanueva (Finance Mgr)' : 'Pending review'),
        submittedBy: 'Elena Ramos',
        notes: exp.notes || 'Operating supplies purchase voucher',
      }))
      setExpenses(mapped)
    } catch (err) {
      console.error('Failed to load expenses from database:', err)
      showToast('Error connecting to database. Please retry.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  async function handleApprove(expense) {
    try {
      await financeApi.approveExpense(expense.dbId)
      showToast(`Expense voucher ${expense.id} approved by ${approverTitle}.`)
      await loadExpenses()
      if (selectedExpense && selectedExpense.id === expense.id) {
        setSelectedExpense((prev) => ({
          ...prev,
          status: 'Approved',
          approvedBy: `Approved by ${approverTitle}`,
        }))
      }
    } catch (err) {
      console.error('Failed to approve expense:', err)
      showToast(err.message || 'Failed to approve expense in database.')
    }
  }

  async function handleCreateExpense(e) {
    e.preventDefault()
    if (!form.category || !form.amount) {
      showToast('Please provide an expense category and amount.')
      return
    }

    try {
      const created = await financeApi.createExpense({
        department: form.department,
        category: form.category,
        amount: parseFloat(form.amount) || 0,
        expenseDate: form.date,
        notes: form.notes || 'Operating supplies purchase voucher',
      })

      showToast(`Expense voucher ${created.voucherCode || 'EXP'} recorded and stored in database.`)
      setShowAddExpenseModal(false)
      setForm({
        department: 'Housekeeping',
        category: 'Linens & Supplies',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        submittedBy: 'Elena Ramos',
        notes: '',
      })
      await loadExpenses()
    } catch (err) {
      console.error('Failed to create expense:', err)
      showToast(err.message || 'Failed to record expense in database.')
    }
  }

  const approvedTotal = expenses.filter((e) => e.status === 'Approved').reduce((s, e) => s + e.amount, 0)
  const pendingTotal = expenses.filter((e) => e.status === 'Pending').reduce((s, e) => s + e.amount, 0)
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0)

  const filteredExpenses = expenses.filter((exp) => {
    const matchSearch =
      exp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.department.toLowerCase().includes(searchTerm.toLowerCase())
    const matchDept = deptFilter === 'All' || exp.department === deptFilter
    return matchSearch && matchDept
  })

  return (
    <>
      <div className="finance-breadcrumb">Finance &amp; Accounting / Operating Expenses</div>

      {/* Header - Replaced Date with + Add Expense Button */}
      <header className="finance-header">
        <div className="finance-header-titles">
          <h1>Department Operating Expenses</h1>
          <p>Record, inspect, and approve department operational and maintenance expenditures.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isChecker && (
            <button
              type="button"
              className="fin-btn fin-btn-secondary"
              onClick={() => setShowBudgetModal(true)}
              title="Checker Action: Configure departmental budget limits"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Budget Limits
            </button>
          )}
          <button
            type="button"
            className="fin-btn fin-btn-primary"
            onClick={() => setShowAddExpenseModal(true)}
            style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 700 }}
          >
            + Add Expense
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="fin-kpi-grid fin-kpi-grid-3">
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Approved Expenditures</span>
          <div className="fin-kpi-val">₱{approvedTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note positive">
            {expenses.filter((e) => e.status === 'Approved').length} verified department vouchers
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Pending Approval</span>
          <div className="fin-kpi-val">₱{pendingTotal.toLocaleString()}.00</div>
          <span className="fin-kpi-note warning">
            {expenses.filter((e) => e.status === 'Pending').length} pending finance manager sign-off
          </span>
        </div>
        <div className="fin-kpi-card">
          <span className="fin-kpi-label">Total Operating Outflow</span>
          <div className="fin-kpi-val">₱{totalExp.toLocaleString()}.00</div>
          <span className="fin-kpi-note neutral">
            {loading ? 'Loading...' : `${expenses.length} records in database`}
          </span>
        </div>
      </section>

      {/* Filter Surface */}
      <div className="fin-surface" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fin-input-wrap" style={{ flex: 1, minWidth: '220px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search voucher code, category, or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="fin-select-wrap">
            <label>Department</label>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="All">All departments</option>
              <option value="Housekeeping">Housekeeping</option>
              <option value="Engineering">Engineering</option>
              <option value="Operations">Operations</option>
              <option value="Front Office">Front Office</option>
              <option value="Guest Services">Guest Services</option>
              <option value="Kitchen / F&B">Kitchen / F&amp;B</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expenses Table - Hover effect and clickable to show details window */}
      <div className="fin-surface">
        <div className="fin-surface-header">
          <div>
            <h3 className="fin-surface-title">Operating Expense Vouchers</h3>
            <p className="fin-surface-subtitle">Click any voucher row to pop up details window, notes, and approval actions.</p>
          </div>
          <span className="fin-badge fin-badge-gray">
            {loading ? 'Loading database...' : `${filteredExpenses.length} vouchers`}
          </span>
        </div>

        <div className="fin-table-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Voucher # / Date</th>
                <th>Department</th>
                <th>Category</th>
                <th>Amount (PHP)</th>
                <th>Status</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    Loading expenses from database...
                  </td>
                </tr>
              )}
              {!loading && filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No expense records found in database.
                  </td>
                </tr>
              )}
              {!loading && filteredExpenses.map((exp) => (
                <tr
                  key={exp.id}
                  className="clickable-row"
                  onClick={() => setSelectedExpense(exp)}
                  title="Click to pop up voucher details and approval window"
                >
                  <td>
                    <strong>{exp.id}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{exp.date}</div>
                  </td>
                  <td>
                    <span className="fin-badge fin-badge-gray">{exp.department}</span>
                  </td>
                  <td>
                    <strong>{exp.category}</strong>
                  </td>
                  <td style={{ fontWeight: 800, color: '#0d1238' }}>₱{exp.amount.toLocaleString()}.00</td>
                  <td>
                    <span className={`fin-badge ${exp.status === 'Approved' ? 'fin-badge-green' : 'fin-badge-yellow'}`}>
                      {exp.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: exp.status === 'Approved' ? '#166534' : '#64748b' }}>
                      {exp.approvedBy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense Details & Approval Modal Window */}
      {selectedExpense && (
        <div className="fin-modal-overlay" onClick={() => setSelectedExpense(null)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Grand Horizon Hotel · Expense Voucher</span>
                <h2 className="fin-modal-title">Voucher #{selectedExpense.id}</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setSelectedExpense(null)}
              >
                ✕
              </button>
            </div>

            <div className="fin-modal-body">
              <div className="fin-paper-document">
                <div className="fin-paper-header">
                  <div>
                    <h3 className="fin-paper-title">{selectedExpense.category}</h3>
                    <div className="fin-paper-subtitle">Department: {selectedExpense.department}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748b' }}>
                    <div><strong>{selectedExpense.id}</strong></div>
                    <div>{selectedExpense.date}</div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Voucher Amount
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0d1238', marginTop: '4px' }}>
                    ₱{selectedExpense.amount.toLocaleString()}.00 PHP
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    <span className={`fin-badge ${selectedExpense.status === 'Approved' ? 'fin-badge-green' : 'fin-badge-yellow'}`}>
                      Status: {selectedExpense.status}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '12.5px', lineHeight: '1.6', marginBottom: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Department:</span>
                      <div><strong>{selectedExpense.department}</strong></div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Approved By:</span>
                      <div><strong>{selectedExpense.approvedBy}</strong></div>
                    </div>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>Voucher Notes &amp; Particulars:</span>
                    <p style={{ margin: '4px 0 0', color: '#334155' }}>{selectedExpense.notes}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="fin-modal-footer">
              {!isChecker ? (
                <span style={{ fontSize: '11.5px', color: '#64748b', marginRight: 'auto' }}>
                  ℹ️ <strong>Segregation of Duties:</strong> Approving operational expense vouchers is restricted to the Department Head / Finance Admin.
                </span>
              ) : (
                selectedExpense.status === 'Pending' && (
                  <button
                    type="button"
                    className="fin-btn fin-btn-primary"
                    onClick={() => handleApprove(selectedExpense)}
                  >
                    ✓ Approve Voucher
                  </button>
                )
              )}
              <button
                type="button"
                className="fin-btn fin-btn-secondary"
                onClick={() => setSelectedExpense(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Limits Modal Window (Checker Only) */}
      {showBudgetModal && isChecker && (
        <div className="fin-modal-overlay" onClick={() => setShowBudgetModal(false)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="fin-modal-header">
              <div>
                <span className="fin-subsystem-badge">Executive Governance</span>
                <h2 className="fin-modal-title">Department Budget Limits</h2>
              </div>
              <button
                type="button"
                className="fin-modal-close-btn"
                onClick={() => setShowBudgetModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="fin-modal-body">
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                Set monthly spending limits per hotel department. Expenditures exceeding these thresholds will be flagged for secondary executive approval.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {Object.entries(budgetLimits).map(([dept, limit]) => (
                  <div key={dept} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <strong>{dept}</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: '#64748b' }}>₱</span>
                      <input
                        type="number"
                        className="fin-input"
                        style={{ width: '130px', textAlign: 'right', fontWeight: 700 }}
                        value={limit}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0
                          setBudgetLimits({ ...budgetLimits, [dept]: val })
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="fin-modal-footer">
              <button
                type="button"
                className="fin-btn fin-btn-primary"
                onClick={() => {
                  showToast('Department budget limits updated successfully.')
                  setShowBudgetModal(false)
                }}
              >
                ✓ Save Budget Limits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Creation Modal Window */}
      {showAddExpenseModal && (
        <div className="fin-modal-overlay" onClick={() => setShowAddExpenseModal(false)}>
          <div className="fin-modal-window" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateExpense}>
              <div className="fin-modal-header">
                <div>
                  <span className="fin-subsystem-badge">Operating Expenditures</span>
                  <h2 className="fin-modal-title">Record New Expense</h2>
                </div>
                <button
                  type="button"
                  className="fin-modal-close-btn"
                  onClick={() => setShowAddExpenseModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="fin-modal-body">
                <div className="fin-form-group">
                  <label>Department *</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Operations">Operations</option>
                    <option value="Front Office">Front Office</option>
                    <option value="Guest Services">Guest Services</option>
                    <option value="Kitchen / F&B">Kitchen / F&amp;B</option>
                  </select>
                </div>

                <div className="fin-form-group">
                  <label>Expense Category *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Linens, Power Utilities, Amenities"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </div>

                <div className="fin-form-row">
                  <div className="fin-form-group">
                    <label>Amount (PHP) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      style={{ fontSize: '15px', fontWeight: 700 }}
                    />
                  </div>
                  <div className="fin-form-group">
                    <label>Expense Date *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="fin-form-group">
                  <label>Submitted By / Payee *</label>
                  <input
                    type="text"
                    required
                    value={form.submittedBy}
                    onChange={(e) => setForm({ ...form, submittedBy: e.target.value })}
                  />
                </div>

                <div className="fin-form-group">
                  <label>Justification &amp; Particulars</label>
                  <textarea
                    rows="3"
                    placeholder="Describe the operational purpose of this expense..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="fin-modal-footer">
                <button
                  type="button"
                  className="fin-btn fin-btn-secondary"
                  onClick={() => setShowAddExpenseModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="fin-btn fin-btn-primary"
                >
                  Record Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
