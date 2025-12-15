let DATA;
const $ = (id) => document.getElementById(id);

function money(n){
  return "$" + (Number(n)||0).toLocaleString();
}

function toggleRow(item, group){
  const id = `${group}_${item.key}`;
  return `
    <div class="row row-toggle">
      <input type="checkbox" class="cb" id="${id}" ${item.defaultOn ? "checked" : ""}>
      <label class="rowLabel" for="${id}">${item.label}</label>
      <input class="amt" type="number" inputmode="numeric" id="${id}_amt" value="${item.amount}">
    </div>
  `;
}

function qtyRow(item, group){
  const id = `${group}_${item.key}`;
  return `
    <div class="row row-qty">
      <div class="rowLabel">${item.label}</div>
      <input class="qty" type="number" inputmode="numeric" id="${id}_qty" value="0">
      <div class="unit">${money(item.price)} / ${item.unit}</div>
    </div>
  `;
}

function buildUI(){
  $("scopeList").innerHTML  = DATA.scopeToggles.map(x => toggleRow(x,"scope")).join("");
  $("fixtureList").innerHTML = DATA.fixtures.map(x => qtyRow(x,"fix")).join("");
  $("doorList").innerHTML    = DATA.doors.map(x => qtyRow(x,"door")).join("");
  $("supplyList").innerHTML  = DATA.addOnSupplies.map(x => toggleRow(x,"sup")).join("");
}

function calcBase(sqft, type){
  const rate = type === "contractor" ? DATA.rates.contractor_per_sqft : DATA.rates.handyman_per_sqft;
  return { rate, base: sqft * rate };
}

function sumToggles(list, group){
  let total = 0; const lines = [];
  for(const item of list){
    const on = $(`${group}_${item.key}`).checked;
    const amt = Number($(`${group}_${item.key}_amt`).value)||0;
    if(on && amt>0){ total += amt; lines.push({name:item.label, amount:amt}); }
  }
  return { total, lines };
}

function sumQty(list, group){
  let total = 0; const lines = [];
  for(const item of list){
    const qty = Number($(`${group}_${item.key}_qty`).value)||0;
    const line = qty * item.price;
    if(qty>0){ total += line; lines.push({name:`${item.label} (x${qty})`, amount:line}); }
  }
  return { total, lines };
}

function render(lines, totals){
  const rows = lines.map(l =>
    `<div class="line"><span>${l.name}</span><strong>${money(l.amount)}</strong></div>`
  ).join("");

  $("output").innerHTML = `
    <h2>${DATA.company.name}</h2>
    <div class="line"><span>Base (${totals.sqft} sq ft @ ${money(totals.rate)}/sq ft)</span><strong>${money(totals.base)}</strong></div>
    ${rows}
    <hr>
    <div class="line grand"><span>Total</span><strong>${money(totals.grand)}</strong></div>
  `;
}

function calculate(){
  const sqft = Number($("sqft").value);
  const type = $("service").value;
  if(!sqft || sqft<=0){ alert("Enter a valid square footage"); return; }

  const { rate, base } = calcBase(sqft, type);
  const a = sumToggles(DATA.scopeToggles,"scope");
  const b = sumQty(DATA.fixtures,"fix");
  const c = sumQty(DATA.doors,"door");
  const d = sumToggles(DATA.addOnSupplies,"sup");

  const grand = base + a.total + b.total + c.total + d.total;
  render([...a.lines,...b.lines,...c.lines,...d.lines], { sqft, rate, base, grand });
}

fetch("data.json")
  .then(r => r.json())
  .then(json => {
    DATA = json;
    buildUI();
    $("calculate").addEventListener("click", calculate);
  })
  .catch(() => $("output").textContent = "Error loading data.json");
