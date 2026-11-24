
import { useEffect, useState } from 'react';
import { departmentApi } from '../../../frontend/src/services/api.js';
import {
  LayoutDashboard, Megaphone, MessageSquare, Users, Building2, Tag,
  Receipt, ChartNoAxesCombined, Settings, Bell, Search, Plus,
  CalendarDays, ArrowUpRight, Menu, X, BedDouble, Download,
  Target, FileSpreadsheet, Trash2, Check, RefreshCw, ChevronDown, LogOut
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import "./sales-marketing.css";
import logo from "./logo.png";

const navigation = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Campaigns", icon: Megaphone },
  { name: "Inquiries", icon: MessageSquare },
  { name: "Sales Leads", icon: Target },
  { name: "Corporate Clients", icon: Building2 },
  { name: "Promotions", icon: Tag },
  { name: "Sales Records", icon: Receipt },
  { name: "Reports", icon: ChartNoAxesCombined },
];

const colors = ["#2463A5", "#D5B77D", "#63A89A", "#D58C83"];

const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", maximumFractionDigits: 0,
  }).format(Number(value) || 0);

function StatusBadge({ status }) {
  return <span className={`status-badge ${String(status).toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

function AddRecordModal({ config, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(() => Object.fromEntries(
    config.fields.filter(([, , type]) => type === "select").map(([key, , , options]) => [key, options[0]])
  ));

  function submit(event) {
    event.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="campaign-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><h2>{config.title}</h2><p>Complete the information below.</p></div>
          <button className="modal-close" type="button" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={submit}>
          {config.fields.map(([key, label, type, options]) => (
            <div key={key} className="modal-field">
              <label>{label} *</label>

              {type === "select" ? (
                <select required value={form[key] || options[0]} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}>
                  {options.map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  required type={type}
                  min={type === "number" ? 0 : undefined}
                  step={type === "number" ? "0.01" : undefined}
                  max={key === "discount" ? 100 : undefined}
                  value={form[key] || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                  placeholder={`Enter ${label.toLowerCase()}`}
                />
              )}
            </div>
          ))}

          <div className="modal-actions">{error && <p role="alert">{error}</p>}
            <button type="button" className="outline-button" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="primary-button"><Plus size={16} /> Save Record</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ user, signOut }) {
  const [busy, setBusy] = useState(false);

  async function endSession() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }
  const [activePage, setActivePage] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { campaign: campaigns = [], inquiry: inquiries = [], lead: leads = [],
    client: clients = [], promotion: promotions = [], sale: sales = [] } = overview?.collections || {};
  const salesData = overview?.monthly || [];
  const channels = new Map();
  for (const { source } of leads) channels.set(source, (channels.get(source) || 0) + 1);
  const channelData = [...channels].map(([name, value]) => ({ name, value }));

  useEffect(() => {
    let active = true;
    departmentApi.sales().then(
      (result) => { if (active) setOverview(result); },
      (failure) => { if (active) setError(failure.message); },
    );
    return () => { active = false; };
  }, []);

  const [modal, setModal] = useState("");
  const [search, setSearch] = useState("");
  const [reportType, setReportType] = useState("All Records");
  const [reportDate, setReportDate] = useState("2026");

  const unreadCount = notifications.filter((item) => !item.read).length;

  const pageDescriptions = {
    Dashboard: "Monitor your hotel's sales and marketing performance.",
    Campaigns: "Create and monitor your marketing campaigns.",
    Inquiries: "Manage guest questions, requests, and reservations.",
    "Sales Leads": "Manage potential guests and business opportunities.",
    "Corporate Clients": "Manage corporate accounts and partnerships.",
    Promotions: "Create discounts, packages, and special offers.",
    "Sales Records": "Manage and review hotel sales transactions.",
    Reports: "Generate and export your sales and marketing reports.",
    Settings: "Manage your HOSIS application preferences.",
  };

  function notify(text) {
    setNotifications((previous) => [
      { id: Date.now(), text, time: "Just now", read: false }, ...previous,
    ]);
  }

  async function changeRecords(action, message) {
    if (saving) return false;
    setSaving(true);
    setError("");
    try {
      await action();
      notify(message);
      try {
        setOverview(await departmentApi.sales());
      } catch (failure) {
        setError(failure.message);
      }
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addRecord(type, data) {
    if (await changeRecords(() => departmentApi.addSalesRecord(type, data), "Record added.")) setModal("");
  }

  function deleteRecord(type, id) {
    if (window.confirm("Are you sure you want to delete this record?")) {
      void changeRecords(() => departmentApi.deleteSalesRecord(type, id), "Record deleted.");
    }
  }

  function updateStatus(type, id, status) {
    void changeRecords(() => departmentApi.updateSalesStatus(type, id, status), "Status updated.");
  }

  function markAllRead() {
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
  }

  async function exportExcel() {

    const datasets = {
      Campaigns: campaigns,
      Inquiries: inquiries,
      SalesLeads: leads,
      CorporateClients: clients,
      Promotions: promotions,
      SalesRecords: sales,
    };

    const selected = reportType === "All Records"
      ? datasets
      : { [reportType]: datasets[reportType] || [] };

    const totalSales = sales.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const summary = [
      ["HOSIS - HOTEL OPERATIONS AND SERVICES INTEGRATED SYSTEM"],
      ["SALES AND MARKETING REPORT"],
      [],
      ["Report Year", reportDate],
      ["Generated Date", new Date().toLocaleString()],
      [],
      ["Report Category", "Total Records"],
      ["Campaigns", campaigns.length],
      ["Inquiries", inquiries.length],
      ["Sales Leads", leads.length],
      ["Corporate Clients", clients.length],
      ["Promotions", promotions.length],
      ["Sales Records", sales.length],
      [],
      ["TOTAL RECORDED SALES", totalSales],
    ];

    await saveWorkbook(
      [...Object.entries(selected).map(([sheet, records]) => ({ sheet, data: spreadsheetRows(records) })),
        { sheet: "Report Summary", data: summary }],
      `HOSIS_Sales_Marketing_Report_${reportDate}.xlsx`,
    );
  }

  function spreadsheetRows(records) {
    const keys = [...new Set(records.flatMap(Object.keys))];
    return keys.length ? [keys, ...records.map((record) => keys.map((key) => record[key] ?? null))] : [["No records"]];
  }

  async function saveWorkbook(sheets, filename) {
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      await writeExcelFile(sheets).toFile(filename);
      notify("Excel file downloaded.");
    } catch {
      notify("Could not download the Excel file.");
    }
  }

  function exportCSV(records, filename) {
    return saveWorkbook([{ sheet: "Records", data: spreadsheetRows(records) }], filename);
  }

  function filtered(records) {
    const query = search.trim().toLowerCase();

    if (!query) return records;

    return records.filter((item) =>
      Object.values(item).join(" ").toLowerCase().includes(query)
    );
  }

  function openAdd(type) {
    setModal(type);
  }

  function PageHeader({ title, description, addType, addLabel }) {
    return (
      <div className="section-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
        {addType && <button className="primary-button" onClick={() => openAdd(addType)}><Plus size={17} /> {addLabel}</button>}
      </div>
    );
  }

  function Table({ columns, records, type, onStatus }) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key}>{column.label}</th>)}
              <th>ACTION</th>
            </tr>
          </thead>

          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="no-data">No records found.</td></tr>
            ) : records.map((record) => (
              <tr key={record.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.key === "status" || column.key === "payment" ? (
                      column.key === "status" && onStatus ? (
                        <select className="status-select" value={record.status} onChange={(event) => onStatus(record.id, event.target.value)}>
                          {column.options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : <StatusBadge status={record[column.key]} />
                    ) : column.key === "budget" || column.key === "amount" ? currency(record[column.key])
                      : column.key === "discount" ? `${record.discount}%`
                      : record[column.key]}
                  </td>
                ))}
                <td>
                  <button className="icon-action danger" title="Delete record" onClick={() => deleteRecord(type, record.id)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderDashboard() {
    const totalRevenue = sales.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const stats = [
      { title: "Recorded Revenue", value: currency(totalRevenue), icon: Receipt, color: "blue" },
      { title: "Active Campaigns", value: campaigns.filter((item) => item.status === "Active").length, icon: Megaphone, color: "sand" },
      { title: "Guest Inquiries", value: inquiries.length, icon: MessageSquare, color: "green" },
      { title: "Hotel Bookings", value: overview?.bookings ?? "—", icon: BedDouble, color: "rose" },
    ];

    return (
      <>
        <div className="welcome-row">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h2>Welcome to HOSIS!</h2>
            <p className="muted">Here's your hotel's sales and marketing overview.</p>
          </div>
          <div className="date-pill"><CalendarDays size={16} /> November 2026</div>
        </div>

        <div className="stats-grid">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <div className="stat-card" key={stat.title}>
                <div className={`stat-icon ${stat.color}`}><Icon size={21} /></div>
                <p>{stat.title}</p>
                <h3>{stat.value}</h3>
                <span className="positive"><ArrowUpRight size={14} /> Updated from records</span>
              </div>
            );
          })}
        </div>

        <div className="dashboard-grid">
          <div className="panel">
            <div className="panel-heading">
              <div><h3>Sales Performance</h3><p>Payments recorded in HOSIS by month</p></div>
              <span className="year-label">2026</span>
            </div>

            <div className="chart-summary">{currency(salesData.reduce((sum, row) => sum + row.sales, 0))} <span>Collected over 12 months</span></div>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData}>
                  <defs>
                    <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#245D9B" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#245D9B" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eeeaf0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => currency(value)} />
                  <Area type="monotone" dataKey="sales" stroke="#245D9B" strokeWidth={3} fill="url(#blueGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div><h3>Marketing Channels</h3><p>Sales leads by source</p></div>
            </div>

            <div className="pie-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={83} paddingAngle={4}>
                    {channelData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {channelData.map((item, index) => (
              <div className="legend-item" key={item.name}>
                <span><i style={{ background: colors[index % colors.length] }} />{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div><h3>Recent Campaigns</h3><p>Your latest marketing activities</p></div>
            <button className="text-button" onClick={() => setActivePage("Campaigns")}>View all <ArrowUpRight size={15} /></button>
          </div>

          <Table
            columns={[
              { key: "name", label: "CAMPAIGN" },
              { key: "type", label: "TYPE" },
              { key: "budget", label: "BUDGET" },
              { key: "status", label: "STATUS" }
            ]}
            records={campaigns.slice(0, 5)}
            type="campaign"
          />
        </div>
      </>
    );
  }

  function renderCampaigns() {
    return (
      <>
        <PageHeader title="Campaign Management" description={pageDescriptions.Campaigns} addType="campaign" addLabel="Add Campaign" />

        <div className="panel">
          <div className="table-toolbar">
            <Search size={17} />
            <input className="toolbar-input" placeholder="Search campaigns..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="outline-button" onClick={() => exportCSV(campaigns, "HOSIS_Campaigns.xlsx")}><Download size={16} /> Export</button>
          </div>

          <Table
            columns={[
              { key: "name", label: "CAMPAIGN NAME" },
              { key: "type", label: "TYPE" },
              { key: "budget", label: "BUDGET" },
              { key: "start", label: "START DATE" },
              { key: "end", label: "END DATE" },
              { key: "status", label: "STATUS", options: ["Active", "Pending", "Completed"] }
            ]}
            records={filtered(campaigns)}
            type="campaign"
            onStatus={(id, status) => updateStatus("campaign", id, status)}
          />
        </div>
      </>
    );
  }

  function renderInquiries() {
    return (
      <>
        <PageHeader title="Guest Inquiries" description={pageDescriptions.Inquiries} addType="inquiry" addLabel="Add inquiries" />

        <div className="panel">
          <div className="table-toolbar">
            <Search size={17} />
            <input className="toolbar-input" placeholder="Search inquiries..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="outline-button" onClick={() => exportCSV(inquiries, "HOSIS_Inquiries.xlsx")}><Download size={16} /> Export</button>
          </div>

          <Table
            columns={[
              { key: "id", label: "INQUIRY ID" },
              { key: "guest", label: "GUEST NAME" },
              { key: "subject", label: "SUBJECT" },
              { key: "date", label: "DATE" },
              { key: "status", label: "STATUS", options: ["New", "In Progress", "Resolved"] }
            ]}
            records={filtered(inquiries)}
            type="inquiry"
            onStatus={(id, status) => updateStatus("inquiry", id, status)}
          />
        </div>
      </>
    );
  }

  function renderLeads() {
    return (
      <>
        <PageHeader title="Sales Leads" description={pageDescriptions["Sales Leads"]} addType="lead" addLabel="Add Lead" />

        <div className="panel">
          <div className="table-toolbar">
            <Search size={17} />
            <input className="toolbar-input" placeholder="Search leads..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="outline-button" onClick={() => exportCSV(leads, "HOSIS_Leads.xlsx")}><Download size={16} /> Export</button>
          </div>

          <Table
            columns={[
              { key: "id", label: "LEAD ID" },
              { key: "name", label: "COMPANY / LEAD" },
              { key: "contact", label: "CONTACT PERSON" },
              { key: "email", label: "EMAIL" },
              { key: "source", label: "SOURCE" },
              { key: "status", label: "STATUS", options: ["New", "Qualified", "Converted", "Lost"] }
            ]}
            records={filtered(leads)}
            type="lead"
            onStatus={(id, status) => updateStatus("lead", id, status)}
          />
        </div>
      </>
    );
  }

  function renderClients() {
    return (
      <>
        <PageHeader title="Corporate Clients" description={pageDescriptions["Corporate Clients"]} addType="client" addLabel="Add Client" />

        <div className="panel">
          <div className="table-toolbar">
            <Search size={17} />
            <input className="toolbar-input" placeholder="Search clients..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="outline-button" onClick={() => exportCSV(clients, "HOSIS_Clients.xlsx")}><Download size={16} /> Export</button>
          </div>

          <Table
            columns={[
              { key: "id", label: "CLIENT ID" },
              { key: "company", label: "COMPANY" },
              { key: "contact", label: "CONTACT PERSON" },
              { key: "email", label: "EMAIL" },
              { key: "phone", label: "PHONE" }
            ]}
            records={filtered(clients)}
            type="client"
          />
        </div>
      </>
    );
  }

  function renderPromotions() {
    return (
      <>
        <PageHeader title="Promotions" description={pageDescriptions.Promotions} addType="promotion" addLabel="Add Promotion" />

        <div className="stats-grid promotion-stats">
          <div className="stat-card"><div className="stat-icon sand"><Tag /></div><p>Total Promotions</p><h3>{promotions.length}</h3></div>
          <div className="stat-card"><div className="stat-icon green"><Check /></div><p>Active Promotions</p><h3>{promotions.filter((item) => item.status === "Active").length}</h3></div>
          <div className="stat-card"><div className="stat-icon blue"><CalendarDays /></div><p>Pending Promotions</p><h3>{promotions.filter((item) => item.status === "Pending").length}</h3></div>
          <div className="stat-card"><div className="stat-icon rose"><Tag /></div><p>Average Discount</p><h3>{promotions.length ? Math.round(promotions.reduce((sum, item) => sum + Number(item.discount), 0) / promotions.length) : 0}%</h3></div>
        </div>

        <div className="panel">
          <div className="table-toolbar">
            <Search size={17} />
            <input className="toolbar-input" placeholder="Search promotions..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="outline-button" onClick={() => exportCSV(promotions, "HOSIS_Promotions.xlsx")}><Download size={16} /> Export</button>
          </div>

          <Table
            columns={[
              { key: "id", label: "PROMOTION ID" },
              { key: "name", label: "PROMOTION NAME" },
              { key: "type", label: "TYPE" },
              { key: "discount", label: "DISCOUNT" },
              { key: "start", label: "START DATE" },
              { key: "end", label: "END DATE" },
              { key: "status", label: "STATUS", options: ["Active", "Pending", "Expired"] }
            ]}
            records={filtered(promotions)}
            type="promotion"
            onStatus={(id, status) => updateStatus("promotion", id, status)}
          />
        </div>
      </>
    );
  }

  function renderSales() {
    return (
      <>
        <PageHeader title="Sales Records" description={pageDescriptions["Sales Records"]} addType="sale" addLabel="Add Sales Record" />

        <div className="panel">
          <div className="table-toolbar">
            <Search size={17} />
            <input className="toolbar-input" placeholder="Search sales..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="outline-button" onClick={() => exportCSV(sales, "HOSIS_Sales.xlsx")}><Download size={16} /> Export</button>
          </div>

          <Table
            columns={[
              { key: "id", label: "SALES ID" },
              { key: "customer", label: "CUSTOMER" },
              { key: "item", label: "PRODUCT / SERVICE" },
              { key: "amount", label: "AMOUNT" },
              { key: "date", label: "DATE" },
              { key: "payment", label: "PAYMENT" }
            ]}
            records={filtered(sales)}
            type="sale"
          />
        </div>
      </>
    );
  }

  function renderReports() {
    const total = sales.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return (
      <>
        <PageHeader title="Reports & Analytics" description={pageDescriptions.Reports} />

        <div className="report-controls panel">
          <div>
            <label>Report Category</label>
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              <option>All Records</option>
              <option>Campaigns</option>
              <option>Inquiries</option>
              <option>SalesLeads</option>
              <option>CorporateClients</option>
              <option>Promotions</option>
              <option>SalesRecords</option>
            </select>
          </div>

          <div>
            <label>Report Year</label>
            <select value={reportDate} onChange={(event) => setReportDate(event.target.value)}>
              <option>2026</option>
              <option>2027</option>
              <option>2025</option>
            </select>
          </div>

          <button className="primary-button generate-button" onClick={exportExcel}>
            <FileSpreadsheet size={18} /> Generate Excel Report
          </button>
        </div>

        <div className="stats-grid report-stats">
          <div className="stat-card"><div className="stat-icon blue"><Receipt /></div><p>Total Recorded Revenue</p><h3>{currency(total)}</h3></div>
          <div className="stat-card"><div className="stat-icon sand"><Megaphone /></div><p>Campaigns</p><h3>{campaigns.length}</h3></div>
          <div className="stat-card"><div className="stat-icon green"><Users /></div><p>Corporate Clients</p><h3>{clients.length}</h3></div>
          <div className="stat-card"><div className="stat-icon rose"><Tag /></div><p>Promotions</p><h3>{promotions.length}</h3></div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div><h3>Sales Summary</h3><p>Payments recorded in HOSIS by month</p></div>
            <button className="outline-button" onClick={exportExcel}><Download size={16} /> Export Excel</button>
          </div>

          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => currency(value)} />
                <Bar dataKey="sales" fill="#245D9B" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
    );
  }

  function renderSettings() {
    return (
      <div className="panel settings-panel">
        <h3>System Settings</h3>
        <p>HOSIS — Hotel Operations and Services Integrated System</p>

        <div className="setting-row">
          <div><strong>Application Name</strong><span>HOSIS</span></div>
          <StatusBadge status="Active" />
        </div>

        <div className="setting-row">
          <div><strong>System Module</strong><span>Sales and Marketing</span></div>
        </div>

        <div className="setting-row">
          <div><strong>Color Theme</strong><span>Rich Blue and Sand</span></div>
        </div>

        <div className="setting-row">
          <div><strong>Version</strong><span>1.0.0</span></div>
        </div>

        <button className="outline-button" onClick={() => { setSearch(""); notify("System view refreshed."); }}>
          <RefreshCw size={16} /> Refresh system
        </button>
      </div>
    );
  }

  const modalConfigs = {
    inquiry: {
      title: "Add Inquiry",
      fields: [
        ["guest", "Guest Name", "text"],
        ["subject", "Subject", "text"],
        ["date", "Inquiry Date", "date"],
        ["status", "Status", "select", ["New", "In Progress", "Resolved"]]
      ]
    },
    campaign: {
      title: "Add New Campaign",
      fields: [
        ["name", "Campaign Name", "text"],
        ["type", "Campaign Type", "select", ["Social Media", "Email Marketing", "Corporate", "Promotional", "Website"]],
        ["budget", "Budget (PHP)", "number"],
        ["start", "Start Date", "date"],
        ["end", "End Date", "date"],
        ["status", "Status", "select", ["Active", "Pending", "Completed"]]
      ]
    },

    promotion: {
      title: "Add New Promotion",
      fields: [
        ["name", "Promotion Name", "text"],
        ["type", "Promotion Type", "select", ["Room Discount", "Corporate Discount", "Package Deal", "Seasonal Offer", "Other"]],
        ["discount", "Discount (%)", "number"],
        ["start", "Start Date", "date"],
        ["end", "End Date", "date"],
        ["status", "Status", "select", ["Active", "Pending", "Expired"]]
      ]
    },

    lead: {
      title: "Add Sales Lead",
      fields: [
        ["name", "Company / Lead Name", "text"],
        ["contact", "Contact Person", "text"],
        ["email", "Email Address", "email"],
        ["source", "Lead Source", "select", ["Website", "Social Media", "Referral", "Walk-in", "Other"]],
        ["status", "Status", "select", ["New", "Qualified", "Converted", "Lost"]]
      ]
    },

    client: {
      title: "Add Corporate Client",
      fields: [
        ["company", "Company Name", "text"],
        ["contact", "Contact Person", "text"],
        ["email", "Email Address", "email"],
        ["phone", "Phone Number", "tel"]
      ]
    },

    sale: {
      title: "Add Sales Record",
      fields: [
        ["customer", "Customer Name", "text"],
        ["item", "Product / Service", "text"],
        ["amount", "Amount (PHP)", "number"],
        ["date", "Sales Date", "date"],
        ["payment", "Payment Status", "select", ["Paid", "Pending"]]
      ]
    },
  };

  function renderCurrentPage() {
    switch (activePage) {
      case "Dashboard": return renderDashboard();
      case "Campaigns": return renderCampaigns();
      case "Inquiries": return renderInquiries();
      case "Sales Leads": return renderLeads();
      case "Corporate Clients": return renderClients();
      case "Promotions": return renderPromotions();
      case "Sales Records": return renderSales();
      case "Reports": return renderReports();
      case "Settings": return renderSettings();
      default: return renderDashboard();
    }
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">

          {/* ONLY LOGO CHANGE */}
          <div className="brand-logo">
            <img
              src={logo}
              alt="HOSIS Logo"
              onError={(event) => {
                event.currentTarget.style.display = "none";
                event.currentTarget.nextSibling.style.display = "grid";
              }}
            />
            <span className="logo-fallback">H</span>
          </div>

          <button className="mobile-close" onClick={() => setSidebarOpen(false)}>
            <X />
          </button>
        </div>

        <div className="nav-caption">MAIN MENU</div>

        <nav className="navigation">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`nav-link ${activePage === item.name ? "active" : ""}`}
                onClick={() => {
                  setActivePage(item.name);
                  setSearch("");
                  setSidebarOpen(false);
                }}
              >
                <Icon size={19} />
                <span>{item.name}</span>
                {item.name === "Inquiries" && <span className="nav-count">{inquiries.length}</span>}
              </button>
            );
          })}
        </nav>

        <div className="nav-caption settings-caption">PREFERENCES</div>

        <button
          className={`nav-link ${activePage === "Settings" ? "active" : ""}`}
          onClick={() => {
            setActivePage("Settings");
            setSidebarOpen(false);
          }}
        >
          <Settings size={19} />
          <span>Settings</span>
        </button>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-symbol">✦</div>
            <strong>Need assistance?</strong>
            <p>Contact your system administrator for help.</p>
            <button onClick={() => window.alert("Please contact your system administrator.")}>
              Get Support
            </button>
          </div>

          <div className="sidebar-version">
            HOSIS SALES & MARKETING
            <span>v1.0.0</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        {error && <p role="alert">{error} <button type="button" onClick={() =>
          departmentApi.sales().then((result) => { setOverview(result); setError(""); },
            (failure) => setError(failure.message))}>Reload records</button></p>}
        {activePage === "Dashboard" && overview && <p>Available rooms now: {overview.available}</p>}
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-button" onClick={() => setSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="breadcrumb">Pages <span>/</span> <strong>{activePage}</strong></div>
          </div>

          <div className="topbar-right">
            <div className="global-search">
              <Search size={16} />
              <input
                placeholder="Search anything..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="notification-wrap">
              <button
                className="notification-button"
                onClick={() => setNotificationOpen((open) => !open)}
                aria-label="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && <i />}
              </button>

              {notificationOpen && (
                <div className="notification-dropdown">
                  <div className="notification-head">
                    <strong>Notifications</strong>
                    <button onClick={markAllRead}>Mark all read</button>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="no-notifications">You're all caught up!</p>
                  ) : notifications.map((item) => (
                    <button
                      className={`notification-item ${item.read ? "read" : ""}`}
                      key={item.id}
                      onClick={() => setNotifications((prev) =>
                        prev.map((notice) =>
                          notice.id === item.id ? { ...notice, read: true } : notice
                        )
                      )}
                    >
                      <span className="notification-dot" />
                      <span>
                        <strong>{item.text}</strong>
                        <small>{item.time}</small>
                      </span>
                    </button>
                  ))}

                  <button className="clear-notifications" onClick={() => setNotifications([])}>
                    Clear all notifications
                  </button>
                </div>
              )}
            </div>

            {/* ONLY NAME CHANGE */}
            <div className="profile">
              <div className="avatar">{user.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</div>
              <div className="profile-info">
                <strong>{user.name}</strong>
                <span>Sales &amp; Marketing</span>
              </div>
              <ChevronDown size={15} />
            </div>
            <button className="signout-button" onClick={endSession} disabled={busy}><LogOut size={16} />{busy ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </header>

        <section className="page-content">
          <div className="page-title-row">
            <div>
              <p className="eyebrow">HOTEL OPERATIONS & SERVICES INTEGRATED SYSTEM</p>
              <h1>{activePage}</h1>
            </div>

            {activePage === "Dashboard" && (
              <button className="primary-button" onClick={() => openAdd("campaign")}>
                <Plus size={17} /> Create Campaign
              </button>
            )}
          </div>

          {renderCurrentPage()}
        </section>
      </main>

      {modal && modalConfigs[modal] && (
        <AddRecordModal saving={saving} error={error}
          config={modalConfigs[modal]}
          onClose={() => setModal("")}
          onSave={(data) => addRecord(modal, data)}
        />
      )}
    </div>
  );
}

export default function SalesMarketingApp({ user, onSignOut }) {
  return (
    <div className="sales-marketing">
      <Dashboard user={user} signOut={onSignOut} />
    </div>
  );
}
