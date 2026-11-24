// Local recovery for an admin who cannot sign in. Run on the hotel server.
const { initializeAuth } = require('../backend/src/auth');
const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error('Usage: node scripts/unlock-sign-in.cjs <username>');
  process.exitCode = 1;
} else {
  const db = require('../backend/src/config/database');
  try {
    initializeAuth(db);
    const user = db.prepare('SELECT id FROM auth_users WHERE username=?').get(username);
    if (!user) throw new Error('Account not found.');
    db.prepare('DELETE FROM auth_login_limits WHERE user_id=?').run(user.id);
    console.log('Sign-in unlocked. The password and account role have not changed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { db.close(); }
}
