// Haroon & Sons Quote - single-file app (vanilla JS)
// Fixes: toggles, calculate, totals, PDF light-mode printing, mobile cut-off.
//
// IMPORTANT:
// - data.json is the source of truth (pulled from your working spreadsheet).
// - Any edits you make in the Rates tab persist in localStorage.
// - Print / Save PDF opens a NEW light-mode window so it doesn't print dark backgrounds.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_KEY = "haroon_sons_quote_v1_state";
/* =========================
   ADMIN / MARKUP UNLOCK
   Option A – iPhone friendly
   ========================= */

const ADMIN_PIN = "2702"; // ← CHANGE THIS PIN if you want

let adminUnlocked = false;
let pressTimer = null;

// long-press on logo (mobile friendly)
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.getElementById("companyLogo");
  if (!logo) return;

  const startPress = () => {
    pressTimer = setTimeout(() => {
      const pin = prompt("Enter admin PIN");
      if (pin === ADMIN_PIN) {
        adminUnlocked = true;
        alert("Admin mode unlocked");
        document.body.classList.add("admin-mode");
        // optional: persist unlock for session
        sessionStorage.setItem("adminUnlocked", "1");
      } else {
        alert("Wrong PIN");
      }
    }, 1500); // 1.5s long press
  };

  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  logo.addEventListener("touchstart", startPress);
  logo.addEventListener("touchend", cancelPress);
  logo.addEventListener("mousedown", startPress);
  logo.addEventListener("mouseup", cancelPress);
});
function num(n, digits=2){
  const x = Number(n || 0);
  return x.toLocaleString(undefined, {minimumFractionDigits:digits, maximumFractionDigits:digits});
}
function safeNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n){ return Math.round((Number(n)||0)*100)/100; }

let DATA = null;

// persistent state
let state = {
  inputs: {
    areaSF: "",
    lenFT: "",
    widFT: "",
    perimLF: "",
    ceilFT: "8",
    custName: "",
    projAddr: "",
    notes: "",
  },
  toggles: {},  // itemId => boolean
  qty: {},      // itemId => number (for EACH items that need user qty)
  rates: {},    // itemId => {material_rate, labor_rate}
  settings: { markups: {materials: 0.25, labor: 0.35} },
  lastQuote: null,
};

function save(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function load(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return;
  try{ state = JSON.parse(raw); }catch(e){ /* ignore */ }
}

async function loadData(){
  const res = await fetch("data.json?v=77777", {cache:"no-store"});
  if(!res.ok) throw new Error("Cannot load data.json");
  DATA = await res.json();
}

function initStateFromData(){
  // company header
  const c = DATA.settings.company;
  $("#companyName").textContent = c.name;
  $("#companyPhone").textContent = "📞 " + c.phone;
  $("#companyPhone").href = "tel:" + c.phone.replace(/\D/g,"");
  $("#companyEmail").textContent = "✉️ " + c.email;
  $("#companyEmail").href = "mailto:" + c.email;

  // settings defaults
  state.settings = state.settings || {};
  state.settings.markups = state.settings.markups || {};
  if(state.settings.markups.materials == null) state.settings.markups.materials = DATA.settings.markups.materials;
  if(state.settings.markups.labor == null) state.settings.markups.labor = DATA.settings.markups.labor;

  // inputs default
  if(!state.inputs) state.inputs = {};
  if(state.inputs.ceilFT == null || state.inputs.ceilFT === "") state.inputs.ceilFT = String(DATA.settings.defaults.ceilingHeight || 8);

  // toggles + qty + rates defaults
  for(const it of DATA.items){
    if(state.toggles[it.id] == null) state.toggles[it.id] = !!it.default_on;
    if(it.unit === "EACH"){
      if(state.qty[it.id] == null){
        // default qty:
        let q = it.default_qty;
        // Subpanel default: 1 if checked, else 0
        if(q == null && /subpanel/i.test(it.label)) q = 1;
        state.qty[it.id] = safeNum(q);
      }
    }
    if(!state.rates[it.id]){
      state.rates[it.id] = { material_rate: it.material_rate, labor_rate: it.labor_rate };
    }
  }
}

function bindTabs(){
  $$(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      $$(".panel").forEach(p=>p.classList.remove("active"));
      $("#tab-"+tab).classList.add("active");
    });
  });
}

function bindInputs(){
  const map = [
    ["#areaSF","areaSF"],
    ["#lenFT","lenFT"],
    ["#widFT","widFT"],
    ["#perimLF","perimLF"],
    ["#ceilFT","ceilFT"],
    ["#custName","custName"],
    ["#projAddr","projAddr"],
    ["#notes","notes"],
  ];
  for(const [sel,key] of map){
    const el = $(sel);
    el.value = state.inputs[key] ?? "";
    el.addEventListener("input", ()=>{
      state.inputs[key] = el.value;
      save();
      // update metrics live
      renderMetrics();
    });
  }

  $("#btnCalc").addEventListener("click", ()=>{
    const q = calculateQuote();
    state.lastQuote = q;
    save();
    renderQuote();
    // jump to quote tab
    document.querySelector('.tab[data-tab="quote"]').click();
  });

  $("#btnPrint").addEventListener("click", ()=>{
    const q = state.lastQuote || calculateQuote();
    state.lastQuote = q;
    save();
    openPrintWindow(q);
  });
}

function bindAccordions(){
  $$(".acc-head").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.acc;
      const body = $("#acc-"+id);
      const isOpen = body.classList.contains("open");
      body.classList.toggle("open", !isOpen);
      btn.setAttribute("aria-expanded", String(!isOpen));
      btn.textContent = (isOpen ? "▶ " : "▼ ") + btn.textContent.replace(/^([▶▼]\s)/,"");
    });
  });
}

function renderAccordions(){
  // build rows by category
  const byCat = {
    "Scope": $("#acc-scope"),
    "Fixtures": $("#acc-fixtures"),
    "Doors": $("#acc-doors"),
    "Add-ons": $("#acc-addons"),
  };

  // clear
  Object.values(byCat).forEach(el=>{ if(el) el.innerHTML=""; });

  for(const it of DATA.items){
    if(!byCat[it.category]) continue;

    const row = document.createElement("div");
    row.className = "row";

    const chk = document.createElement("div");
    chk.className = "chk";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!state.toggles[it.id];
    cb.addEventListener("change", ()=>{
      state.toggles[it.id] = cb.checked;
      // convenience: Subpanel etc set qty = 1 when turned on
      if(it.unit === "EACH" && /subpanel/i.test(it.label)){
        state.qty[it.id] = cb.checked ? 1 : 0;
      }
      save();
    });
    chk.appendChild(cb);

    const mid = document.createElement("div");
    const lbl = document.createElement("div");
    lbl.className = "lbl";
    lbl.textContent = it.label;
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = it.unit + (it.notes ? " • " + it.notes : "");
    mid.appendChild(lbl);
    mid.appendChild(sub);

    const right = document.createElement("div");
    right.className = "right";

    if(it.unit === "EACH" && !/door hardware|door casing|shoe molding|job consumables|plumbing supplies/i.test(it.label)){
      // user-entered qty
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.step = "1";
      inp.value = String(state.qty[it.id] ?? 0);
      inp.addEventListener("input", ()=>{
        state.qty[it.id] = safeNum(inp.value);
        save();
      });
      right.appendChild(inp);
    } else {
      // show calculated badge
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "auto";
      right.appendChild(b);
    }

    row.appendChild(chk);
    row.appendChild(mid);
    row.appendChild(right);

    byCat[it.category].appendChild(row);
  }
}

function computeGeometry(){
  // Area: direct OR length*width
  const areaInput = safeNum(state.inputs.areaSF);
  const L = safeNum(state.inputs.lenFT);
  const W = safeNum(state.inputs.widFT);
  let area = areaInput;
  if(area <= 0 && L>0 && W>0) area = L*W;

  const ceil = Math.max(0, safeNum(state.inputs.ceilFT) || 8);

  const perimOverride = safeNum(state.inputs.perimLF);
  let perim = 0;
  if(perimOverride > 0){
    perim = perimOverride;
  } else if(L>0 && W>0){
    perim = 2*(L+W);
  } else if(area>0){
    // same formula as spreadsheet: 4*sqrt(area)
    perim = 4*Math.sqrt(area);
  }

  const wallSF = perim * ceil;
  // Spreadsheet uses WALL_SF + FLOOR_SF for PAINT_SF (walls + ceiling)
  const paintSF = wallSF + area;

  return { area, L, W, perim, ceil, wallSF, paintSF };
}

function computeDoorAndFixtureTotals(){
  // door items are specific labels
  const doorIds = DATA.items.filter(it=>it.category==="Doors").map(it=>it.id);
  const totalDoors = doorIds.reduce((sum,id)=> sum + safeNum(state.qty[id]), 0);

  // fixture items are category Fixtures (plumbing)
  const fixIds = DATA.items.filter(it=>it.category==="Fixtures").map(it=>it.id);
  const totalFixtures = fixIds.reduce((sum,id)=> sum + safeNum(state.qty[id]), 0);

  const doorCasingLF = totalDoors * 14; // spreadsheet: 14 LF per door
  const shoeMoldingLF = computeGeometry().perim; // spreadsheet ties shoe molding to perimeter/base

  return { totalDoors, totalFixtures, doorCasingLF, shoeMoldingLF };
}

function calculateQuote(){
  const g = computeGeometry();
  if(g.area <= 0){
    return { ok:false, error:"Project Area (SF) is required.", geometry:g, rows:[], totals:{materials:0,labor:0,grand:0}, meta:{} };
  }

  const muMat = safeNum(state.settings?.markups?.materials ?? DATA.settings.markups.materials);
  const muLab = safeNum(state.settings?.markups?.labor ?? DATA.settings.markups.labor);

  const { totalDoors, totalFixtures, doorCasingLF, shoeMoldingLF } = computeDoorAndFixtureTotals();

  // First pass: compute BASE costs (before markup) for all non-PCT_MAT items
  const baseRows = [];
  let rawMatSubtotal = 0;

  for(const it of DATA.items){
    if(!state.toggles[it.id]) continue;

    const rates = state.rates[it.id] || {material_rate: it.material_rate, labor_rate: it.labor_rate};

    let units = 0;
    if(it.unit === "FLOOR_SF") units = g.area;
    else if(it.unit === "WALL_SF") units = g.wallSF;
    else if(it.unit === "PAINT_SF") units = g.paintSF;
    else if(it.unit === "LF"){
      if(/door casing/i.test(it.label)) units = doorCasingLF;
      else if(/shoe molding/i.test(it.label)) units = shoeMoldingLF;
      else units = g.perim;
    }
    else if(it.unit === "EACH"){
      if(/door hardware/i.test(it.label)) units = totalDoors;
      else if(/plumbing supplies allowance/i.test(it.label)) units = totalFixtures;
      else if(/subpanel/i.test(it.label)) units = state.toggles[it.id] ? 1 : 0;
      else units = safeNum(state.qty[it.id]);
    }
    else if(it.unit === "PCT_MAT"){
      // handled later
      units = rates.material_rate;
    }

    // base costs:
    let baseMat = 0;
    let baseLab = 0;

    if(it.unit === "PCT_MAT"){
      // placeholder for second pass
    } else {
      baseMat = units * safeNum(rates.material_rate);
      baseLab = units * safeNum(rates.labor_rate);
      rawMatSubtotal += baseMat;
    }

    baseRows.push({ it, units, baseMat, baseLab });
  }

  // Second pass: now handle PCT_MAT items (percent of RAW materials subtotal)
  const rows = [];
  let totalMatSell = 0;
  let totalLabSell = 0;

  for(const r of baseRows){
    const { it, units } = r;
    const rates = state.rates[it.id] || {material_rate: it.material_rate, labor_rate: it.labor_rate};

    let baseMat = r.baseMat;
    let baseLab = r.baseLab;
    let unitsDisplay = units;

    if(it.unit === "PCT_MAT"){
      const pct = safeNum(rates.material_rate); // e.g., 0.05
      unitsDisplay = pct * 100;
      baseMat = rawMatSubtotal * pct;
      baseLab = 0;
    }

    const matSell = baseMat * (1 + muMat);
    const labSell = baseLab * (1 + muLab);
    const sell = matSell + labSell;

    totalMatSell += matSell;
    totalLabSell += labSell;

    rows.push({
      item: it.label,
      unit: it.unit,
      units: unitsDisplay,
      baseMat,
      baseLab,
      matSell,
      labSell,
      sell
    });
  }

  // sort by same order as data.json
  // (already in order)

  return {
    ok:true,
    geometry: g,
    rows,
    totals:{
      materials: round2(totalMatSell),
      labor: round2(totalLabSell),
      grand: round2(totalMatSell + totalLabSell),
      muMat, muLab
    },
    meta:{
      customer: state.inputs.custName || "",
      address: state.inputs.projAddr || "",
      notes: state.inputs.notes || "",
      date: new Date().toLocaleDateString()
    }
  };
}

function renderMetrics(){
  const g = computeGeometry();
  $("#mPerim").textContent = g.area>0 ? num(g.perim,2) : "—";
  $("#mWall").textContent  = g.area>0 ? num(g.wallSF,2) : "—";
  $("#mPaint").textContent = g.area>0 ? num(g.paintSF,2) : "—";
}

function renderRates(){
  const wrap = $("#ratesTable");
  const rows = DATA.items.map(it=>{
    const r = state.rates[it.id] || {material_rate: it.material_rate, labor_rate: it.labor_rate};
    return `
      <tr>
        <td class="item">${it.label}<div class="tiny">${it.category}</div></td>
        <td class="unit">${it.unit}</td>
        <td class="num"><input data-rate="mat" data-id="${it.id}" type="number" step="0.01" value="${r.material_rate}"></td>
        <td class="num"><input data-rate="lab" data-id="${it.id}" type="number" step="0.01" value="${r.labor_rate}"></td>
      </tr>
    `;
  }).join("");

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Unit</th>
          <th>Material Rate</th>
          <th>Labor Rate</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // bind inputs
  wrap.querySelectorAll("input[data-rate]").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      const id = inp.dataset.id;
      const kind = inp.dataset.rate;
      if(!state.rates[id]) state.rates[id] = {material_rate:0, labor_rate:0};
      state.rates[id][kind === "mat" ? "material_rate" : "labor_rate"] = safeNum(inp.value);
      save();
    });
  });

  $("#btnResetRates").addEventListener("click", ()=>{
    if(!confirm("Reset all rates back to data.json defaults?")) return;
    state.rates = {};
    for(const it of DATA.items){
      state.rates[it.id] = {material_rate: it.material_rate, labor_rate: it.labor_rate};
    }
    save();
    renderRates();
  });
}

function renderQuote(){
  const q = state.lastQuote || calculateQuote();

  if(!q.ok){
    $("#quoteMeta").innerHTML = `<div class="badge">Not calculated</div> <span class="small">${q.error}</span>`;
    $("#quoteTable").innerHTML = "";
    $("#tMaterials").textContent = money(0);
    $("#tLabor").textContent = money(0);
    $("#tGrand").textContent = money(0);
    return;
  }

  $("#quoteMeta").innerHTML = `
    <div>Area SF: <b>${num(q.geometry.area,2)}</b> • Perimeter LF: <b>${num(q.geometry.perim,2)}</b> • Wall SF: <b>${num(q.geometry.wallSF,2)}</b> • Paint SF: <b>${num(q.geometry.paintSF,2)}</b></div>
    <div>Materials MU: <b>${Math.round(q.totals.muMat*100)}%</b> • Labor MU: <b>${Math.round(q.totals.muLab*100)}%</b></div>
  `;

  const body = q.rows.map(r=>`
    <tr>
      <td class="item">${r.item}</td>
      <td class="unit">${r.unit}</td>
      <td class="num">${r.unit==="PCT_MAT" ? num(r.units,1)+"%" : num(r.units,2)}</td>
      <td class="num">${money(r.matSell)}</td>
      <td class="num">${money(r.labSell)}</td>
      <td class="num"><b>${money(r.sell)}</b></td>
    </tr>
  `).join("");

  $("#quoteTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Unit</th>
          <th>Units</th>
          <th>Material (w/markup)</th>
          <th>Labor (w/markup)</th>
          <th>Sell Price</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;

  $("#tMaterials").textContent = money(q.totals.materials);
  $("#tLabor").textContent = money(q.totals.labor);
  $("#tGrand").textContent = money(q.totals.grand);
}

function bindSettings(){
  $("#muMat").value = state.settings.markups.materials;
  $("#muLab").value = state.settings.markups.labor;

  $("#btnSaveSettings").addEventListener("click", ()=>{
    state.settings.markups.materials = safeNum($("#muMat").value);
    state.settings.markups.labor = safeNum($("#muLab").value);
    save();
    alert("Saved.");
    // refresh quote if already calculated
    if(state.lastQuote){
      state.lastQuote = calculateQuote();
      save();
      renderQuote();
    }
  });

  $("#btnResetAll").addEventListener("click", ()=>{
    if(!confirm("Reset all saved settings, toggles, quantities, and rates?")) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  });
}

function openPrintWindow(q){
  if(!q.ok){
    alert(q.error || "Quote not ready.");
    return;
  }
  const c = DATA.settings.company;

  const rows = q.rows.map(r=>`
    <tr>
      <td>${escapeHtml(r.item)}</td>
      <td style="text-align:right">${escapeHtml(r.unit)}</td>
      <td style="text-align:right">${r.unit==="PCT_MAT" ? num(r.units,1)+"%" : num(r.units,2)}</td>
      <td style="text-align:right">${money(r.matSell)}</td>
      <td style="text-align:right">${money(r.labSell)}</td>
      <td style="text-align:right;font-weight:800">${money(r.sell)}</td>
    </tr>
  `).join("");

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quote - ${escapeHtml(c.name)}</title>
  <style>
    body{font-family: Arial, sans-serif; margin:28px; color:#111}
    .top{display:flex; justify-content:space-between; gap:18px; align-items:flex-start}
    .brand{display:flex; gap:14px; align-items:center}
    .brand img{width:64px;height:64px;object-fit:contain;border:1px solid #ddd;border-radius:12px}
    h1{margin:0; font-size:22px}
    .muted{color:#555; margin-top:6px}
    .box{margin-top:14px; padding:12px; border:1px solid #ddd; border-radius:10px}
    table{width:100%; border-collapse:collapse; margin-top:12px}
    th,td{border-bottom:1px solid #eee; padding:10px 8px; font-size:12px}
    th{background:#f6f6f6; text-transform:uppercase; letter-spacing:.4px; font-size:11px}
    .totals{margin-top:14px; display:flex; gap:10px; justify-content:flex-end}
    .tcard{border:1px solid #ddd; border-radius:10px; padding:10px 14px; min-width:180px}
    .tcard .k{color:#555; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.3px}
    .tcard .v{font-size:18px; font-weight:900; margin-top:6px}
    .grand{border:2px solid #111}
    @media print{
      body{margin:10mm}
    }
  </style>
</head>
<body>
  <div class="top">
    <div class="brand">
      <img src="logo.png" alt="logo" />
      <div>
        <h1>${escapeHtml(c.name)}</h1>
        <div class="muted">Phone: ${escapeHtml(c.phone)} • Email: ${escapeHtml(c.email)}</div>
        <div class="muted">Date: ${escapeHtml(q.meta.date)}</div>
      </div>
    </div>
    <div class="box" style="min-width:260px">
      <div><b>Customer:</b> ${escapeHtml(q.meta.customer || "-")}</div>
      <div style="margin-top:6px"><b>Address:</b> ${escapeHtml(q.meta.address || "-")}</div>
    </div>
  </div>

  ${q.meta.notes ? `<div class="box"><b>Notes:</b><div style="margin-top:6px; white-space:pre-wrap">${escapeHtml(q.meta.notes)}</div></div>` : ""}

  <div class="box">
    <div><b>Summary:</b> Area SF ${num(q.geometry.area,2)} • Perimeter LF ${num(q.geometry.perim,2)} • Wall SF ${num(q.geometry.wallSF,2)} • Paint SF ${num(q.geometry.paintSF,2)}</div>
    <div class="muted">Materials MU ${Math.round(q.totals.muMat*100)}% • Labor MU ${Math.round(q.totals.muLab*100)}%</div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:right">Unit</th>
          <th style="text-align:right">Units</th>
          <th style="text-align:right">Material (w/markup)</th>
          <th style="text-align:right">Labor (w/markup)</th>
          <th style="text-align:right">Sell Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="tcard"><div class="k">Total Materials</div><div class="v">${money(q.totals.materials)}</div></div>
      <div class="tcard"><div class="k">Total Labor</div><div class="v">${money(q.totals.labor)}</div></div>
      <div class="tcard grand"><div class="k">Total</div><div class="v">${money(q.totals.grand)}</div></div>
    </div>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll("\"","&quot;")
    .replaceAll("'","&#039;");
}

// Address autocomplete (lightweight):
// Uses OpenStreetMap Nominatim. For heavy use, switch to Google Places (paid) later.
let addrTimer = null;
function bindAddressAutocomplete(){
  const input = $("#projAddr");
  const list = $("#addrList");

  input.addEventListener("input", ()=>{
    const q = input.value.trim();
    if(q.length < 5) return;
    clearTimeout(addrTimer);
    addrTimer = setTimeout(async ()=>{
      try{
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, {headers: {"Accept-Language":"en"}});
        if(!res.ok) return;
        const data = await res.json();
        list.innerHTML = data.map(x=>`<option value="${escapeHtml(x.display_name)}"></option>`).join("");
      }catch(e){
        // ignore
      }
    }, 250);
  });
}

function main(){
  load();
  loadData()
    .then(()=>{
      if(!state.toggles) state.toggles = {};
      if(!state.qty) state.qty = {};
      if(!state.rates) state.rates = {};
      if(!state.settings) state.settings = {markups:{materials:0.25,labor:0.35}};

      initStateFromData();
      save();

      bindTabs();
      bindInputs();
      bindAccordions();
      bindSettings();
      bindAddressAutocomplete();

      renderAccordions();
      renderRates();
      renderMetrics();
      renderQuote();
    })
    .catch(err=>{
      alert("Error loading app files. Make sure index.html, app.js, styles.css, data.json are all in the same folder on GitHub Pages.");
      console.error(err);
    });
}

main();
