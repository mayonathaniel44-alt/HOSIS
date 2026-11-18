const { test } = require('node:test')
const assert = require('node:assert/strict')
const target = process.env.TEST_DATABASE_URL
test(
  'combined operations and security regressions',
  { skip: !target },
  async (t) => {
    const url = new URL(target)
    assert.equal(
      url.pathname,
      '/hosis_test',
      'Use only a dedicated hosis_test database',
    )
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(url.hostname),
      'Integration tests must use an isolated local database',
    )
    process.env.DATABASE_URL = target
    process.env.JWT_SECRET = 'isolated-automated-tests-000000000000000000000'
    process.env.BCRYPT_ROUNDS = '10'
    const pool = require('../src/config/database')
    const bcrypt = require('bcrypt')
    const app = require('../src/app')
    const server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api/v1`
    const prefix = `test${Date.now()}`
    const password = 'Test-only-Password-2026'
    const accounts = {}
    const sessions = {}
    async function api(method, path, who, body, status = 200) {
      const token = typeof who === 'string' ? sessions[who]?.token : who?.token
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const raw = await response.text()
      const data = raw ? JSON.parse(raw) : null
      assert.equal(response.status, status, `${method} ${path}: ${raw}`)
      return data?.data ?? data
    }
    try {
      await pool.query('DELETE FROM auth_attempts')
    const hash = await bcrypt.hash(password, 10)
      for (const [name, role, position] of [
        ['admin', 'ADMIN', 'HOUSEKEEPER'],
        ['fo', 'FRONT_OFFICE', 'HOUSEKEEPER'],
        ['sup', 'HOUSEKEEPING', 'SUPERVISOR'],
        ['inspector', 'HOUSEKEEPING', 'INSPECTOR'],
        ['cleaner', 'HOUSEKEEPING', 'HOUSEKEEPER'],
        ['other', 'HOUSEKEEPING', 'HOUSEKEEPER'],
        ['engineer', 'ENGINEERING', 'HOUSEKEEPER'],
      ]) {
        const { rows } = await pool.query(
          `INSERT INTO users(username,password_hash,role,position,first_name,last_name) VALUES($1,$2,$3,$4,$5,'Tester') RETURNING id`,
          [`${prefix}.${name}`, hash, role, position, name],
        )
        accounts[name] = rows[0].id
        sessions[name] = await api('POST', '/auth/login', null, {
          username: `${prefix}.${name}`,
          password,
          role,
        })
      }
      const {
        rows: [dates],
      } = await pool.query(
        'SELECT CURRENT_DATE::text AS today,(CURRENT_DATE+1)::text AS tomorrow,(CURRENT_DATE+2)::text AS later',
      )
      const {
        rows: [room],
      } = await pool.query(
        "INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING *",
        [prefix],
      )
      const guest = await api(
        'POST',
        '/front-office/guests',
        'fo',
        { firstName: 'Test', lastName: 'Guest' },
        201,
      )
      let reservation
      await t.test('Admin and Front Office can enter their Housekeeping workspaces', async () => {
        const supervisor = await api('POST', '/auth/login', null, {
          username: `${prefix}.admin`, password, role: 'HOUSEKEEPING',
        })
        assert.equal(supervisor.user.role, 'HOUSEKEEPING')
        assert.equal(supervisor.user.position, 'SUPERVISOR')
        assert.deepEqual((await api('GET', '/auth/me', supervisor)).user, supervisor.user)
        await api('GET', '/housekeeping/password-resets', supervisor)
        await api('GET', '/admin/staff', supervisor, undefined, 403)
        await api('GET', '/front-office/dashboard', supervisor, undefined, 403)

        const viewer = await api('POST', '/auth/login', null, {
          username: `${prefix}.fo`, password, role: 'HOUSEKEEPING',
        })
        assert.equal(viewer.user.role, 'HOUSEKEEPING_VIEWER')
        assert.deepEqual((await api('GET', '/auth/me', viewer)).user, viewer.user)
        assert.ok((await api('GET', '/housekeeping/rooms', viewer)).rooms.some((item) => item.room_id === room.id))
        const detail = await api('GET', `/housekeeping/rooms/${room.id}`, viewer)
        assert.deepEqual(detail.history, [])
        assert.equal(detail.currentTask, null)
        assert.deepEqual(detail.allowedStatuses, [])
        await api('GET', '/housekeeping/guest-requests', viewer, undefined, 403)
        await api('GET', '/front-office/dashboard', viewer, undefined, 403)
        await api('PATCH', `/housekeeping/rooms/${room.id}/status`, viewer, { status: 'DIRTY' }, 403)
        const replacement = await api('POST', '/auth/password', viewer, { currentPassword: password, newPassword: password + 'viewer' })
        assert.equal(replacement.user.role, 'HOUSEKEEPING_VIEWER')
        await api('GET', '/housekeeping/rooms', replacement)
        await api('GET', '/housekeeping/rooms', viewer, undefined, 401)
        sessions.fo = await api('POST', '/auth/login', null, {
          username: `${prefix}.fo`, password: password + 'viewer', role: 'FRONT_OFFICE',
        })
      })
      await t.test(
        'all department page-data endpoints query the canonical views',
        async () => {
          for (const endpoint of [
            '/housekeeping/dashboard',
            '/housekeeping/alerts',
            '/housekeeping/activity',
            '/housekeeping/staff',
            '/housekeeping/guests',
            '/housekeeping/rooms',
            '/housekeeping/tasks',
            '/housekeeping/tasks/workload',
            '/housekeeping/inspections/queue',
            '/housekeeping/inspections',
            '/housekeeping/schedules',
            '/housekeeping/schedules/mine',
            '/housekeeping/schedules/days',
            '/housekeeping/guest-requests',
            '/housekeeping/lost-found',
            '/housekeeping/maintenance',
            '/housekeeping/inventory',
            '/housekeeping/inventory/movements',
            '/housekeeping/password-resets',
            '/housekeeping/me/record',
            '/housekeeping/me/reports',
            '/auth/account',
          ])
            await api('GET', endpoint, 'sup')
          for (const endpoint of [
            '/admin/dashboard',
            '/admin/staff',
            '/admin/activity',
            '/admin/settings',
          ])
            await api('GET', endpoint, 'admin')
          for (const endpoint of [
            '/front-office/dashboard',
            '/front-office/guests',
            '/front-office/reservations',
            '/front-office/rooms',
            '/front-office/guest-requests',
            '/front-office/invoices',
          ])
            await api('GET', endpoint, 'fo')
        },
      )
      await t.test('administrator credentials open a restricted Front Office session and keep its scope after a password change',async()=>{
   const scoped=await api('POST','/auth/login',null,{username:`${prefix}.admin`,password,role:'FRONT_OFFICE'})
   assert.equal(scoped.user.role,'FRONT_OFFICE')
   await api('GET','/front-office/dashboard',scoped)
   await api('GET','/admin/staff',scoped,undefined,403)
   const me=await api('GET','/auth/me',scoped)
   assert.equal(me.user.role,'FRONT_OFFICE')
   const replacement=await api('POST','/auth/password',scoped,{currentPassword:password,newPassword:password+'scope'})
   assert.equal(replacement.user.role,'FRONT_OFFICE')
   await api('GET','/admin/staff',replacement,undefined,403)
   await api('GET','/front-office/dashboard',replacement)
   const admin=await api('POST','/auth/login',null,{username:`${prefix}.admin`,password:password+'scope',role:'ADMIN'})
   assert.equal(admin.user.role,'ADMIN')
   sessions.admin = admin
  })
  await t.test(
        'check-in rejects missing room, future arrival, and department bypasses',
        async () => {
          const unassigned = await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomType: 'Suite',
              checkIn: dates.today,
              checkOut: dates.tomorrow,
            },
            201,
          )
          await api(
            'POST',
            `/front-office/reservations/${unassigned.id}/check-in`,
            'fo',
            undefined,
            409,
          )
          await api(
            'DELETE',
            `/front-office/reservations/${unassigned.id}`,
            'fo',
            undefined,
            204,
          )
          const future = await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomId: room.id,
              roomType: 'Suite',
              checkIn: dates.tomorrow,
              checkOut: dates.later,
            },
            201,
          )
          await api(
            'POST',
            `/front-office/reservations/${future.id}/check-in`,
            'fo',
            undefined,
            409,
          )
          await api(
            'DELETE',
            `/front-office/reservations/${future.id}`,
            'fo',
            undefined,
            204,
          )
          await api('GET', '/front-office/rooms', 'cleaner', undefined, 403)
          await api(
            'POST',
            '/housekeeping/tasks',
            'cleaner',
            { roomId: room.id, taskType: 'CHECKOUT' },
            403,
          )
          await api(
            'PATCH',
            `/front-office/rooms/${room.id}/status`,
            'fo',
            { status: 'CLEAN' },
            403,
          )
          await api(
            'POST',
            '/housekeeping/front-office/check-in',
            'fo',
            { roomId: room.id },
            403,
          )
        },
      )
      await t.test('booking preserves cleanliness and inspection states and check-in refuses active cleaning',async()=>{
        for (const status of ['CLEAN','INSPECTED']) {
          const beforeReady=(await api('GET','/front-office/dashboard','fo')).arrivals.ready
          const {rows:[readyRoom]}=await pool.query("INSERT INTO rooms(room_number,room_type,floor,status) VALUES($1,'Suite','2',$2) RETURNING id",[prefix.slice(-10)+status,status])
          const details={guestId:guest.id,roomId:readyRoom.id,roomType:'Suite',checkIn:dates.today,checkOut:dates.tomorrow}
          await api('POST','/front-office/reservations','fo',details,409)
          const booking=await api('POST','/front-office/reservations','fo',{...details,checkIn:dates.tomorrow,checkOut:dates.later},201)
          assert.equal((await api('GET',`/front-office/rooms/${readyRoom.id}`,'fo')).status,status)
          assert.equal((await api('GET','/front-office/dashboard','fo')).arrivals.ready,beforeReady)
          await api('POST',`/front-office/reservations/${booking.id}/check-in`,'fo',undefined,409)
          await api('DELETE',`/front-office/reservations/${booking.id}`,'fo',undefined,204)
        }
        const {rows:[activeRoom]}=await pool.query("INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING id",[prefix.slice(-10)+'active'])
        const booking=await api('POST','/front-office/reservations','fo',{guestId:guest.id,roomId:activeRoom.id,roomType:'Suite',checkIn:dates.today,checkOut:dates.tomorrow},201)
        const task=await api('POST','/housekeeping/tasks','sup',{roomId:activeRoom.id,taskType:'DEEP_CLEAN',staffId:accounts.cleaner},201)
        const blocked=await api('POST',`/front-office/reservations/${booking.id}/check-in`,'fo',undefined,409)
        assert.equal(blocked.error.code,'CLEANING_NOT_CLOSED')
        await pool.query("UPDATE hk_cleaning_tasks SET task_status='INSPECTED' WHERE task_id=$1",[task.task.task_id])
        await api('POST',`/front-office/reservations/${booking.id}/check-in`,'fo')
      })
      await t.test('reservation guest names obey field length validation',async()=>{
        await api('POST','/front-office/reservations','fo',{guest:{name:'A'.repeat(101)+' Guest'},roomType:'Suite',checkIn:dates.today,checkOut:dates.tomorrow},400)
      })
      await t.test('a manual dirty status opens a single cleaning task', async () => {
        const { rows: [manualRoom] } = await pool.query(
          "INSERT INTO rooms(room_number,room_type,floor) VALUES($1,'Suite','2') RETURNING id",
          [prefix.slice(-10) + 'manual'],
        )
        const endpoint = `/housekeeping/rooms/${manualRoom.id}/status`
        const adminAvailability = (await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available
        const frontOfficeRooms = async () => (await api('GET', '/front-office/rooms', 'fo')).find((room) => room.id === manualRoom.id)
        assert.equal((await frontOfficeRooms()).readyForAssignment, true)
        const changed = await api('PATCH', endpoint, 'sup', { status: 'DIRTY', remarks: 'Requires touch-up' })
        assert.equal(changed.room.room_status, 'DIRTY')
        const frontOfficeRoom = await frontOfficeRooms()
        assert.equal(frontOfficeRoom.status, 'DIRTY')
        assert.equal(frontOfficeRoom.readyForAssignment, false)
        assert.equal((await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available, adminAvailability - 1)
        await api('PATCH', endpoint, 'sup', { status: 'DIRTY' })
        const { rows } = await pool.query('SELECT task_type, notes FROM hk_cleaning_tasks WHERE room_id=$1', [manualRoom.id])
        assert.deepEqual(rows, [{ task_type: 'TOUCH_UP', notes: 'Requires touch-up' }])

        await api('PATCH', endpoint, 'cleaner', { status: 'CLEAN', remarks: 'Needs supervisor' }, 403)
        await api('PATCH', endpoint, 'sup', { status: 'CLEAN' }, 400)
        for (const status of ['CLEAN', 'INSPECTED', 'AVAILABLE', 'RESERVED', 'OCCUPIED', 'OUT_OF_ORDER', 'AVAILABLE']) {
          const result = await api('PATCH', endpoint, 'sup', { status, remarks: 'Verified manual status' })
          const projected = await frontOfficeRooms()
          assert.equal(result.room.room_status, status)
          assert.equal(projected.status, status)
          assert.equal(projected.readyForAssignment, status === 'AVAILABLE')
          if (status === 'RESERVED' || status === 'OCCUPIED') {
            assert.equal(projected.manualHold, true)
            await api('POST', '/front-office/reservations', 'fo', {
              guestId: guest.id, roomId: manualRoom.id, roomType: 'Suite',
              checkIn: dates.tomorrow, checkOut: dates.later,
            }, 409)
          }
        }
      })
      await t.test('retrying the same payment request records one payment', async () => {
        const invoice = await api('POST', '/front-office/invoices', 'fo', {
          guestId: guest.id, amount: '100.00',
        }, 201)
        const endpoint = `/front-office/invoices/${invoice.id}/payments`
        const draft = { amount: '20.00', paymentMethod: 'CASH', requestKey: 'test_payment_retry_01' }
        const first = await api('POST', endpoint, 'fo', draft, 201)
        const retry = await api('POST', endpoint, 'fo', draft, 201)
        assert.equal(retry.id, first.id)
        assert.equal((await api('GET', endpoint, 'fo')).length, 1)
        await api('POST', endpoint, 'fo', { ...draft, amount: '30.00' }, 409)
      })
      await t.test(
        'checkout creates a task; failed inspection requires recleaning; pass notifies Front Office',
        async () => {
          reservation = await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomId: room.id,
              roomType: 'Suite',
              checkIn: dates.today,
              checkOut: dates.tomorrow,
            },
            201,
          )
          await api(
            'POST',
            `/front-office/reservations/${reservation.id}/check-in`,
            'fo',
          )
          await api(
            'POST',
            `/front-office/reservations/${reservation.id}/check-out`,
            'fo',
          )
          const {
            rows: [task],
          } = await pool.query(
            "SELECT * FROM hk_cleaning_tasks WHERE room_id=$1 AND task_status<>'INSPECTED'",
            [room.id],
          )
          assert.ok(task)
          await api('PATCH', `/housekeeping/tasks/${task.task_id}`, 'sup', {
            staffId: accounts.cleaner,
          })
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'other',
            undefined,
            403,
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'cleaner',
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/complete`,
            'cleaner',
          )
          const failed = await api(
            'POST',
            '/housekeeping/inspections',
            'inspector',
            {
              taskId: task.task_id,
              result: 'FAILED',
              remarks: 'Reclean floor',
            },
            201,
          )
          assert.equal(failed.room.room_status, 'DIRTY')
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/start`,
            'cleaner',
          )
          await api(
            'POST',
            `/housekeeping/tasks/${task.task_id}/complete`,
            'cleaner',
          )
          const passed = await api(
            'POST',
            '/housekeeping/inspections',
            'inspector',
            { taskId: task.task_id, result: 'PASSED' },
            201,
          )
          assert.equal(passed.room.room_status, 'INSPECTED')
          const notices = await api(
            'GET',
            '/housekeeping/notifications?unread=1',
            'fo',
          )
          assert.ok(notices.notifications.some((n) => n.room_id === room.id))
          await api('PATCH', `/housekeeping/rooms/${room.id}/status`, 'inspector', {
            status: 'AVAILABLE',
          }, 403)
          await api('PATCH', `/housekeeping/rooms/${room.id}/status`, 'cleaner', {
            status: 'AVAILABLE',
          }, 403)
          const availabilityBeforeRelease = (await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available
          await api('PATCH', `/front-office/rooms/${room.id}/status`, 'fo', {
            status: 'AVAILABLE',
          })
          assert.equal((await api('GET', '/front-office/rooms', 'fo')).find((item) => item.id === room.id).readyForAssignment, true)
          assert.equal((await api('GET', '/admin/dashboard', 'admin')).frontOffice.rooms.available, availabilityBeforeRelease + 1)
          await api('PATCH', `/front-office/rooms/${room.id}/status`, 'fo', {
            status: 'AVAILABLE',
          }, 409)
          const {
            rows: [state],
          } = await pool.query('SELECT status FROM rooms WHERE id=$1', [
            room.id,
          ])
          assert.equal(state.status, 'AVAILABLE')
          const activity = await api('GET', `/front-office/reports/stay-activity?date=${dates.today}`, 'fo')
          assert.ok(activity.some((entry) => entry.action === 'RESERVATION_CHECKED_IN' && entry.description.includes(`#${reservation.id}.`)))
          assert.ok(activity.some((entry) => entry.action === 'RESERVATION_CHECKED_OUT' && entry.description.includes(`#${reservation.id}.`)))
          await api('GET', '/front-office/reports/stay-activity?date=invalid', 'fo', undefined, 400)
        },
      )
      await t.test(
        'request assignments serialize; stock approval cannot be bypassed; status returns to Front Office',
        async () => {
          const request = await api(
            'POST',
            '/front-office/guest-requests',
            'fo',
            {
              guestId: guest.id,
              guestName: 'Test Guest',
              roomId: room.id,
              request: 'Please bring towels',
            },
            201,
          )
          const {
            rows: [hk],
          } = await pool.query(
            'SELECT * FROM hk_guest_requests WHERE front_office_request_id=$1',
            [request.id],
          )
          assert.ok(hk)
          const claims = await Promise.all(
            ['cleaner', 'other'].map(async (who) => {
              const response = await fetch(
                `${base}/housekeeping/guest-requests/${hk.request_id}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessions[who].token}`,
                  },
                  body: JSON.stringify({ staffId: accounts[who] }),
                },
              )
              return response.status
            }),
          )
          assert.deepEqual(claims.sort(), [200, 403])
          const {
            rows: [claimed],
          } = await pool.query(
            'SELECT staff_id FROM hk_guest_requests WHERE request_id=$1',
            [hk.request_id],
          )
          const who =
            claimed.staff_id === accounts.cleaner ? 'cleaner' : 'other'
          const stock = await api(
            'POST',
            '/housekeeping/inventory',
            'sup',
            {
              itemName: prefix,
              category: 'LINEN',
              unit: 'pieces',
              quantity: 10,
            },
            201,
          )
          await api(
            'PATCH',
            `/housekeeping/guest-requests/${hk.request_id}`,
            'sup',
            { invItemId: stock.item.inv_item_id, quantity: 2 },
          )
          await api(
            'POST',
            `/housekeeping/guest-requests/${hk.request_id}/complete`,
            who,
            {},
            409,
          )
          await api(
            'PATCH',
            `/front-office/guest-requests/${request.id}`,
            'fo',
            { status: 'COMPLETED' },
            409,
          )
          await api(
            'POST',
            `/housekeeping/guest-requests/${hk.request_id}/approve-stock`,
            who,
          )
          await api(
            'PATCH',
            `/housekeeping/guest-requests/${hk.request_id}`,
            'sup',
            { quantity: 3 },
            409,
          )
          await api(
            'POST',
            `/housekeeping/guest-requests/${hk.request_id}/complete`,
            who,
            { completionNotes: 'Delivered' },
          )
          await api(
            'PATCH',
            `/housekeeping/guest-requests/${hk.request_id}`,
            who,
            { details: 'Reopen' },
            409,
          )
          const {
            rows: [state],
          } = await pool.query(
            'SELECT status FROM guest_requests WHERE id=$1',
            [request.id],
          )
          assert.equal(state.status, 'COMPLETED')
          const {
            rows: [item],
          } = await pool.query(
            'SELECT quantity FROM hk_inventory_items WHERE inv_item_id=$1',
            [stock.item.inv_item_id],
          )
          assert.equal(item.quantity, 8)
        },
      )
      await t.test(
        'concurrent overlapping shifts cannot both be created',
        async () => {
          const statuses = await Promise.all(
            ['MORNING', 'AFTERNOON'].map(async (shift) => {
              const response = await fetch(`${base}/housekeeping/schedules`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sessions.sup.token}`,
                },
                body: JSON.stringify({
                  staffId: accounts.cleaner,
                  shiftDate: dates.tomorrow,
                  shift,
                  startTime: '08:00',
                  endTime: '12:00',
                  assignedArea: '2',
                }),
              })
              return response.status
            }),
          )
          assert.deepEqual(statuses.sort(), [201, 409])
        },
      )
      await t.test(
        'repairs keep rooms off sale until repair release and post-repair cleaning',
        async () => {
          await api(
            'POST',
            '/housekeeping/maintenance',
            'cleaner',
            {
              roomId: room.id,
              category: 'PLUMBING',
              description: 'Leak',
              setOutOfOrder: true,
            },
            403,
          )
          const maintenance = await api(
            'POST',
            '/housekeeping/maintenance',
            'sup',
            {
              roomId: room.id,
              category: 'PLUMBING',
              description: 'Leak',
              setOutOfOrder: true,
            },
            201,
          )
          await api(
            'POST',
            '/front-office/reservations',
            'fo',
            {
              guestId: guest.id,
              roomId: room.id,
              roomType: 'Suite',
              checkIn: dates.today,
              checkOut: dates.tomorrow,
            },
            409,
          )
          await api(
            'PATCH',
            `/housekeeping/maintenance/${maintenance.request.request_id}/status`,
            'engineer',
            { status: 'REPAIRED' },
          )
          const released = await api(
            'POST',
            `/housekeeping/maintenance/${maintenance.request.request_id}/release`,
            'sup',
          )
          assert.equal(released.task.task_type, 'POST_REPAIR')
          const {
            rows: [state],
          } = await pool.query('SELECT status FROM rooms WHERE id=$1', [
            room.id,
          ])
          assert.equal(state.status, 'DIRTY')
        },
      )
      await t.test(
        'password reset revokes old tokens and requires replacement before work; logout revokes replacement',
        async () => {
          const reset = await api(
            'POST',
            `/housekeeping/password-resets/staff/${accounts.cleaner}`,
            'sup',
          )
          await api('GET', '/auth/me', 'cleaner', undefined, 401)
          const temporary = await api('POST', '/auth/login', null, {
            username: `${prefix}.cleaner`,
            password: reset.temporaryPassword,
            role: 'HOUSEKEEPING',
          })
          assert.equal(temporary.user.mustChangePassword, true)
          await api('GET', '/housekeeping/tasks', temporary, undefined, 403)
          const replaced = await api('POST', '/auth/password', temporary, {
            currentPassword: reset.temporaryPassword,
            newPassword: password + 'new',
          })
          assert.equal(replaced.user.mustChangePassword, false)
          await api('GET', '/housekeeping/tasks', replaced)
          await api('GET', '/auth/me', temporary, undefined, 401)
          await api('POST', '/auth/logout', replaced, undefined, 204)
          await api('GET', '/auth/me', replaced, undefined, 401)
        },
      )
      await t.test(
        'login attempts are bounded and malformed department bodies return 400',
        async () => {
          await api('POST', '/housekeeping/tasks', 'sup', [], 400)
          for (let i = 0; i < 10; i++)
            await api(
              'POST',
              '/auth/login',
              null,
              { username: prefix + '.unknown', password },
              401,
            )
          await api(
            'POST',
            '/auth/login',
            null,
            { username: prefix + '.unknown', password },
            429,
          )
        },
      )
    } finally {
      await new Promise((resolve) => server.close(resolve))
      await pool.end()
    }
  },
)
