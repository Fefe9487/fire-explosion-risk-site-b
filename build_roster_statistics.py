"""Rebuild public statistics from the same high-risk roster used by company search.

Run: python build_roster_statistics.py
Source snapshots are retained; changing the statistical scope does not refresh them.
"""
import json
import hashlib
import re
from collections import Counter, defaultdict
from pathlib import Path

from article_parser import RANKED_LAWS

ROOT = Path(__file__).resolve().parent
YEARS = (113, 114, 115)
EXCLUDED_NO = {"勞職授字第1130205857號"}
BUILD_DATE = "2026-10-16"


def load(name):
    return json.loads((ROOT / "data" / (name + ".json")).read_text(encoding="utf-8"))


def save(name, value):
    (ROOT / "data" / (name + ".json")).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def year(date):
    return int(str(date).split("/")[0]) if re.match(r"^\d+/", str(date)) else None


def date_key(date):
    return "/".join(str(int(part)) for part in str(date or "").split("/")) if re.fullmatch(r"\d+/\d+/\d+", str(date or "")) else ""


def main():
    plants, meta = load("plants"), load("meta")
    previous_pen, previous_acc = load("gap-penalty"), load("gap-accident")
    reviewed = json.loads((ROOT / "reviewed_accident_interpretation.json").read_text(encoding="utf-8"))["summaries"]
    rollup = load("tax-rollup")
    ids = {p["id"] for p in plants}
    taxes = {re.sub(r"\D", "", str(p.get("tax", ""))) for p in plants}
    taxes = {tax for tax in taxes if len(tax) == 8}
    companies = len(taxes) + sum(len(re.sub(r"\D", "", str(p.get("tax", "")))) != 8 for p in plants)
    plant_tax = {p["id"]: str(p.get("tax", "")) for p in plants}

    def belongs(row):
        return (row.get("tax") in taxes or row.get("plantId") in ids) and re.sub(r"\s", "", row.get("no", "")) not in EXCLUDED_NO

    def selected_rows(name):
        seen = set()
        selected = []
        for row in load(name) + rollup.get(name, []):
            key = row.get("id") or row.get("no", "").strip()
            if key and key not in seen and belongs(row):
                seen.add(key)
                selected.append(row)
        return selected

    penalties, accidents = selected_rows("penalties"), selected_rows("accidents")
    criteria = previous_pen["fireCriteria"]
    allowed = {(g["short"], str(ref)) for g in criteria["groups"] for ref in g["articles"]}

    # A document number can be reused for different employers. Count each
    # company/date/document once, while merging repeated source clauses.
    all_dispositions = defaultdict(list)
    for row in penalties:
        y = year(row.get("date"))
        if y not in YEARS:
            continue
        tax = re.sub(r"\D", "", str(row.get("tax") or plant_tax.get(row.get("plantId")) or ""))
        company = tax if len(tax) == 8 else "id:" + row["plantId"]
        number = re.sub(r"\s", "", row.get("no", "")) or row["id"]
        all_dispositions[company, number, date_key(row["date"])].append(row)
    all_year_sets, all_law_sets, all_article_sets = defaultdict(set), defaultdict(set), defaultdict(set)
    for key, rows in all_dispositions.items():
        y = year(rows[0]["date"])
        all_year_sets[y].add(key)
        for row in rows:
            for a in row.get("arts", []):
                ref = str(a["n"]) + ("-" + str(a["sub"]) if a.get("sub") is not None else "")
                all_law_sets[a["law"], y].add(key)
                all_article_sets[a["law"], ref, y].add(key)
    law_info = {**RANKED_LAWS, "職安法": {"law": "職業安全衛生法", "prefix": "osha-", "pcode": "N0060001"}}
    all_arts = []
    for short, ref in sorted({(s, r) for s, r, _ in all_article_sets}):
        info = law_info.get(short, {"law": short, "prefix": "law-" + hashlib.sha256(short.encode()).hexdigest()[:8] + "-"})
        main_ref, *sub = ref.split("-")
        counts = {str(y): len(all_article_sets[short, ref, y]) for y in YEARS}
        counts["all"] = len(set().union(*(all_article_sets[short, ref, y] for y in YEARS)))
        all_arts.append({"art": int(main_ref), "sub": int(sub[0]) if sub else None, "lawShort": short, "y": counts,
            "law": info["law"], "key": info["prefix"] + ref,
            "label": short + "第" + main_ref + "條" + ("之" + sub[0] if sub else ""),
            "href": "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=" + info["pcode"] + "&flno=" + ref if info.get("pcode") else "https://law.moj.gov.tw/"})
    all_arts.sort(key=lambda a: (-a["y"]["all"], a["law"], a["art"], a["sub"] or 0))
    all_totals = {"all": {"all": len(all_dispositions), **{str(y): len(all_year_sets[y]) for y in YEARS}}}
    all_groups = [{"law": "全部法規", "short": "all", "articleCount": len(all_arts), "topKeys": [a["key"] for a in all_arts[:10]]}]
    for short, info in law_info.items():
        records = [a for a in all_arts if a["lawShort"] == short]
        all_groups.append({"law": info["law"], "short": short, "articleCount": len(records), "topKeys": [a["key"] for a in records[:10]]})
        all_totals[short] = {str(y): len(all_law_sets[short, y]) for y in YEARS}
        all_totals[short]["all"] = len(set().union(*(all_law_sets[short, y] for y in YEARS)))
    all_analysis = {"countUnit": "company-disposition-date", "arts": all_arts, "topArts": all_arts[:10],
        "lawGroups": all_groups, "lawTotals": all_totals, "year_total": all_totals["all"],
        "note": "按事業單位、處分字號與處分日期合併計算。同一處分引用多個條文只計1件；不同事業單位即使處分字號相同，仍分別計算。"}
    law_sets = defaultdict(set)
    article_sets = defaultdict(set)
    dispositions = defaultdict(set)
    for row in penalties:
        y = year(row.get("date"))
        no = row.get("no", "").strip() or row["id"]
        if y not in YEARS:
            continue
        for article in row.get("arts", []):
            short = article["law"]
            ref = str(article["n"]) + ("-" + str(article["sub"]) if article.get("sub") is not None else "")
            if (short, ref) not in allowed:
                continue
            law_sets[short, y].add(no)
            article_sets[short, ref, y].add(no)
            dispositions[y].add(no)

    arts, top, groups, totals = [], [], [], {}
    for short, law in RANKED_LAWS.items():
        refs = {ref for s, ref, _ in article_sets if s == short}
        records = []
        for ref in refs:
            main_ref, *sub = ref.split("-")
            counts = {str(y): len(article_sets[short, ref, y]) for y in YEARS}
            counts["all"] = len(set().union(*(article_sets[short, ref, y] for y in YEARS)))
            records.append({"art": int(main_ref), "sub": int(sub[0]) if sub else None,
                "lawShort": short, "y": counts, "law": law["law"], "key": law["prefix"] + ref,
                "label": short + "第" + main_ref + "條" + ("之" + sub[0] if sub else ""),
                "href": "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=" + law["pcode"] + "&flno=" + ref})
        records.sort(key=lambda a: (-a["y"]["all"], a["art"], a["sub"] or 0))
        arts.extend(records)
        top.extend(records[:10])
        groups.append({"law": law["law"], "short": short, "articleCount": len(records), "topKeys": [a["key"] for a in records[:10]]})
        totals[short] = {str(y): len(law_sets[short, y]) for y in YEARS}
        totals[short]["all"] = len(set().union(*(law_sets[short, y] for y in YEARS)))

    scope = {"rosterPlaces": len(plants), "rosterCompanies": companies, "statisticsYears": [min(YEARS), max(YEARS)], "statisticsBuiltAt": BUILD_DATE}
    penalty = {k: previous_pen[k] for k in ["sourceThrough", "sourceUpdatedAt", "sourceCutoff", "fireCriteria"]}
    penalty.update(scope)
    penalty.update({"scope": "roster", "fire_n": len(set().union(*dispositions.values())),
        "allAnalysis": all_analysis,
        "coverageNote": "115年的資料還沒收齊，請不要拿來跟113、114整年比。",
        "year_total": {"all": len(set().union(*dispositions.values())), **{str(y): len(dispositions[y]) for y in YEARS}},
        "arts": arts, "topArts": top, "filterLimit": 10, "lawTotals": totals, "lawGroups": groups,
        "note": "僅統計本網站高風險廠場名單所屬事業單位，依同一統一編號合計。只計民國113至115年火災爆炸相關條文；同一處分在同一部法規只算一件，跨法規可分別計入。"})

    kinds = [k["kind"] for k in previous_acc["kinds"]]
    acc_groups = defaultdict(list)
    for row in accidents:
        if year(row.get("dispDate")) in YEARS and row.get("kind") in kinds:
            acc_groups[row.get("no", "").strip() or row["id"], row["kind"]].append(row)
    counts = defaultdict(Counter)
    for (_, kind), rows in acc_groups.items():
        ys = {year(row["dispDate"]) for row in rows}
        if len(ys) != 1:
            raise ValueError("Conflicting disposition years")
        counts[kind][next(iter(ys))] += 1
        counts[kind]["all"] += 1
    matched_events = {(str(row.get("tax") or plant_tax.get(row.get("plantId")) or row.get("subjectTax") or ""), row.get("kind"), date_key(row.get("eventDate"))) for row in accidents}
    pacs_counts = defaultdict(Counter)
    seen_events = set()
    matched = 0
    for row in load("pacs"):
        y = year(row.get("eventDate"))
        event = (str(row.get("tax", "")), row.get("kind"), date_key(row.get("eventDate")))
        if row.get("tax") not in taxes or y not in YEARS or row.get("kind") not in kinds or event in seen_events:
            continue
        seen_events.add(event)
        if event in matched_events:
            matched += 1
        else:
            pacs_counts[row["kind"]][y] += 1

    focuses = []
    for old in previous_acc["focus"]:
        kind = old["kind"]
        references = Counter()
        for (_, k), rows in acc_groups.items():
            if k == kind:
                references.update({a["law"] + "第" + str(a["n"]) + "條" + ("之" + str(a["sub"]) if a.get("sub") is not None else "") for row in rows for a in row.get("arts", [])})
        n, extra = counts[kind]["all"], sum(pacs_counts[kind].values())
        focuses.append({"kind": kind, "n": n, "pacsN": extra,
            "topArts": [{"art": a, "n": count} for a, count in sorted(references.items(), key=lambda p: (-p[1], p[0]))[:10]],
            "summary": reviewed[kind]["summary"],
            "bullets": reviewed[kind]["bullets"], "fix": old["fix"]})
    accident = {k: previous_acc[k] for k in ["sourceThrough", "sourceUpdatedAt", "sourceCutoff", "dateBasis", "countUnit", "sourceUrl", "sourceSnapshot", "excluded"]}
    accident.update(scope)
    accident.update({"scopeKey": "roster", "scope": "僅統計本網站高風險廠場名單所屬事業單位，依同一統一編號合計，處分依113至115年處分年度計算；重大職災公開網去重後另按發生年度計算。",
        "sourceRows": len(accidents), "distinctDispositions": len({no for no, _ in acc_groups}), "kindDispositionTotal": len(acc_groups),
        "kinds": [{"kind": k, "n": counts[k]["all"], **{"y" + str(y): counts[k][y] for y in YEARS}, **{"pacs" + str(y): pacs_counts[k][y] for y in YEARS}} for k in kinds],
        "focus": focuses, "note": "同一處分在同一災害類型只計一次；跨類型可分別計入。處分件數不等於事故場次或傷亡人數。115年為部分年度。",
        "analysisNote": "常見缺失與檢查建議沿用原有職災公告重點彙整，供預防改善參考；件數與引用條文另依本網站查詢範圍統計。",
        "pacsAdded": sum(sum(c.values()) for c in pacs_counts.values()), "pacsMatched": matched, "pacsSource": "https://pacs.osha.gov.tw/2875/",
        "pacsNote": "限同一高風險廠場名單所屬統編，以統一編號、災害類型、發生日期核對既有職災，重複案件不另計入；其餘按發生年計。"})
    meta.update(scope)
    meta.update({"statisticsScope": "roster", "methodUpdatedAt": BUILD_DATE,
        "scope": "查詢與統計均限本網站高風險廠場名單所屬事業單位，以統一編號合計紀錄，不標示個別廠址。統計處分年度為113至115年。處分件數不等於事故場次或傷亡人數。"})
    save("gap-penalty", penalty)
    save("gap-accident", accident)
    save("meta", meta)
    print(json.dumps({**scope, "firePenalties": penalty["fire_n"], "accidentDispositions": accident["distinctDispositions"], "pacsAdded": accident["pacsAdded"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
