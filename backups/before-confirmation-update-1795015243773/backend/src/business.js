const express = require('express');
const { randomUUID, randomBytes, scryptSync, createHash, timingSafeEqual } = require('node:crypto');
const roles = ['Super Admin', 'Manager', 'Sales Staff'];
const types = ['campaigns', 'inquiries', 'leads', 'clients', 'promotions', 'quotations', 'sales', 'payments'];
const campaignTypes=['Social Media','Email Marketing','Corporate','Promotional','Website'];
const {initializeNotifications,notify,receiptReference}=require('./notifications');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function initializeBusiness(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS business_records (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0, created_by INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS business_kind ON business_records(kind, archived);
  CREATE TABLE IF NOT EXISTS business_audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL,
    actor TEXT NOT NULL, action TEXT NOT NULL, record_id TEXT, before_json TEXT, after_json TEXT, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS business_recovery (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, at TEXT NOT NULL);`);
}
function unpack(r) { return r && { ...JSON.parse(r.data), id: r.id, kind: r.kind, version: r.version, archived: !!r.archived, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at }; }
function createBusinessRouter(db) {
  initializeBusiness(db);
  initializeNotifications(db);
  const router = express.Router();
  const manager = u => ['Super Admin', 'Manager'].includes(u.role);
  const all = () => db.prepare('SELECT * FROM business_records ORDER BY created_at DESC, id').all().map(unpack);
  const get = (id, kind, archived = false) => {
    const r = unpack(db.prepare('SELECT * FROM business_records WHERE id=?').get(id));
    if (!r || (kind && r.kind !== kind) || (!archived && r.archived)) fail('Linked record is missing or archived.', 404);
    return r;
  };
  function audit(user, action, id, before, after) {
    db.prepare('INSERT INTO business_audit(actor_id,actor,action,record_id,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)')
      .run(user.id, user.username, action, id || null, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString());
    notify(db,user,action,id,before,after);
  }
  function save(kind, data, user, previous, action = previous ? 'update' : 'create') {
    if(previous?.isExample)data={...data,isExample:true};
    const at = new Date().toISOString();
    const id = previous?.id || `${kind.slice(0,3).toUpperCase()}-${randomUUID()}`;
    if (previous) db.prepare('UPDATE business_records SET data=?,version=version+1,updated_at=? WHERE id=?').run(JSON.stringify(data), at, id);
    else db.prepare('INSERT INTO business_records VALUES(?,?,?,1,0,?,?,?)').run(id, kind, JSON.stringify(data), user.id, at, at);
    const result = get(id, kind);
    audit(user, action, id, previous, result);
    return result;
  }
  function text(d, k, required = true) {
    const v = d[k] == null ? '' : String(d[k]).trim();
    if ((required && !v) || v.length > 1000) fail(`${k}: enter a value of at most 1,000 characters.`);
    return v;
  }
  function date(d, k, required = true) {
    const v = text(d, k, required);
    if (!v && !required) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) fail(`${k}: enter a valid date.`);
    return v;
  }
  function money(d, k) {
    const raw = String(d[k] ?? '');
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(Math.round(Number(raw)*100)) || Number(raw) > 100000000) fail(`${k}: enter a nonnegative amount with at most two decimal places.`);
    return Math.round(Number(raw)*100)/100;
  }
  function choice(d, k, choices) { if (!choices.includes(d[k])) fail(`${k}: select ${choices.join(', ')}.`); return d[k]; }
  function link(d, k, kind, required = false) { const id = text(d,k,required); if (id) get(id,kind); return id; }
  function contact(d) {
    const email = text(d,'email',false), phone = text(d,'phone',false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
    if (phone && !/^[+\d ()-]{7,25}$/.test(phone)) fail('Enter a valid phone number.');
    return { email, phone };
  }
  function validate(kind, d, previous, user) {
    const base = { name: text(d,'name') };
    if (kind === 'campaigns') {
      const start = date(d,'start'), end = date(d,'end');
      if (end < start) fail('End date must be on or after start date.');
      const budget = money(d,'budget'), spent = money(d,'spent');
      if (spent > budget) fail('Actual spending exceeds budget. Increase the approved budget first.');
      const legacy={Email:'Email Marketing',Referral:'Promotional','Walk-in':'Promotional',Other:'Promotional'};
      const type=choice({type:d.type||legacy[d.channel]||d.channel},'type',campaignTypes);
      return {...base,start,end,budget,spent,type,channel:type==='Email Marketing'?'Email':type==='Promotional'?'Other':type,status:choice(d,'status',['Draft','Active','Completed','Cancelled'])};
    }
    if (kind === 'clients') {
      const email = contact(d);
      const duplicate = all().find(r=>r.kind===kind && !r.archived && r.id!==previous?.id && r.name.toLowerCase()===base.name.toLowerCase());
      if (duplicate) fail('A corporate client with this company name already exists.',409);
      return {...base,...email,contact:text(d,'contact'),address:text(d,'address',false)};
    }
    if (kind === 'inquiries' || kind === 'leads') {
      const status = choice(d,'status',kind==='inquiries'?['New','In Progress','Resolved']:['New','Qualified','Lost']);
      if (previous?.status==='Converted') fail('Converted records are locked; use their linked record.');
      return {...base,...contact(d),date:date(d,'date'),subject:text(d,'subject'),source:choice(d,'source',['Website','Social Media','Email','Referral','Corporate','Walk-in','Other']),campaignId:link(d,'campaignId','campaigns'),clientId:link(d,'clientId','clients'),status,followUp:date(d,'followUp',false),notes:text(d,'notes',false),...(previous?.inquiryId?{inquiryId:previous.inquiryId}:{})};
    }
    if (kind === 'promotions') {
      const start=date(d,'start'), end=date(d,'end'), discount=money(d,'discount');
      if (end<start || discount>100) fail('Check promotion dates and a discount between 0 and 100%.');
      return {...base,start,end,discount,campaignId:link(d,'campaignId','campaigns'),terms:text(d,'terms'),status:'Pending',approvedBy:null};
    }
    if (kind === 'quotations') {
      if (previous?.status==='Accepted') fail('Accepted quotations cannot be edited.');
      const leadId=link(d,'leadId','leads',true), lead=get(leadId,'leads');
      if (['Lost','Converted'].includes(lead.status)) fail('Choose an open lead.');
      const checkIn=date(d,'checkIn'), checkOut=date(d,'checkOut'), validUntil=date(d,'validUntil'), dateValue=date(d,'date');
      if (dateValue !== (previous?.date || today())) fail('New quotations must use today’s date; an existing quotation date cannot change.');
      if (checkOut<=checkIn || checkIn<dateValue || validUntil<dateValue || validUntil>checkIn) fail('Check stay dates and quotation validity (no later than check-in).');
      const gross=money(d,'gross'), promotionId=link(d,'promotionId','promotions');
      let discount=0;
      if (promotionId) {
        const p=get(promotionId,'promotions');
        if(p.status!=='Approved' || dateValue<p.start || dateValue>p.end) fail('Promotion must be approved and valid on the quotation date.');
        discount=p.discount;
      }
      return {...base,leadId,campaignId:lead.campaignId,clientId:lead.clientId,date:dateValue,checkIn,checkOut,validUntil,gross,promotionId,discount,amount:Math.round(gross*100*(100-discount)/100)/100,status:'Draft',notes:text(d,'notes',false),...(lead.isExample?{isExample:true}:{})};
    }
    fail('This record is managed through its workflow.');
  }
  function version(req, record) { if (req.body.version !== record.version) fail('This record changed in another window. Refresh and try again.',409); }
  function allowed(user, kind) { if (['campaigns','promotions'].includes(kind) && !manager(user)) fail('Manager access required.',403); }
  router.use((req,res,next)=> {
    res.set('Cache-Control','no-store');
    const cookiePrefix='hosis_improved_session=';
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookiePrefix))?.slice(cookiePrefix.length)||'';
    const hash=createHash('sha256').update(token).digest('hex');
    req.sessionHash=hash;
    req.user=db.prepare('SELECT u.id,u.username,u.name,u.role FROM auth_users u JOIN auth_sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash,Date.now());
    if(!req.user || req.user.role==='Disabled') return res.status(401).json({message:'Please sign in again.'});
    if(req.method!=='GET' && req.headers.origin) {
      try { if(new URL(req.headers.origin).host!==req.headers.host) return res.status(403).json({message:'Request not allowed.'}); }
      catch { return res.status(403).json({message:'Request not allowed.'}); }
    }
    next();
  });
  router.get('/workspace',(req,res)=>res.json({records:all(),today:today(),user:req.user}));
  router.get('/notifications',(req,res)=>res.json({items:db.prepare('SELECT id,title,message,record_id AS recordId,kind,read_at AS readAt,at FROM business_notifications WHERE user_id=? ORDER BY at DESC,id LIMIT 100').all(req.user.id),unread:db.prepare('SELECT COUNT(*) AS n FROM business_notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id).n}));
  router.post('/notifications/read',(req,res,next)=>{try{
    const id=req.body.id;
    if(id)db.prepare('UPDATE business_notifications SET read_at=? WHERE id=? AND user_id=?').run(new Date().toISOString(),id,req.user.id);
    else db.prepare('UPDATE business_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(new Date().toISOString(),req.user.id);
    res.json({success:true});
  }catch(e){next(e);}});
  router.get('/report',async(req,res,next)=>{try{
    const from=date(req.query,'from'),to=date(req.query,'to');if(from>to)fail('Choose a valid date range.');
    const book=await require('./report').createReport(all(),from,to,req.user,req.query.includeExamples!=='false');
    res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition',`attachment; filename="HOSIS-sales-${from}-to-${to}.xlsx"`);
    res.send(Buffer.from(await book.xlsx.writeBuffer()));
  }catch(e){next(e);}});
  router.post('/examples',(req,res,next)=>{try{
    if(req.user.role!=='Super Admin')fail('Administrator access required.',403);
    res.json(require('./examples').seedExamples(db,req.user,save,today,receiptReference));
  }catch(e){next(e);}});
  router.post('/starter',(req,res,next)=>{try{
    if(req.user.role!=='Super Admin')fail('Administrator access required.',403);
    res.json(require('./starter').importStarter(db,req.user,all,save,today,receiptReference));
  }catch(e){next(e);}});
  if(process.env.HOSIS_STARTER_DATA==='1'){
    const admin=db.prepare("SELECT id,username,name,role FROM auth_users WHERE role='Super Admin' ORDER BY id LIMIT 1").get();
    if(admin)require('./starter').importStarter(db,admin,all,save,today,receiptReference);
  }
  if(process.env.HOSIS_SEED_EXAMPLES==='1') {
    const admin=db.prepare("SELECT id,username,name,role FROM auth_users WHERE role='Super Admin' ORDER BY id LIMIT 1").get();
    if(admin)require('./examples').seedExamples(db,admin,save,today,receiptReference);
  }
  router.post('/password',(req,res,next)=>{try{
    const current=text(req.body,'currentPassword'), password=text(req.body,'password');
    if(current.length>256||password.length<12||password.length>128||password!==req.body.confirmPassword||password===current) fail('Use a different password of 12–128 characters and confirm it exactly.');
    const u=db.prepare('SELECT salt,password_hash FROM auth_users WHERE id=?').get(req.user.id);
    if(!timingSafeEqual(scryptSync(current,u.salt,64),Buffer.from(u.password_hash,'hex'))) fail('Current password is incorrect.',403);
    const salt=randomBytes(32).toString('hex');
    db.transaction(()=>{db.prepare('UPDATE auth_users SET salt=?,password_hash=? WHERE id=?').run(salt,scryptSync(password,salt,64).toString('hex'),req.user.id);db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?').run(req.user.id,req.sessionHash);audit(req.user,'change own password',String(req.user.id),null,{otherSessionsRevoked:true});})();res.json({success:true});
  }catch(e){next(e);}});
  router.post('/records/:kind',(req,res,next)=> { try {
    const kind=req.params.kind;
    if(!types.includes(kind)) fail('Unknown record type.');
    allowed(req.user,kind);
    const result=db.transaction(()=>save(kind,validate(kind,req.body,null,req.user),req.user))();
    res.status(201).json(result);
  } catch(e){next(e);} });
  router.put('/records/:id',(req,res,next)=> { try {
    const result=db.transaction(()=> {
      const r=get(req.params.id); version(req,r); allowed(req.user,r.kind);
      return save(r.kind,validate(r.kind,req.body,r,req.user),req.user,r);
    })();res.json(result);
  } catch(e){next(e);} });
  router.post('/records/:id/archive',(req,res,next)=> { try {
    if(!manager(req.user)) fail('Manager access required.',403);
    db.transaction(()=> {
      const r=get(req.params.id,null,true);version(req,r);
      if(['sales','payments'].includes(r.kind)||r.status==='Converted'||r.status==='Accepted') fail('Financial or converted records cannot be archived.');
      if(!r.archived && all().some(x=>!x.archived && x.id!==r.id && Object.entries(x).some(([k,v])=>k.endsWith('Id') && v===r.id))) fail('This record is linked to another active record.');
      db.prepare('UPDATE business_records SET archived=?,version=version+1,updated_at=? WHERE id=?').run(r.archived?0:1,new Date().toISOString(),r.id);
      audit(req.user,r.archived?'restore record':'archive',r.id,r,get(r.id,null,true));
    })();res.json({success:true});
  } catch(e){next(e);} });
  router.post('/records/:id/delete',(req,res,next)=>{try{
    if(!manager(req.user))fail('Manager access required.',403);
    db.transaction(()=>{
      const r=get(req.params.id);version(req,r);
      if(['sales','payments'].includes(r.kind)||['Converted','Accepted'].includes(r.status))fail('Use cancellation or refunds to preserve financial and converted record history.');
      if(all().some(x=>x.id!==r.id&&Object.entries(x).some(([k,v])=>k.endsWith('Id')&&v===r.id)))fail('This record is linked to another record and must remain available for history.');
      db.prepare('UPDATE business_records SET archived=1,version=version+1,updated_at=? WHERE id=?').run(new Date().toISOString(),r.id);
      audit(req.user,'delete record',r.id,r,get(r.id,null,true));
    })();res.json({success:true});
  }catch(e){next(e);}});
  router.post('/records/:id/action',(req,res,next)=> { try {
    const result=db.transaction(()=> {
      const r=get(req.params.id);version(req,r);
      const action=req.body.action;
      if(action==='convert' && r.kind==='inquiries') {
        if(r.status==='Converted'||all().some(x=>x.kind==='leads'&&x.inquiryId===r.id)) fail('This inquiry has already been converted.',409);
        const lead=save('leads',{name:r.name,email:r.email,phone:r.phone,date:today(),subject:r.subject,source:r.source,campaignId:r.campaignId,clientId:r.clientId,status:'New',followUp:r.followUp,notes:r.notes,inquiryId:r.id,...(r.isExample?{isExample:true}:{})},req.user);
        save(r.kind,{...r,status:'Converted',leadId:lead.id},req.user,r,'convert inquiry'); return lead;
      }
      if(action==='approve' && r.kind==='promotions') {
        if(!manager(req.user)) fail('Manager access required.',403);
        if(r.createdBy===req.user.id) fail('A different manager must approve this promotion.',403);
        if(r.status!=='Pending') fail('Only pending promotions can be approved.');
        return save(r.kind,{...r,status:'Approved',approvedBy:req.user.id},req.user,r,'approve promotion');
      }
      if(action==='confirm' && r.kind==='quotations') {
        if(r.status!=='Draft'||r.validUntil<today()||r.checkIn<today()) fail('Quotation is accepted or expired.');
        if(all().some(x=>x.kind==='sales'&&(x.quotationId===r.id||x.leadId===r.leadId))) fail('This lead already has a sale.',409);
        const lead=get(r.leadId,'leads');
        if(['Lost','Converted'].includes(lead.status)) fail('Lead is no longer open.');
        if(req.body.availabilityConfirmed!==true) fail('Confirm room availability with Reservations first.');
        const reservationRef=text(req.body,'reservationRef');
        if(all().some(x=>x.kind==='sales'&&x.reservationRef.toLowerCase()===reservationRef.toLowerCase())) fail('Reservation reference already exists.',409);
        const sale=save('sales',{name:lead.name,item:r.name,date:today(),amount:r.amount,gross:r.gross,discount:r.discount,quotationId:r.id,leadId:r.leadId,campaignId:r.campaignId,clientId:r.clientId,checkIn:r.checkIn,checkOut:r.checkOut,reservationRef,availabilityConfirmedBy:req.user.id,status:'Confirmed',notes:r.notes,...(r.isExample?{isExample:true}:{})},req.user);
        save(r.kind,{...r,status:'Accepted',saleId:sale.id},req.user,r,'accept quotation');
        save('leads',{...lead,status:'Converted',saleId:sale.id},req.user,lead,'convert lead');return sale;
      }
      if(action==='cancel' && r.kind==='sales') {
        if(!manager(req.user)) fail('Manager access required.',403);
        if(r.status==='Cancelled') fail('Sale already cancelled.');
        return save(r.kind,{...r,status:'Cancelled',cancellationReason:text(req.body,'reason')},req.user,r,'cancel sale');
      }
      if(action==='payment' && r.kind==='sales') {
        if(!manager(req.user)) fail('Manager access required to reconcile Finance records.',403);
        const amount=money(req.body,'amount'); if(amount<=0) fail('Payment must be greater than zero.');
        const type=choice(req.body,'type',['Receipt','Refund']), externalReference=text(req.body,'externalReference',false), dateValue=date(req.body,'date');
        if(dateValue<r.date||dateValue>today()) fail('Payment date must fall between sale date and today.');
        if(externalReference&&all().some(x=>x.kind==='payments'&&x.externalReference?.toLowerCase()===externalReference.toLowerCase())) fail('External Finance reference already exists.',409);
        const net=all().filter(x=>x.kind==='payments'&&x.saleId===r.id).reduce((n,p)=>n+Math.round(p.amount*100)*(p.type==='Receipt'?1:-1),0);
        const cents=Math.round(amount*100);
        if(type==='Receipt'&&(r.status!=='Confirmed'||cents+net>Math.round(r.amount*100))) fail('Receipt exceeds outstanding balance or sale is cancelled.');
        if(type==='Refund'&&cents>net) fail('Refund exceeds net collected payments.');
        const reference=receiptReference(db,type,dateValue);
        const p=save('payments',{name:r.name,saleId:r.id,date:dateValue,amount,type,reference,externalReference,notes:text(req.body,'notes',false),...(r.isExample?{isExample:true}:{})},req.user);
        save(r.kind,{...r},req.user,r,'reconcile payment');return p;
      }
      fail('Action not available for this record.');
    })();res.json(result);
  } catch(e){next(e);} });
  router.get('/audit',(req,res,next)=> {try {
    if(!manager(req.user)) fail('Manager access required.',403);
    res.json(db.prepare('SELECT * FROM business_audit ORDER BY seq DESC LIMIT 1000').all());
  } catch(e){next(e);} });
  router.get('/users',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    res.json(db.prepare('SELECT id,username,name,role FROM auth_users ORDER BY id').all());
  } catch(e){next(e);} });
  router.post('/users',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    const username=text(req.body,'username').toLowerCase(), name=text(req.body,'name'), role=choice(req.body,'role',roles), password=text(req.body,'password');
    if(!/^[a-z0-9._-]{3,50}$/.test(username)||password.length<12||password.length>128) fail('Use a username of 3–50 letters/numbers and a password of 12–128 characters.');
    if(db.prepare('SELECT id FROM auth_users WHERE username=?').get(username)) fail('Username already exists.',409);
    const salt=randomBytes(32).toString('hex');
    const result=db.transaction(()=> {
      const result=db.prepare('INSERT INTO auth_users(username,name,role,salt,password_hash) VALUES(?,?,?,?,?)').run(username,name,role,salt,scryptSync(password,salt,64).toString('hex'));
      audit(req.user,'create user',String(result.lastInsertRowid),null,{username,name,role});return result;
    })();res.status(201).json({id:Number(result.lastInsertRowid),username,name,role});
  } catch(e){next(e);} });
  router.post('/users/:id/access',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    const id=Number(req.params.id);if(id===req.user.id) fail('You cannot change your own access.');
    const user=db.prepare('SELECT id,username,name,role FROM auth_users WHERE id=?').get(id);
    if(!user) fail('User not found.',404);
    const role=choice(req.body,'role',[...roles,'Disabled']);
    db.transaction(()=>{db.prepare('UPDATE auth_users SET role=? WHERE id=?').run(role,id);db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id);audit(req.user,'change user access',String(id),user,{...user,role});})();res.json({success:true});
  } catch(e){next(e);} });
  function snapshot() {return {format:'hosis-business-v1',exportedAt:new Date().toISOString(),records:all()};}
  router.get('/backup',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    const s=snapshot();audit(req.user,'export backup',null,null,{records:s.records.length});
    res.set('Content-Disposition',`attachment; filename="HOSIS-backup-${today()}.json"`).json(s);
  } catch(e){next(e);} });
  router.get('/recovery',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    res.json(db.prepare('SELECT id,at FROM business_recovery ORDER BY at DESC').all());
  } catch(e){next(e);} });
  router.get('/recovery/:id',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    const r=db.prepare('SELECT snapshot FROM business_recovery WHERE id=?').get(req.params.id);if(!r) fail('Recovery point not found.',404);
    res.json(JSON.parse(r.snapshot));
  } catch(e){next(e);} });
  router.post('/restore',(req,res,next)=> {try {
    if(req.user.role!=='Super Admin') fail('Administrator access required.',403);
    const s=req.body.snapshot;
    if(req.body.confirm!=='RESTORE'||s?.format!=='hosis-business-v1'||!Array.isArray(s.records)||s.records.length>100000) fail('Select a valid HOSIS backup and type RESTORE.');
    const ids=new Set();
    for(const r of s.records) {
      if(!r || typeof r!=='object'||!types.includes(r.kind)||typeof r.id!=='string'||r.id.length>100||ids.has(r.id)||!Number.isSafeInteger(r.version)||r.version<1||typeof r.name!=='string'||typeof r.archived!=='boolean'||!Number.isInteger(r.createdBy)||!Number.isFinite(Date.parse(r.createdAt))||!Number.isFinite(Date.parse(r.updatedAt))) fail('Backup contains an invalid or duplicate record.');
      ids.add(r.id);
    }
    const recoveryId=randomUUID();
    const previousVersions=new Map(all().map(r=>[r.id,r.version]));
    db.transaction(()=> {
      db.prepare('INSERT INTO business_recovery VALUES(?,?,?)').run(recoveryId,JSON.stringify(snapshot()),new Date().toISOString());
      db.prepare('DELETE FROM business_records').run();
      for(const r of s.records) {
        const {id,kind,version,archived,createdBy,createdAt,updatedAt,...data}=r;
        db.prepare('INSERT INTO business_records VALUES(?,?,?,?,?,?,?,?)').run(id,kind,JSON.stringify(data),Math.max(version,previousVersions.get(id)||0)+1,archived?1:0,createdBy,createdAt,updatedAt);
      }
      // Validate references, basic values and ledger balances before committing replacement.
      const restored=all();
      const unique=new Set();
      for(const r of restored) {
        const required={campaigns:['name','channel','start','end','status'],clients:['name','contact'],inquiries:['name','date','subject','source','status'],leads:['name','date','subject','source','status'],promotions:['name','start','end','terms','status'],quotations:['name','leadId','date','validUntil','checkIn','checkOut','status'],sales:r.legacyImported===true?['name','date','reservationRef','status']:['name','date','quotationId','leadId','reservationRef','checkIn','checkOut','status'],payments:['name','date','saleId','reference','type']}[r.kind];
        for(const k of required) text(r,k);
        for(const k of ['date','start','end','checkIn','checkOut','validUntil','followUp']) if(r[k]) date(r,k);
        if(['inquiries','leads','clients'].includes(r.kind)) contact(r);
        const statusChoices={campaigns:['Draft','Active','Completed','Cancelled'],inquiries:['New','In Progress','Resolved','Converted'],leads:['New','Qualified','Lost','Converted'],promotions:['Pending','Approved'],quotations:['Draft','Accepted'],sales:['Confirmed','Cancelled']};
        if(statusChoices[r.kind]) choice(r,'status',statusChoices[r.kind]);
        const amountKeys={campaigns:['budget','spent'],promotions:['discount'],quotations:['gross','discount','amount'],sales:['gross','discount','amount'],payments:['amount']}[r.kind]||[];
        for(const k of amountKeys) money(r,k);
        if(['inquiries','leads'].includes(r.kind)) choice(r,'source',['Website','Social Media','Email','Referral','Corporate','Walk-in','Other']);
        if(r.kind==='campaigns'&&r.spent>r.budget) fail('Backup campaign spending exceeds budget.');
        if(['quotations','sales'].includes(r.kind)&&Math.round(r.amount*100)!==Math.round(r.gross*100*(100-r.discount)/100)) fail('Backup pricing does not reconcile.');
        if(r.kind==='inquiries'&&r.status==='Converted'&&!r.leadId) fail('Converted inquiry has no lead.');
        if(r.kind==='leads'&&r.status==='Converted'&&!r.saleId) fail('Converted lead has no sale.');
        if(r.kind==='quotations'&&r.status==='Accepted'&&!r.saleId) fail('Accepted quotation has no sale.');
        const keys=r.kind==='payments'?[`finance:${r.reference?.toLowerCase()}`]:r.kind==='sales'?[`reservation:${r.reservationRef?.toLowerCase()}`,...(r.leadId?[`sale-lead:${r.leadId}`]:[]),...(r.quotationId?[`sale-quote:${r.quotationId}`]:[])]:r.kind==='leads'&&r.inquiryId?[`inquiry-lead:${r.inquiryId}`]:[];
        for(const k of keys){if(unique.has(k))fail('Backup contains duplicate business references.');unique.add(k);}
        for(const [k,v] of Object.entries(r)) if(k.endsWith('Id')&&v) {
          const kinds={campaignId:'campaigns',clientId:'clients',inquiryId:'inquiries',leadId:'leads',promotionId:'promotions',quotationId:'quotations',saleId:'sales'};
          if(kinds[k] && !restored.some(x=>x.id===v&&x.kind===kinds[k])) fail('Backup has a broken record reference.');
        }
        for(const k of ['amount','gross','budget','spent','discount']) if(r[k]!=null && (typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0||r[k]>100000000)) fail('Backup has invalid amounts.');
        if(r.discount>100||(r.start&&r.end<r.start)||(r.checkIn&&r.checkOut<=r.checkIn)) fail('Backup contains invalid dates or discounts.');
        if(r.kind==='payments'&&(!['Receipt','Refund'].includes(r.type)||!r.reference||!r.saleId||r.amount<=0)) fail('Invalid payment record.');
        if(r.kind==='sales') {
          const balance=restored.filter(p=>p.kind==='payments'&&p.saleId===r.id).reduce((n,p)=>n+Math.round(p.amount*100)*(p.type==='Receipt'?1:-1),0);
          if(balance<0||balance>Math.round(r.amount*100)) fail('Backup payments do not reconcile.');
        }
      }
      audit(req.user,'restore backup',null,null,{records:s.records.length,recoveryId});
    })();res.json({success:true,recoveryId});
  } catch(e){next(e);} });
  router.use((error,req,res,next)=> {console.error(error.status?error.message:error);res.status(error.status||500).json({message:error.status?error.message:'Unable to save. The transaction was rolled back; please retry.'});});
  return router;
}
module.exports={initializeBusiness,createBusinessRouter,today};
