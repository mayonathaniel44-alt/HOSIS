import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HR from './data.js'

const colors = ['#28649a', '#c4943f', '#2c805e', '#b74c44', '#7863a3', '#3c7b82']

function Chart({ title, description, children }) {
  return <section className="card panel hr-dashboard-chart">
    <h2>{title}</h2><p>{description}</p>
    <div className="hr-dashboard-plot"><ResponsiveContainer width="100%" height={190}>{children}</ResponsiveContainer></div>
  </section>
}

export default function HrDashboard() {
  const departments = Object.entries(HR.DEPTS).map(([key, department]) => {
    const employees = HR.E.filter(employee => employee.dept === key)
    return { name: department.name, employees: employees.length, available: employees.filter(HR.isAvailable).length }
  })
  const leaves = ['Approved', 'Pending', 'Rejected'].map((name, index) => ({
    name, count: HR.LEAVES.filter(leave => leave.status === name).length,
    color: [colors[2], colors[1], colors[3]][index],
  }))
  const pending = HR.LEAVES.filter(leave => leave.status === 'Pending')
  const [year, month] = HR.TODAY.split('-').map(Number)
  const trend = Array.from({ length: 6 }, (_, index) => {
    const end = new Date(Date.UTC(year, month + index - 5, 0))
    const cutoff = index === 5 ? HR.TODAY : end.toISOString().slice(0, 10)
    return {
      name: end.toLocaleString('en', { month: 'short', timeZone: 'UTC' }),
      employees: HR.E.filter(employee => employee.hired && employee.hired <= cutoff).length,
    }
  })
  const stats = [
    ['Total employees', HR.E.length, HR.E.filter(HR.isAvailable).length + ' available today'],
    ['Pending leave', pending.length, 'Awaiting HR review'],
    ['Training sessions', HR.TRAINING.filter(record => record.status === 'Upcoming').length, 'Upcoming sessions'],
    ['Open vacancies', HR.VACANCIES.filter(record => record.status === 'Open').reduce((sum, record) => sum + record.openings, 0), HR.CANDIDATES.length + ' applicants'],
  ]
  return <>
    <h1>Dashboard</h1><p className="sub">HR operations across Grand Horizon Hotel · {HR.TODAY}</p>
    <div className="grid4">{stats.map(([title, value, description]) => <section className="card panel" key={title}>
      <small>{title}</small><h2>{value}</h2><p>{description}</p>
    </section>)}</div>
    <div className="hr-dashboard-grid">
      <Chart title="Employee distribution" description={departments.map(item => `${item.name} (${item.employees})`).join(' · ')}>
        <PieChart><Tooltip /><Pie data={departments} dataKey="employees" nameKey="name" outerRadius={78}>
          {departments.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
        </Pie></PieChart>
      </Chart>
      <Chart title="Attendance today" description="Available employees by department">
        <BarChart data={departments}><CartesianGrid vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} /><YAxis allowDecimals={false} /><Tooltip />
          <Bar dataKey="available">{departments.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Bar>
        </BarChart>
      </Chart>
      <Chart title="Leave requests" description={leaves.map(item => `${item.name} (${item.count})`).join(' · ')}>
        <PieChart><Tooltip /><Pie data={leaves} dataKey="count" nameKey="name" innerRadius={45} outerRadius={78}>
          {leaves.map(item => <Cell key={item.name} fill={item.color} />)}
        </Pie></PieChart>
      </Chart>
      <Chart title="Headcount trend" description="Current employee roster grouped by hire date">
        <LineChart data={trend}><CartesianGrid vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Line dataKey="employees" stroke={colors[1]} strokeWidth={2} /></LineChart>
      </Chart>
    </div>
    <div className="hr-dashboard-grid">
      <section className="card panel"><h2>Pending leave requests</h2>
        {pending.length ? <ul>{pending.slice(0, 5).map(leave => <li key={leave.id}>{HR.emp(leave.emp)?.name || leave.emp} · {leave.type} · {leave.from} to {leave.to}</li>)}</ul> : <p>No pending leave requests.</p>}
        <button type="button" className="btn" onClick={() => HR.go('leave')}>View leave requests</button>
      </section>
      <section className="card panel"><h2>Quick actions</h2>
        <div className="hr-dashboard-actions">{[['leave', 'File or review leave'], ['recruitment', 'Manage applicants'], ['records', 'Employee records'], ['reports', 'Export reports']].map(([page, label]) =>
          <button type="button" className="btn" key={page} onClick={() => HR.go(page)}>{label}</button>)}</div>
      </section>
    </div>
  </>
}
