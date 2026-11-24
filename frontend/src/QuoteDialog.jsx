import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { peso } from './analytics';

const nextDay = value => new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10);

export default function QuoteDialog({ initial = {}, records, date, onSave, onClose, onAddCustomer, busy, error }) {
  const [values, setValues] = useState(() => ({
    name: initial.name || '', leadId: initial.leadId || '', date: initial.date || date,
    checkIn: initial.checkIn || '', checkOut: initial.checkOut || '',
    validUntil: initial.validUntil || '', gross: initial.gross ?? '',
    promotionId: initial.promotionId || '', notes: initial.notes || '',
  }));
  const [review, setReview] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [validation, setValidation] = useState('');
  const start = useRef(JSON.stringify(values));
  const box = useRef(null), previous = useRef(document.activeElement);
  const customers = records.filter(r => r.kind === 'leads' && !r.archived && !['Lost', 'Converted'].includes(r.status));
  const promotions = records.filter(r => r.kind === 'promotions' && !r.archived && r.status === 'Approved' && r.start <= values.date && r.end >= values.date);
  const customer = customers.find(r => r.id === values.leadId);
  const promotion = promotions.find(r => r.id === values.promotionId);
  const gross = Number(values.gross) || 0;
  const discount = promotion?.discount || 0;
  const total = Math.round(gross * 100 * (100 - discount) / 100) / 100;
  const nights = Math.max(0, Math.round((Date.parse(values.checkOut) - Date.parse(values.checkIn)) / 86400000)) || 0;
  useEffect(() => {
    box.current?.querySelector('select,input,button')?.focus();
    const last = previous.current;
    return () => last?.focus();
  }, []);
  function close() {
    if (JSON.stringify(values) !== start.current) setDiscard(true);
    else onClose();
  }
  function keyboard(event) {
    if (event.key === 'Escape' && !busy) { if (discard) setDiscard(false); else close(); }
    if (event.key !== 'Tab') return;
    const items = [...box.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
  function change(key, value) {
    setValidation('');
    setValues(old => {
      const updated = { ...old, [key]: value };
      if (key === 'leadId' && !old.name) updated.name = customers.find(r => r.id === value)?.subject || '';
      if (key === 'checkIn' && value) {
        if (!old.checkOut || old.checkOut <= value) updated.checkOut = nextDay(value);
        if (!old.validUntil || old.validUntil > value) updated.validUntil = value;
      }
      return updated;
    });
  }
  function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (review) { onSave(values); return; }
    if (!customer) { setValidation('Choose a customer from Sales Leads first.'); return; }
    if (values.checkOut <= values.checkIn) { setValidation('Check-out must be after check-in.'); return; }
    if (values.checkIn < values.date || values.validUntil < values.date || values.validUntil > values.checkIn) {
      setValidation('The reply deadline must be between the quote date and check-in.'); return;
    }
    if (values.promotionId && !promotion) { setValidation('This discount is no longer available. Choose another discount or No discount.'); return; }
    setValidation(''); setReview(true);
  }
  const summary = <section className="quote-summary" aria-label="Price summary">
    <div><span>Full stay price</span><strong>{peso(gross)}</strong></div>
    <div><span>Discount {discount ? `(${discount}%)` : '(none)'}</span><strong>−{peso(Math.round((gross - total) * 100) / 100)}</strong></div>
    <div className="quote-total"><span>Guest pays</span><strong>{peso(total)}</strong></div>
    <p>This is the total for the full stay, including the selected discount.</p>
  </section>;
  return <div className="ws-overlay"><section className="ws-dialog quote-dialog" ref={box} role="dialog" aria-modal="true" aria-labelledby="quote-title" onKeyDown={keyboard}>
    <div className="ws-dialog-heading"><h2 id="quote-title">{discard ? 'Discard unsaved changes?' : review ? 'Check your price quote' : initial.id ? 'Edit price quote' : 'New price quote'}</h2><button type="button" aria-label="Close dialog" onClick={close} disabled={busy}><X size={20}/></button></div>
    {discard ? <><p className="ws-muted">Your quote has not been saved.</p><div className="ws-dialog-footer"><button onClick={() => setDiscard(false)}>Keep editing</button><button className="ws-primary" onClick={onClose}>Discard changes</button></div></> : <form onSubmit={submit}>
      <p className="ws-muted">A price quote tells the guest how much their stay will cost. Saving it does not book a room.</p>
      {review ? <div className="ws-confirmation quote-review"><dl>
        {[['Customer', customer?.name], ['Room / package', values.name], ['Check-in', values.checkIn], ['Check-out', `${values.checkOut} · ${nights} night${nights === 1 ? '' : 's'}`], ['Guest reply deadline', values.validUntil], ['Discount', promotion?.name || 'No discount'], ['Notes', values.notes || 'None']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl><p>After the guest agrees, use Confirm booking and enter the confirmation number from Reservations.</p></div> : <>
        <section className="quote-section"><h3><span>1</span> Customer &amp; room</h3>
          {!customers.length ? <div className="ws-empty quote-empty"><p>Add a potential customer in Sales Leads before creating a quote.</p><button type="button" onClick={onAddCustomer}>Go to Sales Leads</button></div> : <div className="ws-fields">
            <label className="wide">Customer *<select aria-label="Customer" required value={values.leadId} onChange={e => change('leadId', e.target.value)} disabled={busy}><option value="">Choose a customer</option>{customers.map(r => <option key={r.id} value={r.id}>{r.name}{r.subject ? ` — ${r.subject}` : ''}</option>)}</select><small>These customers come from your open Sales Leads.</small></label>
            <label className="wide">Room / package *<input aria-label="Room / package" required maxLength={1000} placeholder="e.g. Deluxe room for 2 guests" value={values.name} onChange={e => change('name', e.target.value)} disabled={busy}/></label>
          </div>}
        </section>
        <section className="quote-section"><h3><span>2</span> Stay dates</h3><div className="ws-fields">
          <label>Check-in *<input aria-label="Check-in" type="date" required min={values.date} value={values.checkIn} onChange={e => change('checkIn', e.target.value)} disabled={busy}/></label>
          <label>Check-out *<input aria-label="Check-out" type="date" required min={values.checkIn ? nextDay(values.checkIn) : values.date} value={values.checkOut} onChange={e => change('checkOut', e.target.value)} disabled={busy}/></label>
          <label className="wide">Guest reply deadline *<input aria-label="Guest reply deadline" type="date" required min={values.date} max={values.checkIn || undefined} value={values.validUntil} onChange={e => change('validUntil', e.target.value)} disabled={busy}/><small>Last day the guest can accept this price. Defaults to check-in; you can choose an earlier day.</small></label>
        </div>{nights > 0 && <p className="quote-hint">{nights} night{nights === 1 ? '' : 's'} · Quote date: {values.date}</p>}</section>
        <section className="quote-section"><h3><span>3</span> Price &amp; discount</h3><div className="ws-fields">
          <label className="wide">Full stay price before discount (PHP) *<input aria-label="Full stay price before discount (PHP)" type="number" required min="0" max="100000000" step="0.01" placeholder="e.g. 6000" value={values.gross} onChange={e => change('gross', e.target.value)} disabled={busy}/><small>Enter the total for all nights, rather than a price per night.</small></label>
          <label className="wide">Discount (optional)<select aria-label="Discount (optional)" value={values.promotionId} onChange={e => change('promotionId', e.target.value)} disabled={busy}><option value="">No discount</option>{values.promotionId && !promotion && <option value={values.promotionId}>Previous discount unavailable — choose again</option>}{promotions.map(r => <option key={r.id} value={r.id}>{r.name} — {r.discount}% off</option>)}</select><small>Only approved offers valid on the quote date are shown.</small></label>
          {promotion && <p className="quote-hint">Offer terms: {promotion.terms}</p>}
          <label className="wide">Notes (optional)<textarea aria-label="Notes (optional)" maxLength={1000} placeholder="e.g. Breakfast included" value={values.notes} onChange={e => change('notes', e.target.value)} disabled={busy}/></label>
        </div></section>
      </>}
      {summary}
      {(validation || error) && <p className="ws-error" role="alert">{validation || error}</p>}
      <div className="ws-dialog-footer"><button type="button" onClick={close} disabled={busy}>Cancel</button>{review && <button type="button" onClick={() => setReview(false)} disabled={busy}>Back to edit</button>}<button className="ws-primary ws-add" disabled={busy || !customers.length}>{busy ? 'Saving…' : review ? 'Save quote' : 'Review quote'}</button></div>
    </form>}
  </section></div>;
}
