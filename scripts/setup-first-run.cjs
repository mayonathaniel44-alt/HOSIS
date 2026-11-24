const {randomBytes}=require('node:crypto');
const path=require('node:path');
process.chdir(path.resolve(__dirname,'..'));
const db=require('../backend/src/config/database');
const {createSuperAdmin}=require('../backend/src/auth');
const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_users'").get();
if(!exists||db.prepare('SELECT COUNT(*) AS count FROM auth_users').get().count===0){
  const password=randomBytes(18).toString('base64url');
  createSuperAdmin(db,password);
  console.log('\nFIRST RUN — SAVE THESE LOGIN DETAILS');
  console.log('Username: superadmin');
  console.log('Temporary password: '+password);
  console.log('Displayed account name: Admin');
  console.log('Change your password under My Account after signing in.\n');
}
db.close();
