/* Haroon & Sons Consulting Quote — FINAL
   - Loads data.json
   - Calculates geometry (perimeter, wall SF, paint SF)
   - Scope toggles + qty inputs for EACH/LF
   - Raw subtotal + sqft markup tiers (one markup, not 25/35%)
   - Hidden admin (long-press logo) for markup/tariff overrides
   - iPhone friendly
   - LocalStorage persistence
*/

(() => {
  const VERSION = "9999"; // bump this if you want to hard-refresh caches
  const LS_KEY = "hsq_state_v1";

  const $ = (id) => document.getElementById(id);
  const fmtMoney = (n) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
  const fmtNum = (n, d=1) => (Number.isFinite(n) ? n.toFixed(d) : "—");

  let DATA = null;

  // App state (persisted)
  const state = {
    inputs: {
      floorSF: "",
      ceilFt: "",
      lenFt: "",
      widFt: "",
      perimLF: ""
    },
    scope: {
      // id: { on: true/false, qty: number|null, qtyOverride: boolean }
    },
    admin: {
      unlocked: false,
      markupEnabled: true,
      markupOverridePct: "",  // "" => no override
      tariffEnabled: false,
      tariffPct: ""           // "" => 0
    }
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return;
      // shallow merge safe
      if (s.inputs) Object.assign(state.inputs, s.inputs);
      if (s.scope) state.scope = s.scope;
      if (s.admin) Object.assign(state.admin, s.admin);
    } catch { /* ignore */ }
  }

  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  function hardReset() {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    location.reload();
  }

  function showFatal(msg) {
    const el = $("fatal");
    if (!el) {
      alert(msg);
      return;
    }
    el.classList.remove("hidden");
    el.textContent = msg;
  }

  function parseNum(v) {
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : 0;
  }

  function getDefaultCeil() {
    return parseNum(DATA?.settings?.defaults?.ceilingHeight) || 8;
  }

  function getMarkupTier(sf) {
    const tiers = DATA?.settings?.markup_tiers || [];
    for (const t of tiers) {
      if (sf <= t.max_sf) return t;
    }
    // fallback
    return { max_sf: 999999, pct: 0.25, label: "25%" };
  }

  function getMarkupPct(sf) {
    if (!state.admin.markupEnabled) return 0;

    const override = parseNum(state.admin.markupOverridePct);
    if (override > 0) return override / 100;

    return getMarkupTier(sf).pct || 0;
  }

  function getTariffPct() {
    if (!state.admin.tariffEnabled) return 0;
    const p = parseNum(state.admin.tariffPct);
    return p > 0 ? (p / 100) : 0;
  }

  function geometry() {
    const floorSF = parseNum($("inFloorSF").value);
    const ceilFt = parseNum($("inCeilFt").value) || getDefaultCeil();
    const lenFt = parseNum($("inLenFt").value);
    const widFt = parseNum($("inWidFt").value);
    const perimOverride = parseNum($("inPerimLF").value);

    // Perimeter:
    // 1) manual override wins
    // 2) else if length/width available -> 2(L+W)
    // 3) else sqrt(area)*4 (square assumption)
    let perimLF = 0;
    if (perimOverride > 0) perimLF = perimOverride;
    else if (lenFt > 0 && widFt > 0) perimLF = 2 * (lenFt + widFt);
    else if (floorSF > 0) perimLF = Math.sqrt(floorSF) * 4;

    const wallSF = perimLF * ceilFt;
    const paintSF = wallSF + floorSF; // walls + ceiling (area)

    $("outPerimLF").textContent = floorSF > 0 ? fmtNum(perimLF, 1) : "—";
    $("outWallSF").textContent = floorSF > 0 ? fmtNum(wallSF, 0) : "—";
    $("outPaintSF").textContent = floorSF > 0 ? fmtNum(paintSF, 0) : "—";

    return { floorSF, ceilFt, lenFt, widFt, perimLF, wallSF, paintSF };
  }

  function qtyForItem(item, geo) {
    // Unit-driven quantities
    const unit = item.unit;

    // Scope overrides (for EACH/LF typically)
    const s = state.scope[item.id];
    const hasOverrideQty = s && typeof s.qty === "number" && Number.isFinite(s.qty);

    if (unit === "EACH") {
      return hasOverrideQty ? s.qty : (parseNum(item.default_qty) || 0);
    }

    if (unit === "LF") {
      // allow override for LF too
      return hasOverrideQty ? s.qty : geo.perimLF;
    }

    if (unit === "FLOOR_SF") return geo.floorSF;
    if (unit === "WALL_SF") return geo.wallSF;
    if (unit === "PAINT_SF") return geo.paintSF;

    // fallback
    return hasOverrideQty ? s.qty : 0;
  }

  function ensureScopeDefaults() {
    for (const item of DATA.items) {
      if (!state.scope[item.id]) {
        state.scope[item.id] = {
          on: !!item.default_on,
          qty: (typeof item.default_qty === "number") ? item.default_qty : null
        };
      } else {
        // make sure existing has on
        if (typeof state.scope[item.id].on !== "boolean") state.scope[item.id].on = !!item.default_on;
        if (!("qty" in state.scope[item.id])) state.scope[item.id].qty = null;
      }
    }
  }

  function renderScopeList() {
    const wrap = $("scopeList");
    wrap.innerHTML = "";

    // group by category (optional)
    const groups = new Map();
    for (const it of DATA.items) {
      const cat = it.category || "Scope";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(it);
    }

    for (const [cat, items] of groups.entries()) {
      const h = document.createElement("div");
      h.className = "groupTitle";
      h.textContent = cat;
      wrap.appendChild(h);

      for (const it of items) {
        const row = document.createElement("div");
        row.className = "chk";

        const s = state.scope[it.id] || { on: !!it.default_on, qty: it.default_qty ?? null };

        const left = document.createElement("label");
        left.className = "chkLeft";
        left.innerHTML = `
          <input type="checkbox" ${s.on ? "checked" : ""} data-id="${it.id}">
          <div>
            <b>${escapeHtml(it.label)}</b>
            <small>${escapeHtml(it.unit)} • mat ${fmtMoney(it.material_rate)} • labor ${fmtMoney(it.labor_rate)}</small>
          </div>
        `;

        const right = document.createElement("div");
        right.className = "chkRight";

        // Qty input only for EACH/LF (because SF ones are auto-calc)
        if (it.unit === "EACH" || it.unit === "LF") {
          const val = (typeof s.qty === "number" && Number.isFinite(s.qty)) ? String(s.qty) : "";
          right.innerHTML = `
            <div class="qtybox">
              <span class="qtylbl">Qty</span>
              <input class="qtyin" type="number" inputmode="decimal" step="0.1" data-qty="${it.id}" placeholder="${it.unit === "EACH" ? "0" : "auto"}" value="${val}">
            </div>
          `;
        } else {
          right.innerHTML = `<div class="qtybox ghost">auto</div>`;
        }

        row.appendChild(left);
        row.appendChild(right);
        wrap.appendChild(row);
      }
    }

    // bind events
    wrap.querySelectorAll('input[type="checkbox"][data-id]').forEach(cb => {
      cb.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-id");
        state.scope[id] = state.scope[id] || {};
        state.scope[id].on = e.target.checked;
        saveState();
        recalcAndRender();
      });
    });

    wrap.querySelectorAll('input[data-qty]').forEach(inp => {
      inp.addEventListener("input", (e) => {
        const id = e.target.getAttribute("data-qty");
        const v = parseNum(e.target.value);
        state.scope[id] = state.scope[id] || {};
        // allow blank => null
        if (String(e.target.value).trim() === "") state.scope[id].qty = null;
        else state.scope[id].qty = v;
        saveState();
        recalcAndRender();
      });
    });
  }

  function renderRatesTable() {
    const body = $("ratesBody");
    body.innerHTML = "";

    for (const it of DATA.items) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="left">${escapeHtml(it.label)}</td>
        <td>${escapeHtml(it.unit)}</td>
        <td>${fmtMoney(it.material_rate)}</td>
        <td>${fmtMoney(it.labor_rate)}</td>
      `;
      body.appendChild(tr);
    }
  }

  function buildQuoteRows(geo) {
    const rows = [];
    let rawSubtotal = 0;
    let matSubtotal = 0;
    let labSubtotal = 0;

    for (const it of DATA.items) {
      const s = state.scope[it.id];
      const on = s ? !!s.on : !!it.default_on;
      if (!on) continue;

      const qty = qtyForItem(it, geo);
      const mat = qty * (parseNum(it.material_rate) || 0);
      const lab = qty * (parseNum(it.labor_rate) || 0);
      const total = mat + lab;

      rawSubtotal += total;
      matSubtotal += mat;
      labSubtotal += lab;

      rows.push({ it, qty, mat, lab, total });
    }

    return { rows, rawSubtotal, matSubtotal, labSubtotal };
  }

  function recalcAndRender() {
    if (!DATA) return;

    // inputs persist
    state.inputs.floorSF = $("inFloorSF").value;
    state.inputs.ceilFt = $("inCeilFt").value;
    state.inputs.lenFt = $("inLenFt").value;
    state.inputs.widFt = $("inWidFt").value;
    state.inputs.perimLF = $("inPerimLF").value;
    saveState();

    const geo = geometry();
    const { rows, rawSubtotal, matSubtotal } = buildQuoteRows(geo);

    // markup and tariff
    const mkPct = getMarkupPct(geo.floorSF);
    const mkAmt = rawSubtotal * mkPct;

    // tariff is applied to MATERIAL subtotal only (clean + defensible)
    const tfPct = getTariffPct();
    const tfAmt = matSubtotal * tfPct;

    const grand = rawSubtotal + mkAmt + tfAmt;

    // banner
    const tier = getMarkupTier(geo.floorSF);
    const bannerLabel = state.admin.markupEnabled
      ? (parseNum(state.admin.markupOverridePct) > 0 ? `${parseNum(state.admin.markupOverridePct)}% (override)` : `${tier.label} (by sqft)`)
      : "OFF";

    $("markupBanner").textContent = `Markup tier: ${bannerLabel}`;

    // totals
    $("rawSubtotal").textContent = fmtMoney(rawSubtotal);
    $("markupApplied").textContent = state.admin.markupEnabled ? `${Math.round(mkPct * 100)}%` : "OFF";
    $("tariffApplied").textContent = state.admin.tariffEnabled ? `${parseNum(state.admin.tariffPct)}%` : "OFF";
    $("grandTotal").textContent = fmtMoney(grand);

    // quote table
    const qb = $("quoteBody");
    qb.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="left">${escapeHtml(r.it.label)}</td>
        <td>${escapeHtml(r.it.unit)}</td>
        <td>${fmtNum(r.qty, r.it.unit === "EACH" ? 0 : 1)}</td>
        <td>${fmtMoney(r.mat)}</td>
        <td>${fmtMoney(r.lab)}</td>
        <td>${fmtMoney(r.total)}</td>
      `;
      qb.appendChild(tr);
    }
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.getAttribute("data-tab");
        $("tab-" + tab).classList.add("active");
      });
    });
  }

  function bindButtons() {
    $("printBtn").addEventListener("click", () => window.print());
    $("clearBtn").addEventListener("click", hardReset);

    $("adminApplyBtn").addEventListener("click", () => {
      state.admin.markupEnabled = $("adminMarkupEnabled").value === "1";
      state.admin.markupOverridePct = String($("adminMarkupOverride").value || "").trim();
      state.admin.tariffEnabled = $("adminTariffEnabled").value === "1";
      state.admin.tariffPct = String($("adminTariffPct").value || "").trim();

      saveState();
      recalcAndRender();
      $("adminStateMsg").textContent = "Admin settings applied.";
    });

    $("adminResetBtn").addEventListener("click", () => {
      state.admin.markupEnabled = true;
      state.admin.markupOverridePct = "";
      state.admin.tariffEnabled = false;
      state.admin.tariffPct = "";
      saveState();
      recalcAndRender();
      $("adminStateMsg").textContent = "Admin reset.";
    });
  }

  function bindInputs() {
    ["inFloorSF", "inCeilFt", "inLenFt", "inWidFt", "inPerimLF"].forEach(id => {
      $(id).addEventListener("input", recalcAndRender);
    });
  }

  function applyStateToInputs() {
    $("inFloorSF").value = state.inputs.floorSF ?? "";
    $("inCeilFt").value = state.inputs.ceilFt ?? "";
    $("inLenFt").value = state.inputs.lenFt ?? "";
    $("inWidFt").value = state.inputs.widFt ?? "";
    $("inPerimLF").value = state.inputs.perimLF ?? "";
  }

  function applyStateToAdminUI() {
    $("adminMarkupEnabled").value = state.admin.markupEnabled ? "1" : "0";
    $("adminMarkupOverride").value = state.admin.markupOverridePct ?? "";
    $("adminTariffEnabled").value = state.admin.tariffEnabled ? "1" : "0";
    $("adminTariffPct").value = state.admin.tariffPct ?? "";
  }

  function bindAdminUnlock() {
    const logo = $("companyLogo");
    let timer = null;

    const start = () => {
      timer = setTimeout(() => {
        const pin = prompt("Enter Admin PIN");
        if (pin === String(DATA.settings.admin.pin)) {
          state.admin.unlocked = true;
          $("adminPanel").classList.remove("hidden");
          saveState();
          $("adminStateMsg").textContent = "Admin unlocked.";
        } else {
          alert("Wrong PIN");
        }
      }, 1200);
    };

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    // iPhone + desktop
    logo.addEventListener("touchstart", start, { passive: true });
    logo.addEventListener("touchend", stop);
    logo.addEventListener("touchcancel", stop);
    logo.addEventListener("mousedown", start);
    logo.addEventListener("mouseup", stop);
    logo.addEventListener("mouseleave", stop);
  }

  function applyCompanyBrand() {
    const c = DATA.settings.company;
    $("companyName").textContent = c.name;
    $("companyPhone").textContent = c.phone;
    $("companyPhone").href = `tel:${c.phone}`;
    $("companyEmail").textContent = c.email;
    $("companyEmail").href = `mailto:${c.email}`;
    $("companyLogo").src = c.logo;

    // show admin panel if already unlocked
    if (state.admin.unlocked) $("adminPanel").classList.remove("hidden");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function boot() {
    loadState();

    try {
      const res = await fetch(`data.json?v=${VERSION}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.items)) throw new Error("Invalid data.json structure");
      DATA = json;
    } catch (e) {
      showFatal(`ERROR: data.json failed to load/parse. Check filename is EXACTLY "data.json" and valid JSON.\n\n${String(e)}`);
      return;
    }

    ensureScopeDefaults();
    applyStateToInputs();
    bindTabs();
    bindButtons();
    bindInputs();

    applyCompanyBrand();
    applyStateToAdminUI();
    bindAdminUnlock();

    renderScopeList();
    renderRatesTable();
    recalcAndRender();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
