/* Haroon & Sons Quote Tool — simple, fast, no backend */

const $ = (id) => document.getElementById(id);

const els = {
  floorSf: $("floorSf"),
  lenFt: $("lenFt"),
  widFt: $("widFt"),
  perLf: $("perLf"),
  ceilHt: $("ceilHt"),
  matMu: $("matMu"),
  labMu: $("labMu"),

  kFloor: $("kFloor"),
  kPer: $("kPer"),
  kWall: $("kWall"),
  kPaint: $("kPaint"),
  kBase: $("kBase"),

  quoteBody: $("quoteBody"),
  totMat: $("totMat"),
  totLab: $("totLab"),
  totSell: $("totSell"),

  btnReset: $("btnReset"),
  btnShare: $("btnShare"),
  btnCSV: $("btnCSV"),
};

let catalog = { items: [] };

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function money(n) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * Geometry rules:
 * - If length & width provided => use them; floor SF = L*W.
 * - Else use floorSf input; assume square for auto perimeter.
 * - If user enters perimeter => it overrides auto perimeter.
 */
function computeGeometry() {
  let floorSf = num(els.floorSf.value);
  const L = num(els.lenFt.value);
  const W = num(els.widFt.value);
  const ceil = Math.max(0, num(els.ceilHt.value));

  let usedL = 0, usedW = 0;
  if (L > 0 && W > 0) {
    usedL = L;
    usedW = W;
    floorSf = L * W;
  } else {
    // assume square if only SF given
    const side = floorSf > 0 ? Math.sqrt(floorSf) : 0;
    usedL = side;
    usedW = side;
  }

  const autoPer = (usedL > 0 && usedW > 0) ? 2 * (usedL + usedW) : 0;
  const perOverride = num(els.perLf.value);
  const perimeter = perOverride > 0 ? perOverride : autoPer;

  const wallSf = perimeter * ceil;
  const paintSf = wallSf + floorSf; // matches your earlier behavior
  const baseLf = perimeter;

  return { floorSf, perimeter, wallSf, paintSf, baseLf, ceil };
}

function unitValue(unitType, g) {
  switch (unitType) {
    case "sf_floor": return g.floorSf;
    case "sf_wall": return g.wallSf;
    case "sf_paint": return g.paintSf;
    case "lf_base": return g.baseLf;
    case "each": return 1;
    default: return 0;
  }
}

function buildRows(g) {
  const matMu = Math.max(0, num(els.matMu.value));
  const labMu = Math.max(0, num(els.labMu.value));

  let totMat = 0, totLab = 0, totSell = 0;

  const rows = catalog.items.map(item => {
    const units = unitValue(item.unitType, g);

    const rawMat = units * (item.matPerUnit || 0);
    const rawLab = units * (item.labPerUnit || 0);

    const sellMat = rawMat * (1 + matMu);
    const sellLab = rawLab * (1 + labMu);
    const sell = sellMat + sellLab;

    totMat += sellMat;
    totLab += sellLab;
    totSell += sell;

    return {
      name: item.name,
      units,
      unitType: item.unitType,
      mat: sellMat,
      lab: sellLab,
      sell
    };
  });

  return { rows, totMat, totLab, totSell };
}

function render() {
  const g = computeGeometry();

  // KPIs
  els.kFloor.textContent = fmt(g.floorSf);
  els.kPer.textContent = fmt(g.perimeter);
  els.kWall.textContent = fmt(g.wallSf);
  els.kPaint.textContent = fmt(g.paintSf);
  els.kBase.textContent = fmt(g.baseLf);

  // Table
  const { rows, totMat, totLab, totSell } = buildRows(g);

  els.quoteBody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td class="right">${fmt(r.units)}</td>
      <td>${r.unitType}</td>
      <td class="right">${money(r.mat)}</td>
      <td class="right">${money(r.lab)}</td>
      <td class="right"><strong>${money(r.sell)}</strong></td>
    </tr>
  `).join("");

  els.totMat.textContent = money(totMat);
  els.totLab.textContent = money(totLab);
  els.totSell.textContent = money(totSell);
}

function resetAll() {
  els.floorSf.value = 1400;
  els.lenFt.value = "";
  els.widFt.value = "";
  els.perLf.value = "";
  els.ceilHt.value = 8;
  els.matMu.value = 0.25;
  els.labMu.value = 0.35;
  render();
}

function buildSummaryText() {
  const g = computeGeometry();
  const { rows, totSell } = buildRows(g);

  const lines = [];
  lines.push("Haroon and Sons Consulting Quote");
  lines.push("Vision • Alignment • Execution");
  lines.push("");
  lines.push(`Floor SF: ${fmt(g.floorSf)} | Perimeter LF: ${fmt(g.perimeter)} | Ceiling: ${fmt(g.ceil)} ft`);
  lines.push("");

  rows.forEach(r => {
    lines.push(`${r.name} — ${fmt(r.units)} ${r.unitType} — ${money(r.sell)}`);
  });

  lines.push("");
  lines.push(`TOTAL: ${money(totSell)}`);

  return lines.join("\n");
}

async function copySummary() {
  const text = buildSummaryText();
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied summary to clipboard.");
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    alert("Copied summary (fallback).");
  }
}

function downloadCSV() {
  const g = computeGeometry();
  const { rows, totMat, totLab, totSell } = buildRows(g);

  const header = ["Item","Units","UnitType","MaterialSell","LaborSell","Sell"];
  const body = rows.map(r => [
    r.name,
    r.units.toFixed(2),
    r.unitType,
    r.mat.toFixed(2),
    r.lab.toFixed(2),
    r.sell.toFixed(2)
  ]);

  body.push(["TOTALS","","",totMat.toFixed(2),totLab.toFixed(2),totSell.toFixed(2)]);

  const csv = [header, ...body]
    .map(line => line.map(v => `"${String(v).replaceAll('"','""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "haroon-sons-quote.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function hookEvents() {
  const inputs = [
    els.floorSf, els.lenFt, els.widFt, els.perLf, els.ceilHt, els.matMu, els.labMu
  ];
  inputs.forEach(i => i.addEventListener("input", render));

  els.btnReset.addEventListener("click", resetAll);
  els.btnShare.addEventListener("click", copySummary);
  els.btnCSV.addEventListener("click", downloadCSV);
}

async function init() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    catalog = await res.json();
  } catch (e) {
    alert("Could not load data.json. Make sure it's in the repo root and committed.");
    catalog = { items: [] };
  }

  hookEvents();
  render();
}

init();
