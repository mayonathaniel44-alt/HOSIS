const {randomUUID}=require('node:crypto');
function initializeNotifications(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS business_notifications (
    id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES auth_users(id),title TEXT NOT NULL,
    message TEXT NOT NULL,record_id TEXT,kind TEXT,read_at TEXT,at TEXT NOT NULL,
    event_key TEXT,UNIQUE(user_id,event_key)
  );CREATE INDEX IF NOT EXISTS notification_owner ON business_notifications(user_id,at);
  CREATE TABLE IF NOT EXISTS business_sequences (key TEXT PRIMARY KEY,value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS business_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  for(const u of db.prepare("SELECT id,username FROM auth_users WHERE role<>'Disabled'").all()) {
    db.prepare('INSERT OR IGNORE INTO business_notifications VALUES(?,?,?,?,?,?,NULL,?,?)').run(randomUUID(),u.id,'Welcome to Sales & Marketing',`Signed in as ${u.username}. Your notifications are private to your account.`,null,null,new Date().toISOString(),'welcome');
  }
}
function notify(db,user,action,id,before,after) {
  const titles={create:'New record added',update:'Record updated','convert inquiry':'Inquiry converted to lead','accept quotation':'Quotation accepted','convert lead':'Lead converted to sale','approve promotion':'Promotion approved','cancel sale':'Sale cancelled','reconcile payment':'Payment recorded',archive:'Record archived','delete record':'Record moved to trash','restore record':'Record restored','create user':'Account created','change user access':'Account access changed','restore backup':'Workspace restored','change own password':'Password changed'};
  const title=titles[action];if(!title)return;
  const privateAction=['create user','change user access','change own password'].includes(action);
  const recipients=db.prepare("SELECT id,username,role FROM auth_users WHERE role<>'Disabled'").all().filter(u=>!privateAction||u.role==='Super Admin'||String(u.id)===String(id));
  const record=after||before;
  for(const u of recipients) db.prepare('INSERT INTO business_notifications VALUES(?,?,?,?,?,?,NULL,?,NULL)').run(randomUUID(),u.id,title,`${user.username}: ${record?.name||record?.username||'Sales & Marketing workspace'}`,privateAction?null:id,privateAction?null:record?.kind,new Date().toISOString());
}
function receiptReference(db,type,date) {
  const prefix=type==='Receipt'?'REC':'REF',key=`${prefix}-${date.replaceAll('-','')}`;
  let reference;
  do {
    const {value}=db.prepare('INSERT INTO business_sequences VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=value+1 RETURNING value').get(key);
    reference=`${key}-${String(value).padStart(6,'0')}`;
  }while(db.prepare("SELECT 1 FROM business_records WHERE kind='payments' AND lower(json_extract(data,'$.reference'))=lower(?)").get(reference));
  return reference;
}
module.exports={initializeNotifications,notify,receiptReference};
