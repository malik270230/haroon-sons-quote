/* =========================================================
   Haroon & Sons Consulting Quote — app.js (FULL REPLACE)
   - Generic project labels (not "basement")
   - Working toggles + qty
   - Calculate always works
   - Clean markup math (no double markup)
   - Print/PDF fixed
   ========================================================= */

let DATA = null;

const $ = (id) => document.getElementById(id);

const state = {
  // inputs
  areaSF: "",
  lenFT: "",
  widFT: "",
  perimOverride: "",
  heightFT: "",
  serviceType: "Contractor",

  // settings
  muMatPct: 25,
  muLabPct: 35,

  // customer
  custName: "",
  custAddr: "",
  custNotes: "",

  // dynamic selections
  scopeOn: {},      // key -> bool
  scopeEach: {},    // key -> number (for EACH)
  addonOn: {},      // key -> bool
  addonEach: {},    // key -> number (for EACH)
  fixtureQty: {},   // key -> number
  doorQty: {}       // key -> number
};

function toNum(v){
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function fmt(n){
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function money(n){
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style:"currency", currency:"USD" });
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ---------------- Geometry ---------------- */
function calcGeometry(){
  const L = toNum(state.lenFT);
  const W = toNum(state.widFT);
  const H = Number.isFinite(toNum(state.heightFT)) ? toNum(state.heightFT) : Number(DATA?.defaults?.ceilingHeightFt ?? 8);

  let area = toNum(state.areaSF);
  if (!Number.isFinite(area) && Number.isFinite(L) && Number.isFinite(W)) {
    area = L * W;
  }

  let perim = toNum(state.perimOverride);
  if (!Number.isFinite(perim) && Number.isFinite(L) && Number.isFinite(W)) {
    perim = 2 * (L + W);
  }

  const wallSF  = (Number.isFinite(perim) && Number.isFinite(H)) ? perim * H : NaN;
  const paintSF = (Number.isFinite(wallSF) && Number.isFinite(area)) ? (wallSF + area) : NaN;

  return { area, perim, wallSF, paintSF, H };
}

function unitsFor(unit, geo, eachQty){
  switch(unit){
    case "FLOOR_SF": return geo.area;
    case "WALL_SF":  return geo.wallSF;
    case "PAINT_SF": return geo.paintSF;
    case "LF":       return geo.perim;
    case "EACH":     return eachQty;
    case "PCT_MAT":  return 1; // special handling
    default:         return NaN;
  }
}

/* ---------------- DOM helpers ---------------- */
function setText(id, val){
  const el = $(id);
  if (el) el.textContent = val;
}

function setHTML(id, val){
  const el = $(id);
  if (el) el.innerHTML = val;
}

/* ---------------- Render lists ---------------- */
function rowTemplate({ key, label, unit, matRate, labRate, defaultOn }, kind){
  // kind: scope | addon | fixture | door
  // fixture/door: qty-only (always enabled)
  const isQtyOnly = (kind === "fixture" || kind === "door");
  const showCheck = !isQtyOnly;
  const showQty = (unit === "EACH") || isQtyOnly;

  const checked = isQtyOnly ? true : !!defaultOn;

  return `
    <div class="row" data-kind="${kind}" data-key="${key}" data-unit="${unit}">
      <div class="left">
        ${showCheck ? `<input class="check" type="checkbox" ${checked ? "checked":""} />` : `<span class="check" aria-hidden="true"></span>`}
        <div>
          <label>${escapeHtml(label)}</label>
          <small>${escapeHtml(unit)} • material ${matRate} • labor ${labRate}</small>
        </div>
      </div>
      <div class="right">
        ${showQty ? `<input class="qty" type="number" inputmode="decimal" placeholder="${isQtyOnly ? "0" : "1"}" value="${isQtyOnly ? "0" : ""}">` : ``}
      </div>
    </div>
  `;
}

function renderAllLists(){
  // Scope
  const scopeList = $("scopeList");
  scopeList.innerHTML = DATA.scopeItems.map(it => rowTemplate(it, "scope")).join("");

  // Fixtures
  const fixtureList = $("fixtureList");
  fixtureList.innerHTML = DATA.fixtures.map(it => rowTemplate(it, "fixture")).join("");

  // Doors
  const doorList = $("doorList");
  doorList.innerHTML = DATA.doors.map(it => rowTemplate(it, "door")).join("");

  // Addons
  const addonList = $("addonList");
  addonList.innerHTML = DATA.addons.map(it => rowTemplate(it, "addon")).join("");

  // Initialize defaults into state
  DATA.scopeItems.forEach(it => {
    state.scopeOn[it.key] = !!it.defaultOn;
    state.scopeEach[it.key] = 1;
  });
  DATA.addons.forEach(it => {
    state.addonOn[it.key] = !!it.defaultOn;
    state.addonEach[it.key] = 1;
  });
  DATA.fixtures.forEach(it => { state.fixtureQty[it.key] = 0; });
  DATA.doors.forEach(it => { state.doorQty[it.key] = 0; });

  // After render, sync checkbox visuals to state
  syncUIFromState();
}

function syncUIFromState(){
  document.querySelectorAll(".row[data-kind='scope']").forEach(row => {
    const key = row.dataset.key;
    const chk = row.querySelector("input.check");
    if (chk) chk.checked = !!state.scopeOn[key];
  });
  document.querySelectorAll(".row[data-kind='addon']").forEach(row => {
    const key = row.dataset.key;
    const chk = row.querySelector("input.check");
    if (chk) chk.checked = !!state.addonOn[key];
  });
}

/* ---------------- Tabs ---------------- */
function bindTabs(){
  const tabBtns = document.querySelectorAll(".tab");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const t = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`tab-${t}`)?.classList.add("active");

      // helpful for iPhone
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------------- Inputs ---------------- */
function bindInputs(){
  // geometry
  $("areaSF").addEventListener("input", e => { state.areaSF = e.target.value; liveGeometry(); });
  $("lenFT").addEventListener("input", e => { state.lenFT = e.target.value; liveGeometry(); });
  $("widFT").addEventListener("input", e => { state.widFT = e.target.value; liveGeometry(); });
  $("perimOverride").addEventListener("input", e => { state.perimOverride = e.target.value; liveGeometry(); });
  $("heightFT").addEventListener("input", e => { state.heightFT = e.target.value; liveGeometry(); });

  // customer
  $("custName").addEventListener("input", e => state.custName = e.target.value);
  $("custAddr").addEventListener("input", e => state.custAddr = e.target.value);
  $("custNotes").addEventListener("input", e => state.custNotes = e.target.value);

  // service type
  $("serviceType").addEventListener("change", e => { state.serviceType = e.target.value; });

  // markups
  $("muMat").addEventListener("input", e => {
    const p = toNum(e.target.value);
    if (Number.isFinite(p)) state.muMatPct = p;
  });
  $("muLab").addEventListener("input", e => {
    const p = toNum(e.target.value);
    if (Number.isFinite(p)) state.muLabPct = p;
  });

  // buttons
  $("btnCalc").addEventListener("click", () => generateQuote());
  $("btnPrint").addEventListener("click", () => printPDF());

  // Delegate: toggles + qty fields (works even if DOM changes)
  document.addEventListener("change", (e) => {
    const row = e.target.closest?.(".row");
    if (!row) return;

    const kind = row.dataset.kind;
    const key = row.dataset.key;

    if (e.target.classList.contains("check")) {
      const on = !!e.target.checked;

      if (kind === "scope") state.scopeOn[key] = on;
      if (kind === "addon") state.addonOn[key] = on;
    }
  });

  document.addEventListener("input", (e) => {
    if (!e.target.classList.contains("qty")) return;
    const row = e.target.closest?.(".row");
    if (!row) return;

    const kind = row.dataset.kind;
    const key = row.dataset.key;
    const val = toNum(e.target.value);
    const qty = Number.isFinite(val) ? val : 0;

    if (kind === "fixture") state.fixtureQty[key] = qty;
    if (kind === "door") state.doorQty[key] = qty;
    if (kind === "scope") state.scopeEach[key] = qty;
    if (kind === "addon") state.addonEach[key] = qty;
  });
}

function liveGeometry(){
  const g = calcGeometry();

  setText("perimOut", Number.isFinite(g.perim) ? fmt(g.perim) : "—");
  setText("wallOut",  Number.isFinite(g.wallSF) ? fmt(g.wallSF) : "—");
  setText("paintOut", Number.isFinite(g.paintSF) ? fmt(g.paintSF) : "—");

  const ok = Number.isFinite(g.area) && g.area > 0;
  setText("calcHint", ok
    ? "Ready. Tap Calculate Quote."
    : "Tip: Enter Project Area (SF) or Length & Width. Quote won’t calculate without area."
  );
}

/* ---------------- Quote calculation ---------------- */
function buildLine(item, qtyEach, geo, muMat, muLab){
  const units = unitsFor(item.unit, geo, qtyEach);
  if (!Number.isFinite(units) || units <= 0) return null;

  // Raw costs
  const rawMat = (Number(item.matRate) || 0) * units;
  const rawLab = (Number(item.labRate) || 0) * units;

  // Apply markup ONCE
  const matSell = rawMat * (1 + muMat);
  const labSell = rawLab * (1 + muLab);

  return {
    label: item.label,
    unit: item.unit,
    units,
    rawMat,
    rawLab,
    matSell,
    labSell,
    sell: matSell + labSell
  };
}

function generateQuote(){
  const geo = calcGeometry();
  if (!Number.isFinite(geo.area) || geo.area <= 0){
    alert("Enter Project Area (SF) OR Length & Width first.");
    return;
  }

  const muMat = (Number(state.muMatPct) || 0) / 100;
  const muLab = (Number(state.muLabPct) || 0) / 100;

  // Quick SF rate info only (does NOT alter line items)
  const sfRate = Number(DATA.sqftRates?.[state.serviceType] || 0);
  const quickSF = geo.area * sfRate;

  const rows = [];

  // Scope
  DATA.scopeItems.forEach(it => {
    if (!state.scopeOn[it.key]) return;
    const qty = (it.unit === "EACH") ? (Number(state.scopeEach[it.key]) || 0) : 1;
    const line = buildLine(it, qty, geo, muMat, muLab);
    if (line) rows.push(line);
  });

  // Fixtures
  DATA.fixtures.forEach(it => {
    const qty = Number(state.fixtureQty[it.key]) || 0;
    if (qty <= 0) return;
    const line = buildLine(it, qty, geo, muMat, muLab);
    if (line) rows.push(line);
  });

  // Doors
  DATA.doors.forEach(it => {
    const qty = Number(state.doorQty[it.key]) || 0;
    if (qty <= 0) return;
    const line = buildLine(it, qty, geo, muMat, muLab);
    if (line) rows.push(line);
  });

  // Addons (percent-of-material handled at end)
  let pctAddon = null;
  DATA.addons.forEach(it => {
    if (!state.addonOn[it.key]) return;
    if (it.unit === "PCT_MAT") { pctAddon = it; return; }
    const qty = (it.unit === "EACH") ? (Number(state.addonEach[it.key]) || 0) : 1;
    const line = buildLine(it, qty, geo, muMat, muLab);
    if (line) rows.push(line);
  });

  // Percent-of-materials (based on RAW MATERIALS, not sell)
  const rawMatTotal = rows.reduce((sum, r) => sum + (r.rawMat || 0), 0);
  if (pctAddon){
    const pct = Number(pctAddon.matRate || 0); // e.g. 0.05
    if (pct > 0){
      const rawMat = rawMatTotal * pct;
      const matSell = rawMat * (1 + muMat);
      rows.push({
        label: pctAddon.label,
        unit: "PCT_MAT",
        units: pct * 100,
        rawMat,
        rawLab: 0,
        matSell,
        labSell: 0,
        sell: matSell
      });
    }
  }

  // Totals
  const totMat = rows.reduce((s,r)=>s + (r.matSell||0), 0);
  const totLab = rows.reduce((s,r)=>s + (r.labSell||0), 0);
  const totSell = totMat + totLab;

  // Render summary
  setHTML("quoteSummary", `
    Project Area: <b>${fmt(geo.area)}</b> SF •
    Perimeter: <b>${Number.isFinite(geo.perim)?fmt(geo.perim):"—"}</b> LF •
    Wall SF: <b>${Number.isFinite(geo.wallSF)?fmt(geo.wallSF):"—"}</b> •
    Paint/Drywall SF: <b>${Number.isFinite(geo.paintSF)?fmt(geo.paintSF):"—"}</b><br/>
    Materials MU: <b>${Math.round(state.muMatPct)}%</b> • Labor MU: <b>${Math.round(state.muLabPct)}%</b><br/>
    Quick SF Pricing (${escapeHtml(state.serviceType)} @ ${money(sfRate)}/SF): <b>${money(quickSF)}</b>
  `);

  // Render rows
  const body = $("quoteBody");
  body.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="wrapText">${escapeHtml(r.label)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td class="num">${r.unit === "PCT_MAT" ? `${fmt(r.units)}%` : fmt(r.units)}</td>
      <td class="num">${money(r.matSell)}</td>
      <td class="num">${money(r.labSell)}</td>
      <td class="num"><b>${money(r.sell)}</b></td>
    `;
    body.appendChild(tr);
  });

  const foot = $("quoteFoot");
  foot.innerHTML = `
    <tr>
      <td colspan="3"><b>TOTAL</b></td>
      <td class="num"><b>${money(totMat)}</b></td>
      <td class="num"><b>${money(totLab)}</b></td>
      <td class="num"><b>${money(totSell)}</b></td>
    </tr>
  `;

  // jump to quote tab
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelector('.tab[data-tab="quote"]')?.classList.add("active");
  $("tab-quote")?.classList.add("active");
}

/* ---------------- Print / PDF ---------------- */
function buildPrintHTML(){
  const geo = calcGeometry();

  // Make sure quote exists
  if (!$("quoteBody")?.children?.length) {
    generateQuote();
  }

  // Pull totals from footer (already computed)
  const foot = $("quoteFoot")?.querySelector("tr");
  const tds = foot ? foot.querySelectorAll("td") : null;

  const totMat = tds ? tds[1].innerText : "—";
  const totLab = tds ? tds[2].innerText : "—";
  const totSell = tds ? tds[3].innerText : "—";

  // Build table rows from existing quote table
  let rowsHTML = "";
  document.querySelectorAll("#quoteBody tr").forEach(tr => {
    const c = tr.querySelectorAll("td");
    rowsHTML += `
      <tr>
        <td>${c[0].innerHTML}</td>
        <td>${c[1].innerHTML}</td>
        <td class="pNum">${c[2].innerHTML}</td>
        <td class="pNum">${c[3].innerHTML}</td>
        <td class="pNum">${c[4].innerHTML}</td>
        <td class="pNum">${c[5].innerHTML}</td>
      </tr>
    `;
  });

  const metaRight =
`Customer: ${escapeHtml(state.custName || "—")}
Address: ${escapeHtml(state.custAddr || "—")}
Date: ${new Date().toLocaleDateString()}`;

  return `
    <div class="pHeader">
      <div>
        <div class="pTitle">${escapeHtml(DATA.company.name)}</div>
        <div class="pSub">${escapeHtml(DATA.company.phone)} • ${escapeHtml(DATA.company.email)}</div>
        <div class="pSub">${escapeHtml(DATA.company.tagline)}</div>
        <div class="pSub">Materials MU: ${Math.round(state.muMatPct)}% • Labor MU: ${Math.round(state.muLabPct)}%</div>
      </div>
      <div class="pMeta">${metaRight.replaceAll("\n","<br/>")}</div>
    </div>

    <div class="pSub">
      Project Area SF: ${fmt(geo.area)} •
      Perimeter LF: ${Number.isFinite(geo.perim)?fmt(geo.perim):"—"} •
      Wall SF: ${Number.isFinite(geo.wallSF)?fmt(geo.wallSF):"—"} •
      Paint/Drywall SF: ${Number.isFinite(geo.paintSF)?fmt(geo.paintSF):"—"}
    </div>

    <table class="pTable" style="margin-top:10px">
      <thead>
        <tr>
          <th>Item</th><th>Unit</th><th class="pNum">Units</th>
          <th class="pNum">Material (w/markup)</th>
          <th class="pNum">Labor (w/markup)</th>
          <th class="pNum">Sell Price</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML || `<tr><td colspan="6">No items selected.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="pTotalRow">
          <td colspan="3"><b>TOTAL</b></td>
          <td class="pNum"><b>${totMat}</b></td>
          <td class="pNum"><b>${totLab}</b></td>
          <td class="pNum"><b>${totSell}</b></td>
        </tr>
      </tfoot>
    </table>

    ${state.custNotes ? `<div class="pSub" style="margin-top:12px"><b>Notes:</b> ${escapeHtml(state.custNotes)}</div>` : ""}
  `;
}

function printPDF(){
  const geo = calcGeometry();
  if (!Number.isFinite(geo.area) || geo.area <= 0){
    alert("Enter Project Area (SF) OR Length & Width first.");
    return;
  }
  const root = $("printRoot");
  root.innerHTML = buildPrintHTML();
  window.print();
}

/* ---------------- Init ---------------- */
async function init(){
  const res = await fetch("data.json", { cache: "no-store" });
  DATA = await res.json();

  // company header
  $("companyName").textContent = `${DATA.company.name} Quote`;
  $("companyTagline").textContent = DATA.company.tagline;
  $("companyContact").innerHTML =
    `📞 <a href="tel:${DATA.company.phone.replace(/[^0-9]/g,"")}">${escapeHtml(DATA.company.phone)}</a>
     • ✉️ <a href="mailto:${encodeURIComponent(DATA.company.email)}">${escapeHtml(DATA.company.email)}</a>`;

  // defaults
  state.serviceType = DATA.defaults.serviceType || "Contractor";
  $("serviceType").value = state.serviceType;

  state.heightFT = String(DATA.defaults.ceilingHeightFt ?? 8);
  $("heightFT").value = state.heightFT;

  state.muMatPct = Math.round((Number(DATA.defaults.materialsMarkup ?? 0.25)) * 100);
  state.muLabPct = Math.round((Number(DATA.defaults.laborMarkup ?? 0.35)) * 100);

  $("muMat").value = String(state.muMatPct);
  $("muLab").value = String(state.muLabPct);

  // important: start blank (no default area)
  state.areaSF = "";
  $("areaSF").value = "";

  // rates display
  $("rateHandy").textContent = money(Number(DATA.sqftRates?.Handyman || 0));
  $("rateContract").textContent = money(Number(DATA.sqftRates?.Contractor || 0));

  // lists
  renderAllLists();

  // tabs + inputs
  bindTabs();
  bindInputs();

  liveGeometry();
}

init().catch(err => {
  console.error(err);
  alert("App failed to load. Make sure data.json and app.js are committed and named correctly.");
});
