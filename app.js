let DATA = null;

const $ = (id) => document.getElementById(id);

const state = {
  inputs: {
    areaSF: "",
    lenFT: "",
    widFT: "",
    perimOverride: "",
    heightFT: "",
    customer: "",
    address: "",
    notes: ""
  },
  settings: {
    serviceType: "Contractor",
    muMatPct: 25,
    muLabPct: 35
  },
  selections: {
    // itemId -> { on:boolean, qty:number }
  },
  lastQuote: null
};

function toNum(v){
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function money(n){
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style:"currency", currency:"USD" });
}

function fmt(n){
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits:2, minimumFractionDigits:2 });
}

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function calcGeometry(){
  const L = toNum(state.inputs.lenFT);
  const W = toNum(state.inputs.widFT);

  const H = Number.isFinite(toNum(state.inputs.heightFT))
    ? toNum(state.inputs.heightFT)
    : Number(DATA.defaults.ceilingHeightFt || 8);

  let area = toNum(state.inputs.areaSF);
  if (!Number.isFinite(area) && Number.isFinite(L) && Number.isFinite(W)) {
    area = L * W;
  }

  let perim = toNum(state.inputs.perimOverride);
  if (!Number.isFinite(perim) && Number.isFinite(L) && Number.isFinite(W)) {
    perim = 2 * (L + W);
  }

  const wallSF  = (Number.isFinite(perim) && Number.isFinite(H)) ? perim * H : NaN;
  const paintSF = (Number.isFinite(area) && Number.isFinite(wallSF)) ? (area + wallSF) : NaN;

  return { area, perim, wallSF, paintSF, H };
}

function unitsFor(unit, geo, qty){
  switch(unit){
    case "AREA_SF": return geo.area;
    case "WALL_SF": return geo.wallSF;
    case "PAINT_SF": return geo.paintSF;
    case "PERIM_LF": return geo.perim;
    case "EACH": return qty;
    default: return NaN;
  }
}

function buildRowHTML(groupId, item){
  const sel = state.selections[item.id] || { on: !!item.defaultOn, qty: 0 };
  const hasQty = item.unit === "EACH";
  const qtyVal = hasQty ? (sel.qty ?? 0) : "";

  return `
    <div class="row" data-group="${groupId}" data-item="${item.id}">
      <input class="check" type="checkbox" ${sel.on ? "checked":""} />
      <div>
        <div class="rowTitle">${esc(item.label)}</div>
        <div class="rowSub">${esc(item.unit)} • mat ${item.matRate ?? ""} • lab ${item.labRate ?? ""}${item.unit==="PCT_MAT" ? ` • ${item.pct}%` : ""}</div>
      </div>
      <div class="qtyWrap">
        ${hasQty ? `<input class="qty" type="number" inputmode="decimal" value="${qtyVal}" />` : `<span class="rowSub">Auto</span>`}
      </div>
    </div>
  `;
}

function renderLists(){
  const scope = DATA.groups.find(g=>g.id==="scope");
  const fixtures = DATA.groups.find(g=>g.id==="fixtures");
  const doors = DATA.groups.find(g=>g.id==="doors");
  const addons = DATA.groups.find(g=>g.id==="addons");

  // initialize selections (only once)
  for (const g of DATA.groups) {
    for (const it of g.items) {
      if (!state.selections[it.id]) {
        state.selections[it.id] = { on: !!it.defaultOn, qty: 0 };
      }
    }
  }

  $("listScope").innerHTML = scope.items.map(it=>buildRowHTML("scope", it)).join("");
  $("listFixtures").innerHTML = fixtures.items.map(it=>buildRowHTML("fixtures", it)).join("");
  $("listDoors").innerHTML = doors.items.map(it=>buildRowHTML("doors", it)).join("");
  $("listAddons").innerHTML = addons.items.map(it=>buildRowHTML("addons", it)).join("");

  // Fixtures/doors default "on" but qty decides inclusion (we keep checkbox ON + disabled by code)
  for (const gId of ["fixtures","doors"]) {
    document.querySelectorAll(`.row[data-group="${gId}"] .check`).forEach(chk=>{
      chk.checked = true;
      chk.disabled = true;
      const row = chk.closest(".row");
      const id = row.dataset.item;
      state.selections[id].on = true;
    });
  }
}

function bindUI(){
  // tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const t = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      document.getElementById(`tab-${t}`).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // inputs
  const map = [
    ["inAreaSF","areaSF"],
    ["inLenFT","lenFT"],
    ["inWidFT","widFT"],
    ["inPerimOverride","perimOverride"],
    ["inHeightFT","heightFT"],
    ["inCustomer","customer"],
    ["inAddress","address"],
    ["inNotes","notes"]
  ];
  for (const [id,key] of map){
    const el = $(id);
    el.addEventListener("input", ()=>{
      state.inputs[key] = el.value;
      liveGeometry();
    });
  }

  // settings
  $("setServiceType").addEventListener("change", ()=>{
    state.settings.serviceType = $("setServiceType").value;
    updateSfRate();
  });

  $("setMuMat").addEventListener("input", ()=>{
    const v = toNum($("setMuMat").value);
    if (Number.isFinite(v)) state.settings.muMatPct = v;
  });

  $("setMuLab").addEventListener("input", ()=>{
    const v = toNum($("setMuLab").value);
    if (Number.isFinite(v)) state.settings.muLabPct = v;
  });

  // lists (delegation)
  document.addEventListener("change", (e)=>{
    const row = e.target.closest?.(".row");
    if (!row) return;
    const id = row.dataset.item;
    if (e.target.classList.contains("check")) {
      state.selections[id].on = e.target.checked;
    }
  });

  document.addEventListener("input", (e)=>{
    if (!e.target.classList.contains("qty")) return;
    const row = e.target.closest(".row");
    const id = row.dataset.item;
    const v = toNum(e.target.value);
    state.selections[id].qty = Number.isFinite(v) ? v : 0;
  });

  // buttons
  $("btnCalc").addEventListener("click", ()=>{
    const q = computeQuote();
    if (!q) return;
    state.lastQuote = q;
    renderQuote(q);
    // switch tab
    document.querySelector('.tab[data-tab="quote"]').click();
  });

  $("btnPrint").addEventListener("click", ()=>{
    const q = state.lastQuote || computeQuote();
    if (!q) return;
    state.lastQuote = q;
    renderPrint(q);
    window.print();
  });

  $("btnReset").addEventListener("click", ()=>{
    applyDefaults();
    renderLists();
    liveGeometry();
    clearQuoteUI();
  });
}

function liveGeometry(){
  const g = calcGeometry();

  $("outPerim").textContent = Number.isFinite(g.perim) ? fmt(g.perim) : "—";
  $("outWallSF").textContent = Number.isFinite(g.wallSF) ? fmt(g.wallSF) : "—";
  $("outPaintSF").textContent = Number.isFinite(g.paintSF) ? fmt(g.paintSF) : "—";

  $("hintGeo").textContent =
    (Number.isFinite(g.area) && g.area > 0)
      ? "Ready. Tap Calculate Quote."
      : "Enter Area (SF) OR Length & Width to calculate.";
}

function computeQuote(){
  const geo = calcGeometry();
  if (!Number.isFinite(geo.area) || geo.area <= 0) {
    alert("Enter Project Area (SF) OR Length & Width first.");
    return null;
  }

  const muMat = (Number(state.settings.muMatPct) || 0) / 100;
  const muLab = (Number(state.settings.muLabPct) || 0) / 100;

  const rows = [];
  let rawMatTotal = 0;

  // Flatten all items with group id
  const all = [];
  for (const g of DATA.groups) {
    for (const it of g.items) all.push({ groupId: g.id, ...it });
  }

  // First pass (normal lines)
  let pctMatItem = null;

  for (const it of all) {
    const sel = state.selections[it.id] || { on:false, qty:0 };
    if (!sel.on) continue;

    if (it.unit === "PCT_MAT") {
      pctMatItem = it;
      continue;
    }

    const qty = (it.unit === "EACH") ? (Number(sel.qty) || 0) : 1;
    if (it.unit === "EACH" && qty <= 0) continue;

    const units = unitsFor(it.unit, geo, qty);
    if (!Number.isFinite(units) || units <= 0) continue;

    const rawMat = (Number(it.matRate) || 0) * units;
    const rawLab = (Number(it.labRate) || 0) * units;

    rawMatTotal += rawMat;

    const matSell = rawMat * (1 + muMat);
    const labSell = rawLab * (1 + muLab);

    rows.push({
      label: it.label,
      unit: it.unit,
      units,
      mat: matSell,
      lab: labSell,
      sell: matSell + labSell
    });
  }

  // Percent-of-material line (based on RAW materials)
  if (pctMatItem && Number(pctMatItem.pct || 0) > 0) {
    const pct = Number(pctMatItem.pct) / 100;
    const rawMat = rawMatTotal * pct;
    const matSell = rawMat * (1 + muMat);

    rows.push({
      label: pctMatItem.label,
      unit: "PCT_MAT",
      units: Number(pctMatItem.pct),
      mat: matSell,
      lab: 0,
      sell: matSell
    });
  }

  const totMat = rows.reduce((s,r)=>s+(r.mat||0),0);
  const totLab = rows.reduce((s,r)=>s+(r.lab||0),0);
  const totSell = totMat + totLab;

  // quick SF (info only)
  const rate = Number(DATA.sqftRates?.[state.settings.serviceType] || 0);
  const quick = geo.area * rate;

  return { geo, rows, totMat, totLab, totSell, rate, quick };
}

function renderQuote(q){
  $("quoteMeta").innerHTML = `
    Area: <b>${fmt(q.geo.area)}</b> SF •
    Perimeter: <b>${Number.isFinite(q.geo.perim)?fmt(q.geo.perim):"—"}</b> LF •
    Wall: <b>${Number.isFinite(q.geo.wallSF)?fmt(q.geo.wallSF):"—"}</b> SF •
    Paint/Drywall: <b>${Number.isFinite(q.geo.paintSF)?fmt(q.geo.paintSF):"—"}</b> SF
    <br/>
    Quick SF (${esc(state.settings.serviceType)} @ ${money(q.rate)}/SF): <b>${money(q.quick)}</b>
  `;

  const body = $("quoteBody");
  body.innerHTML = "";

  for (const r of q.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="wrapText">${esc(r.label)}</td>
      <td>${esc(r.unit)}</td>
      <td class="num">${r.unit==="PCT_MAT" ? `${fmt(r.units)}%` : fmt(r.units)}</td>
      <td class="num">${money(r.mat)}</td>
      <td class="num">${money(r.lab)}</td>
      <td class="num"><b>${money(r.sell)}</b></td>
    `;
    body.appendChild(tr);
  }

  $("quoteFoot").innerHTML = `
    <tr>
      <td colspan="3"><b>TOTAL</b></td>
      <td class="num"><b>${money(q.totMat)}</b></td>
      <td class="num"><b>${money(q.totLab)}</b></td>
      <td class="num"><b>${money(q.totSell)}</b></td>
    </tr>
  `;

  $("totMat").textContent = money(q.totMat);
  $("totLab").textContent = money(q.totLab);
  $("totSell").textContent = money(q.totSell);
}

function clearQuoteUI(){
  $("quoteMeta").textContent = "Run Calculate to generate a quote.";
  $("quoteBody").innerHTML = "";
  $("quoteFoot").innerHTML = "";
  $("totMat").textContent = "—";
  $("totLab").textContent = "—";
  $("totSell").textContent = "—";
  state.lastQuote = null;
}

function renderPrint(q){
  const dt = new Date().toLocaleDateString();

  const rowsHTML = q.rows.map(r => `
    <tr>
      <td>${esc(r.label)}</td>
      <td>${esc(r.unit)}</td>
      <td class="pNum">${r.unit==="PCT_MAT" ? `${fmt(r.units)}%` : fmt(r.units)}</td>
      <td class="pNum">${money(r.mat)}</td>
      <td class="pNum">${money(r.lab)}</td>
      <td class="pNum"><b>${money(r.sell)}</b></td>
    </tr>
  `).join("");

  $("printRoot").innerHTML = `
    <div class="pHeader">
      <div>
        <div class="pTitle">${esc(DATA.company.name)} — Quote</div>
        <div class="pSub">Phone: ${esc(DATA.company.phone)} • Email: ${esc(DATA.company.email)}</div>
        <div class="pSub">${esc(DATA.company.tagline)}</div>
      </div>
      <div class="pMeta">Date: ${dt}
Customer: ${esc(state.inputs.customer || "—")}
Address: ${esc(state.inputs.address || "—")}</div>
    </div>

    <div class="pBlock">
      <div class="pCard">
        <b>Project Metrics</b><br/>
        Area (SF): ${fmt(q.geo.area)}<br/>
        Perimeter (LF): ${Number.isFinite(q.geo.perim)?fmt(q.geo.perim):"—"}<br/>
        Wall (SF): ${Number.isFinite(q.geo.wallSF)?fmt(q.geo.wallSF):"—"}<br/>
        Paint/Drywall (SF): ${Number.isFinite(q.geo.paintSF)?fmt(q.geo.paintSF):"—"}
      </div>
      <div class="pCard">
        <b>Totals</b><br/>
        Materials: ${money(q.totMat)}<br/>
        Labor: ${money(q.totLab)}<br/>
        <span class="pBig">Total: ${money(q.totSell)}</span><br/>
        <div style="margin-top:6px">
          Quick SF (${esc(state.settings.serviceType)} @ ${money(q.rate)}/SF): <b>${money(q.quick)}</b>
        </div>
      </div>
    </div>

    ${state.inputs.notes ? `<div class="pCard" style="margin-bottom:12px"><b>Notes</b><br/>${esc(state.inputs.notes)}</div>` : ""}

    <table class="pTable">
      <thead>
        <tr>
          <th>Item</th><th>Unit</th><th class="pNum">Units</th>
          <th class="pNum">Material</th><th class="pNum">Labor</th><th class="pNum">Sell</th>
        </tr>
      </thead>
      <tbody>${rowsHTML || `<tr><td colspan="6">No items selected.</td></tr>`}</tbody>
    </table>

    <div class="pTotals">
      <div>
        <b>Terms (example)</b><br/>
        • Estimate based on selected scope and provided measurements.<br/>
        • Final pricing may change after site visit and material selections.<br/>
        • Permits/engineering/design not included unless listed.
      </div>
      <div>
        <div><b>Materials:</b> ${money(q.totMat)}</div>
        <div><b>Labor:</b> ${money(q.totLab)}</div>
        <div class="pBig"><b>Total:</b> ${money(q.totSell)}</div>
      </div>
    </div>
  `;
}

function updateSfRate(){
  const rate = Number(DATA.sqftRates?.[state.settings.serviceType] || 0);
  $("outSfRate").textContent = `${money(rate)} / SF`;
}

function applyDefaults(){
  state.inputs = {
    areaSF: "",
    lenFT: "",
    widFT: "",
    perimOverride: "",
    heightFT: String(DATA.defaults.ceilingHeightFt || 8),
    customer: "",
    address: "",
    notes: ""
  };

  state.settings = {
    serviceType: DATA.defaults.serviceType || "Contractor",
    muMatPct: Number(DATA.defaults.materialsMarkupPct ?? 25),
    muLabPct: Number(DATA.defaults.laborMarkupPct ?? 35)
  };

  $("inAreaSF").value = "";
  $("inLenFT").value = "";
  $("inWidFT").value = "";
  $("inPerimOverride").value = "";
  $("inHeightFT").value = state.inputs.heightFT;

  $("inCustomer").value = "";
  $("inAddress").value = "";
  $("inNotes").value = "";

  $("setServiceType").value = state.settings.serviceType;
  $("setMuMat").value = String(state.settings.muMatPct);
  $("setMuLab").value = String(state.settings.muLabPct);

  updateSfRate();
}

async function init(){
  const res = await fetch("data.json", { cache: "no-store" });
  DATA = await res.json();

  $("companyName").textContent = `${DATA.company.name} Quote`;
  $("companyTagline").textContent = DATA.company.tagline;
  $("companyContact").innerHTML = `
    <span>📞 <a href="tel:${DATA.company.phone.replace(/[^0-9]/g,"")}">${esc(DATA.company.phone)}</a></span>
    <span>•</span>
    <span>✉️ <a href="mailto:${encodeURIComponent(DATA.company.email)}">${esc(DATA.company.email)}</a></span>
  `;

  applyDefaults();
  renderLists();
  bindUI();
  liveGeometry();
  clearQuoteUI();
}

init().catch(err=>{
  console.error(err);
  alert("App failed to load. Make sure index.html, app.js, data.json, styles.css are committed and named correctly.");
});
