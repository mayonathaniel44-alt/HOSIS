const source=require('./starter-data.json');
const {randomUUID}=require('node:crypto');
function importStarter(db,user,all,save,today,receiptReference) {
  if(db.prepare("SELECT 1 FROM business_meta WHERE key='original-starter-v1'").get())return {added:0,retired:0};
  return db.transaction(()=>{
    const before=all(),at=new Date().toISOString();
    // Retain a complete recovery snapshot before replacing only untouched generated samples.
    if(before.length)db.prepare('INSERT INTO business_recovery VALUES(?,?,?)').run(randomUUID(),JSON.stringify({format:'hosis-business-v1',exportedAt:at,records:before}),at);
    const seededAt=db.prepare("SELECT value FROM business_meta WHERE key='example-pack-v1'").get()?.value;
    const oldPack=before.filter(r=>r.isExample&&seededAt&&r.updatedAt<=seededAt);
    const oldIds=new Set(oldPack.map(r=>r.id));
    const hasUserDependents=before.some(r=>!oldIds.has(r.id)&&!r.archived&&Object.entries(r).some(([k,v])=>k.endsWith('Id')&&oldIds.has(v)));
    let retired=0,added=0;
    if(!hasUserDependents)for(const r of oldPack){
      db.prepare('UPDATE business_records SET archived=1,version=version+1,updated_at=? WHERE id=?').run(at,r.id);retired++;
      db.prepare('INSERT INTO business_audit(actor_id,actor,action,record_id,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)').run(user.id,user.username,'replace untouched generated sample',r.id,JSON.stringify(r),JSON.stringify({...r,archived:true,version:r.version+1,updatedAt:at}),at);
    }
    const add=(kind,data)=>{
      const existing=all().find(r=>r.kind===kind&&!r.archived&&((r.originalId&&r.originalId===data.originalId)||(kind==='clients'&&r.name.toLowerCase()===data.name.toLowerCase())));
      if(existing)return existing;
      added++;return save(kind,{...data,starterData:true},user);
    };
    for(const c of source.campaigns)add('campaigns',{...c,id:undefined,originalId:String(c.id),spent:0,channel:c.type==='Email Marketing'?'Email':c.type,status:c.status==='Pending'?'Draft':c.status});
    const clients=new Map();
    for(const c of source.clients)clients.set(c.company,add('clients',{name:c.company,originalId:c.id,contact:c.contact,email:c.email,phone:c.phone,address:''}));
    for(const i of source.inquiries)add('inquiries',{name:i.guest,originalId:i.id,subject:i.subject,date:i.date,status:i.status,email:'',phone:'',source:'Other',campaignId:'',clientId:'',followUp:'',notes:'Imported from the original starter data.'});
    const leads=[];
    for(const l of source.leads)leads.push(add('leads',{name:l.name,originalId:l.id,contact:l.contact,email:l.email,phone:clients.get(l.name)?.phone||'',date:today(),subject:'Corporate accommodation inquiry',source:l.source,status:l.status,campaignId:'',clientId:clients.get(l.name)?.id||'',followUp:'',notes:'Imported from the original starter data.'}));
    const later=n=>new Date(Date.parse(today())+86400000*n).toISOString().slice(0,10);
    leads.forEach((l,i)=>add('quotations',{name:i?'Corporate Package':'Deluxe Room Package',originalId:`QUO-00${i+1}`,leadId:l.id,clientId:l.clientId,campaignId:'',date:today(),validUntil:later(5),checkIn:later(7),checkOut:later(9),gross:i?12000:5500,amount:i?12000:5500,discount:0,promotionId:'',status:'Draft',notes:'Starter quotation for the existing corporate lead.'}));
    for(const p of source.promotions)add('promotions',{name:p.name,originalId:p.id,discount:p.discount,type:p.type,start:p.start,end:p.end,campaignId:'',terms:p.type,status:'Pending',approvedBy:null,originalStatus:p.status});
    for(const s of source.sales){
      const sale=add('sales',{name:s.customer,originalId:s.id,item:s.item,date:s.date,amount:s.amount,gross:s.amount,discount:0,status:'Confirmed',quotationId:'',leadId:'',campaignId:'',clientId:'',checkIn:'',checkOut:'',reservationRef:`ORIGINAL-${s.id}`,legacyImported:true,notes:'Imported starter sale. The original file did not contain reservation or stay-date details.'});
      if(s.payment==='Paid'&&!all().some(r=>r.kind==='payments'&&r.saleId===sale.id))add('payments',{name:s.customer,originalId:`PAY-${s.id}`,saleId:sale.id,date:s.date,amount:s.amount,type:'Receipt',reference:receiptReference(db,'Receipt',s.date),externalReference:'',notes:'Imported Paid status from the original starter data.'});
    }
    db.prepare('INSERT INTO business_meta VALUES(?,?)').run('original-starter-v1',at);
    return {added,retired};
  })();
}
module.exports={importStarter};
