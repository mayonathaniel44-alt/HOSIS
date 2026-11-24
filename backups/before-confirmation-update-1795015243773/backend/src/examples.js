function seedExamples(db,user,save,today,receiptReference) {
  if(db.prepare("SELECT 1 FROM business_meta WHERE key='example-pack-v1'").get())return {added:0};
  return db.transaction(()=>{
    let added=0;
    const day=today(),later=n=>new Date(Date.parse(day)+86400000*n).toISOString().slice(0,10);
    const add=(kind,data)=>{added++;return save(kind,{...data,isExample:true},user);};
    const update=(r,values)=>save(r.kind,{...r,...values},user,r,'update');
    const c1=add('campaigns',{name:'Example · Weekend Escape',type:'Social Media',channel:'Social Media',start:day,end:later(30),budget:15000,spent:3000,status:'Active'});
    const c2=add('campaigns',{name:'Example · Corporate Stays',type:'Email Marketing',channel:'Email',start:day,end:later(45),budget:20000,spent:4500,status:'Active'});
    const cl1=add('clients',{name:'Example · Horizon Business Group',contact:'Sample Contact A',email:'contact-a@example.test',phone:'09170000001',address:'Sample business address — fictional data'});
    const cl2=add('clients',{name:'Example · Summit Events',contact:'Sample Contact B',email:'contact-b@example.test',phone:'09170000002',address:'Sample event office — fictional data'});
    const i1=add('inquiries',{name:'Example · Maria Santos',email:'maria@example.test',phone:'09170000003',date:day,subject:'Deluxe room for two guests',source:'Social Media',campaignId:c1.id,clientId:'',status:'New',followUp:day,notes:'Fictional example. No real guest or reservation.'});
    add('inquiries',{name:'Example · Corporate event inquiry',email:'events@example.test',phone:'09170000004',date:day,subject:'Accommodation for an employee event',source:'Email',campaignId:c2.id,clientId:cl2.id,status:'New',followUp:later(1),notes:'Fictional example for follow-up practice.'});
    const l1=add('leads',{name:i1.name,email:i1.email,phone:i1.phone,date:day,subject:i1.subject,source:i1.source,campaignId:c1.id,clientId:'',inquiryId:i1.id,status:'Qualified',followUp:day,notes:i1.notes});
    update(i1,{status:'Converted',leadId:l1.id});
    const l2=add('leads',{name:'Example · Employee accommodation',email:'hr@example.test',phone:'09170000005',date:day,subject:'Two-night corporate stay',source:'Email',campaignId:c2.id,clientId:cl1.id,status:'Qualified',followUp:later(1),notes:'Fictional corporate lead awaiting acceptance.'});
    add('promotions',{name:'Example · Weekend Room Discount',campaignId:c1.id,start:day,end:later(30),discount:10,terms:'Example: selected weekend room packages only; subject to availability.',status:'Pending',approvedBy:null});
    add('promotions',{name:'Example · Corporate Saver',campaignId:c2.id,start:day,end:later(45),discount:15,terms:'Example: corporate stays of at least two nights. Requires approval by another manager.',status:'Pending',approvedBy:null});
    const q1=add('quotations',{name:'Example · Deluxe weekend package',leadId:l1.id,campaignId:c1.id,clientId:'',date:day,validUntil:later(5),checkIn:later(7),checkOut:later(9),gross:5500,discount:0,amount:5500,promotionId:'',status:'Draft',notes:'Fictional example quotation; no external booking.'});
    add('quotations',{name:'Example · Corporate two-night package',leadId:l2.id,campaignId:c2.id,clientId:cl1.id,date:day,validUntil:later(6),checkIn:later(10),checkOut:later(12),gross:12000,discount:0,amount:12000,promotionId:'',status:'Draft',notes:'Fictional example. Confirm actual availability before a real sale.'});
    const sale=add('sales',{name:l1.name,item:q1.name,date:day,amount:5500,gross:5500,discount:0,quotationId:q1.id,leadId:l1.id,campaignId:c1.id,clientId:'',checkIn:q1.checkIn,checkOut:q1.checkOut,reservationRef:`EXAMPLE-RSV-${day.replaceAll('-','')}-001`,availabilityConfirmedBy:user.id,status:'Confirmed',notes:'Fictional sale example. Not a real Reservations confirmation.'});
    update(q1,{status:'Accepted',saleId:sale.id});update(l1,{status:'Converted',saleId:sale.id});
    add('payments',{name:sale.name,saleId:sale.id,date:day,amount:2000,type:'Receipt',reference:receiptReference(db,'Receipt',day),externalReference:'EXAMPLE-FINANCE-001',notes:'Fictional deposit example. No money was processed.'});
    db.prepare('INSERT INTO business_meta VALUES(?,?)').run('example-pack-v1',new Date().toISOString());
    return {added};
  })();
}
module.exports={seedExamples};
