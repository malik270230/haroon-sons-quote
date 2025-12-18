(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const STORAGE_KEY = "hs_deck_quote_v3";
  let DATA = null;

  const state = {
    lenFt: 0, widFt: 0, deckSFOverride: 0,
    heightFt: 3, permitMode: "permit", attached: "yes",
    pricingMode: "handyman",
    stairSteps: 0, stairWidth: 36,
    footingsOverride: 0, railLFOverride: 0,
    clientName: "", clientAddress: "",
    selected: {},
    admin: {
      unlocked:false,
      useOverride:false,
      overridePct:null,
      discountEnabled:false,
      discountType:"percent",
      discountValue:0
    }
  };

  const fmtMoney = (n) => Number(n||0).toLocaleString(undefined,{style:"currency",currency:"USD"});
  const fmtNum = (n,d=2) => Number(n||0).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  const parseNum = (v)=>{ const x=Number(String(v??"").replace(/[^0-9.\-]/g,"")); return Number.isFinite(x)?x:0; };

  function save(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{} }
  function load(){ try{ const s=localStorage.getItem(STORAGE_KEY); if(s) Object.assign(state, JSON.parse(s)); }catch{} }

  function getModeCfg(){
    const m = state.pricingMode || "handyman";
    return (DATA?.pricingModes && DATA.pricingModes[m]) ? DATA.pricingModes[m] : (DATA?.pricingModes?.handyman || null);
  }

  function tierPctForSF(sf){
    const mode = getModeCfg();
    const tiers=(mode?.markupTiers || DATA?.markupTiers || []).slice().sort((a,b)=>a.maxSF-b.maxSF);
    for(const t of tiers){ if(sf<=t.maxSF) return t.pct; }
    return 0.20;
  }

  function getMarkupPct(sf){
    const o = Number(state.admin?.overridePct);
    if(state.admin?.unlocked && state.admin?.useOverride && Number.isFinite(o) && o>=0 && o<=100){
      return o/100;
    }
    return tierPctForSF(sf);
  }

  function heightMult(h){
    const hs=DATA?.rules?.heightMults||[];
    for(const r of hs){ if(h<=r.maxHeightFt) return r.mult; }
    return 1.0;
  }

  function deckSF(){
    const o=parseNum(state.deckSFOverride);
    if(o>0) return o;
    return Math.max(0,parseNum(state.lenFt))*Math.max(0,parseNum(state.widFt));
  }

  function perimLF(){
    const L=Math.max(0,parseNum(state.lenFt));
    const W=Math.max(0,parseNum(state.widFt));
    if(L>0 && W>0) return 2*(L+W);
    const s=Math.sqrt(Math.max(0,deckSF()));
    return 4*s;
  }

  function railingRequired(){
    const req=parseNum(DATA?.rules?.railingRequiredHeightFt ?? 2.5);
    return parseNum(state.heightFt) >= req;
  }

  function autoFootings(sf){
    const per=parseNum(DATA?.rules?.defaultFootingSFPerEach ?? 36);
    const min=parseNum(DATA?.rules?.minFootings ?? 6);
    const est=Math.ceil(sf/Math.max(1,per));
    return Math.max(min, est);
  }

  function friendlyUnit(u){
    if(u==="DECK_SF") return "DECK SF";
    if(u==="RAIL_LF") return "LF";
    if(u==="FOOTING_COUNT") return "EACH";
    if(u==="STAIR_STEP") return "STEP";
    if(u==="PCT_MAT") return "%MAT";
    return u||"";
  }

  function enforceExclusive(item){
    if(!item.group) return;
    for(const it of DATA.items){
      if(it.id!==item.id && it.group===item.group) state.selected[it.id]=false;
    }
  }

  function computeQty(item, ctx){
    if(item.unit==="DECK_SF") return ctx.deckSF;
    if(item.unit==="RAIL_LF") return ctx.railLF;
    if(item.unit==="FOOTING_COUNT") return ctx.footings;
    if(item.unit==="STAIR_STEP") return ctx.stairSteps * ctx.stairWidthMult;
    if(item.unit==="EACH") return 1;
    if(item.unit==="PCT_MAT") return 1;
    return 0;
  }

  function buildScope(){
    const wrap=$("#scopeList");
    wrap.innerHTML="";
    for(const item of DATA.items){
      const row=document.createElement("div");
      row.className="chk";
      const cb=document.createElement("input");
      cb.type="checkbox";
      cb.checked=!!state.selected[item.id];
      cb.addEventListener("change", ()=>{
        state.selected[item.id]=cb.checked;
        if(cb.checked) enforceExclusive(item);
        save(); render();
      });
      const txt=document.createElement("div");
      txt.innerHTML = `<b>${item.label}</b><br><small>${friendlyUnit(item.unit)} • mat ${fmtNum(item.mat,2)} • labor ${fmtNum(item.lab,2)}</small>`;
      row.appendChild(cb); row.appendChild(txt);
      wrap.appendChild(row);
    }
  }

  function applyModeDefaults(){
    const mode = getModeCfg();
    if(!mode) return;
    const ids = new Set((DATA.items||[]).map(x=>x.id));

    if(ids.has("engineering_allow")){
      if(mode.includeEngineeringDefault){
        state.selected["engineering_allow"] ??= true;
      }else{
        state.selected["engineering_allow"] ??= false;
      }
    }
  }

  function render(){
    // pull inputs
    state.lenFt=parseNum($("#inLenFt").value);
    state.widFt=parseNum($("#inWidFt").value);
    state.deckSFOverride=parseNum($("#inDeckSF").value);
    state.heightFt=clamp(parseNum($("#inHeightFt").value)||3,0,20);
    state.permitMode=$("#inPermitMode").value;
    state.attached=$("#inAttached").value;
    state.pricingMode=$("#inPricingMode")?.value || state.pricingMode || "handyman";
    state.stairSteps=clamp(parseNum($("#inStairSteps").value)||0,0,50);
    state.stairWidth=parseNum($("#inStairWidth").value)||36;
    state.footingsOverride=parseNum($("#inFootings").value);
    state.railLFOverride=parseNum($("#inRailLF").value);
    state.clientName=($("#inClientName").value||"").trim();
    state.clientAddress=($("#inClientAddress").value||"").trim();

    applyModeDefaults();

    const sf=deckSF();
    const per=perimLF();
    const railReq=railingRequired();
    const railLF = state.railLFOverride>0 ? state.railLFOverride : per;
    const footings = state.footingsOverride>0 ? Math.ceil(state.footingsOverride) : autoFootings(sf);
    const stairWidthMult = (state.stairWidth>=48) ? 1.25 : 1.0;

    $("#outDeckSF").textContent=fmtNum(sf,2);
    $("#outPerimLF").textContent=fmtNum(per,2);
    $("#outRailReq").textContent=railReq ? "YES" : "NO";
    $("#permitHint").textContent = state.permitMode==="permit"
      ? "Permit mode: includes permit/admin allowances."
      : "Non-permit mode: removes permit/admin allowances only.";

    // auto ledger selection
    state.selected["ledger_attach"] = (state.attached==="yes") ? (state.selected["ledger_attach"] ?? true) : false;
    // force off permitOnly in nonpermit
    for(const it of DATA.items){
      if(it.permitOnly && state.permitMode!=="permit") state.selected[it.id]=false;
    }

    const mode = getModeCfg();
    const pct=getMarkupPct(sf);
    const modeLabel = mode?.label || (state.pricingMode==="gc" ? "GC / Premium" : "Handyman+");
    $("#markupBanner").textContent = `Mode: ${modeLabel} • Tier: ${(pct*100).toFixed(0)}% (${fmtNum(sf,0)} SF)`;

    // rates table
    const ratesBody=$("#ratesBody");
    ratesBody.innerHTML="";
    for(const it of DATA.items){
      const matBase = parseNum(it.mat) * (mode?.matMult ?? 1);
      const labBase = parseNum(it.lab) * (mode?.labMult ?? 1);
      const tr=document.createElement("tr");
      tr.innerHTML = `<td class="left">${it.label}</td><td>${friendlyUnit(it.unit)}</td>
        <td>${fmtMoney(matBase)}</td><td>${fmtMoney(labBase)}</td>
        <td>${fmtMoney(matBase*(1+pct))}</td><td>${fmtMoney(labBase*(1+pct))}</td>`;
      ratesBody.appendChild(tr);
    }

    // raw materials subtotal for consumables (mode-adjusted)
    let rawMatSub=0;
    for(const it of DATA.items){
      if(!state.selected[it.id]) continue;
      if(it.unit==="PCT_MAT") continue;
      const qty=computeQty(it,{deckSF:sf, railLF, footings, stairSteps:state.stairSteps, stairWidthMult});
      const matBase = parseNum(it.mat) * (mode?.matMult ?? 1);
      rawMatSub += qty*matBase;
    }

    const qBody=$("#quoteBody");
    qBody.innerHTML="";
    const hM=heightMult(state.heightFt);

    let rawMat=0, rawLab=0, pricedTotal=0;

    // bucket totals for client view (priced)
    const bucketTotals = {};
    for(const b of (DATA.bucketOrder || [])) bucketTotals[b]=0;

    for(const it of DATA.items){
      if(!state.selected[it.id]) continue;

      const qty=computeQty(it,{deckSF:sf, railLF, footings, stairSteps:state.stairSteps, stairWidthMult});
      let rMat=parseNum(it.mat) * (mode?.matMult ?? 1);
      let rLab=parseNum(it.lab) * (mode?.labMult ?? 1);

      if(it.heightSensitive){ rMat*=hM; rLab*=hM; }

      let rawMatLine=qty*rMat;
      let rawLabLine=qty*rLab;

      let matLine = qty*(rMat*(1+pct));
      let labLine = qty*(rLab*(1+pct));

      if(it.unit==="PCT_MAT"){
        const p=parseNum(it.pctOfMaterials||0)/100;
        rawMatLine = rawMatSub*p;
        rawLabLine = 0;
        matLine = rawMatLine; // no extra markup
        labLine = 0;
      }

      rawMat += rawMatLine;
      rawLab += rawLabLine;

      const lineTotal = matLine + labLine;
      pricedTotal += lineTotal;

      // bucket rollup
      const bucket = it.bucket || "Other";
      bucketTotals[bucket] = (bucketTotals[bucket] || 0) + lineTotal;

      const tr=document.createElement("tr");
      tr.innerHTML = `<td class="left">${it.label}</td>
        <td>${friendlyUnit(it.unit)}</td>
        <td>${it.unit==="PCT_MAT"?"—":fmtNum(qty,2)}</td>
        <td>${it.unit==="PCT_MAT"?"—":fmtMoney(rMat*(1+pct))}</td>
        <td>${it.unit==="PCT_MAT"?"—":fmtMoney(rLab*(1+pct))}</td>
        <td>${fmtMoney(matLine)}</td>
        <td>${fmtMoney(labLine)}</td>
        <td>${fmtMoney(lineTotal)}</td>`;
      qBody.appendChild(tr);
    }

    // --- Admin discount (applies to priced total only) ---
    let discountAmt = 0;
    if(state.admin?.unlocked && state.admin?.discountEnabled){
      const v = parseNum(state.admin.discountValue);
      if(state.admin.discountType === "percent"){
        const pctD = clamp(v, 0, 30) / 100; // cap at 30% to avoid accidents
        discountAmt = pricedTotal * pctD;
      }else{
        discountAmt = clamp(v, 0, pricedTotal);
      }
    }
    const finalTotal = Math.max(0, pricedTotal - discountAmt);

    // Discount row (detailed)
    const dRow = $("#discountRow");
    const dCell = $("#discountTotal");
    if(dRow && dCell){
      if(discountAmt > 0.01){
        dRow.classList.remove("hidden");
        dCell.textContent = "-" + fmtMoney(discountAmt);
      }else{
        dRow.classList.add("hidden");
        dCell.textContent = fmtMoney(0);
      }
    }

    $("#rawMatTotal").textContent=fmtMoney(rawMat);
    $("#rawLabTotal").textContent=fmtMoney(rawLab);
    $("#rawGrandTotal").textContent=fmtMoney(rawMat+rawLab);
    $("#rawSubtotal").textContent=fmtMoney(pricedTotal);
    $("#markupApplied").textContent=`Tier ${(pct*100).toFixed(0)}%`;
    $("#modeApplied").textContent=modeLabel;
    $("#grandTotal").textContent=fmtMoney(finalTotal);

    // --- Client bucket table ---
    const cBody = $("#clientBucketBody");
    if(cBody){
      cBody.innerHTML = "";
      const order = DATA.bucketOrder || Object.keys(bucketTotals);
      for(const b of order){
        const val = bucketTotals[b] || 0;
        if(val < 0.01) continue;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${b}</td><td>${fmtMoney(val)}</td>`;
        cBody.appendChild(tr);
      }
    }
    const cdRow = $("#clientDiscountRow");
    const cdCell = $("#clientDiscountTotal");
    if(cdRow && cdCell){
      if(discountAmt > 0.01){
        cdRow.classList.remove("hidden");
        cdCell.textContent = "-" + fmtMoney(discountAmt);
      }else{
        cdRow.classList.add("hidden");
        cdCell.textContent = fmtMoney(0);
      }
    }
    $("#clientGrandTotal") && ($("#clientGrandTotal").textContent = fmtMoney(finalTotal));
    $("#printClientTotal") && ($("#printClientTotal").textContent = fmtMoney(finalTotal));

    // --- Print header fields ---
    $("#printCompanyName") && ($("#printCompanyName").textContent = DATA?.company?.name || "");
    $("#printCompanyPhone") && ($("#printCompanyPhone").textContent = `Phone: ${DATA?.company?.phone || ""}`);
    $("#printCompanyEmail") && ($("#printCompanyEmail").textContent = `Email: ${DATA?.company?.email || ""}`);

    $("#printClientName") && ($("#printClientName").textContent = state.clientName || "—");
    $("#printClientAddress") && ($("#printClientAddress").textContent = state.clientAddress || "—");
    $("#printDeckSF") && ($("#printDeckSF").textContent = fmtNum(sf,0));
    $("#printPerimLF") && ($("#printPerimLF").textContent = fmtNum(per,0));
    $("#printMode") && ($("#printMode").textContent = `${modeLabel} • ${state.permitMode==="permit"?"Permit":"Non-Permit"}`);
    $("#printDate") && ($("#printDate").textContent = new Date().toLocaleString());

    save();
  }

  async function loadData(){
    const res=await fetch("data.json",{cache:"no-store"});
    if(!res.ok) throw new Error("Failed to load data.json");
    return await res.json();
  }

  function initTabs(){
    $$(".tab").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const k=btn.dataset.tab;
        $$(".tab").forEach(b=>b.classList.toggle("active", b===btn));
        Object.entries({input:"#tab-input",quote:"#tab-quote",rates:"#tab-rates"}).forEach(([key,sel])=>{
          $(sel).classList.toggle("active", key===k);
        });
      });
    });
  }

  function initCompany(){
    $("#companyName").textContent = DATA.company.name;
    $("#companyPhone").textContent = `📞 ${DATA.company.phone}`;
    $("#companyPhone").href = `tel:${DATA.company.phone.replace(/[^\d+]/g,"")}`;
    $("#companyEmail").textContent = `✉️ ${DATA.company.email}`;
    $("#companyEmail").href = `mailto:${DATA.company.email}`;

    const bust="v="+Date.now();
    const p=DATA.company.logo || "logo.png";
    $("#companyLogo").src = p.includes("?") ? `${p}&${bust}` : `${p}?${bust}`;
    const pl=$("#printLogo");
    if(pl) pl.src = $("#companyLogo").src;
  }

  function wireInputs(){
    ["#inLenFt","#inWidFt","#inDeckSF","#inHeightFt","#inPermitMode","#inAttached",
     "#inPricingMode",
     "#inStairSteps","#inStairWidth","#inFootings","#inRailLF","#inClientName","#inClientAddress"]
    .forEach(sel=>$(sel)?.addEventListener("input", render));

    $("#printClientBtn")?.addEventListener("click", ()=>{
      document.body.dataset.print = "client";
      window.print();
    });
    $("#printInternalBtn")?.addEventListener("click", ()=>{
      document.body.dataset.print = "internal";
      window.print();
    });
    $("#printBothBtn")?.addEventListener("click", ()=>{
      document.body.dataset.print = "both";
      window.print();
    });

    $("#clearBtn")?.addEventListener("click", ()=>{
      if(!confirm("Clear all selections & inputs on this device?")) return;
      const keepAdminUnlocked = state.admin?.unlocked;
      Object.keys(state).forEach(k=>{
        if(k==="selected") state.selected={};
        else if(k==="admin") state.admin={ unlocked:keepAdminUnlocked, useOverride:false, overridePct:null, discountEnabled:false, discountType:"percent", discountValue:0 };
        else state[k]=0;
      });
      state.heightFt=3; state.permitMode="permit"; state.attached="yes"; state.pricingMode="handyman"; state.stairWidth=36;
      save(); location.reload();
    });
  }

  // --- Admin (hidden) ---
  function showAdminUI(){
    const panel = $("#adminPanel");
    const msg = $("#adminStateMsg");
    if(!panel) return;

    panel.style.display = state.admin?.unlocked ? "block" : "none";
    if(msg) msg.textContent = state.admin?.unlocked ? "Unlocked" : "Locked";

    const pctInput = $("#adminMarkupPct");
    const useSel = $("#adminUseOverride");
    if(pctInput) pctInput.value = (state.admin?.overridePct ?? "");
    if(useSel) useSel.value = state.admin?.useOverride ? "yes" : "no";

    const dEn = $("#adminDiscountEnabled");
    const dType = $("#adminDiscountType");
    const dVal = $("#adminDiscountValue");
    if(dEn) dEn.value = state.admin?.discountEnabled ? "yes" : "no";
    if(dType) dType.value = state.admin?.discountType || "percent";
    if(dVal) dVal.value = (state.admin?.discountValue ?? "");
  }

  function unlockAdmin(){
    const pin = prompt("Enter admin PIN:");
    if(pin==null) return;
    if(String(pin) === String(DATA?.adminPin || "2528")){
      state.admin.unlocked = true;
      showAdminUI();
      render();
      save();
    }else{
      alert("Incorrect PIN.");
    }
  }

  function wireAdmin(){
    const applyBtn = $("#adminApplyBtn");
    const resetBtn = $("#adminResetBtn");
    const pctInput = $("#adminMarkupPct");
    const useSel = $("#adminUseOverride");

    if(applyBtn){
      applyBtn.addEventListener("click", ()=>{
        const pct = parseNum(pctInput?.value);
        state.admin.overridePct = pct;
        state.admin.useOverride = (useSel?.value === "yes");

        const dEn = $("#adminDiscountEnabled");
        const dType = $("#adminDiscountType");
        const dVal = $("#adminDiscountValue");
        state.admin.discountEnabled = (dEn?.value === "yes");
        state.admin.discountType = (dType?.value === "fixed") ? "fixed" : "percent";
        state.admin.discountValue = parseNum(dVal?.value);

        save();
        render();
      });
    }

    if(resetBtn){
      resetBtn.addEventListener("click", ()=>{
        state.admin.useOverride = false;
        state.admin.overridePct = null;
        state.admin.discountEnabled = false;
        state.admin.discountType = "percent";
        state.admin.discountValue = 0;

        if(pctInput) pctInput.value = "";
        if(useSel) useSel.value = "no";
        const dEn = $("#adminDiscountEnabled");
        const dType = $("#adminDiscountType");
        const dVal = $("#adminDiscountValue");
        if(dEn) dEn.value = "no";
        if(dType) dType.value = "percent";
        if(dVal) dVal.value = "";
        save();
        render();
      });
    }

    // long-press logo to unlock
    const logo = $("#companyLogo");
    if(logo){
      let pressTimer=null;
      const start = (e) => { try{ e?.preventDefault?.(); }catch{} pressTimer=setTimeout(unlockAdmin, 1200); };
      const clear = () => { if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };

      logo.addEventListener("touchstart", start, {passive:false});
      logo.addEventListener("touchend", clear, {passive:true});
      logo.addEventListener("touchcancel", clear, {passive:true});
      logo.addEventListener("mousedown", start);
      logo.addEventListener("mouseup", clear);
      logo.addEventListener("mouseleave", clear);
      logo.addEventListener("contextmenu", (e)=>{ e.preventDefault(); });
    }
  }

  (async function boot(){
    try{
      load();
      DATA = await loadData();
      initCompany();
      initTabs();
      showAdminUI();
      wireAdmin();

      // defaults
      state.selected["deck_framing"] ??= true;
      state.selected["footings"] ??= true;
      state.selected["surface_pt"] ??= true;
      state.selected["rail_pt"] ??= true;
      state.selected["permit_allow"] ??= true;
      state.selected["job_consumables"] ??= true;
      state.selected["ledger_attach"] ??= true;

      buildScope();
      wireInputs();

      const pm = $("#inPricingMode");
      if(pm) pm.value = state.pricingMode || "handyman";

      render();
    }catch(err){
      console.error(err);
      alert("Deck tool failed to load.\n\nDetails: " + (err?.message||err));
    }
  })();
})();