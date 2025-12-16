let DATA = null;
let adminState = {
  markupEnabled: true,
  markupOverridePct: null,
  tariffEnabled: false,
  tariffPct: 0
};

const $ = id => document.getElementById(id);
const money = n => `$${n.toFixed(2)}`;

fetch("data.json?v=9999")
  .then(r => r.json())
  .then(j => {
    DATA = j;
    init();
  })
  .catch(err => alert("Failed to load data.json"));

function init() {
  const s = DATA.settings;

  $("companyName").textContent = s.company.name;
  $("companyPhone").textContent = s.company.phone;
  $("companyPhone").href = `tel:${s.company.phone}`;
  $("companyEmail").textContent = s.company.email;
  $("companyEmail").href = `mailto:${s.company.email}`;
  $("companyLogo").src = s.company.logo;

  adminState = { ...s.defaults };

  renderScope();
  bindInputs();
  recalc();
}

function bindInputs() {
  ["inFloorSF","inCeilFt","inLenFt","inWidFt","inPerimLF"].forEach(id =>
    $(id).addEventListener("input", recalc)
  );
  $("adminApplyBtn").onclick = applyAdmin;
  $("adminResetBtn").onclick = () => location.reload();

  let pressTimer;
  $("companyLogo").addEventListener("touchstart", () => {
    pressTimer = setTimeout(() => {
      const pin = prompt("Enter Admin PIN");
      if (pin === DATA.settings.admin.pin) {
        $("adminPanel").classList.remove("hidden");
      }
    }, 1200);
  });
  $("companyLogo").addEventListener("touchend", () => clearTimeout(pressTimer));
}

function renderScope() {
  const wrap = $("scopeList");
  wrap.innerHTML = "";
  DATA.items.forEach(it => {
    const d = document.createElement("label");
    d.className = "chk";
    d.innerHTML = `
      <input type="checkbox" ${it.default_on ? "checked":""} data-id="${it.id}">
      <div><b>${it.label}</b><small>${it.unit}</small></div>
    `;
    wrap.appendChild(d);
  });
  wrap.querySelectorAll("input").forEach(i => i.onchange = recalc);
}

function geometry() {
  const floor = +$("inFloorSF").value || 0;
  const ceil = +$("inCeilFt").value || DATA.settings.defaults.ceilingHeight;
  const L = +$("inLenFt").value || 0;
  const W = +$("inWidFt").value || 0;
  const perOverride = +$("inPerimLF").value || 0;

  const perimeter = perOverride || (L && W ? 2*(L+W) : Math.sqrt(floor)*4);
  const wallSF = perimeter * ceil;
  const paintSF = wallSF + floor;

  $("outPerimLF").textContent = perimeter.toFixed(1);
  $("outWallSF").textContent = wallSF.toFixed(1);
  $("outPaintSF").textContent = paintSF.toFixed(1);

  return { floor, wallSF, paintSF, perimeter };
}

function sqftMarkup(sf) {
  if (!adminState.markupEnabled) return 0;
  if (adminState.markupOverridePct !== null)
    return adminState.markupOverridePct / 100;

  for (const t of DATA.settings.sqft_markup_tiers)
    if (sf <= t.max_sf) return t.markup;
  return 0;
}

function recalc() {
  if (!DATA) return;

  const g = geometry();
  const rows = $("quoteBody");
  rows.innerHTML = "";

  let raw = 0, matTotal = 0;
  const markupPct = sqftMarkup(g.floor);

  DATA.items.forEach(it => {
    const on = document.querySelector(`[data-id="${it.id}"]`)?.checked;
    if (!on) return;

    let qty = 0;
    if (it.unit === "FLOOR_SF") qty = g.floor;
    if (it.unit === "WALL_SF") qty = g.wallSF;
    if (it.unit === "PAINT_SF") qty = g.paintSF;
    if (it.unit === "LF") qty = g.perimeter;

    const mat = it.material_rate * qty;
    const lab = it.labor_rate * qty;
    const line = mat + lab;

    raw += line;
    matTotal += mat;

    rows.innerHTML += `
      <tr>
        <td class="left">${it.label}</td>
        <td>${it.unit}</td>
        <td>${qty.toFixed(1)}</td>
        <td>${money(mat)}</td>
        <td>${money(lab)}</td>
        <td>${money(line)}</td>
      </tr>`;
  });

  const markupAmt = raw * markupPct;
  const tariffAmt = adminState.tariffEnabled ? matTotal * (adminState.tariffPct/100) : 0;
  const total = raw + markupAmt + tariffAmt;

  $("rawSubtotal").textContent = money(raw);
  $("markupApplied").textContent = markupPct ? `${(markupPct*100).toFixed(0)}%` : "OFF";
  $("tariffApplied").textContent = adminState.tariffEnabled ? `${adminState.tariffPct}%` : "OFF";
  $("grandTotal").textContent = money(total);
  $("markupBanner").textContent = `Markup tier: ${(markupPct*100).toFixed(0)}%`;
}

function applyAdmin() {
  adminState.markupEnabled = $("adminMarkupEnabled").value === "1";
  adminState.markupOverridePct = $("adminMarkupOverride").value
    ? +$("adminMarkupOverride").value
    : null;
  adminState.tariffEnabled = $("adminTariffEnabled").value === "1";
  adminState.tariffPct = +$("adminTariffPct").value || 0;
  recalc();
}
