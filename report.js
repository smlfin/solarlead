// ============================================================
// SOLAR LEAD REPORTS — report.js (v4)
// ============================================================

const CSV_URL         = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTY-Kkkau9RrlH2yOF19QavsdqMhxRm7Fso8dkLHrDPg8rOBIPZx18WpqIRRE7asgC7ssx3P3SxUV2E/pub?gid=0&single=true&output=csv";
const REPORT_PASSWORD = "solar";

const COL = {
  ref:"Ref Number", timestamp:"Timestamp", empName:"Employee Name",
  empCode:"Employee Code", desig:"Designation", empMobile:"Employee Mobile Number",
  company:"Company Name", branch:"Branch Name", custName:"Customer Name",
  custMobile:"Customer Mobile Number", custAddr:"Customer Address",
  ksebCons:"KSEB Consumer Number", bill:"Monthly KSEB Bill",
  billFile:"Upload KSEB BILL", status:"Lead Status",
  bankName:"Bank Name", bankBranch:"Bank Branch", account:"Account Number", ifsc:"IFSC Code"
};

// ── STATE ─────────────────────────────────────────────────────
let allLeads      = [];
let filteredLeads = [];   // driven by global month filter
let selectedMonth = "all";
let companyMonth  = "all";
let branchMonth   = "all";
let perfMonth     = "all";
let selectedCompanyForBranch = "all";  // company selector for branch panel

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

// ── FETCH & PARSE ─────────────────────────────────────────────
async function fetchData() {
  setLoading(true);
  document.getElementById("fetchError").classList.add("hidden");
  try {
    var res  = await fetch(CSV_URL);
    var text = await res.text();
    allLeads = parseCSV(text);
    if (!allLeads.length) { showFetchError("No data found in sheet."); return; }
    buildGlobalMonthFilter();
    applyGlobalFilter();
    renderAll();
  } catch (e) {
    showFetchError("Failed to load: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ── CSV PARSER ────────────────────────────────────────────────
function parseCSV(text) {
  var lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  var headers = splitCSVRow(lines[0]).map(h => h.trim().replace(/\r/g,""));
  var idx = {};
  Object.keys(COL).forEach(k => { idx[k] = headers.indexOf(COL[k]); });

  var leads = [];
  for (var r = 1; r < lines.length; r++) {
    var row = splitCSVRow(lines[r]);
    if (!row || row.length < 2) continue;
    function get(k) {
      var i = idx[k];
      return i >= 0 && i < row.length ? row[i].trim().replace(/\r/g,"") : "";
    }
    var ref = get("ref");
    if (!ref) continue;

    // Employee key = code (primary) — falls back to name if no code
    // This prevents name-spelling duplicates
    var empCode = get("empCode").trim();
    var empName = get("empName").trim();
    var empKey  = empCode || empName; // used for deduplication

// Inside your parseCSV function, update the leads.push section:
leads.push({
  refNumber:    ref,
  timestamp:    parseTimestamp(get("timestamp")),
  employeeName: empName,
  employeeCode: empCode,
  empKey:       empKey,
  companyName:  get("company").trim(), // Ensure this is trimmed
  branchName:   get("branch").trim(),  // Ensure this is trimmed
  customerName: get("custName"),
  monthlyBill:  parseFloat(get("bill")) || 0,
  status:       get("status") || "Submitted"
});
  }
  return leads;
}

function splitCSVRow(line) {
  var result = [], cur = "", inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { result.push(cur); cur = ""; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

// Always DD/MM/YYYY — never trust native Date parse for this format
function parseTimestamp(s) {
  if (!s) return null;
  s = s.trim().replace(/\r/g,"");
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    var d = new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
    if (!isNaN(d)) return d;
  }
  var d2 = new Date(s);
  return isNaN(d2) ? null : d2;
}

// ── DATE HELPERS ──────────────────────────────────────────────
function monthKey(d)      { if (!d||isNaN(d)) return null; return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
function monthLabel(k)    { if (!k) return "?"; var [y,m]=k.split("-"); return new Date(y,m-1).toLocaleString("en-IN",{month:"short",year:"numeric"}); }
function monthLabelShort(k){ if (!k) return "?"; var [y,m]=k.split("-"); return new Date(y,m-1).toLocaleString("en-IN",{month:"short",year:"2-digit"}); }

function allMonthKeys() {
  var set={};
  allLeads.forEach(l=>{ var k=monthKey(l.timestamp); if(k) set[k]=1; });
  return Object.keys(set).sort();
}

// ── GLOBAL MONTH FILTER ───────────────────────────────────────
function buildGlobalMonthFilter() {
  var keys = allMonthKeys().reverse();
  var sel  = document.getElementById("globalMonthFilter");
  sel.innerHTML = '<option value="all">All Months</option>' +
    keys.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join("");
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

// Leads for a specific month key (used by per-panel filters)
function leadsFor(mk, srcLeads) {
  srcLeads = srcLeads || allLeads;
  return mk === "all" ? srcLeads.slice() : srcLeads.filter(l => monthKey(l.timestamp) === mk);
}

// Panel-level month <select> HTML
function panelMonthSel(id, val, fn) {
  var keys = allMonthKeys().reverse();
  return `<select id="${id}" class="panel-month-sel" onchange="${fn}">
    <option value="all">All Months</option>
    ${keys.map(k=>`<option value="${k}"${val===k?" selected":""}>${monthLabelShort(k)}</option>`).join("")}
  </select>`;
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  document.getElementById("fetchError").classList.add("hidden");
  renderKPIs();
  renderMonthWise();
  renderPipelineStatus();
  renderCompanyWise();
  renderBranchWise();
  renderTopPerformers();
  renderBillRanges();
}

// ── 1. KPI SNAPSHOT ───────────────────────────────────────────
function renderKPIs() {
  var L         = filteredLeads;
  var total     = L.length;
  var installed = L.filter(l=>l.status==="Installed").length;
  var rejected  = L.filter(l=>l.status==="Rejected").length;
  var inProg    = total - installed - rejected;
  var conv      = total>0?((installed/total)*100).toFixed(1):"0.0";
  var eligible  = L.filter(l=>l.monthlyBill>=3000).length;

  document.getElementById("kpiGrid").innerHTML = [
    {icon:"📋",label:"Total Leads",       val:total,     color:"sky" },
    {icon:"✅",label:"Installed",          val:installed, color:"leaf"},
    {icon:"🔄",label:"In Progress",        val:inProg,    color:"sun" },
    {icon:"📈",label:"Conversion %",       val:conv+"%",  color:"leaf"},
    {icon:"🏦",label:"Incentive Eligible", val:eligible,  color:"sky" },
    {icon:"❌",label:"Rejected",           val:rejected,  color:"red" },
  ].map(k=>`<div class="kpi kpi-${k.color}">
    <div class="kpi-icon">${k.icon}</div>
    <div class="kpi-val">${k.val}</div>
    <div class="kpi-label">${k.label}</div>
  </div>`).join("");
}

// ── 2. MONTH-WISE OVERVIEW (bar chart — always all data) ──────
function renderMonthWise() {
  var map={};
  allLeads.forEach(l=>{ var k=monthKey(l.timestamp); if(k) map[k]=(map[k]||0)+1; });
  var keys   = Object.keys(map).sort();
  var labels = keys.map(monthLabelShort);
  var vals   = keys.map(k=>map[k]);
  renderBarChart("chartMonthWise", labels, vals, "#0B3954");
  renderTable("tableMonthWise",
    ["Month","Total Leads"],
    keys.map((k,i)=>[monthLabel(k), vals[i]])
  );
}

// ── 3. PIPELINE STATUS (horizontal bars) ─────────────────────
function renderPipelineStatus() {
  var L        = filteredLeads;
  var total    = L.length;
  var statuses = ["Submitted","Contacting Customer","Field Visit","Work Order Received","Installed","Rejected"];
  var colors   = ["#1A5276","#7D6608","#76448A","#1F618D","#1E8449","#922B21"];
  document.getElementById("statusBreakdown").innerHTML = statuses.map(function(s,i){
    var cnt = L.filter(l=>l.status===s).length;
    var pct = total>0?(cnt/total*100):0;
    return `<div class="status-row">
      <div class="status-label">${s}</div>
      <div class="status-bar-wrap"><div class="status-bar-fill" style="width:${pct}%;background:${colors[i]}"></div></div>
      <div class="status-nums"><span class="status-count">${cnt}</span><span class="status-pct">${pct.toFixed(1)}%</span></div>
    </div>`;
  }).join("");
}

// ── 4. COMPANY-WISE (table only, monthly filter, month matrix) ─
function renderCompanyWise() {
  var L     = leadsFor(companyMonth);
  var total = L.length;
  var mkeys = allMonthKeys();

  // Per-company summary (filtered)
  var map={};
  L.forEach(l=>{ var c=l.companyName||"Unknown"; map[c]=(map[c]||0)+1; });
  var entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);

  // Month × Company matrix (always all data for full picture)
  var companies = [...new Set(allLeads.map(l=>l.companyName||"Unknown"))].sort();
  var matrixRows = companies.map(function(co){
    var cells    = mkeys.map(mk=>allLeads.filter(l=>(l.companyName||"Unknown")===co&&monthKey(l.timestamp)===mk).length);
    var rowTotal = cells.reduce((a,b)=>a+b,0);
    return {co,cells,rowTotal};
  }).filter(r=>r.rowTotal>0).sort((a,b)=>b.rowTotal-a.rowTotal);

  document.getElementById("companyWisePanel").innerHTML = `
    <div class="panel-header">
      <div class="rcard-title"><span class="rcard-icon">🏢</span> Company-wise Leads</div>
      <div class="panel-controls">${panelMonthSel("companyMonthSel",companyMonth,"onCompanyMonthChange()")}</div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Company</th><th>Leads</th><th>Share</th><th>Action</th></tr></thead>
      <tbody>${entries.map(([name,cnt])=>`<tr>
        <td><strong>${esc(name)}</strong></td>
        <td>${cnt}</td>
        <td>${total>0?((cnt/total)*100).toFixed(1):0}%</td>
        <td><span class="drill-link" data-company="${esc(name)}" onclick="drillCompany(this.dataset.company)">👥 Employees</span></td>
      </tr>`).join("")||noData(4)}</tbody>
    </table></div>
    <div class="section-sub-title">Month-wise Breakdown — All Time</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Company</th>${mkeys.map(k=>`<th>${monthLabelShort(k)}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${matrixRows.map(r=>`<tr>
        <td><strong>${esc(r.co)}</strong></td>
        ${r.cells.map(c=>`<td>${c||"—"}</td>`).join("")}
        <td><strong>${r.rowTotal}</strong></td>
      </tr>`).join("")||noData(mkeys.length+2)}</tbody>
    </table></div>`;
}
function onCompanyMonthChange(){
  companyMonth=document.getElementById("companyMonthSel").value;
  renderCompanyWise();
}

// ── 5. BRANCH-WISE (company selector → filtered branches) ─────
function renderBranchWise() {
  var mkeys     = allMonthKeys();
  var companies = ["all",...[...new Set(allLeads.map(l=>l.companyName||"Unknown"))].sort()];

  // Source leads: filter by selected company first, then by month
  var srcLeads = selectedCompanyForBranch==="all"
    ? allLeads
    : allLeads.filter(l=>(l.companyName||"Unknown")===selectedCompanyForBranch);
  var L = leadsFor(branchMonth, srcLeads);

  // Branch summary
  var map={};
  L.forEach(function(l){
    var b=(l.branchName||"Unknown").trim();
    if(!map[b]) map[b]={leads:0,installed:0,inProg:0,rejected:0};
    map[b].leads++;
    if(l.status==="Installed")       map[b].installed++;
    else if(l.status==="Rejected")   map[b].rejected++;
    else                              map[b].inProg++;
  });
  var entries=Object.entries(map).sort((a,b)=>b[1].leads-a[1].leads);

  // Month × Branch matrix (scoped to selected company, all months)
  var branches=[...new Set(srcLeads.map(l=>(l.branchName||"Unknown").trim()))].sort();
  var matrixRows = branches.map(function(br){
    var cells    = mkeys.map(mk=>srcLeads.filter(l=>(l.branchName||"Unknown").trim()===br&&monthKey(l.timestamp)===mk).length);
    var rowTotal = cells.reduce((a,b)=>a+b,0);
    return {br,cells,rowTotal};
  }).filter(r=>r.rowTotal>0).sort((a,b)=>b.rowTotal-a.rowTotal);

  // Company select options
  var coOpts = companies.map(c=>`<option value="${esc(c)}"${selectedCompanyForBranch===c?" selected":""}>${c==="all"?"All Companies":esc(c)}</option>`).join("");

  document.getElementById("branchWisePanel").innerHTML = `
    <div class="panel-header">
      <div class="rcard-title"><span class="rcard-icon">📍</span> Branch-wise Performance</div>
      <div class="panel-controls">
        <select id="branchCompanySel" class="panel-month-sel" onchange="onBranchCompanyChange()">${coOpts}</select>
        ${panelMonthSel("branchMonthSel",branchMonth,"onBranchMonthChange()")}
      </div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Branch</th><th>Total</th><th>Installed</th><th>In Progress</th><th>Rejected</th><th>Conv%</th></tr></thead>
      <tbody>${entries.map(([name,d])=>`<tr>
        <td><strong>${esc(name)}</strong></td>
        <td>${d.leads}</td><td>${d.installed}</td><td>${d.inProg}</td><td>${d.rejected}</td>
        <td>${d.leads>0?((d.installed/d.leads)*100).toFixed(0):0}%</td>
      </tr>`).join("")||noData(6)}</tbody>
    </table></div>
    <div class="section-sub-title">Month-wise Breakdown — All Time${selectedCompanyForBranch!=="all"?" ("+esc(selectedCompanyForBranch)+")":""}</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Branch</th>${mkeys.map(k=>`<th>${monthLabelShort(k)}</th>`).join("")}<th>Total</th></tr></thead>
      <tbody>${matrixRows.map(r=>`<tr>
        <td><strong>${esc(r.br)}</strong></td>
        ${r.cells.map(c=>`<td>${c||"—"}</td>`).join("")}
        <td><strong>${r.rowTotal}</strong></td>
      </tr>`).join("")||noData(mkeys.length+2)}</tbody>
    </table></div>`;
}
function onBranchCompanyChange(){
  selectedCompanyForBranch=document.getElementById("branchCompanySel").value;
  renderBranchWise();
}
function onBranchMonthChange(){
  branchMonth=document.getElementById("branchMonthSel").value;
  renderBranchWise();
}

// ── 6. TOP PERFORMERS (keyed by empCode, deduped) ─────────────
function renderTopPerformers() {
  var L = leadsFor(perfMonth);

  // Key is empCode (if exists) else empName — prevents name-spelling duplicates
  var map={};
  L.forEach(function(l){
    var key = l.empKey;  // set at parse time: code || name
    if(!map[key]) map[key]={
      name: l.employeeName, code: l.employeeCode,
      leads:0, installed:0, company:l.companyName||"", branch:l.branchName||""
    };
    // Always keep the most complete name seen for this code
    if(l.employeeName && map[key].name.length < l.employeeName.length) map[key].name = l.employeeName;
    map[key].leads++;
    if(l.status==="Installed") map[key].installed++;
  });

  var top = Object.values(map).sort((a,b)=>b.leads-a.leads).slice(0,10);
  var medals=["🥇","🥈","🥉"];

  var cardsHtml = top.length ? top.map(function(d,i){
    var conv=d.leads>0?((d.installed/d.leads)*100).toFixed(0):0;
    return `<div class="performer-row">
      <div class="performer-rank">${medals[i]||`<span class="rank">#${i+1}</span>`}</div>
      <div class="performer-info">
        <div class="performer-name">${esc(d.name)}</div>
        <div class="performer-meta">
          ${d.code?`<span class="emp-code">${esc(d.code)}</span> ·`:""}
          ${esc(d.company)} · ${esc(d.branch)}
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
      <div class="panel-controls">${panelMonthSel("perfMonthSel",perfMonth,"onPerfMonthChange()")}</div>
    </div>
    ${cardsHtml}`;
}
function onPerfMonthChange(){ perfMonth=document.getElementById("perfMonthSel").value; renderTopPerformers(); }

// ── 7. KSEB BILL DISTRIBUTION ─────────────────────────────────
function renderBillRanges() {
  var L=filteredLeads;
  var ranges=[
    {label:"< ₹1k",  min:0,    max:1000    },
    {label:"₹1k–3k", min:1000, max:3000    },
    {label:"₹3k–5k", min:3000, max:5000    },
    {label:"₹5k–10k",min:5000, max:10000   },
    {label:"> ₹10k", min:10000,max:Infinity},
  ];
  var counts=ranges.map(r=>L.filter(l=>l.monthlyBill>=r.min&&l.monthlyBill<r.max).length);
  renderBarChart("chartBillRange", ranges.map(r=>r.label), counts, "#E8890A");
}

// ── DRILL-DOWN: Company → Employee list (month-scoped) ─────────
function drillCompany(companyName) {
  // Use current companyMonth filter — same scope as the table row
  var src = leadsFor(companyMonth).filter(l=>(l.companyName||"Unknown")===companyName);

  // Group strictly by empKey (code-first) to deduplicate name spelling variants
  var map={};
  src.forEach(function(l){
    var key=l.empKey;
    if(!map[key]) map[key]={name:l.employeeName,code:l.employeeCode,branch:l.branchName||"",leads:0,installed:0};
    if(l.employeeName&&map[key].name.length<l.employeeName.length) map[key].name=l.employeeName;
    map[key].leads++;
    if(l.status==="Installed") map[key].installed++;
  });

  var rows  = Object.values(map).sort((a,b)=>b.leads-a.leads);
  var total = src.length;
  var periodLabel = companyMonth!=="all" ? " · "+monthLabel(companyMonth) : "";

  // Populate existing modal elements from report.html
  document.getElementById("drillTitle").textContent = companyName + " — Employees" + periodLabel;
  document.getElementById("drillBody").innerHTML = `
    <div class="drill-summary">
      <span>Total Leads: <strong>${total}</strong></span>
      <span>Employees Active: <strong>${rows.length}</strong></span>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th>Employee</th><th>Code</th><th>Branch</th>
        <th>Leads</th><th>Share</th><th>Installed</th><th>Conv%</th>
      </tr></thead>
      <tbody>${rows.map(function(r){
        var conv  = r.leads>0?((r.installed/r.leads)*100).toFixed(0):0;
        var share = total>0?((r.leads/total)*100).toFixed(1):0;
        return `<tr>
          <td><strong>${esc(r.name)}</strong></td>
          <td><span class="emp-code">${esc(r.code)}</span></td>
          <td>${esc(r.branch)}</td>
          <td>${r.leads}</td>
          <td>${share}%</td>
          <td>${r.installed}</td>
          <td>${conv}%</td>
        </tr>`;
      }).join("")||noData(7)}</tbody>
    </table></div>`;

  document.getElementById("drillModal").classList.remove("hidden");
}

function closeDrill() {
  document.getElementById("drillModal").classList.add("hidden");
}

// ── BAR CHART ─────────────────────────────────────────────────
function renderBarChart(canvasId, labels, values, color) {
  var canvas=document.getElementById(canvasId);
  if(!canvas) return;
  requestAnimationFrame(function(){
    var ctx =canvas.getContext("2d");
    var W   =canvas.width =canvas.offsetWidth||300;
    var H   =canvas.height=220;
    var pad ={top:24,right:16,bottom:64,left:46};
    var maxV=Math.max(...values,1);
    var n   =labels.length;
    var slot=n>0?(W-pad.left-pad.right)/n:0;
    var bw  =slot*0.6, gap=slot*0.4;

    ctx.clearRect(0,0,W,H);
    for(var g=0;g<=4;g++){
      var gy=pad.top+(H-pad.top-pad.bottom)*g/4;
      ctx.strokeStyle="#DDE4E4";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.left,gy);ctx.lineTo(W-pad.right,gy);ctx.stroke();
      ctx.fillStyle="#6B7C7C";ctx.font="11px DM Sans,sans-serif";ctx.textAlign="right";
      ctx.fillText(Math.round(maxV*(1-g/4)),pad.left-6,gy+4);
    }
    values.forEach(function(v,i){
      var x =pad.left+i*slot+gap/2;
      var bh=v>0?(H-pad.top-pad.bottom)*(v/maxV):0;
      var y =H-pad.bottom-bh;
      if(bh>0){
        ctx.fillStyle=color;ctx.globalAlpha=0.88;
        rRect(ctx,x,y,bw,bh,4);ctx.fill();ctx.globalAlpha=1;
        ctx.fillStyle="#1C2B2B";ctx.font="bold 11px DM Sans,sans-serif";ctx.textAlign="center";
        ctx.fillText(v,x+bw/2,y-5);
      }
      ctx.fillStyle="#6B7C7C";ctx.font="11px DM Sans,sans-serif";ctx.textAlign="center";ctx.globalAlpha=1;
      var lbl=String(labels[i]||"");if(lbl.length>12) lbl=lbl.slice(0,11)+"…";
      ctx.save();ctx.translate(x+bw/2,H-pad.bottom+12);
      if(n>5){ctx.rotate(-0.45);ctx.textAlign="right";}
      ctx.fillText(lbl,0,0);ctx.restore();
    });
  });
}
function rRect(ctx,x,y,w,h,r){
  if(w<1||h<1)return;if(h<r)r=h;if(w<r*2)r=w/2;
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h);
  ctx.lineTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

// ── TABLE RENDERER ────────────────────────────────────────────
function renderTable(id, headers, rows) {
  var el=document.getElementById(id);
  if(!el) return;
  el.innerHTML=`<div class="tbl-wrap"><table>
    <thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join(""):noData(headers.length)}</tbody>
  </table></div>`;
}

// ── REFRESH ───────────────────────────────────────────────────
function refreshData(){
  selectedMonth=companyMonth=branchMonth=perfMonth="all";
  selectedCompanyForBranch="all";
  allLeads=[];filteredLeads=[];
  document.getElementById("globalMonthFilter").value="all";
  fetchData();
}

// ── HELPERS ───────────────────────────────────────────────────
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function noData(cols){ return `<tr><td colspan="${cols}" class="empty-cell">No data for selected period</td></tr>`; }
function statusKey(s){ return {"Submitted":"submitted","Contacting Customer":"contacting","Field Visit":"field-visit","Work Order Received":"work-order","Installed":"installed","Rejected":"rejected"}[s]||"submitted"; }
function setLoading(on){ document.getElementById("loadingBar").style.display=on?"block":"none"; }
function showFetchError(msg){ var el=document.getElementById("fetchError");el.textContent=msg;el.classList.remove("hidden"); }
