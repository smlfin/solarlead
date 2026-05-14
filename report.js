// ============================================================
// SOLAR LEAD REPORTS — report.js (v3 — CSV fetch)
// ============================================================

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTY-Kkkau9RrlH2yOF19QavsdqMhxRm7Fso8dkLHrDPg8rOBIPZx18WpqIRRE7asgC7ssx3P3SxUV2E/pub?gid=0&single=true&output=csv";
const REPORT_PASSWORD = "solar";

// ── EXACT COLUMN HEADERS FROM SHEET ──────────────────────────
const COL = {
  ref:        "Ref Number",
  timestamp:  "Timestamp",
  empName:    "Employee Name",
  empCode:    "Employee Code",
  desig:      "Designation",
  empMobile:  "Employee Mobile Number",
  company:    "Company Name",
  branch:     "Branch Name",
  custName:   "Customer Name",
  custMobile: "Customer Mobile Number",
  custAddr:   "Customer Address",
  ksebCons:   "KSEB Consumer Number",
  bill:       "Monthly KSEB Bill",
  billFile:   "Upload KSEB BILL",
  status:     "Lead Status",
  bankName:   "Bank Name",
  bankBranch: "Bank Branch",
  account:    "Account Number",
  ifsc:       "IFSC Code"
};

// ── STATE ─────────────────────────────────────────────────────
let allLeads      = [];
let filteredLeads = [];
let selectedMonth = "all";
let companyMonth  = "all";
let branchMonth   = "all";
let perfMonth     = "all";

// ── BOOT ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  if (sessionStorage.getItem("rpt_auth") === "1") {
    showDashboard();
  } else {
    document.getElementById("loginScreen").classList.remove("hidden");
  }
  document.getElementById("passwordInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") attemptLogin();
  });
  document.getElementById("drillModal").addEventListener("click", function (e) {
    if (e.target === this) closeDrill();
  });
});

// ── AUTH ─────────────────────────────────────────────────────
function attemptLogin() {
  var pw = document.getElementById("passwordInput").value;
  if (pw === REPORT_PASSWORD) {
    sessionStorage.setItem("rpt_auth", "1");
    document.getElementById("loginError").classList.add("hidden");
    showDashboard();
  } else {
    document.getElementById("loginError").classList.remove("hidden");
    document.getElementById("passwordInput").value = "";
    document.getElementById("passwordInput").focus();
  }
}
function logout() { sessionStorage.removeItem("rpt_auth"); location.reload(); }
function showDashboard() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  fetchData();
}

// ── FETCH & PARSE CSV ─────────────────────────────────────────
async function fetchData() {
  setLoading(true);
  document.getElementById("fetchError").classList.add("hidden");
  try {
    var res  = await fetch(CSV_URL);
    var text = await res.text();
    allLeads = parseCSV(text);
    if (allLeads.length === 0) {
      showFetchError("No data found in sheet. Make sure the sheet has rows below the header.");
      return;
    }
    buildMonthFilter();
    applyGlobalFilter();
    renderAll();
  } catch (e) {
    showFetchError("Failed to load data: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ── CSV PARSER ────────────────────────────────────────────────
function parseCSV(text) {
  var lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header — handle \r
  var headers = splitCSVRow(lines[0]).map(h => h.trim().replace(/\r/g, ""));

  // Map header name → column index
  var idx = {};
  Object.keys(COL).forEach(function (k) {
    var i = headers.indexOf(COL[k]);
    idx[k] = i; // -1 if not found
  });

  var leads = [];
  for (var r = 1; r < lines.length; r++) {
    var row = splitCSVRow(lines[r]);
    if (!row || row.length < 2) continue;

    function get(k) {
      var i = idx[k];
      return i >= 0 && i < row.length ? row[i].trim().replace(/\r/g, "") : "";
    }

    var ref = get("ref");
    if (!ref) continue; // skip blank rows

    // Parse timestamp — handles "DD/MM/YYYY HH:MM:SS", "M/D/YYYY H:MM:SS", ISO, etc.
    var ts  = parseTimestamp(get("timestamp"));
    var bill = parseFloat(get("bill")) || 0;

    leads.push({
      refNumber:    ref,
      timestamp:    ts,          // Date object or null
      employeeName: get("empName"),
      employeeCode: get("empCode"),
      designation:  get("desig"),
      companyName:  get("company"),
      branchName:   get("branch"),
      customerName: get("custName"),
      monthlyBill:  bill,
      status:       get("status") || "Submitted"
    });
  }
  return leads;
}

// Split a CSV row respecting quoted fields
function splitCSVRow(line) {
  var result = [], cur = "", inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// Parse timestamp — always treats DD/MM/YYYY format (never MM/DD)
function parseTimestamp(s) {
  if (!s) return null;
  s = s.trim().replace(/\r/g, "");

  // DD/MM/YYYY HH:MM:SS  (primary format from your sheet)
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var d = new Date(
      parseInt(m[3]),        // year
      parseInt(m[2]) - 1,   // month (0-based) — m[2] is MM
      parseInt(m[1]),        // day               — m[1] is DD
      parseInt(m[4] || 0),
      parseInt(m[5] || 0),
      parseInt(m[6] || 0)
    );
    if (!isNaN(d)) return d;
  }

  // ISO / other formats fallback
  var d2 = new Date(s);
  if (!isNaN(d2)) return d2;

  return null;
}

// ── MONTH KEY from Date ───────────────────────────────────────
function monthKey(d) {
  if (!d || isNaN(d)) return null;
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function monthLabel(key) {
  if (!key) return "Unknown";
  var [y, m] = key.split("-");
  return new Date(y, m - 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}
function monthLabelShort(key) {
  if (!key) return "?";
  var [y, m] = key.split("-");
  return new Date(y, m - 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

// ── ALL MONTH KEYS (sorted) ───────────────────────────────────
function allMonthKeys() {
  var set = {};
  allLeads.forEach(l => { var k = monthKey(l.timestamp); if (k) set[k] = 1; });
  return Object.keys(set).sort();
}

// ── GLOBAL MONTH FILTER ───────────────────────────────────────
function buildMonthFilter() {
  var keys = allMonthKeys().reverse();
  var sel  = document.getElementById("globalMonthFilter");
  sel.innerHTML = '<option value="all">All Months</option>' +
    keys.map(k => `<option value="${k}">${monthLabel(k)}</option>`).join("");
  sel.value = selectedMonth;
}

function onGlobalMonthChange() {
  selectedMonth = document.getElementById("globalMonthFilter").value;
  companyMonth = branchMonth = perfMonth = selectedMonth;
  applyGlobalFilter();
  renderAll();
}

function applyGlobalFilter() {
  filteredLeads = selectedMonth === "all"
    ? allLeads.slice()
    : allLeads.filter(l => monthKey(l.timestamp) === selectedMonth);
}

function leadsForMonth(mk) {
  return mk === "all" ? allLeads.slice() : allLeads.filter(l => monthKey(l.timestamp) === mk);
}

// ── PANEL MONTH SELECT HTML ───────────────────────────────────
function panelMonthSelect(id, val, onchange) {
  var keys = allMonthKeys().reverse();
  return `<select id="${id}" class="panel-month-sel" onchange="${onchange}">
    <option value="all">All Months</option>
    ${keys.map(k => `<option value="${k}" ${val===k?"selected":""}>${monthLabelShort(k)}</option>`).join("")}
  </select>`;
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  document.getElementById("fetchError").classList.add("hidden");
  renderKPIs();
  renderMonthWise();
  renderStatusBreakdown();
  renderCompanyWise();
  renderBranchWise();
  renderTopPerformers();
  renderBillRanges();
  renderRecentLeads();
}

// ── KPI CARDS ─────────────────────────────────────────────────
function renderKPIs() {
  var L         = filteredLeads;
  var total     = L.length;
  var installed = L.filter(l => l.status === "Installed").length;
  var rejected  = L.filter(l => l.status === "Rejected").length;
  var inProg    = total - installed - rejected;
  var conv      = total > 0 ? ((installed / total) * 100).toFixed(1) : "0.0";
  var eligible  = L.filter(l => l.monthlyBill >= 3000).length;

  document.getElementById("kpiGrid").innerHTML = [
    { icon:"📋", label:"Total Leads",       val:total,      color:"sky"  },
    { icon:"✅", label:"Installed",          val:installed,  color:"leaf" },
    { icon:"🔄", label:"In Progress",        val:inProg,     color:"sun"  },
    { icon:"📈", label:"Conversion Rate",    val:conv+"%",   color:"leaf" },
    { icon:"🏦", label:"Incentive Eligible", val:eligible,   color:"sky"  },
    { icon:"❌", label:"Rejected",           val:rejected,   color:"red"  },
  ].map(k => `<div class="kpi kpi-${k.color}">
    <div class="kpi-icon">${k.icon}</div>
    <div class="kpi-val">${k.val}</div>
    <div class="kpi-label">${k.label}</div>
  </div>`).join("");
}

// ── MONTH-WISE OVERVIEW ───────────────────────────────────────
function renderMonthWise() {
  var map = {};
  allLeads.forEach(function (l) {
    var k = monthKey(l.timestamp);
    if (k) map[k] = (map[k] || 0) + 1;
  });
  var keys   = Object.keys(map).sort();
  var labels = keys.map(monthLabelShort);
  var vals   = keys.map(k => map[k]);

  renderBarChart("chartMonthWise", labels, vals, "#0B3954");
  renderTable("tableMonthWise",
    ["Month", "Total Leads"],
    keys.map((k, i) => [monthLabel(k), vals[i]])
  );
}

// ── STATUS BREAKDOWN ──────────────────────────────────────────
function renderStatusBreakdown() {
  var L        = filteredLeads;
  var statuses = ["Submitted","Contacting Customer","Field Visit","Work Order Received","Installed","Rejected"];
  var colors   = ["#1A5276","#7D6608","#76448A","#1F618D","#1E8449","#922B21"];
  var total    = L.length;
  document.getElementById("statusBreakdown").innerHTML = statuses.map(function (s, i) {
    var cnt = L.filter(l => l.status === s).length;
    var pct = total > 0 ? (cnt / total * 100) : 0;
    return `<div class="status-row">
      <div class="status-label">${s}</div>
      <div class="status-bar-wrap"><div class="status-bar-fill" style="width:${pct}%;background:${colors[i]}"></div></div>
      <div class="status-count">${cnt}</div>
      <div class="status-pct">${pct.toFixed(1)}%</div>
    </div>`;
  }).join("");
}

// ── COMPANY-WISE ──────────────────────────────────────────────
function renderCompanyWise() {
  var L       = leadsForMonth(companyMonth);
  var mkeys   = allMonthKeys();
  var companies = [...new Set(allLeads.map(l => l.companyName || "Unknown"))].sort();

  // Summary
  var summary = {};
  L.forEach(l => { var c = l.companyName||"Unknown"; summary[c] = (summary[c]||0)+1; });
  var sumEntries = Object.entries(summary).sort((a,b) => b[1]-a[1]);
  var total = L.length;

  // Matrix (all data, not filtered)
  var matrixRows = companies.map(function (co) {
    var cells    = mkeys.map(mk => allLeads.filter(l => (l.companyName||"Unknown")===co && monthKey(l.timestamp)===mk).length);
    var rowTotal = allLeads.filter(l => (l.companyName||"Unknown")===co).length;
    return { co, cells, rowTotal };
  }).filter(r => r.rowTotal > 0).sort((a,b) => b.rowTotal - a.rowTotal);

  document.getElementById("companyWisePanel").innerHTML = `
    <div class="panel-header">
      <div class="rcard-title"><span class="rcard-icon">🏢</span> Company-wise Leads</div>
      <div class="panel-controls">${panelMonthSelect("companyMonthSel", companyMonth, "onCompanyMonthChange()")}</div>
    </div>
    <canvas id="chartCompanyWise"></canvas>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Company</th><th>Leads</th><th>Share</th></tr></thead>
      <tbody>${sumEntries.map(([name, cnt]) =>
        `<tr><td><strong>${esc(name)}</strong></td>
         <td><span class="drill-link" onclick="drillCompany('${esc(name)}')">${cnt}</span></td>
         <td>${total>0?((cnt/total)*100).toFixed(1):0}%</td></tr>`
      ).join("") || noData(3)}</tbody>
    </table></div>
    <div class="section-sub-title">Month-wise Breakdown (All Time)</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Company</th>${mkeys.map(k=>`<th>${monthLabelShort(k)}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${matrixRows.map(r =>
        `<tr><td><strong>${esc(r.co)}</strong></td>${r.cells.map(c=>`<td>${c||"—"}</td>`).join("")}<td><strong>${r.rowTotal}</strong></td></tr>`
      ).join("") || noData(mkeys.length+2)}</tbody>
    </table></div>`;

  renderBarChart("chartCompanyWise", sumEntries.map(e=>e[0]), sumEntries.map(e=>e[1]), "#F5A623");
}
function onCompanyMonthChange() { companyMonth = document.getElementById("companyMonthSel").value; renderCompanyWise(); }

// ── BRANCH-WISE ───────────────────────────────────────────────
function renderBranchWise() {
  var L       = leadsForMonth(branchMonth);
  var mkeys   = allMonthKeys();
  var branches = [...new Set(allLeads.map(l => (l.branchName||"Unknown").trim()))].sort();

  var map = {};
  L.forEach(function (l) {
    var b = (l.branchName||"Unknown").trim();
    if (!map[b]) map[b] = { leads:0, installed:0, inProg:0, rejected:0 };
    map[b].leads++;
    if (l.status==="Installed")  map[b].installed++;
    else if (l.status==="Rejected") map[b].rejected++;
    else map[b].inProg++;
  });
  var entries = Object.entries(map).sort((a,b)=>b[1].leads-a[1].leads).slice(0,15);

  var matrixRows = branches.map(function (br) {
    var cells    = mkeys.map(mk => allLeads.filter(l => (l.branchName||"Unknown").trim()===br && monthKey(l.timestamp)===mk).length);
    var rowTotal = allLeads.filter(l => (l.branchName||"Unknown").trim()===br).length;
    return { br, cells, rowTotal };
  }).filter(r=>r.rowTotal>0).sort((a,b)=>b.rowTotal-a.rowTotal);

  document.getElementById("branchWisePanel").innerHTML = `
    <div class="panel-header">
      <div class="rcard-title"><span class="rcard-icon">📍</span> Branch-wise Performance</div>
      <div class="panel-controls">${panelMonthSelect("branchMonthSel", branchMonth, "onBranchMonthChange()")}</div>
    </div>
    <canvas id="chartBranchWise"></canvas>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Branch</th><th>Total</th><th>Installed</th><th>In Progress</th><th>Rejected</th><th>Conv%</th></tr></thead>
      <tbody>${entries.map(([name, d]) =>
        `<tr><td><strong>${esc(name)}</strong></td><td>${d.leads}</td><td>${d.installed}</td><td>${d.inProg}</td><td>${d.rejected}</td>
         <td>${d.leads>0?((d.installed/d.leads)*100).toFixed(0):0}%</td></tr>`
      ).join("") || noData(6)}</tbody>
    </table></div>
    <div class="section-sub-title">Month-wise Breakdown (All Time)</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Branch</th>${mkeys.map(k=>`<th>${monthLabelShort(k)}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${matrixRows.map(r =>
        `<tr><td><strong>${esc(r.br)}</strong></td>${r.cells.map(c=>`<td>${c||"—"}</td>`).join("")}<td><strong>${r.rowTotal}</strong></td></tr>`
      ).join("") || noData(mkeys.length+2)}</tbody>
    </table></div>`;

  renderBarChart("chartBranchWise", entries.map(e=>e[0]), entries.map(e=>e[1].leads), "#27AE60");
}
function onBranchMonthChange() { branchMonth = document.getElementById("branchMonthSel").value; renderBranchWise(); }

// ── TOP PERFORMERS ────────────────────────────────────────────
function renderTopPerformers() {
  var L     = leadsForMonth(perfMonth);
  var mkeys = allMonthKeys();

  // All unique employees from full data
  var empSet = {};
  allLeads.forEach(function (l) {
    var key = (l.employeeName||"Unknown").trim() + "||" + (l.employeeCode||"").trim();
    if (!empSet[key]) empSet[key] = { name:(l.employeeName||"Unknown").trim(), code:(l.employeeCode||"").trim() };
  });

  // Summary for filtered period
  var summary = {};
  L.forEach(function (l) {
    var key = (l.employeeName||"Unknown").trim() + "||" + (l.employeeCode||"").trim();
    if (!summary[key]) summary[key] = { name:(l.employeeName||"Unknown").trim(), code:(l.employeeCode||"").trim(),
      leads:0, installed:0, company:l.companyName||"", branch:l.branchName||"" };
    summary[key].leads++;
    if (l.status==="Installed") summary[key].installed++;
  });
  var top = Object.values(summary).sort((a,b)=>b.leads-a.leads).slice(0,10);

  // Matrix (all employees × all months, unfiltered)
  var matrixRows = Object.values(empSet).map(function (emp) {
    var cells = mkeys.map(mk => allLeads.filter(l =>
      (l.employeeName||"Unknown").trim()===emp.name &&
      (l.employeeCode||"").trim()===emp.code &&
      monthKey(l.timestamp)===mk
    ).length);
    var rowTotal = cells.reduce((a,b)=>a+b,0);
    return { emp, cells, rowTotal };
  }).filter(r=>r.rowTotal>0).sort((a,b)=>b.rowTotal-a.rowTotal);

  var medals = ["🥇","🥈","🥉"];
  var cardsHtml = top.length ? top.map(function (d, i) {
    var conv = d.leads > 0 ? ((d.installed/d.leads)*100).toFixed(0) : 0;
    return `<div class="performer-row">
      <div class="performer-rank">${medals[i]||`<span class="rank">#${i+1}</span>`}</div>
      <div class="performer-info">
        <div class="performer-name">${esc(d.name)}</div>
        <div class="performer-meta">
          ${d.code?`<span class="emp-code">${esc(d.code)}</span>`:""}
          ${d.company?`· ${esc(d.company)}`:""}
          ${d.branch?`· ${esc(d.branch)}`:""}
        </div>
      </div>
      <div class="performer-stats">
        <div class="pstat"><span class="pstat-val">${d.leads}</span><span class="pstat-label">Leads</span></div>
        <div class="pstat"><span class="pstat-val">${d.installed}</span><span class="pstat-label">Installed</span></div>
        <div class="pstat"><span class="pstat-val">${conv}%</span><span class="pstat-label">Conv.</span></div>
      </div>
    </div>`;
  }).join("") : `<p class="empty-cell">No data for selected period.</p>`;

  document.getElementById("topPerformersPanel").innerHTML = `
    <div class="panel-header">
      <div class="rcard-title"><span class="rcard-icon">🏆</span> Top Performers</div>
      <div class="panel-controls">${panelMonthSelect("perfMonthSel", perfMonth, "onPerfMonthChange()")}</div>
    </div>
    ${cardsHtml}
    <div class="section-sub-title">Month-wise Breakdown — All Employees (All Time)</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Employee</th><th>Code</th>${mkeys.map(k=>`<th>${monthLabelShort(k)}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${matrixRows.map(r =>
        `<tr><td><strong>${esc(r.emp.name)}</strong></td>
         <td><span class="emp-code">${esc(r.emp.code)}</span></td>
         ${r.cells.map(c=>`<td>${c||"—"}</td>`).join("")}
         <td><strong>${r.rowTotal}</strong></td></tr>`
      ).join("") || noData(mkeys.length+3)}</tbody>
    </table></div>`;
}
function onPerfMonthChange() { perfMonth = document.getElementById("perfMonthSel").value; renderTopPerformers(); }

// ── BILL RANGES ───────────────────────────────────────────────
function renderBillRanges() {
  var L = filteredLeads;
  var ranges = [
    { label:"< ₹1k",    min:0,     max:1000     },
    { label:"₹1k–3k",   min:1000,  max:3000     },
    { label:"₹3k–5k",   min:3000,  max:5000     },
    { label:"₹5k–10k",  min:5000,  max:10000    },
    { label:"> ₹10k",   min:10000, max:Infinity },
  ];
  var counts = ranges.map(r => L.filter(l => l.monthlyBill >= r.min && l.monthlyBill < r.max).length);
  renderBarChart("chartBillRange", ranges.map(r=>r.label), counts, "#E8890A");
}

// ── RECENT LEADS ──────────────────────────────────────────────
function renderRecentLeads() {
  var sorted = filteredLeads.slice()
    .sort((a,b) => (b.timestamp||0) - (a.timestamp||0))
    .slice(0, 20);
  renderTable("tableRecentLeads",
    ["Ref No.", "Employee", "Code", "Customer", "Company", "Branch", "Bill ₹", "Status", "Date"],
    sorted.map(function (l) {
      var d = l.timestamp;
      return [
        esc(l.refNumber),
        esc(l.employeeName),
        `<span class="emp-code">${esc(l.employeeCode)}</span>`,
        esc(l.customerName),
        esc(l.companyName),
        esc(l.branchName),
        l.monthlyBill ? "₹"+l.monthlyBill.toLocaleString("en-IN") : "—",
        `<span class="badge-${statusKey(l.status)}">${l.status}</span>`,
        d ? d.toLocaleDateString("en-IN") : "—"
      ];
    })
  );
}

// ── DRILL-DOWN: Company → Employees ──────────────────────────
function drillCompany(companyName) {
  var leads = allLeads.filter(l => (l.companyName||"Unknown") === companyName);
  var empMap = {};
  leads.forEach(function (l) {
    var key = (l.employeeName||"Unknown").trim() + "||" + (l.employeeCode||"").trim();
    if (!empMap[key]) empMap[key] = { name:(l.employeeName||"Unknown").trim(), code:(l.employeeCode||"").trim(),
      branch:l.branchName||"", leads:0, installed:0 };
    empMap[key].leads++;
    if (l.status==="Installed") empMap[key].installed++;
  });
  var rows  = Object.values(empMap).sort((a,b)=>b.leads-a.leads);
  var total = leads.length;

  document.getElementById("drillTitle").textContent = companyName + " — Employee Breakdown";
  document.getElementById("drillBody").innerHTML = `
    <div class="drill-summary">
      <span>Total Leads: <strong>${total}</strong></span>
      <span>Employees Active: <strong>${rows.length}</strong></span>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Employee Name</th><th>Code</th><th>Branch</th><th>Leads</th><th>Share</th><th>Installed</th><th>Conv%</th></tr></thead>
      <tbody>${rows.map(r => {
        var conv  = r.leads>0?((r.installed/r.leads)*100).toFixed(0):0;
        var share = total>0?((r.leads/total)*100).toFixed(1):0;
        return `<tr>
          <td><strong>${esc(r.name)}</strong></td>
          <td><span class="emp-code">${esc(r.code)}</span></td>
          <td>${esc(r.branch)}</td>
          <td>${r.leads}</td><td>${share}%</td><td>${r.installed}</td><td>${conv}%</td>
        </tr>`;
      }).join("") || noData(7)}</tbody>
    </table></div>`;
  document.getElementById("drillModal").classList.remove("hidden");
}
function closeDrill() { document.getElementById("drillModal").classList.add("hidden"); }

// ── CHART ─────────────────────────────────────────────────────
function renderBarChart(canvasId, labels, values, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  // Wait for layout then draw
  requestAnimationFrame(function () {
    var ctx  = canvas.getContext("2d");
    var W    = canvas.width  = canvas.offsetWidth || 300;
    var H    = canvas.height = 220;
    var pad  = { top:24, right:16, bottom:64, left:46 };
    var maxV = Math.max(...values, 1);
    var n    = labels.length;
    var slot = n > 0 ? (W - pad.left - pad.right) / n : 0;
    var bw   = slot * 0.6;
    var gap  = slot * 0.4;

    ctx.clearRect(0, 0, W, H);

    // Grid lines + Y labels
    for (var g = 0; g <= 4; g++) {
      var gy = pad.top + (H - pad.top - pad.bottom) * g / 4;
      ctx.strokeStyle = "#DDE4E4"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
      ctx.fillStyle = "#6B7C7C"; ctx.font = "11px DM Sans,sans-serif"; ctx.textAlign = "right";
      ctx.fillText(Math.round(maxV * (1 - g / 4)), pad.left - 6, gy + 4);
    }

    // Bars
    values.forEach(function (v, i) {
      var x  = pad.left + i * slot + gap / 2;
      var bh = v > 0 ? (H - pad.top - pad.bottom) * (v / maxV) : 0;
      var y  = H - pad.bottom - bh;

      if (bh > 0) {
        ctx.fillStyle = color; ctx.globalAlpha = 0.88;
        roundRect(ctx, x, y, bw, bh, 4); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#1C2B2B"; ctx.font = "bold 11px DM Sans,sans-serif"; ctx.textAlign = "center";
        ctx.fillText(v, x + bw / 2, y - 5);
      }

      // X label
      ctx.fillStyle = "#6B7C7C"; ctx.font = "11px DM Sans,sans-serif"; ctx.textAlign = "center";
      ctx.globalAlpha = 1;
      var lbl = String(labels[i] || "");
      if (lbl.length > 12) lbl = lbl.slice(0, 11) + "…";
      ctx.save();
      ctx.translate(x + bw / 2, H - pad.bottom + 12);
      if (n > 5) { ctx.rotate(-0.45); ctx.textAlign = "right"; }
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    });
  });
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 1 || h < 1) return;
  if (h < r) r = h; if (w < r*2) r = w/2;
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ── TABLE RENDERER ────────────────────────────────────────────
function renderTable(id, headers, rows) {
  var el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.length
      ? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")
      : noData(headers.length)
    }</tbody>
  </table></div>`;
}

// ── REFRESH ───────────────────────────────────────────────────
function refreshData() {
  selectedMonth = companyMonth = branchMonth = perfMonth = "all";
  allLeads = []; filteredLeads = [];
  document.getElementById("globalMonthFilter").value = "all";
  fetchData();
}

// ── HELPERS ───────────────────────────────────────────────────
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function noData(cols) {
  return `<tr><td colspan="${cols}" class="empty-cell">No data for selected period</td></tr>`;
}
function statusKey(s) {
  return {"Submitted":"submitted","Contacting Customer":"contacting","Field Visit":"field-visit",
    "Work Order Received":"work-order","Installed":"installed","Rejected":"rejected"}[s]||"submitted";
}
function setLoading(on) { document.getElementById("loadingBar").style.display = on?"block":"none"; }
function showFetchError(msg) {
  var el = document.getElementById("fetchError");
  el.textContent = msg; el.classList.remove("hidden");
}