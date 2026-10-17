"""One-off: extract the 79 G2 criteria (verbatim) from /workspace/g2/summary.md into packs/g2-surveyor-2026.json."""
import json, re, sys
src = sys.argv[1] if len(sys.argv) > 1 else "/workspace/g2/summary.md"
txt = open(src, encoding="utf-8").read()
units = {"core": [], "surveyor": []}
cur = None
for line in txt.splitlines():
    m = re.match(r"#### (Core|Surveyor) Competence (\d+) — (\S+)", line)
    if m:
        unit = m.group(1).lower(); n = int(m.group(2))
        cur = {"id": ("C%d" % n) if unit == "core" else ("S%02d" % n), "number": n,
               "unit": unit, "file": m.group(3), "title": "", "imca": "", "criteria": []}
        units[unit].append(cur); continue
    if cur is None: continue
    m = re.match(r'\*\*Title:\*\* "(.*)"', line)
    if m: cur["title"] = m.group(1); continue
    m = re.match(r'\*\*Mapping:\*\* "This meets the requirements of (.*)"', line)
    if m: cur["imca"] = m.group(1); continue
    m = re.match(r"\d+\. \((\w)\) (.*)", line)
    if m:
        cur["criteria"].append({"id": cur["id"] + m.group(1), "letter": m.group(1), "text": m.group(2).strip()})
    if line.startswith("### 2b") or line.startswith("## 3"):
        if line.startswith("## 3"): break
pack = {
  "id": "g2-surveyor-2026", "name": "Grade II Surveyor (with G2 Core)", "role": "Surveyor", "grade": "G2",
  "route": "GA", "version": "2026", "status": "active",
  "source": "MTCS Grade Assessment packs (Competence sheets 2019; Sign-off/Witness 2026). Criteria text verbatim.",
  "evidenceCodes": [
    {"code": "O", "label": "Observation", "direct": True},
    {"code": "P", "label": "Work product", "direct": True},
    {"code": "W", "label": "Written", "direct": False},
    {"code": "Q", "label": "Questioning", "direct": False},
    {"code": "N/C", "label": "Not covered", "direct": None},
    {"code": "N/A", "label": "Not applicable", "direct": None}],
  "rules": {"activities": 3, "eachCompetenceEveryActivity": True, "eachCriterionAtLeastOnce": True,
            "directEvidenceMinPct": 70},
  "uploadAreas": [
    {"n": 1, "name": "Assessment Plans and Feedback Forms"},
    {"n": 2, "name": "Performance Criteria completed over at least three activities"},
    {"n": 3, "name": "Underpinning knowledge documents"},
    {"n": 4, "name": "Assessor sign off form & Record of Witness Form"},
    {"n": 7, "name": "Candidate Statement"}],
  "units": [
    {"id": "core", "name": "G2 Core Competences", "imcaPrefix": "S/S30", "competences": units["core"]},
    {"id": "surveyor", "name": "G2 Surveyor", "imcaPrefix": "S/S31", "competences": units["surveyor"]}]
}
n = sum(len(c["criteria"]) for u in pack["units"] for c in u["competences"])
assert len(units["core"]) == 3 and len(units["surveyor"]) == 10 and n == 79, (len(units["core"]), len(units["surveyor"]), n)
json.dump(pack, open("packs/g2-surveyor-2026.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print("ok", n)
