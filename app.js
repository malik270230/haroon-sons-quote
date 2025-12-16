/* Haroon & Sons Consulting Quote
   Option A PDF (summary-first), tiered markup by sqft,
   admin override + tariff, fixed PCT_MAT + plumbing supplies,
   FIX: Qty controls for EACH items (doors/dishwasher/sinks/etc)
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_KEY = "haroon_sons_quote_state_vA";
const ADMIN_PIN = "0718"; // change if you want

let DATA = null;

const state = {
  inputs: {
    floorSF: null,
    ceilFt: 8,
    lenFt: null,
    widFt: null,
    perimOverride: null
  },
  scopeOn: {},     // id => boolean
  qtyEach: {},     // id => number (only for unit === EACH)
  admin: {
    unlocked: false,
    markupEnabled: true,
    markupOverridePct: null,
    tariffEnabled: false,
    tariffPct: 0,
    includeLineItemsOnPDF: true
  }
};

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function money(n) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveState() {
  const payload = {
    inputs: state.inputs,
    scopeOn: state.scopeOn,
    qtyEach: state.qtyEach,
    admin: {
      markupEnabled: state.admin.markupEnabled,
      markupOverridePct: state.admin.markupOverridePct,
      tariffEnabled: state.admin.tariffEnabled,
      tariffPct: state.admin.tariffPct,
      includeLineItemsOnPDF: state.admin.includeLineItemsOnPDF
    }
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);

    if (s.inputs) Object.assign(state.inputs, s.inputs);
    if (s.scopeOn) state.scopeOn = s.scopeOn;
    if (s.qtyEach) state.qtyEach = s.qtyEach;

    if (s.admin) {
      state.admin.markupEnabled = !!s.admin.markupEnabled;
      state.admin.markupOverridePct =
        (s.admin.markupOverridePct === null || s.admin.markupOverridePct === undefined)
          ? null
          : Number(s.admin.markupOverridePct);
      state.admin.tariffEnabled = !!s.admin.tariffEnabled;
      state.admin.tariffPct = Number(s.admin.tariffPct) || 0;
      state.admin.includeLineItemsOnPDF =
        (s.admin.includeLineItemsOnPDF === undefined) ? true : !!s.admin.includeLineItemsOnPDF;
    }
  } catch (e) {}
}

function computeGeometry() {
  const floorSF = state.inputs.floorSF ?? 0;
  const ceilFt = state.inputs.ceilFt ?? 8;

  const len = state.inputs.lenFt;
  const wid = state.inputs.widFt;
  const override = state.inputs.perimOverride;

  let perim = null;

  if (Number.isFinite(override) && override > 0) perim = override;
  else if (Number.isFinite(len) && Number.isFinite(wid) && len > 0 && wid > 0) perim = 2 * (len + wid);
  else if (floorSF > 0) perim = 4 * Math.sqrt(floorSF);
  else perim = 0;

  const wallSF = perim * (ceilFt > 0 ? ceilFt : 8);
  const paintSF = wallSF + floorSF;

  return { floorSF, ceilFt, perimLF: perim, wallSF, paintSF };
}

function getTieredMarkupPctBySF(sf) {
  const tiers = (DATA?.settings?.markup_tiers || []).slice();
  if (!tiers.length) return 0;

  const area = Number.isFinite(sf) ? sf : 0;
  for (const t of tiers) {
    const min = Number.isFinite(t.min) ? t.min : 0;
    const max = (t.max === null || t.max === undefined) ? Infinity : t.max;
    if (area >= min && area <= max) return Number(t.pct) || 0;
  }
  return Number(tiers[tiers.length - 1].pct) || 0;
}

function effectiveMarkupPct() {
  if (!state.admin.markupEnabled) return 0;
  const override = state.admin.markupOverridePct;
  if (Number.isFinite(override)) return clamp(override, 0, 200);
  const g = computeGeometry();
  return clamp(getTieredMarkupPctBySF(g.floorSF), 0, 200);
}

function effectiveTariffPct() {
  if (!state.admin.tariffEnabled) return 0;
  const p = Number(state.admin.tariffPct) || 0;
  return clamp(p, 0, 200);
}

function setCompanyHeader() {
  const c = DATA.settings.company;

  $("#companyName").textContent = c.name || "Haroon & Sons Consulting Quote";

  const phone = (c.phone || "").trim();
  const email = (c.email || "").trim();

  const phoneEl = $("#companyPhone");
  const emailEl = $("#companyEmail");

  phoneEl.textContent = phone ? `📞 ${phone}` : "📞";
  emailEl.textContent = email ? `✉️ ${email}` : "✉️";

  if (phone) phoneEl.href = "tel:" + phone.replace(/[^\d+]/g, "");
  if (email) emailEl.href = "mailto:" + email;

  const logoEl = $("#companyLogo");
  logoEl.src = c.logo || "logo.png";
}

function initDefaultsFromJson() {
  const defaults = DATA.settings.defaults || {};
  if (state.inputs.ceilFt == null) state.inputs.ceilFt = defaults.ceilingHeight ?? 8;
  if (state.inputs.floorSF == null) state.inputs.floorSF = defaults.projectArea ?? null;

  for (const it of DATA.items) {
    if (state.scopeOn[it.id] === undefined) state.scopeOn[it.id] = !!it.default_on;

    if (it.unit === "EACH") {
      if (state.qtyEach[it.id] === undefined) {
        const dq = (it.default_qty === null || it.default_qty === undefined) ? 0 : Number(it.default_qty);
        state.qtyEach[it.id] = Number.isFinite(dq) ? dq : 0;
      }
    }
  }
}

function renderGeometry() {
  const g = computeGeometry();

  $("#inFloorSF").value = state.inputs.floorSF ?? "";
  $("#inCeilFt").value = state.inputs.ceilFt ?? "";
  $("#inLenFt").value = state.inputs.lenFt ?? "";
  $("#inWidFt").value = state.inputs.widFt ?? "";
  $("#inPerimLF").value = state.inputs.perimOverride ?? "";

  $("#outPerimLF").textContent = round2(g.perimLF).toLocaleString();
  $("#outWallSF").textContent = round2(g.wallSF).toLocaleString();
  $("#outPaintSF").textContent = round2(g.paintSF).toLocaleString();

  const pct = effectiveMarkupPct();
  $("#markupBanner").textContent = `Markup tier: ${pct}% (${round2(g.floorSF).toLocaleString()} SF)`;
}

function renderScopeList() {
  const list = $("#scopeList");
  list.innerHTML = "";

  for (const it of DATA.items) {
    const on = !!state.scopeOn[it.id];

    const wrap = document.createElement("div");
    wrap.className = "chk";

    const left = document.createElement("label");
    left.style.display = "flex";
    left.style.gap = "10px";
    left.style.alignItems = "flex-start";
    left.style.flex = "1";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = on;
    cb.addEventListener("change", () => {
      state.scopeOn[it.id] = cb.checked;
      saveState();
      renderAll();
    });

    const meta = document.createElement("div");
    meta.style.flex = "1";

    const title = document.createElement("b");
    title.textContent = it.label;

    const small = document.createElement("small");
    const mat = Number(it.material_rate) || 0;
    const lab = Number(it.labor_rate) || 0;
    small.textContent = `${it.unit} • material ${mat.toFixed(2)} • labor ${lab.toFixed(2)}`;

    meta.appendChild(title);
    meta.appendChild(small);

    left.appendChild(cb);
    left.appendChild(meta);

    wrap.appendChild(left);

    // RIGHT SIDE: Qty control for EACH items
    if (it.unit === "EACH") {
      const qtyWrap = document.createElement("div");
      qtyWrap.style.display = "flex";
      qtyWrap.style.flexDirection = "column";
      qtyWrap.style.alignItems = "flex-end";
      qtyWrap.style.gap = "6px";
      qtyWrap.style.minWidth = "90px";

      const labEl = document.createElement("div");
      labEl.style.fontSize = "12px";
      labEl.style.opacity = ".75";
      labEl.textContent = "Qty";

      const inp = document.createElement("input");
      inp.type = "number";
      inp.inputMode = "numeric";
      inp.min = "0";
      inp.step = "1";
      inp.value = String(state.qtyEach[it.id] ?? 0);
      inp.style.width = "86px";
      inp.style.padding = "10px 10px";
      inp.style.borderRadius = "12px";
      inp.style.border = "1px solid rgba(255,255,255,.10)";
      inp.style.background = "rgba(0,0,0,.18)";
      inp.style.color = "inherit";
      inp.addEventListener("input", () => {
        const v = Math.max(0, Math.round(num(inp.value) ?? 0));
        state.qtyEach[it.id] = v;
        saveState();
        renderAll();
      });

      qtyWrap.appendChild(labEl);
      qtyWrap.appendChild(inp);
      wrap.appendChild(qtyWrap);
    }

    list.appendChild(wrap);
  }
}

function computeQtyForItem(it, geom, context) {
  const u = it.unit;

  if (u === "FLOOR_SF") return geom.floorSF;
  if (u === "WALL_SF") return geom.wallSF;
  if (u === "PAINT_SF") return geom.paintSF;
  if (u === "LF") return geom.perimLF;

  if (u === "EACH") {
    // computed EACH helpers:
    if (it.id === "door_casing_lf") return context.doorCasingLF; // uses EACH slot as computed quantity
    if (it.id === "shoe_molding_lf") return context.shoeMoldingLF;

    if (it.id === "plumbing_supplies_allowance_each_fixture") return context.fixtureCount;
    return Number(state.qtyEach[it.id] ?? 0);
  }

  if (u === "PCT_MAT") return 1;

  return 0;
}

function buildContext(geom) {
  // Door count from qtyEach
  const doorIds = [
    "door_interior_hollow_core_each",
    "door_interior_solid_core_each",
    "door_closet_each"
  ];

  let doorCount = 0;
  for (const id of doorIds) {
    if (!state.scopeOn[id]) continue;
    doorCount += Number(state.qtyEach[id] ?? 0);
  }

  // casing LF estimate: ~17 LF per door opening
  const doorCasingLF = doorCount * 17;

  // shoe molding: match perimeter LF
  const shoeMoldingLF = geom.perimLF;

  // fixture count: all selected plumbing/fixtures EACH items (except allowance/consumables and computed helpers)
  let fixtureCount = 0;
  for (const it of DATA.items) {
    if (!state.scopeOn[it.id]) continue;
    if (it.unit !== "EACH") continue;

    if (it.id === "plumbing_supplies_allowance_each_fixture") continue;
    if (it.id === "job_consumables_fasteners_of_raw_materials") continue;
    if (it.id === "door_casing_lf") continue;
    if (it.id === "shoe_molding_lf") continue;

    // count plumbing-ish fixtures
    if (it.id.startsWith("plumbing_") || it.category === "Fixtures" || it.id.includes("upflush")) {
      fixtureCount += Number(state.qtyEach[it.id] ?? 0);
    }
  }

  return { doorCount, doorCasingLF, shoeMoldingLF, fixtureCount };
}

function computeQuote() {
  const geom = computeGeometry();
  const ctx = buildContext(geom);

  const rows = [];
  let rawMat = 0;
  let rawLab = 0;

  for (const it of DATA.items) {
    if (!state.scopeOn[it.id]) continue;

    let qty = computeQtyForItem(it, geom, ctx);
    qty = Number.isFinite(qty) ? qty : 0;

    const matRate = Number(it.material_rate) || 0;
    const labRate = Number(it.labor_rate) || 0;

    if (it.unit === "PCT_MAT") {
      rows.push({
        it, qty: 1, mat: 0, lab: 0, total: 0,
        _deferPctMat: true, _pct: matRate
      });
      continue;
    }

    const mat = qty * matRate;
    const lab = qty * labRate;
    const total = mat + lab;

    rawMat += mat;
    rawLab += lab;

    rows.push({ it, qty, mat, lab, total });
  }

  // PCT_MAT based on raw materials
  for (const r of rows) {
    if (!r._deferPctMat) continue;
    const pct = Number(r._pct) || 0;
    r.qty = 1;
    r.mat = rawMat * pct;
    r.lab = 0;
    r.total = r.mat;
  }

  const rawSubtotal = rawMat + rawLab;

  const markupPct = effectiveMarkupPct();
  const tariffPct = effectiveTariffPct();

  const markupAmt = rawSubtotal * (markupPct / 100);
  const tariffBase = rawSubtotal + markupAmt;
  const tariffAmt = tariffBase * (tariffPct / 100);

  const grandTotal = rawSubtotal + markupAmt + tariffAmt;

  return { geom, rows, rawMat, rawLab, rawSubtotal, markupPct, markupAmt, tariffPct, tariffAmt, grandTotal };
}

function formatQty(qty, unit) {
  if (!Number.isFinite(qty)) return "0";
  if (unit === "PCT_MAT") return "—";
  if (unit === "EACH") return String(Math.round(qty));
  return round2(qty).toLocaleString();
}

function renderQuoteAndRates() {
  const q = computeQuote();

  $("#rawSubtotal").textContent = money(q.rawSubtotal);
  $("#markupApplied").textContent = q.markupPct ? `${round2(q.markupPct)}%` : "OFF";
  $("#tariffApplied").textContent = q.tariffPct ? `${round2(q.tariffPct)}%` : "OFF";
  $("#grandTotal").textContent = money(q.grandTotal);

  const qb = $("#quoteBody");
  qb.innerHTML = "";
  for (const r of q.rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${escapeHtml(r.it.label)}</td>
      <td>${escapeHtml(r.it.unit)}</td>
      <td>${formatQty(r.qty, r.it.unit)}</td>
      <td>${money(r.mat)}</td>
      <td>${money(r.lab)}</td>
      <td><b>${money(r.total)}</b></td>
    `;
    qb.appendChild(tr);
  }

  const rb = $("#ratesBody");
  rb.innerHTML = "";
  for (const it of DATA.items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${escapeHtml(it.label)}</td>
      <td>${escapeHtml(it.unit)}</td>
      <td>${it.unit === "PCT_MAT" ? `${round2((Number(it.material_rate)||0)*100)}% of raw materials` : money(Number(it.material_rate)||0)}</td>
      <td>${money(Number(it.labor_rate)||0)}</td>
    `;
    rb.appendChild(tr);
  }
}

function setAdminUI() {
  $("#adminMarkupEnabled").value = state.admin.markupEnabled ? "1" : "0";
  $("#adminMarkupOverride").value =
    (state.admin.markupOverridePct === null || state.admin.markupOverridePct === undefined)
      ? ""
      : String(state.admin.markupOverridePct);

  $("#adminTariffEnabled").value = state.admin.tariffEnabled ? "1" : "0";
  $("#adminTariffPct").value = String(state.admin.tariffPct || 0);

  if (!$("#adminIncludeLines")) {
    const panel = $("#adminPanel .grid");
    const wrap = document.createElement("label");
    wrap.className = "field";
    wrap.innerHTML = `
      <span>PDF: Include line items</span>
      <select id="adminIncludeLines">
        <option value="1">YES</option>
        <option value="0">NO (summary only)</option>
      </select>
    `;
    panel.appendChild(wrap);
  }
  $("#adminIncludeLines").value = state.admin.includeLineItemsOnPDF ? "1" : "0";
}

function unlockAdmin() {
  const pin = prompt("Enter admin PIN");
  if (pin === ADMIN_PIN) {
    state.admin.unlocked = true;
    $("#adminPanel").classList.remove("hidden");
    $("#adminStateMsg").textContent = "Admin mode unlocked.";
    saveState();
  } else {
    alert("Wrong PIN");
  }
}

function wireAdminUnlockLongPress() {
  const logo = $("#companyLogo");
  if (!logo) return;

  let t = null;
  const start = () => { t = setTimeout(() => unlockAdmin(), 1200); };
  const stop = () => { if (t) clearTimeout(t); t = null; };

  logo.addEventListener("touchstart", start, { passive: true });
  logo.addEventListener("touchend", stop);
  logo.addEventListener("touchcancel", stop);

  logo.addEventListener("mousedown", start);
  logo.addEventListener("mouseup", stop);
  logo.addEventListener("mouseleave", stop);
}

function wireInputs() {
  const bind = (id, key) => {
    const el = $(id);
    el.addEventListener("input", () => {
      state.inputs[key] = num(el.value);
      saveState();
      renderAll();
    });
  };

  bind("#inFloorSF", "floorSF");
  bind("#inCeilFt", "ceilFt");
  bind("#inLenFt", "lenFt");
  bind("#inWidFt", "widFt");
  bind("#inPerimLF", "perimOverride");

  $("#adminApplyBtn").addEventListener("click", () => {
    state.admin.markupEnabled = $("#adminMarkupEnabled").value === "1";
    const ov = num($("#adminMarkupOverride").value);
    state.admin.markupOverridePct = Number.isFinite(ov) ? ov : null;

    state.admin.tariffEnabled = $("#adminTariffEnabled").value === "1";
    state.admin.tariffPct = num($("#adminTariffPct").value) || 0;

    state.admin.includeLineItemsOnPDF = ($("#adminIncludeLines").value === "1");

    saveState();
    renderAll();
    $("#adminStateMsg").textContent = "Admin settings applied.";
  });

  $("#adminResetBtn").addEventListener("click", () => {
    state.admin.markupEnabled = true;
    state.admin.markupOverridePct = null;
    state.admin.tariffEnabled = false;
    state.admin.tariffPct = 0;
    state.admin.includeLineItemsOnPDF = true;
    saveState();
    renderAll();
    $("#adminStateMsg").textContent = "Admin settings reset.";
  });
}

function wireTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const which = btn.dataset.tab;
      $$(".panel").forEach(p => p.classList.remove("active"));
      $("#tab-" + which).classList.add("active");
    });
  });
}

function wireButtons() {
  $("#clearBtn").addEventListener("click", () => {
    if (!confirm("Clear saved values on this device?")) return;
    localStorage.removeItem(LS_KEY);
    location.reload();
  });

  $("#printBtn").addEventListener("click", () => {
    const q = computeQuote();
    openPrintWindowOptionA(q);
  });
}

function openPrintWindowOptionA(q) {
  const c = DATA.settings.company || {};
  const geom = q.geom;
  const linesOn = state.admin.includeLineItemsOnPDF;

  const htmlLines = linesOn ? `
    <h3 style="margin:18px 0 8px;">Line Items</h3>
    <table class="tbl">
      <thead>
        <tr>
          <th class="left">Item</th><th>Unit</th><th>Qty</th><th>Material</th><th>Labor</th><th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${q.rows.map(r => `
          <tr>
            <td class="left">${escapeHtml(r.it.label)}</td>
            <td>${escapeHtml(r.it.unit)}</td>
            <td>${formatQty(r.qty, r.it.unit)}</td>
            <td>${money(r.mat)}</td>
            <td>${money(r.lab)}</td>
            <td><b>${money(r.total)}</b></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "";

  const w = window.open("", "_blank");
  const title = escapeHtml(c.name || "Haroon & Sons Consulting Quote");

  w.document.open();
  w.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:18px;color:#111}
    .header{display:flex;gap:14px;align-items:center;border:1px solid #ddd;border-radius:14px;padding:14px}
    .logo{width:74px;height:74px;border-radius:12px;object-fit:cover;border:1px solid #eee}
    h1{margin:0;font-size:20px}
    .muted{color:#444;margin-top:4px}
    .right{margin-left:auto;text-align:right}
    .big{font-size:22px;font-weight:900}
    .box{border:1px solid #ddd;border-radius:14px;padding:14px;margin-top:14px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #eee}
    .row:last-child{border-bottom:none}
    .k{color:#444}
    .v{font-weight:800}
    .final{font-size:26px;font-weight:1000}
    .tbl{width:100%;border-collapse:collapse;margin-top:8px}
    .tbl th,.tbl td{border-bottom:1px solid #eee;padding:10px 8px;text-align:right;white-space:nowrap}
    .tbl th.left,.tbl td.left{text-align:left;white-space:normal}
    .tbl thead th{background:#f6f6f6;border-bottom:1px solid #ddd}
    .note{color:#555;font-size:12px;margin-top:12px}
    @media print{body{margin:10px}}
  </style>
</head>
<body>
  <div class="header">
    <img class="logo" src="${escapeHtml(c.logo || "logo.png")}" alt="logo" />
    <div>
      <h1>${escapeHtml(c.name || "Haroon & Sons Consulting Quote")}</h1>
      <div class="muted">${escapeHtml(c.phone || "")}${c.phone && c.email ? " • " : ""}${escapeHtml(c.email || "")}</div>
      <div class="muted">Project: ${round2(geom.floorSF).toLocaleString()} SF • Ceiling: ${round2(geom.ceilFt)} ft</div>
    </div>
    <div class="right">
      <div class="muted">Markup tier</div>
      <div class="big">${round2(q.markupPct)}%</div>
      <div class="muted">${q.tariffPct ? `Tariff ${round2(q.tariffPct)}%` : "Tariff OFF"}</div>
    </div>
  </div>

  <div class="box">
    <div class="grid">
      <div class="row"><span class="k">Raw Materials</span><span class="v">${money(q.rawMat)}</span></div>
      <div class="row"><span class="k">Raw Labor</span><span class="v">${money(q.rawLab)}</span></div>
      <div class="row"><span class="k">Raw Subtotal</span><span class="v">${money(q.rawSubtotal)}</span></div>
      <div class="row"><span class="k">Markup (${round2(q.markupPct)}%)</span><span class="v">${money(q.markupAmt)}</span></div>
      <div class="row"><span class="k">Tariff (${q.tariffPct ? round2(q.tariffPct) : 0}%)</span><span class="v">${money(q.tariffAmt)}</span></div>
      <div class="row"><span class="k final">FINAL TOTAL</span><span class="v final">${money(q.grandTotal)}</span></div>
    </div>
  </div>

  ${htmlLines}

  <div class="note">
    Note: This is an estimate. Final pricing may change based on field conditions, permits, and material availability.
  </div>

  <script>window.onload = () => { window.print(); };</script>
</body>
</html>
  `);
  w.document.close();
}

function renderAll() {
  renderGeometry();
  renderScopeList();
  setAdminUI();
  renderQuoteAndRates();
}

async function loadData() {
  const res = await fetch(`data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load data.json");
  return await res.json();
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    loadState();
    DATA = await loadData();

    if (!DATA.settings) DATA.settings = {};
    if (!DATA.settings.company) DATA.settings.company = {};
    if (!Array.isArray(DATA.items)) DATA.items = [];

    initDefaultsFromJson();
    setCompanyHeader();

    wireTabs();
    wireInputs();
    wireButtons();
    wireAdminUnlockLongPress();

    if (state.admin.unlocked) $("#adminPanel").classList.remove("hidden");

    renderAll();
  } catch (e) {
    alert("Error loading app files. Make sure index.html, app.js, styles.css, data.json are all in the same folder.");
    console.error(e);
  }
});
