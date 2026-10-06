from pathlib import Path
def load_ods(path: Path | None = None) -> list[dict]:
    import zipfile
    import xml.etree.ElementTree as ET
    if path is None:
        candidates = list(SRC.glob("職災*.ods")) or list(SRC.glob("*.ods"))
        path = max(candidates, key=lambda p: p.name)
    ns = {"t": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "x": "urn:oasis:names:tc:opendocument:xmlns:text:1.0"}
    with zipfile.ZipFile(path) as archive:
        table = ET.fromstring(archive.read("content.xml")).find(".//t:table", ns)
    values = []
    for row in table.findall("t:table-row", ns):
        cells = []
        for cell in row:
            if cell.tag not in {"{" + ns["t"] + "}table-cell", "{" + ns["t"] + "}covered-table-cell"}:
                continue
            text = "\n".join("".join(p.itertext()) for p in cell.findall("x:p", ns))
            repeat = int(cell.get("{" + ns["t"] + "}number-columns-repeated", "1"))
            cells.extend([text] * min(repeat, 32))
        if any(cells):
            repeat = int(row.get("{" + ns["t"] + "}number-rows-repeated", "1"))
            values.extend([cells] * min(repeat, 10000))
    aliases = {
            "事業單位名稱(負責人) / 自然人姓名": "事業單位原名",
            "縣市 / 單位別": "縣市／單位別",
            "違反法規法條": "違反法規條款",
            "違法法規內容": "法條敘述",
            "災害發生日期": "職業災害之發生日期",
            "災害發生地": "職業災害之發生地點",
    }
    header_index = next((i for i, row in enumerate(values)
                         if "處分日期" in row and "處分字號" in row and "災害類型" in row), None)
    if header_index is None:
        raise ValueError("職災來源檔缺少處分日期、處分字號或災害類型標題")
    header = [aliases.get(x, x) for x in values[header_index]]
    return [dict(zip(header, row)) for row in values[header_index + 1:]]


