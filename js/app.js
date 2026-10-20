/* MTCS Tracker - local-first functional app. Vanilla JS + IndexedDB. No accounts/backend.
   Data lives in this browser. Back up regularly. */
(function(){
"use strict";
const APP_VERSION="0.2.8";
/* Cloudflare Worker for one-click MTCS pack fetch (worker/ in private src repo).
   Empty = not deployed yet: app falls back to Download-from-MTCS + Import picker. */
const WORKER_BASE="https://mtcs-forms-fetch.aidanlamb91.workers.dev";
const MP=(window.PACK_META||{}).pages||{};
/* Criteria are NOT bundled: COMPS/CRITS are derived at runtime from the active
   portfolio's locally generated pack (parsed from the user's own MTCS files). */
let COMPS=[],CRITS=[];
function genPackOf(p){return p&&p.genPackId?(S.genPacks||[]).find(g=>g.id===p.genPackId)||null:null;}
function refreshCriteria(){const gp=genPackOf(active());COMPS=[];CRITS=[];if(!gp)return;
(gp.units||[]).forEach(u=>(u.competences||[]).forEach(c=>{const comp=Object.assign({},c,{unitId:u.id,unitName:u.name,unitShort:u.short||(u.id==="core"?"Core":"Role")});COMPS.push(comp);(c.criteria||[]).forEach(k=>CRITS.push(Object.assign({},k,{comp})));}));}
const hasPack=p=>!!genPackOf(p);
const critById=id=>CRITS.find(c=>c.id===id);
const compLabel=c=>(c.unitId==="core"?"Core ":(c.unitShort||"Role "))+(/\s$/.test(c.unitId==="core"?"Core ":(c.unitShort||"Role "))?"":" ")+c.number;
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const uid=p=>(p||"id")+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const todayISO=()=>new Date().toISOString().slice(0,10);
const fmtDate=iso=>{if(!iso)return"-";const d=new Date(iso);return isNaN(d)?esc(iso):d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});};
const STATUSES=["Signed","Evidenced","Planned","Gap"],CODES=["O","P","W","Q","N/C","N/A"];
const stClass=s=>({Signed:"signed",Evidenced:"mapped",Planned:"planned",Gap:"gap"}[s]||"planned");
const pill=s=>`<span class="pill ${stClass(s)}">${s}</span>`;
const checklistIco=`<svg class="nav-svg" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.2 4 7.7 6.8 4.9"/><path d="M2.5 13.2 4 14.7 6.8 11.9"/><path d="M9 6h12.5M9 13h12.5M9 20h12.5"/></svg>`;
function overviewRingIco(p,t){let bg;if(p&&CRITS.length&&t){const n=Math.max(1,CRITS.length);const a=100*t.Signed/n,b=a+100*t.Evidenced/n,c=b+100*t.Planned/n;bg=`conic-gradient(var(--signed) 0 ${a}%,var(--mapped-dot) ${a}% ${b}%,var(--planned-dot) ${b}% ${c}%,var(--gap) ${c}% 100%)`;}else{bg="conic-gradient(var(--signed) 0 34%,var(--mapped-dot) 34% 67%,var(--gap) 67% 100%)";}return `<span class="ico ring-ico" style="background:${bg}" aria-hidden="true"></span>`;}
const DISCLAIMER=`<footer class="disclaimer">Beta v${APP_VERSION} · Local-first app: your data stays in this browser on this device. Back up regularly. Not affiliated with or endorsed by MTCS or IMarEST. Official forms are (c) MTCS Ltd.</footer>`;
const ROLES=[
 {key:"surveyor",name:"Surveyor",ico:"🧭",blurb:"Online and offshore survey operations",grades:["G2","G1","Senior"]},
 {key:"engineer",name:"Survey Engineer",ico:"🔧",blurb:"Survey equipment, mobilisation and fault finding",grades:["G2","G1","Senior"]},
 {key:"processor",name:"Data Processor",ico:"🗺️",blurb:"Processing, QC and charting of survey data",grades:["G2","G1","Senior"]},
 {key:"partychief",name:"Party Chief",ico:"🧑‍✈️",blurb:"Leading the survey team offshore",grades:["Single level"]},
 {key:"clientrep",name:"Client Representative",ico:"🤝",blurb:"Representing the client on site",grades:["Single level"]}];
const isG2Surveyor=(r,g)=>r==="surveyor"&&g==="G2";
let db;
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open("mtcs-tracker",1);r.onupgradeneeded=()=>{r.result.createObjectStore("kv");r.result.createObjectStore("blobs");};r.onsuccess=()=>{db=r.result;res();};r.onerror=()=>rej(r.error);});}
function idb(store,mode,fn){return new Promise((res,rej)=>{const tx=db.transaction(store,mode);const req=fn(tx.objectStore(store));tx.oncomplete=()=>res(req&&req.result);tx.onerror=()=>rej(tx.error);if(req)req.onerror=()=>rej(req.error);});}
const kvGet=k=>idb("kv","readonly",s=>s.get(k)), kvSet=(k,v)=>idb("kv","readwrite",s=>s.put(v,k));
const blobGet=id=>idb("blobs","readonly",s=>s.get(id)), blobSet=(id,b)=>idb("blobs","readwrite",s=>s.put(b,id)), blobDel=id=>idb("blobs","readwrite",s=>s.delete(id)), blobKeys=()=>idb("blobs","readonly",s=>s.getAllKeys());
async function sha256(blob){const buf=await blob.arrayBuffer();const h=await crypto.subtle.digest("SHA-256",buf);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
let S={portfolios:[],templates:[],packImports:[],shared:[],genPacks:[],profile:{name:"",signatureBlobId:null,signatureUpdatedAt:null},settings:{activeId:null,lastBackupAt:null,lastUsedCode:"O",lastWorkActivityId:null}};
let lastSavedAt=null;
function save(){lastSavedAt=new Date();if(!db)return;kvSet("portfolios",S.portfolios).catch(()=>{});kvSet("templates",S.templates).catch(()=>{});kvSet("packImports",S.packImports).catch(()=>{});kvSet("shared",S.shared).catch(()=>{});kvSet("genPacks",S.genPacks).catch(()=>{});kvSet("profile",S.profile).catch(()=>{});kvSet("settings",S.settings).catch(()=>{});const el=document.querySelector("[data-saved-ind]");if(el)el.textContent=savedText();}
const savedText=()=>lastSavedAt?("Saved ✓ "+lastSavedAt.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})):"";
const savedInd=()=>`<span class="saved-ind" data-saved-ind data-testid="saved-ind">${savedText()}</span>`;
const active=()=>S.portfolios.find(p=>p.id===S.settings.activeId)||null;
const ui={openComps:new Set(),role:null,grade:"G2",mState:"Gap",mSearch:"",drawerCrit:null,critNavList:[],critNavLocked:false,drawerAct:null,drawerFromList:false,pendingSigned:null,critScope:"all",selectMode:false,selCrit:new Set(),bulkStatus:"Evidenced",bulkCode:"O",bulkAct:null,evSeg:"inbox",evSearch:"",evEditId:null,pickerSearch:"",pickerFor:null,captureBatch:[],captureLinks:{},batchStatus:"Evidenced",batchCode:"O",formsSearch:"",formsAct:null,preflightAct:null,planOpen:false,packProgress:null,formsSetupFor:null,pendingParse:[],genReview:null,fillSig:false,sigUrl:null,planBuilder:null,planSearch:"",preview:null,modal:null,pendingBackup:null,pendingReturn:null,fillTpl:null,toast:"",toastUndo:false,pdfPreview:null,assessorFlow:null,subScope:null};
let undoStack=[];
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;render();});
if("serviceWorker" in navigator&&/^https?:$/.test(location.protocol)){window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(err=>console.warn("SW failed",err)));}
function newActivity(n){return{id:String(n),n,title:"Activity "+n,planCritIds:[],dates:"",summary:"",where:"",witness:"",assessorName:"",planText:"",feedbackText:"",candidateComments:"",status:"Gathering evidence",planAgreed:"",signedOn:"",exportSeq:0,version:1,versions:[],ukq:[{q:"",a:"",ok:""}],assessorSig:null,candidateSignedAt:null,sigAudit:[],signOffSelections:[]};}
function newPortfolio(name,roleKey,grade,assessedBy){const role=ROLES.find(r=>r.key===roleKey);return{id:uid("pf"),name,roleKey,role:role.name,grade,assessedBy:assessedBy||"",genPackId:null,routeLabel:grade+" "+role.name+(coreLabelForGrade(grade)?" + "+coreLabelForGrade(grade):""),formsPromptSeen:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),activities:[newActivity(1),newActivity(2),newActivity(3)],criteria:{},evidence:[]};}
const actOf=(p,id)=>p.activities.find(a=>a.id===String(id));
const cov=(p,crit,act)=>(p.criteria[crit]||{})[String(act)]||{status:"Gap",code:""};
function critOverall(p,id){let best="Gap";const rank={Gap:0,Planned:1,Evidenced:2,Signed:3};p.activities.forEach(a=>{const c=cov(p,id,a.id);if(rank[c.status]>rank[best])best=c.status;});return best;}
function totals(p){const t={Signed:0,Evidenced:0,Planned:0,Gap:0,direct:0,coded:0};CRITS.forEach(k=>t[critOverall(p,k.id)]++);Object.values(p.criteria).forEach(by=>Object.values(by).forEach(c=>{if(c.code){t.coded++;if(c.code==="O"||c.code==="P")t.direct++;}}));t.directPct=t.coded?Math.round(100*t.direct/t.coded):0;return t;}
const evLinkedCrit=(p,critId)=>p.evidence.filter(e=>e.criteria.includes(critId));
const ATTACH_CODES=["P","W"];
const qLinked=(p,crit,act)=>{const a=actOf(p,act);return !!(a&&(a.ukq||[]).some(u=>String(u.q||"").trim()&&(u.crits||[]).includes(crit)));};
/* Derived (never stored): "attach" = Evidenced P/W with no linked evidence file; "question" = Evidenced Q with no linked Knowledge question in that activity. */
const covFlag=(p,crit,act)=>{const c=cov(p,crit,act);if(c.status!=="Evidenced")return"";if(ATTACH_CODES.includes(c.code)&&!evLinkedCrit(p,crit).length)return"attach";if(c.code==="Q"&&!qLinked(p,crit,act))return"question";return"";};
const covAwaiting=(p,crit,act)=>!!covFlag(p,crit,act);
const critFlags=(p,crit)=>critOverall(p,crit)!=="Evidenced"?[]:[...new Set(p.activities.map(a=>covFlag(p,crit,a.id)).filter(Boolean))];
const critAwaiting=(p,crit)=>critFlags(p,crit).length>0;
const FLAG_LABEL={attach:"Awaiting attachment",question:"Awaiting question link"};
const awaitingIds=p=>CRITS.filter(k=>critAwaiting(p,k.id)).map(k=>k.id);
const cleanTitle=n=>String(n||"").replace(/\.[^.]+$/,"").replace(/[_\-]+/g," ").replace(/\s*(final|copy|v\d+)\s*$/i,"").trim()||"Evidence";
const safeName=s=>String(s==null?"":s).replace(/[\\/:*?"<>|#]/g,"-").replace(/\s+/g," ").trim().replace(/\.+$/,"").slice(0,110)||"file";
const SIG_NOTE="Signature image \u2014 not a legal e-signature service; MTCS ink signature requirements still apply";
const REG_NOTE=SIG_NOTE;
const CODE_LABEL={O:"Observation",P:"Work Product",W:"Written",Q:"Questioning","N/C":"Not Covered","N/A":"Not Applicable"};
const csvCell=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
const planCritOf=(p,a)=>{const ids=(a&&a.planCritIds&&a.planCritIds.length)?a.planCritIds:CRITS.filter(k=>a&&cov(p,k.id,a.id).status!=="Gap").map(k=>k.id);return ids.map(id=>critById(id)).filter(Boolean);};
const KEYWORD_SUGGEST=[[/svp|sound velocity/i,["S07c","S07d"]],[/patch test|calibration/i,["S09a","S09b","S09c"]],[/usbl/i,["S08e","S09c"]],[/mbes|multibeam/i,["S09b","S04a"]],[/geodet|geodesy|gnss/i,["S01c","S10a"]],[/handover/i,["C2c","C3f"]],[/induction|safety|muster/i,["C1a","C1i"]],[/online log|logging/i,["S05b","S05d"]],[/tss/i,["S09a"]],[/lbl/i,["S08f"]]];
function suggestCriteria(name){const out=[];const text=String(name||"");let m;const re=/(S\d{2}[a-z]|C\d[a-z])/ig;while((m=re.exec(text))){const id=m[1][0].toUpperCase()+m[1].slice(1).toLowerCase();if(critById(id)&&!out.includes(id))out.push(id);}KEYWORD_SUGGEST.forEach(([rx,ids])=>{if(rx.test(text))ids.forEach(id=>{if(critById(id)&&!out.includes(id))out.push(id);});});return out.slice(0,4);}
function fileDateISO(f){try{const d=new Date(f.lastModified);return isNaN(d)?todayISO():d.toISOString().slice(0,10);}catch(_){return todayISO();}}
async function maybeCompressImage(file){if(!file.type||!file.type.startsWith("image/")||file.type==="image/png"&&file.size<400000)return file;try{const bmp=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));if(scale>=1&&file.size<800000)return file;const c=document.createElement("canvas");c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",0.82));if(blob&&blob.size<file.size)return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg",lastModified:file.lastModified});}catch(_){}return file;}
function actUnfinished(p,a){const entries=Object.values(p.criteria).map(by=>by[a.id]).filter(Boolean);const planned=entries.filter(c=>c.status!=="Gap");if(!a.summary||!planned.length)return true;if(planned.some(c=>c.status!=="Signed"))return true;if(p.evidence.some(e=>String(e.activityId)===String(a.id)&&!e.criteria.length))return true;return false;}
function workActId(p){const last=p.activities.find(a=>String(a.id)===String(S.settings.lastWorkActivityId));if(last&&actUnfinished(p,last))return last.id;const first=p.activities.find(a=>actUnfinished(p,a));return first?first.id:(p.activities[0]&&p.activities[0].id);}
function projectedDirect(p,ids,actId,status,code){const crit=JSON.parse(JSON.stringify(p.criteria));ids.forEach(id=>{crit[id]=crit[id]||{};crit[id][String(actId)]={status,code};});let coded=0,direct=0;Object.values(crit).forEach(by=>Object.values(by).forEach(c=>{if(c.code){coded++;if(c.code==="O"||c.code==="P")direct++;}}));return coded?Math.round(100*direct/coded):0;}
function bulkBarHTML(){const p=active();if(!p||!ui.selectMode||!ui.selCrit.size||ui.drawerCrit)return"";const actId=ui.bulkAct||(ui.critScope!=="all"?ui.critScope:workActId(p));const ids=[...ui.selCrit];const after=projectedDirect(p,ids,actId,ui.bulkStatus,ui.bulkCode);const counts={};ids.forEach(id=>{const s=critOverall(p,id);counts[s]=(counts[s]||0)+1;});
return `<div class="bulkbar" data-testid="bulk-bar"><div class="bulk-top"><b>${ids.length} selected</b><span class="small">${Object.entries(counts).map(([k,v])=>v+" "+k).join(" · ")}</span><button class="btn sm ghost" data-action="bulk-clear">Clear</button></div><div class="chiprow" role="group" aria-label="Bulk status">${["Gap","Planned","Evidenced","Signed"].map(s=>`<button class="segchip ${ui.bulkStatus===s?"on":""}" data-bulk-status="${s}">${s}</button>`).join("")}</div><div class="chiprow" role="group" aria-label="Bulk code">${CODES.map(c=>`<button class="segchip ${ui.bulkCode===c?"on":""}" data-bulk-code="${c}">${c}</button>`).join("")}<select data-bulk-act aria-label="Activity">${p.activities.map(a=>`<option value="${a.id}" ${String(actId)===String(a.id)?"selected":""}>Activity ${a.n}</option>`).join("")}</select></div><div class="small ${after<70?"bulk-warn":""}" data-bulk-preview>After applying ${ui.bulkStatus}/${ui.bulkCode} in Activity ${(actOf(p,actId)||{}).n||""}: direct evidence ${after}%${after<70?" — below the 70% guide. This mix would pull direct evidence down.":" ✓ (70% guide)"}</div><button class="btn primary block" data-action="bulk-apply" data-testid="bulk-apply">Apply to ${ids.length}</button></div>`;}
function packStatus(k){return S.packImports.filter(i=>i.packKey===k).sort((a,b)=>b.importedAt.localeCompare(a.importedAt))[0]||null;}
const storedBadge=()=>`<span class="pill signed stored-badge" data-testid="stored-badge" title="Stored locally on this device">\u{1F4BE} Stored locally</span>`;
const notStoredBadge=()=>`<span class="pill warn stored-badge" data-testid="not-stored-badge">Not stored</span>`;
function cleanupPortfolioPeople(){let changed=false;S.portfolios.forEach(pf=>{if("assessor" in pf||"witness" in pf){delete pf.assessor;delete pf.witness;changed=true;}});if(changed)save();return changed;}
function packBannerHTML(){const s=packStatus("g2-surveyor"),c=packStatus("g2-core");if(s&&c)return `<div class="pack-banner"><span class="pb-ico">🧰</span><div class="grow"><b>Forms packs imported</b><div class="small muted">Surveyor: ${s.fileCount} files, ${fmtDate(s.importedAt)} · Core: ${c.fileCount} files, ${fmtDate(c.importedAt)}. Blank templates stored in this browser.</div></div><a class="btn sm" href="#/forms">Forms</a></div>`;return `<div class="pack-banner"><span class="pb-ico">🧰</span><div class="grow"><b>Forms pack: ${(s||c)?"partly imported":"not imported yet"}</b><div class="small muted">Download the current packs from MTCS when you start a portfolio, then import them here. The app uses those blank templates throughout.</div></div><a class="btn sm primary" href="#/forms">Get the forms pack</a></div>`;}
let toastTimer=null;function toast(m,withUndo){ui.toast=m;ui.toastUndo=!!withUndo;render();clearTimeout(toastTimer);toastTimer=setTimeout(()=>{ui.toast="";ui.toastUndo=false;const t=document.querySelector(".toast");if(t)t.remove();},6000);}
const toastHTML=()=>ui.toast?`<div class="toast">${esc(ui.toast)}${ui.toastUndo?` <button class="btn sm" data-action="undo-last" data-testid="undo-toast">Undo</button>`:""}</div>`:"";
function pushUndo(label,fn){undoStack.push({label,fn});if(undoStack.length>20)undoStack.shift();}
function parse(){const h=location.hash.replace(/^#/,"")||"/";const[path,q]=h.split("?");return{parts:path.split("/").filter(Boolean),params:new URLSearchParams(q||"")};}
const here=()=>location.hash.split("?")[0]||"#/";
function shell(title,body,nav){const p=active(),t=p?totals(p):null,lastB=S.settings.lastBackupAt;
return `<header class="topbar"><a class="home-btn" href="#/" data-testid="home-icon" aria-label="Home — back to portfolio selector" title="Home — portfolio selector">⌂</a><div class="brand"><span class="logo" id="top-bar-logo">🧭</span><span>MTCS Tracker <span class="beta-tag">Beta v${APP_VERSION}</span></span></div>${p?`<span class="pack-chip">${esc(p.routeLabel)} · ${esc(p.name)}</span>`:""}<span class="spacer"></span><span class="backup-chip" data-testid="backup-status"><span class="bdot" style="${lastB?"":"background:#ff6b5e"}"></span><span class="bl">${lastB?"Backed up "+fmtDate(lastB):"No backup yet"}</span></span><button class="route-chip" data-action="install" data-testid="install-btn">⬇ Install app</button></header>
<div class="shell"><nav class="sidenav"><div class="group">Portfolio</div>
<a href="#/dashboard" class="${nav==="dashboard"?"active":""}">${overviewRingIco(p,t)}<span class="lbl">Overview</span></a>
<a href="#/work" class="${nav==="activities"?"active":""}"><span class="ico">🧭</span><span class="lbl">Work</span>${p?`<span class="count">${p.activities.length}</span>`:""}</a>
<a href="#/criteria" class="${nav==="matrix"?"active":""}"><span class="ico">${checklistIco}</span><span class="lbl">Criteria</span>${t?`<span class="count alert">${t.Gap}</span>`:""}</a>
<a href="#/evidence" class="${nav==="evidence"?"active":""}"><span class="ico">🗂️</span><span class="lbl">Evidence</span>${p?`<span class="count">${p.evidence.length}</span>`:""}</a>
<div class="group">Assess</div><a href="#/forms" class="${nav==="forms"?"active":""}"><span class="ico">📄</span><span class="lbl">Forms &amp; packs</span></a>
<a href="#/export" class="${nav==="export"?"active":""}"><span class="ico">⤓</span><span class="lbl">Export / submission</span></a>
<div class="group">Data</div><a href="#/backup" class="${nav==="backup"?"active":""}"><span class="ico">☁️</span><span class="lbl">Backup &amp; restore</span></a>
<a href="#/settings" class="${nav==="settings"?"active":""}"><span class="ico">⚙️</span><span class="lbl">Settings</span></a>
${p?`<div class="trip-box"><b>${esc(p.name)}</b><br>${esc(p.vessel||"No vessel set")}<br><span class="muted">${esc(p.trip||"")}</span></div>`:""}</nav>
<main><h1 class="sr-only">${esc(title)}</h1>${body}${DISCLAIMER}</main></div>
<nav class="bottomnav"><a href="#/dashboard" class="${nav==="dashboard"?"active":""}" data-testid="tab-overview">${overviewRingIco(p,t)}Overview</a><a href="#/work" class="${nav==="activities"?"active":""}"><span class="ico">🧭</span>Work</a><button class="fab" data-action="quick-capture" data-testid="quick-capture" aria-label="Add evidence">＋<span>Add</span></button><a href="#/criteria" class="${nav==="matrix"?"active":""}" data-testid="tab-criteria"><span class="ico">${checklistIco}${t&&t.Gap?`<span class="badge">${t.Gap}</span>`:""}</span>Criteria</a><a href="#/more" class="${nav==="more"?"active":""}"><span class="ico">•••</span>More</a></nav>${toastHTML()}${bulkBarHTML()}${modalHTML()}${drawerHTML()}`;}
function viewLanding(){
const sharedRows=S.shared.map(x=>`<a class="shared-row" href="#/shared/${x.id}"><span class="num">${esc(x.activity.n||"•")}</span><span class="grow"><b>Activity ${esc(x.activity.n)} · ${esc(x.activity.title)}</b><span class="small muted">From ${esc(x.candidateName||"candidate")} · imported ${fmtDate(x.importedAt)} · package v${esc(x.manifest.exportSeq||1)}</span></span><span class="pill planned">Imported copy</span><span class="chev">›</span></a>`).join("");
return `<header class="topbar"><div class="brand"><span class="logo" id="top-bar-logo">🧭</span><span>MTCS Tracker <span class="beta-tag">Beta v${APP_VERSION}</span></span></div><span class="spacer"></span><button class="route-chip" data-action="install" data-testid="install-btn">⬇ Install app</button></header>
<div class="landing-main"><div class="landing"><section class="landing-hero"><span class="pill info">Beta v${APP_VERSION} · Local-first · no account needed</span><h1>Your MTCS portfolio, on your device</h1><p>Track criteria across activities, add evidence, and share an activity as a zip. Everything stays in this browser — back up regularly.</p></section>
<h2 class="landing-h2">My portfolios</h2>
${S.portfolios.length?S.portfolios.map(p=>{const gp=genPackOf(p),gc=gp?gp.units.reduce((n,u)=>n+u.competences.reduce((m,c)=>m+c.criteria.length,0),0):0;return `<div class="card port-row" style="margin-bottom:10px"><span class="role-ico">🧭</span><span class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.routeLabel)} · ${gp?gc+" criteria from your imported pack":"criteria not built yet — import your forms pack"} · ${p.evidence.length} evidence files</div></span><button class="btn primary" data-action="open-portfolio" data-id="${p.id}" data-testid="open-portfolio">Open</button><button class="btn sm" data-action="delete-portfolio" data-id="${p.id}">Delete</button></div>`;}).join(""):`<div class="card" data-testid="empty-state"><b>No portfolios yet</b><p class="small muted">Choose your route below and create your first portfolio. It will be saved in this browser.</p></div>`}
<h2 class="landing-h2" id="switch">Start a new portfolio</h2><div class="role-list">${ROLES.map(r=>`<div class="role-card ${r.key===ui.role?"open":""}"><button class="role-head" data-action="pick-role" data-role="${r.key}"><span class="role-ico">${r.ico}</span><span class="grow"><b>${esc(r.name)}</b><span class="small muted">${esc(r.blurb)}</span></span><span class="chev">${r.key===ui.role?"▾":"›"}</span></button>
${r.key===ui.role?`<div class="role-body"><div class="grade-seg ${r.grades.length===1?"single":""}">${r.grades.map(g=>`<button data-action="pick-grade" data-grade="${g}" class="${g===ui.grade?"on":""}">${g}</button>`).join("")}</div>
<div class="route-summary"><div class="rs-title">${esc(ui.grade)} ${esc(r.name)}${coreLabelForGrade(ui.grade)?` <span class="plus">+</span> ${coreLabelForGrade(ui.grade)}`:""}</div><p class="small muted">Criteria are built from your imported forms pack.</p>
<form data-form="create-portfolio"><div class="field"><label for="pf-name">Name *</label><input id="pf-name" name="name" required placeholder="Your full name" data-testid="pf-name"></div><div class="field"><label>Assessed by (optional)</label><input name="assessedBy" placeholder="Assessor name, if known" data-testid="pf-assessedby"></div><button class="btn primary lg block" type="submit" data-testid="create-portfolio">Create ${esc(ui.grade)} ${esc(r.name)} portfolio</button></form></div></div>`:""}</div>`).join("")}</div>
<div class="card import-card"><div class="port-row"><span class="imp-ico">⤒</span><span class="grow"><b>Lost your data? Import a backup</b><div class="small muted">Restores a full backup zip into this browser. Importing replaces what's currently stored here.</div></span></div><div class="btn-row"><label class="btn primary">Import backup (.zip)<input type="file" accept=".zip" hidden data-upload="backup"></label></div></div>
<div class="card shared-card" id="shared"><h2>Shared with me</h2><p class="small muted">An assessor can import an activity zip here — no account needed. It opens as a separate imported copy, never inside your own portfolio.</p><div class="btn-row"><label class="btn primary">Import activity zip (.zip)<input type="file" accept=".zip" hidden data-upload="shared"></label></div><div class="shared-list">${sharedRows||`<p class="small muted">Nothing shared yet.</p>`}</div></div>
${DISCLAIMER}</div></div>${toastHTML()}${modalHTML()}`;}
function whatsNext(p){const items=[],t=totals(p);const firstGap=CRITS.find(k=>critOverall(p,k.id)==="Gap");if(firstGap)items.push({dot:"var(--gap)",text:`${t.Gap} criteria still Gap — start with ${firstGap.id}`,href:"#/criteria"});
const plannedNoEv=CRITS.find(k=>p.activities.some(a=>cov(p,k.id,a.id).status==="Planned")&&!evLinkedCrit(p,k.id).length);if(plannedNoEv)items.push({dot:"var(--planned-dot)",text:`Planned with no evidence yet: ${plannedNoEv.id}`,href:"#/criteria?c="+plannedNoEv.id});
const aw=awaitingIds(p),awA=aw.filter(id=>critFlags(p,id).includes("attach")),awQ=aw.filter(id=>critFlags(p,id).includes("question"));if(awA.length)items.push({dot:"var(--mapped-dot)",text:`${awA.length} criteria awaiting attachment (${awA.slice(0,3).join(", ")}${awA.length>3?"…":""})`,href:"#/criteria?f=awaiting"});if(awQ.length)items.push({dot:"var(--mapped-dot)",text:`${awQ.length} criteria awaiting question link (${awQ.slice(0,3).join(", ")}${awQ.length>3?"…":""})`,href:"#/criteria?f=awaiting"});
const unmapped=p.evidence.filter(e=>!e.criteria.length);if(unmapped.length)items.push({dot:"var(--mapped-dot)",text:`${unmapped.length} evidence item(s) not linked to any criterion`,href:"#/evidence"});
p.activities.forEach(a=>{if(!a.summary)items.push({dot:"var(--brand)",text:`Activity ${a.n} needs a work-activity summary`,href:"#/activity/"+a.id});});
if(!hasPack(p))items.push({dot:"var(--brand)",text:"Criteria not built yet — fetch or import your forms pack",href:"#/forms"});
const lb=S.settings.lastBackupAt;if(!lb||Date.now()-new Date(lb).getTime()>7*864e5)items.push({dot:"var(--gap)",text:lb?"Last backup is over 7 days old":"No backup yet — export one before you rely on this device",href:"#/backup"});
if(!items.length)items.push({dot:"var(--signed)",text:"All caught up — keep adding evidence",href:"#/evidence"});return items.slice(0,6);}
function viewDashboard(){const p=active();if(!p){location.hash="#/";return"";}const t=totals(p);
return shell("Dashboard",`<div class="dash-head"><a class="ctx-chip" href="#/more"><b>${esc(p.name)}</b><span>${esc(p.routeLabel)}</span></a><div class="actions"><button class="btn" data-action="export-backup" data-testid="dash-backup">Back up now</button></div></div>
${hasPack(p)?"":`<section class="card" data-testid="criteria-locked"><h2>Build your criteria list</h2><div class="btn-row"><a class="btn primary" href="#/forms">Get my forms pack</a></div></section>`}
<section class="card next-card"><div class="card-head"><h2>What's next</h2></div><div class="next-list" data-testid="whats-next">${whatsNext(p).map(i=>`<a class="next-row" href="${i.href}"><span class="dot" style="background:${i.dot}"></span><span class="grow">${esc(i.text)}</span><span class="chev">›</span></a>`).join("")}</div></section>
${hasPack(p)?`<section class="card"><div class="card-head"><h2>Readiness</h2><span class="right small muted">${CRITS.length} criteria</span></div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div class="ring" style="--v:${CRITS.length?100*t.Signed/CRITS.length:0};--w:${CRITS.length?100*(t.Signed+t.Evidenced)/CRITS.length:0};--x:${CRITS.length?100*(t.Signed+t.Evidenced+t.Planned)/CRITS.length:0}" data-label="${t.Signed} signed\n${t.Gap} gaps"></div><div class="grow"><div class="stat-line"><span class="sw signed"></span>Signed <b>${t.Signed}</b></div><div class="stat-line"><span class="sw mapped"></span>Evidenced <b>${t.Evidenced}</b>${(()=>{const n=awaitingIds(p).length;const ids=awaitingIds(p),a=ids.filter(id=>critFlags(p,id).includes("attach")).length,q=ids.filter(id=>critFlags(p,id).includes("question")).length;return n?` <span class="small await-txt" data-testid="legend-awaiting">(${[a?a+" awaiting attachment":"",q?q+" awaiting question link":""].filter(Boolean).join(", ")})</span>`:"";})()}</div><div class="stat-line"><span class="sw planned"></span>Planned <b>${t.Planned}</b></div><div class="stat-line"><span class="sw gap"></span>Gap <b>${t.Gap}</b></div><p class="small muted" style="margin-top:10px">Direct evidence (O/P): <b>${t.directPct}%</b> of coded criteria (70% minimum guide).</p><div class="meter" style="--d:${t.directPct}%"><span class="mark"></span></div></div></div></section>`:""}
<h2 class="sec-h">Work</h2><div class="stack">${p.activities.map(a=>`<a class="act-card" href="#/activity/${a.id}"><span class="num">${a.n}</span><span class="grow"><b>${esc(a.title)}</b><span class="small muted" style="display:block">${esc(a.dates||"No dates yet")} · ${esc(a.status)}</span></span><span class="chev">›</span></a>`).join("")}</div>`,"dashboard");}
function viewActivities(){const p=active();if(!p){location.hash="#/";return"";}
return shell("Work",`<div class="page-head"><div><div class="crumb">Portfolio</div><h1>Work</h1></div><div class="actions"><button class="btn" data-action="add-activity" data-testid="add-activity">+ Add activity</button></div></div><div class="stack">${p.activities.map(a=>{const cnt=CRITS.filter(k=>cov(p,k.id,a.id).status!=="Gap").length;return `<a class="act-card" href="#/activity/${a.id}"><span class="num">${a.n}</span><span class="grow"><b>${esc(a.title)}</b><span class="small muted" style="display:block">${esc(a.dates||"No dates")} · ${cnt} criteria in plan · ${esc(a.status)}</span></span><span class="chev">›</span></a>`;}).join("")}</div>`,"activities");}
function evRow(p,e){const sug=!e.criteria.length?suggestCriteria(e.fileName+" "+e.title):[];return `<li class="${e.criteria.length?"":"unmapped"}" style="align-items:center"><span class="ev-ico">${e.mime&&e.mime.startsWith("image/")?"📷":"📄"}</span><div class="grow"><b class="small">${esc(e.title)}</b>${e.redact?` <span class="pill warn">Check for client data</span>`:""}<div class="fname">${esc(e.fileName)} · ${(e.size/1024).toFixed(1)} KB · ${esc(e.date||"")}</div><div>${e.criteria.map(c=>`<button class="ev-chip" data-action="open-crit" data-crit="${c}">${c}</button>`).join("")||`<span class="pill gap" style="margin-top:6px">Unmapped</span>`}</div>
${sug.length?`<div class="small muted" style="margin-top:4px">Guess — check before linking: ${sug.map(id=>`<button class="ev-chip suggest" data-action="accept-suggest" data-id="${e.id}" data-crit="${id}">${id} +</button>`).join("")}</div>`:""}</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end"><button class="btn sm" data-action="preview-ev" data-id="${e.id}" data-testid="preview-ev">Preview</button><button class="btn sm" data-action="ev-edit" data-id="${e.id}" data-testid="ev-edit">Edit</button><button class="btn sm" data-action="download-ev" data-id="${e.id}">Download</button><button class="btn sm ghost" data-action="delete-ev" data-id="${e.id}">Delete</button></div></li>`;}
function viewActivity(id,params){const p=active();if(!p){location.hash="#/";return"";}
let a=id?actOf(p,id):null;if(!a){a=actOf(p,workActId(p))||p.activities[0];}if(!a)return shell("Work",`<div class="card">No activities yet.</div>`,"activities");
S.settings.lastWorkActivityId=a.id;save();
if(params&&params.get("c")){ui.drawerCrit=params.get("c");ui.drawerAct=a.id;ui.drawerFromList=true;}
const ev=p.evidence.filter(e=>String(e.activityId)===String(a.id)), planIds=new Set(a.planCritIds||[]), planned=CRITS.filter(k=>planIds.has(k.id));
const entries=planned.map(k=>cov(p,k.id,a.id)), doneCt=entries.filter(c=>["Evidenced","Signed"].includes(c.status)).length;
const actCoded=entries.filter(c=>c.code), actDirect=actCoded.length?Math.round(100*actCoded.filter(c=>["O","P"].includes(c.code)).length/actCoded.length):0;
const unmappedEv=ev.filter(e=>!e.criteria.length);
const groups=COMPS.map(c=>{const ks=c.criteria.filter(k=>planIds.has(k.id));if(!ks.length)return"";return `<div class="crit-group"><div class="cg-head">${compLabel(c)} <span class="muted small">${esc(c.title)}</span></div>${ks.map(k=>{const cv=cov(p,k.id,a.id);return `<div class="crit-line">${ui.selectMode?`<input type="checkbox" class="selbox" data-sel-crit="${k.id}" ${ui.selCrit.has(k.id)?"checked":""} aria-label="Select ${k.id}">`:""}<a class="crit-line-main" href="#/activity/${a.id}?c=${k.id}"><span class="mcell ${stClass(cv.status)}">${esc(cv.code||"—")}</span><span class="crit-id">${k.id}</span><span class="cl-text">${esc(k.text)}</span>${pill(cv.status)}</a></div>`;}).join("")}</div>`;}).join("");
const planFilled=!!(a.summary||a.dates||a.where);
const planBody=(planFilled&&!ui.planOpen)?`<div class="plan-oneline"><span class="grow"><b>${esc(a.summary||a.title)}</b><span class="small muted" style="display:block">${esc(a.dates||"")} ${a.where?"· "+esc(a.where):""} · Witness: ${esc(a.witness||"—")} · Assessor: ${esc(a.assessorName||"—")}</span></span><button class="btn sm" data-action="plan-edit">Edit plan</button></div>`
:`<form data-form="activity-edit" data-act="${a.id}">
<div class="field"><label>Work activity summary</label><textarea name="summary" data-afield="summary" data-act="${a.id}" data-testid="act-summary">${esc(a.summary)}</textarea></div>
<div class="field"><label>Dates</label><input name="dates" data-afield="dates" data-act="${a.id}" value="${esc(a.dates)}"></div>
<div class="field"><label>Where</label><input name="where" data-afield="where" data-act="${a.id}" value="${esc(a.where)}"></div>
<div class="field"><label>Assessor name (this activity only)</label><input name="assessorName" data-afield="assessorName" data-act="${a.id}" value="${esc(a.assessorName)}" placeholder="Assessor for this activity"></div>
<div class="field"><label>Witness name (this activity only)</label><input name="witness" data-afield="witness" data-act="${a.id}" value="${esc(a.witness)}" placeholder="Witness for this activity"></div>
<div class="field"><label>Plan notes</label><textarea name="planText" data-afield="planText" data-act="${a.id}">${esc(a.planText)}</textarea></div>
<div class="btn-row"><button class="btn primary sm" type="submit" data-testid="save-activity">Save activity</button></div></form>`;
const prevAct=p.activities.filter(x=>x.n<a.n).slice(-1)[0];
return shell("Work — Activity "+a.n,`<div class="act-switch">${p.activities.map(x=>`<a href="#/activity/${x.id}" class="${x.id===a.id?"on":""}"><b>${x.n}</b> Activity ${x.n}</a>`).join("")}</div>
<section class="card act-status"><div class="as-top"><span class="num">${a.n}</span><div class="grow"><div class="field"><label>Activity title</label><input value="${esc(a.title)}" data-abind="title" data-act="${a.id}" data-testid="act-title"></div><span class="pill planned">${esc(a.status)}</span> <span class="small muted">${doneCt}/${planned.length} planned criteria evidenced · Direct ${actDirect}% ${actCoded.length?(actDirect>=70?"✓":"(70% guide)"):""}</span> ${savedInd()}</div></div>
${unmappedEv.length?`<div class="next-step"><b>Next step</b><span>${unmappedEv.length} evidence file(s) in this activity still need criteria — link them below or in Evidence inbox.</span></div>`:""}
${a.copiedUnconfirmed?`<div class="warn-box" data-testid="copied-flag"><b>Copied from Activity ${a.copiedFrom} — check dates, place and people</b><div class="btn-row"><button class="btn sm primary" data-action="confirm-copied" data-act="${a.id}">I've checked this plan</button></div></div>`:""}
<div class="btn-row"><a class="btn" href="#/assessor/${a.id}">Preview assessor view</a>${prevAct&&!planFilled?`<button class="btn" data-action="copy-plan" data-act="${a.id}" data-from="${prevAct.id}" data-testid="copy-plan">Copy plan from Activity ${prevAct.n}</button>`:""}</div></section>
<section class="card"><div class="card-head"><h2>Assessment plan</h2>${savedInd()}</div>${planBody}</section>
<section class="card"><div class="card-head"><h2>Assessment plan — criteria covered</h2><span class="right" style="display:flex;gap:6px"><button class="btn sm primary" data-action="plan-builder-open" data-act="${a.id}" data-testid="plan-builder-open">+ Add competencies</button><button class="btn sm ${ui.selectMode?"primary":""}" data-action="toggle-select" data-testid="toggle-select">${ui.selectMode?"Selecting…":"Select"}</button></span></div>
${groups||`<p class="small muted">No competences in this plan yet. Tap <b>+ Add competencies</b>.</p>`}</section>
<section class="card"><div class="card-head"><h2>Evidence</h2><span class="right small muted">${ev.length} items</span></div>
<ul class="list">${ev.map(e=>evRow(p,e)).join("")||`<li class="muted small">No evidence for this activity yet. Use ＋ Add.</li>`}</ul></section>
<section class="card" data-testid="banner-knowledge"><div class="card-head"><h2>Knowledge questions</h2>${savedInd()}</div>
<form data-form="activity-edit" data-act="${a.id}">
${a.ukq.map((u,i)=>`<div class="field"><label>Question ${i+1}${(u.crits||[]).length?` <span class="tiny muted" data-testid="ukq-crits">· covers ${esc(u.crits.join(", "))}</span>`:""}</label><input name="ukq-q-${i}" value="${esc(u.q)}" placeholder="Question"><input name="ukq-a-${i}" value="${esc(u.a)}" placeholder="Your answer / notes"><input name="ukq-ok-${i}" value="${esc(u.ok)}" placeholder="Satisfactory? Y/N"></div>`).join("")}
<div class="btn-row"><button class="btn sm" type="button" data-action="add-ukq" data-act="${a.id}">+ Add question</button> <button class="btn primary sm" type="submit">Save</button></div></form></section>
<section class="card" data-testid="banner-feedback"><div class="card-head"><h2>Feedback form</h2>${savedInd()}</div>
<form data-form="activity-edit" data-act="${a.id}">
<div class="field"><label>Assessor feedback (arrives via return zip; editable here)</label><textarea name="feedbackText" data-afield="feedbackText" data-act="${a.id}">${esc(a.feedbackText)}</textarea></div>
<div class="field"><label>Candidate comments</label><textarea name="candidateComments" data-afield="candidateComments" data-act="${a.id}">${esc(a.candidateComments)}</textarea></div>
<div class="btn-row"><button class="btn primary sm" type="submit">Save</button></div></form></section>
<details class="card"><summary><h2 style="display:inline">Send history, import return &amp; versions</h2></summary>
<div class="share-block"><b>Import assessor return (.zip)</b><p class="small muted">Review first; import never silently overwrites, with rollback.</p><div class="btn-row"><label class="btn">⤒ Import return<input type="file" accept=".zip" hidden data-upload="return" data-act="${a.id}"></label><button class="btn" data-action="export-activity" data-act="${a.id}" data-testid="export-activity">Download activity zip</button><button class="btn" data-action="snapshot" data-act="${a.id}">Save version snapshot</button></div><p class="tiny muted">Exports so far: ${a.exportSeq} · current version v${a.version}</p></div>
<div class="share-block"><b>Version history</b><ul class="list small"><li><span class="pill signed">v${a.version}</span><div class="grow">Current</div></li>${(a.versions||[]).slice().reverse().map(v=>`<li><span class="pill planned">v${v.version}</span><div class="grow">${esc(v.label)} · ${fmtDate(v.at)}</div><button class="btn sm" data-action="rollback" data-act="${a.id}" data-ver="${v.version}">Restore</button></li>`).join("")||`<li class="muted small">No earlier versions yet.</li>`}</ul></div></details>
<section class="card" data-testid="sign-card"><div class="card-head"><h2>Signatures &amp; forms preview</h2></div>
<p class="small muted">${SIG_NOTE}. Candidate signing uses your Profile signature only when you tap it; nothing is auto-signed.</p>
<div class="share-block"><b>Candidate signature</b><p class="small muted">${S.profile.signatureBlobId?"Profile signature saved on this device.":"No Profile signature yet \u2014 add one in More \u2192 Profile."}</p>${a.candidateSignedAt?`<p class="small" data-testid="candidate-signed">\u2713 You signed this activity on ${fmtDate(a.candidateSignedAt)} <button class="btn sm ghost" data-action="candidate-unsign" data-act="${a.id}">Undo sign</button></p>`:S.profile.signatureBlobId?`<div class="btn-row"><button class="btn primary" data-action="candidate-sign" data-act="${a.id}" data-testid="candidate-sign">Add my e-signature to this activity</button></div>`:`<div class="btn-row"><a class="btn" href="#/profile">Go to Profile signature</a></div>`}</div>
<div class="share-block"><b>Assessor signature</b>${a.assessorSig?`<p class="small" data-testid="assessor-signed">\u2713 Signed by ${esc(a.assessorSig.name||a.assessorName||"Assessor")} on ${fmtDate(a.assessorSig.signedAt)} (${esc(a.assessorSig.source||"drawn")})</p><div class="btn-row"><button class="btn" data-action="assessor-sign-open" data-act="${a.id}" data-testid="assessor-sign-open">Assessor sign-off</button></div>`:`<p class="small muted">Not signed yet.</p><div class="btn-row"><button class="btn primary" data-action="assessor-sign-open" data-act="${a.id}" data-testid="assessor-sign-open">Assessor sign-off</button></div>`}</div>
<div class="btn-row"><button class="btn" data-action="work-preview" data-act="${a.id}" data-testid="preview-forms">Preview</button><button class="btn" data-action="submission-export" data-act="${a.id}">Download this activity\u2019s submission forms+evidence</button></div></section>
<section class="card send-end-card"><div class="send-row"><button class="btn send-preview-btn" data-action="work-preview" data-act="${a.id}" data-testid="work-preview">Preview</button><button class="btn primary send-end-btn" data-action="send-preflight" data-act="${a.id}" data-testid="send-btn">Send\u2026</button></div><p class="tiny muted" style="margin-top:8px">Preview shows the filled Assessment plan, Feedback form, Assessor sign-off and Knowledge questions for this activity exactly as they will be exported (not editable).</p></section>`,"activities");}
function visibleCritIds(p){const q=ui.mSearch.toLowerCase();const ids=[];COMPS.forEach(c=>c.criteria.forEach(k=>{if((ui.mState==="all"||critOverall(p,k.id)===ui.mState)&&(!q||k.id.toLowerCase().includes(q)||k.text.toLowerCase().includes(q)))ids.push(k.id);}));return ids;}
function viewMatrix(params){const p=active();if(!p){location.hash="#/";return"";}if(!hasPack(p))return shell("Criteria",`<div class="card" data-testid="criteria-locked"><h2>Criteria not built yet</h2><div class="btn-row"><a class="btn primary" href="#/forms">Get my forms pack</a>${S.templates.some(x=>/Competence\d+\.pdf$/i.test(x.fileName))?`<button class="btn" data-action="build-pack-stored" data-testid="build-pack-stored">Build criteria from stored forms</button>`:""}</div></div>`,"matrix");if(params&&params.get("f"))ui.mState={gap:"Gap",signed:"Signed",evidenced:"Evidenced",planned:"Planned",awaiting:"Awaiting"}[params.get("f")]||ui.mState;
const q=ui.mSearch.toLowerCase();ui._visibleCritIds=visibleCritIds(p);ui.critScope="all";const scoped=false;
const awSet=new Set(awaitingIds(p));const stMatch=k=>ui.mState==="Awaiting"?awSet.has(k.id):critOverall(p,k.id)===ui.mState;
const typeChips=k=>{const ov=critOverall(p,k.id);if(ov!=="Planned"&&ov!=="Evidenced")return"";const acts=scoped?[ui.critScope]:p.activities.map(a=>a.id);const cur=new Set(acts.map(id=>cov(p,k.id,id)).filter(c=>c.status==="Evidenced"&&CODES.includes(c.code)).map(c=>c.code));return `<div class="type-chips" role="group" aria-label="Evidence type for ${k.id}" data-testid="type-chips">${["O","P","W","Q"].map(c=>`<button class="segchip sm ${cur.has(c)?"on":""}" data-ev-type="${c}" data-crit="${k.id}" title="${CODE_LABEL[c]}">${c}</button>`).join("")}${ov==="Evidenced"?`<button class="segchip sm ghost" data-ev-type="" data-crit="${k.id}" title="Clear type — back to Planned">✕</button>`:""}</div>`;};
const critLetter=(c,k)=>{const m=String(k.id).match(/[a-z]$/);return m?m[0]:String.fromCharCode(97+c.criteria.indexOf(k));};
const qLinkUI=k=>{const acts=(scoped?[ui.critScope]:p.activities.map(a=>a.id)).filter(id=>covFlag(p,k.id,id)==="question");return acts.map(id=>{const a=actOf(p,id);const qs=(a.ukq||[]).map((u,i)=>({u,i})).filter(x=>String(x.u.q||"").trim());return `<div class="qlink" data-testid="qlink"><span class="tiny muted">${p.activities.length>1?"A"+a.n+" ":""}Q link</span><select data-qlink-crit="${k.id}" data-qlink-act="${a.id}" aria-label="Link ${k.id} to a knowledge question in Activity ${a.n}"><option value="">Pick a question…</option>${qs.map(x=>`<option value="${x.i}">Q${x.i+1}: ${esc(String(x.u.q).slice(0,60))}</option>`).join("")}<option value="new">+ Add new question…</option></select></div>`;}).join("");};
const cards=COMPS.map(c=>{const ks=c.criteria.filter(k=>stMatch(k)&&(!q||k.id.toLowerCase().includes(q)||k.text.toLowerCase().includes(q)));if(!ks.length)return"";const done=c.criteria.filter(k=>["Signed","Evidenced"].includes(critOverall(p,k.id))).length;
return `<details class="comp-card" data-comp-open="${c.id}" ${ui.openComps.has(c.id)?"open":""}><summary><span class="cc-title"><b>${compLabel(c)}</b> · ${done}/${c.criteria.length} evidenced · in ${p.activities.filter(a=>c.criteria.some(k=>cov(p,k.id,a.id).status!=="Gap")).length}/${p.activities.length} activities</span><span class="small muted">${esc(c.title)}</span></summary>${ks.map(k=>`<div class="cc-row-wrap ${awSet.has(k.id)?"awaiting":""}" data-testid="crit-row" data-crit-row="${k.id}">${ui.selectMode?`<input type="checkbox" class="selbox" data-sel-crit="${k.id}" ${ui.selCrit.has(k.id)?"checked":""} aria-label="Select ${k.id}">`:""}<a class="cc-row compact" href="#/criteria?c=${k.id}" data-crit-link="${k.id}"><span class="crit-id" data-testid="crit-letter" title="${k.id}">${critLetter(c,k)}</span><span class="cc-text">${esc(k.text)} <span class="cc-pills">${pill(critOverall(p,k.id))}${critFlags(p,k.id).map(fl=>` <span class="pill await" data-testid="awaiting-badge" data-flag="${fl}">${FLAG_LABEL[fl]}</span>`).join("")}</span></span></a>${typeChips(k)}${qLinkUI(k)}</div>`).join("")}</details>`;}).join("");
return shell("Criteria",`<div class="page-head"><div><div class="crumb">Criteria</div><h1>Criteria</h1></div><div class="actions"><button class="btn ${ui.selectMode?"primary":""}" data-action="toggle-select" data-testid="toggle-select">${ui.selectMode?"Selecting…":"Select"}</button></div></div>
<div class="filters"><div class="seg" role="group" aria-label="Filter by status">${["Gap","Planned","Evidenced","Signed"].map(s=>`<button data-action="mfilter" data-f="${s}" class="${ui.mState===s?"on":""}">${s}</button>`).join("")}<button data-action="mfilter" data-f="Awaiting" data-testid="filter-awaiting" class="await-f ${ui.mState==="Awaiting"?"on":""}">Awaiting <b>${awSet.size}</b></button></div>

<input type="search" placeholder="Search criteria…" value="${esc(ui.mSearch)}" data-search="matrix" data-testid="matrix-search"></div>
${ui.selectMode?`<p class="small muted">Signed is never preselected and asks first.</p>`:""}
${cards||`<div class="card">No criteria match this filter.</div>`}<section class="card" data-testid="criteria-preview-card"><div class="btn-row"><button class="btn primary block" data-action="criteria-preview" data-testid="criteria-preview">Preview criteria paperwork</button></div><p class="tiny muted">Shows your filled competence forms (Type of Evidence codes from your selections) and the Assessor sign-off sheet.</p></section>`,"matrix");}
function viewEvidence(){const p=active();if(!p){location.hash="#/";return"";}
const unmapped=p.evidence.filter(e=>!e.criteria.length), q=ui.evSearch.toLowerCase();
const match=e=>!q||(e.title+" "+e.fileName+" "+(e.tags||[]).join(" ")).toLowerCase().includes(q);
const list=(ui.evSeg==="inbox"?unmapped:p.evidence).filter(match);
return shell("Evidence",`<div class="page-head"><div><div class="crumb">Evidence inbox</div><h1>Evidence</h1></div><div class="actions"><button class="btn primary" data-action="quick-capture" data-testid="ev-capture">＋ Add evidence</button></div></div>
<div class="filters"><div class="seg" role="group" aria-label="Evidence view"><button data-action="ev-seg" data-seg="inbox" class="${ui.evSeg==="inbox"?"on":""}">Inbox (${unmapped.length} unmapped)</button><button data-action="ev-seg" data-seg="all" class="${ui.evSeg==="all"?"on":""}">All files (${p.evidence.length})</button></div><input type="search" placeholder="Search evidence…" value="${esc(ui.evSearch)}" data-search="evidence"></div>
<section class="card"><ul class="list">${list.map(e=>evRow(p,e)).join("")||`<li class="muted">${ui.evSeg==="inbox"?"Inbox zero — everything is linked.":"No evidence yet. Use + Add evidence."}</li>`}</ul></section>`,"evidence");}
function viewForms(){const p=active();const dlPacks=knownDownloadPacks(p)||["g2-surveyor","g2-core"];const dlStats=dlPacks.map(k=>({k,st:packStatus(k)}));const s=dlStats[0]&&dlStats[0].st,c=dlStats[1]&&dlStats[1].st;
const act=p?actOf(p,ui.formsAct||workActId(p)):null; if(p&&act)ui.formsAct=act.id;
const inPlayComps=act?COMPS.filter(comp=>comp.criteria.some(k=>cov(p,k.id,act.id).status!=="Gap")):[];
const findStored=(rx)=>S.templates.filter(x=>rx.test(x.fileName));
const shortlist=[];
if(act){dlPacks.forEach(k=>{const tpl=S.templates.find(x=>x.packKey===k&&/AssessmentPlan/i.test(x.fileName))||findStored(/AssessmentPlan/i).find(x=>x.packKey===k);shortlist.push(["Assessment plan",tpl,k]);});
inPlayComps.forEach(comp=>{const tpl=comp.fileName?S.templates.find(x=>x.fileName===comp.fileName):null;shortlist.push([compLabel(comp)+" \u00b7 "+comp.title,tpl,comp.unitId]);});
dlPacks.forEach(k=>{const tpl=S.templates.find(x=>x.packKey===k&&/FeedbackForm/i.test(x.fileName));shortlist.push(["Feedback form",tpl,k]);});shortlist.push(["Assessor sign-off",findStored(/Assessor_SignOff/i)[0],null]);shortlist.push(["Record of witness",findStored(/Record_of_Witness/i)[0],null]);}
const fq=ui.formsSearch.toLowerCase();
const storedList=S.templates.filter(x=>!fq||x.fileName.toLowerCase().includes(fq)).map(x=>`<li><span class="ev-ico">📄</span><div class="grow"><b class="small">${esc(x.fileName)}</b><div class="fname">${esc(x.packKey)} · ${(x.size/1024).toFixed(0)} KB · SHA-256 ${esc(x.sha256.slice(0,12))}…</div><div style="margin-top:4px">${storedBadge()}</div></div><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn sm" data-action="open-template" data-id="${x.id}">Open blank</button><button class="btn sm primary" data-action="fill-template" data-id="${x.id}">Fill copy</button></div></li>`).join("");
const tplList=Object.entries(MP).filter(([k,v])=>v.zip&&(!fq||(v.title||k).toLowerCase().includes(fq))).map(([k,v])=>{const st=packStatus(k);return `<li><span class="ev-ico">📄</span><div class="grow"><b class="small">${esc(v.title||k)}</b><div class="fname">Official pack zip from MTCS Online</div><div style="margin-top:4px">${st?storedBadge():notStoredBadge()}</div></div><a class="btn sm" href="${esc(v.zip)}" target="_blank" rel="noopener">Download from MTCS ↗</a></li>`;}).join("");
return shell("Forms",`<div class="page-head"><div><div class="crumb">Forms &amp; templates</div><h1>Forms</h1></div></div>
<section class="card pack-card"><div class="card-head"><h2>MTCS forms packs</h2><span class="right pill ${dlStats.every(x=>x.st)?"signed":"warn"}">${dlStats.every(x=>x.st)?"Imported":"Not fully imported"}</span></div>
<p class="small">${dlStats.map(x=>`${esc(PACK_LABEL(x.k))}: <b>${x.st?("✓ "+x.st.fileCount+" files · "+fmtDate(x.st.importedAt)):"not imported"}</b>`).join(" · ")}</p>
<p class="small muted">Blank originals are never edited; Fill copy fills a copy.</p>
${p&&!hasPack(p)&&S.templates.some(x=>/Competence\d+\.pdf$/i.test(x.fileName))?`<div class="warn-box"><b>Forms stored — criteria not built yet</b><p class="small">Read the competence sheets you imported and build the criteria list for this portfolio.</p><button class="btn primary" data-action="build-pack-stored" data-testid="build-pack-stored">Build criteria from stored forms</button></div>`:""}<div class="btn-row"><button class="btn primary" data-action="pack-download" data-testid="pack-download">Download</button><label class="btn">Upload<input type="file" accept=".zip" multiple hidden data-upload="pack" data-testid="pack-upload"></label><label class="btn" style="display:none">Import pack(s) (.zip)<input type="file" accept=".zip" multiple hidden data-upload="pack" data-testid="import-packs"></label></div></section>
${p&&act?`<section class="card"><div class="card-head"><h2>For Activity ${act.n}</h2><span class="right"><select data-forms-act aria-label="Activity">${p.activities.map(a=>`<option value="${a.id}" ${a.id===act.id?"selected":""}>Activity ${a.n}</option>`).join("")}</select></span></div>
<ul class="list">${shortlist.map(([label,tpl])=>`<li><span class="ev-ico">📄</span><div class="grow"><b class="small">${esc(label)}</b><div class="fname">${tpl?esc(tpl.fileName):"Not in your imported pack yet"}</div><div style="margin-top:4px">${tpl?storedBadge():notStoredBadge()}</div></div>${tpl?`<button class="btn sm" data-action="open-template" data-id="${tpl.id}">Open blank</button><button class="btn sm primary" data-action="fill-template" data-id="${tpl.id}">Fill copy</button>`:""}</li>`).join("")}</ul></section>`:`<section class="card">Open a portfolio to see the “For Activity” shortlist.</section>`}
<details class="card"><summary><h2 style="display:inline">All forms (${S.templates.length} stored)</h2></summary>
<input type="search" placeholder="Search all forms…" value="${esc(ui.formsSearch)}" data-search="forms" style="width:100%;margin:10px 0">
<h3>Stored blank templates</h3><ul class="list">${storedList||`<li class="muted small">None stored yet. Import a pack above.</li>`}</ul>
<h3>Individual forms (from MTCS)</h3><p class="tiny muted">One-off downloads. Official forms are (c) MTCS Ltd.</p><ul class="list">${tplList}</ul></details>`,"forms");}
function viewBackup(){const lb=S.settings.lastBackupAt;return shell("Backup",`<div class="page-head"><div><div class="crumb">Backup &amp; restore</div><h1>Backup &amp; restore</h1><p class="muted">Your data only lives in this browser. Export a backup zip regularly.</p></div></div>
<section class="card status-card ${lb?"":"stale"}"><div class="st-row"><span class="st-dot ${lb?"ok":"bad"}"></span><div class="grow"><b>${lb?"Last backup "+fmtDate(lb):"No backup yet"}</b><div class="small muted">${S.portfolios.length} portfolio(s), ${S.portfolios.reduce((n,p)=>n+p.evidence.length,0)} evidence files, ${S.templates.length} templates</div></div><button class="btn primary" data-action="export-backup" data-testid="export-backup">Back up now (.zip)</button></div></section>
<section class="card"><h2>Restore</h2><p class="small muted">Importing a full backup replaces what's currently in this browser. You see a summary before anything changes.</p><label class="btn">Import backup (.zip)<input type="file" accept=".zip" hidden data-upload="backup"></label></section>
`,"backup");}
function viewSettings(){const p=active();return shell("Settings",`<div class="page-head"><div><h1>Settings</h1></div></div>
${p?`<section class="card"><h2>Portfolio</h2><p class="small"><b>${esc(p.name)}</b> · ${esc(p.routeLabel)}</p><p class="small muted">Profile & Assessed by: More → Profile</p></section>`:`<section class="card">No portfolio open. <a href="#/">Choose or create one</a>.</section>`}
<section class="card" data-testid="settings-forms"><h2>Forms management</h2>
<p class="small">${[...new Set(S.templates.map(x=>x.packKey))].map(k=>{const st=packStatus(k);return `${esc(PACK_LABEL(k))}: <b>${st?("✓ "+st.fileCount+" files · "+fmtDate(st.importedAt)):"not imported"}</b>`;}).join(" · ")||"No forms stored yet."}</p>
<div class="btn-row"><a class="btn primary" href="#/forms">Download / Upload in Forms</a></div>
<p class="tiny muted">Deleting a stored blank form does not delete filled copies you have downloaded, and never touches your evidence.</p>
${S.templates.length?`<details><summary class="small">Stored forms (${S.templates.length})</summary><ul class="list">${S.templates.map(x=>`<li><span class="ev-ico">📄</span><div class="grow"><b class="small">${esc(x.fileName)}</b><div class="fname">${esc(x.packKey)} · ${(x.size/1024).toFixed(0)} KB</div><div style="margin-top:4px">${storedBadge()}</div></div><button class="btn sm ghost" data-action="delete-template" data-id="${x.id}" data-testid="delete-template">Delete</button></li>`).join("")}</ul></details>
<div class="btn-row">${[...new Set(S.templates.map(x=>x.packKey))].map(k=>`<button class="btn" data-action="delete-pack" data-pack="${esc(k)}" data-testid="delete-pack-${esc(k)}">Delete ${esc(PACK_LABEL(k))}</button>`).join("")}<button class="btn ghost" data-action="delete-all-templates" data-testid="delete-all-templates">Delete all forms</button></div>`:`<p class="small muted">No forms stored yet.</p>`}</section>
<section class="card"><h2>App</h2><p class="small muted">MTCS Tracker Beta v${APP_VERSION} · local-first, no accounts. Not a full release — promotion to v1.0 only when layout and functions are settled.</p>${p?`<div class="btn-row"><button class="btn" data-action="delete-portfolio" data-id="${p.id}">Delete this portfolio</button></div>`:""}</section>`,"settings");}
function viewMore(){const p=active();return shell("More",`<section class="card more-list">${[["#/profile","👤","Profile","Name and signature"],["#/forms","📄","Forms & packs","MTCS blank templates"],["#/export","⤓","Export / submission","Checklist and backup"],["#/backup","☁️","Backup & restore","Export or import a full backup"],["#/settings","⚙️","Settings","Forms management and app"]].map(x=>`<a class="more-row" href="${x[0]}" ${x[0]==="#/profile"?'data-testid="profile-banner"':""}><span class="role-ico sm">${x[1]}</span><span class="grow"><b>${x[2]}</b><span class="small muted">${x[3]}</span></span><span class="chev">›</span></a>`).join("")}</section>`,"more");}
function viewProfile(){const p=active();return shell("Profile",`<div class="btn-row"><a class="btn sm" href="#/more">‹ More</a></div>`+profileCardHTML()+(p?`<section class="card"><div class="card-head"><h2>Portfolio assessor</h2>${savedInd()}</div><div class="field"><label>Assessed by (this portfolio)</label><input value="${esc(p.assessedBy||"")}" data-pbind="assessedBy" placeholder="Leave blank until your assessor is confirmed" data-testid="profile-assessedby"></div><p class="tiny muted">This is the portfolio-level assessor name. An assessor for a single activity is set on that activity instead.</p></section>`:`<section class="card"><p class="small muted">Open a portfolio to set its assessor name.</p></section>`),"more");}
function viewExport(){const p=active();if(!p){location.hash="#/";return"";}const t=totals(p);return shell("Export",`<div class="page-head"><div><h1>Export / submission</h1><p class="muted">Checklist only \u2014 this app never submits to MTCS for you, and never emails anyone.</p></div><div class="actions"><button class="btn" data-action="export-backup">Download full portfolio backup (.zip)</button></div></div>
<section class="card" data-testid="submission-card"><div class="card-head"><h2>MTCS submission pack</h2><span class="right pill planned">Download only</span></div><p class="small">Builds a zip you can send to MTCS yourself: filled copies of your stored official forms (blanks never changed), all evidence in labelled Activity folders (named by activity and criteria). Preview first to check names, dates, criteria and signatures.</p><div class="btn-row"><button class="btn primary lg" data-action="submission-preview-open" data-testid="submission-preview-open">Preview submission pack</button><button class="btn" data-action="submission-export" data-testid="submission-export">Download submission pack (.zip)</button></div><p class="tiny muted">${SIG_NOTE}</p></section><section class="card"><ul class="list"><li><span class="dot" style="background:var(--planned-dot)"></span><div class="grow"><b>Criteria: ${t.Signed} signed, ${t.Evidenced} evidenced, ${t.Gap} gaps</b><div class="small muted">All criteria in your generated pack should be covered across at least three activities.</div></div></li><li><span class="dot" style="background:${(S.packImports&&S.packImports.length)?"var(--signed)":"var(--gap)"}"></span><div class="grow"><b>Forms pack</b><div class="small muted">${S.packImports&&S.packImports.length?"Imported "+fmtDate(S.packImports[0].importedAt):"Not imported yet"}</div></div></li><li><span class="dot" style="background:var(--planned-dot)"></span><div class="grow"><b>Evidence files: ${p.evidence.length}</b><div class="small muted">${p.evidence.filter(e=>e.redact).length} flagged for client-data check.</div></div></li></ul></section>`,"export");}
function sharedCritOf(x,cid){if(!x.genPack)return null;let found=null;(x.genPack.units||[]).forEach(u=>(u.competences||[]).forEach(c=>(c.criteria||[]).forEach(k=>{if(k.id===cid)found=k;})));return found;}
function viewShared(id){const x=S.shared.find(s=>s.id===id);if(!x)return shell("Shared",`<div class="card">That shared activity isn't in this browser. <a href="#/">Import it from the opening screen</a>.</div>`,"more");const a=x.activity;
return shell("Shared activity",`<div class="link-shell" style="padding:0"><div class="imported-banner"><b>Imported copy — not your portfolio</b><span>From ${esc(x.candidateName)} · exported ${fmtDate(x.manifest.exportedAt)} · package v${esc(x.manifest.exportSeq)} · based on v${esc(x.manifest.baseVersion)}</span></div>
<section class="card"><h1 style="font-size:1.25rem">Activity ${a.n} · ${esc(a.title)}</h1><p class="small muted">${esc(a.dates||"")} · ${esc(a.summary||"")}</p><form data-form="shared-edit" data-id="${x.id}">
<div class="field"><label>Assessor feedback</label><textarea name="feedbackText">${esc(a.feedbackText||"")}</textarea></div><div class="field"><label>Assessor name</label><input name="assessorName" value="${esc(a.assessorName||"")}"></div><h3>Criteria (${Object.keys(x.criteria||{}).length} in package)</h3>
${Object.entries(x.criteria||{}).map(([cid,cv])=>{const k=critById(cid)||sharedCritOf(x,cid);return `<div class="crit-line"><span class="crit-id">${cid}</span><span class="cl-text">${esc(k?k.text:"")}</span><select data-shared-crit="${cid}" data-shared-id="${x.id}">${STATUSES.map(s=>`<option ${cv.status===s?"selected":""}>${s}</option>`).join("")}</select><select data-shared-code="${cid}" data-shared-id="${x.id}">${["",...CODES].map(s=>`<option value="${s}" ${cv.code===s?"selected":""}>${s||"—"}</option>`).join("")}</select></div>`;}).join("")||`<p class="small muted">No criteria states in this package.</p>`}
<h3>Evidence in package (${(x.evidence||[]).length})</h3><ul class="list">${(x.evidence||[]).map(e=>`<li><span class="ev-ico">📄</span><div class="grow"><b class="small">${esc(e.title)}</b><div class="fname">${esc(e.fileName)}</div></div><button class="btn sm" type="button" data-action="download-shared-ev" data-shared="${x.id}" data-id="${e.id}">Download</button></li>`).join("")}</ul>
<div class="field"><label>Signed on (YYYY-MM-DD)</label><input name="signedOn" value="${esc(a.signedOn||"")}"></div><div class="btn-row"><button class="btn" type="submit">Save changes</button><button class="btn primary" type="button" data-action="export-return" data-id="${x.id}" data-testid="export-return">⤓ Export reviewed activity zip (.zip)</button><button class="btn ghost" type="button" data-action="delete-shared" data-id="${x.id}">Delete imported copy</button></div></form></section></div>`,"more");}
function viewAssessor(actId){const p=active();if(!p){location.hash="#/";return"";}const a=actOf(p,actId)||p.activities[0];const inAct=CRITS.filter(k=>cov(p,k.id,a.id).status!=="Gap");const signed=inAct.filter(k=>cov(p,k.id,a.id).status==="Signed").length;
return shell("Assessor preview",`<div class="link-shell" style="padding:0"><section class="card"><span class="pill warn">Preview — your assessor sees this; buttons disabled</span><h1 style="font-size:1.3rem;margin-top:8px">Activity ${a.n} · ${esc(a.title)}</h1><p class="small muted">Candidate ${esc(p.name)} · ${esc(a.dates||"")} · ${esc(a.summary||"")}</p><h3>Criteria</h3>
${inAct.map(k=>{const cv=cov(p,k.id,a.id);return `<div class="crit-line"><span class="crit-id">${k.id}</span><span class="cl-text">${esc(k.text)}</span>${pill(cv.status)} <span class="code" style="background:#eef1f5">${esc(cv.code||"—")}</span></div>`;}).join("")||`<p class="small muted">No criteria planned in this activity yet.</p>`}
<h3>Knowledge questions</h3>${a.ukq.map(u=>`<p class="small"><b>${esc(u.q||"—")}</b><br>${esc(u.a||"")} ${u.ok?`<span class="pill signed">Satisfactory: ${esc(u.ok)}</span>`:""}</p>`).join("")}
<h3>Assessor feedback</h3><p class="small">${esc(a.feedbackText||"—")}</p>
<div class="sum-box"><div class="sum-line ${signed===inAct.length&&inAct.length?"ok":"warn"}"><div class="grow"><b>Summary: ${inAct.length} criteria: ${signed} signed, ${inAct.length-signed} not signed</b><div class="small muted">In the assessor's own copy, Sign and lock only appears after this summary.</div></div></div></div>
<div class="btn-row"><button class="btn success" disabled>Sign and lock (disabled in preview)</button><a class="btn" href="#/activity/${a.id}">Back to Work</a></div></section></div>`,"activities");}
function pickerHTML(ownerId,selected,attr){const sel=new Set(selected||[]);return `<div class="picker"><input type="search" placeholder="Search criteria (e.g. S07c, calibration)…" data-picker-search data-owner="${ownerId}" style="width:100%;margin-bottom:8px"><div class="picker-list">${COMPS.map(c=>`<div class="picker-group"><div class="tiny muted" style="margin:8px 0 4px"><b>${compLabel(c)}</b> · ${esc(c.title)}</div>${c.criteria.map(k=>`<label class="checkline" data-picker-row="${ownerId}" data-text="${esc((k.id+" "+k.text+" "+c.title).toLowerCase())}"><input type="checkbox" ${attr}="${ownerId}" data-ev="${ownerId}" value="${k.id}" ${sel.has(k.id)?"checked":""}> <b>${k.id}</b> <span class="small">${esc(k.text)}</span></label>`).join("")}</div>`).join("")}</div><p class="small" style="margin-top:8px">Final links: <b id="final-${ownerId}">${sel.size?[...sel].join(", "):"none yet"}</b></p></div>`;}
function modalHTML(){
if(ui.packProgress){const pr=ui.packProgress;return `<div class="scrim"></div><div class="modal" role="dialog" aria-modal="true" aria-live="polite" data-testid="pack-progress"><header><h2>${pr.error?"Couldn't get the forms":"Getting your MTCS forms"}</h2></header><div class="body"><p class="small"><b>${esc(pr.stage)}</b></p>${pr.detail?`<p class="small muted">${esc(pr.detail)}</p>`:""}${pr.error?`<div class="warn-box"><b>${esc(pr.error)}</b><p class="small">Fallback: download the pack from MTCS, then use Import pack (.zip) here or in Forms. Stored forms you already have are unchanged.</p></div>`:`<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.pct==null?0:pr.pct}"><div class="progress-fill ${pr.pct==null?"indeterminate":""}" style="width:${pr.pct==null?35:pr.pct}%"></div></div><p class="small muted">${pr.total?("Stored "+pr.done+" of "+pr.total+" file(s) · "+(pr.pct||0)+"%"):("Working… "+(pr.pct!=null?pr.pct+"%":""))}</p>`}</div>${pr.error?`<footer><button class="btn primary" data-action="pack-progress-close" data-testid="pack-progress-close">Close</button></footer>`:""}</div>`;}
if(ui.modal==="plan-builder"&&ui.planBuilder){const p=active();const pb=ui.planBuilder;const act=actOf(p,pb.actId);
const compSel=c=>c.criteria.filter(k=>pb.draft.has(k.id)).length;
if(!ui.planExpanded)ui.planExpanded=new Set();
return `<div class="scrim" data-action="plan-builder-cancel"></div><div class="modal merge" role="dialog" aria-modal="true" data-testid="plan-builder"><header><h2>Add competencies — Activity ${act?act.n:""}</h2><button class="close" data-action="plan-builder-cancel">✕</button></header><div class="body">
<input type="search" placeholder="Search competences or criteria…" data-plan-search value="${esc(ui.planSearch||"")}" style="width:100%;margin-bottom:8px">
<div class="plan-list" data-testid="plan-list">${COMPS.map(c=>{const expanded=ui.planExpanded.has(c.id);const nSel=compSel(c);return `<div class="plan-comp-row plan-list-row" data-testid="plan-row" data-comp-id="${c.id}" data-plan-rowtext="${esc((compLabel(c)+" "+c.title+" "+c.criteria.map(k=>k.id+" "+k.text).join(" ")).toLowerCase())}"><input type="checkbox" data-plan-comp="${c.id}" ${nSel===c.criteria.length&&c.criteria.length?"checked":""} aria-label="Add whole ${c.id}"><div class="grow"><b>${esc(c.id)} · ${esc(c.title)}</b><div class="small muted">${esc(compLabel(c))} · ${c.criteria.length} criteria · <span data-plan-compcount="${c.id}">${nSel}</span> in plan</div>${expanded?`<div class="plan-crit-list">${c.criteria.map(k=>`<label class="plan-crit-row ${pb.draft.has(k.id)?"on":""}" data-plan-critrow="${k.id}"><input type="checkbox" data-plan-crit="${k.id}" data-comp="${c.id}" ${pb.draft.has(k.id)?"checked":""}><span class="pc-text"><b>${esc(k.id)}</b> ${esc(k.text)}</span></label>`).join("")}</div>`:""}</div><button class="btn sm ghost" type="button" data-action="plan-row-toggle" data-comp="${c.id}" aria-expanded="${expanded}">${expanded?"▾":"›"}</button></div>`;}).join("")}</div>
</div><footer class="merge-foot plan-sticky" style="position:sticky;bottom:0"><span class="small" id="plan-count" data-testid="plan-count">${new Set(COMPS.filter(c=>c.criteria.some(k=>pb.draft.has(k.id))).map(c=>c.id)).size} competences · ${pb.draft.size} criteria selected</span><button class="btn" data-action="plan-builder-clear">Clear</button><button class="btn primary" data-action="plan-builder-apply" data-testid="plan-builder-apply">Add to plan</button></footer></div>`;}
if(ui.genReview){const gr=ui.genReview;let ci=0;const compCount=gr.units.reduce((n,u)=>n+u.competences.length,0),critCount=gr.units.reduce((n,u)=>n+u.competences.reduce((m,c)=>m+c.criteria.length,0),0);
return `<div class="scrim"></div><div class="modal merge" role="dialog" aria-modal="true" data-testid="gen-review"><header><h2>Check your imported criteria</h2></header><div class="body"><p class="small">Read from your own MTCS files just now — nothing was bundled with the app. Check the codes and wording, edit anything the reader got wrong, then confirm to build this portfolio's criteria list.</p>
<p><b>${esc(gr.label)}</b> · ${compCount} competences · ${critCount} criteria</p><p class="small" data-testid="gen-route-line">Portfolio: <b>${esc(gr.selectedLabel||"—")}</b> · Files detected: <b>${esc(gr.detectedLabel||gr.label)}</b></p>${gr.mismatch?`<div class="warn-box" data-testid="pack-mismatch"><b>Wrong pack?</b><p class="small">These files look like ${esc(gr.mismatch.detected)}, not ${esc(gr.mismatch.selected)}. Building will use the files as read.</p><label class="checkline"><input type="checkbox" id="gen-mismatch-ack" data-testid="gen-mismatch-ack"> Build anyway with these files</label></div>`:""}
${gr.warnings.length?`<div class="warn-box"><b>Please check (${gr.warnings.length})</b><ul>${gr.warnings.map(w=>`<li class="small">${esc(w)}</li>`).join("")}</ul></div>`:`<div class="pack-status" style="background:#f5fbf7;border:1px solid #cfe9d8"><b>✓ Clean read</b><span class="small">Competence sheets read without warnings.</span></div>`}
${gr.units.map(u=>`<h3>${esc(u.name)} (${u.competences.reduce((n,c)=>n+c.criteria.length,0)} criteria)</h3>${u.competences.map(c=>{const my=ci++;return `<details class="gen-comp" ${c.criteria.some(k=>!k.text)?"open":""}><summary><b data-gen-summary="${my}">${esc(c.id)} · ${esc(c.title)}</b> <span class="small muted">${c.criteria.length} criteria · ${esc(c.fileName)}</span></summary>
<div class="field"><label>Competence code</label><input value="${esc(c.id)}" data-gen-code="${my}"></div>
<div class="field"><label>Competence title</label><input value="${esc(c.title)}" data-gen-title="${my}"></div>
${c.criteria.map((k,ki)=>`<div class="field"><label>${esc(k.id)}</label><div style="display:flex;gap:6px"><input value="${esc(k.id)}" data-gen-crit-id="${my}:${ki}" style="max-width:90px"><input value="${esc(k.text)}" data-gen-crit-text="${my}:${ki}"></div></div>`).join("")}
<button class="btn sm" type="button" data-action="gen-add-crit" data-comp="${my}">+ Add criterion</button></details>`;}).join("")}`).join("")}
</div><footer class="merge-foot"><button class="btn" data-action="gen-review-cancel" data-testid="gen-review-cancel">Cancel</button><button class="btn primary" data-action="gen-review-confirm" data-testid="gen-review-confirm">${gr.mismatch?"Build anyway":"Confirm — build my criteria"} (${critCount})</button></footer></div>`;}
if(ui.formsSetupFor){const fp=S.portfolios.find(x=>x.id===ui.formsSetupFor);if(fp&&!fp.formsPromptSeen)return `<div class="scrim"></div><div class="modal" role="dialog" aria-modal="true" data-testid="forms-setup"><header><h2>Forms pack</h2><button class="close" data-action="forms-setup-skip" data-testid="forms-setup-skip" aria-label="Close">✕</button></header><div class="body"><div class="stack"><button class="btn primary lg block" data-action="pack-download" data-testid="pack-download">Download</button><label class="btn lg block" style="text-align:center">Upload<input type="file" accept=".zip" multiple hidden data-upload="pack" data-testid="pack-upload"></label></div></div></div>`;}
if(ui.modal==="pack-unavailable"){const fp=active();return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog" aria-modal="true" data-testid="pack-unavailable"><header><h2>Download unavailable</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><p class="small">No matching download for ${fp?esc(fp.routeLabel):"this route"} yet. Use Upload with the pack from MTCS Online.</p></div></div>`;}
if(ui.preview){const e=ui.preview;const inner=e.mime&&e.mime.startsWith("image/")?`<img src="${e.url}" style="max-width:100%;border-radius:8px" alt="">`:e.mime==="application/pdf"?`<iframe src="${e.url}" style="width:100%;height:60vh;border:1px solid var(--line);border-radius:8px" title="PDF preview"></iframe>`:e.text!=null?`<pre style="white-space:pre-wrap;max-height:60vh;overflow:auto">${esc(e.text)}</pre>`:`<p class="small muted">No in-app preview for this file type (${esc(e.mime||"unknown")}). Download the original instead.</p>`;
return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog"><header><h2>${esc(e.title)}</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><div class="fname">${esc(e.fileName)}</div>${inner}</div></div>`;}
if(ui.modal==="install")return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog"><header><h2>Install MTCS Tracker</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><p><b>Android / Chrome:</b> tap Install below if offered, or browser menu ⋮ → <i>Add to Home screen / Install app</i>.</p><p><b>iPhone / iPad (Safari):</b> Share button → <i>Add to Home Screen</i> → <i>Add</i>.</p><p class="small muted">Installed, it opens standalone and works offline. Data stays in this browser — keep exporting backups.</p></div>${deferredInstall?`<footer><button class="btn primary" data-action="install-prompt">Install app</button></footer>`:""}</div>`;
if(ui.pendingBackup){const m=ui.pendingBackup.manifest,d=ui.pendingBackup.data;return `<div class="scrim"></div><div class="modal merge" role="dialog"><header><h2>Import this backup?</h2></header><div class="body"><p class="small">Exported ${fmtDate(m.exportedAt)} · app v${esc(m.appVersion)} · schema ${esc(m.schema)}</p><ul class="list small"><li><div class="grow"><b>${d.portfolios.length} portfolio(s)</b></div></li><li><div class="grow">${d.portfolios.reduce((n,p)=>n+(p.evidence||[]).length,0)} evidence files · ${(d.templates||[]).length} templates · ${(d.shared||[]).length} shared activities</div></li></ul><div class="warn-box"><b>This replaces</b> the portfolios, evidence and templates currently in this browser.</div></div><footer class="merge-foot"><button class="btn" data-action="cancel-backup-import">Cancel</button><button class="btn primary" data-action="confirm-backup-import" data-testid="confirm-backup">Import and replace</button></footer></div>`;}
if(ui.pendingReturn){const r=ui.pendingReturn;return `<div class="scrim"></div><div class="modal merge" role="dialog"><header><h2>Review assessor return</h2></header><div class="body"><div class="cmp-row cmp-head"><span>Item</span><span>Expected (yours)</span><span>Received</span></div><div class="cmp-row"><span class="cmp-l">Based on version</span><span class="cmp-e">v${r.activity.version}</span><span class="cmp-r">v${esc(r.manifest.baseVersion)}</span></div><div class="cmp-row"><span class="cmp-l">Criteria signed / evidenced</span><span class="cmp-e">${r.expectedCount}</span><span class="cmp-r">${r.receivedCount}</span></div><div class="cmp-row"><span class="cmp-l">Evidence files</span><span class="cmp-e">${r.activityEvidence}</span><span class="cmp-r">${r.pkgEvidence}</span></div>${r.warnings.length?`<div class="warn-box"><b>Check before applying</b><ul>${r.warnings.map(w=>`<li>${esc(w)}</li>`).join("")}</ul></div>`:`<div class="pack-status" style="background:#f5fbf7;border:1px solid #cfe9d8"><b>✓ No warnings</b><span class="small">Hashes match; return is based on your current version.</span></div>`}<p class="small muted">Applying first saves a snapshot of your current activity for rollback.</p></div><footer class="merge-foot"><button class="btn" data-action="cancel-return">Cancel</button><button class="btn" data-action="return-as-copy">Save as separate copy</button><button class="btn primary" data-action="apply-return" data-testid="apply-return">Import and apply</button></footer></div>`;}

if(ui.modal==="capture"){const p=active();return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog" data-testid="capture-sheet"><header><h2>Add evidence</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><div class="stack">
<label class="btn primary block">📷 Take photo<input type="file" accept="image/*" capture="environment" hidden data-upload="capture-photo" data-testid="capture-photo"></label>
<label class="btn block">📄 Add files<input type="file" multiple hidden data-upload="capture-file" data-testid="capture-file"></label>
<button class="btn block" data-action="capture-note" data-testid="capture-note">✍️ Quick note</button></div></div></div>`;}
if(ui.modal==="link-sheet"){const p=active();const batch=(ui.captureBatch||[]).map(id=>p.evidence.find(x=>x.id===id)).filter(Boolean);const total=batch.reduce((n,e)=>n+e.size,0);
return `<div class="scrim"></div><div class="modal merge" role="dialog" data-testid="link-sheet"><header><h2>Link this batch</h2></header><div class="body"><p class="small">Saved on this device ✓ · ${batch.length} file(s) · ${(total/1024).toFixed(0)} KB total. The Final links line is what will be saved.</p>
<div class="field"><label>Activity for this batch</label><select id="batch-act">${p.activities.map(a=>`<option value="${a.id}" ${String(ui.captureAct||workActId(p))===String(a.id)?"selected":""}>Activity ${a.n} — ${esc(a.title)}</option>`).join("")}</select></div>
<div class="field"><label>Tags for this batch (comma separated, optional)</label><input id="batch-tags" placeholder="e.g. SVP, calibration"></div>
<div class="field"><label>Mark linked criteria as</label><div class="chiprow">${["Planned","Evidenced"].map(s=>`<button class="segchip ${ui.batchStatus===s?"on":""}" data-batch-status="${s}">${s}</button>`).join("")}</div><div class="chiprow" style="margin-top:6px">${CODES.map(c=>`<button class="segchip ${ui.batchCode===c?"on":""}" data-batch-code="${c}">${c}</button>`).join("")}</div><p class="tiny muted">Signed is never suggested or set here.</p></div>
${batch.map(e=>`<div class="batch-file"><b>${esc(e.title)}</b><div class="fname">${esc(e.fileName)} · ${esc(e.date)} · ${(e.size/1024).toFixed(0)} KB</div>${suggestCriteria(e.fileName).length?`<div class="small muted">Filename suggests (guess): ${suggestCriteria(e.fileName).join(", ")}</div>`:""}<details><summary class="small">Choose criteria (${(ui.captureLinks[e.id]||[]).length} selected)</summary>${pickerHTML(e.id,ui.captureLinks[e.id]||[],"data-batch-crit")}</details></div>`).join("")}
</div><footer class="merge-foot"><button class="btn" data-action="batch-skip">Save files, link later</button><button class="btn primary" data-action="batch-confirm" data-testid="batch-confirm">Link &amp; done</button></footer></div>`;}
if(ui.modal==="ev-edit"){const p=active();const e=p.evidence.find(x=>x.id===ui.evEditId);if(e)return `<div class="scrim" data-action="close-modal"></div><div class="modal merge" role="dialog" data-testid="ev-editor"><header><h2>Edit evidence</h2><button class="close" data-action="close-modal">✕</button></header><div class="body">
<div class="field"><label>Title</label><input id="ev-title" value="${esc(e.title)}"></div><div class="field"><label>Date</label><input id="ev-date" value="${esc(e.date)}"></div>
<div class="field"><label>Activity</label><select id="ev-activity">${p.activities.map(a=>`<option value="${a.id}" ${String(e.activityId)===String(a.id)?"selected":""}>Activity ${a.n}</option>`).join("")}<option value="">None</option></select></div>
<div class="field"><label>Tags (comma separated)</label><input id="ev-tags" value="${esc((e.tags||[]).join(", "))}"></div>
<label class="checkline"><input type="checkbox" id="ev-redact" ${e.redact?"checked":""}> Flag: may contain client / sensitive data</label>
<h3>Criteria</h3><p class="tiny muted">The Final links line is exactly what will be saved.</p>${pickerHTML(e.id,e.criteria,"data-picker-crit")}
</div><footer><button class="btn" data-action="ev-edit-close">Cancel</button><button class="btn primary" data-action="ev-save" data-id="${e.id}" data-testid="ev-save">Save</button></footer></div>`;}
if(ui.modal==="preflight"){const p=active();const a=actOf(p,ui.preflightAct);if(a){const inAct=CRITS.filter(k=>cov(p,k.id,a.id).status!=="Gap");const gaps=CRITS.length-inAct.length;const evA=p.evidence.filter(e=>String(e.activityId)===String(a.id));const unlinked=evA.filter(e=>!e.criteria.length).length;const flagged=p.evidence.filter(e=>e.redact).length;const lb=S.settings.lastBackupAt;const age=lb?Math.floor((Date.now()-new Date(lb).getTime())/864e5):null;const packs=packStatus("g2-surveyor")&&packStatus("g2-core");
return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog" data-testid="preflight"><header><h2>Send Activity ${a.n}?</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><ul class="list small">
<li><span class="dot" style="background:${gaps||unlinked||flagged?"var(--mapped-dot)":"var(--signed)"}"></span><div class="grow"><b>${gaps} criteria not in this activity, ${unlinked} unlinked file(s) here, ${flagged} client-data flag(s) overall</b><div class="muted">Check flags before sharing outside your company.</div></div></li>
<li><span class="dot" style="background:${age===null||age>7?"var(--gap)":"var(--signed)"}"></span><div class="grow"><b>${age===null?"No backup yet":age>7?("Last backup "+age+" days ago — a fresh backup runs first as part of Send"):("Backed up "+age+" day(s) ago")}</b></div></li>
<li><span class="dot" style="background:${packs?"var(--signed)":"var(--mapped-dot)"}"></span><div class="grow"><b>${packs?"Forms packs imported":"Forms packs not fully imported"}</b><div class="muted">Only matters for filling official forms, not for this zip.</div></div></li></ul></div><footer><button class="btn primary" data-action="preflight-continue" data-testid="preflight-continue">Continue &amp; download</button></footer></div>`;}}
if(ui.modal==="bulk-signed"){return `<div class="scrim"></div><div class="modal" role="dialog" data-testid="bulk-signed"><header><h2>Mark ${ui.selCrit.size} as Signed?</h2></header><div class="body"><p>Signed is normally your assessor's act. This will mark <b>${ui.selCrit.size} criteria</b> as Signed in the chosen activity. You can Undo afterwards.</p></div><footer><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="bulk-signed-confirm" data-testid="bulk-signed-confirm">Mark ${ui.selCrit.size} as Signed</button></footer></div>`;}
if(ui.modal==="assessor-sign"){const p=active();if(p){
if(!ui.assessorFlow)ui.assessorFlow={actId:ui.assessorSignAct,step:1,mode:"select",selected:new Set()};
const flow=ui.assessorFlow; const groups=signOffGroups(p); const pairs=selectedSignOffPairs(p,flow); const critCount=pairs.reduce((n,x)=>n+x.crits.length,0);
const summaryText="Signing will mark "+critCount+" planned criteria Signed (only planned criteria in the selected competencies, across "+pairs.length+" competence(s)) and add the assessor signature to every line that applies — the Assessor sign-off form per-competence Signature/Date fields and the other paperwork for those activities. Unplanned criteria will not be signed.";
if(flow.step===1)return `<div class="scrim" data-action="close-modal"></div><div class="modal merge" role="dialog" data-testid="assessor-sign-modal"><header><h2>Assessor sign-off</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><p class="small muted">${SIG_NOTE}</p><div class="chiprow" role="group" aria-label="Sign-off scope"><button class="segchip ${flow.mode==="all"?"on":""}" data-action="assessor-mode" data-mode="all" data-testid="assessor-mode-all">Sign for all planned activities</button><button class="segchip ${flow.mode==="select"?"on":""}" data-action="assessor-mode" data-mode="select" data-testid="assessor-mode-select">Select competencies</button></div>
${flow.mode==="select"?`<div class="signoff-list" data-testid="signoff-select-list">${groups.map(g=>`<h3 style="margin-top:12px">Activity ${g.act.n} · ${esc(g.act.title)}</h3>${g.comps.map(x=>{const key=selectionKey(g.act.id,x.comp.id);const already=(g.act.signOffSelections||[]).some(sel=>sel.compId===x.comp.id);return `<label class="checkline signoff-row"><input type="checkbox" data-assessor-comp="${key}" ${flow.selected.has(key)?"checked":""}> <span class="grow"><b>${esc(compLabel(x.comp))} · ${esc(x.comp.title)}</b><span class="small muted" style="display:block">${x.crits.length} planned criteria (${x.crits.map(k=>k.id).join(", ")})${already?" · already signed — signing again updates it":""}</span></span></label>`;}).join("")}`).join("")||`<p class="small muted">No planned competencies yet — add some in an activity Assessment plan first.</p>`}</div>`:`<p class="small" style="margin-top:10px">All planned competencies in all activities (${groups.reduce((n,g)=>n+g.comps.length,0)} competencies).</p>`}
<div class="warn-box" style="margin-top:12px"><b data-testid="assessor-sign-summary">${esc(summaryText)}</b></div></div><footer class="merge-foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="assessor-to-pad" data-testid="assessor-sign-next" ${flow.mode==="select"&&!flow.selected.size?"disabled":""}>Sign</button></footer></div>`;
const entryAct=actOf(p,flow.actId)||p.activities[0];
return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog" data-testid="assessor-sign-pad-modal"><header><h2>Assessor sign-off — draw signature</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><p class="small muted">${SIG_NOTE}</p><p class="small" data-testid="assessor-sign-summary">${esc(summaryText)}</p><div class="field"><label>Assessor name</label><input id="assessor-sig-name" data-testid="assessor-sig-name" value="${esc((entryAct&&(entryAct.assessorName))||p.assessedBy||"")}" placeholder="Assessor printed name (BLOCK CAPITALS on forms)"></div><canvas id="assessor-sig-pad" class="sig-pad" width="640" height="240" data-testid="assessor-sig-pad"></canvas><div class="btn-row"><label class="btn">Upload signature image<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden data-upload="assessor-signature" data-testid="assessor-sig-upload"></label></div><p class="tiny muted">Draw above (or upload) then press Done. The signature image is stored on this device per activity signed.</p></div><footer><button class="btn" data-action="assessor-back">Back</button><button class="btn primary" data-action="assessor-sign-save" data-testid="assessor-sign-done">Done</button></footer></div>`;}}
if(ui.modal==="pdf-preview"){const pv=ui.pdfPreview;if(pv){const cur=pv.pages[pv.idx]||null;return `<div class="scrim" data-action="close-modal"></div><div class="modal merge pdf-modal" role="dialog" data-testid="submission-preview"><header><h2>${esc(pv.title||"Preview")}${pv.scopeActId?" — Activity "+esc((actOf(active(),pv.scopeActId)||{}).n||""):""}</h2><button class="close" data-action="close-modal">✕</button></header><div class="body">
<p class="small muted">This is the actual filled PDF, rendered page by page — exactly what will be in the download (not editable here).</p>
${pv.loading?`<p class="small" data-testid="pdf-preview-loading">Building filled forms…</p>`:pv.error?`<div class="warn-box"><b>Preview failed</b><p class="small">${esc(pv.error)}</p></div>`:`${pv.codeFills?`<p class="tiny muted" data-testid="code-fills">Type of Evidence filled: ${pv.codeFills.length?esc(pv.codeFills.join(" · ")):"none yet — pick O/P/W/Q on Criteria"}</p>`:""}${pv.warnings&&pv.warnings.length?`<div class="warn-box" data-testid="submission-warnings"><b>Check before exporting (${pv.warnings.length})</b><ul>${pv.warnings.map(w=>`<li class="small">${esc(w)}</li>`).join("")}</ul><label class="checkline"><input type="checkbox" id="sub-confirm" data-testid="sub-confirm"> I've checked these warnings and want to export anyway</label></div>`:`<div class="pack-status" style="background:#f5fbf7;border:1px solid #cfe9d8"><b>✓ No warnings</b></div>`}
<div class="pdf-viewer" data-testid="pdf-viewer"><div class="pdf-thumbs">${pv.pages.map((pg,i)=>`<button class="pdf-thumb ${i===pv.idx?"on":""}" data-action="pdf-thumb" data-idx="${i}" data-testid="pdf-thumb"><span class="small"><b>${esc(pg.label)}</b> · p${pg.page}/${pg.of}</span>${pg.url?`<img src="${pg.url}" alt="">`:`<span class="small muted">${esc(pg.error||"")}</span>`}</button>`).join("")}</div><div class="pdf-main">${cur?(cur.url?`<img src="${cur.url}" alt="${esc(cur.label)} page ${cur.page}" class="pdf-page-img" data-testid="pdf-page-img">`:`<div class="warn-box"><b>${esc(cur.label)}</b><p class="small">${esc(cur.error||"Could not render this form.")}</p></div>`):""}<div class="btn-row" style="justify-content:space-between;margin-top:8px"><button class="btn sm" data-action="pdf-prev" ${pv.idx<=0?"disabled":""}>‹ Prev page</button><span class="small muted">${pv.pages.length?("Page "+(pv.idx+1)+" of "+pv.pages.length):""}${cur?" · "+esc(cur.label):""}</span><button class="btn sm" data-action="pdf-next" ${pv.idx>=pv.pages.length-1?"disabled":""}>Next page ›</button></div></div></div>`}
</div><footer class="merge-foot"><button class="btn" data-action="close-modal">Back</button><button class="btn primary" data-action="submission-export-do" data-testid="submission-export-do">Download submission pack (.zip)</button></footer></div>`;}}
if(ui.fillTpl){const p=active();return `<div class="scrim" data-action="close-modal"></div><div class="modal" role="dialog"><header><h2>Fill a copy</h2><button class="close" data-action="close-modal">✕</button></header><div class="body"><p class="small muted">Creates a filled copy of <b>${esc(ui.fillTpl.fileName)}</b> (candidate name, date, and for Plan/Feedback forms, activity details). The stored blank is never changed.</p><div class="field"><label>Signature (only if you choose it — never added automatically)</label>${S.profile.signatureBlobId?`<button type="button" class="esign-btn ${ui.fillSig?"on":""}" data-action="fill-esign" data-testid="fill-esign" aria-pressed="${ui.fillSig}"><span class="esign-circle">${ui.fillSig?"✓":""}</span> Add e-signature ${ui.fillSig?"— added":""}</button><p class="tiny muted">Inserts your Profile signature into this copy. Not a legal e-signature service — MTCS may still require ink / scanned sign-off.</p>`:`<p class="small muted">No signature saved yet. <a href="#/profile" data-action="close-modal">Draw or upload one in More → Profile</a>, then come back.</p>`}</div>${p?`<div class="field"><label>Activity</label><select id="fill-act">${p.activities.map(a=>`<option value="${a.id}" ${String(ui.formsAct||workActId(p))===String(a.id)?"selected":""}>Activity ${a.n} — ${esc(a.title)}</option>`).join("")}</select></div>`:`<p class="small">Open a portfolio first.</p>`}</div><footer><button class="btn primary" data-action="do-fill">Download filled copy</button></footer></div>`;}
return "";}
function critNavInfo(){const list=ui.critNavList&&ui.critNavList.length?ui.critNavList:CRITS.map(k=>k.id);const idx=list.indexOf(ui.drawerCrit);return{list,idx};}
function drawerActId(p){let id=ui.drawerAct||(ui.critScope&&ui.critScope!=="all"?ui.critScope:null)||workActId(p);if(!actOf(p,id))id=p.activities[0].id;return String(id);}
function refreshDrawer(){const old=document.querySelector(".drawer");if(!old){render();return;}const tmp=document.createElement("div");tmp.innerHTML=drawerHTML();const nd=tmp.querySelector(".drawer");if(nd)old.replaceWith(nd);const el=document.querySelector("[data-saved-ind]");if(el)el.textContent=savedText();}
function drawerHTML(){const p=active();if(!ui.drawerCrit||!p)return"";const k=critById(ui.drawerCrit);if(!k)return"";
const nav=critNavInfo(),hasPos=nav.idx>=0&&nav.list.length>0;
const critNav=hasPos?`<nav class="crit-nav" aria-label="Criterion navigation"><button class="btn sm" data-action="crit-prev" data-testid="crit-prev" aria-label="Previous criterion" ${nav.idx<=0?"disabled":""}>‹ Prev</button><span class="crit-pos" data-testid="crit-pos">${nav.idx+1} of ${nav.list.length}</span><button class="btn sm" data-action="crit-next" data-testid="crit-next" aria-label="Next criterion" ${nav.idx>=nav.list.length-1?"disabled":""}>Next ›</button></nav>`:"";
const actId=drawerActId(p),cv=cov(p,k.id,actId),act=actOf(p,actId);
const evScoped=p.evidence.filter(e=>String(e.activityId)===actId||e.criteria.includes(k.id));
const evOthers=p.evidence.filter(e=>!(String(e.activityId)===actId||e.criteria.includes(k.id)));
const evRowLink=e=>`<label class="checkline" data-ev-row="${esc((e.title+" "+e.fileName).toLowerCase())}"><input type="checkbox" data-ev-link="${e.id}" data-crit="${k.id}" ${e.criteria.includes(k.id)?"checked":""}> ${esc(e.title)} <span class="muted small">(${esc(e.fileName)})</span></label>`;
return `<div class="scrim" data-action="close-drawer"></div><aside class="drawer" role="dialog" aria-label="Criterion detail" data-testid="crit-drawer"><header><div><span class="crit-id">${k.id}</span><div class="small muted">${compLabel(k.comp)} · ${esc(k.comp.title)}</div></div><button class="close" data-action="close-drawer" aria-label="Close">✕</button></header>${critNav}<div class="body"><div class="quote">${esc(k.text)}</div><p>${pill(critOverall(p,k.id))} <span class="small muted">for Activity ${act?act.n:""}</span> ${savedInd()}</p>
<div class="field"><label>Activity</label><div class="chiprow" role="group" aria-label="Activity scope">${p.activities.map(a=>`<button class="segchip ${String(a.id)===actId?"on":""}" data-drawer-act="${a.id}">Act ${a.n}</button>`).join("")}</div></div>
<div class="field"><label>Status</label><div class="chiprow" role="group" aria-label="Status">${STATUSES.map(s=>`<button class="segchip st-${stClass(s)} ${cv.status===s?"on":""}" data-chip-status="${s}" data-testid="chip-status-${s}">${s}</button>`).join("")}</div></div>
${ui.pendingSigned&&ui.pendingSigned.crit===k.id&&String(ui.pendingSigned.act)===actId?`<div class="warn-box" data-testid="signed-confirm"><b>Signed is normally set by your assessor — set anyway?</b><div class="btn-row"><button class="btn sm primary" data-action="confirm-signed">Set Signed</button><button class="btn sm" data-action="cancel-signed">Cancel</button></div></div>`:""}
<div class="field"><label>Evidence code ${S.settings.lastUsedCode?`<span class="muted small">(last used: ${esc(S.settings.lastUsedCode)})</span>`:""}</label><div class="chiprow" role="group" aria-label="Evidence code">${CODES.map(c=>`<button class="segchip ${cv.code===c?"on":""}" data-chip-code="${c}" data-testid="chip-code-${c}">${c}</button>`).join("")}</div></div>
<p class="tiny muted">Picking a code saves${ui.drawerFromList?" and moves to the next criterion":""}. Signed never auto-advances and is never suggested.</p>
<h3>Linked evidence — Activity ${act?act.n:""} first</h3>
<input type="search" placeholder="Search evidence…" data-ev-search style="width:100%;margin-bottom:8px">
<div data-ev-list>${evScoped.map(evRowLink).join("")||`<p class="small muted">No evidence in this activity yet.</p>`}${evOthers.length?`<details><summary class="small">Other activities (${evOthers.length})</summary>${evOthers.map(evRowLink).join("")}</details>`:""}</div>
<div class="btn-row"><label class="btn sm">＋ Add evidence for this criterion<input type="file" multiple hidden data-upload="evidence-for-crit" data-act="${actId}" data-crit="${k.id}"></label></div>
</div></aside>`;}
function navigateCrit(delta){ui.pendingSigned=null;const{list,idx}=critNavInfo();if(idx<0)return;const next=idx+delta;if(next<0||next>=list.length)return;ui.drawerCrit=list[next];history.replaceState(null,"",location.pathname+location.search+here()+"?c="+encodeURIComponent(ui.drawerCrit));render();}
function setCov(p,crit,act,patch){p.criteria[crit]=p.criteria[crit]||{};p.criteria[crit][String(act)]=Object.assign(cov(p,crit,act),patch);p.updatedAt=new Date().toISOString();save();}
async function addEvidenceFiles(p,files,actId){const added=[];for(const raw of files){const f=await maybeCompressImage(raw);const blobId=uid("blob");await blobSet(blobId,f);const ev={id:uid("ev"),blobId,title:cleanTitle(f.name),fileName:f.name,mime:f.type||"application/octet-stream",size:f.size,date:fileDateISO(raw),tags:[],criteria:suggestCriteria(f.name).length&&actId?[]:[],activityId:actId||"",redact:false,createdAt:new Date().toISOString(),compressed:f!==raw};p.evidence.push(ev);added.push(ev);}save();return added;}
const PACK_LABEL=k=>k==="imported"?"Imported pack":(((window.PACK_META||{}).units||{})[k]||{}).label||k;
function setPackProgress(stage,detail,done,total,pctOverride){ui.packProgress={stage,detail:detail||"",done:done||0,total:total||0,pct:pctOverride!=null?pctOverride:(total?Math.round(100*(done||0)/total):null),error:null};render();}
function setPackError(msg,detail){ui.packProgress={stage:"Something went wrong",detail:detail||"",done:0,total:0,pct:null,error:msg};render();}
async function deleteTemplates(pred,label){const removed=S.templates.filter(pred);if(!removed.length){toast("No stored forms to delete.");render();return;}
if(!confirm("Delete "+(removed.length===1?("the stored blank form '"+removed[0].fileName+"'"):(removed.length+" stored blank forms ("+label+")"))+"? Filled copies you downloaded and your evidence are not affected."))return;
const ids=new Set(removed.map(x=>x.id)),packs=[...new Set(removed.map(x=>x.packKey))];S.templates=S.templates.filter(x=>!ids.has(x.id));
for(const x of removed){if(x.blobId&&!blobIsReferenced(x.blobId,x.id)){try{await blobDel(x.blobId);}catch(_){}}}
packs.forEach(k=>{const prev=S.packImports.find(i=>i.packKey===k);refreshPackImport(k,prev?prev.zipName:"",prev?prev.importedAt:"");});save();toast(removed.length+" stored form(s) deleted. Downloaded filled copies and evidence are untouched.");render();}
function blobIsReferenced(blobId,ignoreTemplateId){if(!blobId)return false;
if(S.templates.some(x=>x.blobId===blobId&&x.id!==ignoreTemplateId))return true;
if(S.portfolios.some(pf=>(pf.evidence||[]).some(e=>e.blobId===blobId)))return true;
if(S.portfolios.some(pf=>(pf.activities||[]).some(a=>a.assessorSig&&a.assessorSig.blobId===blobId)))return true;
if(S.shared.some(x=>(x.evidenceBlobs||[]).includes(blobId)||(x.evidence||[]).some(e=>e.blobId===blobId)))return true;
return false;}
function refreshPackImport(k,zipName,importedAt){const count=S.templates.filter(x=>x.packKey===k).length;S.packImports=S.packImports.filter(i=>i.packKey!==k);if(count)S.packImports.push({packKey:k,zipName:zipName||"",fileCount:count,importedAt:importedAt||new Date().toISOString()});}
/* One stored template per packKey+fileName (newest wins); one packImports record per pack.
   Orphaned duplicate blobs are deleted only when nothing else references them. */
function migrateLegacyPortfolios(){let changed=false;S.portfolios.forEach(pf=>{
if(pf.genPackId&&!(S.genPacks||[]).some(g=>g.id===pf.genPackId)){pf.genPackId=null;changed=true;}
(pf.activities||[]).forEach(a=>{if(!("assessorSig" in a)){a.assessorSig=null;changed=true;}if(!("candidateSignedAt" in a)){a.candidateSignedAt=null;changed=true;}if(!Array.isArray(a.sigAudit)){a.sigAudit=[];changed=true;}if(!Array.isArray(a.signOffSelections)){a.signOffSelections=[];changed=true;}if(!Array.isArray(a.planCritIds)){a.planCritIds=Object.keys(pf.criteria||{}).filter(cid=>{const c=(pf.criteria[cid]||{})[a.id];return c&&c.status!=="Gap";});changed=true;}});
});if(changed)save();}
async function cleanupPackData(){let changed=false;
const byKey=new Map();
S.templates.forEach(x=>{const k=x.packKey+"\u0000"+x.fileName,cur=byKey.get(k);if(!cur||String(x.importedAt||"")>=String(cur.importedAt||""))byKey.set(k,x);});
if(byKey.size!==S.templates.length){changed=true;const kept=new Set(byKey.values()),removed=S.templates.filter(x=>!kept.has(x));S.templates=S.templates.filter(x=>kept.has(x));
const referenced=new Set();S.templates.forEach(x=>referenced.add(x.blobId));S.portfolios.forEach(pf=>(pf.evidence||[]).forEach(e=>referenced.add(e.blobId)));S.shared.forEach(x=>{(x.evidenceBlobs||[]).forEach(b=>referenced.add(b));(x.evidence||[]).forEach(e=>referenced.add(e.blobId));});
for(const x of removed){if(x.blobId&&!referenced.has(x.blobId)){try{await blobDel(x.blobId);}catch(_){}}}}
const packs=[...new Set(S.templates.map(x=>x.packKey))];
const rebuilt=packs.map(k=>{const prev=S.packImports.filter(i=>i.packKey===k).sort((a,b)=>String(b.importedAt||"").localeCompare(String(a.importedAt||"")))[0];const newest=S.templates.filter(x=>x.packKey===k).sort((a,b)=>String(b.importedAt||"").localeCompare(String(a.importedAt||"")))[0];return{packKey:k,zipName:prev?prev.zipName||"":"",fileCount:S.templates.filter(x=>x.packKey===k).length,importedAt:prev&&prev.importedAt?prev.importedAt:(newest?newest.importedAt:new Date(0).toISOString())};});
if(JSON.stringify(rebuilt)!==JSON.stringify(S.packImports)){S.packImports=rebuilt;changed=true;}
if(changed)save();return changed;}
async function importPackZip(file,expectedPackKey){setPackProgress("Unpacking zip…",file.name,0,0);try{const zip=await JSZip.loadAsync(file);const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir&&/\.pdf$/i.test(n));if(!names.length){ui.packProgress=null;toast("No PDF files found in that zip.");render();return;}
/* Pack for every file: the caller's known pack wins; otherwise majority vote of
   unambiguous names in this zip (shared generic files follow the zip's pack). */
let packKey=expectedPackKey||null;
if(!packKey){let core=0,role=0;names.forEach(n=>{if(/G2Core|CoreComp/i.test(n))core++;else if(/G2Surveyor|Surveyor/i.test(n))role++;});packKey=core>role?"g2-core":role>core?"g2-surveyor":"imported";}
setPackProgress("Storing files…","",0,names.length);
const importedAt=new Date().toISOString();const st={added:0,updated:0,skipped:0};
const rolePrefix=rolePrefixFor(active());
for(let _pi=0;_pi<names.length;_pi++){const n=names[_pi];const blob=await zip.files[n].async("blob");const base=n.split("/").pop();const hash=await sha256(blob);
const existing=S.templates.find(x=>x.packKey===packKey&&x.fileName===base);
if(existing&&existing.sha256===hash){st.skipped++;}
else if(existing){const oldBlobId=existing.blobId,newBlobId=uid("tpl");await blobSet(newBlobId,blob);Object.assign(existing,{blobId:newBlobId,sha256:hash,size:blob.size,importedAt});if(oldBlobId&&oldBlobId!==newBlobId&&!blobIsReferenced(oldBlobId,existing.id)){try{await blobDel(oldBlobId);}catch(_){}}st.updated++;}
else{const twin=S.templates.find(x=>x.fileName===base&&x.sha256===hash);const blobId=twin?twin.blobId:uid("tpl");if(!twin)await blobSet(blobId,blob);S.templates.push({id:uid("tplm"),packKey,fileName:base,blobId,sha256:hash,size:blob.size,importedAt});st.added++;}
if(/Competence\d+\.pdf$/i.test(base)&&window.MTCSParser){setPackProgress("Reading competence sheets…",base,_pi+1,names.length);try{const parsed=await window.MTCSParser.parseCompetence(blob,base,{rolePrefix});ui.pendingParse=ui.pendingParse.filter(x=>!(x.packKey===packKey&&x.parsed.fileName===base));ui.pendingParse.push({packKey,parsed});}catch(pe){console.warn("Competence parse failed",base,pe);}}
setPackProgress("Storing files…",base,_pi+1,names.length);}
refreshPackImport(packKey,file.name,importedAt);const _ap=active();if(_ap&&!_ap.formsPromptSeen)_ap.formsPromptSeen=true;ui.formsSetupFor=null;ui.packProgress=null;save();
toast(st.added+st.updated===0?("Already up to date: "+PACK_LABEL(packKey)+" — "+st.skipped+" file(s) skipped as duplicates"):(PACK_LABEL(packKey)+": "+st.added+" added, "+st.updated+" updated, "+st.skipped+" skipped duplicate"+(st.skipped===1?"":"s")));}catch(err){setPackError("Import didn't finish: "+err.message,"The zip may be damaged or not an MTCS forms pack.");err.packProgressShown=true;throw err;}}
function rolePrefixFor(pf){if(!pf)return "S";return {surveyor:"S",engineer:"E",processor:"D",partychief:"P",clientrep:"R"}[pf.roleKey]||"S";}
const CORE_FOR_GRADE={"G2":"g2-core","G1":"g1-core","Senior":"snr-core"};
const ROLE_PACK_FOR=(roleKey,grade)=>{const pre=grade==="G2"?"g2":grade==="G1"?"g1":grade==="Senior"?"snr":null;if(!pre)return null;return {surveyor:pre+"-surveyor",engineer:pre+"-survey-engineer",processor:pre+"-data-processor"}[roleKey]||null;};
function knownDownloadPacks(pf){if(!pf)return null;if(pf.roleKey==="partychief")return["party-chief"];if(pf.roleKey==="clientrep")return["client-rep"];const role=ROLE_PACK_FOR(pf.roleKey,pf.grade),core=CORE_FOR_GRADE[pf.grade];return role&&core?[role,core]:null;}
const coreLabelForGrade=g=>g==="G2"?"G2 Core":g==="G1"?"G1 Core":g==="Senior"?"Senior Core":null;
function detectRouteFromText(text){const t=String(text||"");let roleKey=null,roleName="";if(/data\s*processor/i.test(t)){roleKey="processor";roleName="Data Processor";}else if(/party\s*chief/i.test(t)){roleKey="partychief";roleName="Party Chief";}else if(/client\s*representative|client\s*rep/i.test(t)){roleKey="clientrep";roleName="Client Representative";}else if(/survey\s*engineer/i.test(t)){roleKey="engineer";roleName="Survey Engineer";}else if(/surveyor/i.test(t)){roleKey="surveyor";roleName="Surveyor";}else if(/core\s*compet/i.test(t)){roleKey="core";roleName="Core";}
let grade="";if(/grade\s*ii|\bG2\b/i.test(t))grade="G2";else if(/grade\s*i(?!i)|\bG1\b/i.test(t))grade="G1";else if(/senior/i.test(t))grade="Senior";return{roleKey,roleName,grade};}
function detectedRouteForParsed(list){const roles=[],grades=[];let hasCore=false;(list||[]).forEach(x=>{const d=detectRouteFromText((x.parsed.gradeLine||"")+" "+(x.parsed.fileName||""));if(d.roleKey==="core")hasCore=true;else if(d.roleKey){if(!roles.some(r=>r.roleKey===d.roleKey))roles.push(d);if(d.grade&&!grades.includes(d.grade))grades.push(d.grade);}});
const parts=roles.map(r=>(grades[0]?grades[0]+" ":"")+r.roleName);if(hasCore)parts.push("Core");return{label:parts.join(" + ")||"Unknown",roleKey:roles[0]?roles[0].roleKey:null,grade:grades[0]||"",hasCore};}
function maybeShowGenReview(){if(!ui.pendingParse||!ui.pendingParse.length||ui.genReview)return;
const byUnit={};ui.pendingParse.forEach(({parsed})=>{const u=parsed.unitId||"role";byUnit[u]=byUnit[u]||[];byUnit[u].push(parsed);});
const units=Object.keys(byUnit).sort((a,b)=>(a==="core"?0:1)-(b==="core"?0:1)).map(uid=>({id:uid,name:uid==="core"?"Core":"Role",short:uid==="core"?"Core":((active()&&active().role)||"Surveyor"),competences:byUnit[uid].sort((a,b)=>(a.number||0)-(b.number||0)).map(c=>({id:c.code,number:c.number,title:c.title,fileName:c.fileName,criteria:c.criteria.map(k=>({id:k.id,letter:k.letter,text:k.text}))}))}));
const warnings=[];ui.pendingParse.forEach(({parsed})=>(parsed.warnings||[]).forEach(w=>warnings.push(parsed.fileName+": "+w)));
const label=((ui.pendingParse[0].parsed.gradeLine)||"Imported pack")+(units.length>1?" + Core":"");
const pf=active();const det=detectedRouteForParsed(ui.pendingParse);let mismatch=null;if(pf&&det.roleKey&&(det.roleKey!==pf.roleKey||(det.grade&&pf.grade&&det.grade!==pf.grade)))mismatch={selected:pf.routeLabel,detected:det.label};
ui.genReview={units,warnings,label,packKeys:[...new Set(ui.pendingParse.map(x=>x.packKey))],selectedLabel:pf?pf.routeLabel:"",detectedLabel:det.label,mismatch};ui.pendingParse=[];render();}
async function buildPackFromStored(){const comps=S.templates.filter(x=>/Competence\d+\.pdf$/i.test(x.fileName));if(!comps.length){toast("No competence PDFs stored yet — import a forms pack first.");render();return;}
setPackProgress("Reading competence sheets…","",0,comps.length);let i=0;for(const tplItem of comps){const blob=await blobGet(tplItem.blobId);i++;if(!blob)continue;try{const parsed=await window.MTCSParser.parseCompetence(blob,tplItem.fileName,{rolePrefix:rolePrefixFor(active())});ui.pendingParse.push({packKey:tplItem.packKey,parsed});}catch(e){console.warn(e);}setPackProgress("Reading competence sheets…",tplItem.fileName,i,comps.length);}
ui.packProgress=null;maybeShowGenReview();if(!ui.genReview){toast("No competence sheets could be read.");render();}}
async function getPack(packKey){const _pf=active();if(_pf&&!(knownDownloadPacks(_pf)||[]).includes(packKey)){ui.packProgress=null;ui.modal="pack-unavailable";render();return;}const pg=MP[packKey]||{};
if(WORKER_BASE){setPackProgress("Fetching "+PACK_LABEL(packKey)+" from MTCS…","",0,0);
try{const res=await fetch(WORKER_BASE.replace(/\/$/,"")+"/?unit="+encodeURIComponent(packKey));if(!res.ok)throw new Error("Worker returned "+res.status);
let blob;if(res.body&&res.body.getReader){const totalLen=Number(res.headers.get("content-length"))||0,reader=res.body.getReader(),chunks=[];let received=0,lastPct=-1;
while(true){const rd=await reader.read();if(rd.done)break;chunks.push(rd.value);received+=rd.value.length;const pct=totalLen?Math.round(100*received/totalLen):null;if(pct!==lastPct){lastPct=pct;setPackProgress("Fetching "+PACK_LABEL(packKey)+" from MTCS…",totalLen?((received/1024).toFixed(0)+" KB of "+(totalLen/1024).toFixed(0)+" KB"):"Downloading…",0,0,pct);}}
blob=new Blob(chunks,{type:"application/zip"});}else blob=await res.blob();
const xu=res.headers.get("X-Pack-Unit");if(xu&&xu!==packKey)throw new Error("Worker returned the wrong pack ("+xu+")");await importPackZip(new File([blob],packKey+"-all-files.zip",{type:"application/zip"}),packKey);if(!ui.deferGenReview)maybeShowGenReview();render();return;}
catch(e){if(!e.packProgressShown)setPackError("One-click fetch failed ("+e.message+").","Fallback: opening the MTCS download — then use Import pack (.zip).");if(pg.zip)window.open(pg.zip,"_blank","noopener");return;}}
else toast("One-click fetch isn't live yet (free worker not deployed). Opening MTCS download — then tap Import pack (.zip).");
if(pg.zip)window.open(pg.zip,"_blank","noopener");render();}
async function exportZip(zip,name){downloadBlob(await zip.generateAsync({type:"blob"}),name);}
async function buildActivityZip(p,a,kind){const crit={};Object.entries(p.criteria).forEach(([cid,by])=>{if(by[a.id])crit[cid]=by[a.id];});const ev=p.evidence.filter(e=>String(e.activityId)===String(a.id)||e.criteria.some(c=>crit[c]));
const zip=new JSZip(),fileEntries=[];for(const e of ev){const blob=await blobGet(e.blobId);if(!blob)continue;const path="evidence/"+e.fileName;zip.file(path,blob);fileEntries.push({id:e.id,name:e.fileName,path,sha256:await sha256(blob),size:blob.size});}
const manifest={kind,appVersion:APP_VERSION,portfolioId:p.id,activityId:a.id,candidate:p.name,candidateName:p.name,route:p.routeLabel,exportSeq:a.exportSeq+(kind==="activity-export"?1:0),baseVersion:a.version,exportedAt:new Date().toISOString(),files:fileEntries};
zip.file("manifest.json",JSON.stringify(manifest,null,2));zip.file("activity.json",JSON.stringify({activity:a,criteria:crit,genPack:genPackOf(p),evidence:ev.map(e=>{const{blobId,...rest}=e;return rest;})},null,2));return{zip,manifest};}
async function exportBackup(){const zip=new JSZip(),files=[];zip.file("data.json",JSON.stringify({portfolios:S.portfolios,templates:S.templates,packImports:S.packImports,shared:S.shared,genPacks:S.genPacks,profile:S.profile,settings:S.settings},null,2));
const bids=new Set();S.portfolios.forEach(p=>{p.evidence.forEach(e=>bids.add(e.blobId));(p.activities||[]).forEach(a=>{if(a.assessorSig&&a.assessorSig.blobId)bids.add(a.assessorSig.blobId);});});S.templates.forEach(t=>bids.add(t.blobId));S.shared.forEach(x=>(x.evidenceBlobs||[]).forEach(b=>bids.add(b)));if(S.profile&&S.profile.signatureBlobId)bids.add(S.profile.signatureBlobId);
for(const bid of bids){const blob=await blobGet(bid);if(!blob)continue;const path="blobs/"+bid;zip.file(path,blob);files.push({path,blobId:bid,sha256:await sha256(blob),size:blob.size});}
zip.file("manifest.json",JSON.stringify({kind:"mtcs-full-backup",schema:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),files},null,2));
await exportZip(zip,"MTCS_Tracker_Backup_"+todayISO()+".zip");S.settings.lastBackupAt=new Date().toISOString();save();try{await kvSet("settings",S.settings);}catch(_){}toast("Backup downloaded. Keep it somewhere safe.");}
async function parseBackup(file){const zip=await JSZip.loadAsync(file),mf=zip.file("manifest.json"),df=zip.file("data.json");if(!mf||!df)throw new Error("Not an MTCS Tracker backup.");const manifest=JSON.parse(await mf.async("string")),data=JSON.parse(await df.async("string"));if(manifest.kind!=="mtcs-full-backup")throw new Error("That zip isn't a full MTCS Tracker backup.");
for(const f of manifest.files||[]){const en=zip.file(f.path);if(!en)throw new Error("Backup missing "+f.path);if(await sha256(await en.async("blob"))!==f.sha256)throw new Error("SHA-256 check failed: "+f.path);}return{zip,manifest,data};}
async function applyBackup(parsed){for(const k of await blobKeys())await blobDel(k);for(const f of parsed.manifest.files||[])await blobSet(f.blobId,await parsed.zip.file(f.path).async("blob"));
const d=parsed.data;S.portfolios=d.portfolios||[];S.templates=d.templates||[];S.packImports=d.packImports||[];S.shared=d.shared||[];S.genPacks=d.genPacks||[];S.profile=Object.assign({name:"",signatureBlobId:null,signatureUpdatedAt:null},d.profile||{});S.settings=Object.assign({activeId:S.portfolios[0]?S.portfolios[0].id:null,lastBackupAt:null},d.settings||{});if(!S.portfolios.find(p=>p.id===S.settings.activeId))S.settings.activeId=S.portfolios[0]?S.portfolios[0].id:null;await cleanupPackData();cleanupPortfolioPeople();migrateLegacyPortfolios();save();ui.pendingBackup=null;toast("Backup imported: "+S.portfolios.length+" portfolio(s) restored.");location.hash=S.portfolios.length?"#/dashboard":"#/";render();}
async function importSharedPayload(zip,manifest,payload){const evidence=[],evidenceBlobs=[];for(const e of payload.evidence||[]){const en=(manifest.files||[]).find(f=>f.id===e.id);let blobId=null;if(en&&zip.file(en.path)){const blob=await zip.file(en.path).async("blob");if(await sha256(blob)!==en.sha256)throw new Error("Evidence SHA-256 check failed: "+e.fileName);blobId=uid("sblob");await blobSet(blobId,blob);evidenceBlobs.push(blobId);}evidence.push(Object.assign({},e,{blobId}));}
const item={id:uid("shared"),importedAt:new Date().toISOString(),manifest,candidateName:manifest.candidateName||manifest.candidate||"Candidate",activity:payload.activity,criteria:payload.criteria||{},genPack:payload.genPack||null,evidence,evidenceBlobs};S.shared.push(item);save();return item;}
async function importSharedZip(file){const zip=await JSZip.loadAsync(file),mf=zip.file("manifest.json"),af=zip.file("activity.json");if(!mf||!af)throw new Error("Not an MTCS activity zip.");const item=await importSharedPayload(zip,JSON.parse(await mf.async("string")),JSON.parse(await af.async("string")));location.hash="#/shared/"+item.id;toast("Activity imported as a separate copy.");}
async function stageReturn(file,actId){const p=active(),a=actOf(p,actId);if(!a)return;const zip=await JSZip.loadAsync(file),mf=zip.file("manifest.json"),af=zip.file("activity.json");if(!mf||!af){toast("That isn't an MTCS activity zip.");return;}
const manifest=JSON.parse(await mf.async("string")),payload=JSON.parse(await af.async("string")),warnings=[];
if(String(manifest.activityId)!==String(a.id))warnings.push("This return is for a different activity number.");
if(Number(manifest.baseVersion)<a.version)warnings.push("Return is based on v"+manifest.baseVersion+" but your activity is v"+a.version+" — you may have edited it since exporting.");
const count=o=>Object.values(o||{}).filter(c=>["Signed","Evidenced"].includes(c.status)).length;const myCrit={};Object.entries(p.criteria).forEach(([cid,by])=>{if(by[a.id])myCrit[cid]=by[a.id];});
const expectedCount=count(myCrit),receivedCount=count(payload.criteria);if(receivedCount<expectedCount)warnings.push("Return has fewer signed/evidenced criteria ("+receivedCount+") than yours ("+expectedCount+").");
for(const f of manifest.files||[]){const en=zip.file(f.path);if(!en){warnings.push("Missing evidence file: "+f.name);continue;}if(await sha256(await en.async("blob"))!==f.sha256)warnings.push("Evidence changed since export (hash mismatch): "+f.name);}
ui.pendingReturn={zip,manifest,payload,activity:a,warnings,expectedCount,receivedCount,activityEvidence:p.evidence.filter(e=>String(e.activityId)===String(a.id)).length,pkgEvidence:(payload.evidence||[]).length};render();}
async function applyReturn(asCopy){const r=ui.pendingReturn,p=active();if(!r)return;
if(asCopy){await importSharedPayload(r.zip,r.manifest,r.payload);ui.pendingReturn=null;toast("Saved as a separate imported copy.");render();return;}
const a=r.activity;a.versions=a.versions||[];a.versions.push({version:a.version,at:new Date().toISOString(),label:"Before assessor return import",snapshot:JSON.parse(JSON.stringify({activity:a,criteria:p.criteria}))});const keep=a.versions;Object.assign(a,r.payload.activity,{versions:keep,version:a.version+1});
Object.keys(p.criteria).forEach(cid=>{delete p.criteria[cid][a.id];});Object.entries(r.payload.criteria||{}).forEach(([cid,cv])=>{p.criteria[cid]=p.criteria[cid]||{};p.criteria[cid][a.id]=cv;});
for(const e of r.payload.evidence||[]){const en=(r.manifest.files||[]).find(f=>f.id===e.id);if(!en||!r.zip.file(en.path))continue;const blob=await r.zip.file(en.path).async("blob");const ex=p.evidence.find(x=>x.id===e.id);if(ex){await blobSet(ex.blobId,blob);Object.assign(ex,e,{blobId:ex.blobId});}else{const blobId=uid("blob");await blobSet(blobId,blob);p.evidence.push(Object.assign({},e,{blobId}));}}
if(a.signedOn)a.status="Signed";save();ui.pendingReturn=null;toast("Return applied as v"+a.version+". Previous version kept for rollback.");render();}
function initSigPad(){["sig-pad","assessor-sig-pad"].forEach(id=>initOnePad(document.getElementById(id)));}
function initOnePad(c){if(!c||c.dataset.init)return;c.dataset.init="1";const ctx=c.getContext("2d");ctx.lineWidth=2.4;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#14324a";let drawing=false,last=null;
const pos=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)};};
c.addEventListener("pointerdown",e=>{drawing=true;last=pos(e);try{c.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();});
c.addEventListener("pointermove",e=>{if(!drawing)return;const pt=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(pt.x,pt.y);ctx.stroke();last=pt;c.dataset.dirty="1";});
["pointerup","pointercancel","pointerleave"].forEach(ev=>c.addEventListener(ev,()=>{drawing=false;}));}
function profileCardHTML(){const pf=active();const nameVal=S.profile.name||(pf?pf.name:"");const hasSig=!!S.profile.signatureBlobId;
const uploadBtn=`<label class="btn">Upload signature image<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden data-upload="signature" data-testid="sig-upload"></label>`;
return `<section class="card" id="profile" data-testid="profile-card"><div class="card-head"><h2>Profile</h2>${savedInd()}</div>
<div class="field"><label>Your name</label><input value="${esc(nameVal)}" data-profile-name data-testid="profile-name" placeholder="Your full name"></div>
<h3>Your signature</h3><p class="small muted">Draw once, reuse where a form asks you to sign. Stored only on this device. This is a drawn signature image for convenience — it is not a legal e-signature service; MTCS ink requirements still apply.</p>
${hasSig&&!ui.sigPadOpen?`${ui.sigUrl?`<img src="${ui.sigUrl}" alt="Your saved signature" class="sig-preview" data-testid="sig-preview">`:`<p class="small">✓ Signature saved</p>`}<p class="tiny muted">Saved ${S.profile.signatureUpdatedAt?fmtDate(S.profile.signatureUpdatedAt):""}</p><div class="btn-row"><button class="btn" data-action="sig-replace" data-testid="sig-replace">Replace — draw again</button>${uploadBtn}<button class="btn ghost" data-action="sig-clear" data-testid="sig-clear">Clear</button></div>`
:`<canvas id="sig-pad" class="sig-pad" width="640" height="240" data-testid="sig-pad"></canvas><div class="btn-row"><button class="btn primary" data-action="sig-save" data-testid="sig-save">Save signature</button>${uploadBtn}${hasSig?`<button class="btn" data-action="sig-cancel-pad">Cancel</button>`:""}</div><p class="tiny muted">Or upload a PNG/JPG photo or scan of your ink signature — it is placed on a white background and stored on this device like a drawn one.</p>`}
</section>`;}
/* ---- v0.2.3 submission pack: filled forms, signatures, preview ---- */
function submissionFormsPlan(p,scopeActId){
  const acts=scopeActId?p.activities.filter(a=>String(a.id)===String(scopeActId)):p.activities;
  const out=[]; const seenSignOff=new Set();
  const findAll=rx=>S.templates.filter(x=>rx.test(x.fileName));
  acts.forEach(a=>{
    findAll(/AssessmentPlan/i).forEach(tpl=>out.push({tpl,act:a,kind:"Assessment Plan",label:"Assessment plan"}));
    planCritOf(p,a).forEach(k=>{});
    // competence + UKQ per competence in plan
    const compNums=new Map();
    COMPS.forEach(c=>{if(c.criteria.some(k=>(a.planCritIds||[]).includes(k.id)||cov(p,k.id,a.id).status!=="Gap"))compNums.set(c.fileName||c.id,c);});
    compNums.forEach(c=>{
      const tpl=c.fileName?S.templates.find(x=>x.fileName===c.fileName):null;
      if(tpl)out.push({tpl,act:a,kind:"Competence "+(c.number||""),comp:c,label:simpleFormLabel("Competence",tpl,c)});
      const ukqNum=String(c.number||"").padStart(2,"0");
      const hasUkq=(a.ukq||[]).some(u=>u.q||u.a);
      if(hasUkq){const ut=S.templates.find(x=>new RegExp("UKQ"+ukqNum+"\\.pdf$","i").test(x.fileName)&&(c.fileName?x.packKey===tpl?.packKey||true:true)); if(ut&&!out.some(o=>o.tpl.id===ut.id&&o.act.id===a.id))out.push({tpl:ut,act:a,kind:"UKQ "+ukqNum,comp:c,label:"Knowledge questions"});}
    });
    findAll(/FeedbackForm/i).forEach(tpl=>out.push({tpl,act:a,kind:"Feedback",label:"Feedback form"}));
    findAll(/CandidateTestimony/i).forEach(tpl=>out.push({tpl,act:a,kind:"Candidate Testimony",label:"Candidate testimony"}));
    if(a.witness)findAll(/Record_of_Witness/i).forEach(tpl=>out.push({tpl,act:a,kind:"Record of Witness",label:"Record of witness"}));
  });
  findAll(/Assessor_SignOff/i).forEach(tpl=>{if(!seenSignOff.has(tpl.id)){seenSignOff.add(tpl.id);out.push({tpl,act:acts[0]||null,kind:"Assessor Sign-Off",label:"Assessor sign-off"});}});
  const seen=new Set(); return out.filter(o=>{const k=(o.act?o.act.id:"-")+"|"+o.kind+"|"+o.tpl.fileName; if(seen.has(k))return false; seen.add(k); if(o.act&&(o.act.planCritIds||[]).length&&/Assessment Plan|Feedback|Competence|UKQ/.test(o.kind)&&!critsForForm(p,o.act,o.tpl,o.kind).length)return false; return true;});
}
function evidenceZipPath(p,e,used){
  const a=p.activities.find(x=>String(x.id)===String(e.activityId));
  const folder=a?("Activity-"+a.n+"_"+safeName(a.title)):"Unassigned";
  const codes=(e.criteria||[]).join("-")||"UNMAPPED";
  let name="A"+(a?a.n:"0")+"_"+codes+"_"+safeName(e.fileName);
  // keep extension
  const ext=(e.fileName.match(/\.[^.]+$/)||[""])[0];
  if(ext&&!name.toLowerCase().endsWith(ext.toLowerCase()))name+=ext;
  let path="Evidence/"+folder+"/"+name, i=2;
  while(used.has(path)){path="Evidence/"+folder+"/"+name.replace(/(\.[^.]+)?$/,m=>"_"+(i++)+(m||"")); }
  used.add(path); return path;
}
function critsForForm(p,a,tpl,kind){
  const all=a?planCritOf(p,a):CRITS; if(!a||!tpl)return all;
  const isCore=/Core/i.test(tpl.fileName||"")||/core/i.test(tpl.packKey||"");
  const isRoleForm=/AssessmentPlan|FeedbackForm|Competence|UKQ/i.test(tpl.fileName||"")&&!/Core/i.test(tpl.fileName||"");
  if(isCore)return all.filter(k=>k.comp&&k.comp.unitId==="core");
  if(isRoleForm)return all.filter(k=>!k.comp||k.comp.unitId!=="core");
  return all;
}

function simpleFormLabel(kind,tpl,comp){
  const fn=(tpl&&tpl.fileName)||"";
  if(comp||/^Competence/i.test(kind||""))return comp?((comp.id?comp.id+" · ":"")+(comp.title||kind)):kind;
  if(/AssessmentPlan/i.test(fn)||/Assessment Plan/i.test(kind||""))return "Assessment plan";
  if(/FeedbackForm/i.test(fn)||/Feedback/i.test(kind||""))return "Feedback form";
  if(/Assessor_SignOff/i.test(fn)||/Assessor Sign-Off/i.test(kind||""))return "Assessor sign-off";
  if(/CandidateTestimony/i.test(fn)||/Candidate Testimony/i.test(kind||""))return "Candidate testimony";
  if(/Record_of_Witness/i.test(fn)||/Record of Witness/i.test(kind||""))return "Record of witness";
  if(/UKQ/i.test(fn)||/^UKQ/i.test(kind||""))return "Knowledge questions";
  return kind||fn;
}
function plannedCritForComp(p,a,c){return c.criteria.filter(k=>(a.planCritIds||[]).includes(k.id)||cov(p,k.id,a.id).status!=="Gap");}
function plannedCompsFor(p,a){return COMPS.map(c=>({comp:c,crits:plannedCritForComp(p,a,c)})).filter(x=>x.crits.length);}
function signOffGroups(p){return p.activities.map(a=>({act:a,comps:plannedCompsFor(p,a)})).filter(g=>g.comps.length);}
function selectionKey(actId,compId){return String(actId)+"|"+compId;}
function selectedSignOffPairs(p,flow){
  const groups=signOffGroups(p); const out=[];
  groups.forEach(g=>g.comps.forEach(x=>{
    if(!flow||flow.mode==="all"||(flow.selected&&flow.selected.has(selectionKey(g.act.id,x.comp.id))))out.push({act:g.act,comp:x.comp,crits:x.crits});
  })); return out;
}
/* Signed (activity, competence) pairs incl. v0.2.3 legacy: an activity-level
   assessorSig with no selections counts as signing all its planned comps. */
function signedSignOffPairs(p){
  const out=[];
  p.activities.forEach(a=>{
    const sels=a.signOffSelections||[];
    if(sels.length){sels.forEach(sel=>{const comp=COMPS.find(c=>c.id===sel.compId);if(comp)out.push({act:a,comp,sel});});}
    else if(a.assessorSig){plannedCompsFor(p,a).forEach(x=>out.push({act:a,comp:x.comp,sel:{compId:x.comp.id,criteriaIds:x.crits.map(k=>k.id),signedAt:a.assessorSig.signedAt,assessorName:a.assessorSig.name,blobId:a.assessorSig.blobId}}));}
  }); return out;
}
function signOffFieldNames(rowIdx,actIdx){
  const r=rowIdx+1, suf=actIdx>1?("_"+actIdx):"";
  if(r<=3)return{sig:"Signature"+r+suf,date:"Date"+r+suf,all:"All Criteria Covered"+r,know:"Knowledge Assessed"+r,label:null};
  return{sig:"SignatureRow"+r+suf,date:"DateRow"+r+suf,all:"All Criteria CoveredRow"+r,know:"Knowledge AssessedRow"+r,label:"3Row"+(r-3)};
}
async function drawSigAtField(pdf,form,fieldName,blobId,log){
  try{
    const blob=await blobGet(blobId); if(!blob||!form)return false;
    const f=form.getFields().find(x=>x.getName()===fieldName); if(!f||!f.acroField||!f.acroField.getWidgets().length)return false;
    const png=await pdf.embedPng(await blob.arrayBuffer());
    const w=f.acroField.getWidgets()[0]; const rect=w.getRectangle(); const page=pdf.getPages().find(pg=>pg.ref===w.P());
    if(!page||!rect||rect.width<8)return false;
    const iw=Math.min(rect.width, Math.max(20,rect.width)); const ih=Math.min(rect.height, iw*(png.height/png.width));
    page.drawImage(png,{x:rect.x,y:rect.y,width:iw,height:ih}); if(log)log.push("signature at "+fieldName); return true;
  }catch(e){return false;}
}

async function applyAssessorSigning(p,blobId,source,name){
  const flow=ui.assessorFlow||{mode:"all",selected:new Set()};
  const pairs=selectedSignOffPairs(p,flow);
  if(!pairs.length){toast("Choose at least one planned competence to sign off.");render();return;}
  const signedAt=new Date().toISOString();
  let marked=0;
  pairs.forEach(({act,comp,crits})=>{
    act.assessorSig={name:name||"",blobId,signedAt,source};
    if(name)act.assessorName=name;
    act.signOffSelections=(act.signOffSelections||[]).filter(sel=>sel.compId!==comp.id);
    const critIds=crits.map(k=>k.id);
    act.signOffSelections.push({compId:comp.id,criteriaIds:critIds,signedAt,assessorName:name||"",blobId});
    critIds.forEach(cid=>{const prev=cov(p,cid,act.id); if(prev.status!=="Signed"){p.criteria[cid]=p.criteria[cid]||{}; p.criteria[cid][String(act.id)]=Object.assign({},prev,{status:"Signed"}); marked++;}});
    act.sigAudit=act.sigAudit||[]; act.sigAudit.push({who:"assessor",name:name||"",at:signedAt,activity:act.id,mode:flow.mode,compId:comp.id,criteria:critIds,source});
  });
  ui.assessorFlow=null; ui.modal=null; save();
  toast("Assessor signed off "+pairs.length+" competence(s) — "+marked+" criteria marked Signed. Signature will be applied to the paperwork on export.");
  render();
}
async function buildPdfPreview(scopeActId,onlyForWork){
  const p=active(); if(!p)return;
  const title=onlyForWork==="criteria"?"Criteria preview":onlyForWork?"Document preview":"Submission preview";
  ui.pdfPreview={loading:true,scopeActId:scopeActId||null,pages:[],warnings:[],idx:0,title,error:null};
  ui.modal="pdf-preview"; render();
  try{
    if(window.pdfjsLib&&window.pdfjsLib.GlobalWorkerOptions&&!window.pdfjsLib.GlobalWorkerOptions.workerSrc)window.pdfjsLib.GlobalWorkerOptions.workerSrc="js/vendor/pdf.worker.min.js";
    let entries=submissionFormsPlan(p,scopeActId||null);
    if(onlyForWork==="criteria"){entries=entries.filter(e=>/^Competence|Assessor Sign-Off/i.test(e.kind));}else if(onlyForWork){const want=[/Assessment Plan/i,/Feedback/i,/Assessor Sign-Off/i,/^UKQ/i]; entries=entries.filter(e=>want.some(rx=>rx.test(e.kind)));}
    const sum=buildSubmissionSummary(p,scopeActId||null);
    const pages=[];const codeFills=[];
    for(const entry of entries){
      const label=(entry.label||entry.kind)+(entry.act?" · Activity "+entry.act.n:"");
      try{
        const r=await fillFormForSubmission(entry,p);(r.filled||[]).filter(x=>/evidence code/.test(x)).forEach(x=>codeFills.push((entry.act?"A"+entry.act.n+" ":"")+x));
        const buf=await r.blob.arrayBuffer();
        const doc=await window.pdfjsLib.getDocument({data:buf.slice(0)}).promise;
        for(let i=1;i<=doc.numPages;i++){
          const pg=await doc.getPage(i); const vp=pg.getViewport({scale:1.2});
          const cv=document.createElement("canvas"); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
          await pg.render({canvasContext:cv.getContext("2d"),viewport:vp}).promise;
          pages.push({label,kind:entry.kind,page:i,of:doc.numPages,url:cv.toDataURL("image/jpeg",0.85)});
        }
      }catch(e){pages.push({label,kind:entry.kind,page:1,of:1,error:e.message});}
    }
    if(!pages.length)pages.push({label:"No filled forms yet",kind:"",page:1,of:1,error:"No stored blank forms in scope — import a forms pack first. Evidence is still in the downloaded zip."});
    ui.pdfPreview={loading:false,scopeActId:scopeActId||null,pages,warnings:sum.warnings,idx:0,title,error:null,codeFills:onlyForWork==="criteria"?codeFills:null};
  }catch(e){ui.pdfPreview={loading:false,scopeActId:scopeActId||null,pages:[],warnings:[],idx:0,title,error:e.message};}
  render();
}
function buildSubmissionSummary(p,scopeActId){
  const acts=scopeActId?p.activities.filter(a=>String(a.id)===String(scopeActId)):p.activities;
  const forms=submissionFormsPlan(p,scopeActId);
  const used=new Set(); const evEntries=[];
  const evList=scopeActId?p.evidence.filter(e=>String(e.activityId)===String(scopeActId)):p.evidence;
  evList.forEach(e=>{const a=p.activities.find(x=>String(x.id)===String(e.activityId));evEntries.push({e,a,path:evidenceZipPath(p,e,used),statuses:(e.criteria||[]).map(cid=>{const cv=a?cov(p,cid,a.id):{status:"Gap",code:""};return cid+":"+cv.status+(cv.code?"/"+cv.code:"");}).join("; ")});});
  const warnings=[];
  if(!p.name)warnings.push("Candidate name is blank.");
  acts.forEach(a=>{
    if(!planCritOf(p,a).length)warnings.push("Activity "+a.n+": no criteria chosen in its Assessment Plan.");
    if(!a.assessorSig)warnings.push("Activity "+a.n+": no assessor signature captured.");
    if(!a.candidateSignedAt)warnings.push("Activity "+a.n+": candidate has not signed this activity (Profile signature will not be applied).");
    if(!(a.assessorName||p.assessedBy))warnings.push("Activity "+a.n+": no assessor name (activity or portfolio Assessed by).");
  });
  const unmapped=evList.filter(e=>!e.criteria.length);
  if(unmapped.length)warnings.push(unmapped.length+" evidence file(s) not linked to any criterion (labelled UNMAPPED in the pack).");
  if(!S.templates.length)warnings.push("No blank MTCS forms stored in this browser — pack will contain evidence only.");
  if(!evList.length)warnings.push("No evidence files in scope.");
  if(CRITS.length&&CRITS.some(k=>critOverall(p,k.id)==="Gap"))warnings.push(CRITS.filter(k=>critOverall(p,k.id)==="Gap").length+" criteria are still Gap overall.");
  {const aw=awaitingIds(p);const A=aw.filter(id=>critFlags(p,id).includes("attach")),Q=aw.filter(id=>critFlags(p,id).includes("question"));if(A.length)warnings.push(A.length+" criteria evidenced by P/W but awaiting attachment: "+A.slice(0,8).join(", ")+(A.length>8?"…":"")+".");if(Q.length)warnings.push(Q.length+" criteria evidenced by Q but awaiting question link (Knowledge questions): "+Q.slice(0,8).join(", ")+(Q.length>8?"…":"")+".");}
  const root=safeName(p.name+"_"+p.routeLabel);
  return {acts,forms,evEntries,warnings,root,hasForms:forms.length>0,hasEvidence:evList.length>0};
}
async function tryPlaceSig(pdf,form,blobId,who,name,dateStr,log){
  try{
    const blob=await blobGet(blobId); if(!blob)return false;
    const png=await pdf.embedPng(await blob.arrayBuffer());
    const fields=form?form.getFields():[];
    const specific=who==="candidate"?/candidate signature/i:/assessor signature/i;
    const sf=fields.find(f=>specific.test(f.getName())&&f.acroField&&f.acroField.getWidgets().length)||fields.find(f=>/signature/i.test(f.getName())&&f.acroField&&f.acroField.getWidgets().length);
    if(sf){const w=sf.acroField.getWidgets()[0];const rect=w.getRectangle();const page=pdf.getPages().find(pg=>pg.ref===w.P());if(page&&rect&&rect.width>10){page.drawImage(png,{x:rect.x,y:rect.y,width:Math.min(rect.width,180),height:Math.min(rect.height,Math.min(rect.width,180)*(png.height/png.width))});log.push(who+" signature image placed at form field '"+sf.getName()+"'.");return true;}}
  }catch(e){log.push(who+" signature placement failed: "+e.message);}
  return false;
}
async function fillFormForSubmission(entry,p){
  const {tpl,act:a,kind}=entry; const filled=[],appended=[],warn=[];
  const blob=await blobGet(tpl.blobId); if(!blob)throw new Error("Stored blank missing: "+tpl.fileName);
  const pdf=await PDFLib.PDFDocument.load(await blob.arrayBuffer()); let form=null; try{form=pdf.getForm();}catch(_){}
  const set=(n,v)=>{if(v==null||v==="")return; if(!form)return; try{form.getTextField(n).setText(String(v)); if(!filled.includes(n))filled.push(n);}catch(_){}};
  const cand=(p.name||"").toUpperCase(), assessor=((a&&a.assessorName)||p.assessedBy||"").toUpperCase();
  const crits=critsForForm(p,a,tpl,kind);
  const critCodes=crits.map(k=>k.id).join(", ");
  const types=[...new Set(crits.map(k=>a?cov(p,k.id,a.id).code:"").filter(Boolean).map(c=>CODE_LABEL[c]||c))].join(", ");
  set("Candidate Name",cand); set("Candidate name",cand); set("Date",todayISO()); set("Date_2",todayISO()); set("Date_3",todayISO());
  set("Grade",p.routeLabel); set("Assessor Name",assessor); set("Assessor name",assessor);
  if(a){
    set("Activity Number 12 or 3",a.n);
    set("Work activity to be assessed",a.summary||a.title);
    set("Which performance criteria in the competences do you intend to assess",critCodes);
    set("What type of evidence will be assessed Observation Work Product Questioning or other please specify",types||a.planText||"");
    set("What date or dates will the assessment take place",a.dates); set("Where will the assessment take place eg name of vessel installation system workshop etc",a.where);
    set("Witness name if applicable",a.witness); set("Witness name If applicable in assessment plan",a.witness); set("Particular assessment needs and name of any witness involved",a.witness||a.planText||"");
    set("Please specify the reasons for your decision",a.feedbackText); set("Summary of further action for the candidate",a.feedbackText?"See assessor feedback / next activity plan.":"");
    set("Candidates comments",a.candidateComments); set("Candidate StatementRow1",a.candidateComments||a.summary||""); set("Description of TaskRow1",a.summary||a.title);
    set("Competencies",critCodes); set("Location of Activity",a.where); set("AssessorWitness",a.witness||assessor); set("Feedback completed by AssessorWitnessRow1",a.feedbackText||"");
    if(/Feedback/i.test(kind)){
      const entries=crits.map(k=>cov(p,k.id,a.id)); const allSigned=entries.length&&entries.every(c=>c.status==="Signed");
      set("Has the candidate demonstrated competence in this activity  yesno",entries.length?(allSigned?"Yes":"No"):"");
      const allActsDone=p.activities.every(x=>planCritOf(p,x).length&&planCritOf(p,x).every(k=>cov(p,k.id,x.id).status==="Signed"));
      set("Has the candidate now demonstrated competence in three activities yesno",allActsDone?"Yes":"No");
    }
    if(entry.comp){
      // Competence sheet: Type of Evidence fields in form order map to criteria in order
      try{const tof=(form?form.getFields():[]).filter(f=>/^Type of Evidence/i.test(f.getName())); entry.comp.criteria.forEach((k,i)=>{const cv=cov(p,k.id,a.id); const f=tof[i]; if(f&&cv.code){try{f.setText(cv.code); filled.push(k.id+" evidence code ("+cv.code+")");}catch(_){}} else if(cv.status!=="Gap"){/* status listed on appended criteria sheet */}});}catch(e){warn.push("Competence code fill: "+e.message);}
    }
    if(/^UKQ/i.test(kind)){
      (a.ukq||[]).slice(0,10).forEach((u,i)=>{if(u.q||u.a)set(String(i+1),(u.q?u.q+" — ":"")+(u.a||"")); if(u.ok)set("Satisfactory Response"+(i+1),u.ok);});
      set("Feedback on answers received",a.feedbackText||"");
    }
  }
  if(/Assessor Sign-Off/.test(kind)){
    set("Assessor Name",assessor); set("Assessor Signtaure Date",todayISO()); set("Assessor Signature Date",todayISO());
    const pairs=signedSignOffPairs(p);
    const byComp=new Map(); pairs.forEach(pr=>{if(!byComp.has(pr.comp.id))byComp.set(pr.comp.id,[]); byComp.get(pr.comp.id).push(pr);});
    const overflow=[];
    for(let rowIdx=0;rowIdx<COMPS.length;rowIdx++){
      const comp=COMPS[rowIdx]; const prs=byComp.get(comp.id)||[]; if(!prs.length)continue;
      if(rowIdx>17){overflow.push(comp); continue;}
      const labelField=signOffFieldNames(rowIdx,1).label;
      if(labelField)set(labelField,(compLabel(comp)+" "+(comp.title||"")).trim());
      for(const pr of prs){
        const actIdx=Math.max(1,Math.min(3,Number(pr.act.n)||1));
        const fn=signOffFieldNames(rowIdx,actIdx);
        const dateStr=String(pr.sel.signedAt||todayISO()).slice(0,10);
        set(fn.date,dateStr);
        const blobId=pr.sel.blobId||(pr.act.assessorSig&&pr.act.assessorSig.blobId);
        if(blobId)await drawSigAtField(pdf,form,fn.sig,blobId,filled);
        // All criteria covered for this competence in this activity?
        const critIds=pr.sel.criteriaIds&&pr.sel.criteriaIds.length?pr.sel.criteriaIds:plannedCritForComp(p,pr.act,comp).map(k=>k.id);
        const allSigned=critIds.length&&critIds.every(cid=>cov(p,cid,pr.act.id).status==="Signed");
        set(signOffFieldNames(rowIdx,1).all,allSigned?"Yes":"No");
        if((pr.act.ukq||[]).some(u=>u.q||u.a))set(signOffFieldNames(rowIdx,1).know,"Yes");
      }
    }
    if(pairs.length||overflow.length){
      const page=pdf.addPage(); const {height}=page.getSize(); let y=height-40;
      const line=(t,size)=>{const str=String(t); for(let i=0;i<str.length;i+=95){page.drawText(str.slice(i,i+95),{x:40,y,size:size||9}); y-=13;}};
      line("Assessor sign-off — signed competencies (appended by MTCS Tracker Beta v"+APP_VERSION+")",11);
      line("Candidate: "+cand+"  Route: "+p.routeLabel+"  Date: "+todayISO(),9); y-=6;
      pairs.forEach(pr=>{line((compLabel(pr.comp)+" "+(pr.comp.title||"")).trim()+" — Activity "+pr.act.n+" — signed by "+String(pr.sel.assessorName||assessor||"Assessor")+" on "+String(pr.sel.signedAt||"").slice(0,10)+" — criteria: "+((pr.sel.criteriaIds||[]).join(", ")||"—"),8.5);});
      overflow.forEach(comp=>line((compLabel(comp)+" "+(comp.title||"")).trim()+" — signed (no row left on the form; listed here only)",8.5));
      y-=6; line(SIG_NOTE,8.5);
      appended.push("Assessor sign-off table: per-competence Signature/Date fields filled for signed competencies"+(overflow.length?(", "+overflow.length+" competence(s) listed on the appended sheet only (form rows full)"):"")+", signed-competencies sheet appended for checking.");
    }
  }
  // signatures: only when explicitly signed
  let candPlaced=false, assPlaced=false;
  const includeCand=!!(a&&a.candidateSignedAt&&S.profile.signatureBlobId);
  const assActForSig=/Assessor Sign-Off/.test(kind)?(p.activities.find(x=>x.assessorSig)||a):a;
  const includeAss=!!(assActForSig&&assActForSig.assessorSig&&assActForSig.assessorSig.blobId);
  if(includeCand)candPlaced=await tryPlaceSig(pdf,form,S.profile.signatureBlobId,"candidate",cand,todayISO(),filled);
  if(includeAss)assPlaced=await tryPlaceSig(pdf,form,assActForSig.assessorSig.blobId,"assessor",assessor,todayISO(),filled);
  const needCriteriaSheet=/Assessment Plan|Competence/i.test(kind);
  if(needCriteriaSheet|| (includeCand&&!candPlaced) || (includeAss&&!assPlaced)){
    const page=pdf.addPage(); const {height}=page.getSize(); let y=height-40;
    const line=(t,size)=>{const str=String(t); const chunks=[]; for(let i=0;i<str.length;i+=95)chunks.push(str.slice(i,i+95)); chunks.forEach(c=>{if(y<50){} page.drawText(c,{x:40,y,size:size||9}); y-=13;});};
    line("Criteria covered — Activity "+(a?a.n:"")+" (appended by MTCS Tracker Beta v"+APP_VERSION+")",11);
    line("Candidate: "+cand+"  Route: "+p.routeLabel+"  Date: "+todayISO(),9);
    if(a)line("Activity: "+(a.title||"")+"  Dates: "+(a.dates||"")+"  Where: "+(a.where||""),9);
    y-=6;
    crits.forEach(k=>{const cv=a?cov(p,k.id,a.id):{status:"",code:""}; line(k.id+" ["+(cv.status||"")+(cv.code?" / "+cv.code:"")+"] "+k.text,8.5);});
    y-=6; line(SIG_NOTE,8.5);
    const embedSig=async(blobId,label,name,placed)=>{
      if(placed)return; try{const b=await blobGet(blobId); if(!b)return; const png=await pdf.embedPng(await b.arrayBuffer()); const w=Math.min(260,png.width, page.getSize().width-80); const h=w*(png.height/png.width); y-=h+18; page.drawText(label+": "+name+"  "+todayISO(),{x:40,y:y+h+4,size:9}); page.drawImage(png,{x:40,y,width:w,height:Math.min(h,120)}); appended.push(label+" image on appended sheet.");}catch(e){warn.push(label+" sig append: "+e.message);}
    };
    if(includeCand)await embedSig(S.profile.signatureBlobId,"Candidate signature",cand,candPlaced);
    if(includeAss&&assActForSig)await embedSig(assActForSig.assessorSig.blobId,"Assessor signature",assessor,assPlaced);
    if(needCriteriaSheet)appended.push("Criteria covered — Activity "+(a?a.n:"")+" sheet with full criterion wording (form field holds codes; full text appended for readability).");
  }
  try{if(form)form.updateFieldAppearances();}catch(_){}
  return {blob:new Blob([await pdf.save()],{type:"application/pdf"}),filled,appended,warnings:warn};
}
async function buildSubmissionPack(p,scopeActId){
  const sum=buildSubmissionSummary(p,scopeActId);
  const zip=new JSZip(); const root=sum.root; const fillLog=[]; const manifestRows=[];
  const used=new Set();
  // forms
  for(const entry of sum.forms){
    try{
      const r=await fillFormForSubmission(entry,p);
      const a=entry.act; const folder=root+"/Forms/"+(a?("Activity-"+a.n):"Portfolio");
      const fname=(a?("A"+a.n+"_"):"")+safeName(entry.label||entry.kind)+"_"+safeName(entry.tpl.fileName);
      zip.file(folder+"/"+fname,r.blob);
      fillLog.push(entry.tpl.fileName+" (Activity "+(a?a.n:"-")+", "+entry.kind+"): FILLED fields ["+r.filled.join("; ")+"]"+(r.appended.length?" APPENDED ["+r.appended.join("; ")+"]":"")+(r.warnings.length?" WARNINGS ["+r.warnings.join("; ")+"]":""));
      manifestRows.push({path:folder+"/"+fname,activity:a?("Activity "+a.n):"Portfolio",criteria:a?planCritOf(p,a).map(k=>k.id).join(" "):"",evidenceCode:"form",status:entry.kind});
    }catch(e){fillLog.push(entry.tpl.fileName+": FAILED to fill ("+e.message+") — blank not included; re-import the forms pack.");}
  }
  // evidence
  for(const {e,a,path,statuses} of sum.evEntries){
    const blob=await blobGet(e.blobId); if(!blob){fillLog.push("Evidence missing blob: "+e.fileName); continue;}
    const full=root+"/"+path; zip.file(full,blob);
    manifestRows.push({path:full,activity:a?("Activity "+a.n):"Unassigned",criteria:(e.criteria||[]).join(" "),evidenceCode:statuses||"UNMAPPED",status:e.redact?"check client data":""});
  }
  /* v0.2.8: no index/manifest files in the pack — warnings stay in the app preview. */
  return {zip,sum,root};
}

async function fillTemplate(tplId){const t=S.templates.find(x=>x.id===tplId),p=active();if(!t)return;const blob=await blobGet(t.blobId);if(!blob){toast("Template missing from this browser.");return;}
const sel=document.getElementById("fill-act"),a=p&&sel?actOf(p,sel.value):null;
try{const pdf=await PDFLib.PDFDocument.load(await blob.arrayBuffer()),form=pdf.getForm();const set=(n,v)=>{if(!v)return;try{form.getTextField(n).setText(String(v));}catch(_){}};
set("Candidate Name",p?p.name:"");set("Candidate name",p?p.name:"");set("Date",todayISO());set("Date_2",todayISO());
if(a){set("Activity Number 12 or 3",a.n);set("Work activity to be assessed",a.summary||a.title);set("Which performance criteria in the competences do you intend to assess",CRITS.filter(k=>cov(p,k.id,a.id).status!=="Gap").map(k=>k.id).join(", "));set("What date or dates will the assessment take place",a.dates);set("Where will the assessment take place eg name of vessel installation system workshop etc",a.where);set("Witness name if applicable",a.witness);set("Assessor name",a.assessorName);set("Please specify the reasons for your decision",a.feedbackText);set("Candidates comments",a.candidateComments);}
let sigNote="";
if(ui.fillSig&&S.profile.signatureBlobId){try{const sigBlob=await blobGet(S.profile.signatureBlobId);if(sigBlob){const png=await pdf.embedPng(await sigBlob.arrayBuffer());let placed=false;
try{const fields=form.getFields();const sf=fields.find(f=>/signature/i.test(f.getName()));if(sf&&sf.acroField&&sf.acroField.getWidgets().length){const w=sf.acroField.getWidgets()[0];const rect=w.getRectangle();const page=pdf.getPages().find(pg=>pg.ref===w.P());if(page&&rect&&rect.width>10){page.drawImage(png,{x:rect.x,y:rect.y,width:rect.width,height:Math.min(rect.height,rect.width*(png.height/png.width))});placed=true;}}}catch(_){}
if(!placed){const page=pdf.addPage();const {width,height}=page.getSize();page.drawText("Signature image added from Profile — not a legal e-signature service; MTCS ink requirements still apply",{x:40,y:height-50,size:9});page.drawImage(png,{x:40,y:height-220,width:Math.min(300,png.width),height:Math.min(150,(Math.min(300,png.width))*(png.height/png.width))});page.drawText((p?p.name:"")+" · "+todayISO(),{x:40,y:height-245,size:10});sigNote=" Signature appended on an added page.";}
else sigNote=" Signature added at the form signature field.";}}catch(se){sigNote=" Signature could not be added ("+se.message+").";}}
downloadBlob(new Blob([await pdf.save()],{type:"application/pdf"}),t.fileName.replace(/\.pdf$/i,"")+"_FILLED.pdf");toast("Filled copy downloaded. Stored blank unchanged."+sigNote);}
catch(e){downloadBlob(blob,t.fileName);toast("Couldn't fill this PDF ("+e.message+") — blank downloaded instead.");}ui.fillTpl=null;render();}
function render(){refreshCriteria();const{parts,params}=parse(),page=parts[0]||"";const cp=params.get("c");
if(cp){const isNewOpen=ui.drawerCrit!==cp&&!ui.critNavLocked;if(isNewOpen){const p0=active();let list=null;ui.drawerFromList=(page==="criteria"||page==="matrix"||page==="activity"||page==="work");if((page==="criteria"||page==="matrix")&&p0){list=visibleCritIds(p0);if(!list.includes(cp))list=null;}ui.critNavList=list&&list.length?list:CRITS.map(k=>k.id);ui.critNavLocked=true;}ui.drawerCrit=cp;}
else if(page==="criteria"||page==="matrix"||page==="activity"||page==="work"||page==="dashboard"){ui.drawerCrit=null;ui.critNavLocked=false;ui.critNavList=[];}
let html="";try{
if(page==="")html=viewLanding();else if(page==="dashboard")html=viewDashboard();else if(page==="work")html=viewActivity(null,params);else if(page==="activities")html=viewActivity(null,params);else if(page==="activity")html=viewActivity(parts[1],params);else if(page==="criteria"||page==="matrix")html=viewMatrix(params);else if(page==="evidence")html=viewEvidence();else if(page==="forms")html=viewForms();else if(page==="backup")html=viewBackup();else if(page==="settings")html=viewSettings();else if(page==="more")html=viewMore();else if(page==="profile")html=viewProfile();else if(page==="export")html=viewExport();else if(page==="shared")html=viewShared(parts[1]);else if(page==="assessor")html=viewAssessor(parts[1]);else html=viewLanding();}
catch(e){console.error(e);html=`<div class="landing"><div class="card"><h1>Something went wrong</h1><p class="small">${esc(e.message)}</p><a class="btn" href="#/">Back</a></div></div>`;}
const _pbm=document.querySelector('[data-testid="plan-builder"]');const _pbs=_pbm?_pbm.scrollTop:0;const _pbl=document.querySelector(".plan-list");document.getElementById("app").innerHTML=html;initSigPad();if(ui.modal==="plan-builder"){const nm=document.querySelector('[data-testid="plan-builder"]');if(nm)nm.scrollTop=_pbs;document.querySelectorAll("[data-plan-comp]").forEach(cb=>{const comp=COMPS.find(c=>c.id===cb.dataset.planComp);if(comp&&ui.planBuilder){const n=comp.criteria.filter(k=>ui.planBuilder.draft.has(k.id)).length;cb.indeterminate=n>0&&n<comp.criteria.length;}});}if(document.getElementById("splash")&&!window.__splashStarted){window.__splashStarted=true;setTimeout(runSplash,30);}}
function refreshBulkBar(){const old=document.querySelector(".bulkbar");const html=bulkBarHTML();if(old){if(html){const tmp=document.createElement("div");tmp.innerHTML=html;old.replaceWith(tmp.firstElementChild);}else old.remove();}else if(html){document.body.insertAdjacentHTML("beforeend",html);}}
function applyBulk(confirmed){const p=active();if(!p)return;const ids=[...ui.selCrit];if(!ids.length)return;const actId=ui.bulkAct||(ui.critScope!=="all"?ui.critScope:workActId(p));if(ui.bulkStatus==="Signed"&&!confirmed){ui.modal="bulk-signed";render();return;}
const prev={};ids.forEach(id=>{prev[id]=p.criteria[id]&&p.criteria[id][String(actId)]?{...p.criteria[id][String(actId)]}:null;});
pushUndo("bulk",()=>{ids.forEach(id=>{if(prev[id]){p.criteria[id][String(actId)]=prev[id];}else if(p.criteria[id]){delete p.criteria[id][String(actId)];}});save();});
ids.forEach(id=>setCov(p,id,actId,{status:ui.bulkStatus,code:ui.bulkCode}));S.settings.lastUsedCode=ui.bulkCode;ui.selCrit.clear();ui.selectMode=false;ui.modal=null;save();toast(`Applied ${ui.bulkStatus}/${ui.bulkCode} to ${ids.length} criteria in Activity ${(actOf(p,actId)||{}).n}.`,true);render();}
document.addEventListener("toggle",e=>{const d=e.target;if(d&&d.dataset&&d.dataset.compOpen){if(d.open)ui.openComps.add(d.dataset.compOpen);else ui.openComps.delete(d.dataset.compOpen);}},true);
document.addEventListener("change",e=>{const el=e.target.closest("[data-qlink-crit]");if(!el)return;const p=active();if(!p)return;const crit=el.dataset.qlinkCrit,a=actOf(p,el.dataset.qlinkAct);if(!a||el.value==="")return;a.ukq=a.ukq||[];let i;if(el.value==="new"){const t=prompt("New knowledge question for Activity "+a.n+" (covers "+crit+"):","");if(!t||!t.trim()){render();return;}let blank=a.ukq.findIndex(u=>!String(u.q||"").trim());if(blank<0){a.ukq.push({q:"",a:"",ok:""});blank=a.ukq.length-1;}i=blank;var newText=t.trim();}else i=Number(el.value);const u=a.ukq[i];if(!u)return;const prevCrits=(u.crits||[]).slice(),prevQ=u.q,wasNew=el.value==="new";if(wasNew)u.q=newText;u.crits=[...new Set([...(u.crits||[]),crit])];pushUndo("qlink",()=>{u.crits=prevCrits;if(wasNew)u.q=prevQ;save();});p.updatedAt=new Date().toISOString();save();toast(crit+" linked to Activity "+a.n+" Q"+(i+1),true);});
document.addEventListener("click",e=>{const p=active();if(!p)return;
const st=e.target.closest("[data-chip-status]");if(st&&ui.drawerCrit){const actId=drawerActId(p),crit=ui.drawerCrit;if(st.dataset.chipStatus==="Signed"){ui.pendingSigned={crit,act:actId};refreshDrawer();return;}const prev={...cov(p,crit,actId)};pushUndo("crit",()=>{p.criteria[crit][String(actId)]=prev;save();});setCov(p,crit,actId,{status:st.dataset.chipStatus});ui.pendingSigned=null;refreshDrawer();return;}
const cd=e.target.closest("[data-chip-code]");if(cd&&ui.drawerCrit){const actId=drawerActId(p),crit=ui.drawerCrit,code=cd.dataset.chipCode,prev={...cov(p,crit,actId)};pushUndo("crit",()=>{p.criteria[crit][String(actId)]=prev;save();});setCov(p,crit,actId,{code});S.settings.lastUsedCode=code;save();const cur=cov(p,crit,actId);if(ui.drawerFromList&&cur.status!=="Signed"){const{list,idx}=critNavInfo();if(idx>=0&&idx<list.length-1){navigateCrit(1);toast("Saved — moved to next criterion.",true);return;}}refreshDrawer();return;}
const da=e.target.closest("[data-drawer-act]");if(da){ui.drawerAct=da.dataset.drawerAct;ui.pendingSigned=null;refreshDrawer();return;}
const bs=e.target.closest("[data-bulk-status]");if(bs){ui.bulkStatus=bs.dataset.bulkStatus;document.querySelectorAll("[data-bulk-status]").forEach(b=>b.classList.toggle("on",b===bs));refreshBulkBar();return;}
const bc=e.target.closest("[data-bulk-code]");if(bc){ui.bulkCode=bc.dataset.bulkCode;document.querySelectorAll("[data-bulk-code]").forEach(b=>b.classList.toggle("on",b===bc));refreshBulkBar();return;}
const et=e.target.closest("[data-ev-type]");if(et){e.preventDefault();const crit=et.dataset.crit,code=et.dataset.evType;const acts=ui.critScope!=="all"?[String(ui.critScope)]:p.activities.map(a=>String(a.id));const targets=acts.filter(id=>{const st=cov(p,crit,id).status;return code?(st==="Planned"||st==="Evidenced"):st==="Evidenced";});if(!targets.length){toast("Nothing planned for "+crit+" in this scope.");return;}const prev={};targets.forEach(id=>prev[id]=p.criteria[crit]&&p.criteria[crit][id]?{...p.criteria[crit][id]}:undefined);pushUndo("ev-type",()=>{targets.forEach(id=>{if(prev[id])p.criteria[crit][id]=prev[id];else if(p.criteria[crit])delete p.criteria[crit][id];});save();});targets.forEach(id=>setCov(p,crit,id,code?{status:"Evidenced",code}:{status:"Planned",code:""}));if(code)S.settings.lastUsedCode=code;save();const fl=code&&covFlag(p,crit,targets[0]);toast(code?(crit+" → Evidenced ("+CODE_LABEL[code]+")"+(fl?" · "+FLAG_LABEL[fl].toLowerCase():"")):(crit+" type cleared → Planned"),true);return;}
const sc=e.target.closest("[data-crit-scope]");if(sc){ui.critScope=sc.dataset.critScope;ui.bulkAct=sc.dataset.critScope!=="all"?sc.dataset.critScope:ui.bulkAct;render();return;}
});
document.addEventListener("click",async e=>{const el=e.target.closest("[data-action]");if(!el)return;const a=el.dataset.action,p=active();
if(a==="goto")location.hash=el.dataset.href;
else if(a==="pick-role"){if(ui.role===el.dataset.role){ui.role=null;}else{ui.role=el.dataset.role;const r=ROLES.find(x=>x.key===ui.role);if(r&&!r.grades.includes(ui.grade))ui.grade=r.grades[0];}render();}
else if(a==="pick-grade"){ui.grade=el.dataset.grade;render();}
else if(a==="open-portfolio"){S.settings.activeId=el.dataset.id;save();location.hash="#/dashboard";render();}
else if(a==="delete-portfolio"){if(confirm("Delete this portfolio from this browser? Export a backup first if needed.")){const pf=S.portfolios.find(x=>x.id===el.dataset.id);if(pf)for(const ev of pf.evidence)await blobDel(ev.blobId);S.portfolios=S.portfolios.filter(x=>x.id!==el.dataset.id);if(S.settings.activeId===el.dataset.id)S.settings.activeId=null;save();render();}}
else if(a==="install"){if(deferredInstall){deferredInstall.prompt();deferredInstall.userChoice.then(()=>{deferredInstall=null;});}else{ui.modal="install";render();}}
else if(a==="install-prompt"){if(deferredInstall){deferredInstall.prompt();deferredInstall=null;}ui.modal=null;render();}
else if(a==="close-modal"){ui.preview=null;ui.modal=null;ui.fillTpl=null;ui.pdfPreview=null;ui.assessorFlow=null;render();}
else if(a==="close-drawer"){ui.drawerCrit=null;ui.drawerFromList=false;ui.critNavLocked=false;ui.critNavList=[];history.replaceState(null,"",location.pathname+location.search+here());render();}
else if(a==="open-crit"){ui.drawerCrit=el.dataset.crit;ui.drawerAct=null;ui.drawerFromList=false;ui.critNavList=CRITS.map(k=>k.id);ui.critNavLocked=true;render();}
else if(a==="crit-prev"){navigateCrit(-1);}
else if(a==="crit-next"){navigateCrit(1);}
else if(a==="mfilter"){ui.mState=el.dataset.f;render();}
else if(a==="add-activity"&&p){const n=Math.max(0,...p.activities.map(x=>x.n))+1;p.activities.push(newActivity(n));save();render();}
else if(a==="add-ukq"&&p){actOf(p,el.dataset.act).ukq.push({q:"",a:"",ok:""});save();render();}
else if(a==="snapshot"&&p){const act=actOf(p,el.dataset.act);act.versions=act.versions||[];act.versions.push({version:act.version,at:new Date().toISOString(),label:"Manual snapshot",snapshot:JSON.parse(JSON.stringify({activity:act,criteria:p.criteria}))});save();toast("Snapshot saved in Version history.");render();}
else if(a==="rollback"&&p){const act=actOf(p,el.dataset.act),v=(act.versions||[]).find(x=>x.version===Number(el.dataset.ver));if(v&&confirm("Restore v"+v.version+"? Current version kept as a new snapshot.")){act.versions.push({version:act.version,at:new Date().toISOString(),label:"Before rollback",snapshot:JSON.parse(JSON.stringify({activity:act,criteria:p.criteria}))});const keep=act.versions;Object.assign(act,v.snapshot.activity,{versions:keep});p.criteria=v.snapshot.criteria;save();toast("Rolled back to v"+v.version+".");render();}}
else if(a==="preview-ev"&&p){const ev=p.evidence.find(x=>x.id===el.dataset.id),blob=ev&&await blobGet(ev.blobId);if(!blob){toast("File missing.");return;}ui.preview={title:ev.title,fileName:ev.fileName,mime:ev.mime,url:URL.createObjectURL(blob),text:(ev.mime.startsWith("text/")||/\.txt$/i.test(ev.fileName))?await blob.text():null};render();}
else if(a==="download-ev"&&p){const ev=p.evidence.find(x=>x.id===el.dataset.id),blob=ev&&await blobGet(ev.blobId);if(blob)downloadBlob(blob,ev.fileName);}
else if(a==="delete-ev"&&p){const ev=p.evidence.find(x=>x.id===el.dataset.id);if(ev&&confirm("Delete '"+ev.title+"'?")){await blobDel(ev.blobId);p.evidence=p.evidence.filter(x=>x.id!==ev.id);save();render();}}
else if(a==="export-backup"){await exportBackup();render();}
else if(a==="export-activity"&&p){const act=actOf(p,el.dataset.act),{zip}=await buildActivityZip(p,act,"activity-export");act.exportSeq++;save();await exportZip(zip,"Activity"+act.n+"_for_assessor.zip");toast("Activity zip downloaded — send it to your assessor.");render();}
else if(a==="plan-builder-open"&&p){const act=actOf(p,el.dataset.act);if(act){ui.planBuilder={actId:act.id,draft:new Set(act.planCritIds||[])};ui.planSearch="";ui.modal="plan-builder";render();}}
else if(a==="plan-builder-cancel"){ui.planBuilder=null;ui.modal=null;render();}
else if(a==="plan-builder-clear"){if(ui.planBuilder){ui.planBuilder.draft.clear();updatePlanDom();}}
else if(a==="plan-builder-apply"&&p&&ui.planBuilder){const act=actOf(p,ui.planBuilder.actId);if(act){const before=new Set(act.planCritIds||[]);act.planCritIds=[...ui.planBuilder.draft];
act.planCritIds.forEach(cid=>{if(!before.has(cid)&&cov(p,cid,act.id).status==="Gap"&&!(p.criteria[cid]&&p.criteria[cid][act.id]))setCov(p,cid,act.id,{status:"Planned",code:""});});
[...before].forEach(cid=>{if(!act.planCritIds.includes(cid)&&cov(p,cid,act.id).status==="Planned"){if(p.criteria[cid])delete p.criteria[cid][act.id];}});
ui.planBuilder=null;ui.modal=null;save();toast("Plan updated: "+act.planCritIds.length+" criteria in Activity "+act.n+".");render();}}
else if(a==="pack-download"){const pf=active();if(pf)pf.formsPromptSeen=true;ui.formsSetupFor=null;const packs=knownDownloadPacks(pf);if(!packs){ui.modal="pack-unavailable";save();render();}else{ui.deferGenReview=true;for(const pk of packs)await getPack(pk);ui.deferGenReview=false;maybeShowGenReview();render();}}
else if(a==="plan-row-toggle"){if(!ui.planExpanded)ui.planExpanded=new Set();const c=el.dataset.comp;if(ui.planExpanded.has(c))ui.planExpanded.delete(c);else ui.planExpanded.add(c);render();}
else if(a==="gen-review-cancel"){ui.genReview=null;ui.pendingParse=[];toast("Criteria not built yet — your forms are stored; build from Forms any time.");render();}
else if(a==="gen-add-crit"){const gr=ui.genReview;if(gr){let idx=0,done=false;gr.units.forEach(u=>u.competences.forEach(c=>{if(idx++===Number(el.dataset.comp)&&!done){const last=c.criteria[c.criteria.length-1];const letter=String.fromCharCode(97+c.criteria.length);c.criteria.push({id:c.id+letter,letter,text:""});done=true;}}));render();}}
else if(a==="gen-review-confirm"){const gr=ui.genReview;if(gr&&gr.mismatch&&!(document.getElementById("gen-mismatch-ack")||{}).checked){toast("Tick \u2018Build anyway\u2019 to use files that don\u2019t match this portfolio, or Cancel.");return;}if(gr){let idx=0;gr.units.forEach(u=>u.competences.forEach(c=>{const my=idx++;const codeEl=document.querySelector(`[data-gen-code="${my}"]`),titleEl=document.querySelector(`[data-gen-title="${my}"]`);if(codeEl)c.id=codeEl.value.trim()||c.id;if(titleEl)c.title=titleEl.value.trim();c.number=parseInt(String(c.id).replace(/\D/g,""),10)||c.number;c.criteria=c.criteria.map((k,ki)=>{const idEl=document.querySelector(`[data-gen-crit-id="${my}:${ki}"]`),txEl=document.querySelector(`[data-gen-crit-text="${my}:${ki}"]`);return{id:idEl?idEl.value.trim()||k.id:k.id,letter:k.letter,text:txEl?txEl.value.trim():k.text};}).filter(k=>k.text||k.id);}));
const gp={id:uid("gp"),label:gr.label,createdAt:new Date().toISOString(),sourcePackKeys:gr.packKeys,units:gr.units.map(u=>({id:u.id,name:u.name,short:u.short,competences:u.competences.map(c=>({id:c.id,number:c.number,title:c.title,fileName:c.fileName,criteria:c.criteria}))}))};
const pf=active();if(pf){const old=pf.genPackId;pf.genPackId=gp.id;S.genPacks.push(gp);if(old&&!S.portfolios.some(x=>x.id!==pf.id&&x.genPackId===old))S.genPacks=S.genPacks.filter(g=>g.id!==old);}else S.genPacks.push(gp);
ui.genReview=null;save();refreshCriteria();toast("Criteria built from your files: "+gp.units.reduce((n,u)=>n+u.competences.reduce((m,c)=>m+c.criteria.length,0),0)+" criteria ready.");location.hash="#/dashboard";render();}}
else if(a==="build-pack-stored"){await buildPackFromStored();}
else if(a==="forms-setup-skip"){const pf=active();if(pf){pf.formsPromptSeen=true;save();}ui.formsSetupFor=null;render();}
else if(a==="forms-setup-both"){el.dataset.action="pack-download";const pf=active();if(pf)pf.formsPromptSeen=true;ui.formsSetupFor=null;const packs=knownDownloadPacks(pf);if(!packs){ui.modal="pack-unavailable";render();}else{ui.deferGenReview=true;for(const pk of packs)await getPack(pk);ui.deferGenReview=false;maybeShowGenReview();render();}}
else if(a==="forms-setup-pack"){const pf=active();if(pf){pf.formsPromptSeen=true;save();}ui.formsSetupFor=null;await getPack(el.dataset.pack);render();}
else if(a==="pack-progress-close"){ui.packProgress=null;render();}
else if(a==="delete-template"){await deleteTemplates(x=>x.id===el.dataset.id,"form");}
else if(a==="delete-pack"){await deleteTemplates(x=>x.packKey===el.dataset.pack,PACK_LABEL(el.dataset.pack));}
else if(a==="delete-all-templates"){await deleteTemplates(()=>true,"all packs");}
else if(a==="get-both"){const packs=knownDownloadPacks(p);if(!packs){ui.modal="pack-unavailable";render();}else if(WORKER_BASE){ui.deferGenReview=true;for(const pk of packs)await getPack(pk);ui.deferGenReview=false;maybeShowGenReview();}else{toast("One-click fetch isn't live yet (free worker not deployed). Opening the MTCS pack — download the zips from MTCS, then Upload takes them.");const pg=MP[packs[0]]||{};if(pg.zip)window.open(pg.zip,"_blank","noopener");render();}}
else if(a==="get-pack"){await getPack(el.dataset.pack);}
else if(a==="open-template"){const t=S.templates.find(x=>x.id===el.dataset.id),blob=t&&await blobGet(t.blobId);if(blob)downloadBlob(blob,t.fileName);}
else if(a==="fill-template"){ui.fillTpl=S.templates.find(x=>x.id===el.dataset.id);ui.fillSig=false;render();}
else if(a==="do-fill"){await fillTemplate(ui.fillTpl.id);}
else if(a==="fill-esign"){ui.fillSig=!ui.fillSig;render();}
else if(a==="submission-preview-open"&&p){ui.subScope=el.dataset.act||null;await buildPdfPreview(ui.subScope,false);}
else if(a==="criteria-preview"&&p){ui.subScope=null;await buildPdfPreview(null,"criteria");}
else if(a==="work-preview"&&p){ui.subScope=el.dataset.act||null;await buildPdfPreview(ui.subScope,true);}
else if(a==="pdf-prev"&&ui.pdfPreview){ui.pdfPreview.idx=Math.max(0,ui.pdfPreview.idx-1);render();}
else if(a==="pdf-next"&&ui.pdfPreview){ui.pdfPreview.idx=Math.min(ui.pdfPreview.pages.length-1,ui.pdfPreview.idx+1);render();}
else if(a==="pdf-thumb"&&ui.pdfPreview){ui.pdfPreview.idx=Number(el.dataset.idx)||0;render();}
else if(a==="submission-export"&&p){const sc=el.dataset.act||null;const sum0=buildSubmissionSummary(p,sc);if(sum0.warnings.length){ui.subScope=sc;toast("Check the preview warnings before exporting.");await buildPdfPreview(sc,false);}else{ui.subScope=sc;const r=await buildSubmissionPack(p,sc);await exportZip(r.zip,"MTCS_Submission_"+safeName(p.name)+".zip");ui.modal=null;toast("Submission pack downloaded \u2014 send it to MTCS yourself; the app has not submitted anything.");render();}}
else if(a==="submission-export-do"&&p){if(ui.pdfPreview)ui.subScope=ui.pdfPreview.scopeActId;const sum1=buildSubmissionSummary(p,ui.subScope);if(sum1.warnings.length&&!(document.getElementById("sub-confirm")||{}).checked){toast("Tick \u2018I\u2019ve checked these warnings\u2019 first.");return;}const r=await buildSubmissionPack(p,ui.subScope);await exportZip(r.zip,"MTCS_Submission_"+safeName(p.name)+".zip");ui.modal=null;ui.pdfPreview=null;toast("Submission pack downloaded \u2014 send it to MTCS yourself; the app has not submitted anything.");render();}
else if(a==="candidate-sign"&&p){const act=actOf(p,el.dataset.act);if(act&&S.profile.signatureBlobId){act.candidateSignedAt=new Date().toISOString();act.sigAudit=act.sigAudit||[];act.sigAudit.push({who:"candidate",name:p.name,at:act.candidateSignedAt,source:"profile"});save();toast("You signed Activity "+act.n+" \u2014 your Profile signature will be applied to its paperwork on export.");render();}}
else if(a==="candidate-unsign"&&p){const act=actOf(p,el.dataset.act);if(act){act.candidateSignedAt=null;save();toast("Candidate signature removed from this activity.");render();}}
else if(a==="assessor-sign-open"&&p){ui.assessorSignAct=el.dataset.act;ui.assessorFlow={actId:el.dataset.act,step:1,mode:"select",selected:new Set()};ui.modal="assessor-sign";render();}
else if(a==="assessor-mode"&&ui.assessorFlow){ui.assessorFlow.mode=el.dataset.mode;render();}
else if(a==="assessor-to-pad"&&ui.assessorFlow){if(ui.assessorFlow.mode==="select"&&!ui.assessorFlow.selected.size){toast("Choose at least one competence to sign off, or choose \u2018Sign for all planned activities\u2019.");return;}ui.assessorFlow.step=2;render();}
else if(a==="assessor-back"&&ui.assessorFlow){ui.assessorFlow.step=1;render();}
else if(a==="assessor-sign-save"&&p){const c=document.getElementById("assessor-sig-pad");const nameEl=document.getElementById("assessor-sig-name");if(!c||!c.dataset.dirty){toast("Draw the assessor signature first, or upload an image.");return;}const blob=await new Promise(r=>c.toBlob(r,"image/png"));if(!blob){toast("Could not save that drawing.");return;}const bid=uid("asig");await blobSet(bid,blob);await applyAssessorSigning(p,bid,"drawn",nameEl?nameEl.value.trim():"");}
else if(a==="sig-replace"){ui.sigPadOpen=true;render();}
else if(a==="sig-cancel-pad"){ui.sigPadOpen=false;render();}
else if(a==="sig-clear"){if(confirm("Clear your saved signature from this device? Forms already downloaded keep theirs.")){const old=S.profile.signatureBlobId;S.profile.signatureBlobId=null;S.profile.signatureUpdatedAt=null;ui.sigUrl=null;ui.sigPadOpen=true;if(old&&!blobIsReferenced(old,null)){try{await blobDel(old);}catch(_){}}save();toast("Signature cleared.");render();}}
else if(a==="sig-save"){const c=document.getElementById("sig-pad");if(!c||!c.dataset.dirty){toast("Draw your signature first.");return;}const blob=await new Promise(r=>c.toBlob(r,"image/png"));if(!blob){toast("Could not save that drawing.");return;}const old=S.profile.signatureBlobId,newId=uid("sig");await blobSet(newId,blob);S.profile.signatureBlobId=newId;S.profile.signatureUpdatedAt=new Date().toISOString();if(old&&old!==newId){try{await blobDel(old);}catch(_){}}if(ui.sigUrl)URL.revokeObjectURL(ui.sigUrl);ui.sigUrl=URL.createObjectURL(blob);ui.sigPadOpen=false;save();toast("Signature saved on this device.");render();}
else if(a==="cancel-backup-import"){ui.pendingBackup=null;render();}
else if(a==="confirm-backup-import"){await applyBackup(ui.pendingBackup);}
else if(a==="cancel-return"){ui.pendingReturn=null;render();}
else if(a==="return-as-copy"){await applyReturn(true);}
else if(a==="apply-return"){await applyReturn(false);}
else if(a==="export-return"){const x=S.shared.find(s=>s.id===el.dataset.id);if(x){const fakeP={id:x.manifest.portfolioId,name:x.candidateName,routeLabel:x.manifest.route||"",evidence:x.evidence,criteria:{}};Object.entries(x.criteria).forEach(([cid,cv])=>{fakeP.criteria[cid]={[x.activity.id]:cv};});const{zip}=await buildActivityZip(fakeP,x.activity,"activity-return");await exportZip(zip,"Activity"+x.activity.n+"_reviewed_return.zip");toast("Reviewed zip downloaded — send it back to the candidate.");}}
else if(a==="download-shared-ev"){const x=S.shared.find(s=>s.id===el.dataset.shared),ev=x&&x.evidence.find(v=>v.id===el.dataset.id),blob=ev&&ev.blobId&&await blobGet(ev.blobId);if(blob)downloadBlob(blob,ev.fileName);}
else if(a==="delete-shared"){const x=S.shared.find(s=>s.id===el.dataset.id);if(x&&confirm("Delete this imported copy?")){for(const b of x.evidenceBlobs||[])await blobDel(b);S.shared=S.shared.filter(s=>s.id!==x.id);save();location.hash="#/";render();}}
else if(a==="undo-last"){const u=undoStack.pop();ui.toast="";ui.toastUndo=false;if(u){u.fn();toast("Undone.");}render();}
else if(a==="confirm-signed"&&p&&ui.pendingSigned){const{crit,act}=ui.pendingSigned;const prev={...cov(p,crit,act)};pushUndo("crit",()=>{p.criteria[crit][String(act)]=prev;save();});setCov(p,crit,act,{status:"Signed"});ui.pendingSigned=null;save();refreshDrawer();}
else if(a==="cancel-signed"){ui.pendingSigned=null;refreshDrawer();}
else if(a==="ev-seg"){ui.evSeg=el.dataset.seg;render();}
else if(a==="quick-capture"){const pp=active();if(!pp){location.hash="#/";toast("Create or open a portfolio first.");render();return;}ui.captureAct=workActId(pp);ui.modal="capture";render();}
else if(a==="toggle-select"){ui.selectMode=!ui.selectMode;if(!ui.selectMode)ui.selCrit.clear();if(ui.bulkCode==="O"&&S.settings.lastUsedCode)ui.bulkCode=S.settings.lastUsedCode;render();}
else if(a==="bulk-clear"){ui.selCrit.clear();refreshBulkBar();document.querySelectorAll("[data-sel-crit]").forEach(c=>c.checked=false);}
else if(a==="bulk-apply"){applyBulk(false);}
else if(a==="bulk-signed-confirm"){applyBulk(true);}
else if(a==="plan-edit"){ui.planOpen=true;render();}
else if(a==="plan-done"){ui.planOpen=false;render();}
else if(a==="confirm-copied"&&p){const act=actOf(p,el.dataset.act);act.copiedUnconfirmed=false;save();toast("Plan checked.");render();}
else if(a==="copy-plan"&&p){const from=actOf(p,el.dataset.from),act=actOf(p,el.dataset.act);if(from&&act){act.summary=from.summary;act.where=from.where;act.witness=from.witness;act.assessorName=from.assessorName;act.planText=from.planText;Object.entries(p.criteria).forEach(([cid,by])=>{const src=by[from.id];if(src){p.criteria[cid][act.id]={status:"Planned",code:src.code};}});act.planCritIds=[...(from.planCritIds||[])];act.copiedFrom=from.n;act.copiedUnconfirmed=true;ui.planOpen=true;save();toast("Plan copied from Activity "+from.n+" — check dates, place and people.",false);render();}}
else if(a==="send-preflight"&&p){ui.preflightAct=el.dataset.act;ui.modal="preflight";render();}
else if(a==="preflight-cancel"){ui.modal=null;ui.preflightAct=null;render();}
else if(a==="preflight-continue"&&p){const act=actOf(p,ui.preflightAct);ui.modal=null;const stale=!S.settings.lastBackupAt||Date.now()-new Date(S.settings.lastBackupAt).getTime()>7*864e5;if(stale){await exportBackup();}if(act){const{zip}=await buildActivityZip(p,act,"activity-export");act.exportSeq++;save();await exportZip(zip,"Activity"+act.n+"_for_assessor.zip");toast(stale?"Backup downloaded first, then activity zip — send the activity zip to your assessor.":"Activity zip downloaded — send it to your assessor.");}ui.preflightAct=null;render();}
else if(a==="ev-save"&&p){const e=p.evidence.find(x=>x.id===el.dataset.id);if(e){e.title=document.getElementById("ev-title").value;e.date=document.getElementById("ev-date").value;e.activityId=document.getElementById("ev-activity").value;e.tags=String(document.getElementById("ev-tags").value||"").split(",").map(s=>s.trim()).filter(Boolean);e.redact=document.getElementById("ev-redact").checked;e.criteria=[...document.querySelectorAll("[data-picker-crit]:checked")].map(c=>c.value);save();toast("Evidence saved — links: "+(e.criteria.join(", ")||"none")+".");}ui.evEditId=null;ui.modal=null;render();}
else if(a==="ev-edit"&&p){ui.evEditId=el.dataset.id;ui.pickerFor=el.dataset.id;ui.modal="ev-edit";render();}
else if(a==="ev-edit-close"){ui.evEditId=null;ui.modal=null;render();}
else if(a==="picker-toggle"){const ev=p.evidence.find(x=>x.id===ui.pickerFor);/* handled in change listener for checkboxes */}
else if(a==="accept-suggest"&&p){const ev=p.evidence.find(x=>x.id===el.dataset.id);if(ev&&critById(el.dataset.crit)){ev.criteria=[...new Set([...ev.criteria,el.dataset.crit])];save();toast("Linked "+el.dataset.crit+" — check it in the editor before relying on it.");render();}}
else if(a==="capture-note"&&p){const blob=new Blob(["Quick note captured in MTCS Tracker on "+new Date().toISOString()],{type:"text/plain"});const blobId=uid("blob");await blobSet(blobId,blob);const ev={id:uid("ev"),blobId,title:"Quick note",fileName:"quick-note.txt",mime:"text/plain",size:blob.size,date:todayISO(),tags:[],criteria:[],activityId:ui.captureAct||workActId(p),redact:false,createdAt:new Date().toISOString()};p.evidence.push(ev);ui.captureBatch=[ev.id];ui.captureLinks={[ev.id]:[]};ui.modal="link-sheet";save();render();}
else if(a==="batch-confirm"&&p){const actId=document.getElementById("batch-act")?document.getElementById("batch-act").value:workActId(p);const tags=String((document.getElementById("batch-tags")||{}).value||"").split(",").map(s=>s.trim()).filter(Boolean);let linked=0;ui.captureBatch.forEach(evid=>{const ev=p.evidence.find(x=>x.id===evid);if(!ev)return;ev.activityId=actId;if(tags.length)ev.tags=[...new Set([...ev.tags,...tags])];const crits=ui.captureLinks[evid]||[];crits.forEach(cid=>{if(!ev.criteria.includes(cid))ev.criteria.push(cid);setCov(p,cid,actId,{status:ui.batchStatus,code:ui.batchCode});linked++;});});S.settings.lastUsedCode=ui.batchCode;ui.captureBatch=[];ui.captureLinks={};ui.modal=null;save();toast(linked?("Linked "+linked+" criterion link(s). Files are saved on this device."):"Files saved on this device — link them from Evidence inbox when ready.");render();}
else if(a==="batch-skip"){ui.captureBatch=[];ui.captureLinks={};ui.modal=null;toast("Files saved on this device — find them in Evidence inbox.");render();}
else if(a==="sign-lock"&&p){const act=actOf(p,el.dataset.act);CRITS.forEach(k=>{if(cov(p,k.id,act.id).status==="Evidenced")setCov(p,k.id,act.id,{status:"Signed"});});act.status="Signed";act.signedOn=todayISO();save();toast("Signed and locked (evidenced criteria marked Signed).");render();}
});
document.addEventListener("change",async e=>{const el=e.target,p=active();
if(el.matches("[data-upload]")){const files=[...el.files];if(!files.length)return;try{
if(el.dataset.upload==="evidence"&&p){const added=await addEvidenceFiles(p,files,el.dataset.act||"");ui.captureBatch=added.map(x=>x.id);ui.captureAct=el.dataset.act||workActId(p);ui.captureLinks={};added.forEach(x=>ui.captureLinks[x.id]=suggestCriteria(x.fileName));ui.modal="link-sheet";}
else if((el.dataset.upload==="capture-file"||el.dataset.upload==="capture-photo")&&p){const added=await addEvidenceFiles(p,files,ui.captureAct||workActId(p));ui.captureBatch=added.map(x=>x.id);ui.captureLinks={};added.forEach(x=>ui.captureLinks[x.id]=suggestCriteria(x.fileName));ui.modal="link-sheet";}
else if(el.dataset.upload==="evidence-for-crit"&&p){const added=await addEvidenceFiles(p,files,el.dataset.act||"");added.forEach(x=>{x.criteria=[...new Set([...x.criteria,el.dataset.crit])];});save();toast(added.length+" file(s) saved on device and linked to "+el.dataset.crit+".");}
else if(el.dataset.upload==="pack"){for(const f of files)await importPackZip(f,el.dataset.packKey||undefined);maybeShowGenReview();}
else if(el.dataset.upload==="assessor-signature"&&p){const f=files[0];const bmp=await createImageBitmap(f);const scale=Math.min(1,1200/Math.max(bmp.width,bmp.height));const cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(bmp.width*scale));cv.height=Math.max(1,Math.round(bmp.height*scale));const cx=cv.getContext("2d");cx.fillStyle="#ffffff";cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(bmp,0,0,cv.width,cv.height);const blob=await new Promise(r=>cv.toBlob(r,"image/png"));if(!blob)throw new Error("Could not read that image.");const nameEl=document.getElementById("assessor-sig-name");const bid=uid("asig");await blobSet(bid,blob);if(!ui.assessorFlow)ui.assessorFlow={actId:el.dataset.act||ui.assessorSignAct,step:2,mode:"all",selected:new Set()};await applyAssessorSigning(p,bid,"uploaded",nameEl?nameEl.value.trim():"");}
else if(el.dataset.upload==="signature"){const f=files[0];const bmp=await createImageBitmap(f);const scale=Math.min(1,1200/Math.max(bmp.width,bmp.height));const cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(bmp.width*scale));cv.height=Math.max(1,Math.round(bmp.height*scale));const cx=cv.getContext("2d");cx.fillStyle="#ffffff";cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(bmp,0,0,cv.width,cv.height);const blob=await new Promise(r=>cv.toBlob(r,"image/png"));if(!blob)throw new Error("Could not read that image.");const old=S.profile.signatureBlobId,newId=uid("sig");await blobSet(newId,blob);S.profile.signatureBlobId=newId;S.profile.signatureUpdatedAt=new Date().toISOString();if(old&&old!==newId){try{await blobDel(old);}catch(_){}}if(ui.sigUrl)URL.revokeObjectURL(ui.sigUrl);ui.sigUrl=URL.createObjectURL(blob);ui.sigPadOpen=false;save();toast("Signature image saved on this device.");}
else if(el.dataset.upload==="backup")ui.pendingBackup=await parseBackup(files[0]);
else if(el.dataset.upload==="shared")await importSharedZip(files[0]);
else if(el.dataset.upload==="return"&&p)await stageReturn(files[0],el.dataset.act);
}catch(err){console.error(err);if(!err.packProgressShown)toast("Import failed: "+err.message);}el.value="";render();return;}
if(el.matches("[data-sel-crit]")){if(el.checked)ui.selCrit.add(el.dataset.selCrit);else ui.selCrit.delete(el.dataset.selCrit);refreshBulkBar();}
else if(el.matches("[data-bulk-act]")){ui.bulkAct=el.value;refreshBulkBar();}
else if(el.matches("[data-picker-crit]")){const ev=p&&p.evidence.find(x=>x.id===el.dataset.ev);if(ev){/* final links edited live in editor, saved on Save */}
}
else if(el.matches("[data-crit-status]")&&p){setCov(p,el.dataset.critStatus,el.dataset.act,{status:el.value});render();}
else if(el.matches("[data-crit-code]")&&p){setCov(p,el.dataset.critCode,el.dataset.act,{code:el.value});render();}
else if(el.matches("[data-ev-link]")&&p){const ev=p.evidence.find(x=>x.id===el.dataset.evLink);if(ev){ev.criteria=el.checked?[...new Set([...ev.criteria,el.dataset.crit])]:ev.criteria.filter(c=>c!==el.dataset.crit);save();}}
else if(el.matches("[data-abind]")&&p){const act=actOf(p,el.dataset.act);if(act){act[el.dataset.abind]=el.value;save();}}
else if(el.matches("[data-forms-act]")){ui.formsAct=el.value;render();}
else if(el.matches("[data-shared-crit]")){const x=S.shared.find(s=>s.id===el.dataset.sharedId);if(x){x.criteria[el.dataset.sharedCrit].status=el.value;save();}}
else if(el.matches("[data-shared-code]")){const x=S.shared.find(s=>s.id===el.dataset.sharedId);if(x){x.criteria[el.dataset.sharedCode].code=el.value;save();}}
});
document.addEventListener("input",e=>{const p=active();
if(e.target.matches("[data-profile-name]")){S.profile.name=e.target.value;if(p)p.name=e.target.value;save();return;}
if(e.target.matches("[data-pbind]")&&p){p[e.target.dataset.pbind]=e.target.value;if(e.target.dataset.pbind==="name")S.profile.name=e.target.value;save();return;}
if(e.target.matches("[data-afield]")&&p){const act=actOf(p,e.target.dataset.act);if(act){act[e.target.dataset.afield]=e.target.value;if(act.copiedUnconfirmed&&["summary","where","witness","assessorName"].includes(e.target.dataset.afield)){/* flag stays until confirmed */}save();}return;}
if(e.target.matches("[data-abind]")&&p){const act=actOf(p,e.target.dataset.act);if(act){act[e.target.dataset.abind]=e.target.value;save();}return;}
if(e.target.matches("[data-ev-search]")){const q=e.target.value.toLowerCase();document.querySelectorAll("[data-ev-row]").forEach(r=>{r.style.display=r.dataset.evRow.includes(q)?"":"none";});return;}
if(e.target.matches("[data-search=matrix]")){ui.mSearch=e.target.value;const pos=e.target.selectionStart;render();const s=document.querySelector("[data-search=matrix]");if(s){s.focus();s.setSelectionRange(pos,pos);}return;}
if(e.target.matches("[data-search=forms]")){ui.formsSearch=e.target.value;const pos=e.target.selectionStart;render();const s=document.querySelector("[data-search=forms]");if(s){s.focus();s.setSelectionRange(pos,pos);}return;}
if(e.target.matches("[data-search=evidence]")){ui.evSearch=e.target.value;const pos=e.target.selectionStart;render();const s=document.querySelector("[data-search=evidence]");if(s){s.focus();s.setSelectionRange(pos,pos);}}});
document.addEventListener("submit",e=>{const f=e.target,p=active();if(!f.matches("form"))return;e.preventDefault();const fd=new FormData(f);
if(f.dataset.form==="create-portfolio"){const pf=newPortfolio(String(fd.get("name")).trim(),ui.role,ui.grade,String(fd.get("assessedBy")||"").trim());if(!S.profile.name)S.profile.name=pf.name;S.portfolios.push(pf);S.settings.activeId=pf.id;ui.formsSetupFor=pf.id;save();location.hash="#/dashboard";toast("Portfolio created and saved in this browser.");render();}
else if(f.dataset.form==="activity-edit"&&p){const a=actOf(p,f.dataset.act);["summary","where","witness","assessorName","planText","feedbackText","candidateComments"].forEach(k=>{if(f.querySelector("[name=\""+k+"\"]"))a[k]=fd.get(k)||"";});if(f.querySelector("[name^=\"ukq-q-\"]"))a.ukq=a.ukq.map((u,i)=>({q:fd.get("ukq-q-"+i)||"",a:fd.get("ukq-a-"+i)||"",ok:fd.get("ukq-ok-"+i)||"",crits:u.crits||[]}));save();toast("Activity saved.");render();}
else if(f.dataset.form==="evidence-edit"&&p){const ev=p.evidence.find(x=>x.id===f.dataset.id);if(ev){ev.title=fd.get("title");ev.date=fd.get("date");ev.tags=String(fd.get("tags")||"").split(",").map(s=>s.trim()).filter(Boolean);ev.activityId=fd.get("activityId");ev.criteria=String(fd.get("criteria")||"").split(",").map(s=>s.trim()).filter(Boolean);ev.redact=!!fd.get("redact");save();toast("Evidence updated.");render();}}
else if(f.dataset.form==="portfolio-edit"&&p){p.name=fd.get("name");p.vessel=fd.get("vessel");p.trip=fd.get("trip");delete p.assessor;delete p.witness;save();toast("Settings saved.");render();}
else if(f.dataset.form==="shared-edit"){const x=S.shared.find(s=>s.id===f.dataset.id);if(x){x.activity.feedbackText=fd.get("feedbackText");x.activity.assessorName=fd.get("assessorName");x.activity.signedOn=fd.get("signedOn");if(x.activity.signedOn)Object.values(x.criteria).forEach(c=>{if(c.status==="Evidenced")c.status="Signed";});save();toast("Shared changes saved.");render();}}
});
document.addEventListener("click",e=>{
const bs=e.target.closest("[data-batch-status]");if(bs){ui.batchStatus=bs.dataset.batchStatus;document.querySelectorAll("[data-batch-status]").forEach(b=>b.classList.toggle("on",b===bs));return;}
const bc=e.target.closest("[data-batch-code]");if(bc){ui.batchCode=bc.dataset.batchCode;document.querySelectorAll("[data-batch-code]").forEach(b=>b.classList.toggle("on",b===bc));return;}
});
document.addEventListener("change",e=>{
if(e.target.matches("[data-assessor-comp]")&&ui.assessorFlow){const key=e.target.dataset.assessorComp;if(e.target.checked)ui.assessorFlow.selected.add(key);else ui.assessorFlow.selected.delete(key);const pairs=selectedSignOffPairs(active(),ui.assessorFlow);const critCount=pairs.reduce((n,x)=>n+x.crits.length,0);const elx=document.querySelector("[data-testid=assessor-sign-summary]");if(elx)elx.textContent="Signing will mark "+critCount+" planned criteria Signed (only planned criteria in the selected competencies, across "+pairs.length+" competence(s)) and add the assessor signature to every line that applies \u2014 the Assessor sign-off form per-competence Signature/Date fields and the other paperwork for those activities. Unplanned criteria will not be signed.";const nb=document.querySelector("[data-testid=assessor-sign-next]");if(nb)nb.disabled=ui.assessorFlow.mode==="select"&&!ui.assessorFlow.selected.size;return;}
if(e.target.matches("[data-plan-crit]")&&ui.planBuilder){const id=e.target.dataset.planCrit;if(e.target.checked)ui.planBuilder.draft.add(id);else ui.planBuilder.draft.delete(id);updatePlanDom();return;}
if(e.target.matches("[data-plan-comp]")&&ui.planBuilder){const comp=COMPS.find(c=>c.id===e.target.dataset.planComp);if(comp)comp.criteria.forEach(k=>{if(e.target.checked)ui.planBuilder.draft.add(k.id);else ui.planBuilder.draft.delete(k.id);});updatePlanDom();return;}
if(e.target.matches("[data-batch-crit]")){const owner=e.target.dataset.batchCrit;ui.captureLinks[owner]=ui.captureLinks[owner]||[];if(e.target.checked)ui.captureLinks[owner]=[...new Set([...ui.captureLinks[owner],e.target.value])];else ui.captureLinks[owner]=ui.captureLinks[owner].filter(x=>x!==e.target.value);const f=document.getElementById("final-"+owner);if(f)f.textContent=ui.captureLinks[owner].join(", ")||"none yet";return;}
if(e.target.matches("[data-picker-crit]")){const vals=[...document.querySelectorAll("[data-picker-crit]:checked")].map(c=>c.value);const f=document.getElementById("final-"+e.target.dataset.pickerCrit);if(f)f.textContent=vals.join(", ")||"none yet";}
});
function updatePlanDom(){if(!ui.planBuilder)return;const pb=ui.planBuilder;document.querySelectorAll("[data-plan-comp]").forEach(cb=>{const comp=COMPS.find(c=>c.id===cb.dataset.planComp);if(!comp)return;const n=comp.criteria.filter(k=>pb.draft.has(k.id)).length;cb.checked=n===comp.criteria.length&&n>0;cb.indeterminate=n>0&&n<comp.criteria.length;const cnt=document.querySelector(`[data-plan-compcount="${comp.id}"]`);if(cnt)cnt.textContent=n;});document.querySelectorAll("[data-plan-crit]").forEach(cb=>{cb.checked=pb.draft.has(cb.dataset.planCrit);const row=cb.closest("[data-plan-critrow]");if(row)row.classList.toggle("on",cb.checked);});updatePlanCount();}
function updatePlanCount(){const el=document.getElementById("plan-count");if(!el||!ui.planBuilder)return;const compIds=new Set();COMPS.forEach(c=>{if(c.criteria.some(k=>ui.planBuilder.draft.has(k.id)))compIds.add(c.id);});el.textContent=compIds.size+" competences · "+ui.planBuilder.draft.size+" criteria selected";}
document.addEventListener("input",e=>{if(e.target.matches("[data-plan-search]")){ui.planSearch=e.target.value;const q=ui.planSearch.toLowerCase();document.querySelectorAll("[data-plan-rowtext]").forEach(r=>{r.style.display=r.dataset.planRowtext.includes(q)?"":"none";});return;}
if(e.target.matches("[data-picker-search]")){const owner=e.target.dataset.owner,q=e.target.value.toLowerCase();document.querySelectorAll(`[data-picker-row="${owner}"]`).forEach(r=>{r.style.display=r.dataset.text.includes(q)?"":"none";});}});
document.addEventListener("keydown",e=>{if(!ui.drawerCrit)return;if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;if(e.target.closest("input,textarea,select,[contenteditable]"))return;e.preventDefault();navigateCrit(e.key==="ArrowRight"?1:-1);});
let swipeStart=null;
document.addEventListener("touchstart",e=>{if(!ui.drawerCrit){swipeStart=null;return;}const drawer=e.target.closest(".drawer");if(!drawer||e.target.closest("select,input,textarea,button,a,label")){swipeStart=null;return;}const t0=e.changedTouches[0];swipeStart={x:t0.clientX,y:t0.clientY};},{passive:true});
document.addEventListener("touchend",e=>{if(!swipeStart||!ui.drawerCrit){swipeStart=null;return;}const t0=e.changedTouches[0],dx=t0.clientX-swipeStart.x,dy=t0.clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.5)navigateCrit(dx<0?1:-1);},{passive:true});
window.addEventListener("hashchange",()=>{ui.preview=null;ui.modal=null;render();});
/* Opening animation: compass glides into the top-bar logo, then a circle reveal.
   Self-removes within 2s; reduced-motion gets a short fade. Every cold open only
   (it lives outside #app, so in-app renders never replay it). */
function runSplash(){const splash=document.getElementById("splash");if(!splash)return;const logo=document.getElementById("splash-logo");const target=document.getElementById("top-bar-logo");const reduced=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;let done=false;const finish=()=>{if(done)return;done=true;if(splash.isConnected)splash.remove();};
setTimeout(finish,2000);
if(reduced||!logo||!target||!logo.animate||!target.getBoundingClientRect().width){if(splash.animate){try{splash.animate([{opacity:1},{opacity:0}],{duration:200}).onfinish=finish;}catch(_){finish();}}else finish();return;}
const a=logo.getBoundingClientRect(),b=target.getBoundingClientRect();const dx=b.left+b.width/2-(a.left+a.width/2),dy=b.top+b.height/2-(a.top+a.height/2),scale=Math.max(.08,b.width/a.width);target.style.visibility="hidden";
try{const glide=logo.animate([{transform:"none"},{transform:`translate(${dx}px, ${dy}px) scale(${scale})`}],{duration:650,easing:"cubic-bezier(.4,0,.2,1)",fill:"forwards"});glide.onfinish=()=>{target.style.visibility="";logo.style.visibility="hidden";const cx=b.left+b.width/2,cy=b.top+b.height/2;const r=Math.hypot(Math.max(cx,innerWidth-cx),Math.max(cy,innerHeight-cy));try{const rev=splash.animate([{clipPath:`circle(${r}px at ${cx}px ${cy}px)`,offset:0},{clipPath:`circle(0px at ${cx}px ${cy}px)`}],{duration:350,easing:"ease-in",fill:"forwards"});rev.onfinish=finish;}catch(_){finish();}setTimeout(finish,600);};}catch(_){target.style.visibility="";finish();}}
/* Swipe navigation: left/right swipe cycles the main (bottom-nav) sections.
   Settings (and Profile, its sub-page) swipe right = back to More.
   Never fires over modals/drawer, forms, the signature canvas, or links/buttons. */
const NAV_TABS=["#/dashboard","#/work","#/criteria","#/more"];let navSwipe=null;
document.addEventListener("touchstart",e=>{navSwipe=null;if(ui.modal||ui.drawerCrit||ui.packProgress||ui.genReview||e.touches.length!==1)return;const t=e.touches[0];const bad=e.target.closest("input,textarea,select,canvas,[contenteditable],.drawer,.modal,.sig-pad");if(bad)return;navSwipe={x:t.clientX,y:t.clientY};},{passive:true});
document.addEventListener("touchend",e=>{if(!navSwipe)return;const t=e.changedTouches[0];const dx=t.clientX-navSwipe.x,dy=t.clientY-navSwipe.y;const sx=navSwipe.x;navSwipe=null;if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.6)return;const page=parse().parts[0]||"";
if(page==="settings"||page==="profile"){if(dx>=70&&sx<=64)location.hash="#/more";return;}
const cur={"":"",dashboard:"#/dashboard",work:"#/work",activities:"#/work",activity:"#/work",criteria:"#/criteria",matrix:"#/criteria",more:"#/more"}[page]||"";const idx=NAV_TABS.indexOf(cur);if(idx<0)return;const next=NAV_TABS[(idx+(dx<0?1:NAV_TABS.length-1))%NAV_TABS.length];location.hash=next;},{passive:true});
(async function boot(){document.getElementById("app").innerHTML=`<div class="landing"><div class="card">Loading your portfolios from this browser…</div></div>`;
try{await idbOpen();S.portfolios=(await kvGet("portfolios"))||[];S.templates=(await kvGet("templates"))||[];S.packImports=(await kvGet("packImports"))||[];S.shared=(await kvGet("shared"))||[];S.genPacks=(await kvGet("genPacks"))||[];S.profile=Object.assign(S.profile,(await kvGet("profile"))||{});S.settings=Object.assign(S.settings,(await kvGet("settings"))||{});await cleanupPackData();cleanupPortfolioPeople();migrateLegacyPortfolios();if(S.profile.signatureBlobId){blobGet(S.profile.signatureBlobId).then(b=>{if(b){ui.sigUrl=URL.createObjectURL(b);render();}}).catch(()=>{});}}catch(e){console.error("IndexedDB unavailable",e);}
render();})();
})();
