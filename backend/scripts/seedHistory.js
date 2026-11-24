const { readFileSync } = require('node:fs')
const path = require('node:path')
const env = require('../src/config/env')
const db = require('../src/config/db')

async function main() {
  const target = new URL(env.databaseUrl)
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/hosis') {
    throw new Error('History can only be seeded into the local hosis database.')
  }
  const end = process.argv[2] || db.today()
  const date = new Date(end + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== end) {
    throw new Error('Use an end date in YYYY-MM-DD format.')
  }
  const result = await db.withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(41800, 90)')
    const history = await client.query("SELECT 1 FROM reservations WHERE confirmation_code LIKE 'GH-HIST-%' LIMIT 1")
    if (history.rowCount) return { alreadyLoaded: true }
    await client.query("SELECT set_config('hosis.history_end', $1, true)", [end])
    await client.query(readFileSync(path.join(__dirname, 'seedHistory.sql'), 'utf8'))
    const { rows: [counts] } = await client.query(`
      SELECT (SELECT count(*) FROM reservations WHERE confirmation_code LIKE 'GH-HIST-%') AS reservations,
        (SELECT count(*) FROM hk_cleaning_tasks WHERE reservation_reference LIKE 'GH-HIST-%') AS cleaning_tasks,
        (SELECT count(*) FROM guest_requests q JOIN reservations r ON q.reservation_id=r.id WHERE r.confirmation_code LIKE 'GH-HIST-%') AS requests,
        (SELECT count(*) FROM sales_marketing_records WHERE id LIKE '%GH-HIST-%') AS sales_records,
        (SELECT count(*) FROM finance_payroll WHERE payroll_code LIKE 'PR-HIST-%') AS payroll_runs,
        (SELECT count(*) FROM finance_expenses WHERE voucher_code LIKE 'EXP-HIST-%') AS expenses,
        (SELECT count(*) FROM finance_night_audits WHERE audited_by='Historical sample') AS night_audits
    `)
    if (!counts.reservations || !counts.sales_records) throw new Error('No linked history was created.')
    return counts
  })
  console.log(result)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => db.pool.end())
