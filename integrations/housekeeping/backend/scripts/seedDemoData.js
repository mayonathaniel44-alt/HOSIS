require('dotenv').config()

const { assertConfig } = require('../src/config/env')

assertConfig()
const db = require('../src/config/db')
const { syncAllRooms } = require('../src/services/roomSync')

const DEMO_ROOM_NUMBERS = Array.from({ length: 15 }, (_, index) => `DEMO-${101 + index}`)
const REQUESTS = [
  ['TOWELS', 'Fresh bath towels requested', 'HIGH'],
  ['AMENITIES', 'Please replenish the coffee and tea set', 'NORMAL'],
  ['LAUNDRY', 'Pick up one laundry bag from the room', 'NORMAL'],
  ['CLEANING', 'Please refresh the room after lunch', 'NORMAL'],
  ['EXTRA_BED', 'Guest requested an extra bed', 'URGENT'],
  ['TOWELS', 'Two extra hand towels requested', 'LOW'],
  ['AMENITIES', 'Please deliver dental kits', 'NORMAL'],
  ['OTHER', 'Please remove the empty water bottles', 'LOW'],
  ['LAUNDRY', 'Return pressed shirts to the room', 'HIGH'],
  ['CLEANING', 'Please clean a small spill near the desk', 'URGENT'],
]

async function seedDemoData() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo Housekeeping records cannot be seeded in production.')
  }

  await syncAllRooms()
  const result = await db.withTransaction(async (client) => {
    const { rows: existingRows } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM hk_cleaning_tasks WHERE notes LIKE 'DEMO SEED TASK %') AS tasks,
        (SELECT COUNT(*)::int
           FROM hk_inspections i
           JOIN hk_cleaning_tasks t ON t.task_id = i.task_id
          WHERE t.notes LIKE 'DEMO SEED TASK %') AS inspections,
        (SELECT COUNT(*)::int FROM hk_guest_requests
          WHERE request_details LIKE 'DEMO SEED REQUEST %') AS requests
    `)
    const existing = existingRows[0]
    if (existing.tasks === 10 && existing.inspections === 10 && existing.requests === 10) {
      return { alreadySeeded: true }
    }
    if (existing.tasks || existing.inspections || existing.requests) {
      throw new Error('Partial demo data already exists. No additional records were created.')
    }

    const { rows: rooms } = await client.query(
      `SELECT room_id, room_number, room_status
         FROM rooms
        WHERE room_number = ANY($1::varchar[])
        ORDER BY room_number`,
      [DEMO_ROOM_NUMBERS],
    )
    if (rooms.length !== DEMO_ROOM_NUMBERS.length) {
      throw new Error('Sync all 15 DEMO rooms from HOSIS before seeding Housekeeping records.')
    }
    const roomByNumber = new Map(rooms.map((room) => [room.room_number, room]))
    for (let index = 0; index < DEMO_ROOM_NUMBERS.length; index += 1) {
      const expectedStatus = index < 5 ? 'DIRTY' : index < 10 ? 'INSPECTED' : 'AVAILABLE'
      const room = roomByNumber.get(DEMO_ROOM_NUMBERS[index])
      if (room.room_status !== expectedStatus) {
        throw new Error(`${room.room_number} must be ${expectedStatus} before demo records are seeded; it is ${room.room_status}.`)
      }
    }

    const { rows: inspectors } = await client.query(
      `SELECT user_id
         FROM users
        WHERE role = 'HOUSEKEEPING'
          AND position IN ('INSPECTOR', 'SUPERVISOR')
          AND employment_status = 'ACTIVE'
        ORDER BY CASE position WHEN 'SUPERVISOR' THEN 0 ELSE 1 END, user_id
        LIMIT 1`,
    )
    if (!inspectors[0]) {
      throw new Error('Create an active Housekeeping supervisor or inspector before seeding inspection records.')
    }
    const inspectorId = inspectors[0].user_id

    const { rows: housekeepers } = await client.query(
      `SELECT user_id
         FROM users
        WHERE role = 'HOUSEKEEPING'
          AND position = 'HOUSEKEEPER'
          AND employment_status = 'ACTIVE'
        ORDER BY user_id
        LIMIT 1`,
    )
    const housekeeperId = housekeepers[0]?.user_id || null
    const taskIds = []
    const taskTypes = ['CHECKOUT', 'DEEP_CLEAN', 'STAYOVER', 'TOUCH_UP', 'POST_REPAIR']
    const priorities = ['NORMAL', 'HIGH', 'URGENT', 'LOW']

    for (let index = 0; index < 10; index += 1) {
      const room = roomByNumber.get(DEMO_ROOM_NUMBERS[index])
      const inspected = index >= 5
      const taskStatus = inspected ? 'INSPECTED' : housekeeperId ? 'ASSIGNED' : 'PENDING'
      const notes = `DEMO SEED TASK ${taskStatus} ${room.room_number}`
      const staffId = housekeeperId

      const { rows: tasks } = inspected
        ? await client.query(
          `INSERT INTO hk_cleaning_tasks
             (room_id, staff_id, task_type, priority, task_status, notes, assigned_date,
              due_time, start_time, completion_time)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE - $7::int, $8,
                   NOW() - INTERVAL '100 minutes', NOW() - INTERVAL '70 minutes')
           RETURNING task_id`,
          [room.room_id, staffId, taskTypes[index % taskTypes.length], priorities[index % priorities.length],
            taskStatus, notes, index + 1, `${String(9 + index).padStart(2, '0')}:00`],
        )
        : await client.query(
          `INSERT INTO hk_cleaning_tasks
             (room_id, staff_id, task_type, priority, task_status, notes, due_time)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING task_id`,
          [room.room_id, staffId, taskTypes[index % taskTypes.length], priorities[index % priorities.length],
            taskStatus, notes, `${String(9 + index).padStart(2, '0')}:00`],
        )
      taskIds.push({ taskId: tasks[0].task_id, inspected })
    }

    for (const { taskId, inspected } of taskIds) {
      if (!inspected) continue
      const inspections = [
        {
          result: 'FAILED',
          checklist: { bed: true, bathroom: false, amenities: true, floors: true, fixtures: true },
          remarks: 'Demo record: bathroom needed re-cleaning.',
          minutesAgo: 50,
        },
        {
          result: 'PASSED',
          checklist: { bed: true, bathroom: true, amenities: true, floors: true, fixtures: true },
          remarks: 'Demo record: re-cleaning verified.',
          minutesAgo: 20,
        },
      ]
      for (const inspection of inspections) {
        await client.query(
          `INSERT INTO hk_inspections
             (task_id, inspected_by, inspection_result, checklist, remarks, inspected_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, NOW() - $6::int * INTERVAL '1 minute')`,
          [taskId, inspectorId, inspection.result, JSON.stringify(inspection.checklist),
            inspection.remarks, inspection.minutesAgo],
        )
      }
    }

    for (let index = 0; index < REQUESTS.length; index += 1) {
      const [requestType, details, priority] = REQUESTS[index]
      const firstName = 'Demo'
      const lastName = `Guest${String(index + 1).padStart(2, '0')}`
      const { rows: guests } = await client.query(
        'SELECT guest_id FROM guests WHERE first_name = $1 AND last_name = $2 LIMIT 1',
        [firstName, lastName],
      )
      const { rows: insertedGuests } = guests.length
        ? { rows: guests }
        : await client.query(
          'INSERT INTO guests (first_name, last_name) VALUES ($1, $2) RETURNING guest_id',
          [firstName, lastName],
        )
      const room = roomByNumber.get(DEMO_ROOM_NUMBERS[index])
      await client.query(
        `INSERT INTO hk_guest_requests
           (guest_id, room_id, request_type, priority, request_details, request_status, requested_at)
         VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW() - $6::int * INTERVAL '1 hour')`,
        [insertedGuests[0].guest_id, room.room_id, requestType, priority,
          `DEMO SEED REQUEST ${String(index + 1).padStart(2, '0')}: ${details}`, index],
      )
    }

    return { alreadySeeded: false }
  })

  if (result.alreadySeeded) {
    console.log('Demo Housekeeping data is already present; no records were changed.')
  } else {
    console.log('Seeded 10 cleaning tasks, 10 inspection records, 10 guest requests, and 10 demo guests.')
  }
}

seedDemoData()
  .catch((error) => {
    console.error('Housekeeping demo seeding failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => db.pool.end())
