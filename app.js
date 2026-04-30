/* Haroon & Sons Consulting Quote - Home Addition Tool */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const STORAGE_KEY = "hs_home_addition_v1";
  const ADMIN_PIN = "2528";

  const fmtMoney = (n) => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
  const fmtNum = (n, d = 2) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const parseNum = (v) => {
    const x = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };

  const state = {
    clientName: "",
    clientAddress: "",
    lenFt: 0,
    widFt: 0,
    floorSF: 0,
    ceilFt: 8,
    perimOverride: 0,
    selected: {},
    admin: {
      markupPct: 30,
      tariffEnabled: false,
      tariffPct: 0,
      overrideEnabled: false,
      overrideTotal: 0
    }
  };

  const DEFAULT_ITEMS = [
    { id: "permits", label: "Permits / Drawings / Admin", bucket: "Permits & Drawings", unit: "PROJECT", qty: 1, mat: 2500, lab: 500 },
    { id: "footings", label: "Footings / Foundation Allowance", bucket: "Foundation", unit: "FLOOR_SF", mat: 35, lab: 8 },
    { id: "framing", label: "Wall & Floor Framing", bucket: "Framing", unit: "FLOOR_SF", mat: 42, lab: 18 },
    { id: "roof", label: "One-Way Slope Roof System", bucket: "Roofing", unit: "FLOOR_SF", mat: 24, lab: 10 },
    { id: "siding", label: "Exterior Siding / Sheathing", bucket: "Exterior", unit: "WALL_SF", mat: 8, lab: 5 },
    { id: "windows", label: "Windows", bucket: "Windows & Doors", unit: "EACH", mat: 450, lab: 175 },
    { id: "doors", label: "Exterior Door", bucket: "Windows & Doors", unit: "EACH", mat: 650, lab: 250 },
    { id: "electric", label: "Electrical Rough-In Allowance", bucket: "Electrical", unit: "FLOOR_SF", mat: 8, lab: 7 },
    { id: "insulation", label: "Insulation", bucket: "Insulation", unit: "WALL_SF", mat: 2.5, lab: 1.5 },
    { id: "drywall", label: "Drywall / Tape / Finish", bucket: "Drywall", unit: "PAINT_SF", mat: 2.25, lab: 3.5 },
    { id: "paint", label: "Primer & Paint", bucket: "Paint", unit: "PAINT_SF", mat: 1.25, lab: 2 },
    { id: "flooring", label: "Flooring Allowance", bucket: "Flooring", unit: "FLOOR_SF", mat: 5, lab: 4 },
    { id: "trim", label: "Baseboard / Interior Trim", bucket: "Trim", unit: "LF", mat: 3, lab: 3 }
  ];

  let pressTimer = null;

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.assign(state, saved);
      state.admin = Object.assign(state.admin, saved.admin || {});
    } catch {}
  }

  function calcGeometry() {
    let len = parseNum($("#inLenFt")?.value);
    let wid = parseNum($("#inWidFt")?.value);
    let manualSF = parseNum($("#inFloorSF")?.value);
    let ceil = parseNum($("#inCeilFt")?.value) || 8;
    let perimOverride = parseNum($("#inPerimLF")?.value);

    let area = len > 0 && wid > 0 ? len * wid : manualSF;
    let perimeter = perimOverride > 0 ? perimOverride : (len > 0 && wid > 0 ? 2 * (len + wid) : 4 * Math.sqrt(area || 0));
    let wallSF = perimeter * ceil;
    let paintSF = wallSF + area;

    state.lenFt = len;
    state.widFt = wid;
    state.floorSF = area;
    state.ceilFt = ceil;
    state.perimOverride = perimOverride;

    $("#outAreaSF") && ($("#outAreaSF").textContent = fmtNum(area, 0));
    $("#outPerimLF") && ($("#outPerimLF").textContent = fmtNum(perimeter, 0));
    $("#outWallSF") && ($("#outWallSF").textContent = fmtNum(wallSF, 0));
    $("#outPaintSF") && ($("#outPaintSF").textContent = fmtNum(paintSF, 0));

    return { area, perimeter, wallSF, paintSF };
  }

  function qtyFor(item, g) {
    if (item.unit === "FLOOR_SF") return g.area;
    if (item.unit === "WALL_SF") return g.wallSF;
    if (item.unit === "PAINT_SF") return g.paintSF;
    if (item.unit === "LF") return g.perimeter;
    if (item.unit === "PROJECT") return 1;
    if (item.unit === "EACH") return parseNum($("#qty_" + item.id)?.value);
    return 0;
  }

  function buildScope() {
    const box = $("#scopeList");
    if (!box) return;
    box.innerHTML = "";

    DEFAULT_ITEMS.forEach((item) => {
      if (state.selected[item.id] === undefined) state.selected[item.id] = true;

      const row = document.createElement("div");
      row.className = "chk";

      row.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" id="sel_${item.id}" ${state.selected[item.id] ? "checked" : ""}>
          <div>
            <b>${item.label}</b>
            <small>${item.unit} • Material ${fmtMoney(item.mat)} • Labor ${fmtMoney(item.lab)}</small>
          </div>
        </div>
        ${item.unit === "EACH" ? `<input id="qty_${item.id}" type="number" inputmode="decimal" min="0" value="${item.id === "windows" ? 4 : 1}" style="max-width:90px;">` : ""}
      `;

      box.appendChild(row);

      $("#sel_" + item.id).addEventListener("change", (e) => {
        state.selected[item.id] = e.target.checked;
        recalc();
      });

      $("#qty_" + item.id)?.addEventListener("input", recalc);
    });
  }

  function recalc() {
    const g = calcGeometry();

    state.clientName = ($("#inClientName")?.value || "").trim();
    state.clientAddress = ($("#inClientAddress")?.value || "").trim();

    state.admin.markupPct = parseNum($("#adminMarkupOverride")?.value) || 0;
    state.admin.tariffEnabled = $("#adminTariffEnabled")?.value === "1";
    state.admin.tariffPct = parseNum($("#adminTariffPct")?.value) || 0;
    state.admin.overrideEnabled = $("#adminOverrideEnabled")?.value === "1";
    state.admin.overrideTotal = parseNum($("#adminOverrideTotal")?.value) || 0;

    const lines = [];
    let rawMat = 0;
    let rawLab = 0;

    DEFAULT_ITEMS.forEach((item) => {
      if (!state.selected[item.id]) return;

      const qty = qtyFor(item, g);
      const matTotal = qty * item.mat;
      const labTotal = qty * item.lab;

      rawMat += matTotal;
      rawLab += labTotal;

      lines.push({
        ...item,
        qty,
        matTotal,
        labTotal,
        rawTotal: matTotal + labTotal
      });
    });

    const rawTotal = rawMat + rawLab;
    const markupAmt = rawTotal * (state.admin.markupPct / 100);
    const subtotal = rawTotal + markupAmt;
    const tariffAmt = state.admin.tariffEnabled ? subtotal * (state.admin.tariffPct / 100) : 0;
    const calculatedTotal = subtotal + tariffAmt;

    const finalTotal =
      state.admin.overrideEnabled && state.admin.overrideTotal > 0
        ? state.admin.overrideTotal
        : calculatedTotal;

    const difference = finalTotal - calculatedTotal;

    renderTables(lines, finalTotal);
    renderPrint(g, lines, calculatedTotal, finalTotal, difference);
    renderAdmin(calculatedTotal, difference);

    $("#rawMatTotal") && ($("#rawMatTotal").textContent = fmtMoney(rawMat));
    $("#rawLabTotal") && ($("#rawLabTotal").textContent = fmtMoney(rawLab));
    $("#rawGrandTotal") && ($("#rawGrandTotal").textContent = fmtMoney(calculatedTotal));
    $("#rawSubtotal") && ($("#rawSubtotal").textContent = fmtMoney(subtotal));
    $("#markupApplied") && ($("#markupApplied").textContent = `${state.admin.markupPct}%`);
    $("#tariffApplied") && ($("#tariffApplied").textContent = state.admin.tariffEnabled ? `${state.admin.tariffPct}%` : "OFF");
    $("#grandTotal") && ($("#grandTotal").textContent = fmtMoney(finalTotal));

    $("#markupBanner") && ($("#markupBanner").textContent = `Markup: ${state.admin.markupPct}% • Final: ${fmtMoney(finalTotal)}`);

    save();
  }

  function renderTables(lines, finalTotal) {
    const quoteBody = $("#quoteBody");
    if (quoteBody) {
      quoteBody.innerHTML = "";
      lines.forEach((line) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="left">${line.label}</td>
          <td>${line.unit}</td>
          <td>${fmtNum(line.qty, 2)}</td>
          <td>${fmtMoney(line.matTotal)}</td>
          <td>${fmtMoney(line.labTotal)}</td>
          <td>${fmtMoney(line.rawTotal)}</td>
        `;
        quoteBody.appendChild(tr);
      });
    }

    const bucketBody = $("#bucketBody");
    if (bucketBody) {
      const buckets = {};
      lines.forEach((line) => {
        buckets[line.bucket] = (buckets[line.bucket] || 0) + line.rawTotal;
      });

      bucketBody.innerHTML = "";
      Object.entries(buckets).forEach(([name, total]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${name}</td><td>${fmtMoney(total)}</td>`;
        bucketBody.appendChild(tr);
      });
    }

    $("#bucketGrandTotal") && ($("#bucketGrandTotal").textContent = fmtMoney(finalTotal));
    $("#clientPrintGrandTotal") && ($("#clientPrintGrandTotal").textContent = fmtMoney(finalTotal));
  }

  function renderPrint(g, lines, calculatedTotal, finalTotal, difference) {
    const summary = `${fmtNum(g.area, 0)} SF • Ceiling ${fmtNum(state.ceilFt, 0)} ft • Perimeter ${fmtNum(g.perimeter, 0)} LF`;

    $("#clientPrintClientName") && ($("#clientPrintClientName").textContent = state.clientName || "—");
    $("#clientPrintClientAddress") && ($("#clientPrintClientAddress").textContent = state.clientAddress || "—");
    $("#clientPrintProjectSummary") && ($("#clientPrintProjectSummary").textContent = summary);
    $("#clientPrintDateStamp") && ($("#clientPrintDateStamp").textContent = new Date().toLocaleDateString());

    $("#printClientName") && ($("#printClientName").textContent = state.clientName || "—");
    $("#printClientAddress") && ($("#printClientAddress").textContent = state.clientAddress || "—");
    $("#printProjectSummary") && ($("#printProjectSummary").textContent = summary);
    $("#printDateStamp") && ($("#printDateStamp").textContent = new Date().toLocaleDateString());
    $("#printGrandTotal") && ($("#printGrandTotal").textContent = fmtMoney(finalTotal));
  }

  function renderAdmin(calculatedTotal, difference) {
    $("#adminCalculatedTotal") && ($("#adminCalculatedTotal").textContent = fmtMoney(calculatedTotal));
    $("#adminOverrideDifference") && ($("#adminOverrideDifference").textContent = fmtMoney(difference));
  }

  function buildRates() {
    const body = $("#ratesBody");
    if (!body) return;
    body.innerHTML = "";

    DEFAULT_ITEMS.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="left">${item.label}</td>
        <td>${item.unit}</td>
        <td>${fmtMoney(item.mat)}</td>
        <td>${fmtMoney(item.lab)}</td>
      `;
      body.appendChild(tr);
    });
  }

  function unlockAdmin() {
    const pin = prompt("Enter admin PIN:");
    if (pin === ADMIN_PIN) {
      $("#adminPanel")?.classList.remove("hidden");
      $("#adminStateMsg") && ($("#adminStateMsg").textContent = "Admin unlocked.");
    } else if (pin) {
      alert("Wrong PIN");
    }
  }

  function initTabs() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        $$(".panel").forEach((p) => p.classList.remove("active"));
        $("#tab-" + btn.dataset.tab)?.classList.add("active");
      });
    });
  }

  function initInputs() {
    $("#inClientName") && ($("#inClientName").value = state.clientName || "");
    $("#inClientAddress") && ($("#inClientAddress").value = state.clientAddress || "");
    $("#inLenFt") && ($("#inLenFt").value = state.lenFt || "");
    $("#inWidFt") && ($("#inWidFt").value = state.widFt || "");
    $("#inFloorSF") && ($("#inFloorSF").value = state.floorSF || "");
    $("#inCeilFt") && ($("#inCeilFt").value = state.ceilFt || 8);
    $("#inPerimLF") && ($("#inPerimLF").value = state.perimOverride || "");

    $("#adminMarkupOverride") && ($("#adminMarkupOverride").value = state.admin.markupPct || "");
    $("#adminTariffEnabled") && ($("#adminTariffEnabled").value = state.admin.tariffEnabled ? "1" : "0");
    $("#adminTariffPct") && ($("#adminTariffPct").value = state.admin.tariffPct || "");
    $("#adminOverrideEnabled") && ($("#adminOverrideEnabled").value = state.admin.overrideEnabled ? "1" : "0");
    $("#adminOverrideTotal") && ($("#adminOverrideTotal").value = state.admin.overrideTotal || "");

    $$("input, select").forEach((el) => el.addEventListener("input", recalc));
    $$("select").forEach((el) => el.addEventListener("change", recalc));

    $("#adminApplyBtn")?.addEventListener("click", recalc);

    $("#adminResetBtn")?.addEventListener("click", () => {
      state.admin = {
        markupPct: 30,
        tariffEnabled: false,
        tariffPct: 0,
        overrideEnabled: false,
        overrideTotal: 0
      };
      initInputs();
      recalc();
    });

    $("#clearBtn")?.addEventListener("click", () => {
      if (!confirm("Clear this estimate?")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }

  function initPrint() {
    function setMode(mode) {
      document.body.dataset.print = mode;
      recalc();
      window.print();
    }

    $("#printClientBtn")?.addEventListener("click", () => setMode("client"));
    $("#printInternalBtn")?.addEventListener("click", () => setMode("internal"));
    $("#printBothBtn")?.addEventListener("click", () => setMode("both"));
  }

  function initLogo() {
    const logo = $("#companyLogo");
    if (!logo) return;

    logo.addEventListener("touchstart", () => {
      pressTimer = setTimeout(unlockAdmin, 1200);
    }, { passive: true });

    logo.addEventListener("touchend", () => clearTimeout(pressTimer), { passive: true });
    logo.addEventListener("mousedown", () => pressTimer = setTimeout(unlockAdmin, 1200));
    logo.addEventListener("mouseup", () => clearTimeout(pressTimer));
    logo.addEventListener("mouseleave", () => clearTimeout(pressTimer));
  }

  function boot() {
    load();
    initTabs();
    initInputs();
    buildScope();
    buildRates();
    initPrint();
    initLogo();
    recalc();
  }

  boot();
})();
