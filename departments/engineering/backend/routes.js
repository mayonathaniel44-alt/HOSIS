const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const pool = require('../../../backend/src/config/database.js');
const authenticate = require('../../../backend/src/middleware/authenticate.js');
const authorize = require('../../../backend/src/middleware/authorize.js');
const domain = require('./domain.js');
const workflow = require('./workflow.js');
const integration = require('./integration.js');
const { appError } = require('../../../backend/src/lib/errors.js');

const router = express.Router();
const run = (fn) => fn;
const head = authorize('head');
const engineeringAccess = authorize('ENGINEERING', 'TECHNICIAN', 'ADMIN');
const leaveReviewAccess = authorize('HR');
router.use(authenticate, (req, res, next) => {
    const hrLeaveAccess = req.user.role === 'HR' && (
        (req.method === 'GET' && /^\/leaves\/?$/.test(req.path)) ||
        (req.method === 'PATCH' && /^\/leaves\/[1-9][0-9]*\/status\/?$/.test(req.path))
    );
    return (hrLeaveAccess ? leaveReviewAccess : engineeringAccess)(req, res, next);
}, (req, res, next) => {
    req.user = {
        id: req.user.id,
        full_name: req.user.name,
        email: req.user.username,
        role: ({ TECHNICIAN: 'technician', HR: 'hr' })[req.user.role] || 'head',
        isAdministrator: req.user.role === 'ADMIN',
        active: true
    };
    next();
});

const publicUser = (user) => ({
    id: String(user.id),
    name: user.full_name,
    email: user.email,
    role: user.role,
    active: user.active,
    staffId: String(user.id),
    integrated: true,
    isAdministrator: !!user.isAdministrator
});

const staffDirectory = (client = pool) => client.query(
    `SELECT id, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), username) AS full_name,
            COALESCE(email, username) AS email,
            CASE WHEN role = 'ENGINEERING' THEN 'head' ELSE 'technician' END AS role, is_active AS active
     FROM users WHERE role IN ('ENGINEERING', 'TECHNICIAN') ORDER BY full_name, id`
);

router.get('/me', (req, res) => res.json(publicUser(req.user)));
router.get('/users', head, async (req, res) => {
    const { rows } = await staffDirectory();
    res.json(rows.map(publicUser));
});
router.get('/directory', head, async (req, res) => res.json(await integration.directory(pool)));
router.get('/notifications', head, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT n.*, r.read_at FROM engineering.engineering_notifications n
         LEFT JOIN engineering.engineering_notification_reads r ON n.id = r.notification_id AND r.user_id = $1
         ORDER BY n.created_at DESC LIMIT 250`,
        [req.user.id]
    );
    res.json(rows);
});
router.post('/notifications/:id/read', head, async (req, res) => {
    if (!/^[1-9][0-9]{0,17}$/.test(req.params.id)) throw appError(400, 'INVALID_ID', 'Invalid notification.');
    await pool.query(
        `INSERT INTO engineering.engineering_notification_reads (notification_id, user_id)
         SELECT id, $2 FROM engineering.engineering_notifications WHERE id = $1 ON CONFLICT DO NOTHING`,
        [req.params.id, req.user.id]
    );
    res.json({ ok: true });
});
router.get('/staff-consumption', head, async (req, res) => {
    const data = await readData(pool);
    res.json(data.usage.map((record) => ({
        ...record,
        staffId: String(record.technicianId),
        netQuantity: record.status === 'Reversed' ? 0 : Number(record.quantity),
        netAmount: record.status === 'Reversed' ? 0 : Number(record.amount),
    })));
});
router.get('/integration/outbox', head, async (_req, res) => {
    const { rows: records } = await pool.query(`
        SELECT e.record_id AS id, e.payload->>'description' AS description, f.voucher_code AS voucher,
            COALESCE(f.status,'AWAITING_FINANCE') AS status, f.settled_at AS "settledAt"
        FROM engineering.engineering_records e
        LEFT JOIN finance_expenses f ON f.engineering_record_id=e.record_id
        WHERE e.collection='finance' AND (lower(e.payload->>'status')='unpaid' OR f.id IS NOT NULL)
        ORDER BY e.record_id DESC LIMIT 200`
    );
    res.json({ sharedRegister: true, records });
});
router.get('/backup', head, async (req, res) => {
    const data = await readData(pool);
    res.json({ format: 'hosis-engineering-records', exportedAt: new Date().toISOString(), records: data });
});
router.use('/leaves', require('./leave.js'));
router.use('/reports', require('./reports.js'));

async function readData(client) {
    const records = await client.query(
        'SELECT collection, payload FROM engineering.engineering_records ORDER BY collection, record_id'
    );
    const data = domain.emptyData();
    for (const row of records.rows)
        if (data[row.collection]) data[row.collection].push(row.payload);
    return domain.normalizeLegacy(data);
}
async function writeAudit(client, user, change) {
    await client.query(
        'INSERT INTO engineering.engineering_audit (actor_id, actor_name, action, collection, record_id, before_data, after_data) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
            user.id,
            user.full_name,
            change.action,
            change.collection,
            change.recordId,
            change.before ? JSON.stringify(change.before) : null,
            JSON.stringify(change.after)
        ]
    );
}
async function saveRecord(client, collection, record) {
    if (collection === 'finance') {
        await client.query('SELECT pg_advisory_xact_lock(41800, 35)');
        const { rowCount } = await client.query(
            'SELECT 1 FROM finance_expenses WHERE engineering_record_id=$1', [record.id]
        );
        if (rowCount) throw appError(409, 'FINANCE_VOUCHER_LINKED', 'Finance now manages settlement of this expense.');
    }
    await client.query(
        'INSERT INTO engineering.engineering_records (collection, record_id, payload) VALUES ($1,$2,$3) ON CONFLICT (collection, record_id) DO UPDATE SET payload = EXCLUDED.payload',
        [collection, record.id, JSON.stringify(record)]
    );
}
router.get(
    '/data',
    run(async (req, res) => {
        const client = await pool.connect();
        try {
            // A consistent snapshot avoids data/revision mismatches while another user saves.
            await client.query(
                'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
            );
            const revision = await client.query(
                'SELECT revision FROM engineering.engineering_state WHERE id = 1'
            );
            const data = await readData(client);
            if (req.user.role !== 'head') {
                const own = domain.emptyData();
                own.orders = data.orders.filter(
                    (r) => String(r.technicianId) === String(req.user.id)
                );
                own.schedules = data.schedules.filter(
                    (r) => String(r.technicianId) === String(req.user.id)
                );
                const ownOrders = new Set(own.orders.map((r) => r.id));
                own.history = data.history.filter((r) =>
                    ownOrders.has(r.order)
                );
                own.usage = data.usage.filter(
                    (r) => String(r.technicianId) === String(req.user.id)
                );
                const { rows: settlements } = await client.query(
                    'SELECT engineering_record_id, status FROM finance_expenses WHERE engineering_record_id = ANY($1::text[])',
                    [data.expenses.filter((r) => String(r.technicianId) === String(req.user.id))
                        .map((r) => r.financeId).filter(Boolean)]
                );
                const financeStatus = new Map(settlements.map((r) => [r.engineering_record_id, r.status]));
                own.expenses = data.expenses
                    .filter(
                        (r) => String(r.technicianId) === String(req.user.id)
                    )
                    .map((r) => ({
                        ...r,
                        paymentStatus:
                            financeStatus.get(r.financeId) ||
                            data.finance.find((f) => f.id === r.financeId)
                                ?.status || 'Not in Finance'
                    }));
                own.parts = data.parts.map((r) => ({
                    id: r.id,
                    name: r.name,
                    location: r.location,
                    quantity: r.quantity,
                    minimum: r.minimum,
                    unitCost: r.unitCost,
                    status: r.status
                }));
                own.equipment = data.equipment.filter(
                    (e) =>
                        own.orders.some((o) => o.equipmentId === e.id) ||
                        own.schedules.some((pm) => pm.equipment === e.name)
                );
                await client.query('COMMIT');
                return res.json({
                    ...own,
                    activity: [],
                    _revision: Number(revision.rows[0].revision)
                });
            }
            const audit = await client.query(
                'SELECT id, actor_name, action, collection, record_id, created_at FROM engineering.engineering_audit ORDER BY id DESC LIMIT 100'
            );
            data.activity = audit.rows.map((r) => ({
                id: String(r.id),
                actor: r.actor_name,
                collection: r.collection,
                recordId: r.record_id,
                date: r.created_at.toISOString(),
                message: `${r.actor_name}: ${r.action} ${r.collection} ${r.record_id}`
            }));
            await client.query('COMMIT');
            res.json({ ...data, _revision: Number(revision.rows[0].revision) });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })
);
router.put(
    '/data',
    head,
    run(async (req, res) => {
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const state = await client.query(
                'SELECT revision FROM engineering.engineering_state WHERE id = 1 FOR UPDATE'
            );
            if (Number(req.body._revision) !== Number(state.rows[0].revision)) {
                throw Object.assign(
                    new Error(
                        'Another user changed the records. Refresh and reapply your change; no records were overwritten.'
                    ),
                    { status: 409 }
                );
            }
            const previous = await readData(client);
            await integration.prepareSnapshot(req.body, previous, client);
            const users = await staffDirectory(client);
            integration.lockExternalFinance(req.body, previous);
            const { data, changes } = domain.validateAndDerive(
                req.body,
                previous,
                users.rows,
                req.user
            );
            integration.lockRequestLinks(data, previous);
            for (const change of changes) {
                await saveRecord(client, change.collection, change.after);
                await writeAudit(client, req.user, change);
            }
            await integration.afterChanges(client, data, changes, req.user);
            const revision = await client.query(
                'UPDATE engineering.engineering_state SET revision = revision + 1 WHERE id = 1 RETURNING revision'
            );
            await client.query('COMMIT');
            res.json({
                ok: true,
                revision: Number(revision.rows[0].revision),
                changed: changes.length
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })
);
router.patch(
    '/orders/:id/notes',
    run(async (req, res) => {
        if (!['technician', 'engineering'].includes(req.user.role))
            return res.status(403).json({
                error: 'Only the assigned technician can write technician notes.'
            });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'SELECT revision FROM engineering.engineering_state WHERE id = 1 FOR UPDATE'
            );
            const records = await client.query(
                "SELECT payload FROM engineering.engineering_records WHERE collection = 'orders' AND record_id = $1",
                [req.params.id]
            );
            const old = records.rows[0]?.payload;
            const updated = {
                ...domain.technicianNote(old, req.user, req.body),
                workVersion: Number(old?.workVersion || 0) + 1
            };
            await saveRecord(client, 'orders', updated);
            await writeAudit(client, req.user, {
                action: 'Updated own technician notes',
                collection: 'orders',
                recordId: updated.id,
                before: old,
                after: updated
            });
            await client.query(
                'UPDATE engineering.engineering_state SET revision = revision + 1 WHERE id = 1'
            );
            await client.query('COMMIT');
            res.json(updated);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    })
);
// Every technician mutation locks the shared revision before checking ownership,
// stock and review state. All record and audit changes commit together.
async function workflowTransaction(req, res, mutate) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'SELECT revision FROM engineering.engineering_state WHERE id = 1 FOR UPDATE'
        );
        const data = await readData(client);
        const result = mutate(data);
        for (const change of result.changes) {
            await saveRecord(client, change.collection, change.after);
            await writeAudit(client, req.user, change);
        }
        await integration.afterChanges(client, data, result.changes, req.user);
        if (result.changes.length)
            await client.query(
                'UPDATE engineering.engineering_state SET revision = revision + 1 WHERE id = 1'
            );
        await client.query('COMMIT');
        res.json(result.record);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
function progressChanges(data, req, preventive) {
    const collection = preventive ? 'schedules' : 'orders';
    const old = data[collection].find((r) => r.id === req.params.id);
    const record = workflow.progress(old, req.user, req.body, preventive);
    const changes = [
        {
            collection,
            recordId: record.id,
            action:
                'Technician ' +
                req.body.action +
                (preventive ? ' preventive work' : ' repair work'),
            before: old,
            after: record
        }
    ];
    return { record, changes };
}
router.patch(
    '/orders/:id/progress',
    run(async (req, res) =>
        workflowTransaction(req, res, (data) =>
            progressChanges(data, req, false)
        )
    )
);
router.patch(
    '/schedules/:id/progress',
    run(async (req, res) =>
        workflowTransaction(req, res, (data) =>
            progressChanges(data, req, true)
        )
    )
);
router.post(
    '/usage',
    run(async (req, res) =>
        workflowTransaction(req, res, (data) =>
            workflow.consume(data, req.user, req.body)
        )
    )
);
router.post(
    '/expenses',
    run(async (req, res) =>
        workflowTransaction(req, res, (data) =>
            workflow.submitExpense(data, req.user, req.body)
        )
    )
);
router.patch(
    '/expenses/:id/review',
    head,
    run(async (req, res) =>
        workflowTransaction(req, res, (data) =>
            workflow.reviewExpense(data, req.user, req.params.id, req.body)
        )
    )
);
router.patch(
    '/usage/:id/reverse',
    head,
    run(async (req, res) =>
        workflowTransaction(req, res, (data) =>
            workflow.reverseUsage(data, req.user, req.params.id, req.body)
        )
    )
);
router.get(
    '/audit',
    head,
    run(async (req, res) => {
        const before = /^\d+$/.test(req.query.before || '')
            ? req.query.before
            : '9223372036854775807';
        const result = await pool.query(
            'SELECT id, actor_id, actor_name, action, collection, record_id, before_data, after_data, created_at FROM engineering.engineering_audit WHERE id < $1 ORDER BY id DESC LIMIT 100',
            [before]
        );
        res.json({
            records: result.rows,
            next:
                result.rows.length === 100
                    ? String(result.rows.at(-1).id)
                    : null
        });
    })
);

module.exports = router;
