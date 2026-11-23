/* v0.2.17 Smart import (batch 2 item 8). Reads ANY zip of filled MTCS fillable PDFs, whatever the file names.
   Each PDF is identified by its AcroForm field names matched against the stored official blanks (Jaccard),
   with page text as tie-break / fallback. Entered values are read straight from the form fields. No OCR:
   scanned or flattened PDFs are reported as unreadable. Nothing is applied here; app.js shows a review first.
   v0.2.28: single PDFs / several files / zips; kind from field names, route + competence from the title line
   (e.g. "Grade II Surveyor" / "Competence 1"), all pages read; signatures = images or ink annotations over a
   signature field, returned as PNG; anything else is offered as an evidence file. */
(function(){
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const toks=s=>new Set(norm(s).split(" ").filter(w=>w.length>2));
  const jacc=(a,b)=>{if(!a.size||!b.size)return 0;let i=0;a.forEach(x=>{if(b.has(x))i++;});return i/(a.size+b.size-i);};
  async function pdfText(buf,maxPages,out){
    try{const L=window.pdfjsLib;if(!L)return "";if(L.GlobalWorkerOptions&&!L.GlobalWorkerOptions.workerSrc)L.GlobalWorkerOptions.workerSrc="js/vendor/pdf.worker.min.js";
      const doc=await L.getDocument({data:new Uint8Array(buf.slice(0))}).promise;let t="";
      for(let i=1;i<=Math.min(doc.numPages,maxPages||doc.numPages);i++){const pg=await doc.getPage(i);const tc=await pg.getTextContent();t+=tc.items.map(x=>x.str).join(" ")+"\n";if(i===1&&out)out.lines=lineTexts(tc.items);}
      try{doc.destroy();}catch(_){}return t;}catch(e){return "";}
  }
  /* page-1 text lines (items grouped by baseline) */
  function lineTexts(items){const m=new Map();items.forEach(x=>{if(!x.str||!x.transform)return;const y=Math.round(x.transform[5]);let k=[...m.keys()].find(v=>Math.abs(v-y)<=2);if(k==null){k=y;m.set(k,[]);}m.get(k).push(x);});
    return [...m.values()].map(a=>a.sort((p,q)=>p.transform[4]-q.transform[4]).map(x=>x.str).join(" ").replace(/\s+/g," ").trim()).filter(Boolean);}
  /* Survey-branch title line -> route. Grade from "Grade II/Grade I/Senior"; Party Chief and Client Rep have one level. */
  const ROLE_OF={"surveyor":"surveyor","data processor":"processor","survey engineer":"engineer","core competences":"core","core competencies":"core"};
  function routeFromLines(lines){for(const l of lines||[]){let m=l.match(/^(Grade II|Grade I|Senior) (Surveyor|Data Processor|Survey Engineer|Core Competences|Core Competencies)$/i);
      if(m)return{roleKey:ROLE_OF[m[2].toLowerCase()],grade:{"grade ii":"G2","grade i":"G1","senior":"Senior"}[m[1].toLowerCase()],label:l};
      if(/^Survey Party Chief$/i.test(l))return{roleKey:"partychief",grade:"",label:l};if(/^Client Representative$/i.test(l))return{roleKey:"clientrep",grade:"",label:l};}return null;}
  /* "Grade" box on the Sign Off / Record of Witness, e.g. "G2 Surveyor + G2 Core" (role wins over Core). */
  function routeFromGrade(t){t=String(t||"");if(!t.trim())return null;let roleKey=/data\s*processor/i.test(t)?"processor":/party\s*chief/i.test(t)?"partychief":/client/i.test(t)?"clientrep":/survey\s*engineer/i.test(t)?"engineer":/surveyor/i.test(t)?"surveyor":/core/i.test(t)?"core":null;if(!roleKey)return null;
    const grade=/\bG2\b|grade\s*ii\b/i.test(t)?"G2":/\bG1\b|grade\s*i\b/i.test(t)?"G1":/senior|\bsnr\b/i.test(t)?"Senior":"";return{roleKey,grade,label:t.trim()};}
  function compNoFromLines(lines){for(const l of lines||[]){const m=l.match(/^Competence (\d{1,2})\b/i);if(m)return +m[1];}return null;}
  function readFields(pdf){const out={};let form;try{form=pdf.getForm();}catch(_){return out;}
    form.getFields().forEach(f=>{const n=f.getName();let v="";try{if(typeof f.getText==="function")v=f.getText()||"";else if(typeof f.isChecked==="function")v=f.isChecked()?"Yes":"";else if(typeof f.getSelected==="function")v=(f.getSelected()||[]).join(", ");}catch(_){}
      out[n]=String(v).replace(/\r\n?/g,"\n").replace(/[ \t]+\n/g,"\n").trim();});return out;}
  function kindOf(fileName){const f=String(fileName||"");let m;
    if(/AssessmentPlan/i.test(f))return{kind:"plan"};if(/FeedbackForm/i.test(f))return{kind:"feedback"};
    if((m=f.match(/Competence(\d+)/i)))return{kind:"competence",num:+m[1]};if((m=f.match(/UKQ(\d+)/i)))return{kind:"ukq",num:+m[1]};
    if(/SignOff/i.test(f))return{kind:"signoff"};if(/Record_of_Witness/i.test(f))return{kind:"witness"};if(/^MTCS_WS_/i.test(f))return{kind:"ws"};if(/Testimony/i.test(f))return{kind:"testimony"};return{kind:"other"};}
  const KIND_LABEL={ws:"Witness Statement",file:"Evidence file",plan:"Assessment Plan",feedback:"Assessment Decision & Feedback",competence:"Competence form",ukq:"Knowledge questions",signoff:"Assessor Sign Off",witness:"Record of Witness",testimony:"Candidate / witness testimony",other:"Other MTCS form",unreadable:"Not readable (no form fields or text)",unknown:"Not recognised"};
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
    if(/Totalling approximately/i.test(j))return{kind:"ws"};if(/Witness Signature Date/i.test(j)&&!/All Criteria Covered/i.test(j))return{kind:"witness"};
    if(/Which performance criteria/i.test(j))return{kind:"plan"};if(/reasons for your decision/i.test(j))return{kind:"feedback"};
    if(/Type of Evidence/i.test(j))return{kind:"competence",num:null};if(/Satisfactory Response/i.test(j))return{kind:"ukq",num:null};
    if(/Candidate StatementRow/i.test(j))return{kind:"testimony"};if(/All Criteria Covered/i.test(j))return{kind:"signoff"};return null;}
  /* Signatures (v0.2.28): an image XObject or an Ink/Stamp annotation whose box overlaps a signature field.
     Each mark goes to the field it overlaps most. Text typed into the field is never treated as a signature. */
  const SIG_FIELD=n=>/signature/i.test(n)||n==="AssessorWitness_2"||n==="Candidate";
  const mul=(A,B)=>[A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]];
  const boxOf=m=>{const xs=[m[4],m[0]+m[4],m[2]+m[4],m[0]+m[2]+m[4]],ys=[m[5],m[1]+m[5],m[3]+m[5],m[1]+m[3]+m[5]];return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];};
  const inter=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
  const area=a=>Math.max(0,a[2]-a[0])*Math.max(0,a[3]-a[1]);
  function fieldBoxes(pdf,names){const out=[];let form;try{form=pdf.getForm();}catch(_){return out;}const pages=pdf.getPages();
    form.getFields().forEach(f=>{const n=f.getName();if(!names.includes(n))return;let ws=[];try{ws=f.acroField.getWidgets();}catch(_){}
      ws.forEach(w=>{const r=w.getRectangle();let pi=pages.findIndex(pg=>w.P()&&pg.ref===w.P());if(pi<0)pi=pages.findIndex(pg=>{const an=pg.node.Annots();return an&&an.asArray().some(x=>pdf.context.lookup(x)===w.dict);});if(pi<0&&pages.length===1)pi=0;if(pi<0||!r)return;out.push({name:n,page:pi,box:[r.x,r.y,r.x+r.width,r.y+r.height]});});});return out;}
  function toBlob(cv){return new Promise(res=>cv.toBlob(b=>res(b),"image/png"));}
  function imgCanvas(o){if(!o)return null;const W=o.width,H=o.height;if(!W||!H)return null;const cv=document.createElement("canvas");cv.width=W;cv.height=H;const cx=cv.getContext("2d");
    if(o.bitmap){cx.drawImage(o.bitmap,0,0);return cv;}const d=o.data;if(!d)return null;const id=cx.createImageData(W,H),D=id.data;
    if(o.kind===3){D.set(d.subarray?d.subarray(0,D.length):d);}else if(o.kind===2){for(let i=0,j=0;i<W*H;i++,j+=3){D[i*4]=d[j];D[i*4+1]=d[j+1];D[i*4+2]=d[j+2];D[i*4+3]=255;}}
    else if(o.kind===1){const rb=(W+7)>>3;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const bit=(d[y*rb+(x>>3)]>>(7-(x&7)))&1;const v=bit?255:0;const i=(y*W+x)*4;D[i]=D[i+1]=D[i+2]=v;D[i+3]=255;}}else return null;
    cx.putImageData(id,0,0);return cv;}
  async function extractSignatures(buf,pdf,fields){
    const names=Object.keys(fields).filter(SIG_FIELD);if(!names.length)return{};const boxes=fieldBoxes(pdf,names);if(!boxes.length)return{};
    const L=window.pdfjsLib;if(!L)return{};const out={};let doc;
    try{doc=await L.getDocument({data:new Uint8Array(buf.slice(0))}).promise;const OPS=L.OPS;
      for(const pi of [...new Set(boxes.map(b=>b.page))]){const page=await doc.getPage(pi+1);const marks=[];
        const ol=await page.getOperatorList({annotationMode:L.AnnotationMode?L.AnnotationMode.DISABLE:0});let ctm=[1,0,0,1,0,0];const st=[];
        for(let i=0;i<ol.fnArray.length;i++){const fn=ol.fnArray[i],ar=ol.argsArray[i];
          if(fn===OPS.save)st.push(ctm);else if(fn===OPS.restore)ctm=st.pop()||[1,0,0,1,0,0];else if(fn===OPS.transform)ctm=mul(ctm,ar);
          else if(fn===OPS.paintFormXObjectBegin){st.push(ctm);if(ar&&ar[0])ctm=mul(ctm,ar[0]);}else if(fn===OPS.paintFormXObjectEnd)ctm=st.pop()||[1,0,0,1,0,0];
          else if(fn===OPS.paintImageXObject||fn===OPS.paintInlineImageXObject||fn===OPS.paintImageMaskXObject)marks.push({how:"image",box:boxOf(ctm),id:typeof ar[0]==="string"?ar[0]:null,inline:typeof ar[0]==="object"?ar[0]:null,flipY:ctm[3]<0});}
        (await page.getAnnotations()).forEach(an=>{if(an.subtype==="Ink"||an.subtype==="Stamp")marks.push({how:an.subtype==="Ink"?"drawn":"stamp",box:an.rect,ann:an});});
        const mine=boxes.filter(b=>b.page===pi);const hits=new Map();
        marks.forEach(m=>{let best=null,bs=0;mine.forEach(b=>{const s=inter(m.box,b.box)/Math.max(1,Math.min(area(m.box),area(b.box)));if(s>bs){bs=s;best=b;}});if(best&&bs>=0.2&&area(m.box)>4){if(!hits.has(best.name))hits.set(best.name,[]);hits.get(best.name).push(m);}});
        if(!hits.size)continue;let full=null;const S=3;const vp=page.getViewport({scale:S});
        const render=async()=>{if(full)return full;full=document.createElement("canvas");full.width=Math.ceil(vp.width);full.height=Math.ceil(vp.height);await page.render({canvasContext:full.getContext("2d"),viewport:vp,annotationMode:L.AnnotationMode?L.AnnotationMode.ENABLE_FORMS:2}).promise;return full;};
        for(const [name,ms] of hits){const m=ms.sort((x,y)=>area(y.box)-area(x.box))[0];let cv=null;
          try{if(m.how==="image"){let o=m.inline;if(!o&&m.id){const pool=/^g_/.test(m.id)?page.commonObjs:page.objs;if(!pool.has(m.id))await render();if(pool.has(m.id))o=pool.get(m.id);}
              if(m.how==="image"&&o&&!(o.bitmap||o.data)&&!m.inline)o=null;cv=imgCanvas(o);if(cv&&m.flipY){const c2=document.createElement("canvas");c2.width=cv.width;c2.height=cv.height;const x=c2.getContext("2d");x.translate(0,cv.height);x.scale(1,-1);x.drawImage(cv,0,0);cv=c2;}}
            else if(m.how==="drawn"&&m.ann.inkLists&&m.ann.inkLists.length){const r=m.ann.rect,s=4,w=Math.max(1,(r[2]-r[0])*s),h=Math.max(1,(r[3]-r[1])*s);cv=document.createElement("canvas");cv.width=Math.ceil(w);cv.height=Math.ceil(h);const cx=cv.getContext("2d");
              const col=m.ann.color&&m.ann.color.length>=3?"rgb("+m.ann.color[0]+","+m.ann.color[1]+","+m.ann.color[2]+")":"#000";cx.strokeStyle=col;cx.lineWidth=Math.max(1,((m.ann.borderStyle&&m.ann.borderStyle.width)||1))*s;cx.lineCap=cx.lineJoin="round";
              m.ann.inkLists.forEach(lst=>{const pts=[];if(lst.length&&typeof lst[0]==="object")lst.forEach(q=>pts.push([q.x,q.y]));else for(let k=0;k+1<lst.length;k+=2)pts.push([lst[k],lst[k+1]]);cx.beginPath();pts.forEach(([x,y],k)=>{const X=(x-r[0])*s,Y=(r[3]-y)*s;if(k)cx.lineTo(X,Y);else cx.moveTo(X,Y);});cx.stroke();});}
            if(!cv){const f=await render();const [x1,y1,x2,y2]=vp.convertToViewportRectangle(m.box);const X=Math.max(0,Math.floor(Math.min(x1,x2))),Y=Math.max(0,Math.floor(Math.min(y1,y2))),W=Math.min(f.width-X,Math.ceil(Math.abs(x2-x1))),H=Math.min(f.height-Y,Math.ceil(Math.abs(y2-y1)));if(W>2&&H>2){cv=document.createElement("canvas");cv.width=W;cv.height=H;cv.getContext("2d").drawImage(f,X,Y,W,H,0,0,W,H);}}
            if(cv){const blob=await toBlob(cv);if(blob)out[name]={blob,how:m.how,w:cv.width,h:cv.height};}}catch(e){console.warn("signature read failed",name,e);}}
        try{page.cleanup();}catch(_){}}
    }catch(e){console.warn("signature scan failed",e);}finally{try{if(doc)doc.destroy();}catch(_){}}
    return out;}
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
    const nameSet=new Set(names);let text=null;const tx={};const getText=async()=>{if(text==null)text=await pdfText(buf,0,tx);return text;};
    const fk=names.length?kindFromFields(names):null;if(fk)Object.assign(r,fk,{method:"form fields"});
    if(!fk&&names.length&&sigs.length){
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
    if(r.kind!=="unreadable"){await getText();r.route=routeFromLines(tx.lines)||routeFromGrade(r.fields["Grade"]);if(r.kind==="competence"||r.kind==="ukq"){const cn=compNoFromLines(tx.lines);if(cn)r.num=cn;}}
    r.sigs=(names.length&&["signoff","witness","ws","testimony"].includes(r.kind))?await extractSignatures(buf,pdf,r.fields):{};
    const an=String(r.fields["Activity Number 12 or 3"]||"").match(/[1-9]/);const pm=String(path).match(/activity[\s_-]*([1-9])/i);
    r.activityNo=an?+an[0]:(pm?+pm[1]:null);r.activitySource=an?"form":(pm?"folder name":"");r.folderNo=pm?+pm[1]:null;if(an&&pm&&+an[0]!==+pm[1])r.actMismatch="The form says Activity "+an[0]+" but it sits in an Activity "+pm[1]+" folder — check which is right.";
    r.candidate=String(r.fields["Candidate Name"]||r.fields["Candidate name"]||"").trim();
    return r;}
  const MIME={pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp",heic:"image/heic",txt:"text/plain",csv:"text/csv",doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xls:"application/vnd.ms-excel",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
  /* v0.2.28: one PDF, several files, or zips (any mix). Non-PDF files come back as kind "file" (offered as evidence). */
  async function analyzeFiles(files,templates,blobGet,onProgress){const entries=[];
    for(const f of files){if(/\.zip$/i.test(f.name||"")||/zip/i.test(f.type||"")){const zip=await JSZip.loadAsync(f);zip.forEach((p,en)=>{if(en.dir)return;const b=p.split("/").pop();if(/^\._|^\.DS_Store$/.test(b)||/__MACOSX\//.test(p))return;entries.push({p,get:async()=>{const ab=await en.async("arraybuffer");return new File([ab],b,{type:MIME[(b.split(".").pop()||"").toLowerCase()]||"application/octet-stream"});}});});}
      else entries.push({p:f.name||"file",get:async()=>f});}
    const sigs=await templateSigs(templates,blobGet);const out=[];let i=0;
    for(const x of entries){i++;if(onProgress)onProgress(i,entries.length,x.p);const file=await x.get();let r;
      if(/\.pdf$/i.test(x.p)||file.type==="application/pdf")r=await identify(await file.arrayBuffer(),x.p,sigs);
      else{const pm=String(x.p).match(/activity[\s_-]*([1-9])/i);r={path:x.p,fileName:String(x.p).split("/").pop(),kind:"file",num:null,fields:{},filledCount:0,sigs:{},folderNo:pm?+pm[1]:null,activityNo:null,note:"Not a PDF form — can be added as evidence."};}
      r.file=file;out.push(r);}
    return{files:out,skipped:[],templateCount:sigs.length};}
  const analyzeZip=(file,templates,blobGet,onProgress)=>analyzeFiles([file],templates,blobGet,onProgress);
  window.MTCSSmartImport={analyzeZip,analyzeFiles,extractSignatures,routeFromLines,routeFromGrade,identify,templateSigs,readFields,KIND_LABEL,norm,toks,jacc};
})();
