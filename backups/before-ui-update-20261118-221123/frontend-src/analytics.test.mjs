import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analytics} from './analytics.js';
const r=(kind,id,data)=>({kind,id,createdAt:'2026-11-01T00:00:00Z',archived:false,...data});
test('period reports distinguish booking dates, collection dates, refunds and cancellations',()=>{
  const records=[r('sales','s1',{date:'2026-11-01',amount:100.1,status:'Confirmed',leadId:'l1',campaignId:'c1'}),r('sales','s2',{date:'2025-11-01',amount:999,status:'Confirmed'}),r('sales','s3',{date:'2026-11-01',amount:30,status:'Cancelled'}),r('payments','p1',{saleId:'s1',date:'2026-11-02',type:'Receipt',amount:50.05}),r('payments','p2',{saleId:'s3',date:'2026-11-02',type:'Receipt',amount:30}),r('payments','p3',{saleId:'s3',date:'2026-11-03',type:'Refund',amount:20}),r('leads','l1',{date:'2026-11-01',source:'Website',campaignId:'c1'}),r('campaigns','c1',{name:'Campaign',budget:100,spent:50})];
  const a=analytics(records,'2026-11-01','2026-11-30');assert.equal(a.booked,100.1);assert.equal(a.receipts,80.05);assert.equal(a.refunds,20);assert.equal(a.outstanding,50.05);assert.equal(a.refundDue,10);assert.equal(a.converted.length,1);assert.equal(a.chart[0].booked,100.1);assert.equal(a.campaigns[0].lifetimeROAS,2.002);
  const old=analytics(records,'2025-01-01','2025-12-31');assert.equal(old.booked,999);assert.equal(old.receipts,0);
  const empty=analytics(records,'2027-01-01','2027-12-31');assert.equal(empty.booked,0);assert.equal(empty.chart.length,0);
});
