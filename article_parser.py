import re
import unicodedata
FACILITIES = "職業安全衛生設施規則"
HIGH_PRESSURE = "高壓氣體勞工安全規則"
LAW_SHORT = {FACILITIES: "設規", HIGH_PRESSURE: "高壓則", "職業安全衛生法": "職安法"}
RANKED_LAWS = {
    "設規": {"law": FACILITIES, "prefix": "", "pcode": "N0060009"},
    "高壓則": {"law": HIGH_PRESSURE, "prefix": "hp-", "pcode": "N0060030"},
}


TOKEN = re.compile(
    r"(?P<law>[\u4e00-\u9fff]{2,40}(?:規則|標準|辦法|規程|法)|同(?:規則|標準|辦法|規程|法)|設規|高壓則|職安法)(?=第|\d)"
    r"|第?0*(?P<n>\d+)條(?:之(?P<sub>\d+))?"
)


def parse_articles(text: str) -> list[dict]:
    """Keep the active law across a list; clauses do not change article identity."""
    law = None
    families = {}
    out = []
    seen = set()
    text = re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(text or "")))
    text = re.sub(r"第?(\d+)[之-](\d+)條", r"第\1條之\2", text)
    text = re.sub(r"第(\d+)(?=第\d+項)", r"第\1條", text)
    aliases = {**LAW_SHORT, **{short: short for short in LAW_SHORT.values()}}
    for token in TOKEN.finditer(text):
        if token["law"]:
            name = token["law"].lstrip("暨及")
            same = re.search(r"同(規則|標準|辦法|規程|法)$", name)
            if same:
                law = families.get(same[1])
            else:
                canonical = next((k for k in sorted(aliases, key=len, reverse=True) if name.endswith(k)), name)
                law = aliases.get(canonical, canonical)
                full = RANKED_LAWS.get(law, {}).get("law", canonical)
                for suffix in ("規則", "標準", "辦法", "規程", "法"):
                    if full.endswith(suffix):
                        families[suffix] = law
                        break
            continue
        if not law:
            continue
        n = int(token["n"])
        sub = int(token["sub"]) if token["sub"] else None
        key = (law, n, sub)
        if key in seen:
            continue
        seen.add(key)
        out.append({"law": law, "n": n, **({"sub": sub} if sub is not None else {})})
    return out

