// Builds the downloadable work report (My Record page) from
// GET /me/work-report: a summary block and one table per kind of work.
import { formatDateTime, formatTime, label, longDate, staffId } from './format.js'

const short = { month: 'short', day: 'numeric', year: 'numeric' }

export function workReportSections(data) {
  const { profile: p, totals: t, from, to } = data
  const inspected = t.inspections_passed + t.inspections_failed
  const summary = [
    ['Staff member', `${p.first_name} ${p.last_name} (${staffId(p.user_id)})`],
    ['Position', `Housekeeping ${label(p.position)}`],
    ['Period', `${longDate(from, short)} to ${longDate(to, short)}`],
    ['Shifts', t.shifts],
    ['Rooms cleaned', `${t.tasks_completed} of ${t.tasks_assigned} assigned`],
    ['Inspection pass rate', inspected ? `${Math.round((t.inspections_passed / inspected) * 100)}% (${t.inspections_passed} passed, ${t.inspections_failed} returned)` : 'No inspections'],
    ['Guest requests completed', t.requests_completed],
    ['Found items recorded', t.items_found],
    ['Maintenance issues reported', t.issues_reported],
  ]
  const sections = [
    {
      heading: 'Shifts',
      rows: data.shifts,
      columns: [
        { title: 'Date', value: (s) => longDate(s.shift_date, short) },
        { title: 'Shift', value: (s) => label(s.shift) },
        { title: 'Time', value: (s) => `${formatTime(s.start_time)} - ${formatTime(s.end_time)}` },
        { title: 'Area', value: (s) => s.assigned_area },
      ],
    },
    {
      heading: 'Cleaning tasks',
      rows: data.tasks,
      columns: [
        { title: 'Date', value: (x) => longDate(x.assigned_date, short) },
        { title: 'Room', value: (x) => x.room_number },
        { title: 'Type', value: (x) => label(x.task_type) },
        { title: 'Priority', value: (x) => label(x.priority) },
        { title: 'Status', value: (x) => label(x.task_status) },
        { title: 'Started', value: (x) => formatDateTime(x.start_time) },
        { title: 'Finished', value: (x) => formatDateTime(x.completion_time) },
      ],
    },
    {
      heading: 'Inspection results',
      rows: data.inspections,
      columns: [
        { title: 'Date', value: (i) => formatDateTime(i.inspected_at) },
        { title: 'Room', value: (i) => i.room_number },
        { title: 'Result', value: (i) => label(i.inspection_result) },
        { title: 'Inspector', value: (i) => i.inspector },
        { title: 'Remarks', value: (i) => i.remarks || '' },
      ],
    },
    {
      heading: 'Guest requests',
      rows: data.requests,
      columns: [
        { title: 'Requested', value: (q) => formatDateTime(q.requested_at) },
        { title: 'Room', value: (q) => q.room_number },
        { title: 'Request', value: (q) => label(q.request_type) },
        { title: 'Status', value: (q) => label(q.request_status) },
        { title: 'Completed', value: (q) => formatDateTime(q.completed_at) },
      ],
    },
    {
      heading: 'Found items recorded',
      rows: data.items,
      columns: [
        { title: 'Label', value: (i) => i.storage_label },
        { title: 'Item', value: (i) => i.item_description },
        { title: 'Found in', value: (i) => (i.room_number ? `Room ${i.room_number}, ${i.found_location}` : i.found_location) },
        { title: 'Found', value: (i) => formatDateTime(i.found_at) },
        { title: 'Status', value: (i) => label(i.item_status) },
      ],
    },
    {
      heading: 'Maintenance issues reported',
      rows: data.issues,
      columns: [
        { title: 'Reported', value: (m) => formatDateTime(m.reported_at) },
        { title: 'Room', value: (m) => m.room_number },
        { title: 'Issue', value: (m) => label(m.issue_category) },
        { title: 'Priority', value: (m) => label(m.priority) },
        { title: 'Status', value: (m) => label(m.status) },
      ],
    },
  ]
  return { summary, sections }
}
