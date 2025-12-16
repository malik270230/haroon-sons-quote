/* Haroon & Sons Consulting Quote - FINAL REBUILD
   Fixes:
   - Plumbing Supplies Allowance (each fixture) auto-qty works
   - Job Consumables & Fasteners (% of raw materials) calculates correctly
   - Rates page shows % items correctly
   - Markup is BY SQFT TIERS ONLY (no 25/35 baked into items)
   - Hidden admin: Markup ON/OFF, Markup Override %, Tariff ON/OFF, Tariff %
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_KEY = "haroon_sons_quote_v3_state";
const ADMIN_PIN = "0718"; // change if you want

let DATA = null;

function defaultState() {
  return {
    inputs: { floorSF:"", ceilFt:"8", lenFt:"", widFt:"", perimLF:"" },
    enabled: {},   // {itemId: boolean}
    qty: {},       // {itemId: number/string} for EACH items
    admin: {
      unlocked: false,
      markupEnabled: true,
      markupOverridePct: "",
      tariffEnabled: false,
      tariffPct: ""
    }
  };
}

let STATE = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultState();
    const obj = JSON.parse(raw);
    const d = defaultState();
    return {
      inputs: { ...d.inputs, ...(obj.inputs||{}) },
      enabled: { ...(obj.enabled||{}) },
      qty: { ...(obj.qty||{}) },
      admin: { ...d.admin, ...(obj.admin||{}) }
    };
  }catch{
    return defaultState();
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(STATE));
}

function safeNum(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n){
  const x = safeNum(n);
  return x.toLocaleString(undefined,{style:"currency",currency:"USD"});
}
function num(n,d=2){
  const x = safeNum(n);
  return x.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
}

/* ------------------ Markup / Tariff ------------------ */
function tierMarkupPct(floorSF){
  const tiers = (DATA?.settings?.markup_tiers || []).slice().sort((a,b)=>a.max_sf-b.max_sf);
  if(!tiers.length) return 0;
  for(const t of tiers){
    if(floorSF <= t.max_sf) return safeNum(t.pct);
  }
  return safeNum(tiers[tiers.length-1].pct);
}
function effectiveMarkupPct(floorSF){
  if(!STATE.admin.markupEnabled) return 0;
  const o = String(STATE.admin.markupOverridePct||"").trim();
  if(o !== "") return safeNum(o)/100;
  return tierMarkupPct(floorSF);
}
function effectiveTariffPct(){
  if(!STATE.admin.tariffEnabled) return 0;
  const t = String(STATE.admin.tariffPct||"").trim();
  if(t === "") return 0;
  return safeNum(t)/100;
}

/* ------------------ Geometry ------------------ */
function calcGeometry(){
  const floorSF = safeNum($("#inFloorSF").value);
  const ceilFt  = Math.max(0, safeNum($("#inCeilFt").value) || 8);
  const lenFt   = safeNum($("#inLenFt").value);
  const widFt   = safeNum($("#inWidFt").value);
  const perOv   = safeNum($("#inPerimLF").value);

  let perimLF = 0;
  if(perOv>0) perimLF = perOv;
  else if(lenFt>0 && widFt>0) perimLF = 2*(lenFt+widFt);
  else if(floorSF>0){
    const side = Math.sqrt(floorSF);
    perimLF = 4*side; // square assumption if only SF known
  }

  const wallSF  = perimLF * ceilFt;
  const paintSF = wallSF + floorSF; // walls + ceiling

  return {floorSF,ceilFt,lenFt,widFt,perimLF,wallSF,paintSF};
}
function baseQtyForUnit(unit, geo){
  switch(unit){
    case "FLOOR_SF": return geo.floorSF;
    case "WALL_SF":  return geo.wallSF;
    case "PAINT_SF": return geo.paintSF;
    case "LF":       return geo.perimLF;
    case "EACH":     return 0;      // per-item
    case "PCT_MAT":  return 1;      // computed later
    default: return 0;
  }
}

/* ------------------ Enable / Qty ------------------ */
function isEnabled(item){
  if(STATE.enabled[item.id] === undefined) return !!item.default_on;
  return !!STATE.enabled[item.id];
}
function getEachQty(item){
  const v = STATE.qty[item.id];
  if(v === undefined || v === null || v === ""){
    return safeNum(item.default_qty ?? 0);
  }
  return safeNum(v);
}

/* ------------------ UI: Tabs ------------------ */
function setTab(name){
  $$(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===name));
  $$(".panel").forEach(p=>p.classList.toggle("active", p.id===`tab-${name}`));
}

/* ------------------ UI: Scope list ------------------ */
function renderScopeList(){
  const wrap = $("#scopeList");
  wrap.innerHTML = "";

  const items = DATA.items.slice();
  const groups = {};
  for(const it of items){
    const cat = it.category || "Other";
    (groups[cat] ||= []).push(it);
  }
  const preferred = ["Scope","Fixtures","Doors","Add-ons","Other"];
  const cats = Array.from(new Set([...preferred, ...Object.keys(groups)])).filter(c=>groups[c]?.length);

  for(const cat of cats){
    const head = document.createElement("div");
    head.className = "hint";
    head.style.marginTop = "6px";
    head.style.fontWeight = "900";
    head.textContent = cat.toUpperCase();
    wrap.appendChild(head);

    for(const it of groups[cat]){
      const row = document.createElement("label");
      row.className = "chk";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isEnabled(it);
      cb.addEventListener("change", ()=>{
        STATE.enabled[it.id] = cb.checked;
        saveState();
        recalcAndRender();
      });

      const meta = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = it.label;

      const small = document.createElement("small");
      if(it.unit === "PCT_MAT"){
        small.textContent = `${it.unit} • material ${Math.round(it.material_rate*100)}%`;
      }else{
        small.textContent = `${it.unit} • material ${num(it.material_rate)} • labor ${num(it.labor_rate)}`;
      }

      meta.appendChild(title);
      meta.appendChild(small);

      row.appendChild(cb);
      row.appendChild(meta);

      // qty input for EACH items except plumbing supplies (auto)
      if(it.unit==="EACH" && it.id!=="plumbing_supplies_allowance_each_fixture"){
        const qty = document.createElement("input");
        qty.type="number";
        qty.inputMode="decimal";
        qty.min="0";
        qty.step="1";
        qty.value = String(getEachQty(it));
        qty.style.marginLeft="auto";
        qty.style.width="92px";
        qty.style.borderRadius="12px";
        qty.style.border="1px solid var(--line)";
        qty.style.background="rgba(0,0,0,.18)";
        qty.style.color="var(--text)";
        qty.style.padding="10px 10px";
        qty.addEventListener("change", ()=>{
          STATE.qty[it.id] = qty.value;
          saveState();
          recalcAndRender();
        });
        row.appendChild(qty);
      }

      wrap.appendChild(row);
    }
  }
}

/* ------------------ UI: Rates table ------------------ */
function renderRates(){
  const body = $("#ratesBody");
  body.innerHTML = "";

  for(const it of DATA.items){
    const tr = document.createElement("tr");

    const tdL = document.createElement("td");
    tdL.className="left";
    tdL.textContent = it.label;

    const tdU = document.createElement("td");
    tdU.textContent = it.unit;

    const tdM = document.createElement("td");
    const tdB = document.createElement("td");

    if(it.unit==="PCT_MAT"){
      tdM.textContent = `${Math.round(it.material_rate*100)}%`;
      tdB.textContent = "—";
    }else{
      tdM.textContent = money(it.material_rate);
      tdB.textContent = money(it.labor_rate);
    }

    tr.appendChild(tdL);
    tr.appendChild(tdU);
    tr.appendChild(tdM);
    tr.appendChild(tdB);
    body.appendChild(tr);
  }
}

/* ------------------ Quote engine ------------------ */
function computeQuote(){
  const geo = calcGeometry();

  // show calculated geometry
  $("#outPerimLF").textContent = geo.perimLF>0 ? num(geo.perimLF,2) : "—";
  $("#outWallSF").textContent  = geo.wallSF>0 ? num(geo.wallSF,2) : "—";
  $("#outPaintSF").textContent = geo.paintSF>0 ? num(geo.paintSF,2) : "—";

  // build lines
  const lines = DATA.items.map(it=>{
    let qty = (it.unit==="EACH") ? getEachQty(it) : baseQtyForUnit(it.unit, geo);

    // special autos start at 0 then filled after
    if(it.id==="plumbing_supplies_allowance_each_fixture") qty = 0;
    if(it.id==="job_consumables_fasteners_of_raw_materials") qty = 0;

    return {
      it,
      enabled: isEnabled(it),
      qty,
      material: 0,
      labor: 0,
      total: 0
    };
  });

  // --- Auto #1: plumbing supplies qty = total selected fixture qty ---
  const fixtureIds = new Set(
    DATA.items.filter(x => (x.category||"")==="Fixtures").map(x=>x.id)
  );

  const fixtureQtySum = lines
    .filter(l => l.enabled && fixtureIds.has(l.it.id))
    .reduce((sum,l)=> sum + (l.it.unit==="EACH" ? safeNum(l.qty) : 0), 0);

  const plumbingSup = lines.find(l=>l.it.id==="plumbing_supplies_allowance_each_fixture");
  if(plumbingSup){
    plumbingSup.qty = fixtureQtySum; // KEY FIX
  }

  // first pass: compute all enabled NON-PCT items
  for(const l of lines){
    if(!l.enabled) continue;
    if(l.it.unit==="PCT_MAT") continue;

    l.material = safeNum(l.it.material_rate) * safeNum(l.qty);
    l.labor    = safeNum(l.it.labor_rate) * safeNum(l.qty);
    l.total    = l.material + l.labor;
  }

  // --- Auto #2: consumables = % of RAW MATERIALS subtotal (excluding itself) ---
  const cons = lines.find(l=>l.it.id==="job_consumables_fasteners_of_raw_materials");
  if(cons && cons.enabled){
    const rawMaterialsBase = lines
      .filter(l => l.enabled && l.it.unit!=="PCT_MAT" && l.it.id!=="job_consumables_fasteners_of_raw_materials")
      .reduce((sum,l)=> sum + safeNum(l.material), 0);

    const pct = safeNum(cons.it.material_rate); // e.g. 0.05
    cons.qty = 1;
    cons.material = rawMaterialsBase * pct;
    cons.labor = 0;
    cons.total = cons.material;
  }

  const rawSubtotal = lines.filter(l=>l.enabled).reduce((s,l)=>s+safeNum(l.total),0);

  const tierPct = tierMarkupPct(geo.floorSF);
  const markupPct = effectiveMarkupPct(geo.floorSF);
  const tariffPct = effectiveTariffPct();

  const markupAmount = rawSubtotal * markupPct;
  const afterMarkup = rawSubtotal + markupAmount;
  const tariffAmount = afterMarkup * tariffPct;
  const grandTotal = afterMarkup + tariffAmount;

  // banner + pills
  if(geo.floorSF>0){
    $("#markupBanner").textContent = `Markup tier: ${Math.round(tierPct*100)}% (by sqft)`;
  }else{
    $("#markupBanner").textContent = `Markup tier: —`;
  }

  $("#rawSubtotal").textContent = money(rawSubtotal);
  $("#markupApplied").textContent = markupPct>0 ? `${Math.round(markupPct*100)}%` : "OFF";
  $("#tariffApplied").textContent = tariffPct>0 ? `${Math.round(tariffPct*100)}%` : "OFF";
  $("#grandTotal").textContent = money(grandTotal);

  return { geo, lines, rawSubtotal, grandTotal };
}

function renderQuoteTable(result){
  const tbody = $("#quoteBody");
  tbody.innerHTML = "";

  const visible = result.lines.filter(l=>l.enabled);

  for(const l of visible){
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    tdItem.className="left";
    tdItem.textContent = l.it.label;

    const tdUnit = document.createElement("td");
    tdUnit.textContent = l.it.unit;

    const tdQty = document.createElement("td");
    tdQty.textContent = (l.it.unit==="PCT_MAT") ? "—" : num(l.qty, l.it.unit==="EACH"?0:2);

    const tdM = document.createElement("td");
    tdM.textContent = money(l.material);

    const tdL = document.createElement("td");
    tdL.textContent = money(l.labor);

    const tdT = document.createElement("td");
    tdT.style.fontWeight="900";
    tdT.textContent = money(l.total);

    tr.appendChild(tdItem);
    tr.appendChild(tdUnit);
    tr.appendChild(tdQty);
    tr.appendChild(tdM);
    tr.appendChild(tdL);
    tr.appendChild(tdT);

    tbody.appendChild(tr);
  }
}

/* ------------------ Admin (hidden) ------------------ */
function applyAdminUI(){
  const unlocked = !!STATE.admin.unlocked;
  $("#adminPanel").classList.toggle("hidden", !unlocked);

  $("#adminMarkupEnabled").value = STATE.admin.markupEnabled ? "1":"0";
  $("#adminMarkupOverride").value = STATE.admin.markupOverridePct ?? "";
  $("#adminTariffEnabled").value = STATE.admin.tariffEnabled ? "1":"0";
  $("#adminTariffPct").value = STATE.admin.tariffPct ?? "";
}

function bindAdmin(){
  const logo = $("#companyLogo");
  let timer = null;

  const start = ()=>{
    timer = setTimeout(()=>{
      const pin = prompt("Enter admin PIN");
      if(pin === ADMIN_PIN){
        STATE.admin.unlocked = true;
        saveState();
        applyAdminUI();
        $("#adminStateMsg").textContent = "Admin unlocked.";
      }else{
        $("#adminStateMsg").textContent = "Wrong PIN.";
      }
    }, 1200);
  };
  const cancel = ()=>{
    if(timer) clearTimeout(timer);
    timer = null;
  };

  // touch + mouse
  logo.addEventListener("touchstart", start, {passive:true});
  logo.addEventListener("touchend", cancel);
  logo.addEventListener("touchcancel", cancel);
  logo.addEventListener("mousedown", start);
  logo.addEventListener("mouseup", cancel);
  logo.addEventListener("mouseleave", cancel);

  $("#adminApplyBtn").addEventListener("click", ()=>{
    STATE.admin.markupEnabled = $("#adminMarkupEnabled").value==="1";
    STATE.admin.markupOverridePct = $("#adminMarkupOverride").value;
    STATE.admin.tariffEnabled = $("#adminTariffEnabled").value==="1";
    STATE.admin.tariffPct = $("#adminTariffPct").value;
    saveState();
    $("#adminStateMsg").textContent = "Admin settings applied.";
    recalcAndRender();
  });

  $("#adminResetBtn").addEventListener("click", ()=>{
    STATE.admin = defaultState().admin;
    saveState();
    applyAdminUI();
    $("#adminStateMsg").textContent = "Admin reset.";
    recalcAndRender();
  });
}

/* ------------------ Bindings ------------------ */
function bindTabs(){
  $$(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>setTab(btn.dataset.tab));
  });
}
function bindInputs(){
  ["#inFloorSF","#inCeilFt","#inLenFt","#inWidFt","#inPerimLF"].forEach(sel=>{
    $(sel).addEventListener("input", ()=>{
      // persist inputs
      STATE.inputs.floorSF = $("#inFloorSF").value;
      STATE.inputs.ceilFt  = $("#inCeilFt").value;
      STATE.inputs.lenFt   = $("#inLenFt").value;
      STATE.inputs.widFt   = $("#inWidFt").value;
      STATE.inputs.perimLF = $("#inPerimLF").value;
      saveState();
      recalcAndRender();
    });
  });
}
function bindButtons(){
  $("#printBtn").addEventListener("click", ()=>window.print());

  $("#clearBtn").addEventListener("click", ()=>{
    localStorage.removeItem(LS_KEY);
    STATE = defaultState();
    // reset inputs
    $("#inFloorSF").value="";
    $("#inCeilFt").value="8";
    $("#inLenFt").value="";
    $("#inWidFt").value="";
    $("#inPerimLF").value="";
    applyAdminUI();
    initDefaults();
    renderScopeList();
    renderRates();
    recalcAndRender();
  });
}

function initDefaults(){
  for(const it of DATA.items){
    if(STATE.enabled[it.id] === undefined) STATE.enabled[it.id] = !!it.default_on;
    if(it.unit==="EACH" && STATE.qty[it.id] === undefined){
      STATE.qty[it.id] = (it.default_qty ?? 0);
    }
  }
  saveState();
}

/* ------------------ Data load ------------------ */
async function loadData(){
  const res = await fetch(`data.json?v=${Date.now()}`, {cache:"no-store"});
  if(!res.ok) throw new Error("Cannot load data.json");
  return res.json();
}
function applyCompany(){
  const c = DATA.settings.company;
  $("#companyName").textContent = c.name;
  $("#companyLogo").src = c.logo;
  $("#companyPhone").textContent = `📞 ${c.phone}`;
  $("#companyPhone").href = `tel:${String(c.phone).replace(/[^\d+]/g,"")}`;
  $("#companyEmail").textContent = `✉️ ${c.email}`;
  $("#companyEmail").href = `mailto:${c.email}`;
}

function recalcAndRender(){
  const result = computeQuote();
  renderQuoteTable(result);
}

async function init(){
  DATA = await loadData();
  applyCompany();

  // restore inputs
  $("#inFloorSF").value = STATE.inputs.floorSF;
  $("#inCeilFt").value  = STATE.inputs.ceilFt || "8";
  $("#inLenFt").value   = STATE.inputs.lenFt;
  $("#inWidFt").value   = STATE.inputs.widFt;
  $("#inPerimLF").value = STATE.inputs.perimLF;

  initDefaults();

  bindTabs();
  bindInputs();
  bindButtons();

  applyAdminUI();
  bindAdmin();

  renderScopeList();
  renderRates();
  recalcAndRender();
}

document.addEventListener("DOMContentLoaded", ()=>{
  init().catch(err=>{
    alert(`Error loading app files: ${err.message}`);
    console.error(err);
  });
});
