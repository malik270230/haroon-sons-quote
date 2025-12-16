/* Haroon & Sons Consulting Quote — Option A (FINAL BUILD)
   What this does:
   - INPUT = quantities (SF / LF / EACH), plus geometry for auto items
   - RATES = shows Raw + Adjusted (per-item tier markup) columns (admin-facing)
   - QUOTE + PDF = customer clean view (no "markup" or "tariff" wording)
   - Admin (PIN):
       A) Per-item tier enabled + override %
       B) Global markup on subtotal (optional)
       C) Tariff on final (optional)
   - FIXED:
       * Plumbing Supplies Allowance auto qty = number of selected plumbing fixtures (EACH sum)
         (optional admin/user override supported if you enter a manual qty)
       * Job Consumables auto = % of RAW material subtotal
   - RESTORED:
       * Qty boxes for EACH items (doors, dishwasher, sinks, etc.)
       * Adds Kitchen/Wet Bar items with manual qty inputs (LF/SF/EACH)
*/

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const LS_KEY = "haroon_sons_quote_state_v3";

// CHANGE PIN if you want
const ADMIN_PIN = "0718";

const DEFAULT_STATE = {
  inputs: {
    floorSF: "",
    ceilFt: "8",
    lenFt: "",
    widFt: "",
    perimOverride: ""
  },
  selections: {},    // id -> boolean
  qty: {},           // id -> number (manual qty overrides for EACH/LF/SF when needed)
  admin: {
    perItemEnabled: true,
    perItemOverridePct: "",
    globalEnabled: false,
    globalPct: "",
    tariffEnabled: false,
    tariffPct: ""
  }
};

let DATA = null;
let STATE = loadState();

/* ------------------ UTIL ------------------ */
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmtNum = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
};
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ------------------ DATA LOAD ------------------ */

async function loadData() {
  const url = new URL(location.href);
  const v = url.searchParams.get("v") || String(Date.now());

  const dataUrl = `./data.json?v=${encodeURIComponent(v)}`;
  console.log("Fetching:", dataUrl);

  const res = await fetch(dataUrl, { cache: "no-store" });
  if (!res.ok) {
    const msg = `FAILED to load data.json\nURL: ${dataUrl}\nHTTP: ${res.status} ${res.statusText}`;
    alert(msg);
    throw new Error(msg);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = `data.json loaded but is NOT valid JSON.\nURL: ${dataUrl}\n\nFirst 200 chars:\n${text.slice(0,200)}`;
    alert(msg);
    throw e;
  }
}

/* ------------------ STATE ------------------ */
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
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

/* ------------------ MARKUP TIERS ------------------ */
function currentTierPct(floorSF) {
  const tiers = DATA?.settings?.markupTiers || [];
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

/* ------------------ SELECTIONS / QTY ------------------ */
function isSelected(item) {
  const v = STATE.selections[item.id];
  if (typeof v === "boolean") return v;
  return !!item.default_on;
}
function getTypedQty(item) {
  const q = STATE.qty[item.id];
  if (q !== undefined && q !== null && q !== "") return Math.max(0, toNum(q));
  if (item.default_qty !== undefined && item.default_qty !== null) return Math.max(0, toNum(item.default_qty));
  return 0;
}

/* ------------------ GEOMETRY ------------------ */
function calcGeometry() {
  const floorSF = toNum(STATE.inputs.floorSF);
  const ceilFt = toNum(STATE.inputs.ceilFt) || (DATA?.settings?.defaults?.ceilingHeight || 8);
  const lenFt = toNum(STATE.inputs.lenFt);
  const widFt = toNum(STATE.inputs.widFt);
  const perimOverride = toNum(STATE.inputs.perimOverride);

  let perimLF = 0;
  if (perimOverride > 0) perimLF = perimOverride;
  else if (lenFt > 0 && widFt > 0) perimLF = 2 * (lenFt + widFt);
  else if (floorSF > 0) perimLF = 4 * Math.sqrt(floorSF);

  const wallSF = perimLF * ceilFt;
  const paintSF = wallSF + floorSF;

  return { floorSF, ceilFt, perimLF, wallSF, paintSF };
}

/* ------------------ SPECIAL COUNTS ------------------ */
function countDoorsEach() {
  let total = 0;
  for (const it of DATA.items) {
    const isDoor = String(it.category || "").toLowerCase() === "doors" || String(it.id).startsWith("door_");
    if (!isDoor) continue;
    if (!isSelected(it)) continue;
    if (it.unit === "EACH") total += getTypedQty(it);
  }
  return total;
}
function countPlumbingFixturesEach() {
  let total = 0;
  for (const it of DATA.items) {
    const isFix = !!it.plumbing_fixture || String(it.category || "").toLowerCase() === "fixtures";
    if (!isFix) continue;
    if (!isSelected(it)) continue;
    if (it.unit === "EACH") total += getTypedQty(it);
  }
  return total;
}

/* ------------------ QTY RULES ------------------ */
function autoQtyForItem(item, geo, helpers) {
  // If an item is explicitly manual_qty, always use typed qty (LF/SF/EACH)
  if (item.manual_qty) return getTypedQty(item);

  switch (item.unit) {
    case "FLOOR_SF": return geo.floorSF;
    case "WALL_SF":  return geo.wallSF;
    case "PAINT_SF": return geo.paintSF;
    case "LF":       return geo.perimLF;
    case "SF":       return getTypedQty(item); // SF is always manual in this tool
    case "EACH":     return getTypedQty(item);
    case "PCT_MAT":  return null; // computed after raw materials are known
    default:         return 0;
  }
}

function computeQuote() {
  const geo = calcGeometry();
  const perItemPct = adminPerItemPct(geo.floorSF);

  const doorCount = countDoorsEach();
  const plumbingFixtureCount = countPlumbingFixturesEach();

  const helpers = { doorCount, plumbingFixtureCount };

  // First pass: gather lines + raw material subtotal
  let rawMaterialSubtotal = 0;
  const lines = [];

  for (const item of DATA.items) {
    if (!isSelected(item)) continue;

    let qty = autoQtyForItem(item, geo, helpers);

    // Door casing: auto from doors unless user overrides manually
    if (item.id === "door_casing_lf") {
      const typed = STATE.qty[item.id];
      qty = (typed !== undefined && typed !== null && typed !== "") ? Math.max(0, toNum(typed)) : (doorCount * (toNum(item.door_casing_lf_per_door) || 17));
    }

    // Plumbing supplies allowance: auto = fixture count unless user overrides
    if (item.id === "plumbing_supplies_allowance_each_fixture") {
      const typed = STATE.qty[item.id];
      qty = (typed !== undefined && typed !== null && typed !== "") ? Math.max(0, toNum(typed)) : plumbingFixtureCount;
    }

    // Countertop conversion option: LF input -> SF (depth default 25.5")
    // If item has convert_lf_to_sf = true and depth_ft provided, qty is LF typed and we convert to SF.
    if (item.convert_lf_to_sf) {
      const lf = getTypedQty(item);
      const depthFt = toNum(item.depth_ft) || 2.125; // 25.5"
      qty = lf * depthFt; // SF
    }

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

  // Second pass: % of RAW materials lines
  for (const ln of lines) {
    if (ln.item.unit === "PCT_MAT") {
      ln.qty = "—";
      ln.rawMat = rawMaterialSubtotal * toNum(ln.item.material_rate);
      ln.rawLab = 0;
    }
  }

  // Apply per-item markup silently (customer doesn't see the word)
  let subtotal = 0;
  for (const ln of lines) {
    const base = ln.rawMat + ln.rawLab;
    const adjusted = base * (1 + perItemPct);

    if (base > 0) {
      ln.mat = ln.rawMat * (adjusted / base);
      ln.lab = ln.rawLab * (adjusted / base);
    } else {
      ln.mat = 0; ln.lab = 0;
    }

    ln.total = ln.mat + ln.lab;
    subtotal += ln.total;
  }

  // Optional global + optional tariff
  const gPct = adminGlobalPct();
  const tPct = adminTariffPct();

  let grand = subtotal;
  if (gPct > 0) grand *= (1 + gPct);
  if (tPct > 0) grand *= (1 + tPct);

  return {
    geo,
    tierPct: currentTierPct(geo.floorSF),
    perItemPct,
    globalPct: gPct,
    tariffPct: tPct,
    doorCount,
    plumbingFixtureCount,
    rawMaterialSubtotal,
    lines,
    subtotal,
    grand
  };
}

/* ------------------ UI ------------------ */
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
  $("#companyLogo").src = c.logo || "logo.png";

  const phone = $("#companyPhone");
  phone.textContent = `📞 ${c.phone || ""}`;
  phone.href = c.phone ? `tel:${String(c.phone).replace(/[^\d+]/g, "")}` : "#";

  const email = $("#companyEmail");
  email.textContent = `✉️ ${c.email || ""}`;
  email.href = c.email ? `mailto:${c.email}` : "#";

  const geo = calcGeometry();
  const tier = currentTierPct(geo.floorSF);
  const tierTxt = geo.floorSF > 0 ? `${Math.round(tier * 100)}% (${fmtNum(geo.floorSF)} SF)` : "—";
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

  const groups = {};
  for (const it of DATA.items) {
    const cat = it.category || "Other";
    groups[cat] = groups[cat] || [];
    groups[cat].push(it);
  }

  const cats = Object.keys(groups).sort((a,b)=>a.localeCompare(b));

  for (const cat of cats) {
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

      // Show qty input when:
      // - unit EACH
      // - manual_qty true (LF/SF/EACH)
      // - id is door_casing_lf (optional manual override)
      // - id is plumbing_supplies_allowance_each_fixture (optional manual override)
      const needsQty =
        it.unit === "EACH" ||
        it.manual_qty === true ||
        it.id === "door_casing_lf" ||
        it.id === "plumbing_supplies_allowance_each_fixture" ||
        it.convert_lf_to_sf === true;

      if (needsQty) {
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

        let unitLabel = it.unit;
        if (it.convert_lf_to_sf) unitLabel = "LF (auto to SF)";

        small.textContent = `${unitLabel} • material ${fmtNum(it.material_rate)} • labor ${fmtNum(it.labor_rate)}`;
        qWrap.appendChild(document.createTextNode("Qty "));
        qWrap.appendChild(q);

        if (it.id === "plumbing_supplies_allowance_each_fixture") {
          small.appendChild(document.createTextNode("  • AUTO = fixture count (you can override)"));
        }
        if (it.unit === "PCT_MAT") {
          // PCT_MAT shouldn't be manually qty-driven; but if selected it shows auto note:
          small.textContent = `AUTO: ${Math.round(toNum(it.material_rate)*100)}% of RAW material subtotal`;
          qWrap.innerHTML = ""; // remove qty
        } else {
          small.appendChild(document.createTextNode("  "));
          small.appendChild(qWrap);
        }
      } else if (it.unit === "PCT_MAT") {
        small.textContent = `AUTO: ${Math.round(toNum(it.material_rate)*100)}% of RAW material subtotal`;
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

  const body = $("#quoteBody");
  body.innerHTML = "";

  for (const ln of q.lines) {
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    tdItem.className = "left";
    tdItem.textContent = ln.item.label;

    const tdUnit = document.createElement("td");
    tdUnit.textContent = ln.item.display_unit || ln.item.unit;

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

  $("#rawSubtotal").textContent = fmtMoney(q.subtotal);
  $("#grandTotal").textContent = fmtMoney(q.grand);

  // customer-safe wording:
  $("#markupApplied").textContent = "Included in item pricing";
  $("#tariffApplied").textContent = q.tariffPct > 0 ? "Included in total" : "OFF";
}

function renderRates() {
  const geo = calcGeometry();
  const pct = adminPerItemPct(geo.floorSF);

  $("#ratesTier").textContent =
    geo.floorSF > 0
      ? `${Math.round(pct*100)}% tier applied to adjusted columns`
      : "Enter Project Area (SF) to see tier";

  const body = $("#ratesBody");
  body.innerHTML = "";

  for (const it of DATA.items) {
    const tr = document.createElement("tr");

    const tdItem = document.createElement("td");
    tdItem.className = "left";
    tdItem.textContent = it.label;

    const tdUnit = document.createElement("td");
    tdUnit.textContent = it.display_unit || it.unit;

    const rawMat = toNum(it.material_rate);
    const rawLab = toNum(it.labor_rate);

    const tdRawMat = document.createElement("td");
    tdRawMat.textContent = fmtMoney(rawMat);

    const tdRawLab = document.createElement("td");
    tdRawLab.textContent = fmtMoney(rawLab);

    const tdAdjMat = document.createElement("td");
    tdAdjMat.textContent = fmtMoney(rawMat * (1 + pct));

    const tdAdjLab = document.createElement("td");
    tdAdjLab.textContent = fmtMoney(rawLab * (1 + pct));

    tr.append(tdItem, tdUnit, tdRawMat, tdRawLab, tdAdjMat, tdAdjLab);
    body.appendChild(tr);
  }
}

/* ------------------ ADMIN ------------------ */
function bindAdmin() {
  const logo = $("#companyLogo");
  let timer = null;

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

  // iPhone long press
  logo.addEventListener("touchstart", () => { timer = setTimeout(askPin, 1200); });
  logo.addEventListener("touchend", () => { if (timer) clearTimeout(timer); });

  // desktop long press
  logo.addEventListener("mousedown", () => { timer = setTimeout(askPin, 900); });
  logo.addEventListener("mouseup", () => { if (timer) clearTimeout(timer); });

  // bind fields
  $("#adminMarkupEnabled").value = STATE.admin.perItemEnabled ? "1" : "0";
  $("#adminMarkupOverride").value = STATE.admin.perItemOverridePct ?? "";
  $("#adminTariffEnabled").value = STATE.admin.tariffEnabled ? "1" : "0";
  $("#adminTariffPct").value = STATE.admin.tariffPct ?? "";

  // Inject global controls if not present (so HTML stays simple)
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

/* ------------------ PRINT PDF ------------------ */
function openPrintWindow(q) {
  const c = DATA.settings.company;

  const rows = q.lines.map(ln => `
    <tr>
      <td style="text-align:left">${escapeHtml(ln.item.label)}</td>
      <td>${escapeHtml(ln.item.display_unit || ln.item.unit)}</td>
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
  .totalbox{margin-top:14px;border:2px solid #111;border-radius:14px;padding:14px;display:flex;justify-content:space-between;font-size:20px;font-weight:900}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border-bottom:1px solid #eee;padding:10px 8px;text-align:right;vertical-align:top}
  th{text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#555;background:#fafafa}
  th:first-child, td:first-child{text-align:left}
  tfoot td{background:#f3f6ff;font-size:18px;font-weight:900}
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

/* ------------------ UPDATE ------------------ */
function updateAll() {
  renderHeader();
  renderCalculated();
  renderQuote();
  renderRates();
}

/* ------------------ BOOT ------------------ */
(async function init() {
  try {
    DATA = await loadData();

    // initialize selection defaults
    for (const it of DATA.items) {
      if (STATE.selections[it.id] === undefined) STATE.selections[it.id] = !!it.default_on;
      if (STATE.qty[it.id] === undefined) {
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
