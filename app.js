/* Haroon & Sons Consulting Quote - app.js
   - Loads data.json
   - Builds scope list + rates table
   - Calculates quantities (auto + manual)
   - Supports: per-item tier markup + optional global markup + optional tariff
   - Fixes: Plumbing Supplies Allowance + Job Consumables (PCT_MAT)
   - Fixes: Print/PDF header + total + table alignment
*/

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- DOM ----------
  const elLogo = $("#companyLogo");
  const elName = $("#companyName");
  const elPhone = $("#companyPhone");
  const elEmail = $("#companyEmail");
  const elMarkupBanner = $("#markupBanner");

  const tabBtns = $$(".tab");
  const panels = {
    input: $("#tab-input"),
    quote: $("#tab-quote"),
    rates: $("#tab-rates"),
  };

  const inFloorSF = $("#inFloorSF");
  const inCeilFt = $("#inCeilFt");
  const inLenFt = $("#inLenFt");
  const inWidFt = $("#inWidFt");
  const inPerimLF = $("#inPerimLF");

  const outPerimLF = $("#outPerimLF");
  const outWallSF = $("#outWallSF");
  const outPaintSF = $("#outPaintSF");

  const scopeList = $("#scopeList");
  const quoteBody = $("#quoteBody");
  const ratesBody = $("#ratesBody");

  const rawSubtotalEl = $("#rawSubtotal");
  const markupAppliedEl = $("#markupApplied");
  const tariffAppliedEl = $("#tariffApplied");
  const grandTotalEl = $("#grandTotal");

  const printBtn = $("#printBtn");
  const clearBtn = $("#clearBtn");

  // Print header area (must exist in HTML)
  const printCompanyName = $("#printCompanyName");
  const printCompanyPhone = $("#printCompanyPhone");
  const printCompanyEmail = $("#printCompanyEmail");
  const printProjectSummary = $("#printProjectSummary");
  const printGrandTotal = $("#printGrandTotal");

  // Admin
  const adminPanel = $("#adminPanel");
  const adminMarkupEnabled = $("#adminMarkupEnabled");
  const adminMarkupOverride = $("#adminMarkupOverride");
  const adminTariffEnabled = $("#adminTariffEnabled");
  const adminTariffPct = $("#adminTariffPct");
  const adminApplyBtn = $("#adminApplyBtn");
  const adminResetBtn = $("#adminResetBtn");
  const adminStateMsg = $("#adminStateMsg");

  // ---------- STATE ----------
  const STORAGE_KEY = "hs_quote_state_v2";

  let DATA = null;

  const state = {
    // Geometry
    floorSF: 0,
    ceilFt: 8,
    lenFt: 0,
    widFt: 0,
    perimOverride: 0,

    // Scope selections + qty
    selected: {},      // { itemId: true/false }
    qty: {},           // manual qty overrides: { itemId: number }

    // Admin controls (hidden)
    admin: {
      markupEnabled: true,           // per-item tier markup on/off (affects priced unit rate)
      markupOverridePct: null,       // if set, overrides tier pct for per-item markup (priced unit rates)
      globalMarkupEnabled: false,    // optional global markup over (material+labor) totals
      globalMarkupPct: 0,            // percent
      tariffEnabled: false,          // optional tariff on totals
      tariffPct: 0,                  // percent
    }
  };

  // ---------- HELPERS ----------
  const fmtMoney = (n) => {
    const x = Number(n || 0);
    return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
  };
  const fmtNum = (n, digits = 2) => {
    const x = Number(n || 0);
    return x.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const parseNum = (v) => {
    const x = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };

  function getVersionParam() {
    const u = new URL(window.location.href);
    return u.searchParams.get("v") || "";
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);

      // shallow merge with validation
      if (obj && typeof obj === "object") {
        Object.assign(state, obj);
        state.admin = Object.assign(state.admin, obj.admin || {});
      }
    } catch {}
  }

  function clearState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // ---------- MARKUP TIERS ----------
  function tierPctForSF(sf) {
    const tiers = (DATA?.markupTiers || []).slice().sort((a,b) => a.maxSF - b.maxSF);
    const s = Number(sf || 0);
    for (const t of tiers) {
      if (s <= t.maxSF) return t.pct;
    }
    // If beyond last tier, use last pct
    return tiers.length ? tiers[tiers.length - 1].pct : 0.25;
  }

  function effectivePerItemMarkupPct() {
    if (!DATA) return 0;
    if (!state.admin.markupEnabled) return 0;

    const override = parseNum(state.admin.markupOverridePct);
    if (override > 0) return override / 100;

    return tierPctForSF(state.floorSF);
  }

  // ---------- GEOMETRY ----------
  function calcPerimeterLF() {
    // If override provided, use it
    if (state.perimOverride > 0) return state.perimOverride;

    // If length & width provided, perimeter = 2(L+W)
    if (state.lenFt > 0 && state.widFt > 0) return 2 * (state.lenFt + state.widFt);

    // Fallback: approximate square footprint => side = sqrt(area), perim = 4*side
    const s = Math.sqrt(Math.max(0, state.floorSF));
    return 4 * s;
  }

  function calcWallSF(perimLF) {
    return Math.max(0, perimLF) * Math.max(0, state.ceilFt);
  }

  function calcPaintSF(wallSF) {
    // Walls + ceiling
    return Math.max(0, wallSF) + Math.max(0, state.floorSF);
  }

  // ---------- SPECIAL QTY RULES ----------
  function getManualQty(itemId) {
    return parseNum(state.qty[itemId]);
  }

  function sumSelectedEach(itemIds) {
    let total = 0;
    for (const id of itemIds) {
      if (state.selected[id]) total += getManualQty(id);
    }
    return total;
  }

  function computeQtyForItem(item, derived) {
    // derived = { perimLF, wallSF, paintSF }
    const unit = item.unit;

    // Units that map to derived geometry
    if (unit === "FLOOR_SF") return derived.floorSF;
    if (unit === "WALL_SF") return derived.wallSF;
    if (unit === "PAINT_SF") return derived.paintSF;
    if (unit === "LF") return derived.perimLF;

    // Manual per-item qty for EACH or manual LF items
    if (unit === "EACH" || unit === "LF_MANUAL" || unit === "SF_MANUAL") {
      return getManualQty(item.id);
    }

    // Door hardware: qty = sum of door quantities
    if (unit === "DOOR_COUNT") {
      const doorIds = DATA?.rules?.doorCountFrom || [];
      const doorCount = sumSelectedEach(doorIds);
      // allow manual override if user typed qty for this item
      const manual = getManualQty(item.id);
      return manual > 0 ? manual : doorCount;
    }

    // Door casing LF: qty = doors * casingLFPerDoor
    if (unit === "DOOR_CASING_LF") {
      const doorIds = DATA?.rules?.doorCountFrom || [];
      const doorCount = sumSelectedEach(doorIds);
      const perDoor = parseNum(DATA?.rules?.casingLFPerDoor || 0);
      return doorCount * perDoor;
    }

    // Plumbing supplies allowance: qty = total selected plumbing fixtures count
    if (unit === "PLUMB_FIXTURE_COUNT") {
      const ids = DATA?.rules?.plumbingFixtureFrom || [];
      return sumSelectedEach(ids);
    }

    // Consumables: % of raw materials subtotal (computed later)
    if (unit === "PCT_MAT") {
      return 1; // qty is not meaningful; we compute value from % later
    }

    // Countertops: input LF (manual) -> convert to SF using depth (ft)
    if (unit === "COUNTER_LF_TO_SF") {
      const lf = getManualQty(item.id);
      const depthFt = parseNum(DATA?.rules?.counterDepthFt || 2.0833); // 25" default
      // area = lf * depth
      return lf * depthFt;
    }

    // default
    return 0;
  }

  // ---------- PRICING ----------
  function pricedUnitRate(rawRate, perItemPct) {
    // perItemPct is decimal (0.25)
    return rawRate * (1 + perItemPct);
  }

  function calcLine(item, derived, perItemPct, rawMaterialsSubtotal) {
    const qty = computeQtyForItem(item, derived);

    const rawMatRate = parseNum(item.mat);
    const rawLabRate = parseNum(item.lab);

    // Per-item priced rates
    const matRate = pricedUnitRate(rawMatRate, perItemPct);
    const labRate = pricedUnitRate(rawLabRate, perItemPct);

    let matTotal = qty * matRate;
    let labTotal = qty * labRate;

    // Special: Consumables % of raw materials subtotal
    if (item.unit === "PCT_MAT") {
      const pct = parseNum(item.pctOfMaterials || 0);
      // NOTE: consumables often treated as MATERIAL only
      matTotal = rawMaterialsSubtotal * (pct / 100);
      labTotal = 0;
    }

    return {
      id: item.id,
      label: item.label,
      unit: item.unit,
      qty,
      rawMatRate,
      rawLabRate,
      matRate,
      labRate,
      matTotal,
      labTotal,
      lineTotal: matTotal + labTotal
    };
  }

  // ---------- UI BUILDERS ----------
  function setActiveTab(key) {
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === key));
    Object.keys(panels).forEach(k => panels[k].classList.toggle("active", k === key));
  }

  function buildScopeList() {
    scopeList.innerHTML = "";

    for (const item of DATA.items) {
      // show only selectable items
      if (item.hiddenInScope) continue;

      const wrap = document.createElement("div");
      wrap.className = "chk";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "flex-start";
      left.style.gap = "10px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!state.selected[item.id];
      cb.addEventListener("change", () => {
        state.selected[item.id] = cb.checked;
        // if newly selected and needs qty, default to 1
        if (cb.checked && (item.unit === "EACH" || item.unit === "LF_MANUAL" || item.unit === "SF_MANUAL" || item.unit === "COUNTER_LF_TO_SF")) {
          if (!state.qty[item.id] || parseNum(state.qty[item.id]) === 0) state.qty[item.id] = 1;
        }
        saveState();
        recalcAndRender();
      });

      const txt = document.createElement("div");

      const title = document.createElement("b");
      title.textContent = item.label;

      const sub = document.createElement("small");
      const unitLabel = item.unit;
      const mat = fmtNum(item.mat, 2);
      const lab = fmtNum(item.lab, 2);

      // Make unit human-friendly
      let u = unitLabel;
      if (u === "FLOOR_SF") u = "FLOOR_SF";
      if (u === "WALL_SF") u = "WALL_SF";
      if (u === "PAINT_SF") u = "PAINT_SF";
      if (u === "LF") u = "LF";
      if (u === "EACH") u = "EACH";
      if (u === "LF_MANUAL") u = "LF (manual)";
      if (u === "COUNTER_LF_TO_SF") u = "LF (input → SF)";

      sub.textContent = `${u} • material ${mat} • labor ${lab}`;

      txt.appendChild(title);
      txt.appendChild(sub);

      left.appendChild(cb);
      left.appendChild(txt);

      wrap.appendChild(left);

      // qty input for manual items (EACH / LF_MANUAL / COUNTER_LF_TO_SF)
      const needsQty = ["EACH", "LF_MANUAL", "SF_MANUAL", "COUNTER_LF_TO_SF", "DOOR_COUNT"].includes(item.unit);
      if (needsQty) {
        const qtyWrap = document.createElement("div");
        qtyWrap.style.marginLeft = "auto";
        qtyWrap.style.display = "flex";
        qtyWrap.style.flexDirection = "column";
        qtyWrap.style.gap = "6px";
        qtyWrap.style.minWidth = "120px";

        const labEl = document.createElement("span");
        labEl.style.color = "var(--muted)";
        labEl.style.fontSize = "12px";
        labEl.textContent = "Qty";

        const qtyIn = document.createElement("input");
        qtyIn.type = "number";
        qtyIn.inputMode = "decimal";
        qtyIn.min = "0";
        qtyIn.step = "1";
        qtyIn.value = String(parseNum(state.qty[item.id]));
        qtyIn.disabled = !cb.checked;

        qtyIn.addEventListener("input", () => {
          state.qty[item.id] = parseNum(qtyIn.value);
          saveState();
          recalcAndRender();
        });

        cb.addEventListener("change", () => {
          qtyIn.disabled = !cb.checked;
          if (cb.checked && parseNum(qtyIn.value) === 0) {
            qtyIn.value = "1";
            state.qty[item.id] = 1;
          }
        });

        qtyWrap.appendChild(labEl);
        qtyWrap.appendChild(qtyIn);
        wrap.appendChild(qtyWrap);
      }

      scopeList.appendChild(wrap);
    }
  }

  function buildRatesTable(derived, perItemPct) {
    ratesBody.innerHTML = "";

    for (const item of DATA.items) {
      // Show all rates
      const tr = document.createElement("tr");

      const tdItem = document.createElement("td");
      tdItem.className = "left";
      tdItem.textContent = item.label;

      const tdUnit = document.createElement("td");
      tdUnit.textContent = friendlyUnit(item.unit);

      // RAW unit rates
      const tdRawMat = document.createElement("td");
      tdRawMat.textContent = fmtMoney(parseNum(item.mat));

      const tdRawLab = document.createElement("td");
      tdRawLab.textContent = fmtMoney(parseNum(item.lab));

      // PRICED unit rates (tier markup applied)
      const pricedMat = fmtMoney(pricedUnitRate(parseNum(item.mat), perItemPct));
      const pricedLab = fmtMoney(pricedUnitRate(parseNum(item.lab), perItemPct));

      const tdMkMat = document.createElement("td");
      tdMkMat.textContent = pricedMat;

      const tdMkLab = document.createElement("td");
      tdMkLab.textContent = pricedLab;

      tr.appendChild(tdItem);
      tr.appendChild(tdUnit);
      tr.appendChild(tdRawMat);
      tr.appendChild(tdRawLab);
      tr.appendChild(tdMkMat);
      tr.appendChild(tdMkLab);

      ratesBody.appendChild(tr);
    }
  }

  function friendlyUnit(u) {
    if (u === "FLOOR_SF") return "FLOOR_SF";
    if (u === "WALL_SF") return "WALL_SF";
    if (u === "PAINT_SF") return "PAINT_SF";
    if (u === "LF") return "LF";
    if (u === "EACH") return "EACH";
    if (u === "LF_MANUAL") return "LF (manual)";
    if (u === "SF_MANUAL") return "SF (manual)";
    if (u === "PCT_MAT") return "PCT_MAT";
    if (u === "DOOR_COUNT") return "EACH (auto doors)";
    if (u === "DOOR_CASING_LF") return "LF (auto)";
    if (u === "PLUMB_FIXTURE_COUNT") return "EACH (auto fixtures)";
    if (u === "COUNTER_LF_TO_SF") return "LF (→ SF)";
    return u || "";
  }

  // ---------- MAIN CALC + RENDER ----------
  function recalcAndRender() {
    // Pull inputs
    state.floorSF = parseNum(inFloorSF.value);
    state.ceilFt = clamp(parseNum(inCeilFt.value) || 8, 6, 12);
    state.lenFt = parseNum(inLenFt.value);
    state.widFt = parseNum(inWidFt.value);
    state.perimOverride = parseNum(inPerimLF.value);

    // Derived geometry
    const perimLF = calcPerimeterLF();
    const wallSF = calcWallSF(perimLF);
    const paintSF = calcPaintSF(wallSF);

    const derived = { floorSF: state.floorSF, perimLF, wallSF, paintSF };

    outPerimLF.textContent = fmtNum(perimLF, 2);
    outWallSF.textContent = fmtNum(wallSF, 2);
    outPaintSF.textContent = fmtNum(paintSF, 2);

    // Tier + admin banner (internal wording OK on app; PDF will hide)
    const tierPct = tierPctForSF(state.floorSF);
    const effPct = effectivePerItemMarkupPct();

    elMarkupBanner.textContent = `Pricing tier: ${(tierPct * 100).toFixed(0)}% (${fmtNum(state.floorSF, 0)} SF)`;

    // Rates page (raw + priced)
    buildRatesTable(derived, effPct);

    // ---- First pass: compute raw materials subtotal for selected items (RAW, before consumables)
    // We need this because PCT_MAT depends on raw materials subtotal.
    let rawMaterialsSubtotal = 0;
    for (const item of DATA.items) {
      if (!state.selected[item.id]) continue;
      if (item.unit === "PCT_MAT") continue; // computed later
      // raw materials = qty * rawMatRate (NO per-item markup)
      const qty = computeQtyForItem(item, derived);
      rawMaterialsSubtotal += qty * parseNum(item.mat);
    }

    // ---- Second pass: build priced lines (per-item markup applied)
    const lines = [];
    let rawSubtotalPriced = 0;

    for (const item of DATA.items) {
      if (!state.selected[item.id]) continue;

      const line = calcLine(item, derived, effPct, rawMaterialsSubtotal);
      lines.push(line);
      rawSubtotalPriced += line.lineTotal;
    }

    // Optional global markup over combined total (material+labor)
    let globalMarkupPct = 0;
    if (state.admin.globalMarkupEnabled) {
      globalMarkupPct = clamp(parseNum(state.admin.globalMarkupPct), 0, 200) / 100;
    }
    const globalMarkupAmt = rawSubtotalPriced * globalMarkupPct;

    // Optional tariff
    let tariffPct = 0;
    if (state.admin.tariffEnabled) {
      tariffPct = clamp(parseNum(state.admin.tariffPct), 0, 50) / 100;
    }
    const tariffAmt = (rawSubtotalPriced + globalMarkupAmt) * tariffPct;

    const grandTotal = rawSubtotalPriced + globalMarkupAmt + tariffAmt;

    // Quote table
    quoteBody.innerHTML = "";
    for (const line of lines) {
      const tr = document.createElement("tr");

      const tdItem = document.createElement("td");
      tdItem.className = "left";
      tdItem.textContent = line.label;

      const tdUnit = document.createElement("td");
      tdUnit.textContent = friendlyUnit(line.unit);

      const tdQty = document.createElement("td");
      // For PCT_MAT, show dash
      tdQty.textContent = (line.unit === "PCT_MAT") ? "—" : fmtNum(line.qty, 2);

      const tdMat = document.createElement("td");
      tdMat.textContent = fmtMoney(line.matTotal);

      const tdLab = document.createElement("td");
      tdLab.textContent = fmtMoney(line.labTotal);

      const tdTot = document.createElement("td");
      tdTot.textContent = fmtMoney(line.lineTotal);

      tr.appendChild(tdItem);
      tr.appendChild(tdUnit);
      tr.appendChild(tdQty);
      tr.appendChild(tdMat);
      tr.appendChild(tdLab);
      tr.appendChild(tdTot);

      quoteBody.appendChild(tr);
    }

    // Totals (UI)
    rawSubtotalEl.textContent = fmtMoney(rawSubtotalPriced);

    // IMPORTANT: on-screen you can see state; PDF will hide these labels entirely
    const perItemPctShown = state.admin.markupEnabled ? (effPct * 100).toFixed(0) + "%" : "OFF";
    const globalShown = state.admin.globalMarkupEnabled ? `${(globalMarkupPct * 100).toFixed(0)}%` : "OFF";
    markupAppliedEl.textContent = state.admin.globalMarkupEnabled ? `Global ${globalShown}` : `Per-item ${perItemPctShown}`;

    tariffAppliedEl.textContent = state.admin.tariffEnabled ? `${(tariffPct * 100).toFixed(0)}%` : "OFF";

    grandTotalEl.textContent = fmtMoney(grandTotal);

    // Print header values
    if (printCompanyName) printCompanyName.textContent = DATA.company.name;
    if (printCompanyPhone) printCompanyPhone.textContent = DATA.company.phone;
    if (printCompanyEmail) printCompanyEmail.textContent = DATA.company.email;

    if (printProjectSummary) {
      printProjectSummary.textContent =
        `Project: ${fmtNum(state.floorSF, 0)} SF • Ceiling: ${fmtNum(state.ceilFt, 0)} ft • Perimeter: ${fmtNum(perimLF, 0)} LF`;
    }
    if (printGrandTotal) printGrandTotal.textContent = fmtMoney(grandTotal);

    saveState();
  }

  // ---------- ADMIN UNLOCK ----------
  let pressTimer = null;

  function unlockAdmin() {
    const pin = prompt("Enter admin PIN:");
    if (!pin) return;
    if (pin === String(DATA?.adminPin || "2528")) {
      adminPanel.classList.remove("hidden");
      adminStateMsg.textContent = "Admin unlocked on this device.";
    } else {
      alert("Wrong PIN");
    }
  }

  function wireAdmin() {
    // reflect state to controls
    adminMarkupEnabled.value = state.admin.markupEnabled ? "1" : "0";
    adminMarkupOverride.value = state.admin.markupOverridePct ?? "";
    adminTariffEnabled.value = state.admin.tariffEnabled ? "1" : "0";
    adminTariffPct.value = state.admin.tariffPct ?? "";

    // Advanced global markup controls (if present in JSON config, we’ll create them)
    const adv = $("#adminAdvanced");
    if (adv) adv.remove();

    const advWrap = document.createElement("div");
    advWrap.id = "adminAdvanced";
    advWrap.className = "grid";
    advWrap.style.marginTop = "12px";

    const mk2 = document.createElement("label");
    mk2.className = "field";
    mk2.innerHTML = `
      <span>Global Markup Enabled (over total)</span>
      <select id="adminGlobalEnabled">
        <option value="0">OFF</option>
        <option value="1">ON</option>
      </select>
    `;

    const mk3 = document.createElement("label");
    mk3.className = "field";
    mk3.innerHTML = `
      <span>Global Markup %</span>
      <input id="adminGlobalPct" type="number" inputmode="decimal" placeholder="e.g., 10" />
    `;

    advWrap.appendChild(mk2);
    advWrap.appendChild(mk3);
    adminPanel.querySelector(".grid").after(advWrap);

    const adminGlobalEnabled = $("#adminGlobalEnabled");
    const adminGlobalPct = $("#adminGlobalPct");

    adminGlobalEnabled.value = state.admin.globalMarkupEnabled ? "1" : "0";
    adminGlobalPct.value = state.admin.globalMarkupPct ?? 0;

    adminApplyBtn.addEventListener("click", () => {
      state.admin.markupEnabled = adminMarkupEnabled.value === "1";
      const mo = parseNum(adminMarkupOverride.value);
      state.admin.markupOverridePct = mo > 0 ? mo : null;

      state.admin.tariffEnabled = adminTariffEnabled.value === "1";
      state.admin.tariffPct = parseNum(adminTariffPct.value);

      state.admin.globalMarkupEnabled = adminGlobalEnabled.value === "1";
      state.admin.globalMarkupPct = parseNum(adminGlobalPct.value);

      adminStateMsg.textContent = "Applied.";
      saveState();
      recalcAndRender();
    });

    adminResetBtn.addEventListener("click", () => {
      state.admin = {
        markupEnabled: true,
        markupOverridePct: null,
        globalMarkupEnabled: false,
        globalMarkupPct: 0,
        tariffEnabled: false,
        tariffPct: 0
      };

      adminMarkupEnabled.value = "1";
      adminMarkupOverride.value = "";
      adminTariffEnabled.value = "0";
      adminTariffPct.value = "";
      adminGlobalEnabled.value = "0";
      adminGlobalPct.value = "0";

      adminStateMsg.textContent = "Admin reset.";
      saveState();
      recalcAndRender();
    });
  }

  // ---------- INIT ----------
  async function loadData() {
    const v = getVersionParam();
    const url = v ? `data.json?v=${encodeURIComponent(v)}` : "data.json";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
    return await res.json();
  }

  function initCompany() {
    elName.textContent = DATA.company.name;
    elPhone.textContent = `📞 ${DATA.company.phone}`;
    elPhone.href = `tel:${DATA.company.phone.replace(/[^\d+]/g, "")}`;
    elEmail.textContent = `✉️ ${DATA.company.email}`;
    elEmail.href = `mailto:${DATA.company.email}`;

    // logo
    elLogo.src = DATA.company.logo;
    elLogo.addEventListener("error", () => {
      // keep it simple if image fails
      elLogo.style.opacity = "0.35";
    });

    // print header
    if (printCompanyName) printCompanyName.textContent = DATA.company.name;
    if (printCompanyPhone) printCompanyPhone.textContent = DATA.company.phone;
    if (printCompanyEmail) printCompanyEmail.textContent = DATA.company.email;
  }

  function initTabs() {
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });
  }

  function initInputs() {
    inFloorSF.value = state.floorSF || "";
    inCeilFt.value = state.ceilFt || 8;
    inLenFt.value = state.lenFt || "";
    inWidFt.value = state.widFt || "";
    inPerimLF.value = state.perimOverride || "";

    [inFloorSF, inCeilFt, inLenFt, inWidFt, inPerimLF].forEach(inp => {
      inp.addEventListener("input", () => {
        saveState();
        recalcAndRender();
      });
    });
  }

  function initActions() {
    printBtn.addEventListener("click", () => {
      // Ensure totals are updated in print header
      recalcAndRender();
      window.print();
    });

    clearBtn.addEventListener("click", () => {
      if (!confirm("Clear all selections & inputs on this device?")) return;
      // Reset most state
      state.floorSF = 0;
      state.ceilFt = 8;
      state.lenFt = 0;
      state.widFt = 0;
      state.perimOverride = 0;
      state.selected = {};
      state.qty = {};
      // keep admin state
      saveState();
      initInputs();
      buildScopeList();
      recalcAndRender();
    });

    // Long press logo to unlock admin
    elLogo.addEventListener("touchstart", () => {
      pressTimer = setTimeout(unlockAdmin, 1200);
    }, { passive: true });
    elLogo.addEventListener("touchend", () => clearTimeout(pressTimer), { passive: true });

    elLogo.addEventListener("mousedown", () => {
      pressTimer = setTimeout(unlockAdmin, 1200);
    });
    elLogo.addEventListener("mouseup", () => clearTimeout(pressTimer));
    elLogo.addEventListener("mouseleave", () => clearTimeout(pressTimer));
  }

  function showLoadError(e) {
    alert(
      "Error loading app files.\n\n" +
      "Make sure index.html, app.js, styles.css, data.json are all in the SAME folder on GitHub Pages.\n\n" +
      "Details: " + (e?.message || e)
    );
  }

  // Boot
  (async function boot() {
    loadState();
    try {
      DATA = await loadData();
      initCompany();
      initTabs();
      initInputs();
      buildScopeList();
      wireAdmin();
      initActions();
      recalcAndRender();
    } catch (e) {
      console.error(e);
      showLoadError(e);
    }
  })();

})();
