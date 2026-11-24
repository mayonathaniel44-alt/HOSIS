'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const express = require('../../../backend/src/lib/departmentDependencies.js').express;
const pool = require('../../../backend/src/config/database.js');
const { appError } = require('../../../backend/src/lib/errors.js');
const { writeEngineeringAudit } = require('./audit.js');

const router = express.Router();
const PERIODS = new Set(['daily', 'weekly', 'monthly', 'annual']);
const FORMATS = new Set(['csv', 'xlsx']);
const MASTER_COLLECTIONS = new Set(['equipment', 'parts']);
const TYPE_NAMES = Object.freeze({
    requests: 'Repair Request', orders: 'Work Order', history: 'Work Order History',
    equipment: 'Equipment', schedules: 'Preventive Maintenance', parts: 'Part',
    finance: 'Finance Record', usage: 'Stock Movement', expenses: 'Expense'
});
const REPORT_TYPES = Object.freeze([
    'Repair Request', 'Work Order', 'Work Order History', 'Preventive Maintenance',
    'Equipment', 'Part', 'Stock Movement', 'Expense', 'Finance Record',
    'Notification', 'Audit Trail', 'Leave Record'
]);
const DATE_FIELDS = ['date', 'reportedAt', 'createdAt', 'created_at', 'completedAt', 'submittedAt', 'dueDate', 'nextDue', 'updatedAt'];
const SECRET_KEY = /password|token|secret|hash|credential|authorization/i;

function adminOnly(req, _res, next) {
    if (!req.user?.isAdministrator)
        throw appError(403, 'ENGINEERING_REPORT_ADMIN_REQUIRED', 'Administrator access is required for Engineering reports.');
    next();
}

function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}

function shiftDate(value, days) {
    const date = new Date(value + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function periodRange(periodType, anchorDate) {
    if (!PERIODS.has(periodType) || !validDate(anchorDate))
        throw appError(400, 'INVALID_REPORT_PERIOD', 'Choose a valid report period and date.');
    const [year, month] = anchorDate.split('-').map(Number);
    if (periodType === 'daily') return { start: anchorDate, end: anchorDate };
    if (periodType === 'weekly') {
        const day = new Date(anchorDate + 'T12:00:00Z').getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const start = shiftDate(anchorDate, mondayOffset);
        return { start, end: shiftDate(start, 6) };
    }
    if (periodType === 'monthly') {
        const start = `${year}-${String(month).padStart(2, '0')}-01`;
        const end = new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
        return { start, end };
    }
    return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function localDate(value, timeZone = process.env.DB_TIME_ZONE || 'Asia/Manila') {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return validDate(String(value).slice(0, 10)) ? String(value).slice(0, 10) : '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function safeObject(value) {
    if (Array.isArray(value)) return value.map(safeObject);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, item]) => [key, safeObject(item)]));
}

function recordDate(payload, timeZone) {
    for (const key of DATE_FIELDS) {
        const date = localDate(payload?.[key], timeZone);
        if (date) return date;
    }
    return '';
}

function neutralize(value) {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
    return `"${neutralize(value).replaceAll('"', '""')}"`;
}

function rowsToCsv(rows) {
    const headers = ['Record Type', 'Record ID', 'Record Date', 'Details'];
    return Buffer.from([headers, ...rows.map((row) => [row.recordType, row.recordId, row.recordDate, row.details])]
        .map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8');
}

function xml(value) {
    return neutralize(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const [name, source] of entries) {
        const nameBuffer = Buffer.from(name);
        const data = Buffer.from(source);
        const compressed = zlib.deflateRawSync(data);
        const crc = crc32(data);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
        header.writeUInt16LE(8, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBuffer.length, 26);
        local.push(header, nameBuffer, compressed);
        const item = Buffer.alloc(46);
        item.writeUInt32LE(0x02014b50, 0); item.writeUInt16LE(20, 4); item.writeUInt16LE(20, 6);
        item.writeUInt16LE(0x800, 8); item.writeUInt16LE(8, 10); item.writeUInt32LE(crc, 16);
        item.writeUInt32LE(compressed.length, 20); item.writeUInt32LE(data.length, 24);
        item.writeUInt16LE(nameBuffer.length, 28); item.writeUInt32LE(offset, 42);
        central.push(item, nameBuffer);
        offset += header.length + nameBuffer.length + compressed.length;
    }
    const centralBuffer = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, centralBuffer, end]);
}

function rowsToXlsx(rows) {
    const values = [['Record Type', 'Record ID', 'Record Date', 'Details'], ...rows.map((row) => [row.recordType, row.recordId, row.recordDate, row.details])];
    const sheetRows = values.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
        let column = ''; let current = columnIndex + 1;
        while (current) { column = String.fromCharCode(65 + (current - 1) % 26) + column; current = Math.floor((current - 1) / 26); }
        return `<c r="${column}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('')}</row>`).join('');
    return zip([
        ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
        ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Engineering Records" sheetId="1" r:id="rId1"/></sheets></workbook>'],
        ['xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
        ['xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`]
    ]);
}

async function collectRows(client, range, timeZone = process.env.DB_TIME_ZONE || 'Asia/Manila') {
    const [records, notifications, audit, leaves] = await Promise.all([
        client.query('SELECT collection, record_id, payload FROM engineering.engineering_records ORDER BY collection, record_id'),
        client.query('SELECT id, part_id, message, quantity, threshold, active, created_at, resolved_at FROM engineering.engineering_notifications ORDER BY id'),
        client.query(`SELECT id, actor_id, actor_name, action, collection, record_id, before_data, after_data, created_at FROM engineering.engineering_audit WHERE collection IS DISTINCT FROM 'reports' ORDER BY id`),
        client.query(`SELECT l.id, l.employee_id, l.employee_name, l.leave_type, l.start_date, l.end_date, l.reason,
            CASE WHEN l.status='Cancelled' THEN l.status ELSE COALESCE(h.status,l.status) END AS status,
            l.created_by,l.created_at,COALESCE(l.reviewed_by,h.decided_by) AS reviewed_by,
            COALESCE(l.reviewed_by_name,u.username) AS reviewed_by_name, COALESCE(l.reviewed_at,h.decided_at) AS reviewed_at
            FROM engineering.engineering_leave_records l LEFT JOIN hr_leave_requests h ON h.id=l.hr_leave_id
            LEFT JOIN users u ON u.id=h.decided_by ORDER BY l.id`)
    ]);
    const inRange = (date) => !date || (date >= range.start && date <= range.end);
    const rows = records.rows.flatMap((record) => {
        const payload = safeObject(record.payload);
        const date = recordDate(payload, timeZone);
        if (!MASTER_COLLECTIONS.has(record.collection) && !inRange(date)) return [];
        return [{ recordType: TYPE_NAMES[record.collection] || record.collection, recordId: record.record_id, recordDate: date || range.end, details: JSON.stringify(payload) }];
    });
    for (const [recordType, list] of [['Notification', notifications.rows], ['Audit Trail', audit.rows], ['Leave Record', leaves.rows]]) {
        for (const record of list) {
            const clean = safeObject(record);
            const date = localDate(record.created_at || record.start_date, timeZone);
            if (inRange(date)) rows.push({ recordType, recordId: String(record.id), recordDate: date, details: JSON.stringify(clean) });
        }
    }
    const present = new Set(rows.map((row) => row.recordType));
    for (const recordType of REPORT_TYPES)
        if (!present.has(recordType)) rows.push({
            recordType, recordId: '', recordDate: range.end,
            details: JSON.stringify({ message: 'No records in selected period' })
        });
    return rows;
}

router.use(adminOnly);
router.get('/archive', async (_req, res) => {
    const { rows } = await pool.query(`SELECT id, period_type AS "periodType", period_start AS "periodStart", period_end AS "periodEnd",
        format, file_name AS "fileName", row_count AS "rowCount", generated_by AS "generatedBy",
        generated_by_name AS "generatedByName", generated_at AS "generatedAt"
        FROM engineering.engineering_report_archives ORDER BY generated_at DESC, id DESC`);
    res.json({ records: rows });
});

router.post('/generate', async (req, res) => {
    const { periodType, anchorDate, format } = req.body || {};
    if (!FORMATS.has(format)) throw appError(400, 'INVALID_REPORT_FORMAT', 'Choose CSV or Excel format.');
    const range = periodRange(periodType, anchorDate);
    const rows = await collectRows(pool, range);
    const exportRows = [...rows, { recordType: 'Exported by Admin' }];
    const content = format === 'csv' ? rowsToCsv(exportRows) : rowsToXlsx(exportRows);
    const mimeType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const fileName = `engineering-${periodType}-${range.start}-to-${range.end}-${checksum.slice(0, 10)}.${format}`;
    const inserted = await pool.query(`INSERT INTO engineering.engineering_report_archives
        (period_type, period_start, period_end, format, file_name, mime_type, content, checksum, row_count, generated_by, generated_by_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (period_type, period_start, period_end, format, checksum) DO NOTHING RETURNING id`,
    [periodType, range.start, range.end, format, fileName, mimeType, content, checksum, rows.length, req.user.id, req.user.full_name]);
    const id = inserted.rows[0]?.id;
    const result = id ? await pool.query(`SELECT id, period_type AS "periodType", period_start AS "periodStart", period_end AS "periodEnd", format,
        file_name AS "fileName", row_count AS "rowCount", generated_by_name AS "generatedByName", generated_at AS "generatedAt"
        FROM engineering.engineering_report_archives WHERE id=$1`, [id]) : await pool.query(`SELECT id, period_type AS "periodType", period_start AS "periodStart", period_end AS "periodEnd", format,
        file_name AS "fileName", row_count AS "rowCount", generated_by_name AS "generatedByName", generated_at AS "generatedAt"
        FROM engineering.engineering_report_archives WHERE period_type=$1 AND period_start=$2 AND period_end=$3 AND format=$4 AND checksum=$5`, [periodType, range.start, range.end, format, checksum]);
    await writeEngineeringAudit(pool, req.user, {
        action: id ? 'Report Generated' : 'Report Re-downloaded', collection: 'reports', recordId: result.rows[0].id,
        after: { ...result.rows[0], checksum, source: id ? 'Generate now' : 'Identical archive reused' }
    });
    res.status(id ? 201 : 200).json({ record: result.rows[0], reused: !id });
});

router.get('/archive/:id/download', async (req, res) => {
    if (!/^[1-9][0-9]{0,17}$/.test(req.params.id)) throw appError(400, 'INVALID_REPORT_ID', 'Invalid report archive.');
    const { rows } = await pool.query('SELECT file_name, mime_type, content FROM engineering.engineering_report_archives WHERE id=$1', [req.params.id]);
    if (!rows[0]) throw appError(404, 'REPORT_NOT_FOUND', 'Report archive not found.');
    await writeEngineeringAudit(pool, req.user, {
        action: 'Report Downloaded', collection: 'reports', recordId: req.params.id,
        after: { fileName: rows[0].file_name, mimeType: rows[0].mime_type }
    });
    res.set('Content-Type', rows[0].mime_type);
    res.set('Content-Disposition', `attachment; filename="${rows[0].file_name.replaceAll('"', '')}"`);
    res.send(rows[0].content);
});

module.exports = router;
module.exports.periodRange = periodRange;
module.exports.neutralize = neutralize;
module.exports.rowsToCsv = rowsToCsv;
module.exports.rowsToXlsx = rowsToXlsx;
module.exports.collectRows = collectRows;
module.exports.adminOnly = adminOnly;
