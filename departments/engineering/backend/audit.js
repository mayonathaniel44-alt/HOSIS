'use strict';

async function writeEngineeringAudit(client, user, { action, collection, recordId, before = null, after = null }) {
    await client.query(
        `INSERT INTO engineering.engineering_audit
            (actor_id, actor_name, action, collection, record_id, before_data, after_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [user.id, user.full_name, action, collection, String(recordId),
            before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)]
    );
}

module.exports = { writeEngineeringAudit };
