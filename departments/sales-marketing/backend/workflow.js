const { randomUUID } = require('node:crypto')
const { today } = require('../../../backend/src/config/db.js')
const { appError } = require('../../../backend/src/lib/errors.js')

const campaignTypes = [
  'Social Media',
  'Email Marketing',
  'Corporate',
  'Promotional',
  'Website',
]
const manager = (user) =>
  user.role === 'ADMIN' ||
  (user.role === 'SALES_MARKETING' && user.position === 'SALES_HEAD')
function fail(message, status = 400) {
  throw appError(status, 'SALES_WORKFLOW', message)
}

function createWorkflow({
  all,
  get,
  save,
  confirmReservation,
  resetPreparation,
}) {
  function text(d, k, required = true) {
    if (d[k] != null && typeof d[k] !== 'string') fail(`${k}: enter text.`)
    const v = d[k] == null ? '' : String(d[k]).trim()
    if ((required && !v) || v.length > 1000)
      fail(`${k}: enter a value of at most 1,000 characters.`)
    return v
  }
  function date(d, k, required = true) {
    const v = text(d, k, required)
    if (!v && !required) return ''
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
      !Number.isFinite(Date.parse(v)) ||
      new Date(v).toISOString().slice(0, 10) !== v
    )
      fail(`${k}: enter a valid date.`)
    return v
  }
  function money(d, k) {
    const raw = String(d[k] ?? '')
    if (
      !/^\d+(\.\d{1,2})?$/.test(raw) ||
      !Number.isSafeInteger(Math.round(Number(raw) * 100)) ||
      Number(raw) > 100000000
    )
      fail(`${k}: enter a nonnegative amount with at most two decimal places.`)
    return Math.round(Number(raw) * 100) / 100
  }
  function choice(d, k, choices) {
    if (!choices.includes(d[k])) fail(`${k}: select ${choices.join(', ')}.`)
    return d[k]
  }
  function link(d, k, kind, required = false) {
    const id = text(d, k, required)
    if (id) get(id, kind)
    return id
  }
  function contact(d) {
    const email = text(d, 'email', false),
      phone = text(d, 'phone', false)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail('Enter a valid email address.')
    if (phone && !/^(09\d{9}|(?:\+?63)9\d{9})$/.test(phone))
      fail(
        'Enter a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX. Letters and extra digits are not allowed.',
      )
    return { email, phone }
  }
  function validate(kind, d, previous) {
    const base = { name: text(d, 'name') }
    if (kind === 'campaigns') {
      const start = date(d, 'start'),
        end = date(d, 'end')
      if (end < start) fail('End date must be on or after start date.')
      const budget = money(d, 'budget'),
        spent = money(d, 'spent')
      if (spent > budget)
        fail(
          'Actual spending exceeds budget. Increase the approved budget first.',
        )
      const legacy = {
        Email: 'Email Marketing',
        Referral: 'Promotional',
        'Walk-in': 'Promotional',
        Other: 'Promotional',
      }
      const type = choice(
        { type: d.type || legacy[d.channel] || d.channel },
        'type',
        campaignTypes,
      )
      return {
        ...base,
        start,
        end,
        budget,
        spent,
        type,
        channel:
          type === 'Email Marketing'
            ? 'Email'
            : type === 'Promotional'
              ? 'Other'
              : type,
        status: choice(d, 'status', [
          'Draft',
          'Active',
          'Completed',
          'Cancelled',
        ]),
      }
    }
    if (kind === 'clients') {
      const email = contact(d)
      const duplicate = all().find(
        (r) =>
          r.kind === kind &&
          !r.archived &&
          r.id !== previous?.id &&
          r.name.toLowerCase() === base.name.toLowerCase(),
      )
      if (duplicate)
        fail('A corporate client with this company name already exists.', 409)
      return {
        ...base,
        ...email,
        contact: text(d, 'contact'),
        address: text(d, 'address', false),
      }
    }
    if (kind === 'inquiries' || kind === 'leads') {
      const status = choice(
        d,
        'status',
        kind === 'inquiries'
          ? ['New', 'In Progress', 'Resolved']
          : ['New', 'Qualified', 'Lost'],
      )
      if (previous?.status === 'Converted')
        fail('Converted records are locked; use their linked record.')
      return {
        ...base,
        ...contact(d),
        date: date(d, 'date'),
        subject: text(d, 'subject'),
        source: choice(d, 'source', [
          'Website',
          'Social Media',
          'Email',
          'Referral',
          'Corporate',
          'Walk-in',
          'Other',
        ]),
        campaignId: link(d, 'campaignId', 'campaigns'),
        clientId: link(d, 'clientId', 'clients'),
        status,
        followUp: date(d, 'followUp', false),
        notes: text(d, 'notes', false),
        ...(previous?.inquiryId ? { inquiryId: previous.inquiryId } : {}),
      }
    }
    if (kind === 'promotions') {
      const start = date(d, 'start'),
        end = date(d, 'end'),
        discount = money(d, 'discount')
      if (end < start || discount > 100)
        fail('Check promotion dates and a discount between 0 and 100%.')
      return {
        ...base,
        start,
        end,
        discount,
        campaignId: link(d, 'campaignId', 'campaigns'),
        type: 'Percentage',
        terms: text(d, 'terms'),
        status: 'Pending',
        approvedBy: null,
      }
    }
    if (kind === 'quotations') {
      if (previous?.status === 'Accepted')
        fail('Accepted quotations cannot be edited.')
      const leadId = link(d, 'leadId', 'leads', true),
        lead = get(leadId, 'leads')
      if (['Lost', 'Converted'].includes(lead.status))
        fail('Choose an open lead.')
      const checkIn = date(d, 'checkIn'),
        checkOut = date(d, 'checkOut'),
        validUntil = date(d, 'validUntil'),
        dateValue = date(d, 'date')
      if (dateValue !== (previous?.date || today()))
        fail(
          'New quotations must use today’s date; an existing quotation date cannot change.',
        )
      if (
        checkOut <= checkIn ||
        checkIn < dateValue ||
        validUntil < dateValue ||
        validUntil > checkIn
      )
        fail(
          'Check stay dates and quotation validity (no later than check-in).',
        )
      const gross = money(d, 'gross'),
        promotionId = link(d, 'promotionId', 'promotions')
      let discount = 0
      if (promotionId) {
        const p = get(promotionId, 'promotions')
        if (p.status !== 'Approved' || dateValue < p.start || dateValue > p.end)
          fail('Promotion must be approved and valid on the quotation date.')
        discount = p.discount
      }
      return {
        ...base,
        leadId,
        campaignId: lead.campaignId,
        clientId: lead.clientId,
        date: dateValue,
        checkIn,
        checkOut,
        validUntil,
        gross,
        promotionId,
        discount,
        amount: Math.round((gross * 100 * (100 - discount)) / 100) / 100,
        status: 'Draft',
        notes: text(d, 'notes', false),
      }
    }
    fail('This record is managed through its workflow.')
  }
  function version(req, record) {
    if (req.body?.version !== record.version)
      fail('This record changed in another window. Refresh and try again.', 409)
  }
  function allowed(user, kind) {
    if (['campaigns', 'promotions'].includes(kind) && !manager(user))
      fail('Manager access required.', 403)
  }

  async function runAction(req, r) {
    const action = req.body.action
    if (action === 'convert' && r.kind === 'inquiries') {
      if (
        r.status === 'Converted' ||
        all().some((x) => x.kind === 'leads' && x.inquiryId === r.id)
      )
        fail('This inquiry has already been converted.', 409)
      const lead = save(
        'leads',
        {
          name: r.name,
          email: r.email,
          phone: r.phone,
          date: today(),
          subject: r.subject,
          source: r.source,
          campaignId: r.campaignId,
          clientId: r.clientId,
          status: 'New',
          followUp: r.followUp,
          notes: r.notes,
          inquiryId: r.id,
        },
        req.user,
      )
      save(
        r.kind,
        { ...r, status: 'Converted', leadId: lead.id },
        req.user,
        r,
        'convert inquiry',
      )
      return lead
    }
    if (action === 'approve' && r.kind === 'promotions') {
      if (!manager(req.user)) fail('Manager access required.', 403)
      if (r.createdBy === req.user.id)
        fail('A different manager must approve this promotion.', 403)
      if (r.status !== 'Pending')
        fail('Only pending promotions can be approved.')
      return save(
        r.kind,
        { ...r, status: 'Approved', approvedBy: req.user.id },
        req.user,
        r,
        'approve promotion',
      )
    }
    if (action === 'confirm' && r.kind === 'quotations') {
      if (r.status !== 'Draft' || r.validUntil < today() || r.checkIn < today())
        fail('Quotation is accepted or expired.')
      if (
        all().some(
          (x) =>
            x.kind === 'sales' &&
            (x.quotationId === r.id || x.leadId === r.leadId),
        )
      )
        fail('This lead already has a sale.', 409)
      const lead = get(r.leadId, 'leads')
      if (['Lost', 'Converted'].includes(lead.status))
        fail('Lead is no longer open.')
      if (req.body.availabilityConfirmed !== true)
        fail('Confirm room availability with Reservations first.')
      const reservation = await confirmReservation(
        r,
        text(req.body, 'reservationRef'),
      )
      const reservationRef = reservation.confirmation_code
      if (
        all().some(
          (x) =>
            x.kind === 'sales' &&
            x.reservationRef?.toLowerCase() === reservationRef.toLowerCase(),
        )
      )
        fail('Reservation reference already exists.', 409)
      const sale = save(
        'sales',
        {
          name: lead.name,
          item: r.name,
          date: today(),
          amount: r.amount,
          gross: r.gross,
          discount: r.discount,
          quotationId: r.id,
          leadId: r.leadId,
          campaignId: r.campaignId,
          clientId: r.clientId,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          reservationRef,
          reservationId: reservation.id,
          preparation: text(req.body, 'preparation', false),
          availabilityConfirmedBy: req.user.id,
          status: 'Confirmed',
          notes: r.notes,
        },
        req.user,
      )
      save(
        r.kind,
        { ...r, status: 'Accepted', saleId: sale.id },
        req.user,
        r,
        'accept quotation',
      )
      save(
        'leads',
        { ...lead, status: 'Converted', saleId: sale.id },
        req.user,
        lead,
        'convert lead',
      )
      return sale
    }
    if (
      action === 'preparation' &&
      r.kind === 'sales' &&
      r.reservationId &&
      r.status !== 'Cancelled'
    ) {
      const preparation = text(req.body, 'preparation', false)
      if (preparation === (r.preparation || '')) return r
      await resetPreparation(r.reservationId)
      return save(
        r.kind,
        { ...r, preparation },
        req.user,
        r,
        'update preparation',
      )
    }
    if (action === 'cancel' && r.kind === 'sales') {
      if (!manager(req.user)) fail('Manager access required.', 403)
      if (r.status === 'Cancelled') fail('Sale already cancelled.')
      const fee = Math.round(Math.round(r.amount * 100) * 0.1) / 100
      const paid =
        all()
          .filter((p) => p.kind === 'payments' && p.saleId === r.id)
          .reduce(
            (n, p) =>
              n + Math.round(p.amount * 100) * (p.type === 'Receipt' ? 1 : -1),
            0,
          ) / 100
      return save(
        r.kind,
        {
          ...r,
          status: 'Cancelled',
          cancellationReason: text(req.body, 'reason'),
          cancellationDate: today(),
          cancellationFee: fee,
          cancellationFeeRate: 0.1,
          cancellationFeeBasis: 'full-booking-value',
          paidAtCancellation: paid,
          refundableAtCancellation: Math.max(
            0,
            Math.round((paid - fee) * 100) / 100,
          ),
        },
        req.user,
        r,
        'cancel sale',
      )
    }
    if (action === 'payment' && r.kind === 'sales') {
      if (!manager(req.user))
        fail('Manager access required to reconcile Finance records.', 403)
      const amount = money(req.body, 'amount')
      if (amount <= 0) fail('Payment must be greater than zero.')
      const type = choice(req.body, 'type', ['Receipt', 'Refund']),
        externalReference = text(req.body, 'externalReference'),
        dateValue = date(req.body, 'date')
      if (dateValue < r.date || dateValue > today())
        fail('Payment date must fall between sale date and today.')
      if (
        externalReference &&
        all().some(
          (x) =>
            x.kind === 'payments' &&
            x.externalReference?.toLowerCase() ===
              externalReference.toLowerCase(),
        )
      )
        fail('External Finance reference already exists.', 409)
      const net = all()
        .filter((x) => x.kind === 'payments' && x.saleId === r.id)
        .reduce(
          (n, p) =>
            n + Math.round(p.amount * 100) * (p.type === 'Receipt' ? 1 : -1),
          0,
        )
      const cents = Math.round(amount * 100)
      const fee =
        r.status === 'Cancelled'
          ? Math.round((r.cancellationFee || 0) * 100)
          : 0
      const payable =
        r.status === 'Cancelled' ? fee : Math.round(r.amount * 100)
      if (type === 'Receipt' && cents + net > payable)
        fail(
          'Receipt exceeds the outstanding booking balance or cancellation fee.',
        )
      if (type === 'Refund' && cents > Math.max(0, net - fee))
        fail(
          r.status === 'Cancelled'
            ? 'Refund exceeds the available amount after retaining the 10% cancellation fee.'
            : 'Refund exceeds net collected payments.',
        )
      const reference = `${type === 'Receipt' ? 'RCP' : 'RFN'}-${randomUUID()}`
      const p = save(
        'payments',
        {
          name: r.name,
          saleId: r.id,
          date: dateValue,
          amount,
          type,
          reference,
          externalReference,
          notes: text(req.body, 'notes', false),
        },
        req.user,
      )
      save(
        r.kind,
        {
          ...r,
          payment:
            net + cents * (type === 'Receipt' ? 1 : -1) >= payable
              ? 'Paid'
              : 'Pending',
        },
        req.user,
        r,
        'reconcile payment',
      )
      return p
    }
    fail('Action not available for this record.')
  }

  return { validate, allowed, version, runAction }
}

module.exports = { createWorkflow, fail, manager }
