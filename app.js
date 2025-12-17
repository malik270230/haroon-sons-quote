/* Haroon & Sons Consulting Quote - app.js
   FIXED BUILD
   - Stable logo (won’t disappear)
   - Adds raw material/labor totals
*/
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const elLogo = $("#companyLogo");
  const elName = $("#companyName");
  const elPhone = $("#companyPhone");
  const elEmail = $("#companyEmail");
  const elMarkupBanner = $("#markupBanner");

  const tabBtns = $$(".tab");
  const panels = { input: $("#tab-input"), quote: $("#tab-quote"), rates: $("#tab-rates") };

  const inFloorSF = $("#inFloorSF");
  const inCeilFt  = $("#inCeilFt");
  const inLenFt   = $("#inLenFt");
  const inWidFt   = $("#inWidFt");
  const inPerimLF = $("#inPerimLF");

  const outPerimLF = $("#outPerimLF");
  const outWallSF  = $("#outWallSF");
  const outPaintSF = $("#outPaintSF");

  const scopeList = $("#scopeList");
  const quoteBody = $("#quoteBody");
  const ratesBody = $("#ratesBody");

  const rawMatTotalEl = $("#rawMatTotal");
  const rawLabTotalEl = $("#rawLabTotal");
  const rawGrandTotalEl = $("#rawGrandTotal");

  const rawSubtotalEl = $("#rawSubtotal");
  const markupAppliedEl = $("#markupApplied");
  const tariffAppliedEl = $("#tariffApplied");
  const grandTotalEl = $("#grandTotal");

  const printBtn = $("#printBtn");
  const clearBtn = $("#clearBtn");

  const printCompanyName = $("#printCompanyName");
  const printCompanyPhone = $("#printCompanyPhone");
  const printCompanyEmail = $("#printCompanyEmail");
  const printProjectSummary = $("#printProjectSummary");
  const printClientName = $("#printClientName");
  const printClientAddress = $("#printClientAddress");
  const custName = $("#custName");
  const custAddr = $("#custAddr");
  const printGrandTotal = $("#printGrandTotal");

  const adminPanel = $("#adminPanel");
  const adminMarkupEnabled = $("#adminMarkupEnabled");
  const adminMarkupOverride = $("#adminMarkupOverride");
  const adminTariffEnabled = $("#adminTariffEnabled");
  const adminTariffPct = $("#adminTariffPct");
  const adminApplyBtn = $("#adminApplyBtn");
  const adminResetBtn = $("#adminResetBtn");
  const adminStateMsg = $("#adminStateMsg");

  const STORAGE_KEY = "hs_quote_state_v2";
  let DATA = null;

  const state = {
    floorSF: 0, ceilFt: 8, lenFt: 0, widFt: 0, perimOverride: 0,
    clientName: "", clientAddress: "",
    selected: {}, qty: {},
    admin: { markupEnabled: true, markupOverridePct: null, globalMarkupEnabled: false, globalMarkupPct: 0, tariffEnabled: false, tariffPct: 0 }
  };

  const fmtMoney = (n) => Number(n||0).toLocaleString(undefined,{style:"currency",currency:"USD"});
  const fmtNum = (n,d=2) => Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  const parseNum = (v)=>{ const x=Number(String(v??"").replace(/[^0-9.\-]/g,"")); return Number.isFinite(x)?x:0; };

  function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{} }
  function loadState(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return;
      const obj=JSON.parse(raw);
      if(obj&&typeof obj==="object"){ Object.assign(state,obj); state.admin=Object.assign(state.admin,obj.admin||{}); }
    }catch{}
  }
  function getVersionParam(){ return new URL(window.location.href).searchParams.get("v")||""; }

  function setLogoSafe(){
    if(!elLogo) return;
    const cands=[];
    if(DATA?.company?.logo) cands.push(DATA.company.logo);
    cands.push("logo.png","assets/logo.png");
    let i=0;
    const tryNext=()=>{
      if(i>=cands.length){ elLogo.style.opacity="0.35"; return; }
      const p=cands[i++]; const bust="v="+Date.now();
      elLogo.src = p.includes("?") ? `${p}&${bust}` : `${p}?${bust}`;
    };
    elLogo.style.opacity="1";
    elLogo.onerror=()=>tryNext();
    tryNext();
  }

  function tierPctForSF(sf){
    const tiers=(DATA?.markupTiers||[]).slice().sort((a,b)=>a.maxSF-b.maxSF);
    const s=Number(sf||0);
    for(const t of tiers) if(s<=t.maxSF) return t.pct;
    return tiers.length?tiers[tiers.length-1].pct:0.25;
  }
  function effectivePerItemMarkupPct(){
    if(!DATA) return 0;
    if(!state.admin.markupEnabled) return 0;
    const o=parseNum(state.admin.markupOverridePct);
    if(o>0) return o/100;
    return tierPctForSF(state.floorSF);
  }

  function calcPerimeterLF(){
    if(state.perimOverride>0) return state.perimOverride;
    if(state.lenFt>0 && state.widFt>0) return 2*(state.lenFt+state.widFt);
    const s=Math.sqrt(Math.max(0,state.floorSF));
    return 4*s;
  }
  const calcWallSF=(p)=>Math.max(0,p)*Math.max(0,state.ceilFt);
  const calcPaintSF=(w)=>Math.max(0,w)+Math.max(0,state.floorSF);

  const getManualQty=(id)=>parseNum(state.qty[id]);
  function sumSelectedEach(ids){ let t=0; for(const id of ids) if(state.selected[id]) t+=getManualQty(id); return t; }

  function computeQtyForItem(item, d){
    const u=item.unit;
    if(u==="FLOOR_SF") return d.floorSF;
    if(u==="WALL_SF") return d.wallSF;
    if(u==="PAINT_SF") return d.paintSF;
    if(u==="LF") return d.perimLF;

    if(u==="EACH"||u==="LF_MANUAL"||u==="SF_MANUAL") return getManualQty(item.id);

    if(u==="DOOR_COUNT"){
      const doorIds=DATA?.rules?.doorCountFrom||[];
      const cnt=sumSelectedEach(doorIds);
      const manual=getManualQty(item.id);
      return manual>0?manual:cnt;
    }
    if(u==="DOOR_CASING_LF"){
      const doorIds=DATA?.rules?.doorCountFrom||[];
      const cnt=sumSelectedEach(doorIds);
      const perDoor=parseNum(DATA?.rules?.casingLFPerDoor||0);
      return cnt*perDoor;
    }
    if(u==="PLUMB_FIXTURE_COUNT"){
      const ids=DATA?.rules?.plumbingFixtureFrom||[];
      return sumSelectedEach(ids);
    }
    if(u==="PCT_MAT") return 1;
    if(u==="COUNTER_LF_TO_SF"){
      const lf=getManualQty(item.id);
      const depth=parseNum(DATA?.rules?.counterDepthFt||2.0833);
      return lf*depth;
    }
    return 0;
  }

  const pricedUnitRate=(raw, pct)=>raw*(1+pct);

  function calcLine(item, d, perItemPct, rawMaterialsSubtotal){
    const qty=computeQtyForItem(item,d);
    const rawMatRate=parseNum(item.mat);
    const rawLabRate=parseNum(item.lab);

    let rawMatTotal=qty*rawMatRate;
    let rawLabTotal=qty*rawLabRate;

    const matRate=pricedUnitRate(rawMatRate, perItemPct);
    const labRate=pricedUnitRate(rawLabRate, perItemPct);

    let matTotal=qty*matRate;
    let labTotal=qty*labRate;

    if(item.unit==="PCT_MAT"){
      const pct=parseNum(item.pctOfMaterials||0);
      rawMatTotal = rawMaterialsSubtotal*(pct/100);
      rawLabTotal = 0;
      matTotal = rawMatTotal;
      labTotal = 0;
    }

    return { id:item.id, label:item.label, unit:item.unit, qty, rawMatRate, rawLabRate, matRate, labRate, rawMatTotal, rawLabTotal, matTotal, labTotal, lineTotal: matTotal+labTotal };
  }

  function friendlyUnit(u){
    if(u==="LF_MANUAL") return "LF (manual)";
    if(u==="SF_MANUAL") return "SF (manual)";
    if(u==="DOOR_COUNT") return "EACH (auto doors)";
    if(u==="DOOR_CASING_LF") return "LF (auto)";
    if(u==="PLUMB_FIXTURE_COUNT") return "EACH (auto fixtures)";
    if(u==="COUNTER_LF_TO_SF") return "LF (→ SF)";
    return u||"";
  }

  function setActiveTab(k){
    tabBtns.forEach(b=>b.classList.toggle("active", b.dataset.tab===k));
    Object.keys(panels).forEach(x=>panels[x].classList.toggle("active", x===k));
  }

  function buildScopeList(){
    scopeList.innerHTML="";
    for(const item of DATA.items){
      if(item.hiddenInScope) continue;

      const wrap=document.createElement("div");
      wrap.className="chk";

      const left=document.createElement("div");
      left.style.display="flex";
      left.style.alignItems="flex-start";
      left.style.gap="10px";

      const cb=document.createElement("input");
      cb.type="checkbox";
      cb.checked=!!state.selected[item.id];

      cb.addEventListener("change", ()=>{
        state.selected[item.id]=cb.checked;
        if(cb.checked && ["EACH","LF_MANUAL","SF_MANUAL","COUNTER_LF_TO_SF"].includes(item.unit)){
          if(!state.qty[item.id] || parseNum(state.qty[item.id])===0) state.qty[item.id]=1;
        }
        saveState();
        recalcAndRender();
      });

      const txt=document.createElement("div");
      const title=document.createElement("b"); title.textContent=item.label;
      const sub=document.createElement("small"); sub.textContent=`${friendlyUnit(item.unit)} • material ${fmtNum(item.mat,2)} • labor ${fmtNum(item.lab,2)}`;
      txt.appendChild(title); txt.appendChild(sub);

      left.appendChild(cb); left.appendChild(txt);
      wrap.appendChild(left);

      const needsQty=["EACH","LF_MANUAL","SF_MANUAL","COUNTER_LF_TO_SF","DOOR_COUNT"].includes(item.unit);
      if(needsQty){
        const qtyWrap=document.createElement("div");
        qtyWrap.style.marginLeft="auto";
        qtyWrap.style.display="flex";
        qtyWrap.style.flexDirection="column";
        qtyWrap.style.gap="6px";
        qtyWrap.style.minWidth="120px";

        const labEl=document.createElement("span");
        labEl.style.color="var(--muted)";
        labEl.style.fontSize="12px";
        labEl.textContent="Qty";

        const qtyIn=document.createElement("input");
        qtyIn.type="number"; qtyIn.inputMode="decimal"; qtyIn.min="0"; qtyIn.step="1";
        qtyIn.value=String(parseNum(state.qty[item.id]));
        qtyIn.disabled=!cb.checked;

        qtyIn.addEventListener("input", ()=>{ state.qty[item.id]=parseNum(qtyIn.value); saveState(); recalcAndRender(); });
        cb.addEventListener("change", ()=>{
          qtyIn.disabled=!cb.checked;
          if(cb.checked && parseNum(qtyIn.value)===0){ qtyIn.value="1"; state.qty[item.id]=1; }
        });

        qtyWrap.appendChild(labEl); qtyWrap.appendChild(qtyIn);
        wrap.appendChild(qtyWrap);
      }

      scopeList.appendChild(wrap);
    }
  }

  function buildRatesTable(perItemPct){
    ratesBody.innerHTML="";
    for(const item of DATA.items){
      const tr=document.createElement("tr");
      const tdItem=document.createElement("td"); tdItem.className="left"; tdItem.textContent=item.label;
      const tdUnit=document.createElement("td"); tdUnit.textContent=friendlyUnit(item.unit);
      const tdRawMat=document.createElement("td"); tdRawMat.textContent=fmtMoney(parseNum(item.mat));
      const tdRawLab=document.createElement("td"); tdRawLab.textContent=fmtMoney(parseNum(item.lab));
      const tdMkMat=document.createElement("td"); tdMkMat.textContent=fmtMoney(pricedUnitRate(parseNum(item.mat), perItemPct));
      const tdMkLab=document.createElement("td"); tdMkLab.textContent=fmtMoney(pricedUnitRate(parseNum(item.lab), perItemPct));
      tr.appendChild(tdItem); tr.appendChild(tdUnit); tr.appendChild(tdRawMat); tr.appendChild(tdRawLab); tr.appendChild(tdMkMat); tr.appendChild(tdMkLab);
      ratesBody.appendChild(tr);
    }
  }

  function recalcAndRender(){
    state.floorSF=parseNum(inFloorSF.value);
    state.ceilFt=clamp(parseNum(inCeilFt.value)||8,6,12);
    state.lenFt=parseNum(inLenFt.value);
    state.widFt=parseNum(inWidFt.value);
    state.perimOverride=parseNum(inPerimLF.value);

    const perimLF=calcPerimeterLF();
    const wallSF=calcWallSF(perimLF);
    const paintSF=calcPaintSF(wallSF);

    const d={ floorSF: state.floorSF, perimLF, wallSF, paintSF };

    outPerimLF.textContent=fmtNum(perimLF,2);
    outWallSF.textContent=fmtNum(wallSF,2);
    outPaintSF.textContent=fmtNum(paintSF,2);

    const tierPct=tierPctForSF(state.floorSF);
    const effPct=effectivePerItemMarkupPct();
    elMarkupBanner.textContent=`Pricing tier: ${(tierPct*100).toFixed(0)}% (${fmtNum(state.floorSF,0)} SF)`;

    buildRatesTable(effPct);

    // raw mat base for PCT_MAT
    let rawMaterialsSubtotal=0;
    for(const item of DATA.items){
      if(!state.selected[item.id]) continue;
      if(item.unit==="PCT_MAT") continue;
      const qty=computeQtyForItem(item,d);
      rawMaterialsSubtotal += qty*parseNum(item.mat);
    }

    const lines=[];
    let pricedSubtotal=0;
    let rawMatTotal=0;
    let rawLabTotal=0;

    for(const item of DATA.items){
      if(!state.selected[item.id]) continue;
      const line=calcLine(item,d,effPct,rawMaterialsSubtotal);
      lines.push(line);
      pricedSubtotal += line.lineTotal;
      rawMatTotal += line.rawMatTotal;
      rawLabTotal += line.rawLabTotal;
    }
    const rawGrandTotal = rawMatTotal + rawLabTotal;

    // global markup + tariff (priced only)
    let globalMarkupPct=0;
    if(state.admin.globalMarkupEnabled) globalMarkupPct=clamp(parseNum(state.admin.globalMarkupPct),0,200)/100;
    const globalMarkupAmt=pricedSubtotal*globalMarkupPct;

    let tariffPct=0;
    if(state.admin.tariffEnabled) tariffPct=clamp(parseNum(state.admin.tariffPct),0,50)/100;
    const tariffAmt=(pricedSubtotal+globalMarkupAmt)*tariffPct;

    const grandTotal=pricedSubtotal+globalMarkupAmt+tariffAmt;

    quoteBody.innerHTML="";
    for(const line of lines){
      const tr=document.createElement("tr");
      const tdItem=document.createElement("td"); tdItem.className="left"; tdItem.textContent=line.label;
      const tdUnit=document.createElement("td"); tdUnit.textContent=friendlyUnit(line.unit);
      const tdQty=document.createElement("td"); tdQty.textContent=(line.unit==="PCT_MAT")?"—":fmtNum(line.qty,2);
      const tdUnitMat=document.createElement("td"); tdUnitMat.textContent=(line.unit==="PCT_MAT")?"—":fmtMoney(line.matRate);
      const tdUnitLab=document.createElement("td"); tdUnitLab.textContent=(line.unit==="PCT_MAT")?"—":fmtMoney(line.labRate);
      const tdMat=document.createElement("td"); tdMat.textContent=fmtMoney(line.matTotal);
      const tdLab=document.createElement("td"); tdLab.textContent=fmtMoney(line.labTotal);
      const tdTot=document.createElement("td"); tdTot.textContent=fmtMoney(line.lineTotal);
      tr.appendChild(tdItem); tr.appendChild(tdUnit); tr.appendChild(tdQty); tr.appendChild(tdUnitMat); tr.appendChild(tdUnitLab); tr.appendChild(tdMat); tr.appendChild(tdLab); tr.appendChild(tdTot);
      quoteBody.appendChild(tr);
    }

    if(rawMatTotalEl) rawMatTotalEl.textContent=fmtMoney(rawMatTotal);
    if(rawLabTotalEl) rawLabTotalEl.textContent=fmtMoney(rawLabTotal);
    if(rawGrandTotalEl) rawGrandTotalEl.textContent=fmtMoney(rawGrandTotal);

    rawSubtotalEl.textContent=fmtMoney(pricedSubtotal);

    const perItemShown = state.admin.markupEnabled ? (effPct*100).toFixed(0)+"%" : "OFF";
    const globalShown = state.admin.globalMarkupEnabled ? (globalMarkupPct*100).toFixed(0)+"%" : "OFF";
    markupAppliedEl.textContent = state.admin.globalMarkupEnabled ? `Global ${globalShown}` : `Per-item ${perItemShown}`;
    tariffAppliedEl.textContent = state.admin.tariffEnabled ? (tariffPct*100).toFixed(0)+"%" : "OFF";
    grandTotalEl.textContent=fmtMoney(grandTotal);

    if(printCompanyName) printCompanyName.textContent=DATA.company.name;
    if(printCompanyPhone) printCompanyPhone.textContent=DATA.company.phone;
    if(printCompanyEmail) printCompanyEmail.textContent=DATA.company.email;
    if(printClientName) printClientName.textContent = (state.clientName||"").trim() || "—";
    if(printClientAddress) printClientAddress.textContent = (state.clientAddress||"").trim() || "—";
    if(printProjectSummary) printProjectSummary.textContent = `Project: ${fmtNum(state.floorSF,0)} SF • Ceiling: ${fmtNum(state.ceilFt,0)} ft • Perimeter: ${fmtNum(perimLF,0)} LF`;
    if(printGrandTotal) printGrandTotal.textContent=fmtMoney(grandTotal);

    saveState();
  }

  let pressTimer=null;
  function unlockAdmin(){
    const pin=prompt("Enter admin PIN:");
    if(!pin) return;
    if(pin===String(DATA?.adminPin||"2528")){
      adminPanel.classList.remove("hidden");
      adminStateMsg.textContent="Admin unlocked on this device.";
    }else alert("Wrong PIN");
  }

  function wireAdmin(){
    adminMarkupEnabled.value = state.admin.markupEnabled ? "1":"0";
    adminMarkupOverride.value = state.admin.markupOverridePct ?? "";
    adminTariffEnabled.value = state.admin.tariffEnabled ? "1":"0";
    adminTariffPct.value = state.admin.tariffPct ?? "";

    const adv=$("#adminAdvanced"); if(adv) adv.remove();
    const advWrap=document.createElement("div");
    advWrap.id="adminAdvanced";
    advWrap.className="grid";
    advWrap.style.marginTop="12px";

    advWrap.innerHTML = `
      <label class="field">
        <span>Global Markup Enabled (over total)</span>
        <select id="adminGlobalEnabled">
          <option value="0">OFF</option>
          <option value="1">ON</option>
        </select>
      </label>
      <label class="field">
        <span>Global Markup %</span>
        <input id="adminGlobalPct" type="number" inputmode="decimal" placeholder="e.g., 10" />
      </label>
    `;
    adminPanel.querySelector(".grid").after(advWrap);

    const adminGlobalEnabled=$("#adminGlobalEnabled");
    const adminGlobalPct=$("#adminGlobalPct");
    adminGlobalEnabled.value = state.admin.globalMarkupEnabled ? "1":"0";
    adminGlobalPct.value = state.admin.globalMarkupPct ?? 0;

    adminApplyBtn.addEventListener("click", ()=>{
      state.admin.markupEnabled = adminMarkupEnabled.value==="1";
      const mo=parseNum(adminMarkupOverride.value);
      state.admin.markupOverridePct = mo>0?mo:null;

      state.admin.tariffEnabled = adminTariffEnabled.value==="1";
      state.admin.tariffPct = parseNum(adminTariffPct.value);

      state.admin.globalMarkupEnabled = adminGlobalEnabled.value==="1";
      state.admin.globalMarkupPct = parseNum(adminGlobalPct.value);

      adminStateMsg.textContent="Applied.";
      saveState(); recalcAndRender();
    });

    adminResetBtn.addEventListener("click", ()=>{
      state.admin = { markupEnabled:true, markupOverridePct:null, globalMarkupEnabled:false, globalMarkupPct:0, tariffEnabled:false, tariffPct:0 };
      adminMarkupEnabled.value="1";
      adminMarkupOverride.value="";
      adminTariffEnabled.value="0";
      adminTariffPct.value="";
      adminGlobalEnabled.value="0";
      adminGlobalPct.value="0";
      adminStateMsg.textContent="Admin reset.";
      saveState(); recalcAndRender();
    });
  }

  async function loadData(){
    const v=getVersionParam();
    const url = v ? `data.json?v=${encodeURIComponent(v)}` : "data.json";
    const res=await fetch(url,{cache:"no-store"});
    if(!res.ok) throw new Error(`Failed to load data.json (${res.status})`);
    return await res.json();
  }

  function initCompany(){
    elName.textContent = DATA.company.name;
    elPhone.textContent = `📞 ${DATA.company.phone}`;
    elPhone.href = `tel:${DATA.company.phone.replace(/[^\d+]/g,"")}`;
    elEmail.textContent = `✉️ ${DATA.company.email}`;
    elEmail.href = `mailto:${DATA.company.email}`;
    setLogoSafe();
  }

  function initTabs(){ tabBtns.forEach(btn=>btn.addEventListener("click",()=>setActiveTab(btn.dataset.tab))); }

  function initInputs(){
    inFloorSF.value = state.floorSF || "";
    inCeilFt.value  = state.ceilFt || 8;
    inLenFt.value   = state.lenFt || "";
    inWidFt.value   = state.widFt || "";
    inPerimLF.value = state.perimOverride || "";

    if(custName) custName.value = state.clientName || "";
    if(custAddr) custAddr.value = state.clientAddress || "";

    const onAnyInput = ()=>{
      state.floorSF = parseNum(inFloorSF.value);
      state.ceilFt  = parseNum(inCeilFt.value) || 8;
      state.lenFt   = parseNum(inLenFt.value);
      state.widFt   = parseNum(inWidFt.value);
      state.perimOverride = parseNum(inPerimLF.value);
      if(custName) state.clientName = custName.value;
      if(custAddr) state.clientAddress = custAddr.value;
      saveState();
      recalcAndRender();
    };

    [inFloorSF,inCeilFt,inLenFt,inWidFt,inPerimLF].forEach(el=> el.addEventListener("input", onAnyInput));
    if(custName) custName.addEventListener("input", onAnyInput);
    if(custAddr) custAddr.addEventListener("input", onAnyInput);
  }

  function initActions(){
    printBtn.addEventListener("click",()=>{ recalcAndRender(); window.print(); });
    clearBtn.addEventListener("click",()=>{
      if(!confirm("Clear all selections & inputs on this device?")) return;
      state.floorSF=0; state.ceilFt=8; state.lenFt=0; state.widFt=0; state.perimOverride=0;
      state.selected={}; state.qty={};
      state.clientName=""; state.clientAddress="";
      saveState();
      initInputs(); buildScopeList(); recalcAndRender();
    });

    elLogo.addEventListener("touchstart",()=>{ pressTimer=setTimeout(unlockAdmin,1200); },{passive:true});
    elLogo.addEventListener("touchend",()=>clearTimeout(pressTimer),{passive:true});
    elLogo.addEventListener("mousedown",()=>{ pressTimer=setTimeout(unlockAdmin,1200); });
    elLogo.addEventListener("mouseup",()=>clearTimeout(pressTimer));
    elLogo.addEventListener("mouseleave",()=>clearTimeout(pressTimer));
  }

  function showLoadError(e){
    alert("Error loading app files.\n\nMake sure index.html, app.js, styles.css, data.json are all in the SAME folder on GitHub Pages.\n\nDetails: "+(e?.message||e));
  }

  (async function boot(){
    loadState();
    try{
      DATA = await loadData();
      initCompany();
      initTabs();
      initInputs();
      buildScopeList();
      wireAdmin();
      initActions();
      recalcAndRender();
    }catch(e){
      console.error(e);
      showLoadError(e);
    }
  })();
})();