let DEFAULTS = null;
let STATE = null;

const $ = (id) => document.getElementById(id);
const money = (n) => "$" + (Number(n || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 });
const money2 = (n) => "$" + (Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LS_KEY = "nj_basement_quote_state_v1";

function deepClone(x){ return JSON.parse(JSON.stringify(x)); }

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if(!raw) return deepClone(DEFAULTS);
  try{
    const s = JSON.parse(raw);
    // basic merge safety
    return { ...deepClone(DEFAULTS), ...s, settings:{...DEFAULTS.settings, ...(s.settings||{})} };
  }catch{
    return deepClone(DEFAULTS);
  }
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(STATE));
}

function rateByName(name){
  return STATE.rates.find(r => r.name === name);
}

function num(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcGeometry(){
  const floor_sf_input = num($("in_floor_sf").value);
  const len = num($("in_len").value);
  const wid = num($("in_wid").value);
  const perim_input = num($("in_perim").value);
  const ht = Math.max(0, num($("in_ceiling_ht").value));

  // Excel logic:
  // Floor SF = IF(L and W, L*W, BasementFloorSF)
  const floor_sf = (len > 0 && wid > 0) ? (len * wid) : floor_sf_input;

  // Perimeter = IF(L and W, 2*(L+W), IF(perimeter entered, that, 4*SQRT(BasementFloorSF)))
  const perim = (len > 0 && wid > 0)
    ? (2 * (len + wid))
    : (perim_input > 0 ? perim_input : (floor_sf_input > 0 ? 4 * Math.sqrt(floor_sf_input) : 0));

  const wall_sf = perim * ht;
  const paint_sf = wall_sf + floor_sf;
  const base_lf = perim;

  // Door totals come from inputs (we read current UI values)
  const d_hollow = num($("door_hollow").value);
  const d_solid  = num($("door_solid").value);
  const d_closet = num($("door_closet").value);
  const doors_total = d_hollow + d_solid + d_closet;

  const casing_lf = doors_total * 14;
  const shoe_lf = base_lf;

  return { floor_sf, perim, wall_sf, paint_sf, base_lf, doors_total, casing_lf, shoe_lf, ht };
}

function setKPIs(g){
  $("k_floor_sf").textContent = g.floor_sf.toFixed(2);
  $("k_perim").textContent = g.perim.toFixed(2);
  $("k_wall_sf").textContent = g.wall_sf.toFixed(2);
  $("k_paint_sf").textContent = g.paint_sf.toFixed(2);
  $("k_base_lf").textContent = g.base_lf.toFixed(2);
  $("k_doors_total").textContent = g.doors_total.toFixed(0);
  $("k_casing_lf").textContent = g.casing_lf.toFixed(2);
  $("k_shoe_lf").textContent = g.shoe_lf.toFixed(2);
}

function tabSwitch(tab){
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "tab-" + tab));
}

function renderInputLists(){
  // Scope (Yes/No)
  const scope = [
    { key:"scope_framing", label:"Framing (walls)", rate:"Framing (walls)" , unitKey:"WALL_SF" },
    { key:"scope_elec", label:"Electrical (whole basement)", rate:"Electrical (whole basement)", unitKey:"FLOOR_SF" },
    { key:"scope_subpanel", label:"Subpanel 100A (add-on)", rate:"Subpanel 100A (add-on)", unitKey:"EACH", fixedUnits:1 },
    { key:"scope_insul", label:"Insulation (walls)", rate:"Insulation (walls)", unitKey:"WALL_SF" },
    { key:"scope_dryhang", label:"Drywall Hang (walls+ceiling)", rate:"Drywall Hang (walls+ceiling)", unitKey:"PAINT_SF" },
    { key:"scope_dryfinish", label:"Drywall Finish/Taping (walls+ceiling)", rate:"Drywall Finish/Taping (walls+ceiling)", unitKey:"PAINT_SF" },
    { key:"scope_paint", label:"Painting (walls+ceiling)", rate:"Painting (walls+ceiling)", unitKey:"PAINT_SF" },
    { key:"scope_floor", label:"Flooring (entire floor)", rate:"Flooring (entire floor)", unitKey:"FLOOR_SF" },
    { key:"scope_base", label:"Base Molding (LF)", rate:"Base Molding (LF)", unitKey:"LF" }
  ];

  const scopeHtml = scope.map(s => `
    <div class="row">
      <input class="cb" type="checkbox" id="${s.key}" ${STATE.ui[s.key] ? "checked":""}>
      <label class="rowLabel" for="${s.key}">${s.label}</label>
      <div class="unit">${s.unitKey}</div>
    </div>
  `).join("");
  $("scopeList").innerHTML = scopeHtml;

  // Fixtures (qty)
  const fixtures = [
    { key:"fx_toilet", label:"Bathroom: Toilet", rate:"Plumbing: Toilet (each)" },
    { key:"fx_vanity", label:"Bathroom: Vanity + Faucet", rate:"Plumbing: Vanity + Faucet (each)" },
    { key:"fx_shower", label:"Bathroom: Shower package", rate:"Plumbing: Shower package (each)" },
    { key:"fx_ksink", label:"Kitchenette: Sink + Faucet", rate:"Plumbing: Kitchen sink + faucet (each)" },
    { key:"fx_dw", label:"Kitchenette: Dishwasher", rate:"Plumbing: Dishwasher (each)" },
    { key:"fx_ice", label:"Kitchenette: Fridge ice-maker", rate:"Plumbing: Ice maker line (each)" },
    { key:"fx_bar", label:"Wet Bar: Bar sink + faucet", rate:"Plumbing: Bar sink + faucet (each)" },
    { key:"fx_upflush", label:"Upflush / Ejector Pump System", rate:"Upflush / Ejector system (each)" }
  ];

  $("fixtureList").innerHTML = fixtures.map(f => `
    <div class="row qty">
      <div class="rowLabel">${f.label}</div>
      <input id="${f.key}" type="number" inputmode="numeric" value="${STATE.ui[f.key] ?? 0}">
      <div class="unit">${(rateByName(f.rate)?.unit || "EACH")} @ ${money2((rateByName(f.rate)?.material||0)+(rateByName(f.rate)?.labor||0))} cost/ea</div>
    </div>
  `).join("");

  // Doors (qty)
  const doors = [
    { key:"door_hollow", label:"Interior Door — Hollow Core", rate:"Door: Interior Hollow Core (each)" },
    { key:"door_solid", label:"Interior Door — Solid Core", rate:"Door: Interior Solid Core (each)" },
    { key:"door_closet", label:"Closet Door — Bifold/Slider", rate:"Door: Closet (each)" }
  ];
  $("doorList").innerHTML = doors.map(d => `
    <div class="row qty">
      <div class="rowLabel">${d.label}</div>
      <input id="${d.key}" type="number" inputmode="numeric" value="${STATE.ui[d.key] ?? 0}">
      <div class="unit">EACH</div>
    </div>
  `).join("");

  // Add-ons (Yes/No)
  const addOns = [
    { key:"add_drysup", label:"Drywall Supplies", rate:"Drywall Supplies (PAINT_SF)", unitKey:"PAINT_SF" },
    { key:"add_paintsup", label:"Paint Supplies", rate:"Paint Supplies (PAINT_SF)", unitKey:"PAINT_SF" },
    { key:"add_elecsup", label:"Electrical Supplies", rate:"Electrical Supplies (FLOOR_SF)", unitKey:"FLOOR_SF" },
    { key:"add_plumbsupply", label:"Plumbing Supplies Allowance", rate:"Plumbing Supplies Allowance (each fixture)", unitKey:"EACH_FIXTURE" },
    { key:"add_doorhard", label:"Door Hardware Allowance", rate:"Door Hardware Allowance (each)", unitKey:"EACH_DOOR" },
    { key:"add_shoe", label:"Shoe Molding", rate:"Shoe Molding (LF)", unitKey:"LF_AUTO" },
    { key:"add_casing", label:"Door Casing", rate:"Door Casing (LF)", unitKey:"LF_AUTO" }
  ];
  $("addOnList").innerHTML = addOns.map(a => `
    <div class="row">
      <input class="cb" type="checkbox" id="${a.key}" ${STATE.ui[a.key] ? "checked":""}>
      <label class="rowLabel" for="${a.key}">${a.label}</label>
      <div class="unit">${a.unitKey}</div>
    </div>
  `).join("");

  // hook changes
  document.querySelectorAll("#tab-input input[type='checkbox']").forEach(cb=>{
    cb.addEventListener("change", ()=>{
      STATE.ui[cb.id] = cb.checked;
      saveState();
    });
  });

  document.querySelectorAll("#tab-input input[type='number']").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      STATE.ui[inp.id] = inp.value;
      const g = calcGeometry();
      setKPIs(g);
      saveState();
    });
  });
}

function renderRates(){
  const body = $("ratesBody");
  body.innerHTML = STATE.rates
    .filter(r => r.unit !== "PCT_MAT")
    .map((r, idx) => `
      <tr>
        <td>${r.name}</td>
        <td>${r.unit}</td>
        <td><input data-rate="${idx}" data-field="material" type="number" step="0.01" value="${r.material}"></td>
        <td><input data-rate="${idx}" data-field="labor" type="number" step="0.01" value="${r.labor}"></td>
      </tr>
    `).join("");

  body.querySelectorAll("input").forEach(i=>{
    i.addEventListener("input", ()=>{
      const idx = Number(i.dataset.rate);
      const field = i.dataset.field;
      STATE.rates[idx][field] = num(i.value);
      saveState();
    });
  });
}

function calcLine(itemName, unit, units){
  const r = rateByName(itemName);
  if(!r) return null;

  const matRaw = units * num(r.material);
  const labRaw = units * num(r.labor);

  const matSell = matRaw * (1 + num(STATE.settings.materials_markup));
  const labSell = labRaw * (1 + num(STATE.settings.labor_markup));

  return {
    item: itemName,
    unit,
    units,
    matSell,
    labSell,
    sell: matSell + labSell,
    matRaw,
    labRaw
  };
}

function calcQuote(){
  const g = calcGeometry();
  setKPIs(g);

  // Read toggles + qty from UI
  const on = (id) => !!$(id)?.checked;

  const qty = (id) => num($(id)?.value);

  // fixtures total for supplies allowance
  const fxTotal =
    qty("fx_toilet") + qty("fx_vanity") + qty("fx_shower") + qty("fx_ksink") +
    qty("fx_dw") + qty("fx_ice") + qty("fx_bar") + qty("fx_upflush");

  const doorsTotal = qty("door_hollow") + qty("door_solid") + qty("door_closet");

  // Build lines in the same order as Excel QUOTE
  const lines = [];

  // Scope toggles
  if(on("scope_framing")) lines.push(calcLine("Framing (walls)", "WALL_SF", g.wall_sf));
  if(on("scope_elec")) lines.push(calcLine("Electrical (whole basement)", "FLOOR_SF", g.floor_sf));
  if(on("scope_subpanel")) lines.push(calcLine("Subpanel 100A (add-on)", "EACH", 1));
  if(on("scope_insul")) lines.push(calcLine("Insulation (walls)", "WALL_SF", g.wall_sf));
  if(on("scope_dryhang")) lines.push(calcLine("Drywall Hang (walls+ceiling)", "PAINT_SF", g.paint_sf));
  if(on("scope_dryfinish")) lines.push(calcLine("Drywall Finish/Taping (walls+ceiling)", "PAINT_SF", g.paint_sf));
  if(on("scope_paint")) lines.push(calcLine("Painting (walls+ceiling)", "PAINT_SF", g.paint_sf));
  if(on("scope_floor")) lines.push(calcLine("Flooring (entire floor)", "FLOOR_SF", g.floor_sf));
  if(on("scope_base")) lines.push(calcLine("Base Molding (LF)", "LF", g.base_lf));

  // Add-on supplies
  if(on("add_drysup")) lines.push(calcLine("Drywall Supplies (PAINT_SF)", "PAINT_SF", g.paint_sf));
  if(on("add_paintsup")) lines.push(calcLine("Paint Supplies (PAINT_SF)", "PAINT_SF", g.paint_sf));
  if(on("add_elecsup")) lines.push(calcLine("Electrical Supplies (FLOOR_SF)", "FLOOR_SF", g.floor_sf));

  // Plumbing supplies allowance (per fixture)
  if(on("add_plumbsupply")) lines.push(calcLine("Plumbing Supplies Allowance (each fixture)", "EACH", fxTotal));

  // Plumbing fixtures (each)
  if(qty("fx_toilet")>0) lines.push(calcLine("Plumbing: Toilet (each)", "EACH", qty("fx_toilet")));
  if(qty("fx_vanity")>0) lines.push(calcLine("Plumbing: Vanity + Faucet (each)", "EACH", qty("fx_vanity")));
  if(qty("fx_shower")>0) lines.push(calcLine("Plumbing: Shower package (each)", "EACH", qty("fx_shower")));
  if(qty("fx_ksink")>0) lines.push(calcLine("Plumbing: Kitchen sink + faucet (each)", "EACH", qty("fx_ksink")));
  if(qty("fx_dw")>0) lines.push(calcLine("Plumbing: Dishwasher (each)", "EACH", qty("fx_dw")));
  if(qty("fx_ice")>0) lines.push(calcLine("Plumbing: Ice maker line (each)", "EACH", qty("fx_ice")));
  if(qty("fx_bar")>0) lines.push(calcLine("Plumbing: Bar sink + faucet (each)", "EACH", qty("fx_bar")));
  if(qty("fx_upflush")>0) lines.push(calcLine("Upflush / Ejector system (each)", "EACH", qty("fx_upflush")));

  // Doors add-ons + doors
  if(on("add_doorhard")) lines.push(calcLine("Door Hardware Allowance (each)", "EACH", doorsTotal));
  if(on("add_casing")) lines.push(calcLine("Door Casing (LF)", "LF", g.casing_lf));
  if(on("add_shoe")) lines.push(calcLine("Shoe Molding (LF)", "LF", g.shoe_lf));

  if(qty("door_hollow")>0) lines.push(calcLine("Door: Interior Hollow Core (each)", "EACH", qty("door_hollow")));
  if(qty("door_solid")>0) lines.push(calcLine("Door: Interior Solid Core (each)", "EACH", qty("door_solid")));
  if(qty("door_closet")>0) lines.push(calcLine("Door: Closet (each)", "EACH", qty("door_closet")));

  // Remove nulls
  const clean = lines.filter(Boolean);

  // Consumables = 5% of RAW MATERIAL subtotal (before markup), like Excel
  const rawMatSubtotal = clean.reduce((a,l)=>a + (l.matRaw||0), 0);
  const consumPct = 0.05;
  const consumMatRaw = rawMatSubtotal * consumPct;
  const consumMatSell = consumMatRaw * (1 + num(STATE.settings.materials_markup));
  clean.push({
    item: "Job Consumables & Fasteners (% of raw materials)",
    unit: "PCT_MAT",
    units: consumPct,
    matSell: consumMatSell,
    labSell: 0,
    sell: consumMatSell,
    matRaw: consumMatRaw,
    labRaw: 0
  });

  // Render quote table
  const body = $("quoteBody");
  body.innerHTML = clean.map(l => `
    <tr>
      <td>${l.item}</td>
      <td>${l.unit}</td>
      <td>${(l.unit==="PCT_MAT") ? (l.units*100).toFixed(1)+"%" : l.units.toFixed(2)}</td>
      <td>${money2(l.matSell)}</td>
      <td>${money2(l.labSell)}</td>
      <td class="strong">${money2(l.sell)}</td>
    </tr>
  `).join("");

  const grand = clean.reduce((a,l)=>a + (l.sell||0), 0);
  $("grandTotal").textContent = money2(grand);

  $("quoteMeta").innerHTML = `
    Floor SF: <b>${g.floor_sf.toFixed(2)}</b> •
    Perimeter LF: <b>${g.perim.toFixed(2)}</b> •
    Wall SF: <b>${g.wall_sf.toFixed(2)}</b> •
    Paint SF: <b>${g.paint_sf.toFixed(2)}</b> •
    Materials MU: <b>${(STATE.settings.materials_markup*100).toFixed(0)}%</b> •
    Labor MU: <b>${(STATE.settings.labor_markup*100).toFixed(0)}%</b>
  `;

  tabSwitch("quote");
}

function initTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=> tabSwitch(btn.dataset.tab));
  });
}

function initSettings(){
  $("set_mat_mu").value = STATE.settings.materials_markup;
  $("set_lab_mu").value = STATE.settings.labor_markup;
  $("set_lab_hr").value = STATE.settings.labor_base_rate;

  $("btn_save_settings").addEventListener("click", ()=>{
    STATE.settings.materials_markup = num($("set_mat_mu").value);
    STATE.settings.labor_markup = num($("set_lab_mu").value);
    STATE.settings.labor_base_rate = num($("set_lab_hr").value);
    saveState();
    alert("Settings saved.");
  });

  $("btn_reset_all").addEventListener("click", ()=>{
    STATE = deepClone(DEFAULTS);
    saveState();
    location.reload();
  });

  $("btn_export").addEventListener("click", ()=>{
    $("jsonBox").value = JSON.stringify(STATE, null, 2);
  });

  $("btn_import").addEventListener("click", ()=>{
    try{
      const incoming = JSON.parse($("jsonBox").value);
      STATE = { ...deepClone(DEFAULTS), ...incoming, settings:{...DEFAULTS.settings, ...(incoming.settings||{})} };
      saveState();
      location.reload();
    }catch{
      alert("Invalid JSON.");
    }
  });
}

function initButtons(){
  $("btn_calc").addEventListener("click", calcQuote);
  $("btn_to_quote").addEventListener("click", ()=>{ calcQuote(); });

  $("btn_print").addEventListener("click", ()=> window.print());

  $("btn_save_rates").addEventListener("click", ()=>{
    saveState();
    alert("Rates saved.");
  });

  $("btn_reset_rates").addEventListener("click", ()=>{
    STATE.rates = deepClone(DEFAULTS.rates);
    saveState();
    renderRates();
    alert("Rates reset to spreadsheet defaults.");
  });
}

async function boot(){
  const res = await fetch("data.json", { cache:"no-store" });
  DEFAULTS = await res.json();

  // add UI defaults (toggles/qty) similar to your spreadsheet starting point
  if(!DEFAULTS.ui){
    DEFAULTS.ui = {
      // geometry inputs
      in_floor_sf: DEFAULTS.inputs.basement_floor_sf,
      in_len: "",
      in_wid: "",
      in_perim: "",
      in_ceiling_ht: DEFAULTS.inputs.ceiling_height_ft,

      // scope toggles (default Yes)
      scope_framing:true, scope_elec:true, scope_subpanel:true, scope_insul:true,
      scope_dryhang:true, scope_dryfinish:true, scope_paint:true, scope_floor:true, scope_base:true,

      // fixtures default (like your INPUT example)
      fx_toilet:1, fx_vanity:1, fx_shower:1, fx_ksink:1, fx_dw:1, fx_ice:0, fx_bar:0, fx_upflush:1,

      // doors default (like your INPUT example)
      door_hollow:9, door_solid:1, door_closet:6,

      // add-ons default Yes (recommended)
      add_drysup:true, add_paintsup:true, add_elecsup:true, add_plumbsupply:true,
      add_doorhard:true, add_shoe:true, add_casing:true
    };
  }

  STATE = loadState();
  if(!STATE.ui) STATE.ui = deepClone(DEFAULTS.ui);

  // hydrate geometry inputs
  $("in_floor_sf").value = STATE.ui.in_floor_sf ?? DEFAULTS.ui.in_floor_sf;
  $("in_len").value = STATE.ui.in_len ?? "";
  $("in_wid").value = STATE.ui.in_wid ?? "";
  $("in_perim").value = STATE.ui.in_perim ?? "";
  $("in_ceiling_ht").value = STATE.ui.in_ceiling_ht ?? DEFAULTS.ui.in_ceiling_ht;

  // when geometry inputs change, store
  ["in_floor_sf","in_len","in_wid","in_perim","in_ceiling_ht"].forEach(id=>{
    $(id).addEventListener("input", ()=>{
      STATE.ui[id] = $(id).value;
      const g = calcGeometry();
      setKPIs(g);
      saveState();
    });
  });

  // initial door qty values must exist before KPI calc
  // render lists first (so door inputs exist), then compute KPIs
  initTabs();
  renderInputLists();
  const g = calcGeometry();
  setKPIs(g);

  renderRates();
  initButtons();
  initSettings();

  saveState(); // ensure structure saved
}

boot().catch(()=> alert("App failed to load data.json"));
