"""Independent aggregate reconciliation against the raw official ODS XML."""
from pathlib import Path
from collections import defaultdict
import json, zipfile, xml.etree.ElementTree as ET, sys
root=Path(__file__).resolve().parent
T="{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
X="{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
with zipfile.ZipFile(sys.argv[1]) as archive:
    sheet=ET.fromstring(archive.read("content.xml")).find(".//"+T+"table")
header=None;accepted=defaultdict(set);byyear=defaultdict(set);numbers=set();rowcount=0
result=json.loads((root/"data/gap-accident.json").read_text())
allowed={k["kind"] for k in result["kinds"]}
for row in sheet.findall(T+"table-row"):
    cells=[]
    for cell in row:
        if cell.tag not in [T+"table-cell",T+"covered-table-cell"]:continue
        text="\n".join("".join(p.itertext()) for p in cell.findall(X+"p"))
        count=int(cell.attrib.get(T+"number-columns-repeated","1"))
        cells.extend([text]*min(count,32))
    if not any(cells):continue
    if header is None:
        if "處分日期" in cells and "處分字號" in cells:header=cells
        continue
    for _ in range(min(int(row.attrib.get(T+"number-rows-repeated","1")),10000)):
        rowcount+=1
        record=dict(zip(header,cells))
        year=record["處分日期"].split("/")[0]
        kind=record["災害類型"].strip();number=record["處分字號"].strip()
        if year not in ["113","114","115"] or kind not in allowed or number=="勞職授字第1130205857號":continue
        accepted[kind].add(number);byyear[kind,year].add(number);numbers.add(number)
assert rowcount==result["sourceRows"]
for k in result["kinds"]:
    assert k["n"]==len(accepted[k["kind"]])
    for y in ["113","114","115"]:assert k["y"+y]==len(byyear[k["kind"],y])
    assert k["n"]==sum(k["y"+y] for y in ["113","114","115"])
assert len(numbers)==result["distinctDispositions"]
assert sum(len(x) for x in accepted.values())==result["kindDispositionTotal"]
assert result["scopeKey"]=="national" and "rosterPlaces" not in result
print("PASS independent source reconciliation:",rowcount,"source rows;",len(numbers),"distinct dispositions")
