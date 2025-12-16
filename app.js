/* Haroon & Sons Consulting Quote — Option A
   Fixes:
   - EACH items have qty inputs (doors, dishwasher, sinks, etc)
   - Plumbing Supplies Allowance qty = total selected plumbing fixtures qty
   - Job Consumables qty = % of RAW MATERIAL subtotal
   - Rates page shows Raw + Adjusted (per-item markup tier)
   - Quote/PDF hide the words "markup" and "tariff" (admin still controls them)
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_KEY = "haroon_sons_quote_v2_state";

/** =========================
 *  CONFIG / DEFAULTS
 *  ========================= */
const ADMIN_PIN = "0718"; // change if you want

const DEFAULT_STATE = {
  inputs: {
    floorSF: "",
    ceilFt: "8",
    lenFt: "",
    widFt: "",
    perimOverride: ""
  },
  selections: {},       // id -> boolean
  qty: {},              // id -> number (for EACH overrides)
  admin: {
    perItemEnabled: true,            // per-item tier markup enabled
    perItemOverridePct: "",          // blank = tier
    globalEnabled: false,            // global markup on subtotal
    globalPct: "",                   // blank = 0
    tariffEnabled: false,
    tariffPct: "",                   // blank = 0
  }
};

let DATA = null;
let STATE = loadState();

/** =========================
 *  LOAD DATA.JSON
 *  ========================= */
async function loadData() {
  // cache-bust using current URL param v= or fallback timestamp
  const url = new URL(location.href);
  const v = url.searchParams.get("v") || String(Date.now());
  const res = await fetch(`data.json?v=${encodeURIComponent(v)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load data.json");
  const json = await res.json();
  return json;
}

/** =========================
 *  STATE
 *  ========================= */
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // merge shallowly with defaults (so new fields appear)
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      inputs: { ...structuredClone(DEFAULT_STATE.inputs), ...(parsed.inputs || {}) },
      selections: { ...(parsed.selections || {}) },
      qty: { ...(parsed.qty || {}) },
      admin: { ...structuredClone(DEFAULT_STATE.admin), ...(parsed.admin || {}) }
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(STATE));
}

/** =========================
 *  HELPERS
 *  ========================= */
const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
};
const fmtNum = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const toNum = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function currentTierPct(floorSF) {
  const tiers = (DATA?.settings?.markupTiers || []);
  for (const t of tiers) {
    if (floorSF <= t.maxSF) return toNum(t.pct);
  }
  return 0;
}

function adminPerItemPct(floorSF) {
  if (!STATE.admin.perItemEnabled) return 0;
  const ov = String(STATE.admin.perItemOverridePct || "").trim();
  if (ov !== "") return clamp(toNum(ov) / 100, 0, 5);
  return currentTierPct(floorSF);
}

function adminGlobalPct() {
  if (!STATE.admin.globalEnabled) return 0;
  const ov = String(STATE.admin.globalPct || "").trim();
  if (ov === "") return 0;
  return clamp(toNum(ov) / 100, 0, 5);
}

function adminTariffPct() {
  if (!STATE.admin.tariffEnabled) return 0;
  const ov = String(STATE.admin.tariffPct || "").trim();
  if (ov === "") return 0;
  return clamp(toNum(ov) / 100, 0, 5);
}

/** =========================
 *  GEOMETRY CALCS
 *  ========================= */
function calcGeometry() {
  const floorSF = toNum(STATE.inputs.floorSF);
  const ceilFt = toNum(STATE.inputs.ceilFt) || 8;
  const lenFt = toNum(STATE.inputs.lenFt);
  const widFt = toNum(STATE.inputs.widFt);
  const perimOverride = toNum(STATE.inputs.perimOverride);

  // If user provides perimeter override, use it.
  // Else if length/width provided, perimeter = 2(L+W).
  // Else assume square-ish: side = sqrt(area), perimeter = 4*side.
  let perimLF = 0;
  if (perimOverride > 0) perimLF = perimOverride;
  else if (lenFt > 0 && widFt > 0) perimLF = 2 * (lenFt + widFt);
  else if (floorSF > 0) perimLF = 4 * Math.sqrt(floorSF);

  const wallSF = perimLF * ceilFt;
  const paintSF = wallSF + floorSF;

  return { floorSF, ceilFt, perimLF, wallSF, paintSF };
}

/** =========================
 *  SPECIAL QUANTITY RULES
 *  ========================= */
function isSelected(item) {
  const v = STATE.selections[item.id];
  if (typeof v === "boolean") return v;
  return !!item.default_on;
}

function getEachQty(item) {
  // If user typed qty, use it, else default_qty, else 0
  const q = STATE.qty[item.id];
  if (q !== undefined && q !== null && q !== "") return Math.max(0, toNum(q));
  if (item.default_qty !== undefined && item.default_qty !== null) return Math.max(0, toNum(item.default_qty));
  return 0;
}

function countPlumbingFixtures() {
  // plumbing fixtures = items with plumbing_fixture true (or category Fixtures) AND selected
  let total = 0;
  for (const it of DATA.items) {
    const isFixture = !!it.plumbing_fixture || String(it.category || "").toLowerCase() === "fixtures";
    if (!isFixture) continue;
    if (!isSelected(it)) continue;
    if (it.unit === "EACH") total += getEachQty(it);
  }
  return total;
}

function countDoors() {
  let total = 0;
  for (const it of DATA.items) {
    const isDoor = String(it.category || "").toLowerCase() === "doors" || String(it.id).startsWith("door_");
    if (!isDoor) continue;
    if (!isSelected(it)) continue;
    if (it.unit === "EACH") total += getEachQty(it);
  }
  return total;
}

function autoQtyForItem(item, geo) {
  const { floorSF, wallSF, paintSF, perimLF } = geo;

  switch (item.unit) {
    case "FLOOR_SF": return floorSF;
    case "WALL_SF":  return wallSF;
    case "PAINT_SF": return paintSF;
    case "LF":       return perimLF;
    case "EACH":     return getEachQty(item);
    case "PCT_MAT":  return null; // computed later
    default:         return 0;
  }
}

/** =========================
 *  LINE CALCS
 *  ========================= */
function computeQuote() {
  const geo = calcGeometry();
  const perItemPct = adminPerItemPct(geo.floorSF);

  // First pass: compute raw material subtotal for consumables %
  let rawMaterialSubtotal = 0;

  // We also need door casing LF if present and you want it driven from door count.
  // If data.json includes "door_casing_lf", we auto-calc as 17 LF per door (avg).
  const doorCount = countDoors();
  const plumbingFixtureCount = countPlumbingFixtures();

  // Build lines
  const lines = [];

  for (const item of DATA.items) {
    if (!isSelected(item)) continue;

    // Determine qty
    let qty = autoQtyForItem(item, geo);

    // Door casing special: auto from door count unless user overrides by typing qty (we allow override via qty map)
    if (item.id === "door_casing_lf") {
      // if user manually typed a qty override in STATE.qty (yes, even though LF), respect it
      const typed = STATE.qty[item.id];
      if (typed !== undefined && typed !== null && typed !== "") qty = Math.max(0, toNum(typed));
      else qty = doorCount * 17; // average casing per door opening
    }

    // Shoe molding sometimes also used as perimeter — keep as LF (already)
    // Plumbing supplies allowance: qty = plumbing fixtures count
    if (item.id === "plumbing_supplies_allowance_each_fixture") {
      qty = plumbingFixtureCount;
    }

    // Compute raw line
    const rawMat = (item.unit === "PCT_MAT") ? 0 : (toNum(item.material_rate) * toNum(qty || 0));
    const rawLab = (item.unit === "PCT_MAT") ? 0 : (toNum(item.labor_rate) * toNum(qty || 0));
    rawMaterialSubtotal += rawMat;

    lines.push({
      item,
      qty,
      rawMat,
      rawLab,
      mat: 0,
      lab: 0,
      total: 0
    });
  }

  // Second pass: apply special PCT_MAT (consumables) based on raw material subtotal
  for (const ln of lines) {
    if (ln.item.unit === "PCT_MAT") {
      // material_rate is the percent (e.g., 0.05 = 5%)
      ln.qty = "—";
      ln.rawMat = rawMaterialSubtotal * toNum(ln.item.material_rate);
      ln.rawLab = 0;
    }
  }

  // Now apply per-item pct (hidden from customer, but used)
  let subtotal = 0;
  for (const ln of lines) {
    const base = ln.rawMat + ln.rawLab;
    const adjusted = base * (1 + perItemPct);

    // Split proportionally back into mat/lab for display (customer just sees numbers)
    if (base > 0) {
      ln.mat = ln.rawMat * (adjusted / base);
      ln.lab = ln.rawLab * (adjusted / base);
    } else {
      ln.mat = 0; ln.lab = 0;
    }
    ln.total = ln.mat + ln.lab;
    subtotal += ln.total;
  }

  // Optional global + tariff
  const gPct = adminGlobalPct();
  const tPct = adminTariffPct();

  let grand = subtotal;
  if (gPct > 0) grand *= (1 + gPct);
  if (tPct > 0) grand *= (1 + tPct);

  return {
    geo,
    perItemPct,
    globalPct: gPct,
    tariffPct: tPct,
    doorCount,
    plumbingFixtureCount,
    lines,
    subtotal,
    grand
  };
}

/** =========================
 *  RENDER UI
 *  ========================= */
function setTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const key = btn.dataset.tab;
      $$(".panel").forEach(p => p.classList.remove("active"));
      $(`#tab-${key}`).classList.add("active");
    });
  });
}

function renderHeader() {
  const c = DATA.settings.company;
  $("#companyName").textContent = c.name || "Haroon & Sons Consulting Quote";

  const logo = $("#companyLogo");
  logo.src = c.logo || "logo.png";

  const phone = $("#companyPhone");
  phone.textContent = `📞 ${c.phone || ""}`;
  phone.href = c.phone ? `tel:${String(c.phone).replace(/[^\d+]/g, "")}` : "#";

  const email = $("#companyEmail");
  email.textContent = `✉️ ${c.email || ""}`;
  email.href = c.email ? `mailto:${c.email}` : "#";

  // Banner text (customer-safe): no "markup/tariff"
  const geo = calcGeometry();
  const tierPct = currentTierPct(geo.floorSF);
  const tierTxt = geo.floorSF > 0 ? `${Math.round(tierPct * 100)}% (${fmtNum(geo.floorSF)} SF)` : "—";
  $("#markupBanner").textContent = `Pricing tier: ${tierTxt}`;
}

function bindInputs() {
  const map = [
    ["#inFloorSF", "floorSF"],
    ["#inCeilFt", "ceilFt"],
    ["#inLenFt", "lenFt"],
    ["#inWidFt", "widFt"],
    ["#inPerimLF", "perimOverride"]
  ];
  map.forEach(([sel, key]) => {
    const el = $(sel);
    el.value = STATE.inputs[key] ?? "";
    el.addEventListener("input", () => {
      STATE.inputs[key] = el.value;
      saveState();
      updateAll();
    });
  });
}

function renderCalculated() {
  const geo = calcGeometry();
  $("#outPerimLF").textContent = geo.perimLF > 0 ? fmtNum(geo.perimLF) : "—";
  $("#outWallSF").textContent = geo.wallSF > 0 ? fmtNum(geo.wallSF) : "—";
  $("#outPaintSF").textContent = geo.paintSF > 0 ? fmtNum(geo.paintSF) : "—";
}

function renderScopeList() {
  const box = $("#scopeList");
  box.innerHTML = "";

  // Group by category for readability
  const groups = {};
  for (const it of DATA.items) {
    const cat = it.category || "Other";
    groups[cat] = groups[cat] || [];
    groups[cat].push(it);
  }

  const order = Object.keys(groups);
  order.sort((a, b) => a.localeCompare(b));

  for (const cat of order) {
    const h = document.createElement("div");
    h.className = "cat";
    h.textContent = cat;
    box.appendChild(h);

    for (const it of groups[cat]) {
      const row = document.createElement("label");
      row.className = "chk";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSelected(it);
      cb.addEventListener("change", () => {
        STATE.selections[it.id] = cb.checked;
        saveState();
        updateAll();
      });

      const txt = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = it.label;

      const small = document.createElement("small");

      // For EACH, show qty input
      if (it.unit === "EACH") {
        const qWrap = document.createElement("span");
        qWrap.className = "qtywrap";

        const q = document.createElement("input");
        q.type = "number";
        q.inputMode = "decimal";
        q.min = "0";
        q.step = "1";
        q.className = "qty";
        q.value = (STATE.qty[it.id] ?? it.default_qty ?? 0);
        q.addEventListener("input", () => {
          STATE.qty[it.id] = q.value;
          saveState();
          updateAll();
        });

        small.textContent = `${it.unit} • material ${fmtNum(it.material_rate)} • labor ${fmtNum(it.labor_rate)}`;
        qWrap.appendChild(document.createTextNode("Qty "));
        qWrap.appendChild(q);
        small.appendChild(document.createTextNode("  "));
        small.appendChild(qWrap);
      } else if (it.id === "plumbing_supplies_allowance_each_fixture") {
        small.textContent = `AUTO: qty = number of selected plumbing fixtures • EACH • material ${fmtNum(it.material_rate)}`;
      } else if (it.unit === "PCT_MAT") {
        small.textContent = `AUTO: ${Math.round(toNum(it.material_rate) * 100)}% of RAW MATERIAL subtotal`;
      } else if (it.id === "door_casing_lf") {
        small.textContent = `AUTO: LF from door count (17 LF/door) • material ${fmtNum(it.material_rate)} • labor ${fmtNum(it.labor_rate)}`;
      } else {
        small.textContent = `${it.unit} • material ${fmtNum(it.material_rate)} • labor ${fmtNum(it.labor_rate)}`;
      }

      txt.appendChild(b);
      txt.appendChild(small);

      row.appendChild(cb);
      row.appendChild(txt);

      box.appendChild(row);
    }
  }
}

function renderQuote() {
  const q = computeQuote();

  // Quote table rows
  const body = $("#quoteBody");
  body.innerHTML = "";

  for (const ln of q.lines) {
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    tdItem.className = "left";
    tdItem.textContent = ln.item.label;

    const tdUnit = document.createElement("td");
    tdUnit.textContent = ln.item.unit;

    const tdQty = document.createElement("td");
    tdQty.textContent = (typeof ln.qty === "string") ? ln.qty : fmtNum(ln.qty);

    const tdMat = document.createElement("td");
    tdMat.textContent = fmtMoney(ln.mat);

    const tdLab = document.createElement("td");
    tdLab.textContent = fmtMoney(ln.lab);

    const tdTot = document.createElement("td");
    tdTot.textContent = fmtMoney(ln.total);

    tr.append(tdItem, tdUnit, tdQty, tdMat, tdLab, tdTot);
    body.appendChild(tr);
  }

  $("#grandTotal").textContent = fmtMoney(q.grand);

  // Customer-safe summary (no "markup/tariff" wording)
  $("#rawSubtotal").textContent = fmtMoney(q.subtotal);

  // These fields exist in HTML, but we keep them neutral:
  $("#markupApplied").textContent = "Included in item pricing";
  $("#tariffApplied").textContent = (q.tariffPct > 0) ? "Included in total" : "OFF";
}

function renderRates() {
  const geo = calcGeometry();
  const perItemPct = adminPerItemPct(geo.floorSF);

  const body = $("#ratesBody");
  body.innerHTML = "";

  for (const it of DATA.items) {
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    tdItem.className = "left";
    tdItem.textContent = it.label;

    const tdUnit = document.createElement("td");
    tdUnit.textContent = it.unit;

    const rawMat = toNum(it.material_rate);
    const rawLab = toNum(it.labor_rate);

    const tdRawMat = document.createElement("td");
    tdRawMat.textContent = fmtMoney(rawMat);

    const tdRawLab = document.createElement("td");
    tdRawLab.textContent = fmtMoney(rawLab);

    // Adjusted per-item tier (Rates page only)
    const tdAdjMat = document.createElement("td");
    const tdAdjLab = document.createElement("td");

    tdAdjMat.textContent = fmtMoney(rawMat * (1 + perItemPct));
    tdAdjLab.textContent = fmtMoney(rawLab * (1 + perItemPct));

    tr.append(tdItem, tdUnit, tdRawMat, tdRawLab, tdAdjMat, tdAdjLab);
    body.appendChild(tr);
  }
}

function bindAdmin() {
  // long-press logo to unlock
  const logo = $("#companyLogo");
  let pressTimer = null;

  const showAdmin = () => {
    $("#adminPanel").classList.remove("hidden");
    $("#adminStateMsg").textContent = "Admin unlocked";
  };

  const askPin = () => {
    const pin = prompt("Enter Admin PIN");
    if (pin === null) return;
    if (String(pin).trim() === ADMIN_PIN) showAdmin();
    else alert("Wrong PIN");
  };

  logo.addEventListener("touchstart", () => {
    pressTimer = setTimeout(askPin, 1200);
  });
  logo.addEventListener("touchend", () => {
    if (pressTimer) clearTimeout(pressTimer);
  });
  logo.addEventListener("mousedown", () => {
    pressTimer = setTimeout(askPin, 900);
  });
  logo.addEventListener("mouseup", () => {
    if (pressTimer) clearTimeout(pressTimer);
  });

  // bind admin fields
  $("#adminMarkupEnabled").value = STATE.admin.perItemEnabled ? "1" : "0";
  $("#adminMarkupOverride").value = STATE.admin.perItemOverridePct ?? "";
  $("#adminTariffEnabled").value = STATE.admin.tariffEnabled ? "1" : "0";
  $("#adminTariffPct").value = STATE.admin.tariffPct ?? "";

  // extra global controls (injected here so you don't have to edit HTML again)
  // We'll append to adminPanel dynamically
  const panel = $("#adminPanel");
  if (!$("#adminGlobalEnabled")) {
    const grid = panel.querySelector(".grid");

    const wrap1 = document.createElement("label");
    wrap1.className = "field";
    wrap1.innerHTML = `
      <span>Global Adjustment Enabled</span>
      <select id="adminGlobalEnabled">
        <option value="0">OFF</option>
        <option value="1">ON</option>
      </select>
    `;

    const wrap2 = document.createElement("label");
    wrap2.className = "field";
    wrap2.innerHTML = `
      <span>Global Adjustment % (applies to subtotal)</span>
      <input id="adminGlobalPct" type="number" inputmode="decimal" placeholder="e.g., 10" />
    `;

    grid.appendChild(wrap1);
    grid.appendChild(wrap2);

    $("#adminGlobalEnabled").value = STATE.admin.globalEnabled ? "1" : "0";
    $("#adminGlobalPct").value = STATE.admin.globalPct ?? "";
  }

  $("#adminApplyBtn").addEventListener("click", () => {
    STATE.admin.perItemEnabled = $("#adminMarkupEnabled").value === "1";
    STATE.admin.perItemOverridePct = $("#adminMarkupOverride").value;

    STATE.admin.tariffEnabled = $("#adminTariffEnabled").value === "1";
    STATE.admin.tariffPct = $("#adminTariffPct").value;

    STATE.admin.globalEnabled = $("#adminGlobalEnabled").value === "1";
    STATE.admin.globalPct = $("#adminGlobalPct").value;

    saveState();
    updateAll();
    $("#adminStateMsg").textContent = "Admin settings applied";
  });

  $("#adminResetBtn").addEventListener("click", () => {
    STATE.admin = structuredClone(DEFAULT_STATE.admin);
    saveState();
    location.reload();
  });
}

function bindButtons() {
  $("#clearBtn").addEventListener("click", () => {
    localStorage.removeItem(LS_KEY);
    location.reload();
  });

  $("#printBtn").addEventListener("click", () => {
    const q = computeQuote();
    openPrintWindow(q);
  });
}

/** =========================
 *  PRINT (PDF) — includes header + final total
 *  ========================= */
function openPrintWindow(q) {
  const c = DATA.settings.company;

  const rows = q.lines.map(ln => `
    <tr>
      <td style="text-align:left">${escapeHtml(ln.item.label)}</td>
      <td>${escapeHtml(ln.item.unit)}</td>
      <td>${typeof ln.qty === "string" ? ln.qty : fmtNum(ln.qty)}</td>
      <td>${fmtMoney(ln.mat)}</td>
      <td>${fmtMoney(ln.lab)}</td>
      <td><b>${fmtMoney(ln.total)}</b></td>
    </tr>
  `).join("");

  const w = window.open("", "_blank");
  const logoUrl = c.logo || "logo.png";

  w.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(c.name || "Quote")}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#111}
    .hdr{display:flex;gap:16px;align-items:center;border:1px solid #ddd;padding:14px;border-radius:14px}
    .logo{width:84px;height:84px;border-radius:14px;object-fit:cover;border:1px solid #ddd}
    h1{margin:0;font-size:22px}
    .sub{margin-top:4px;color:#444}
    .meta{margin-top:6px;color:#222;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #eee;padding:10px 8px;text-align:right;vertical-align:top}
    th{text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#555;background:#fafafa}
    th:first-child, td:first-child{text-align:left}
    tfoot td{background:#f3f6ff;font-size:18px;font-weight:900}
    .totalbox{margin-top:14px;border:2px solid #111;border-radius:14px;padding:14px;display:flex;justify-content:space-between;font-size:20px;font-weight:900}
    .note{margin-top:14px;color:#555;font-size:12px}
  </style>
</head>
<body>
  <div class="hdr">
    <img class="logo" src="${logoUrl}" alt="logo" />
    <div>
      <h1>${escapeHtml(c.name || "Haroon & Sons Consulting Quote")}</h1>
      <div class="sub">Fast estimate • Clear scope • Clean totals</div>
      <div class="meta">${escapeHtml(c.phone || "")} • ${escapeHtml(c.email || "")}</div>
    </div>
  </div>

  <div class="totalbox">
    <div>Estimated Total</div>
    <div>${fmtMoney(q.grand)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Item</th>
        <th>Unit</th>
        <th>Qty</th>
        <th>Material</th>
        <th>Labor</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" style="text-align:left">Estimated Total</td>
        <td>${fmtMoney(q.grand)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="note">
    Note: This is an estimator. Final pricing may change based on field conditions, permits, and material availability.
  </div>
</body>
</html>
  `);

  w.document.close();
  w.focus();
  w.print();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** =========================
 *  UPDATE ALL
 *  ========================= */
function updateAll() {
  renderHeader();
  renderCalculated();
  renderQuote();
  renderRates();
}

/** =========================
 *  BOOT
 *  ========================= */
(async function init() {
  try {
    DATA = await loadData();

    // Initialize selection defaults once (so all items appear)
    for (const it of DATA.items) {
      if (STATE.selections[it.id] === undefined) {
        STATE.selections[it.id] = !!it.default_on;
      }
      if (it.unit === "EACH" && STATE.qty[it.id] === undefined) {
        if (it.default_qty !== undefined && it.default_qty !== null) STATE.qty[it.id] = it.default_qty;
      }
    }
    saveState();

    setTabs();
    renderHeader();
    bindInputs();
    renderScopeList();
    bindAdmin();
    bindButtons();

    updateAll();
  } catch (e) {
    alert("Error loading app files. Make sure index.html, app.js, styles.css, data.json are all in the same folder on GitHub Pages.");
    console.error(e);
  }
})();
