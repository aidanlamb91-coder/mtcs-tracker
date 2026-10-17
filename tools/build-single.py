"""Inline css + js into one HTML file (opens from file:// on a phone). Usage: python3 tools/build-single.py [out]"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root.parent / "MTCS_Tracker_Prototype.html")
html = (root / "index.html").read_text()
css = (root / "css/styles.css").read_text()
html = html.replace('<link rel="stylesheet" href="css/styles.css">', "<style>\n" + css + "\n</style>")
for js in ["js/packs.generated.js", "js/sample-data.js", "js/app.js"]:
    src = (root / js).read_text().replace("</script>", "<\\/script>")
    html = html.replace(f'<script src="{js}"></script>', "<script>\n" + src + "\n</script>")
assert not re.search(r'(src|href)="(css|js)/', html), "external refs remain"
out.write_text(html); print(out, len(html))
