/* MTCS competence PDF parser — runs entirely in the browser on files the user
   fetched/imported themselves. The app ships NO criteria text: this generates a
   local pack from the user's own MTCS PDFs (title, competence, criterion IDs/text).
   Uses PDF.js for page text and pdf-lib form fields as a cross-check/fallback. */
(function () {
  "use strict";
  function groupLines(items) {
    const rows = [];
    (items || []).forEach(it => {
      const x = it.transform[4], y = Math.round(it.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str });
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  async function extractLines(buf) {
    if (!window.pdfjsLib) throw new Error("PDF reader not loaded");
    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";
    const pdf = await window.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
    let lines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      lines = lines.concat(groupLines(tc.items));
    }
    return lines;
  }
  async function fieldCriteria(buf) {
    try {
      if (!window.PDFLib) return [];
      const doc = await window.PDFLib.PDFDocument.load(buf.slice(0), { ignoreEncryption: true });
      return doc.getForm().getFields().map(f => f.getName())
        .filter(n => /^Type of Evidence/i.test(n))
        .map(n => n.replace(/^Type of Evidence\s*/i, "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
    } catch (e) { return []; }
  }
  const LETTERS = "abcdefghijklmnopqrstuvwxyz";
  function criteriaFromLines(lines) {
    const out = []; let cur = null, inCrit = false;
    for (const line of lines) {
      if (/^Performance Criteria$/i.test(line) || /^Performance Criteria:/i.test(line)) { inCrit = true; continue; }
      if (/^(Witness name|Assessor name|Candidate Name|©|\(If applicable)/i.test(line) && inCrit && out.length) break;
      const m = line.match(/^([a-z])\)\s*(.*)$/);
      if (m && (inCrit || out.length || /^[a-z]\)/.test(line))) {
        inCrit = true;
        cur = { letter: m[1], text: m[2] || "" };
        out.push(cur); continue;
      }
      if (cur && inCrit && !/^(Type of Evidence|Performance Criteria)/i.test(line)) cur.text = (cur.text + " " + line).trim();
    }
    return out.map(c => ({ letter: c.letter, text: c.text.replace(/\s+/g, " ").trim() }));
  }
  /* Segment the page word-stream using the ordered form-field texts: each field
     name embeds one criterion (in order), so we can locate each in the extracted
     text and slice out the verbatim wording with correct spacing/punctuation. */
  function segmentByFields(lines, fields) {
    let inCrit = false; const words = [];
    for (const line of lines) {
      if (/^Performance Criteria/i.test(line)) { inCrit = true; continue; }
      if (inCrit && /^(Witness name|Assessor name|©)/i.test(line)) break;
      if (!inCrit) continue;
      if (/^(Performance Criteria|Type of Evidence)$/i.test(line)) continue;
      const cleaned = line.replace(/^([a-z])\)\s*/, "").replace(/\s+/g, " ").trim();
      if (cleaned) words.push(cleaned);
    }
    const stream = words.join(" ");
    const normChars = [], indexMap = [];
    for (let i = 0; i < stream.length; i++) { const ch = stream[i].toLowerCase(); if (/[a-z0-9]/.test(ch)) { normChars.push(ch); indexMap.push(i); } }
    const norm = normChars.join("");
    const starts = []; let pos = 0;
    for (const f of fields) {
      const nf = f.toLowerCase().replace(/[^a-z0-9]/g, "");
      const at = nf ? norm.indexOf(nf, pos) : -1;
      if (at < 0) return null;
      starts.push(at); pos = at + nf.length;
    }
    return fields.map((f, i) => {
      const from = indexMap[starts[i]];
      const to = i + 1 < starts.length ? indexMap[starts[i + 1]] : stream.length;
      return stream.slice(from, to).replace(/\s+/g, " ").trim().replace(/[.,;:]$/, t2 => t2);
    });
  }
  async function parseCompetence(blob, fileName, opts) {
    opts = opts || {};
    const buf = await blob.arrayBuffer();
    const warnings = [];
    let lines = [];
    try { lines = await extractLines(buf); } catch (e) { warnings.push("Text extraction failed (" + e.message + ") — used form fields/filename; check this sheet carefully."); }
    const fields = await fieldCriteria(buf);
    const head = lines.slice(0, 6).join(" ");
    const compLineIdx = lines.findIndex(l => /^Competence\s+\d+/i.test(l));
    const numM = (compLineIdx >= 0 ? lines[compLineIdx] : fileName).match(/Competence\s*(\d+)/i) || fileName.match(/Competence(\d+)/i);
    const number = numM ? parseInt(numM[1], 10) : null;
    let title = compLineIdx >= 0 ? (lines[compLineIdx + 1] || "") : "";
    if (/^(Performance Criteria|Candidate Name)/i.test(title)) title = "";
    const isCore = /core/i.test(fileName) || /core/i.test(head);
    const unitId = isCore ? "core" : "role";
    const prefix = isCore ? "C" : (opts.rolePrefix || "S");
    const code = number == null ? "" : (isCore ? "C" + number : prefix + String(number).padStart(2, "0"));
    let criteria = criteriaFromLines(lines);
    if (fields.length) {
      const segmented = segmentByFields(lines, fields);
      if (segmented && segmented.every(s => s && s.length > 3)) {
        criteria = segmented.map((text, i) => ({ letter: LETTERS[i] || String(i + 1), text }));
      } else if (segmented) {
        warnings.push("Some criteria could not be matched to the page text — please check them in the review.");
        criteria = segmented.map((text, i) => ({ letter: LETTERS[i] || String(i + 1), text: text || fields[i] || "" }));
      }
    }
    if (fields.length && fields.length !== criteria.length) {
      warnings.push("Text found " + criteria.length + " criteria but the form has " + fields.length + " evidence fields — used the form fields; please check.");
      criteria = fields.map((text, i) => ({ letter: LETTERS[i] || String(i + 1), text }));
    } else if (!criteria.length && fields.length) {
      warnings.push("No criteria read from page text — used the PDF form fields; please check.");
      criteria = fields.map((text, i) => ({ letter: LETTERS[i] || String(i + 1), text }));
    }
    if (!criteria.length) warnings.push("No performance criteria could be read from this PDF — add them manually in the review or re-import.");
    criteria.forEach((c, i) => { if (c.letter !== LETTERS[i]) warnings.push("Criterion letters are not sequential at position " + (i + 1) + " (" + c.letter + ") — please check."); c.id = code + c.letter; });
    if (number == null) warnings.push("Competence number not recognised from the PDF or filename — please correct the code.");
    if (!title) warnings.push("Competence title not recognised — please add it in the review.");
    return { fileName, unitId, unitName: isCore ? "Core" : (opts.roleName || "Role"), gradeLine: lines[0] || "", number, code, title, criteria, warnings, fieldCount: fields.length };
  }
  window.MTCSParser = { parseCompetence, _groupLines: groupLines, _criteriaFromLines: criteriaFromLines };
})();
