// Haroon & Sons Consulting Quote — FINAL
// Markup system: SQFT tier markup (combined subtotal) + Admin overrides
// Tariff: materials-only bump (before markup)

const $ = (id) => document.getElementById(id);

const LS_KEY = "hs_quote_state_final";
const ADMIN_PIN = "0718"; // change if you want
const ADMIN_SESSION_KEY = "hs_admin_unlocked_final";

let DATA = null;
let adminUnlocked = sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";

const state = {
  areaSF: "",
  lenFT: "",
  widFT: "",
  perimOverride: "",
  heightFT: "",

  custName: "",
  custAddr: "",
  custNotes: "",

  // Admin controls (saved locally)
  markupEnabled: true,
  tariffEnabled: false,
  tariffPct: 0,
  overrideMarkupPct: "",

  on: {},   // toggle items (scope/addons)
  qty: {}   // each qty (fixtures/doors/EACH)
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
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    Object.assign(state, obj);
  }catch{}
}
function saveState(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch{}
}

function classifyItems(items){
  const scope=[], fixtures=[], doors=[], addons=[];
  for (const it of items){
    const cat = String(it.category||"").toLowerCase();
    if (cat.includes("fixture")) fixtures.push(it);
    else if (cat.includes("door")) doors.push(it);
    else if (cat.includes("add-on") || cat.includes("addon") || it.unit === "PCT_MAT") addons.push(it);
    else scope.push(it);
  }
  return { scope, fixtures, doors, addons };
}

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

  return { area, perim, wallSF, paintSF };
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

function tierMarkup(area){
  const tiers = DATA?.settings?.sqft_markup_tiers || [];
  for (const t of tiers){
    if (area <= Number(t.max_sqft)) return Number(t.markup);
  }
  return 0;
}

function effectiveMarkupPct(area){
  const override = toNum(state.overrideMarkupPct);
  if (Number.isFinite(override)) return Math.max(0, override / 100);
  return tierMarkup(area);
}

function renderRates(){
  const tbody = $("ratesBody");
  tbody.innerHTML = DATA.items.map(it => `
    <tr>
      <td>${esc(it.label)}</td>
      <td>${esc(it.unit)}</td>
      <td class="num">${money(Number(it.material_rate)||0)}</td>
      <td class="num">${money(Number(it.labor_rate)||0)}</td>
    </tr>
  `).join("");
}

function rowTemplate(it, kind){
  const isToggle = (kind === "scope" || kind === "addon");
  const needsQty = (it.unit === "EACH" || kind === "fixture" || kind === "door");

  const checked = isToggle ? !!state.on[it.id] : true;
  const qtyVal = Number(state.qty[it.id] ?? (it.default_qty ?? 0));

  return `
    <div class="row" data-id="${esc(it.id)}" data-kind="${kind}">
      <div class="rowTop">
        ${isToggle ? `
          <label class="chk">
            <input class="check" type="checkbox" ${checked ? "checked" : ""} />
            <span>${esc(it.label)}</span>
          </label>
        ` : `
          <div style="font-weight:900">${esc(it.label)}</div>
        `}
        ${needsQty ? `
          <div class="qtyWrap">
            <input class="qty" inputmode="decimal" value="${Number.isFinite(qtyVal)?qtyVal:0}" />
          </div>
        ` : ``}
      </div>
      <div class="meta">${esc(it.unit)} • material ${fmt(Number(it.material_rate)||0)} • labor ${fmt(Number(it.labor_rate)||0)}</div>
    </div>
  `;
}

function renderLists(){
  const { scope, fixtures, doors, addons } = classifyItems(DATA.items);

  // initialize defaults once
  for (const it of scope){
    if (state.on[it.id] == null) state.on[it.id] = !!it.default_on;
    if (state.qty[it.id] == null) state.qty[it.id] = 1;
  }
  for (const it of addons){
    if (state.on[it.id] == null) state.on[it.id] = !!it.default_on;
    if (state.qty[it.id] == null) state.qty[it.id] = 1;
  }
  for (const it of fixtures){
    if (state.qty[it.id] == null) state.qty[it.id] = Number(it.default_qty ?? 0);
  }
  for (const it of doors){
    if (state.qty[it.id] == null) state.qty[it.id] = Number(it.default_qty ?? 0);
  }

  $("scopeList").innerHTML = scope.map(it => rowTemplate(it,"scope")).join("");
  $("fixtureList").innerHTML = fixtures.map(it => rowTemplate(it,"fixture")).join("");
  $("doorList").innerHTML = doors.map(it => rowTemplate(it,"door")).join("");
  $("addonList").innerHTML = addons.map(it => rowTemplate(it,"addon")).join("");
}

function setCompany(){
  const c = DATA.settings.company || {};
  $("companyName").textContent = c.name || "Haroon & Sons Consulting Quote";
  $("companyPhone").textContent = `📞 ${c.phone||""}`.trim();
  $("companyPhone").href = `tel:${String(c.phone||"").replace(/\D/g,"")}`;
  $("companyEmail").textContent = `✉️ ${c.email||""}`.trim();
  $("companyEmail").href = `mailto:${c.email||""}`;
  if (c.logo) $("companyLogo").src = c.logo;
}

function updateKPIs(geo){
  $("kPerim").textContent = Number.isFinite(geo.perim) ? fmt(geo.perim) : "—";
  $("kWall").textContent  = Number.isFinite(geo.wallSF) ? fmt(geo.wallSF) : "—";
  $("kPaint").textContent = Number.isFinite(geo.paintSF) ? fmt(geo.paintSF) : "—";
}

function computeAndRenderQuote(){
  const geo = calcGeometry();
  updateKPIs(geo);

  const area = geo.area;
  if (!Number.isFinite(area) || area <= 0){
    $("quoteBody").innerHTML = "";
    $("quoteTotal").textContent = "—";
    $("rawTotal").textContent = "—";
    $("markupShown").textContent = "—";
    $("tariffShown").textContent = "—";
    $("tierLine").textContent = "Markup tier: —";
    $("quoteMeta").textContent = "Enter project area to generate totals.";
    return;
  }

  const mk = effectiveMarkupPct(area);
  const mkLabel = `${Math.round(mk*100)}%`;
  const tariffPct = state.tariffEnabled ? (Number(toNum(state.tariffPct)) || 0) : 0;
  $("tierLine").textContent = `Markup tier: ${mkLabel} (${Math.round(area)} SF)` + (state.markupEnabled ? "" : " (OFF)");

  const { scope, fixtures, doors, addons } = classifyItems(DATA.items);

  const rows = [];
  let rawMaterials = 0;
  let rawLabor = 0;

  function includeItem(it, qtyEach){
    const units = unitsFor(it.unit, geo, qtyEach);
    if (!Number.isFinite(units) || units <= 0) return;

    const mat = (Number(it.material_rate)||0) * units;
    const lab = (Number(it.labor_rate)||0) * units;

    rawMaterials += mat;
    rawLabor += lab;

    rows.push({
      label: it.label,
      unit: it.unit,
      units,
      raw: mat + lab,
      mat,
      lab
    });
  }

  // scope toggles
  for (const it of scope){
    if (!state.on[it.id]) continue;
    const q = (it.unit === "EACH") ? (Number(state.qty[it.id])||0) : 1;
    includeItem(it, q);
  }

  // fixtures/doors qty
  for (const it of fixtures){
    const q = Number(state.qty[it.id])||0;
    if (q <= 0) continue;
    includeItem(it, q);
  }
  for (const it of doors){
    const q = Number(state.qty[it.id])||0;
    if (q <= 0) continue;
    includeItem(it, q);
  }

  // addons (including PCT_MAT)
  let pctMatItem = null;
  for (const it of addons){
    if (!state.on[it.id]) continue;
    if (it.unit === "PCT_MAT"){ pctMatItem = it; continue; }
    const q = (it.unit === "EACH") ? (Number(state.qty[it.id])||0) : 1;
    includeItem(it, q);
  }

  // Apply tariff (materials only) BEFORE markup
  const tariffMult = 1 + (tariffPct / 100);
  const rawMaterialsTariffed = rawMaterials * tariffMult;
  const rawSubtotalAfterTariff = rawMaterialsTariffed + rawLabor;

  // PCT_MAT line is % of RAW MATERIALS (after tariff) (matches label intent)
  if (pctMatItem){
    const pct = Number(pctMatItem.material_rate)||0; // e.g., 0.05
    if (pct > 0){
      const addRaw = rawMaterialsTariffed * pct;
      rows.push({
        label: pctMatItem.label,
        unit: "PCT_MAT",
        units: pct * 100,
        raw: addRaw,
        mat: addRaw,
        lab: 0
      });
    }
  }

  // total raw includes PCT_MAT add
  const rawTotal = rows.reduce((s,r)=>s + (r.raw||0), 0);

  // Sell = rawTotal * (1 + markup) if markup enabled; else rawTotal
  const sellTotal = state.markupEnabled ? rawTotal * (1 + mk) : rawTotal;

  // Render
  $("quoteBody").innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.label)}</td>
      <td>${esc(r.unit)}</td>
      <td class="num">${fmt(r.units)}</td>
      <td class="num">${money(r.raw)}</td>
      <td class="num"><b>${money(state.markupEnabled ? (r.raw*(1+mk)) : r.raw)}</b></td>
    </tr>
  `).join("");

  $("quoteTotal").textContent = money(sellTotal);
  $("rawTotal").textContent = money(rawTotal);
  $("markupShown").textContent = state.markupEnabled ? `${Math.round(mk*100)}%` : "OFF";
  $("tariffShown").textContent = state.tariffEnabled ? `${tariffPct}%` : "OFF";

  const nm = state.custName?.trim() || "—";
  const ad = state.custAddr?.trim() || "—";
  $("quoteMeta").innerHTML = `Customer: <b>${esc(nm)}</b> • Address: <b>${esc(ad)}</b>`;
}

function bindTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const t = btn.dataset.tab;
      document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
      $("tab-"+t).classList.add("active");
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  });
}

function bindInputs(){
  const map = [
    ["areaSF","areaSF"],
    ["lenFT","lenFT"],
    ["widFT","widFT"],
    ["perimOverride","perimOverride"],
    ["heightFT","heightFT"],
    ["custName","custName"],
    ["custAddr","custAddr"],
    ["custNotes","custNotes"]
  ];
  for (const [id,key] of map){
    $(id).addEventListener("input", (e)=>{
      state[key] = e.target.value;
      saveState();
      computeAndRenderQuote();
    });
  }

  $("btnRecalc").addEventListener("click", ()=>{
    computeAndRenderQuote();
  });
  $("btnPrint").addEventListener("click", ()=>window.print());

  // delegate toggles/qty
  document.addEventListener("change", (e)=>{
    const row = e.target.closest?.(".row");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.classList.contains("check")){
      state.on[id] = !!e.target.checked;
      saveState();
      computeAndRenderQuote();
    }
    if (e.target.id === "markupEnabled" || e.target.id === "tariffEnabled"){
      // handled in admin section
    }
  });

  document.addEventListener("input", (e)=>{
    if (!e.target.classList.contains("qty")) return;
    const row = e.target.closest?.(".row");
    if (!row) return;
    const id = row.dataset.id;
    state.qty[id] = Number(toNum(e.target.value)) || 0;
    saveState();
    computeAndRenderQuote();
  });
}

function applyStateToUI(){
  $("areaSF").value = state.areaSF;
  $("lenFT").value = state.lenFT;
  $("widFT").value = state.widFT;
  $("perimOverride").value = state.perimOverride;
  $("heightFT").value = state.heightFT;
  $("custName").value = state.custName;
  $("custAddr").value = state.custAddr;
  $("custNotes").value = state.custNotes;
}

function setAdminUI(){
  $("adminPanel").classList.toggle("hidden", !adminUnlocked);
  if (!adminUnlocked) return;

  $("markupEnabled").checked = !!state.markupEnabled;
  $("tariffEnabled").checked = !!state.tariffEnabled;
  $("tariffPct").value = String(state.tariffPct ?? 0);
  $("overrideMarkupPct").value = String(state.overrideMarkupPct ?? "");
}

function bindAdmin(){
  let pressTimer = null;
  const logo = $("companyLogo");

  const start = ()=>{
    pressTimer = setTimeout(()=>{
      const pin = prompt("Enter admin PIN");
      if (pin === ADMIN_PIN){
        adminUnlocked = true;
        sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
        setAdminUI();
        $("adminStatus").textContent = "Admin unlocked.";
      } else {
        alert("Wrong PIN");
      }
    }, 900);
  };
  const cancel = ()=>{
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  // iPhone friendly
  logo.addEventListener("touchstart", start, { passive:true });
  logo.addEventListener("touchend", cancel);
  logo.addEventListener("touchmove", cancel);
  // desktop fallback
  logo.addEventListener("mousedown", start);
  logo.addEventListener("mouseup", cancel);
  logo.addEventListener("mouseleave", cancel);

  $("adminSave").addEventListener("click", ()=>{
    if (!adminUnlocked) return;

    state.markupEnabled = !!$("markupEnabled").checked;
    state.tariffEnabled = !!$("tariffEnabled").checked;
    state.tariffPct = Number(toNum($("tariffPct").value)) || 0;
    state.overrideMarkupPct = $("overrideMarkupPct").value;

    saveState();
    computeAndRenderQuote();
    $("adminStatus").textContent = "Saved. Quote updated.";
  });

  $("adminLock").addEventListener("click", ()=>{
    adminUnlocked = false;
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    $("adminStatus").textContent = "Locked.";
    setAdminUI();
  });
}

async function boot(){
  loadState();

  // fetch JSON from same folder (GitHub Pages friendly)
  const res = await fetch(`data.json?v=${Date.now()}`, { cache:"no-store" });
  if (!res.ok) {
    alert("Cannot load data.json. Make sure it is in the repo root with index.html/app.js/styles.css.");
    return;
  }
  DATA = await res.json();

  setCompany();
  bindTabs();
  renderLists();
  renderRates();
  bindInputs();
  bindAdmin();
  applyStateToUI();
  setAdminUI();
  computeAndRenderQuote();
}

document.addEventListener("DOMContentLoaded", boot);
