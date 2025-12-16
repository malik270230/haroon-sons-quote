// Haroon & Sons Consulting Quote — app.js (FULL REPLACE)
// Works with your data.json schema: { settings:{...}, items:[...] }

const $ = (id) => document.getElementById(id);

const LS_KEY = "haroon_sons_quote_v2_state";

// ======= ADMIN / MARKUP UNLOCK (Option A - iPhone friendly) =======
const ADMIN_PIN = "0718"; // <-- change if you want
const ADMIN_STORAGE_KEY = "hs_admin_unlocked";

let adminUnlocked = sessionStorage.getItem(ADMIN_STORAGE_KEY) === "1";
let pressTimer = null;

// state
const state = {
  // inputs
  areaSF: "",
  lenFT: "",
  widFT: "",
  perimOverride: "",
  heightFT: "",

  // customer
  custName: "",
  custAddr: "",
  custNotes: "",

  // settings
  muMatPct: 25,
  muLabPct: 35,
  serviceType: "Contractor",

  // admin
  tariffEnabled: false,
  tariffPct: 0,

  // selections
  on: {},     // id -> bool
  qty: {},    // id -> number (for EACH)
};

let DATA = null;

// ---------- helpers ----------
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
    .replaceAll("'","&#39;");
}

// ---------- load/save ----------
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    Object.assign(state, obj);
  }catch(e){}
}
function saveState(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }catch(e){}
}

// ---------- geometry ----------
function calcGeometry(){
  const L = toNum(state.lenFT);
  const W = toNum(state.widFT);

  const H_default = Number(DATA?.settings?.defaults?.ceilingHeight ?? 8);
  const H = Number.isFinite(toNum(state.heightFT)) ? toNum(state.heightFT) : H_default;

  let area = toNum(state.areaSF);
  if (!Number.isFinite(area) && Number.isFinite(L) && Number.isFinite(W)) area = L * W;

  let perim = toNum(state.perimOverride);
  if (!Number.isFinite(perim) && Number.isFinite(L) && Number.isFinite(W)) perim = 2 * (L + W);

  const wallSF = (Number.isFinite(perim) && Number.isFinite(H)) ? perim * H : NaN;
  const paintSF = (Number.isFinite(wallSF) && Number.isFinite(area)) ? (wallSF + area) : NaN;

  return { area, perim, wallSF, paintSF, H };
}

function unitsFor(unit, geo, eachQty){
  switch(unit){
    case "FLOOR_SF": return geo.area;
    case "WALL_SF": return geo.wallSF;
    case "PAINT_SF": return geo.paintSF;
    case "LF": return geo.perim;
    case "EACH": return eachQty;
    case "PCT_MAT": return 1;
    default: return NaN;
  }
}

// ---------- build derived lists from your items ----------
function classifyItems(items){
  const scope = [];
  const fixtures = [];
  const doors = [];
  const addons = [];

  for (const it of items){
    const cat = String(it.category || "").toLowerCase();
    const unit = it.unit;

    const row = {
      id: it.id,
      label: it.label,
      unit: it.unit,
      matRate: Number(it.material_rate || 0),
      labRate: Number(it.labor_rate || 0),
      defaultOn: !!it.default_on,
      defaultQty: (it.default_qty == null ? null : Number(it.default_qty)),
    };

    if (cat.includes("fixture")) fixtures.push(row);
    else if (cat.includes("door")) doors.push(row);
    else if (cat.includes("add-on") || cat.includes("addon") || unit === "PCT_MAT") addons.push(row);
    else scope.push(row);
  }

  return { scope, fixtures, doors, addons };
}

// ---------- render ----------
function rowTemplate(item, kind){
  const isQty = item.unit === "EACH" || kind === "fixture" || kind === "door";
  const hasCheck = (kind === "scope" || kind === "addon"); // toggles only

  const checked = hasCheck ? !!state.on[item.id] : true;
  const qtyVal = Number(state.qty[item.id] ?? (item.defaultQty ?? 0));

  return `
    <div class="row" data-kind="${kind}" data-id="${escapeHtml(item.id)}">
      ${hasCheck ? `
        <label class="chk">
          <input class="check" type="checkbox" ${checked ? "checked" : ""} />
          <span>${escapeHtml(item.label)}</span>
        </label>
      ` : `
        <div class="labelOnly">${escapeHtml(item.label)}</div>
      `}
      <div class="meta">${escapeHtml(item.unit)} • mat ${fmt(item.matRate)} • labor ${fmt(item.labRate)}</div>

      ${isQty ? `
        <div class="qtyWrap">
          <input class="qty" inputmode="decimal" value="${Number.isFinite(qtyVal)?qtyVal:0}" />
          <div class="muted">${kind === "scope" || kind === "addon" ? "EACH qty" : "qty"}</div>
        </div>
      ` : ``}
    </div>
  `;
}

function renderAll(){
  const c = DATA.settings?.company || {};
  if ($("companyName")) $("companyName").textContent = c.name || "Haroon & Sons Consulting Quote";
  if ($("companyPhone")){
    $("companyPhone").textContent = `📞 ${c.phone || ""}`.trim();
    $("companyPhone").href = `tel:${String(c.phone||"").replace(/\D/g,"")}`;
  }
  if ($("companyEmail")){
    $("companyEmail").textContent = `✉️ ${c.email || ""}`.trim();
    $("companyEmail").href = `mailto:${c.email || ""}`;
  }
  if ($("companyLogo") && c.logo) $("companyLogo").src = c.logo;

  // markups
  const mu = DATA.settings?.markups || {};
  state.muMatPct = Number.isFinite(toNum(state.muMatPct)) ? Number(state.muMatPct) : Math.round((mu.materials || 0.25) * 100);
  state.muLabPct = Number.isFinite(toNum(state.muLabPct)) ? Number(state.muLabPct) : Math.round((mu.labor || 0.35) * 100);

  if ($("muMat")) $("muMat").value = state.muMatPct;
  if ($("muLab")) $("muLab").value = state.muLabPct;

  const { scope, fixtures, doors, addons } = classifyItems(DATA.items || []);

  // init defaults
  for (const it of scope){
    if (state.on[it.id] == null) state.on[it.id] = !!it.defaultOn;
    if (state.qty[it.id] == null) state.qty[it.id] = 1;
  }
  for (const it of addons){
    if (state.on[it.id] == null) state.on[it.id] = !!it.defaultOn;
    if (state.qty[it.id] == null) state.qty[it.id] = 1;
  }
  for (const it of fixtures){
    if (state.qty[it.id] == null) state.qty[it.id] = Number(it.defaultQty ?? 0);
  }
  for (const it of doors){
    if (state.qty[it.id] == null) state.qty[it.id] = Number(it.defaultQty ?? 0);
  }

  $("scopeList").innerHTML = scope.map(it => rowTemplate(it,"scope")).join("");
  $("fixtureList").innerHTML = fixtures.map(it => rowTemplate(it,"fixture")).join("");
  $("doorList").innerHTML = doors.map(it => rowTemplate(it,"door")).join("");
  $("addonList").innerHTML = addons.map(it => rowTemplate(it,"addon")).join("");

  liveGeometry();
  setAdminUI();
  saveState();
}

// ---------- tabs ----------
function bindTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const t = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      document.getElementById(`tab-${t}`)?.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// ---------- inputs ----------
function bindInputs(){
  // geometry
  $("areaSF").addEventListener("input", e => { state.areaSF = e.target.value; liveGeometry(); saveState(); });
  $("lenFT").addEventListener("input", e => { state.lenFT = e.target.value; liveGeometry(); saveState(); });
  $("widFT").addEventListener("input", e => { state.widFT = e.target.value; liveGeometry(); saveState(); });
  $("perimOverride").addEventListener("input", e => { state.perimOverride = e.target.value; liveGeometry(); saveState(); });
  $("heightFT").addEventListener("input", e => { state.heightFT = e.target.value; liveGeometry(); saveState(); });

  // customer
  $("custName").addEventListener("input", e => { state.custName = e.target.value; saveState(); });
  $("custAddr").addEventListener("input", e => { state.custAddr = e.target.value; saveState(); });
  $("custNotes").addEventListener("input", e => { state.custNotes = e.target.value; saveState(); });

  // markups
  $("muMat").addEventListener("input", e => { state.muMatPct = e.target.value; saveState(); });
  $("muLab").addEventListener("input", e => { state.muLabPct = e.target.value; saveState(); });

  // buttons
  $("btnCalc").addEventListener("click", generateQuote);
  $("btnPrint").addEventListener("click", printPDF);

  // delegate toggles/qty
  document.addEventListener("change", (e)=>{
    const row = e.target.closest?.(".row");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.classList.contains("check")){
      state.on[id] = !!e.target.checked;
      saveState();
    }
  });
  document.addEventListener("input", (e)=>{
    if (!e.target.classList.contains("qty")) return;
    const row = e.target.closest?.(".row");
    if (!row) return;
    const id = row.dataset.id;
    const v = toNum(e.target.value);
    state.qty[id] = Number.isFinite(v) ? v : 0;
    saveState();
  });
}

function liveGeometry(){
  const g = calcGeometry();
  $("perimOut").textContent = Number.isFinite(g.perim) ? fmt(g.perim) : "—";
  $("wallOut").textContent = Number.isFinite(g.wallSF) ? fmt(g.wallSF) : "—";
  $("paintOut").textContent = Number.isFinite(g.paintSF) ? fmt(g.paintSF) : "—";

  const ok = Number.isFinite(g.area) && g.area > 0;
  $("calcHint").textContent = ok
    ? "Ready. Tap Calculate Quote."
    : "Tip: Enter Project Area (SF) or Length & Width. Quote won’t calculate without area.";
}

// ---------- quote calc ----------
function buildLine(item, qtyEach, geo, muMat, muLab, tariffEnabled, tariffPct){
  const units = unitsFor(item.unit, geo, qtyEach);
  if (!Number.isFinite(units) || units <= 0) return null;

  const rawMat = (Number(item.matRate)||0) * units;
  const rawLab = (Number(item.labRate)||0) * units;

  // tariff only hits materials (optional)
  const tariffMult = tariffEnabled ? (1 + (tariffPct/100)) : 1;

  const matSell = (rawMat * tariffMult) * (1 + muMat);
  const labSell = rawLab * (1 + muLab);

  return {
    label: item.label,
    unit: item.unit,
    units,
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

  const muMat = (Number(toNum(state.muMatPct)) || 0) / 100;
  const muLab = (Number(toNum(state.muLabPct)) || 0) / 100;

  const tariffEnabled = !!state.tariffEnabled;
  const tariffPct = Number(toNum(state.tariffPct)) || 0;

  const { scope, fixtures, doors, addons } = classifyItems(DATA.items || []);

  const rows = [];

  // scope
  for (const it of scope){
    if (!state.on[it.id]) continue;
    const qty = (it.unit === "EACH") ? (Number(state.qty[it.id]) || 0) : 1;
    const line = buildLine(it, qty, geo, muMat, muLab, tariffEnabled, tariffPct);
    if (line) rows.push(line);
  }

  // fixtures & doors
  for (const it of fixtures){
    const qty = Number(state.qty[it.id]) || 0;
    if (qty <= 0) continue;
    const line = buildLine(it, qty, geo, muMat, muLab, tariffEnabled, tariffPct);
    if (line) rows.push(line);
  }
  for (const it of doors){
    const qty = Number(state.qty[it.id]) || 0;
    if (qty <= 0) continue;
    const line = buildLine(it, qty, geo, muMat, muLab, tariffEnabled, tariffPct);
    if (line) rows.push(line);
  }

  // addons (including PCT_MAT if present)
  let pctMatAddon = null;
  for (const it of addons){
    if (!state.on[it.id]) continue;
    if (it.unit === "PCT_MAT"){ pctMatAddon = it; continue; }
    const qty = (it.unit === "EACH") ? (Number(state.qty[it.id]) || 0) : 1;
    const line = buildLine(it, qty, geo, muMat, muLab, tariffEnabled, tariffPct);
    if (line) rows.push(line);
  }

  // PCT_MAT: based on material subtotal (SELL materials so it tracks tariff + markup cleanly)
  if (pctMatAddon){
    const matSubtotal = rows.reduce((s,r)=>s + (r.matSell||0), 0);
    const pct = Number(pctMatAddon.matRate || 0); // e.g. 0.05
    if (pct > 0){
      rows.push({
        label: pctMatAddon.label,
        unit: "PCT_MAT",
        units: pct * 100,
        matSell: matSubtotal * pct,
        labSell: 0,
        sell: matSubtotal * pct
      });
    }
  }

  // render
  const body = $("quoteBody");
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.label)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td class="num">${fmt(r.units)}</td>
      <td class="num">${money(r.matSell)}</td>
      <td class="num">${money(r.labSell)}</td>
      <td class="num"><b>${money(r.sell)}</b></td>
    </tr>
  `).join("");

  const total = rows.reduce((s,r)=>s + (r.sell||0), 0);
  $("quoteTotal").textContent = money(total);

  $("quoteSummary").innerHTML = `
    <div><b>Customer:</b> ${escapeHtml(state.custName || "—")}</div>
    <div><b>Address:</b> ${escapeHtml(state.custAddr || "—")}</div>
    <div class="muted" style="margin-top:8px">
      Area: ${fmt(geo.area)} SF • Perimeter: ${Number.isFinite(geo.perim)?fmt(geo.perim):"—"} LF •
      Wall SF: ${Number.isFinite(geo.wallSF)?fmt(geo.wallSF):"—"} • Paint/Drywall SF: ${Number.isFinite(geo.paintSF)?fmt(geo.paintSF):"—"}<br/>
      Materials MU: ${Math.round(toNum(state.muMatPct)||0)}% • Labor MU: ${Math.round(toNum(state.muLabPct)||0)}%
      ${tariffEnabled ? ` • Tariff bump: ${tariffPct}% (materials only)` : ``}
    </div>
  `;

  // jump to quote tab
  document.querySelector(`.tab[data-tab="quote"]`)?.click();
}

// ---------- printing ----------
function printPDF(){
  // Keep it simple: use browser print
  window.print();
}

// ---------- admin unlock ----------
function setAdminUI(){
  const box = $("adminBox");
  if (!box) return;
  box.classList.toggle("hidden", !adminUnlocked);

  if ($("tariffEnabled")) $("tariffEnabled").checked = !!state.tariffEnabled;
  if ($("tariffPct")) $("tariffPct").value = String(state.tariffPct ?? 0);
}

function bindAdmin(){
  const logo = $("companyLogo");
  if (logo){
    const startPress = () => {
      pressTimer = setTimeout(() => {
        const pin = prompt("Enter admin PIN");
        if (pin === ADMIN_PIN){
          adminUnlocked = true;
          sessionStorage.setItem(ADMIN_STORAGE_KEY,"1");
          setAdminUI();
          alert("Admin unlocked");
        } else {
          alert("Wrong PIN");
        }
      }, 900); // ~1 second
    };
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
    };

    logo.addEventListener("touchstart", startPress, { passive:true });
    logo.addEventListener("touchend", cancelPress);
    logo.addEventListener("touchmove", cancelPress);
    logo.addEventListener("mousedown", startPress);
    logo.addEventListener("mouseup", cancelPress);
    logo.addEventListener("mouseleave", cancelPress);
  }

  $("adminApplyBtn")?.addEventListener("click", ()=>{
    if (!adminUnlocked) return;
    state.tariffEnabled = !!$("tariffEnabled").checked;
    state.tariffPct = Number(toNum($("tariffPct").value)) || 0;
    $("adminStateMsg").textContent = "Saved. Recalculate quote to apply.";
    saveState();
  });

  $("adminClearBtn")?.addEventListener("click", ()=>{
    adminUnlocked = false;
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    $("adminStateMsg").textContent = "Locked.";
    setAdminUI();
  });
}

// ---------- boot ----------
async function boot(){
  try{
    loadState();

    // cache-bust
    const url = `data.json?v=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Cannot load data.json");

    DATA = await res.json();

    bindTabs();
    bindInputs();
    bindAdmin();
    renderAll();
  }catch(e){
    alert("Error loading app files. Make sure index.html, app.js, styles.css, data.json are all in the SAME folder (repo root).");
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", boot);
