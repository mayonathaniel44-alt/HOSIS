const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../src/services/financeService')

test('Leave request validates required fields', async () => {
  await assert.rejects(
    service.createLeaveRequest({}, 'Admin'),
    (err) => err.codeName === 'INVALID_NAME' && err.status === 400
  )

  await assert.rejects(
    service.createLeaveRequest({ employeeName: 'Juan Dela Cruz' }, 'Admin'),
    (err) => err.codeName === 'INVALID_DEPARTMENT' && err.status === 400
  )

  await assert.rejects(
    service.createLeaveRequest({ employeeName: 'Juan Dela Cruz', department: 'Front Office' }, 'Admin'),
    (err) => err.codeName === 'INVALID_LEAVE_TYPE' && err.status === 400
  )

  await assert.rejects(
    service.createLeaveRequest({
      employeeName: 'Juan Dela Cruz',
      department: 'Front Office',
      leaveType: 'Vacation Leave (VL)',
    }, 'Admin'),
    (err) => err.codeName === 'INVALID_DATES' && err.status === 400
  )

  await assert.rejects(
    service.createLeaveRequest({
      employeeName: 'Juan Dela Cruz',
      department: 'Front Office',
      leaveType: 'Vacation Leave (VL)',
      startDate: '2026-12-01',
      endDate: '2026-12-05',
    }, 'Admin'),
    (err) => err.codeName === 'INVALID_REASON' && err.status === 400
  )
})

test('Leave request status validation rejects invalid status', async () => {
  await assert.rejects(
    service.updateLeaveRequestStatus(1, { status: 'INVALID_STATUS' }, 'Manager'),
    (err) => err.codeName === 'INVALID_STATUS' && err.status === 400
  )
})
