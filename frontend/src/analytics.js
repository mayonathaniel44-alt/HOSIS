export const cents = n => Math.round(Number(n || 0) * 100);
export const peso = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n || 0));
export function analytics(records, from, to) {
  const active = records.filter(r => !r.archived);
  const period = r => (r.date || r.start || r.createdAt.slice(0,10)) >= from && (r.date || r.start || r.createdAt.slice(0,10)) <= to;
  const sales = active.filter(r => r.kind === 'sales' && period(r));
  const confirmed = sales.filter(r => r.status === 'Confirmed');
  const payments = active.filter(r => r.kind === 'payments' && period(r));
  const sum = rs => rs.reduce((s,r) => s+cents(r.amount),0)/100;
  const receipts = sum(payments.filter(r=>r.type==='Receipt'));
  const refunds = sum(payments.filter(r=>r.type==='Refund'));
  const booked = sum(confirmed);
  const collected = sale => active.filter(p=>p.kind==='payments'&&p.saleId===sale.id).reduce((s,p)=>s+cents(p.amount)*(p.type==='Receipt'?1:-1),0)/100;
  const balance = sale => Math.max(0,cents(sale.status==='Cancelled'?sale.cancellationFee:sale.amount)-cents(collected(sale)))/100;
  const refundable = sale => Math.max(0,cents(collected(sale))-cents(sale.cancellationFee))/100;
  const outstanding = confirmed.reduce((s,r)=>s+cents(balance(r)),0)/100;
  const refundDue = sales.filter(r=>r.status==='Cancelled').reduce((s,r)=>s+cents(refundable(r)),0)/100;
  const cancellationFees=sales.filter(r=>r.status==='Cancelled').reduce((s,r)=>s+cents(r.cancellationFee),0)/100;
  const cancellationFeesDue=sales.filter(r=>r.status==='Cancelled').reduce((s,r)=>s+cents(balance(r)),0)/100;
  const months = new Map();
  confirmed.forEach(r=>{const m=r.date.slice(0,7);months.set(m,(months.get(m)||0)+cents(r.amount));});
  const chart = [...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,n])=>({month,booked:n/100}));
  const leads = active.filter(r=>r.kind==='leads'&&period(r));
  const converted = leads.filter(r=>confirmed.some(s=>s.leadId===r.id));
  const campaigns = active.filter(r=>r.kind==='campaigns').map(c=> {
    const ls=leads.filter(l=>l.campaignId===c.id), ss=confirmed.filter(s=>s.campaignId===c.id);
    const booked=sum(ss);
    return {campaign:c.name,budget:c.budget,lifetimeSpend:c.spent,periodLeads:ls.length,periodBookings:ss.length,periodBookedValue:booked,conversion:ls.length?`${(ls.filter(l=>ss.some(s=>s.leadId===l.id)).length/ls.length*100).toFixed(1)}%`:'N/A',lifetimeROAS:c.spent?active.filter(s=>s.kind==='sales'&&s.status==='Confirmed'&&s.campaignId===c.id).reduce((n,s)=>n+cents(s.amount),0)/100/c.spent:null};
  });
  const channels = [...new Set(leads.map(l=>l.source))].map(name=>({name,leads:leads.filter(l=>l.source===name).length}));
  return {period,sales,confirmed,payments,booked,receipts,refunds,net:receipts-refunds,outstanding,refundDue,cancellationFees,cancellationFeesDue,chart,leads,converted,campaigns,channels,balance,collected,refundable};
}
