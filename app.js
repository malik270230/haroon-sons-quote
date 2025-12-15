/* NJ Basement Quote Tool — static web app (GitHub Pages friendly) */

const fmtMoney = (n) => {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
};
const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—");

const el = (id) => document.getElementById(id);

function num(id){
  const v = parseFloat(el(id).value);
  return Number.isFinite(v) ? v : null;
}
function int(id){
  const v = parseInt(el(id).value, 10);
  return Number.isFinite(v) ? v : 0;
}
function checked(id){ return el(id).checked; }

let DATA = null;

async function loadData(){
  const res = await fetch("./data.json");
  DATA = await res.json();
  // initialize markups from data.json
  el("matMu").value = DATA.settings.materials_markup ?? 0.25;
  el("labMu").value = DATA.settings.labor_markup ?? 0.35;
  bindEvents();
  recalc();
}

function geometry(){
  const floorSfInput = num("floorSf") ?? 0;
  const L = num("lenFt");
  const W = num("widFt");
  const perInput = num("perLf");
  const H = num("ceilHt") ?? 0;

  const floorSF = (L && W) ? (L * W) : floorSfInput;

  // perimeter: LxW -> 2*(L+W). Else use user perimeter; else 4*sqrt(area) fallback
  let perimeterLF = 0;
  if (L && W) perimeterLF = 2 * (L + W);
  else if (perInput) perimeterLF = perInput;
  else perimeterLF = 4 * Math.sqrt(Math.max(floorSF, 0));

  const wallSF = perimeterLF * H;
  const paintSF = wallSF + floorSF;
  const baseLF = perimeterLF;

  const doorsTotal = int("dHollow") + int("dSolid") + int("dCloset");
  const casingLF = doorsTotal * 14;
  const shoeLF = baseLF;

  return { floorSF, perimeterLF, wallSF, paintSF, baseLF, doorsTotal, casingLF, shoeLF };
}

function fixtureCounts(){
  return {
    toilet: int("pToilet"),
    vanity: int("pVanity"),
    shower: int("pShower"),
    kitchen: int("pKitchen"),
    dishwasher: int("pDish"),
    ice: int("pIce"),
    bar: int("pBar"),
    upflush: int("pUpflush")
  };
}

function buildLines(){
  const g = geometry();
  const fx = fixtureCounts();

  const matMu = parseFloat(el("matMu").value) || 0;
  const labMu = parseFloat(el("labMu").value) || 0;

  const rates = new Map(DATA.rates.map(r => [r.item, r]));

  // Helper to create a line
  const line = (item, units, unitType, enabled=true) => {
    const rate = rates.get(item);
    if (!rate) return null;
    const u = enabled ? (units ?? 0) : 0;

    let matRaw = 0, labRaw = 0;

    // Special: PCT_MAT is computed later using raw materials subtotal
    if (unitType === "PCT_MAT") {
      matRaw = 0;
      labRaw = 0;
    } else {
      matRaw = (Number(rate.mat_per_unit) || 0) * u;
      labRaw = (Number(rate.lab_per_unit) || 0) * u;
    }

    const mat = matRaw * (1 + matMu);
    const lab = labRaw * (1 + labMu);
    const sell = mat + lab;

    return { type:"line", item, unitType, units:u, matRaw, labRaw, mat, lab, sell, enabled };
  };

  const rows = [];

  rows.push({ type:"section", title:"Core Scope" });
  rows.push(line("Framing (walls)", g.wallSF, "WALL_SF", checked("tFraming")));
  rows.push(line("Electrical (whole basement)", g.floorSF, "FLOOR_SF", checked("tElectrical")));
  rows.push(line("Subpanel 100A (add-on)", 1, "EACH", checked("tSubpanel")));
  rows.push(line("Insulation (walls)", g.wallSF, "WALL_SF", checked("tInsulation")));
  rows.push(line("Drywall Hang (walls+ceiling)", g.paintSF, "PAINT_SF", checked("tDryHang")));
  rows.push(line("Drywall Finish/Taping (walls+ceiling)", g.paintSF, "PAINT_SF", checked("tDryFinish")));
  rows.push(line("Painting (walls+ceiling)", g.paintSF, "PAINT_SF", checked("tPaint")));
  rows.push(line("Flooring (entire floor)", g.floorSF, "FLOOR_SF", checked("tFloor")));
  rows.push(line("Base Molding (LF)", g.baseLF, "LF", checked("tBase")));

  rows.push({ type:"section", title:"Supply Add-ons" });
  rows.push(line("Drywall Supplies (PAINT_SF)", g.paintSF, "PAINT_SF", checked("tDrySup")));
  rows.push(line("Paint Supplies (PAINT_SF)", g.paintSF, "PAINT_SF", checked("tPaintSup")));
  rows.push(line("Electrical Supplies (FLOOR_SF)", g.floorSF, "FLOOR_SF", checked("tElecSup")));

  rows.push({ type:"section", title:"Plumbing (Fixture-based)" });
  const fixtureTotal = fx.toilet + fx.vanity + fx.shower + fx.kitchen + fx.dishwasher + fx.ice + fx.bar + fx.upflush;
  rows.push(line("Plumbing Supplies Allowance (each fixture)", fixtureTotal, "EACH", checked("tPlumbSup")));
  rows.push(line("Plumbing: Toilet (each)", fx.toilet, "EACH", true));
  rows.push(line("Plumbing: Vanity + Faucet (each)", fx.vanity, "EACH", true));
  rows.push(line("Plumbing: Shower package (each)", fx.shower, "EACH", true));
  rows.push(line("Plumbing: Kitchen sink + faucet (each)", fx.kitchen, "EACH", true));
  rows.push(line("Plumbing: Dishwasher (each)", fx.dishwasher, "EACH", true));
  rows.push(line("Plumbing: Ice maker line (each)", fx.ice, "EACH", true));
  rows.push(line("Plumbing: Bar sink + faucet (each)", fx.bar, "EACH", true));
  rows.push(line("Upflush / Ejector system (each)", fx.upflush, "EACH", true));

  rows.push({ type:"section", title:"Doors" });
  rows.push(line("Door: Interior Hollow Core (each)", int("dHollow"), "EACH", true));
  rows.push(line("Door: Interior Solid Core (each)", int("dSolid"), "EACH", true));
  rows.push(line("Door: Closet (each)", int("dCloset"), "EACH", true));
  rows.push(line("Door Hardware Allowance (each)", g.doorsTotal, "EACH", checked("tDoorHardware")));
  rows.push(line("Door Casing (LF)", g.casingLF, "LF", checked("tDoorCasing")));
  rows.push(line("Shoe Molding (LF)", g.shoeLF, "LF", checked("tShoe")));

  // Compute Job Consumables as % of raw materials (materials only)
  const pct = checked("tConsumables") ? 0.05 : 0;
  const matRawSubtotal = rows.filter(r => r && r.type==="line" && r.unitType!=="PCT_MAT").reduce((s,r)=>s + (r.matRaw||0), 0);
  const consumRate = rates.get("Job Consumables & Fasteners (% of raw materials)");
  if (consumRate){
    const matRaw = matRawSubtotal * pct;
    const mat = matRaw * (1 + matMu);
    rows.push({ type:"section", title:"Overhead" });
    rows.push({
      type:"line",
      item:"Job Consumables & Fasteners (% of raw materials)",
      unitType:"PCT_MAT",
      units:pct,
      matRaw,
      labRaw:0,
      mat,
      lab:0,
      sell:mat,
      enabled: pct>0
    });
  }

  return rows.filter(Boolean);
}

function render(rows){
  const tbody = el("quoteBody");
  tbody.innerHTML = "";

  let totMat=0, totLab=0, totSell=0;

  for(const r of rows){
    if(r.type==="section"){
      const tr=document.createElement("tr");
      tr.className="sectionRow";
      const td=document.createElement("td");
      td.colSpan=6;
      td.textContent=r.title;
      tr.appendChild(td);
      tbody.appendChild(tr);
      continue;
    }

    totMat += r.mat || 0;
    totLab += r.lab || 0;
    totSell += r.sell || 0;

    const tr=document.createElement("tr");

    const tdItem=document.createElement("td");
    tdItem.textContent=r.item;
    tr.appendChild(tdItem);

    const tdUnits=document.createElement("td");
    tdUnits.className="right";
    tdUnits.textContent=fmtNum(r.units);
    tr.appendChild(tdUnits);

    const tdUnit=document.createElement("td");
    tdUnit.textContent=r.unitType;
    tr.appendChild(tdUnit);

    const tdMat=document.createElement("td");
    tdMat.className="right";
    tdMat.textContent=fmtMoney(r.mat);
    tr.appendChild(tdMat);

    const tdLab=document.createElement("td");
    tdLab.className="right";
    tdLab.textContent=fmtMoney(r.lab);
    tr.appendChild(tdLab);

    const tdSell=document.createElement("td");
    tdSell.className="right";
    tdSell.textContent=fmtMoney(r.sell);
    tr.appendChild(tdSell);

    tbody.appendChild(tr);
  }

  el("totMat").textContent = fmtMoney(totMat);
  el("totLab").textContent = fmtMoney(totLab);
  el("totSell").textContent = fmtMoney(totSell);

  // KPIs
  const g = geometry();
  el("kFloor").textContent = fmtNum(g.floorSF);
  el("kPer").textContent = fmtNum(g.perimeterLF);
  el("kWall").textContent = fmtNum(g.wallSF);
  el("kPaint").textContent = fmtNum(g.paintSF);
  el("kBase").textContent = fmtNum(g.baseLF);
  el("kDoors").textContent = fmtNum(g.doorsTotal);
  el("kCasing").textContent = fmtNum(g.casingLF);
  el("kShoe").textContent = fmtNum(g.shoeLF);

  return { totMat, totLab, totSell, rows, geom:g };
}

function recalc(){
  const rows = buildLines();
  window.__QUOTE__ = render(rows);
}

function bindEvents(){
  const ids = [
    "floorSf","lenFt","widFt","perLf","ceilHt",
    "matMu","labMu",
    "tFraming","tElectrical","tSubpanel","tInsulation","tDryHang","tDryFinish","tPaint","tFloor","tBase",
    "pToilet","pVanity","pShower","pKitchen","pDish","pIce","pBar","pUpflush","tPlumbSup",
    "dHollow","dSolid","dCloset","tDoorHardware","tDoorCasing","tShoe",
    "tDrySup","tPaintSup","tElecSup","tConsumables"
  ];
  for(const id of ids){
    el(id).addEventListener("input", recalc);
    el(id).addEventListener("change", recalc);
  }

  el("btnReset").addEventListener("click", ()=>{
    // quick reset (keep defaults)
    document.querySelectorAll("input").forEach(inp=>{
      if(inp.type==="checkbox") inp.checked = true;
    });
    el("floorSf").value = 1400;
    el("lenFt").value = "";
    el("widFt").value = "";
    el("perLf").value = "";
    el("ceilHt").value = 8;
    el("matMu").value = 0.25;
    el("labMu").value = 0.35;

    el("pToilet").value = 1;
    el("pVanity").value = 1;
    el("pShower").value = 1;
    el("pKitchen").value = 1;
    el("pDish").value = 1;
    el("pIce").value = 0;
    el("pBar").value = 0;
    el("pUpflush").value = 1;

    el("dHollow").value = 9;
    el("dSolid").value = 1;
    el("dCloset").value = 6;

    recalc();
  });

  el("btnShare").addEventListener("click", async ()=>{
    const q = window.__QUOTE__;
    if(!q) return;
    const g = q.geom;
    const text = [
      "NJ Basement Quote Summary",
      `Floor SF: ${fmtNum(g.floorSF)} | Perimeter LF: ${fmtNum(g.perimeterLF)} | Paint SF: ${fmtNum(g.paintSF)}`,
      `Materials: ${fmtMoney(q.totMat)} | Labor: ${fmtMoney(q.totLab)} | Sell: ${fmtMoney(q.totSell)}`,
      "",
      "Top Lines:",
      ...q.rows.filter(r=>r.type==="line" && r.sell>0).slice(0,10).map(r=>`- ${r.item}: ${fmtMoney(r.sell)}`)
    ].join("\n");

    try{
      await navigator.clipboard.writeText(text);
      el("btnShare").textContent = "Copied ✅";
      setTimeout(()=> el("btnShare").textContent="Copy Summary", 1200);
    }catch(e){
      alert("Clipboard blocked by browser. Try long-press and copy manually.");
    }
  });

  el("btnCSV").addEventListener("click", ()=>{
    const q = window.__QUOTE__;
    if(!q) return;
    const lines = [["Item","Units","Unit Type","Material","Labor","Sell"]];
    q.rows.forEach(r=>{
      if(r.type==="section") return;
      lines.push([r.item, r.units, r.unitType, r.mat, r.lab, r.sell]);
    });
    const csv = lines.map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nj-basement-quote.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
}

loadData();
