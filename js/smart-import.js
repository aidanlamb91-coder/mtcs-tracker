/* v0.2.17 Smart import (batch 2 item 8). Reads ANY zip of filled MTCS fillable PDFs, whatever the file names.
   Each PDF is identified by its AcroForm field names matched against the stored official blanks (Jaccard),
   with page text as tie-break / fallback. Entered values are read straight from the form fields. No OCR:
   scanned or flattened PDFs are reported as unreadable. Nothing is applied here; app.js shows a review first. */
(function(){
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const toks=s=>new Set(norm(s).split(" ").filter(w=>w.length>2));
  const jacc=(a,b)=>{if(!a.size||!b.size)return 0;let i=0;a.forEach(x=>{if(b.has(x))i++;});return i/(a.size+b.size-i);};
  async function pdfText(buf,maxPages){
    try{const L=window.pdfjsLib;if(!L)return "";if(L.GlobalWorkerOptions&&!L.GlobalWorkerOptions.workerSrc)L.GlobalWorkerOptions.workerSrc="js/vendor/pdf.worker.min.js";
      const doc=await L.getDocument({data:new Uint8Array(buf.slice(0))}).promise;let t="";
      for(let i=1;i<=Math.min(doc.numPages,maxPages||2);i++){const pg=await doc.getPage(i);const tc=await pg.getTextContent();t+=tc.items.map(x=>x.str).join(" ")+"\n";}
      try{doc.destroy();}catch(_){}return t;}catch(e){return "";}
  }
  function readFields(pdf){const out={};let form;try{form=pdf.getForm();}catch(_){return out;}
    form.getFields().forEach(f=>{const n=f.getName();let v="";try{if(typeof f.getText==="function")v=f.getText()||"";else if(typeof f.isChecked==="function")v=f.isChecked()?"Yes":"";else if(typeof f.getSelected==="function")v=(f.getSelected()||[]).join(", ");}catch(_){}
      out[n]=String(v).replace(/\r\n?/g,"\n").replace(/[ \t]+\n/g,"\n").trim();});return out;}
  function kindOf(fileName){const f=String(fileName||"");let m;
    if(/AssessmentPlan/i.test(f))return{kind:"plan"};if(/FeedbackForm/i.test(f))return{kind:"feedback"};
    if((m=f.match(/Competence(\d+)/i)))return{kind:"competence",num:+m[1]};if((m=f.match(/UKQ(\d+)/i)))return{kind:"ukq",num:+m[1]};
    if(/SignOff/i.test(f))return{kind:"signoff"};if(/Record_of_Witness/i.test(f))return{kind:"witness"};if(/Testimony/i.test(f))return{kind:"testimony"};return{kind:"other"};}
  const KIND_LABEL={plan:"Assessment Plan",feedback:"Assessment Decision & Feedback",competence:"Competence form",ukq:"Knowledge questions",signoff:"Assessor Sign Off",witness:"Record of Witness",testimony:"Candidate / witness testimony",other:"Other MTCS form",unreadable:"Not readable (no form fields or text)",unknown:"Not recognised"};
  function kindFromText(t){const s=norm(t);let m;
    if(/underpinning knowledge/.test(s)){m=s.match(/competen\w*\s+(\d{1,2})/);return{kind:"ukq",num:m?+m[1]:null};}
    if(/record of witness/.test(s))return{kind:"witness"};
    if(/sign off/.test(s)&&/assessor/.test(s))return{kind:"signoff"};
    if(/assessment plan/.test(s)||/which performance criteria/.test(s))return{kind:"plan"};
    if(/reasons for your decision|assessment decision/.test(s))return{kind:"feedback"};
    if(/testimony|candidate statement/.test(s))return{kind:"testimony"};
    if(/type of evidence/.test(s)&&/performance criteria/.test(s)){m=s.match(/competen\w*\s+(\d{1,2})/);return{kind:"competence",num:m?+m[1]:null};}
    return null;}
  function kindFromFields(names){const j=names.join("|");
    if(/Which performance criteria/i.test(j))return{kind:"plan"};if(/reasons for your decision/i.test(j))return{kind:"feedback"};
    if(/Type of Evidence/i.test(j))return{kind:"competence",num:null};if(/Satisfactory Response/i.test(j))return{kind:"ukq",num:null};
    if(/Candidate StatementRow/i.test(j))return{kind:"testimony"};if(/All Criteria Covered/i.test(j))return{kind:"signoff"};return null;}
  let CACHE={key:"",list:[]};
  async function templateSigs(templates,blobGet){
    const pdfs=(templates||[]).filter(t=>/\.pdf$/i.test(t.fileName||""));const key=pdfs.map(t=>t.id+":"+(t.sha256||"")).join(",");
    if(CACHE.key===key)return CACHE.list;const list=[];
    for(const t of pdfs){let names=[],buf=null;try{const b=await blobGet(t.blobId);if(!b)continue;buf=await b.arrayBuffer();const pdf=await PDFLib.PDFDocument.load(buf,{ignoreEncryption:true,updateMetadata:false});names=Object.keys(readFields(pdf));}catch(_){}
      list.push(Object.assign({tpl:t,names:new Set(names),buf,text:null},kindOf(t.fileName)));}
    CACHE={key,list};return list;}
  async function sigText(sg){if(sg.text==null)sg.text=toks(await pdfText(sg.buf,2));return sg.text;}
  async function identify(buf,path,sigs){
    const base=String(path).split("/").pop();const r={path,fileName:base,kind:"unknown",num:null,tpl:null,score:0,method:"",fields:{},filledCount:0};
    let pdf=null;try{pdf=await PDFLib.PDFDocument.load(buf,{ignoreEncryption:true,updateMetadata:false});}catch(e){r.kind="unreadable";r.note="Could not open PDF: "+e.message;return r;}
    r.fields=readFields(pdf);const names=Object.keys(r.fields);r.filledCount=names.filter(n=>r.fields[n]).length;
    const nameSet=new Set(names);let text=null;const getText=async()=>{if(text==null)text=await pdfText(buf,2);return text;};
    if(names.length&&sigs.length){
      const scored=sigs.map(sg=>({sg,s:jacc(nameSet,sg.names)})).sort((a,b)=>b.s-a.s);const best=scored[0];
      if(best&&best.s>=0.6){let cands=scored.filter(x=>x.s>=best.s-0.02);let pick=best,method="form fields";
        if(cands.length>1){const tt=toks(await getText());if(tt.size){let bs=-1;for(const c of cands){const s=jacc(tt,await sigText(c.sg));if(s>bs){bs=s;pick=c;}}method="form fields + page text";}}
        Object.assign(r,{kind:pick.sg.kind,num:pick.sg.num||null,tpl:pick.sg.tpl,score:Math.round(pick.s*100),method});}
    }
    if(r.kind==="unknown"){const t=await getText();const tt=toks(t);
      if(tt.size&&sigs.length){let bs=0,bsg=null;for(const sg of sigs){const s=jacc(tt,await sigText(sg));if(s>bs){bs=s;bsg=sg;}}
        if(bsg&&bs>=0.5)Object.assign(r,{kind:bsg.kind,num:bsg.num||null,tpl:bsg.tpl,score:Math.round(bs*100),method:"page text"});}
      if(r.kind==="unknown"){const k=kindFromFields(names)||(t?kindFromText(t):null);if(k)Object.assign(r,k,{method:names.length?"field names":"page text keywords"});}
      if(r.kind==="unknown"&&!names.length&&!String(t||"").trim()){r.kind="unreadable";r.note="No form fields or text (scanned?). OCR isn't supported.";}
    }
    if(r.kind!=="unreadable"&&!names.length&&r.method)r.note="Recognised, but it has no fillable fields, so there are no entered values to read.";
    const an=String(r.fields["Activity Number 12 or 3"]||"").match(/[1-9]/);const pm=String(path).match(/activity[\s_-]*([1-9])/i);
    r.activityNo=an?+an[0]:(pm?+pm[1]:null);r.activitySource=an?"form":(pm?"folder name":"");r.folderNo=pm?+pm[1]:null;if(an&&pm&&+an[0]!==+pm[1])r.actMismatch="The form says Activity "+an[0]+" but it sits in an Activity "+pm[1]+" folder — check which is right.";
    r.candidate=String(r.fields["Candidate Name"]||r.fields["Candidate name"]||"").trim();
    return r;}
  async function analyzeZip(file,templates,blobGet,onProgress){
    const zip=await JSZip.loadAsync(file);const entries=[];zip.forEach((p,en)=>{if(en.dir)return;const b=p.split("/").pop();if(/^\._|^\.DS_Store$/.test(b)||/__MACOSX\//.test(p))return;entries.push({p,en});});
    const pdfs=entries.filter(x=>/\.pdf$/i.test(x.p)),others=entries.filter(x=>!/\.pdf$/i.test(x.p));
    const sigs=await templateSigs(templates,blobGet);const out=[];let i=0;
    for(const x of pdfs){i++;if(onProgress)onProgress(i,pdfs.length,x.p);const buf=await x.en.async("arraybuffer");out.push(await identify(buf,x.p,sigs));}
    return{files:out,skipped:others.map(x=>x.p),templateCount:sigs.length};}
  window.MTCSSmartImport={analyzeZip,identify,templateSigs,readFields,KIND_LABEL,norm,toks,jacc};
})();
