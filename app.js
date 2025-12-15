// Haroon & Sons Consulting Quote — clean rebuild
// - Customer view hides markup
// - Internal toggle shows markup (optional)
// - Print/PDF uses print-only template with totals + header at top

const STORAGE_KEY = "hs_quote_v1";

let DATA = null;

const $ = (id) => document.getElementById(id);
const money = (n) =>
  (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function defaultStateFromData(data) {
  const s = {
    inputs: { ...data.defaults.inputs },
    settings: { ...data.defaults.settings },
    items: data.items.map((it) => ({
      id: it.id,
      enabled: !!it.enabled,
      qty: it.qty === "" ? "" : Number(it.qty ?? 0),
      material: Number(it.material ?? 0),
      labor: Number(it.labor ?? 0),
    })),
  };
  return s;
}

function getItemDef(id) {
  return DATA.items.find((x) => x.id === id);
}

function getItemState(state, id) {
  return state.items.find((x) => x.id === id);
}

function setInternalMode(isOn) {
  document.documentElement.classList.toggle("show-internal", !!isOn);
}

function parseNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcGeometry(inputs) {
  const floorSF = parseNum(inputs.basement_floor_sf);
  const len = parseNum(inputs.basement_length_ft);
  const wid = parseNum(inputs.basement_width_ft);
  const perimOverride = parseNum(inputs.perimeter_lf_override);
  const height = parseNum(inputs.ceiling_height_ft) ?? 8;

  let perim = null;
  if (perimOverride != null) perim = perimOverride;
  else if (len != null && wid != null) perim = 2 * (len + wid);

  const wallSF = perim != null ? perim * height : null;
  const paintSF =
    floorSF != null && wallSF != null
      ? wallSF + floorSF // walls + ceiling (ceiling ~= floorSF)
      : null;

  return { floorSF, perim, height, wallSF, paintSF };
}

function unitUnits(unit, geo, qty) {
  switch (unit) {
    case "FLOOR_SF":
      return geo.floorSF ?? 0;
    case "PERIM_LF":
      return geo.perim ?? 0;
    case "WALL_SF":
      return geo.wallSF ?? 0;
    case "PAINT_SF":
      return geo.paintSF ?? 0;
    case "EACH":
      return Number(qty || 0);
    case "PCT_MAT":
      return Number(qty || 0); // percent value, handled separately
    default:
      return Number(qty || 0);
  }
}

function computeQuote(state) {
  const geo = calcGeometry(state.inputs);

  const matMU = (Number(state.settings.materials_markup_pct) || 0) / 100;
  const labMU = (Number(state.settings.labor_markup_pct) || 0) / 100;

  // Build rows
  const rows = [];
  let totalMat = 0;
  let totalLab = 0;
  let rawMatBeforeMU = 0;

  for (const def of DATA.items) {
    const st = getItemState(state, def.id);
    if (!st || !st.enabled) continue;

    // Skip geometry-dependent rows if geometry missing
    if (
      ["FLOOR_SF", "PERIM_LF", "WALL_SF", "PAINT_SF"].includes(def.unit) &&
      (geo.floorSF == null || (def.unit !== "FLOOR_SF" && geo.perim == null))
    ) {
      continue;
    }

    const units = unitUnits(def.unit, geo, st.qty);
    if (def.unit === "EACH" && units <= 0) continue;

    // Special percent-of-materials line
    if (def.unit === "PCT_MAT") continue;

    const matCost = units * (Number(st.material) || 0);
    const labCost = units * (Number(st.labor) || 0);

    rawMatBeforeMU += matCost;

    const matSell = matCost * (1 + matMU);
    const labSell = labCost * (1 + labMU);
    const sell = matSell + labSell;

    totalMat += matSell;
    totalLab += labSell;

    rows.push({
      id: def.id,
      label: def.label,
      unit: def.unit,
      units,
      matSell,
      labSell,
      sell,
    });
  }

  // Now apply PCT_MAT line(s)
  for (const def of DATA.items) {
    const st = getItemState(state, def.id);
    if (!st || !st.enabled) continue;
    if (def.unit !== "PCT_MAT") continue;

    const pct = Number(st.qty || 0);
    if (pct <= 0) continue;

    const matCost = (rawMatBeforeMU * pct) / 100;
    const matSell = matCost * (1 + matMU);
    const labSell = 0;
    const sell = matSell;

    totalMat += matSell;
    totalLab += labSell;

    rows.push({
      id: def.id,
      label: def.label,
      unit: "PCT_MAT",
      units: pct,
      matSell,
      labSell,
      sell,
    });
  }

  // Sort in original order
  const order = new Map(DATA.items.map((d, i) => [d.id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { geo, rows, totalMat, totalLab, totalSell: totalMat + totalLab, matMU, labMU };
}

function renderLists(state) {
  const scope = $("scopeList");
  const fixtures = $("fixtureList");
  const doors = $("doorList");
  const addons = $("addonList");

  scope.innerHTML = "";
  fixtures.innerHTML = "";
  doors.innerHTML = "";
  addons.innerHTML = "";

  const groups = {
    scope,
    fixtures,
    doors,
    addons,
  };

  for (const def of DATA.items) {
    const st = getItemState(state, def.id);
    const container = groups[def.group];
    if (!container) continue;

    const row = document.createElement("div");
    row.className = "row";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "check";
    chk.checked = !!st.enabled;
    chk.addEventListener("change", () => {
      st.enabled = chk.checked;
      saveState(state);
      renderQuote(state);
    });

    const left = document.createElement("div");
    left.innerHTML = `<div><strong>${def.label}</strong></div><div class="tag">${def.unit}</div>`;

    const right = document.createElement("div");
    right.className = "rightCol";

    // qty input only for EACH and PCT_MAT
    if (def.unit === "EACH" || def.unit === "PCT_MAT") {
      const qty = document.createElement("input");
      qty.type = "number";
      qty.inputMode = "decimal";
      qty.className = "qty";
      qty.value = st.qty === "" ? "" : String(st.qty ?? 0);
      qty.placeholder = def.unit === "PCT_MAT" ? "e.g., 5" : "0";
      qty.addEventListener("input", () => {
        st.qty = qty.value === "" ? "" : Number(qty.value);
        saveState(state);
        renderQuote(state);
      });
      right.appendChild(qty);
    } else {
      const pill = document.createElement("div");
      pill.className = "tag";
      pill.textContent = "Auto";
      right.appendChild(pill);
    }

    row.appendChild(chk);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  }
}

function renderRates(state) {
  const tbody = $("ratesTbody");
  tbody.innerHTML = "";

  for (const def of DATA.items) {
    const st = getItemState(state, def.id);

    const tr = document.createElement("tr");

    const td1 = document.createElement("td");
    td1.textContent = def.label;

    const td2 = document.createElement("td");
    td2.textContent = def.unit;

    const td3 = document.createElement("td");
    td3.className = "num";
    const inMat = document.createElement("input");
    inMat.type = "number";
    inMat.inputMode = "decimal";
    inMat.value = String(Number(st.material || 0));
    inMat.addEventListener("input", () => {
      st.material = Number(inMat.value || 0);
      saveState(state);
      renderQuote(state);
    });
    td3.appendChild(inMat);

    const td4 = document.createElement("td");
    td4.className = "num";
    const inLab = document.createElement("input");
    inLab.type = "number";
    inLab.inputMode = "decimal";
    inLab.value = String(Number(st.labor || 0));
    inLab.addEventListener("input", () => {
      st.labor = Number(inLab.value || 0);
      saveState(state);
      renderQuote(state);
    });
    td4.appendChild(inLab);

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);

    tbody.appendChild(tr);
  }
}

function renderQuote(state) {
  const q = computeQuote(state);

  // Geometry display
  $("outPerim").textContent = q.geo.perim == null ? "—" : q.geo.perim.toFixed(2);
  $("outWallSF").textContent = q.geo.wallSF == null ? "—" : q.geo.wallSF.toFixed(2);
  $("outPaintSF").textContent = q.geo.paintSF == null ? "—" : q.geo.paintSF.toFixed(2);

  // Summary meta (NO markup text here for customer view)
  const parts = [];
  if (q.geo.floorSF != null) parts.push(`Floor SF: ${q.geo.floorSF.toFixed(2)}`);
  if (q.geo.perim != null) parts.push(`Perimeter LF: ${q.geo.perim.toFixed(2)}`);
  if (q.geo.wallSF != null) parts.push(`Wall SF: ${q.geo.wallSF.toFixed(2)}`);
  if (q.geo.paintSF != null) parts.push(`Paint/Drywall SF: ${q.geo.paintSF.toFixed(2)}`);
  $("quoteMeta").textContent = parts.length ? parts.join(" • ") : "Enter Floor SF and click Calculate.";

  // Internal numbers (only if toggle on)
  $("muMat").textContent = Number(state.settings.materials_markup_pct || 0).toFixed(0);
  $("muLab").textContent = Number(state.settings.labor_markup_pct || 0).toFixed(0);

  // Table
  const tbody = $("quoteTbody");
  tbody.innerHTML = "";

  for (const r of q.rows) {
    const tr = document.createElement("tr");

    const td1 = document.createElement("td");
    td1.textContent = r.label;

    const td2 = document.createElement("td");
    td2.textContent = r.unit;

    const td3 = document.createElement("td");
    td3.className = "num";
    td3.textContent = r.unit === "PCT_MAT" ? `${r.units.toFixed(1)}%` : r.units.toFixed(2);

    const td4 = document.createElement("td");
    td4.className = "num";
    td4.textContent = money(r.matSell);

    const td5 = document.createElement("td");
    td5.className = "num";
    td5.textContent = money(r.labSell);

    const td6 = document.createElement("td");
    td6.className = "num";
    td6.innerHTML = `<strong>${money(r.sell)}</strong>`;

    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);
    tr.appendChild(td6);

    tbody.appendChild(tr);
  }

  $("totMat").textContent = money(q.totalMat);
  $("totLab").textContent = money(q.totalLab);
  $("totSell").textContent = money(q.totalSell);
}

function wireTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((b) => {
    b.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const name = b.dataset.tab;
      document.querySelectorAll(".tabPage").forEach((p) => p.classList.remove("active"));
      $(`tab-${name}`).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function wireInputs(state) {
  // inputs
  const map = [
    ["inFloorSF", "basement_floor_sf"],
    ["inLen", "basement_length_ft"],
    ["inWid", "basement_width_ft"],
    ["inPerim", "perimeter_lf_override"],
    ["inHeight", "ceiling_height_ft"],
    ["inCustomer", "customer_name"],
    ["inAddress", "project_address"],
    ["inNotes", "notes"],
  ];

  for (const [id, key] of map) {
    const el = $(id);
    el.value = state.inputs[key] ?? "";
    el.addEventListener("input", () => {
      state.inputs[key] = el.value;
      saveState(state);
      renderQuote(state);
    });
  }

  $("btnCalc").addEventListener("click", () => renderQuote(state));
  $("btnPrint").addEventListener("click", () => doPrint(state));
  $("btnPrint2").addEventListener("click", () => doPrint(state));
  $("btnPrint3").addEventListener("click", () => doPrint(state));
}

function wireSettings(state) {
  const mat = $("setMatMU");
  const lab = $("setLabMU");
  const toggle = $("toggleInternalDetails");

  mat.value = String(state.settings.materials_markup_pct ?? 25);
  lab.value = String(state.settings.labor_markup_pct ?? 35);
  toggle.checked = !!state.settings.show_internal_details;

  setInternalMode(toggle.checked);

  mat.addEventListener("input", () => {
    state.settings.materials_markup_pct = Number(mat.value || 0);
    saveState(state);
    renderQuote(state);
  });
  lab.addEventListener("input", () => {
    state.settings.labor_markup_pct = Number(lab.value || 0);
    saveState(state);
    renderQuote(state);
  });

  toggle.addEventListener("change", () => {
    state.settings.show_internal_details = toggle.checked;
    setInternalMode(toggle.checked);
    saveState(state);
    renderQuote(state);
  });

  $("btnReset").addEventListener("click", () => {
    const fresh = defaultStateFromData(DATA);
    saveState(fresh);
    location.reload();
  });
}

function buildPrintHTML(state) {
  const q = computeQuote(state);
  const customer = (state.inputs.customer_name || "").trim();
  const address = (state.inputs.project_address || "").trim();
  const notes = (state.inputs.notes || "").trim();

  const meta = [
    q.geo.floorSF != null ? `Floor SF: ${q.geo.floorSF.toFixed(2)}` : null,
    q.geo.perim != null ? `Perimeter LF: ${q.geo.perim.toFixed(2)}` : null,
    q.geo.wallSF != null ? `Wall SF: ${q.geo.wallSF.toFixed(2)}` : null,
    q.geo.paintSF != null ? `Paint/Drywall SF: ${q.geo.paintSF.toFixed(2)}` : null,
  ].filter(Boolean).join(" • ");

  const rowsHTML = q.rows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td>${r.unit}</td>
      <td class="num">${r.unit === "PCT_MAT" ? `${r.units.toFixed(1)}%` : r.units.toFixed(2)}</td>
      <td class="num">${money(r.matSell)}</td>
      <td class="num">${money(r.labSell)}</td>
      <td class="num"><strong>${money(r.sell)}</strong></td>
    </tr>
  `).join("");

  const today = new Date();
  const dt = today.toLocaleDateString();

  // IMPORTANT: print output is customer-safe (no markup shown)
  return `
    <div class="pHeader">
      <div class="pBrand">
        <img class="pLogo" src="logo.png" alt="Logo" />
        <div>
          <div class="pTitle">${DATA.company.name}</div>
          <div class="pSub">Project Quote</div>
          <div class="pSub">${meta}</div>
        </div>
      </div>
      <div class="pMeta">
        <div><strong>Date:</strong> ${dt}</div>
        <div><strong>Quote ID:</strong> HS-${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}</div>
      </div>
    </div>

    <div class="pBlock">
      <div class="pCard">
        <strong>Customer</strong>
        <div>${customer || "—"}</div>
        <div>${address || "—"}</div>
      </div>
      <div class="pCard">
        <strong>Summary</strong>
        <div><strong>Total Materials:</strong> ${money(q.totalMat)}</div>
        <div><strong>Total Labor:</strong> ${money(q.totalLab)}</div>
        <div class="big"><strong>Total:</strong> ${money(q.totalSell)}</div>
      </div>
    </div>

    ${notes ? `
      <div class="pCard" style="margin-bottom:12px;">
        <strong>Notes</strong>
        <div class="pNotes">${notes.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
      </div>
    ` : ""}

    <table class="pTable">
      <thead>
        <tr>
          <th>Item</th>
          <th>Unit</th>
          <th class="num">Units</th>
          <th class="num">Materials</th>
          <th class="num">Labor</th>
          <th class="num">Sell Price</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML || `<tr><td colspan="6">No items selected.</td></tr>`}
      </tbody>
    </table>

    <div class="pTotals">
      <div class="pTerms">
        <strong>Terms (example)</strong><br/>
        • This is an estimate based on provided inputs and selected scope.<br/>
        • Final pricing may change after site visit, measurements, or material selections.<br/>
        • Permits/engineering/design not included unless explicitly listed.
      </div>
      <div>
        <div><strong>Total Materials:</strong> ${money(q.totalMat)}</div>
        <div><strong>Total Labor:</strong> ${money(q.totalLab)}</div>
        <div class="big"><strong>Total:</strong> ${money(q.totalSell)}</div>
      </div>
    </div>
  `;
}

function doPrint(state) {
  // Require floor SF for meaningful print
  const floor = parseNum(state.inputs.basement_floor_sf);
  if (floor == null || floor <= 0) {
    alert("Enter Basement Floor SF before printing.");
    return;
  }

  const area = $("printArea");
  area.innerHTML = buildPrintHTML(state);

  // Print
  window.print();
}

async function init() {
  const res = await fetch("data.json", { cache: "no-store" });
  DATA = await res.json();

  // Load state or defaults
  let state = loadState();
  if (!state) state = defaultStateFromData(DATA);

  // Ensure internal details toggle matches
  setInternalMode(!!state.settings.show_internal_details);

  wireTabs();
  renderLists(state);
  renderRates(state);
  wireInputs(state);
  wireSettings(state);
  renderQuote(state);
}

init().catch((e) => {
  console.error(e);
  alert("Error loading app. Open console for details.");
});
