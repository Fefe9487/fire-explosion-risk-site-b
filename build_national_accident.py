"""Build nationwide aggregate data from the official ODS; never join the roster.
Usage: python build_national_accident.py /path/to/official-accidents.ods
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from ods_source import load_ods
from article_parser import parse_articles

ROOT = Path(__file__).resolve().parent
KINDS = ["墜落、滾落","被夾、被捲","物體飛落","物體倒塌、崩塌","跌倒","被刺、割、擦傷","被撞","感電","與高溫、低溫之接觸","與有害物等之接觸","不當動作","衝撞","火災","爆炸","溺斃","踩踏(踏穿)","物體破裂"]
YEARS = (113,114,115)
EXCLUDED = {"勞職授字第1130205857號"}  # Existing reviewed publication policy.

def build(path):
    rows = load_ods(path)
    required = {"處分日期","處分字號","災害類型","違反法規條款"}
    if not rows or any(not required.issubset(r) for r in rows):
        raise ValueError("Unexpected official ODS schema")
    groups = defaultdict(list)
    for r in rows:
        no = r["處分字號"].strip()
        date = r["處分日期"].strip()
        if not no or not date:
            raise ValueError("Missing disposition identifier/date")
        if date > "115/10/06":
            raise ValueError("Disposition beyond source snapshot cutoff")
        if no in EXCLUDED or int(date.split("/")[0]) not in YEARS or r["災害類型"].strip() not in KINDS:
            continue
        groups[(no,r["災害類型"].strip())].append(r)
    counts = defaultdict(Counter)
    for (_,kind),group in groups.items():
        years = {int(r["處分日期"].split("/")[0]) for r in group}
        if len(years) != 1:
            raise ValueError("Conflicting years for a disposition/type")
        counts[kind]["all"] += 1
        counts[kind][next(iter(years))] += 1
    previous = json.loads((ROOT/"data/gap-accident.json").read_text())
    guidance = {f["kind"]:f["fix"] for f in previous["focus"]}
    focuses = []
    for kind in ("火災","爆炸","與有害物等之接觸"):
        arts = Counter()
        for (_,k),group in groups.items():
            if k != kind:
                continue
            labels = {a["law"]+"第"+str(a["n"])+"條"+("" if a.get("sub") is None else "之"+str(a["sub"]))
                      for r in group for a in parse_articles(r["違反法規條款"])}
            arts.update(labels)
        focuses.append({"kind":kind,"n":counts[kind]["all"],
            "topArts":[{"art":a,"n":n} for a,n in sorted(arts.items(),key=lambda x:(-x[1],x[0]))[:10]],
            "summary":"以下依全臺公開公告整理引用條文；同一處分引用同一條文只計一次。條文引用情形不能單獨用來判定事故原因，實際缺失應查閱原始公告。",
            "fix":guidance[kind]})
    through = max(r["處分日期"].strip() for r in rows)
    output = {"scope":"全臺公開職災相關處分資料，民國113至115年，按處分年度統計；不以特定場所名單限制。處分件數不等於事故場次、傷亡人數或全臺所有職災。",
        "scopeKey":"national","sourceThrough":through,"sourceUpdatedAt":"2026-10-06","sourceCutoff":"115/10/06",
        "statisticsYears":[113,115],"dateBasis":"disposition","countUnit":"disposition-and-kind",
        "sourceUrl":"https://toshms.osha.gov.tw/Disaster/Content/DisasterList",
        "sourceSnapshot":"2026-10-06 official ODS export","sourceRows":len(rows),
        "distinctDispositions":len({no for no,_ in groups}),
        "kindDispositionTotal":len(groups),
        "kinds":[{"kind":k,"n":counts[k]["all"],**{"y"+str(y):counts[k][y] for y in YEARS}} for k in KINDS],
        "focus":focuses,"excluded":sorted({r["災害類型"].strip() for r in rows}-set(KINDS)),
        "note":"同一處分在同一災害類型只計一次；若跨類型，分別計入各類型，各類型合計不等於去重後處分總數。115年為截至來源最新日期的部分年度。"}
    (ROOT/"data/gap-accident.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"sourceRows":len(rows),"distinctDispositions":output["distinctDispositions"],
        "kindDispositionTotal":len(groups),"sourceThrough":through,
        "focus":{f["kind"]:f["n"] for f in focuses}},ensure_ascii=False))

if __name__ == "__main__":
    build(Path(sys.argv[1]))
