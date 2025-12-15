(() => {
  const $ = (id) => document.getElementById(id);

  const state = {
    data: null,
    // inputs
    serviceType: "Contractor",
    areaSF: "",
    lengthFt: "",
    widthFt: "",
    perimeterOverride: "",
    heightFt: 8,
    custName: "",
    custAddress: "",
    custNotes: "",
    // toggles/qty
    scopeOn: {},
    fixtureQty: {},
    doorQty: {},
    addonOn: {},
    // settings
    muMat: 0.25,
    muLab: 0.35,
    multHandy: 1.0,
    multContract: 1.0,
    // computed quote
    lastQuote: null
  };

  function fmtMoney(n){
    if (!isFinite(n)) return "$—";
    return n.toLocaleString(undefined, { style:"currency", currency:"USD" });
  }
  function fmtNum(n){
    if (!isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function numOrEmpty(v){
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    return isFinite(n) ? n : "";
  }

  function toNum(v, fallback = 0){
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function loadSettings(){
    const raw = localStorage.getItem("hs_quote_settings_v1");
    if (!raw) return;
    try{
      const s = JSON.parse(raw);
      if (typeof s.muMat === "number") state.muMat = s.muMat;
      if (typeof s.muLab === "number") state.muLab = s.muLab;
      if (typeof s.multHandy === "number") state.multHandy = s.multHandy;
      if (typeof s.multContract === "number") state.multContract = s.multContract;
    }catch{}
  }

  function saveSettings(){
    localStorage.setItem("hs_quote_settings_v1", JSON.stringify({
      muMat: state.muMat,
      muLab: state.muLab,
      multHandy: state.multHandy,
      multContract: state.multContract
    }));
  }

  function computeGeometry(){
    const H = toNum(state.heightFt, 8);

    // If L & W provided, compute area/perimeter from them
    const L = toNum(state.lengthFt, 0);
    const W = toNum(state.widthFt, 0);

    let area = toNum(state.areaSF, 0);

    if (L > 0 && W > 0) area = L * W;

    // If user typed an override perimeter, use it
    const perOverride = toNum(state.perimeterOverride, 0);

    let perimeter = 0;
    if (perOverride > 0) {
      perimeter = perOverride;
    } else if (L > 0 && W > 0) {
      perimeter = 2 * (L + W);
    } else if (area > 0) {
      // spreadsheet logic: 4*sqrt(area)
      perimeter = 4 * Math.sqrt(area);
    }

    const wallSF = perimeter * H;
    const paintSF = wallSF + area;

    return {
      areaSF: area,
      perimeterLF: perimeter,
      wallSF,
      paintSF,
      heightFt: H
    };
  }

  function initDefaultsFromData(){
    const d = state.data;
    // defaults
    state.heightFt = d.defaults.heightFt ?? 8;
    state.muMat = d.defaults.materialsMarkup ?? 0.25;
    state.muLab = d.defaults.laborMarkup ?? 0.35;
    state.multHandy = d.defaults.handymanMultiplier ?? 1.0;
    state.multContract = d.defaults.contractorMultiplier ?? 1.0;

    // toggles default ON for scope + addons except subpanel (commonly off)
    d.scopeItems.forEach(x => state.scopeOn[x.key] = (x.key !== "subpanel"));
    d.addons.forEach(x => state.addonOn[x.key] = true);

    // default quantities 0
    d.fixtures.forEach(x => state.fixtureQty[x.key] = 0);
    d.doors.forEach(x => state.doorQty[x.key] = 0);

    // name default
    state.custName = "Haroon Malik";
  }

  function renderLists(){
    const d = state.data;

    // Scope toggles
    const scope = $("scopeList");
    scope.innerHTML = "";
    d.scopeItems.forEach(item => {
      scope.appendChild(makeToggleRow(item.label, item.unit, state.scopeOn[item.key], (checked) => {
        state.scopeOn[item.key] = checked;
      }));
    });

    // Fixtures qty
    const fixtures = $("fixtureList");
    fixtures.innerHTML = "";
    d.fixtures.forEach(item => {
      fixtures.appendChild(makeQtyRow(item.label, item.unit, state.fixtureQty[item.key], (val) => {
        state.fixtureQty[item.key] = val;
      }));
    });

    // Doors qty
    const doors = $("doorList");
    doors.innerHTML = "";
    d.doors.forEach(item => {
      doors.appendChild(makeQtyRow(item.label, item.unit, state.doorQty[item.key], (val) => {
        state.doorQty[item.key] = val;
      }));
    });

    // Addons toggles
    const addons = $("addonList");
    addons.innerHTML = "";
    d.addons.forEach(item => {
      addons.appendChild(makeToggleRow(item.label, item.unit, state.addonOn[item.key], (checked) => {
        state.addonOn[item.key] = checked;
      }));
    });
  }

  function makeToggleRow(title, unit, checked, onChange){
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.className = "left";
    left.innerHTML = `<div class="rowTitle">${escapeHtml(title)}</div><div class="rowSub">${escapeHtml(unit)}</div>`;

    const right = document.createElement("div");
    right.className = "toggleWrap";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox";
    cb.checked = !!checked;
    cb.addEventListener("change", () => onChange(cb.checked));
    right.appendChild(cb);

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function makeQtyRow(title, unit, value, onChange){
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.className = "left";
    left.innerHTML = `<div class="rowTitle">${escapeHtml(title)}</div><div class="rowSub">${escapeHtml(unit)}</div>`;

    const right = document.createElement("div");
    right.className = "toggleWrap";

    const inp = document.createElement("input");
    inp.type = "number";
    inp.inputMode = "decimal";
    inp.className = "qty";
    inp.value = String(value ?? 0);
    inp.addEventListener("input", () => {
      const n = toNum(inp.value, 0);
      onChange(n);
    });
    right.appendChild(inp);

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function updateGeometryUI(){
    const g = computeGeometry();

    $("outPerimeter").textContent = g.perimeterLF > 0 ? fmtNum(g.perimeterLF) : "—";
    $("outWallSF").textContent = g.wallSF > 0 ? fmtNum(g.wallSF) : "—";
    $("outPaintSF").textContent = g.paintSF > 0 ? fmtNum(g.paintSF) : "—";
  }

  function getServiceMultiplier(){
    const t = state.serviceType;
    if (t === "Handyman") return toNum(state.multHandy, 1.0);
    return toNum(state.multContract, 1.0);
  }

  function buildRatesTable(){
    const d = state.data;
    const tbody = $("ratesTable").querySelector("tbody");
    tbody.innerHTML = "";

    Object.keys(d.rates).forEach(name => {
      const r = d.rates[name];
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(r.unit)}</td>
        <td class="right">${fmtMoney(toNum(r.mat,0))}${r.unit.includes("SF") || r.unit === "LF" ? " /unit" : " /ea"}</td>
        <td class="right">${fmtMoney(toNum(r.lab,0))}${r.unit.includes("SF") || r.unit === "LF" ? " /unit" : " /ea"}</td>
      `;
      tbody.appendChild(tr);
    });

    $("ratesMeta").textContent =
      `Materials MU: ${(state.muMat*100).toFixed(0)}% • Labor MU: ${(state.muLab*100).toFixed(0)}%`;
  }

  function calcQuote(){
    const d = state.data;
    const g = computeGeometry();

    if (!(g.areaSF > 0)) {
      alert("Enter Project Area (SF), or Length & Width.");
      return null;
    }

    const muMat = toNum(state.muMat, 0.25);
    const muLab = toNum(state.muLab, 0.35);
    const serviceMult = getServiceMultiplier();

    const totalDoors =
      toNum(state.doorQty.doorHollow,0) +
      toNum(state.doorQty.doorSolid,0) +
      toNum(state.doorQty.doorCloset,0);

    const totalFixtures =
      toNum(state.fixtureQty.toilet,0) +
      toNum(state.fixtureQty.vanityFaucet,0) +
      toNum(state.fixtureQty.showerPkg,0) +
      toNum(state.fixtureQty.kitchenSinkFaucet,0) +
      toNum(state.fixtureQty.dishwasher,0) +
      toNum(state.fixtureQty.fridgeIce,0) +
      toNum(state.fixtureQty.barSinkFaucet,0) +
      toNum(state.fixtureQty.upflush,0);

    function unitsFor(unitCode){
      switch(unitCode){
        case "FLOOR_SF": return g.areaSF;
        case "WALL_SF": return g.wallSF;
        case "PAINT_SF": return g.paintSF;
        case "LF": return g.perimeterLF;
        case "EACH": return 1;
        case "EACH_FIXTURE": return totalFixtures;
        case "EACH_DOOR": return totalDoors;
        case "DOOR_CASING_LF": return totalDoors * 14; // spreadsheet: doors*14 LF
        default: return 0;
      }
    }

    // helper to add line
    const lines = [];
    function addLine(label, unitCode, units, rateName){
      if (!(units > 0)) return;

      const rate = d.rates[rateName];
      if (!rate) return;

      const matRaw = units * toNum(rate.mat,0);
      const labRaw = units * toNum(rate.lab,0);

      const mat = matRaw * (1 + muMat);
      const lab = labRaw * (1 + muLab);
      let sell = (mat + lab) * serviceMult;

      lines.push({
        item: label,
        unit: unitCode,
        units,
        mat,
        lab,
        sell,
        matRaw,
        labRaw
      });
    }

    // Scope
    d.scopeItems.forEach(s => {
      if (!state.scopeOn[s.key]) return;
      const u = unitsFor(s.unit);
      addLine(s.label, s.unit, u, s.label);
    });

    // Fixtures (qty)
    d.fixtures.forEach(f => {
      const q = toNum(state.fixtureQty[f.key],0);
      if (!(q > 0)) return;
      addLine(f.label, "EACH", q, f.label);
    });

    // Doors (qty)
    d.doors.forEach(dr => {
      const q = toNum(state.doorQty[dr.key],0);
      if (!(q > 0)) return;
      addLine(dr.label, "EACH", q, dr.label);
    });

    // Addons
    d.addons.forEach(a => {
      if (!state.addonOn[a.key]) return;

      if (a.unit === "PCT_MAT") {
        // compute after raw materials subtotal is known
        return;
      }
      const u = unitsFor(a.unit);
      addLine(a.label, a.unit, u, a.label);
    });

    // Raw material subtotal (before markup) for PCT_MAT add-on
    const rawMaterialSubtotal = lines.reduce((sum, x) => sum + (x.matRaw || 0), 0);

    // PCT_MAT line
    const pctAddon = d.addons.find(x => x.unit === "PCT_MAT" && x.key === "jobConsumables");
    if (pctAddon && state.addonOn[pctAddon.key]) {
      const rate = d.rates[pctAddon.label];
      const pct = toNum(rate?.mat, 0.05);
      const matRaw = rawMaterialSubtotal * pct;
      const mat = matRaw * (1 + muMat);
      const lab = 0;
      const sell = (mat + lab) * serviceMult;
      lines.push({
        item: pctAddon.label,
        unit: "PCT_MAT",
        units: pct * 100, // show as percent
        mat,
        lab,
        sell,
        matRaw,
        labRaw: 0
      });
    }

    // Totals
    const totMat = lines.reduce((s,x)=>s + x.mat, 0);
    const totLab = lines.reduce((s,x)=>s + x.lab, 0);
    const totAll = lines.reduce((s,x)=>s + x.sell, 0);

    return {
      geometry: g,
      muMat, muLab,
      serviceType: state.serviceType,
      serviceMult,
      lines,
      totals: { totMat, totLab, totAll }
    };
  }

  function renderQuote(q){
    state.lastQuote = q;

    const g = q.geometry;
    $("quoteMeta").textContent =
      `Floor/Area SF: ${fmtNum(g.areaSF)} • Perimeter LF: ${fmtNum(g.perimeterLF)} • Wall SF: ${fmtNum(g.wallSF)} • Paint SF: ${fmtNum(g.paintSF)} • Materials MU: ${(q.muMat*100).toFixed(0)}% • Labor MU: ${(q.muLab*100).toFixed(0)}%`;

    const tbody = $("quoteTable").querySelector("tbody");
    tbody.innerHTML = "";

    q.lines.forEach(line => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(line.item)}</td>
        <td>${escapeHtml(line.unit)}</td>
        <td class="right">${line.unit === "PCT_MAT" ? fmtNum(line.units) + "%" : fmtNum(line.units)}</td>
        <td class="right">${fmtMoney(line.mat)}</td>
        <td class="right">${fmtMoney(line.lab)}</td>
        <td class="right"><strong>${fmtMoney(line.sell)}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    $("totMat").textContent = fmtMoney(q.totals.totMat);
    $("totLab").textContent = fmtMoney(q.totals.totLab);
    $("totAll").textContent = fmtMoney(q.totals.totAll);
  }

  function buildPrintArea(){
    const q = state.lastQuote;
    if (!q) return;

    const d = state.data;
    const g = q.geometry;

    const name = state.custName || "";
    const addr = state.custAddress || "";
    const notes = state.custNotes || "";

    const rows = q.lines.map(line => {
      const unitsText = (line.unit === "PCT_MAT") ? (fmtNum(line.units) + "%") : fmtNum(line.units);
      return `
        <tr>
          <td>${escapeHtml(line.item)}</td>
          <td>${escapeHtml(line.unit)}</td>
          <td style="text-align:right">${unitsText}</td>
          <td style="text-align:right">${fmtMoney(line.mat)}</td>
          <td style="text-align:right">${fmtMoney(line.lab)}</td>
          <td style="text-align:right"><strong>${fmtMoney(line.sell)}</strong></td>
        </tr>`;
    }).join("");

    $("printArea").innerHTML = `
      <div class="pHeader">
        <div class="pBrand">
          <img class="pLogo" src="${escapeHtml(d.company.logoPath)}" alt="logo"/>
          <div>
            <p class="pTitle">${escapeHtml(d.company.name)} Quote</p>
            <div class="pMeta">Phone: ${escapeHtml(d.company.phone)} • Email: ${escapeHtml(d.company.email)}</div>
            <div class="pMeta">Customer: <strong>${escapeHtml(name)}</strong></div>
            <div class="pMeta">Address: <strong>${escapeHtml(addr)}</strong></div>
          </div>
        </div>
        <div class="pRight">
          <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
          <div><strong>Service:</strong> ${escapeHtml(state.serviceType)}</div>
          <div><strong>Area SF:</strong> ${fmtNum(g.areaSF)}</div>
          <div><strong>Perimeter LF:</strong> ${fmtNum(g.perimeterLF)}</div>
          <div><strong>Wall SF:</strong> ${fmtNum(g.wallSF)}</div>
          <div><strong>Paint SF:</strong> ${fmtNum(g.paintSF)}</div>
          <div><strong>MU:</strong> Mat ${(q.muMat*100).toFixed(0)}% • Labor ${(q.muLab*100).toFixed(0)}%</div>
        </div>
      </div>

      ${notes ? `<div class="pSectionTitle">Notes</div><div style="font-size:12px;margin-bottom:10px;">${escapeHtml(notes)}</div>` : ""}

      <div class="pSectionTitle">Line Items</div>
      <table class="pTable">
        <thead>
          <tr>
            <th>Item</th><th>Unit</th><th>Units</th><th>Material (w/ markup)</th><th>Labor (w/ markup)</th><th>Sell Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="pTotals">
        <div class="pTotalsBox">
          <div class="pTotalsRow"><span>Total Materials</span><strong>${fmtMoney(q.totals.totMat)}</strong></div>
          <div class="pTotalsRow"><span>Total Labor</span><strong>${fmtMoney(q.totals.totLab)}</strong></div>
          <div class="pTotalsRow" style="border-top:2px solid #000;padding-top:8px;">
            <span>TOTAL</span><strong>${fmtMoney(q.totals.totAll)}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function wireInputs(){
    $("areaSF").addEventListener("input", (e)=>{ state.areaSF = e.target.value; updateGeometryUI(); });
    $("lengthFt").addEventListener("input", (e)=>{ state.lengthFt = e.target.value; updateGeometryUI(); });
    $("widthFt").addEventListener("input", (e)=>{ state.widthFt = e.target.value; updateGeometryUI(); });
    $("perimeterOverride").addEventListener("input",(e)=>{ state.perimeterOverride = e.target.value; updateGeometryUI(); });
    $("heightFt").addEventListener("input",(e)=>{ state.heightFt = e.target.value; updateGeometryUI(); });

    $("custName").addEventListener("input",(e)=>{ state.custName = e.target.value; });
    $("custAddress").addEventListener("input",(e)=>{ state.custAddress = e.target.value; });
    $("custNotes").addEventListener("input",(e)=>{ state.custNotes = e.target.value; });

    $("btnCalc").addEventListener("click", ()=>{
      const q = calcQuote();
      if (!q) return;
      renderQuote(q);
      // auto jump to QUOTE tab
      setTab("quote");
    });

    $("btnPrint").addEventListener("click", ()=>{
      if (!state.lastQuote){
        const q = calcQuote();
        if (!q) return;
        renderQuote(q);
      }
      buildPrintArea();
      window.print();
    });

    // settings
    $("muMat").addEventListener("input",(e)=> state.muMat = toNum(e.target.value, state.muMat));
    $("muLab").addEventListener("input",(e)=> state.muLab = toNum(e.target.value, state.muLab));
    $("multHandy").addEventListener("input",(e)=> state.multHandy = toNum(e.target.value, state.multHandy));
    $("multContract").addEventListener("input",(e)=> state.multContract = toNum(e.target.value, state.multContract));

    $("btnSaveSettings").addEventListener("click", ()=>{
      saveSettings();
      buildRatesTable();
      alert("Settings saved.");
    });

    // tabs
    $("tabs").addEventListener("click",(e)=>{
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setTab(btn.dataset.tab);
    });
  }

  function setTab(tab){
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    $(`tab-${tab}`).classList.remove("hidden");

    if (tab === "rates") buildRatesTable();
    if (tab === "quote" && state.lastQuote) renderQuote(state.lastQuote);
  }

  async function boot(){
    // IMPORTANT: your repo should contain: index.html, styles.css, app.js, data.json, logo.png
    const res = await fetch("./data.json?v=1", { cache: "no-store" });
    const data = await res.json();
    state.data = data;

    initDefaultsFromData();
    loadSettings(); // override defaults if saved previously

    // apply defaults to UI
    $("heightFt").value = String(state.heightFt);

    $("custName").value = state.custName;

    $("muMat").value = String(state.muMat);
    $("muLab").value = String(state.muLab);
    $("multHandy").value = String(state.multHandy);
    $("multContract").value = String(state.multContract);

    renderLists();
    updateGeometryUI();
    buildRatesTable();

    wireInputs();
    setTab("input");
  }

  boot().catch(err => {
    console.error(err);
    alert("App failed to load. Make sure data.json is in the same folder as app.js and index.html.");
  });
})();
