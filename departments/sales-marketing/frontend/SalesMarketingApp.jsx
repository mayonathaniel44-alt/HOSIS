import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Target,
  Building2,
  Tag,
  FileText,
  Receipt,
  BarChart3,
  ShieldCheck,
  History,
  Users,
  Database,
  UserCircle,
  Menu,
  RefreshCw,
  Plus,
  Download,
  LogOut,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import SalesAvailability from './SalesAvailability.jsx'
import SalesSettings from './SalesSettings.jsx'
import Notifications from './Notifications'
import Dialog, { Feedback } from './Dialog'
import PagedTable from './PagedTable'
import { request } from '../../../frontend/src/services/api.js'
import { spreadsheetText } from '@housekeeping/exportReport.js'
import logo from './logo.png'
import QuoteDialog from './QuoteDialog'
import { analytics, peso } from './analytics'
import './workspace.css'

const campaignTypes = [
  'Social Media',
  'Email Marketing',
  'Corporate',
  'Promotional',
  'Website',
]
const channels = [
  'Website',
  'Social Media',
  'Email',
  'Referral',
  'Corporate',
  'Walk-in',
  'Other',
]
const singular = {
  campaigns: 'campaign',
  inquiries: 'inquiry',
  leads: 'lead',
  clients: 'client',
  promotions: 'promotion',
  quotations: 'quotation',
}
const nav = [
  ['Dashboard', LayoutDashboard],
  ['Availability', Building2],
  ['Campaigns', Megaphone, 'campaigns'],
  ['Inquiries', MessageSquare, 'inquiries'],
  ['Sales Leads', Target, 'leads'],
  ['Corporate Clients', Building2, 'clients'],
  ['Promotions', Tag, 'promotions'],
  ['Quotations', FileText, 'quotations'],
  ['Sales Records', Receipt, 'sales'],
  ['Reports', BarChart3],
  ['Audit History', History],
  ['Users', Users],
  ['Backup & Restore', Database],
  ['My Account', UserCircle],
]
const field = (key, label, type = 'text', options, required = true) => ({
  key,
  label,
  type,
  options,
  required,
})
const commonContact = [
  field('email', 'Email', 'email', null, false),
  field('phone', 'Phone', 'tel', null, false),
]
const definitions = {
  campaigns: [
    field('name', 'Campaign name'),
    field('type', 'Campaign type', 'select', campaignTypes),
    field('start', 'Start date', 'date'),
    field('end', 'End date', 'date'),
    field('budget', 'Approved budget (PHP)', 'number'),
    field('spent', 'Actual spend to date (PHP)', 'number'),
    field('status', 'Status', 'select', [
      'Draft',
      'Active',
      'Completed',
      'Cancelled',
    ]),
  ],
  inquiries: [
    field('name', 'Guest / company'),
    ...commonContact,
    field('date', 'Inquiry date', 'date'),
    field('subject', 'Subject'),
    field('source', 'Source', 'select', channels),
    field('campaignId', 'Campaign', 'link', 'campaigns', false),
    field('clientId', 'Corporate client', 'link', 'clients', false),
    field('status', 'Status', 'select', ['New', 'In Progress', 'Resolved']),
    field('followUp', 'Follow-up date', 'date', null, false),
    field('notes', 'Notes', 'textarea', null, false),
  ],
  leads: [
    field('name', 'Guest / company'),
    ...commonContact,
    field('date', 'Lead date', 'date'),
    field('subject', 'Opportunity'),
    field('source', 'Source', 'select', channels),
    field('campaignId', 'Campaign', 'link', 'campaigns', false),
    field('clientId', 'Corporate client', 'link', 'clients', false),
    field('status', 'Status', 'select', ['New', 'Qualified', 'Lost']),
    field('followUp', 'Follow-up date', 'date', null, false),
    field('notes', 'Notes', 'textarea', null, false),
  ],
  clients: [
    field('name', 'Company name'),
    field('contact', 'Contact person'),
    ...commonContact,
    field('address', 'Business address', 'textarea', null, false),
  ],
  promotions: [
    field('name', 'Promotion name'),
    field('campaignId', 'Campaign', 'link', 'campaigns', false),
    field('start', 'Valid from', 'date'),
    field('end', 'Valid until', 'date'),
    field('discount', 'Discount (%)', 'number'),
    field('terms', 'Eligibility and terms', 'textarea'),
  ],
  quotations: [
    field('name', 'Room / package description'),
    field('leadId', 'Lead', 'link', 'leads'),
    field('date', 'Quotation date', 'date'),
    field('validUntil', 'Valid until', 'date'),
    field('checkIn', 'Check-in', 'date'),
    field('checkOut', 'Check-out', 'date'),
    field('gross', 'Price before discount (PHP)', 'number'),
    field('promotionId', 'Approved promotion', 'link', 'promotions', false),
    field('notes', 'Notes', 'textarea', null, false),
  ],
}
const columns = {
  campaigns: [
    ['name', 'Campaign'],
    ['type', 'Campaign type'],
    ['start', 'Start'],
    ['end', 'End'],
    ['budget', 'Budget'],
    ['spent', 'Actual spend'],
    ['status', 'Status'],
  ],
  inquiries: [
    ['name', 'Guest / company'],
    ['subject', 'Subject'],
    ['date', 'Date'],
    ['followUp', 'Follow-up'],
    ['campaignId', 'Campaign'],
    ['status', 'Status'],
  ],
  leads: [
    ['name', 'Guest / company'],
    ['subject', 'Opportunity'],
    ['source', 'Source'],
    ['followUp', 'Follow-up'],
    ['campaignId', 'Campaign'],
    ['status', 'Status'],
  ],
  clients: [
    ['name', 'Company'],
    ['contact', 'Contact'],
    ['email', 'Email'],
    ['phone', 'Phone'],
  ],
  promotions: [
    ['name', 'Promotion'],
    ['discount', 'Discount %'],
    ['start', 'From'],
    ['end', 'Until'],
    ['status', 'Approval'],
  ],
  quotations: [
    ['leadId', 'Customer'],
    ['name', 'Room / package'],
    ['amount', 'Guest pays'],
    ['checkIn', 'Check-in'],
    ['checkOut', 'Check-out'],
    ['validUntil', 'Reply deadline'],
    ['status', 'Status'],
  ],
  sales: [
    ['name', 'Customer'],
    ['reservationRef', 'Reservations reference'],
    ['stay', 'Front Office stay'],
    ['preparation', 'Housekeeping preparation'],
    ['date', 'Sale date'],
    ['amount', 'Booked value'],
    ['balance', 'Outstanding'],
    ['cancellationFee', 'Cancellation fee'],
    ['refundable', 'Refund due'],
    ['status', 'Status'],
  ],
}
function api(path, method = 'GET', body) {
  return request('/sales-marketing/improved' + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const accountLabel = (u) =>
  u.username?.toLowerCase() === 'superadmin' ? 'Admin' : u.username
function Badge({ children }) {
  return (
    <span
      className={`ws-badge ${['Confirmed', 'Approved', 'Converted', 'Paid', 'Active', 'Accepted', 'Receipt'].includes(children) ? 'positive' : ['Cancelled', 'Lost', 'Expired', 'Refund', 'Overdue'].includes(children) ? 'negative' : ''}`}
    >
      {children}
    </span>
  )
}
function Workspace({ user, signOut, onSessionChange }) {
  const [records, setRecords] = useState([]),
    [date, setDate] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [page, setPage] = useState('Dashboard'),
    [search, setSearch] = useState(''),
    [showArchived, setShowArchived] = useState(false),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState(null),
    [dialogError, setDialogError] = useState(''),
    [menu, setMenu] = useState(false)
  const [notificationRevision, setNotificationRevision] = useState(0)
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [audit, setAudit] = useState([])
  const isManager = ['Sales Head', 'Super Admin'].includes(user.role)
  const navItems = nav.filter(
    ([name]) =>
      isManager ||
      !['Audit History', 'Users', 'Backup & Restore'].includes(name),
  )
  const latestLoad = useRef(0)
  const load = useCallback(async ({ quiet = false } = {}) => {
    const revision = ++latestLoad.current
    if (!quiet) setError('')
    try {
      const data = await api('/workspace')
      if (revision !== latestLoad.current) return
      setRecords(data.records)
      setDate(data.today)
      setFrom((v) => v || `${data.today.slice(0, 4)}-01-01`)
      setTo((v) => v || data.today)
    } catch (e) {
      if (!quiet && revision === latestLoad.current) setError(e.message)
    } finally {
      if (revision === latestLoad.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])
  useEffect(() => {
    if (
      loading ||
      busy ||
      !['Dashboard', 'Sales Records', 'Reports'].includes(page)
    )
      return
    const refresh = () => {
      if (!document.hidden) void load({ quiet: true })
    }
    const timer = setInterval(refresh, 20000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [busy, loading, load, page])
  async function loadExtra(name) {
    if (name !== 'Audit History') return
    try {
      setAudit(await api('/audit'))
    } catch (e) {
      setError(e.message)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => loadExtra(page), 0)
    return () => clearTimeout(timer)
  }, [page])
  const periodValid = !!from && !!to && from <= to
  const visibleRecords = records
  const stats = useMemo(
    () => analytics(visibleRecords, from, to),
    [visibleRecords, from, to],
  )
  const selected = nav.find((n) => n[0] === page),
    kind = selected?.[2]
  const list = visibleRecords.filter(
    (r) =>
      r.kind === kind &&
      r.archived === showArchived &&
      (!search ||
        Object.values(r)
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())),
  )
  function open(config) {
    setDialogError('')
    setDialog(config)
  }
  async function mutate(fn, message = 'Changes saved.') {
    setBusy(true)
    setDialogError('')
    setError('')
    try {
      await fn()
      setDialog(null)
      setNotice(message)
      setNotificationRevision((v) => v + 1)
      await load()
      await loadExtra(page)
    } catch (e) {
      setDialogError(e.message)
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  function quote(r, lead) {
    open({
      type: 'quote',
      title: r ? 'Edit price quote' : 'New price quote',
      initial: r || { leadId: lead?.id || '', name: lead?.subject || '' },
      onSave: (v) =>
        mutate(async () => {
          await api(
            r ? `/records/${r.id}` : '/records/quotations',
            r ? 'PUT' : 'POST',
            { ...v, ...(r ? { version: r.version } : {}) },
          )
          setPage('Quotations')
          setSearch('')
          setShowArchived(false)
        }, 'Price quote saved. Confirm the booking after the guest agrees and Reservations confirms availability.'),
    })
  }
  function edit(r) {
    if (kind === 'quotations') {
      quote(r)
      return
    }
    open({
      title: r ? `Edit ${r.name}` : `Add ${singular[kind]}`,
      fields: definitions[kind],
      initial: r
        ? {
            ...r,
            type:
              r.type ||
              {
                Email: 'Email Marketing',
                Referral: 'Promotional',
                'Walk-in': 'Promotional',
                Other: 'Promotional',
              }[r.channel] ||
              r.channel,
          }
        : { date, spent: 0 },
      onSave: (v) =>
        mutate(() =>
          api(r ? `/records/${r.id}` : `/records/${kind}`, r ? 'PUT' : 'POST', {
            ...v,
            ...(r ? { version: r.version } : {}),
          }),
        ),
    })
  }
  function action(r, action, values = {}) {
    return api(`/records/${r.id}/action`, 'POST', {
      ...values,
      action,
      version: r.version,
    })
  }
  function confirmDialog(title, description, fn) {
    open({ title, description, fields: [], onSave: () => mutate(fn) })
  }
  const refName = (id) => records.find((r) => r.id === id)?.name || '—'
  function sharedValue(record, key) {
    if (key === 'stay') {
      const stay = record.stay
      return stay
        ? [
            stay.status.replaceAll('_', ' '),
            stay.checkIn + ' to ' + stay.checkOut,
            stay.room
              ? stay.roomType + ' ' + stay.room
              : stay.roomType + ' (unassigned)',
            stay.roomStatus?.replaceAll('_', ' '),
          ]
            .filter(Boolean)
            .join(' | ')
        : ''
    }
    if (key === 'preparation')
      return record.preparation
        ? record.preparation +
            ' (' +
            (record.stay?.preparationCompletedAt ? 'Completed' : 'Pending') +
            ')'
        : ''
    return record[key]
  }

  function cell(r, k) {
    if (k === 'balance') return peso(stats.balance(r))
    if (k === 'cancellationFee')
      return r.status === 'Cancelled' ? peso(r.cancellationFee || 0) : '—'
    if (k === 'refundable')
      return r.status === 'Cancelled' ? peso(stats.refundable(r)) : '—'
    if (['amount', 'budget', 'spent', 'gross'].includes(k)) return peso(r[k])
    if (k.endsWith('Id')) return refName(r[k])
    if (k === 'status' && r.kind === 'quotations')
      return (
        <Badge>
          {r.status === 'Accepted'
            ? 'Booked'
            : r.validUntil < date || r.checkIn < date
              ? 'Expired'
              : 'Not booked'}
        </Badge>
      )
    if (k === 'status') return <Badge>{r[k]}</Badge>
    return sharedValue(r, k) || '—'
  }
  async function exportReport() {
    if (!periodValid) {
      setError('Choose a valid reporting date range.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { default: writeExcelFile } = await import(
        'write-excel-file/browser'
      )
      const sheets = Object.entries(columns).map(([recordKind, fields]) => ({
        sheet: nav.find((item) => item[2] === recordKind)?.[0] || recordKind,
        data: [
          fields.map(([, label]) => ({ value: label, fontWeight: 'bold' })),
          ...records
            .filter((record) => {
              const day =
                record.date || record.start || record.createdAt?.slice(0, 10)
              return (
                record.kind === recordKind &&
                !record.archived &&
                day >= from &&
                day <= to
              )
            })
            .map((record) =>
              fields.map(([key]) => {
                const value =
                  key === 'balance'
                    ? stats.balance(record)
                    : key === 'refundable'
                      ? stats.refundable(record)
                      : key.endsWith('Id')
                        ? refName(record[key])
                        : sharedValue(record, key)
                return {
                  value:
                    typeof value === 'number'
                      ? value
                      : spreadsheetText(String(value ?? '')),
                }
              }),
            ),
        ],
      }))
      const ledger = records.filter(
        (r) => r.kind === 'payments' && r.date >= from && r.date <= to,
      )
      sheets.push({
        sheet: 'Finance reconciliation',
        data: [
          ['Date', 'Type', 'Amount', 'Customer', 'Finance reference'].map(
            (value) => ({ value, fontWeight: 'bold' }),
          ),
          ...ledger.map((r) =>
            [r.date, r.type, r.amount, r.name, r.externalReference].map(
              (value) => ({
                value:
                  typeof value === 'number'
                    ? value
                    : spreadsheetText(String(value ?? '')),
              }),
            ),
          ),
        ],
      })
      if (user.role === 'Super Admin')
        sheets.forEach((sheet) =>
          sheet.data.push([{ value: 'Exported by Admin' }]),
        )
      await writeExcelFile(sheets).toFile(
        'HOSIS-sales-' + from + '-to-' + to + '.xlsx',
      )
      setNotice('Excel report downloaded.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  function recordActions(r) {
    return (
      <div className="ws-row-actions">
        {r.archived ? (
          <button
            disabled={busy}
            onClick={() =>
              confirmDialog('Restore archived record', r.name, () =>
                api(`/records/${r.id}/archive`, 'POST', { version: r.version }),
              )
            }
          >
            Restore
          </button>
        ) : (
          <>
            {definitions[kind] &&
              !['Converted', 'Accepted'].includes(r.status) &&
              (!['campaigns', 'promotions'].includes(kind) || isManager) && (
                <button disabled={busy} onClick={() => edit(r)}>
                  Edit
                </button>
              )}
            {kind === 'inquiries' && r.status !== 'Converted' && (
              <button
                disabled={busy}
                onClick={() =>
                  confirmDialog(
                    'Convert inquiry to lead',
                    'The inquiry stays linked to its new lead. Repeat conversion is prevented.',
                    () => action(r, 'convert'),
                  )
                }
              >
                Convert to lead
              </button>
            )}
            {kind === 'promotions' &&
              r.status === 'Pending' &&
              isManager &&
              r.createdBy !== user.id && (
                <button
                  disabled={busy}
                  onClick={() =>
                    confirmDialog(
                      'Approve promotion',
                      'Approval is recorded under your account. Editing the promotion will require approval again.',
                      () => action(r, 'approve'),
                    )
                  }
                >
                  Approve
                </button>
              )}
            {kind === 'leads' && !['Converted', 'Lost'].includes(r.status) && (
              <button disabled={busy} onClick={() => quote(null, r)}>
                Create price quote
              </button>
            )}
            {kind === 'quotations' &&
              r.status === 'Draft' &&
              r.validUntil >= date &&
              r.checkIn >= date && (
                <button
                  disabled={busy}
                  onClick={() =>
                    open({
                      title: 'Confirm booking',
                      description: `${refName(r.leadId)} · ${r.name} · ${peso(r.amount)}. Continue only after the guest accepts this quote and Reservations confirms room availability.`,
                      fields: [
                        field(
                          'reservationRef',
                          'Booking confirmation number from Reservations',
                        ),
                        field(
                          'preparation',
                          'Room setup and amenities for Housekeeping',
                          'textarea',
                          null,
                          false,
                        ),
                        field(
                          'availabilityConfirmed',
                          'Reservations confirmed a room is available for these dates',
                          'checkbox',
                        ),
                      ],
                      onSave: (v) =>
                        mutate(
                          () => action(r, 'confirm', v),
                          'Booking confirmed. You can find it in Sales Records.',
                        ),
                    })
                  }
                >
                  Confirm booking
                </button>
              )}
            {kind === 'sales' &&
              ['CONFIRMED', 'CHECKED_IN'].includes(r.stay?.status) &&
              r.status !== 'Cancelled' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    open({
                      title: 'Room preparation',
                      description:
                        'Front Office and Housekeeping can see these instructions.',
                      fields: [
                        field(
                          'preparation',
                          'Room setup and amenities',
                          'textarea',
                          null,
                          false,
                        ),
                      ],
                      initial: { preparation: r.preparation || '' },
                      onSave: (values) =>
                        mutate(() => action(r, 'preparation', values)),
                    })
                  }
                >
                  Room preparation
                </button>
              )}
            {kind === 'sales' && isManager && !r.legacy && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    open({
                      title: 'Reconcile Finance payment',
                      description:
                        'A unique receipt or refund number is generated when you save. Enter the reference from Finance. This records a reconciliation entry only.',
                      fields: [
                        field(
                          'type',
                          'Entry type',
                          'select',
                          r.status === 'Cancelled'
                            ? stats.balance(r) > 0
                              ? ['Receipt']
                              : ['Refund']
                            : ['Receipt', 'Refund'],
                        ),
                        field('amount', 'Amount (PHP)', 'number'),
                        field('date', 'Finance entry date', 'date'),
                        field(
                          'externalReference',
                          'External Finance reference',
                        ),
                        field(
                          'notes',
                          'Reconciliation notes',
                          'textarea',
                          null,
                          false,
                        ),
                      ],
                      initial: { date },
                      onSave: (v) => mutate(() => action(r, 'payment', v)),
                    })
                  }
                >
                  Payment / refund
                </button>
                {r.status === 'Confirmed' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      open({
                        title: 'Cancel sale',
                        description:
                          'Cancel the Sales record? Handle the reservation separately in Front Office. The cancellation fee is 10% of its full booking value: ' +
                          peso(Math.round(r.amount * 10) / 100) +
                          '. Net payments received: ' +
                          peso(stats.collected(r)) +
                          '. Refund available after the fee: ' +
                          peso(
                            Math.max(
                              0,
                              Math.round(
                                (stats.collected(r) -
                                  Math.round(r.amount * 10) / 100) *
                                  100,
                              ) / 100,
                            ),
                          ) +
                          '. No money is moved automatically.',
                        fields: [
                          field('reason', 'Cancellation reason', 'textarea'),
                        ],
                        onSave: (v) => mutate(() => action(r, 'cancel', v)),
                      })
                    }
                  >
                    Cancel sale
                  </button>
                )}
              </>
            )}
            {isManager &&
              !['sales', 'payments'].includes(kind) &&
              !['Converted', 'Accepted'].includes(r.status) && (
                <button
                  className="ws-danger"
                  disabled={busy}
                  onClick={() =>
                    confirmDialog(
                      'Delete record',
                      'Move this record to trash? Linked records and financial history are protected. You can restore it later.',
                      () =>
                        api(`/records/${r.id}/delete`, 'POST', {
                          version: r.version,
                        }),
                    )
                  }
                >
                  Delete
                </button>
              )}
          </>
        )}
      </div>
    )
  }
  function metric(label, value, sub) {
    return (
      <div className="ws-metric">
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
    )
  }
  function charts() {
    return (
      <div className="ws-chart-grid">
        <section className="ws-panel">
          <h2>Booked sales by month</h2>
          <p className="ws-muted">Confirmed sales in the selected period</p>
          {stats.chart.length ? (
            <div className="ws-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.chart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={peso} />
                  <Area
                    isAnimationActive={false}
                    dot={{ r: 4 }}
                    type="monotone"
                    dataKey="booked"
                    stroke="#153870"
                    fill="#dce6f4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="ws-empty">Confirmed sales will appear here.</div>
          )}
        </section>
        <section className="ws-panel">
          <h2>Where leads come from</h2>
          <p className="ws-muted">Saved lead sources in the selected period</p>
          {stats.channels.length ? (
            <div className="ws-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.channels}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    isAnimationActive={false}
                    dataKey="leads"
                    fill="#be9546"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="ws-empty">
              Add or convert a lead to see its source.
            </div>
          )}
        </section>
      </div>
    )
  }
  const followUps = visibleRecords.filter(
    (r) =>
      !r.archived &&
      ['inquiries', 'leads'].includes(r.kind) &&
      r.followUp &&
      r.followUp <= date &&
      !['Converted', 'Resolved', 'Lost'].includes(r.status),
  )
  return (
    <div className="ws-app">
      {menu && (
        <button
          aria-label="Close navigation"
          className="ws-scrim"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`ws-sidebar ${menu ? 'open' : ''}`}>
        <div className="ws-brand">
          <img src={logo} alt="Grand Horizon Hotel" />
          <span>SALES & MARKETING</span>
        </div>
        <p className="ws-nav-label">WORKSPACE</p>
        <nav>
          {navItems.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? 'active' : ''}
              onClick={() => {
                setPage(name)
                setSearch('')
                setShowArchived(false)
                setMenu(false)
                setError('')
              }}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <div className="ws-profile">
          <strong>{accountLabel(user)}</strong>
          <span>{user.role === 'Super Admin' ? 'Admin' : user.role}</span>
          {signOut && (
            <button onClick={signOut}>
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="ws-main">
        <header className="ws-topbar">
          <button
            className="ws-menu-button"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu />
          </button>
          <span>HOTEL OPERATIONS & SERVICES</span>
          <div>
            <span>{date} · Manila</span>
            <Notifications
              api={api}
              key={user.id}
              refreshKey={notificationRevision}
              onOpenRecord={(n) => {
                const target = nav.find((item) => item[2] === n.kind)
                if (target) {
                  setPage(target[0])
                  setSearch(n.recordId || '')
                  void load()
                  setShowArchived(false)
                }
              }}
            />
            <button
              onClick={load}
              disabled={loading || busy}
              aria-label="Refresh records"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="ws-content">
          <div className="ws-heading">
            <div>
              <p className="ws-eyebrow">GRAND HORIZON HOTEL</p>
              <h1>{page}</h1>
              <p className="ws-muted">
                {page === 'Dashboard'
                  ? 'Your sales pipeline, connected to the numbers that matter.'
                  : page === 'Quotations'
                    ? 'Prepare a price quote, share the price with the guest, then confirm their booking.'
                    : kind
                      ? 'Manage your records and keep every opportunity connected.'
                      : 'Review, reconcile, and manage your sales workspace.'}
              </p>
            </div>
            {kind &&
              definitions[kind] &&
              (!['campaigns', 'promotions'].includes(kind) || isManager) && (
                <button
                  className="ws-primary ws-add"
                  onClick={() => edit()}
                  disabled={busy || loading || !!error}
                >
                  <Plus size={17} />
                  {kind === 'quotations'
                    ? 'New price quote'
                    : `Add ${singular[kind]}`}
                </button>
              )}
          </div>
          {error && (
            <div role="alert" className="ws-error">
              {error}{' '}
              <button
                onClick={() => {
                  load()
                  loadExtra(page)
                }}
              >
                Retry
              </button>
            </div>
          )}
          {notice && (
            <Feedback message={notice} onClose={() => setNotice('')} />
          )}
          {loading ? (
            <div className="ws-panel ws-empty">Loading saved records…</div>
          ) : (
            <>
              {['Dashboard', 'Reports'].includes(page) && (
                <>
                  <div className="ws-period">
                    <label>
                      From
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                    {page === 'Reports' && (
                      <button
                        className="ws-primary"
                        onClick={exportReport}
                        disabled={!periodValid || busy}
                      >
                        <Download size={16} />
                        Export Excel
                      </button>
                    )}
                    <span>
                      {periodValid
                        ? 'Sales use sale dates. Collections use Finance entry dates.'
                        : 'Choose a valid date range.'}
                    </span>
                  </div>
                  {periodValid && (
                    <>
                      <div className="ws-metrics">
                        {metric(
                          'Confirmed booked value',
                          peso(stats.booked),
                          'Excludes cancelled sales',
                        )}
                        {metric(
                          'Net collections',
                          peso(stats.net),
                          `Receipts ${peso(stats.receipts)} · refunds ${peso(stats.refunds)}`,
                        )}
                        {metric(
                          'Outstanding balance',
                          peso(stats.outstanding),
                          'Current balance of confirmed sales dated in period',
                        )}
                        {metric(
                          'Leads converted in period',
                          `${stats.converted.length} / ${stats.leads.length}`,
                          'Leads created and sold within this date range',
                        )}
                      </div>
                      {charts()}
                    </>
                  )}
                </>
              )}
              {page === 'Dashboard' && (
                <>
                  <section className="ws-panel">
                    <h2>Follow-ups due</h2>
                    <p className="ws-muted">
                      Today and overdue · across all dates
                    </p>
                    {followUps.length ? (
                      <ul className="ws-followups">
                        {followUps.map((r) => (
                          <li key={r.id}>
                            <div>
                              <strong>{r.name}</strong>
                              <p>{r.subject}</p>
                            </div>
                            <Badge>
                              {r.followUp < date ? 'Overdue' : 'Due today'}
                            </Badge>
                            <button
                              onClick={() => {
                                setPage(
                                  r.kind === 'leads'
                                    ? 'Sales Leads'
                                    : 'Inquiries',
                                )
                                setSearch(r.name)
                              }}
                            >
                              Open record
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="ws-empty">
                        No follow-ups due. Keep the next contact date on your
                        inquiries and leads.
                      </div>
                    )}
                  </section>
                  <div className="ws-boundary">
                    <ShieldCheck size={22} />
                    <p>
                      <strong>
                        Reservations and Finance remain the source of
                        confirmation.
                      </strong>{' '}
                      Sales records require an availability check and
                      Reservations reference. Payment entries reconcile Finance
                      receipts; they do not process payments.
                    </p>
                  </div>
                </>
              )}
              {kind === 'quotations' && (
                <section
                  className="quote-guide"
                  aria-label="How price quotes work"
                >
                  <div>
                    <strong>1. Create a price quote</strong>
                    <p>Choose a customer, stay dates, and full stay price.</p>
                  </div>
                  <div>
                    <strong>2. Share it with the guest</strong>
                    <p>
                      A saved quote is a price offer. No room is booked yet.
                    </p>
                  </div>
                  <div>
                    <strong>3. Confirm the booking</strong>
                    <p>
                      When the guest agrees, get confirmation from Reservations.
                    </p>
                  </div>
                </section>
              )}
              {kind && (
                <>
                  <div className="ws-table-tools">
                    <label className="ws-search">
                      Search records
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Name, reference, status…"
                      />
                    </label>
                    {isManager && kind !== 'sales' && (
                      <label>
                        <input
                          type="checkbox"
                          checked={showArchived}
                          onChange={(e) => setShowArchived(e.target.checked)}
                        />{' '}
                        Show trash / archived
                      </label>
                    )}
                    <span>{list.length} records</span>
                  </div>
                  <section className="ws-panel ws-table-panel">
                    <PagedTable>
                      <table>
                        <thead>
                          <tr>
                            {columns[kind].map(([k, l]) => (
                              <th key={k}>{l}</th>
                            ))}
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((r) => (
                            <tr key={r.id}>
                              {columns[kind].map(([k]) => (
                                <td key={k}>{cell(r, k)}</td>
                              ))}
                              <td>{recordActions(r)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </PagedTable>
                    {!list.length && (
                      <div className="ws-empty">
                        No {showArchived ? 'archived ' : ''}records found.
                        {search
                          ? ' Try another search.'
                          : ' New records are saved permanently.'}
                      </div>
                    )}
                  </section>
                  {kind === 'promotions' && (
                    <p className="ws-footnote">
                      Promotions require approval from a different manager.
                      Editing an approved offer returns it to Pending. Existing
                      quotations retain their agreed price.
                    </p>
                  )}
                  {kind === 'sales' && (
                    <>
                      <p className="ws-footnote">
                        Booked value is a sales commitment, not accounting
                        revenue. Payment history is immutable; enter a refund to
                        reverse a receipt. Cancelled sales retain a fee of 10%
                        of the full booking value; refunds are limited to
                        payments received less that fee.
                      </p>
                      <section className="ws-panel">
                        <h2>Finance reconciliation ledger</h2>
                        <PagedTable>
                          <table>
                            <thead>
                              <tr>
                                {[
                                  'Date',
                                  'Customer',
                                  'Type',
                                  'Amount',
                                  'Finance reference',
                                  'Sale reference',
                                ].map((x) => (
                                  <th key={x}>{x}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRecords
                                .filter(
                                  (r) => r.kind === 'payments' && !r.archived,
                                )
                                .map((r) => (
                                  <tr key={r.id}>
                                    <td>{r.date}</td>
                                    <td>{r.name}</td>
                                    <td>
                                      <Badge>{r.type}</Badge>
                                    </td>
                                    <td>{peso(r.amount)}</td>
                                    <td>{r.reference}</td>
                                    <td>
                                      {
                                        records.find((s) => s.id === r.saleId)
                                          ?.reservationRef
                                      }
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </PagedTable>
                      </section>
                    </>
                  )}
                </>
              )}
              {page === 'Reports' && periodValid && (
                <>
                  <section className="ws-panel">
                    <h2>Campaign attribution</h2>
                    <p className="ws-muted">
                      Period leads and bookings; spend and ROAS cover the
                      campaign lifetime. ROAS is booked value ÷ actual spend,
                      not profit ROI.
                    </p>
                    <PagedTable>
                      <table>
                        <thead>
                          <tr>
                            {[
                              'Campaign',
                              'Lifetime spend',
                              'Period leads',
                              'Period bookings',
                              'Period booked value',
                              'Period conversion',
                              'Lifetime ROAS',
                            ].map((x) => (
                              <th key={x}>{x}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stats.campaigns.map((c) => (
                            <tr key={c.campaign}>
                              <td>{c.campaign}</td>
                              <td>{peso(c.lifetimeSpend)}</td>
                              <td>{c.periodLeads}</td>
                              <td>{c.periodBookings}</td>
                              <td>{peso(c.periodBookedValue)}</td>
                              <td>{c.conversion}</td>
                              <td>
                                {c.lifetimeROAS == null
                                  ? 'N/A'
                                  : `${c.lifetimeROAS.toFixed(2)}×`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </PagedTable>
                  </section>
                  <p className="ws-footnote">
                    Refunds still due for cancelled sales dated in this period:{' '}
                    {peso(stats.refundDue)}. Confirmed bookings, collections,
                    and outstanding balances are reported separately.
                    Cancellation fees: {peso(stats.cancellationFees)}; unpaid
                    fees: {peso(stats.cancellationFeesDue)}. The Excel client
                    master list is a current snapshot and is not filtered by
                    these dates.
                  </p>
                </>
              )}
              {page === 'Availability' && (
                <SalesAvailability api={api} today={date} />
              )}
              {['Users', 'Backup & Restore', 'My Account'].includes(page) && (
                <SalesSettings
                  key={page}
                  page={page}
                  api={api}
                  user={user}
                  onSessionChange={onSessionChange}
                  onRestore={load}
                />
              )}
              {page === 'Audit History' && (
                <section className="ws-panel">
                  <h2>Latest 1,000 changes</h2>
                  <p className="ws-muted">
                    Each successful transaction records the actor, time, and
                    before / after values. Times are displayed in Manila.
                  </p>
                  <PagedTable>
                    <table>
                      <thead>
                        <tr>
                          {['Time', 'User', 'Action', 'Record', 'Changes'].map(
                            (s) => (
                              <th key={s}>{s}</th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((r) => (
                          <tr key={r.seq}>
                            <td>
                              {new Date(r.at).toLocaleString('en-PH', {
                                timeZone: 'Asia/Manila',
                              })}
                            </td>
                            <td>{r.actor}</td>
                            <td>{r.action}</td>
                            <td>{r.record_id || 'Workspace'}</td>
                            <td>
                              <details>
                                <summary>View</summary>
                                <pre>
                                  {JSON.stringify(
                                    {
                                      before: r.before_json
                                        ? JSON.parse(r.before_json)
                                        : null,
                                      after: r.after_json
                                        ? JSON.parse(r.after_json)
                                        : null,
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PagedTable>
                </section>
              )}
            </>
          )}
          <footer className="ws-footer">
            Grand Horizon Hotel · Sales & Marketing · Records stored locally on
            this laptop
          </footer>
        </div>
      </main>
      {dialog?.type === 'quote' ? (
        <QuoteDialog
          key={dialog.initial?.id || dialog.initial?.leadId || 'new-quote'}
          {...dialog}
          records={records}
          date={date}
          busy={busy}
          error={dialogError}
          onClose={() => setDialog(null)}
          onAddCustomer={() => {
            setDialog(null)
            setPage('Sales Leads')
            setSearch('')
            setShowArchived(false)
          }}
        />
      ) : (
        dialog && (
          <Dialog
            key={dialog.title}
            {...dialog}
            records={records}
            busy={busy}
            error={dialogError}
            onClose={() => setDialog(null)}
          />
        )
      )}
    </div>
  )
}
export default function SalesMarketingApp({
  user,
  onSignOut,
  onSessionChange,
}) {
  const isAdmin = user.role === 'ADMIN'
  return (
    <Workspace
      user={{
        ...user,
        role: isAdmin
          ? 'Super Admin'
          : user.position === 'SALES_HEAD'
            ? 'Sales Head'
            : 'Sales Staff',
      }}
      signOut={isAdmin ? undefined : onSignOut}
      onSessionChange={onSessionChange}
    />
  )
}
