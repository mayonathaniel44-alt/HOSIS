const pool = require('../src/config/database')
const env = require('../src/config/env')
const bcrypt = require('bcrypt')
const { staffUsername, staffPassword } = require('../../departments/admin/backend/adminValidation.js')

async function main() {
  const username = staffUsername(process.env.FRONT_OFFICE_USERNAME)
  const password = staffPassword(process.env.FRONT_OFFICE_PASSWORD)
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(742914)')
    const target = await client.query('SELECT id, role FROM users WHERE LOWER(username) = $1 FOR UPDATE', [username])
    if (target.rows[0] && target.rows[0].role !== 'FRONT_OFFICE') {
      throw new Error('That username belongs to another department. No account was changed.')
    }
    let account = target.rows[0]
    if (!account) {
      const previous = await client.query("SELECT id FROM users WHERE username = 'frontdesk' AND role = 'FRONT_OFFICE' FOR UPDATE")
      account = previous.rows[0]
    }
    if (!account) throw new Error('No existing Front Office account was found. This command does not create accounts.')
    await client.query(`UPDATE users SET username=$1, password_hash=$2, is_active=TRUE,
      session_version=session_version+1, updated_at=NOW() WHERE id=$3`, [username,passwordHash,account.id])
    await client.query('DELETE FROM hk_password_must_change WHERE user_id=$1',[account.id])
    await client.query("INSERT INTO front_office_activity(action,description) VALUES('ADMIN_STAFF_UPDATED',$1)", [`Updated existing Front Office account ${username} through explicit local setup.`])
    await client.query('COMMIT')
    console.log(`Updated existing Front Office account "${username}". No account was created.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
main().catch(error => { console.error('Front Office setup failed:',error.message); process.exitCode=1 }).finally(()=>pool.end())
