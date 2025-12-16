/* Haroon & Sons Quote — stable rebuild
   - data.json is source of truth
   - FIX: qty for EACH items
   - FIX: Plumbing supplies allowance (per fixture)
   - FIX: Job consumables (% of raw materials)
   - Rates page shows Raw + Marked-up (tier/override)
   - Print hides internal pricing words for customer
*/

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_KEY = "haroon_sons_quote_state_v2";
const ADMIN_PIN = "0718"; // change if you want

const state = {
  data: null,
  inputs: {
    floorSF: 0,
    ceilFt: 8,
    lenFt: 0,
    widFt: 0,
    perimOverrideLF: 0,
  },
  toggles: {},     // id -> boolean
  qty: {},         // id -> number
  admin: {
    unlocked: false,

    // Per-item markup (tier-based)
    perItemMarkupEnabled: true,
    perItemMarkupOverridePct: null, // number like 35 (means 35%) or null

    // Global markup on the whole job (optional)
    globalMarkupEnabled: false,
    globalMarkupPct: 0, // number like 10 means 10%

    // Tariff (optional)
    tariffEnabled: false,
    tariffPct: 0,
  }
};

function clampNum(n, min = 0, max = 1e9) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function money(n) {
  n = Number(n) || 0;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pctText(p) {
  if (p == null) return "—";
  return `${Math.round(p * 100)}%`;
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    if (saved?.inputs) Object.assign(state.inputs, saved.inputs);
    if (saved?.toggles) state.toggles = saved.toggles;
    if (saved?.qty) state.qty = saved.qty;
    if (saved?.admin) {
      // never persist unlocked
      const { unlocked, ...rest } = saved.admin;
      Object.assign(state.admin, rest);
    }
  } catch (e) {}
}

function saveState() {
  const payload = {
    inputs: state.inputs,
    toggles: state.toggles,
    qty: state.qty,
    admin: { ...state.admin, unlocked: false }
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

async function loadData() {
  // cache-bust handled by your ?v=#### in HTML
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Cannot load data.json");
  const data = await res.json(); // will fail if JSON invalid
  return data;
}

function getTierPctForSF(floorSF) {
  const tiers = state.data?.settings?.markupTiers || [];
  const sf = clampNum(floorSF, 0, 999999);
  for (const t of tiers) {
    if (sf <= t.maxSF) return Number(t.pct) || 0;
  }
  return 0;
}

function getPerItemMarkupPct() {
  if (!state.admin.perItemMarkupEnabled) return 0;

  if (state.admin.perItemMarkupOverridePct != null && state.admin.perItemMarkupOverridePct !== "") {
    return clampNum(state.admin.perItemMarkupOverridePct, 0, 500) / 100;
  }
  return getTierPctForSF(state.inputs.floorSF);
}

function getGlobalMarkupPct() {
  if (!state.admin.globalMarkupEnabled) return 0;
  return clampNum(state.admin.globalMarkupPct, 0, 500) / 100;
}

function getTariffPct() {
  if (!state.admin.tariffEnabled) return 0;
  return clampNum(state.admin.tariffPct, 0, 500) / 100;
}

function calcGeometry() {
  const floorSF = clampNum(state.inputs.floorSF);
  const ceilFt = clampNum(state.inputs.ceilFt || state.data.settings.defaults.ceilingHeight || 8, 6, 12);

  let perimLF = 0;

  const L = clampNum(state.inputs.lenFt);
  const W = clampNum(state.inputs.widFt);

  if (clampNum(state.inputs.perimOverrideLF) > 0) {
    perimLF = clampNum(state.inputs.perimOverrideLF);
  } else if (L > 0 && W > 0) {
    perimLF = 2 * (L + W);
  } else if (floorSF > 0) {
    // assume square if nothing else
    const side = Math.sqrt(floorSF);
    perimLF = 4 * side;
  }

  const wallSF = perimLF * ceilFt;
  const paintSF = wallSF + floorSF; // walls + ceiling

  return { floorSF, ceilFt, perimLF, wallSF, paintSF };
}

// Quantity rules:
// - FLOOR_SF, WALL_SF, PAINT_SF, LF are auto from geometry (unless item is manual_qty)
// - EACH requires user qty input (default_qty if set)
// - PCT_MAT is special (qty shows "—", cost = % * raw materials subtotal)
// - Plumbing supplies allowance EACH fixture: qty = count of plumbing_fixture items selected (sum their qty)
// - Door casing LF per door: qty = door_casing_lf_per_door * total door qty
function computeQtyForItem(item, geom, selectedItems) {
  const unit = item.unit;

  // special computed:
  if (item.id === "plumbing_supplies_allowance_each_fixture") {
    // count fixtures
    let fixtureCount = 0;
    for (const it of selectedItems) {
      if (it.plumbing_fixture) {
        const q = clampNum(state.qty[it.id] ?? it.default_qty ?? 1, 0, 9999);
        fixtureCount += q;
      }
    }
    return fixtureCount;
  }

  if (item.id === "door_casing_lf") {
    // total door qty across all "door_" EACH items
    let doorCount = 0;
    for (const it of selectedItems) {
      if (it.id.startsWith("door_") && it.unit === "EACH") {
        doorCount += clampNum(state.qty[it.id] ?? it.default_qty ?? 0, 0, 9999);
      }
    }
    const perDoorLF = clampNum(item.door_casing_lf_per_door ?? 17, 0, 200);
    return doorCount * perDoorLF;
  }

  if (unit === "EACH") {
    const d = item.default_qty ?? 0;
    return clampNum(state.qty[item.id] ?? d, 0, 9999);
  }

  // manual qty (LF input, etc.)
  if (item.manual_qty) {
    const d = item.default_qty ?? 0;
    return clampNum(state.qty[item.id] ?? d, 0, 999999);
  }

  if (unit === "FLOOR_SF") return geom.floorSF;
  if (unit === "WALL_SF") return geom.wallSF;
  if (unit === "PAINT_SF") return geom.paintSF;
  if (unit === "LF") return geom.perimLF;

  if (unit === "SF" && item.convert_lf_to_sf) {
    // qty stored as LF, convert to SF for pricing
    const lf = clampNum(state.qty[item.id] ?? item.default_qty ?? 0, 0, 999999);
    const depth = clampNum(item.depth_ft ?? 2.0, 0.5, 6);
    return lf * depth;
  }

  if (unit === "PCT_MAT") return 1; // placeholder, handled later

  return 0;
}

function buildScopeList() {
  const wrap = $("#scopeList");
  wrap.innerHTML = "";

  const items = state.data.items || [];

  // group by category
  const groups = new Map();
  for (const it of items) {
    const cat = it.category || "Scope";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(it);
  }

  // stable ordering
  const cats = Array.from(groups.keys());
  for (const cat of cats) {
    const h = document.createElement("div");
    h.style.margin = "4px 0 10px";
    h.style.fontWeight = "900";
    h.style.color = "rgba(233,238,252,.95)";
    h.textContent = cat;
    wrap.appendChild(h);

    for (const it of groups.get(cat)) {
      const checked = state.toggles[it.id] ?? !!it.default_on;

      const row = document.createElement("label");
      row.className = "chk";

      // checkbox
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = checked;
      cb.addEventListener("change", () => {
        state.toggles[it.id] = cb.checked;
        saveState();
        renderAll();
      });

      const meta = document.createElement("div");
      meta.style.flex = "1";

      const title = document.createElement("b");
      title.textContent = it.label;

      const sub = document.createElement("small");
      const unitText = it.display_unit || it.unit;
      sub.textContent = `${unitText} • material ${Number(it.material_rate).toFixed(2)} • labor ${Number(it.labor_rate).toFixed(2)}`;

      meta.appendChild(title);
      meta.appendChild(sub);

      // qty input for EACH and manual_qty
      let qtyBox = null;
      if (it.unit === "EACH" || it.manual_qty || (it.unit === "SF" && it.convert_lf_to_sf)) {
        qtyBox = document.createElement("input");
        qtyBox.type = "number";
        qtyBox.inputMode = "decimal";
        qtyBox.placeholder = "Qty";
        qtyBox.style.width = "92px";
        qtyBox.style.marginLeft = "10px";
        qtyBox.style.border = "1px solid rgba(255,255,255,.10)";
        qtyBox.style.background = "rgba(0,0,0,.18)";
        qtyBox.style.color = "var(--text)";
        qtyBox.style.borderRadius = "12px";
        qtyBox.style.padding = "10px 10px";

        const d = it.default_qty ?? 0;
        const val = state.qty[it.id] ?? d;
        qtyBox.value = String(val);

        qtyBox.addEventListener("input", () => {
          state.qty[it.id] = clampNum(qtyBox.value, 0, 999999);
          saveState();
          renderAll();
        });
      }

      row.appendChild(cb);
      row.appendChild(meta);
      if (qtyBox) row.appendChild(qtyBox);

      wrap.appendChild(row);
    }
  }
}

function buildRatesTable() {
  const tbody = $("#ratesBody");
  tbody.innerHTML = "";

  const items = state.data.items || [];
  const markupPct = getPerItemMarkupPct();

  for (const it of items) {
    const rawMat = Number(it.material_rate) || 0;
    const rawLab = Number(it.labor_rate) || 0;

    // marked-up per item (for your internal use)
    const muMat = rawMat * (1 + markupPct);
    const muLab = rawLab * (1 + markupPct);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${it.label}</td>
      <td>${it.display_unit || it.unit}</td>
      <td>${money(rawMat)}</td>
      <td>${money(rawLab)}</td>
      <td>${money(muMat)}</td>
      <td>${money(muLab)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function buildQuote() {
  const tbody = $("#quoteBody");
  tbody.innerHTML = "";

  const items = state.data.items || [];
  const geom = calcGeometry();

  // selected items
  const selected = items.filter(it => (state.toggles[it.id] ?? !!it.default_on));

  // compute raw material subtotal (needed for PCT_MAT)
  let rawMatSubtotal = 0;

  // first pass: normal items (excluding PCT_MAT)
  const rows = [];

  for (const it of selected) {
    const unit = it.unit;

    // skip PCT_MAT until later
    if (unit === "PCT_MAT") continue;

    const q = computeQtyForItem(it, geom, selected);

    const mat = q * (Number(it.material_rate) || 0);
    const lab = q * (Number(it.labor_rate) || 0);

    rawMatSubtotal += mat;

    rows.push({ it, q, mat, lab, total: mat + lab });
  }

  // second pass: PCT_MAT items
  for (const it of selected) {
    if (it.unit !== "PCT_MAT") continue;

    const pct = clampNum(it.material_rate, 0, 1); // store as decimal (0.05 = 5%)
    const mat = rawMatSubtotal * pct;
    const lab = 0;

    rows.push({ it, q: null, mat, lab, total: mat + lab });
  }

  // apply per-item markup to each row total (if enabled)
  const perItemMarkupPct = getPerItemMarkupPct();
  const tariffPct = getTariffPct();
  const globalMarkupPct = getGlobalMarkupPct();

  let rawSubtotal = 0;
  for (const r of rows) rawSubtotal += r.total;

  // customer subtotal after per-item markup
  const afterPerItem = rawSubtotal * (1 + perItemMarkupPct);

  // tariff
  const afterTariff = afterPerItem * (1 + tariffPct);

  // optional global markup
  const grand = afterTariff * (1 + globalMarkupPct);

  // render rows with customer pricing baked in per item (per-item markup applied proportionally)
  // We keep display clean: customer sees Material/Labor/Total already priced.
  const factor = (1 + perItemMarkupPct) * (1 + tariffPct) * (1 + globalMarkupPct);

  for (const r of rows) {
    const it = r.it;

    // q display
    let qDisplay = "";
    if (it.unit === "PCT_MAT") qDisplay = "—";
    else if (it.unit === "SF" && it.convert_lf_to_sf) qDisplay = (clampNum(state.qty[it.id] ?? it.default_qty ?? 0)).toFixed(2); // show LF input
    else qDisplay = (r.q ?? 0).toFixed(2);

    const matP = r.mat * factor;
    const labP = r.lab * factor;
    const totalP = r.total * factor;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${it.label}</td>
      <td>${it.display_unit || it.unit}</td>
      <td>${qDisplay}</td>
      <td>${money(matP)}</td>
      <td>${money(labP)}</td>
      <td><b>${money(totalP)}</b></td>
    `;
    tbody.appendChild(tr);
  }

  $("#rawSubtotal").textContent = money(rawSubtotal);

  // DO NOT show the words “markup/tariff” to customer in print.
  // On-screen you still see status for your own tracking.
  $("#markupApplied").textContent = state.admin.perItemMarkupEnabled ? pctText(perItemMarkupPct) : "OFF";
  $("#tariffApplied").textContent = state.admin.tariffEnabled ? `${Math.round(tariffPct * 100)}%` : "OFF";

  $("#grandTotal").textContent = money(grand);

  // also update banner
  const tierPct = getTierPctForSF(state.inputs.floorSF);
  const tierLabel = state.admin.perItemMarkupEnabled
    ? `Pricing tier: ${Math.round((getPerItemMarkupPct()) * 100)}% (${Math.round(state.inputs.floorSF || 0).toLocaleString()} SF)`
    : `Pricing tier: OFF`;

  $("#markupBanner").textContent = tierLabel;

  return { geom, rawSubtotal, grand };
}

function renderCalculated() {
  const g = calcGeometry();
  $("#outPerimLF").textContent = g.perimLF ? g.perimLF.toFixed(2) : "—";
  $("#outWallSF").textContent = g.wallSF ? g.wallSF.toFixed(2) : "—";
  $("#outPaintSF").textContent = g.paintSF ? g.paintSF.toFixed(2) : "—";
}

function bindTabs() {
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const name = btn.dataset.tab;
      $$(".panel").forEach(p => p.classList.remove("active"));
      $(`#tab-${name}`).classList.add("active");
    });
  });
}

function bindInputs() {
  const bindNum = (id, key) => {
    const el = $(id);
    el.value = state.inputs[key] ? String(state.inputs[key]) : "";
    el.addEventListener("input", () => {
      state.inputs[key] = clampNum(el.value);
      saveState();
      renderAll();
    });
  };

  bindNum("#inFloorSF", "floorSF");
  bindNum("#inCeilFt", "ceilFt");
  bindNum("#inLenFt", "lenFt");
  bindNum("#inWidFt", "widFt");
  bindNum("#inPerimLF", "perimOverrideLF");
}

function bindButtons() {
  $("#clearBtn").addEventListener("click", () => {
    localStorage.removeItem(LS_KEY);
    location.reload();
  });

  $("#printBtn").addEventListener("click", () => {
    // before print, ensure we’re on QUOTE tab
    $$(".tab").forEach(b => b.classList.remove("active"));
    $(`.tab[data-tab="quote"]`).classList.add("active");
    $$(".panel").forEach(p => p.classList.remove("active"));
    $("#tab-quote").classList.add("active");
    setTimeout(() => window.print(), 80);
  });
}

function setupAdmin() {
  const panel = $("#adminPanel");

  const applyBtn = $("#adminApplyBtn");
  const resetBtn = $("#adminResetBtn");

  const mkEnabled = $("#adminMarkupEnabled");
  const mkOverride = $("#adminMarkupOverride");

  const globalEnabled = $("#adminGlobalEnabled");
  const globalPct = $("#adminGlobalPct");

  const tEnabled = $("#adminTariffEnabled");
  const tPct = $("#adminTariffPct");

  function syncAdminFields() {
    mkEnabled.value = state.admin.perItemMarkupEnabled ? "1" : "0";
    mkOverride.value = (state.admin.perItemMarkupOverridePct ?? "") === "" ? "" : String(state.admin.perItemMarkupOverridePct ?? "");

    globalEnabled.value = state.admin.globalMarkupEnabled ? "1" : "0";
    globalPct.value = String(state.admin.globalMarkupPct ?? 0);

    tEnabled.value = state.admin.tariffEnabled ? "1" : "0";
    tPct.value = String(state.admin.tariffPct ?? 0);
  }

  function setMsg(txt) {
    $("#adminStateMsg").textContent = txt || "";
  }

  applyBtn.addEventListener("click", () => {
    state.admin.perItemMarkupEnabled = mkEnabled.value === "1";
    const ov = mkOverride.value.trim();
    state.admin.perItemMarkupOverridePct = ov === "" ? null : clampNum(ov, 0, 500);

    state.admin.globalMarkupEnabled = globalEnabled.value === "1";
    state.admin.globalMarkupPct = clampNum(globalPct.value, 0, 500);

    state.admin.tariffEnabled = tEnabled.value === "1";
    state.admin.tariffPct = clampNum(tPct.value, 0, 500);

    saveState();
    renderAll();
    setMsg("Saved.");
    setTimeout(() => setMsg(""), 1200);
  });

  resetBtn.addEventListener("click", () => {
    state.admin.perItemMarkupEnabled = true;
    state.admin.perItemMarkupOverridePct = null;
    state.admin.globalMarkupEnabled = false;
    state.admin.globalMarkupPct = 0;
    state.admin.tariffEnabled = false;
    state.admin.tariffPct = 0;

    syncAdminFields();
    saveState();
    renderAll();
    setMsg("Reset.");
    setTimeout(() => setMsg(""), 1200);
  });

  // iPhone friendly long-press on logo
  let pressTimer = null;
  const logo = $("#companyLogo");

  const startPress = () => {
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      const pin = prompt("Admin PIN:");
      if (pin === ADMIN_PIN) {
        state.admin.unlocked = true;
        panel.classList.remove("hidden");
        syncAdminFields();
        setMsg("Admin unlocked.");
        setTimeout(() => setMsg(""), 1200);
      } else {
        setMsg("Wrong PIN.");
        setTimeout(() => setMsg(""), 1200);
      }
    }, 1200);
  };
  const endPress = () => clearTimeout(pressTimer);

  logo.addEventListener("touchstart", startPress, { passive: true });
  logo.addEventListener("touchend", endPress);
  logo.addEventListener("mousedown", startPress);
  logo.addEventListener("mouseup", endPress);

  // panel visible only if unlocked
  if (state.admin.unlocked) panel.classList.remove("hidden");
  else panel.classList.add("hidden");

  syncAdminFields();
}

function fillCompanyHeader() {
  const c = state.data.settings.company;
  $("#companyName").textContent = c.name;
  $("#companyPhone").textContent = `📞 ${c.phone}`;
  $("#companyPhone").href = `tel:${c.phone.replace(/\D/g, "")}`;
  $("#companyEmail").textContent = `✉️ ${c.email}`;
  $("#companyEmail").href = `mailto:${c.email}`;
  $("#companyLogo").src = c.logo || "logo.png";
}

function renderAll() {
  renderCalculated();
  buildRatesTable();
  buildQuote();
}

async function boot() {
  try {
    loadSaved();
    state.data = await loadData();

    // defaults
    if (!state.inputs.ceilFt) state.inputs.ceilFt = state.data.settings.defaults.ceilingHeight || 8;

    fillCompanyHeader();
    bindTabs();
    bindInputs();
    bindButtons();

    // build UI
    buildScopeList();

    // Admin fields exist in HTML (see index below)
    setupAdmin();

    // Initial render
    renderAll();
  } catch (e) {
    alert(
      "Error loading app files.\n\n" +
      "Most common cause: data.json is not VALID JSON (NO comments allowed).\n\n" +
      "Fix: replace data.json with the one I gave you, then hard refresh."
    );
    console.error(e);
  }
}

boot();
