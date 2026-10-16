# 高風險廠場事業單位職災及違規紀錄查詢系統（B 方案）

這是公開查詢網站的 B 方案複本，可與 A 方案 `mock_osha_query/` 並存比較。A 方案檔案沒有覆寫。

公開網站：<https://fefe9487.github.io/fire-explosion-risk-site-b/>

本機開啟：

```bash
python -m http.server 8765
```

然後打開 `http://127.0.0.1:8765/index.html`。

離線單檔可執行 `python pack_demo.py`，產生 `demo.html`。

網站依閱讀順序分成三頁：

1. `index.html`：首頁，先介紹高風險廠場定義，搭配三張懶人包圖解。資料來源、收錄期間及統計方法預設收合，需要時再展開；連往細節的網址會自動展開對應說明。
2. `gaps.html`：限同一高風險廠場名單所屬事業單位的裁罰、職災統計，以及相關規定及指引。統計範圍摘要常駐顯示，詳細計算說明預設收合。
3. `query.html`：輸入事業單位名稱或統一編號，選定公司後顯示公開紀錄。

公司查詢的裁罰處分收錄 105/09/12 至 115/10/01，約 10 年；職災處分依目前公開資料的收錄期間顯示。統計頁採民國 113 至 115 年，115 年為部分年度。

目前名單為 973 筆廠場，按查詢頁相同的統編合併規則計為 682 家事業單位。裁罰、職災與查詢頁的常見條文選項均使用這份名單；不再使用全臺統計。重新計算方式：

```bash
python build_roster_statistics.py
python pack_demo.py
node verify-roster.cjs
node verify-pages.cjs
node verify-filters.cjs
```

統計來源為 `plants.json`、`penalties.json`、`accidents.json`、`tax-rollup.json`、`pacs.json`；條文範圍沿用 `gap-penalty.json` 的 `fireCriteria`。同一統編底下的紀錄合併後，裁罰按處分字號與法規、職災按處分字號與災害類型去重。重大職災公開網依統編、災害類型、發生日期核對既有職災，重複者不另計入。重算只更新統計範圍與整理日期，保留原始來源的更新日、截止日。

`verify-roster.cjs` 直接呼叫查詢頁的公司紀錄整理函式，獨立核對每個法規／年度、條文／年度及災害類型／年度件數，並確認未列入名單的紀錄不會混入。`build_national_accident.py`、`verify-national.py` 與 `reviewed_accident_interpretation.json` 保留作為歷史全臺資料處理參考，非現行統計產製流程；請勿用舊流程覆寫現行統計。

`method.html` 保留為首頁說明的相容入口。三頁使用 `assets/site.css`；三張懶人包為可縮放 SVG 圖片，並提供替代文字和文字圖說。`demo.html` 內嵌所有圖片與資料，離線預設入口也是首頁。

頁面不會主動列出場所清冊。這仍是瀏覽器端查詢：`data/plants.json`、`data/penalties.json`、`data/accidents.json` 與打包後的 `demo.html` 都含完整場所資料，知道網址的人可以直接下載。

名稱就是公司本身、後面沒有廠別的那一筆，收下同統編還沒分到各廠的紀錄。名稱後面有廠別的，只計能對到該廠的。仍然對不到的，先不放上公開查詢。職安法第6條不因敘述出現「火災」或「爆炸」就標紅；確認是防爆、可燃性氣體或粉塵、動火、靜電、發火源，或已發生火災爆炸，才標紅並計入。
