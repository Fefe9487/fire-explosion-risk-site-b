# 事業單位職災與違規紀錄查詢（B 方案）

這是公開查詢網站的 B 方案複本，可與 A 方案 `mock_osha_query/` 並存比較。A 方案檔案沒有覆寫。

公開網站：<https://fefe9487.github.io/fire-explosion-risk-site-b/>

本機開啟：

```bash
python -m http.server 8765
```

然後打開 `http://127.0.0.1:8765/index.html`。

離線單檔可執行 `python pack_demo.py`，產生 `demo.html`。

B 方案改成先輸入事業單位名稱或統一編號，選定一筆後才顯示該單位的職災與裁罰。頁面不會主動列出場所清冊。這仍是瀏覽器端查詢：`data/plants.json`、`data/penalties.json`、`data/accidents.json` 與打包後的 `demo.html` 都含完整場所資料，知道網址的人可以直接下載。

名稱就是公司本身、後面沒有廠別的那一筆，收下同統編還沒分到各廠的紀錄。名稱後面有廠別的，只計能對到該廠的。仍然對不到的，先不放上公開查詢。職安法第6條不因敘述出現「火災」或「爆炸」就標紅；確認是防爆、可燃性氣體或粉塵、動火、靜電、發火源，或已發生火災爆炸，才標紅並計入。
