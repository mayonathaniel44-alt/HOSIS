const { randomBytes } = require('node:crypto');
const db = require('../src/config/database');
const { createSuperAdmin } = require('../src/auth');
const password = process.env.HOSIS_SUPER_ADMIN_PASSWORD || `GH!${randomBytes(12).toString('base64url')}`;
if (createSuperAdmin(db, password)) console.log(`Super admin created.\nUsername: superadmin\nPassword: ${password}`);
else console.log('Super admin already exists; its password was not changed.');
db.close();
