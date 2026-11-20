# LifeOS 生活管理 App

把記帳、待辦、行事曆、例行公事放在同一個 App。
手機、電腦都能用（PWA，可加到主畫面），資料存在**你自己的 Google 試算表**。

```
┌──────────────┐   HTTPS (JSON)   ┌──────────────────┐     ┌──────────────┐
│ PWA 前端      │ ───────────────▶ │ Apps Script API   │ ──▶ │ Google 試算表 │
│ (GitHub Pages)│ ◀─────────────── │ (doPost + Token)  │     │ 5 個工作表    │
└──────────────┘                  └──────────────────┘     └──────────────┘
```

## 資料夾內容

| 路徑 | 說明 |
|---|---|
| `backend/Code.gs` | 後端程式，貼到 Apps Script |
| `backend/appsscript.json` | Apps Script 設定（時區等，選用） |
| `web/` | 前端，整個資料夾上傳到 GitHub Pages |

---

## 部署流程（第一次約 15 分鐘）

### 步驟 1：建立試算表與後端

1. 到 Google 雲端硬碟 → 新增 → **Google 試算表**，命名為 `LifeOS`。
2. 試算表上方選單 **擴充功能 → Apps Script**。
3. 把編輯器裡預設的 `程式碼.gs` 內容全部刪掉，貼上 `backend/Code.gs` 的全部內容，按 💾 儲存。
4. （建議）左側 ⚙「專案設定」→ 時區改成 `(GMT+08:00) 台北`。
5. 上方函式下拉選單選 **`setup`** → 按 **執行**。
   - 第一次會要求授權：選你的帳號 →「進階」→「前往 LifeOS（不安全）」→ 允許。
     （這是因為腳本是你自己寫的、沒經過 Google 審核，屬正常現象。）
6. 下方「執行紀錄」會出現：`設定完成。你的 API Token：xxxxxxxx` → **複製這串 Token**。
   回到試算表，會看到 `Transactions / Tasks / Events / Routines / RoutineLogs` 5 個工作表。

### 步驟 2：部署成網頁應用程式（API）

1. Apps Script 右上角 **部署 → 新增部署作業**。
2. 齒輪 ⚙ 選 **網頁應用程式**。
3. 設定：
   - 執行身分：**我**
   - 誰可以存取：**所有人**
4. 按「部署」，複製 **網頁應用程式網址**（結尾是 `/exec`）。

> 「所有人」是為了讓 App 不用登入 Google 就能呼叫；資料安全靠 Token 保護，
> 沒有正確 Token 的請求一律拒絕。Token 外洩時執行 `resetToken()` 換一組即可。

### 步驟 3：把前端放上網（GitHub Pages，免費）

1. 註冊／登入 GitHub → 右上 **＋ → New repository**，名稱例如 `lifeos`，選 Public → Create。
2. 在新 repo 頁面點 **uploading an existing file**，把 `web/` 資料夾**裡面的所有檔案**
   （`index.html`、`app.js`、`styles.css`、`manifest.json`、`sw.js`、`icons/` 資料夾）拖進去 → Commit。
3. repo 的 **Settings → Pages** → Source 選 `Deploy from a branch`，Branch 選 `main` / `(root)` → Save。
4. 等 1–2 分鐘，網址會是 `https://你的帳號.github.io/lifeos/`。

> Token 不會寫在程式碼裡（是在 App 內輸入、存在你的裝置上），所以 repo 公開也沒關係。

### 步驟 4：開始使用

1. 用手機或電腦打開上面的網址，第一次會進入「設定」頁。
2. 貼上 **步驟 2 的 /exec 網址** 和 **步驟 1 的 Token** → 「儲存並測試連線」。
3. 出現「連線成功」就完成了。
4. 加到主畫面：
   - **iPhone**：Safari → 分享 → 加入主畫面
   - **Android**：Chrome → ⋮ → 安裝應用程式／加到主畫面
   - **電腦**：Chrome 網址列右邊的安裝圖示
5. 每台裝置都要輸入一次網址和 Token。

---

## 功能說明

| 頁面 | 功能 |
|---|---|
| 今天 | 今日行程、例行公事打卡、今天與逾期待辦、本月收支、快速記帳／待辦／行程／日記 |
| 記帳・總覽 | 收入／支出／結餘、比上月、日平均、共同支出、每日支出圖、支出／收入類別、支付方式、近 6 個月趨勢（**不含帳戶互轉**） |
| 記帳・明細 | 依日期分組的全部紀錄（**含帳戶互轉**，標示「不計入總覽」），點一筆可編輯／刪除 |
| 待辦 | 依「逾期／今天／接下來／未排日期」分組；可設優先度與**重複**（完成後自動建立下一次） |
| 行事曆 | 月曆（藍點＝行程、橘點＝待辦到期）；行程可設全天、時段、**每天／每週／每月／每年重複**與結束日 |
| 習慣 | 設定每週哪幾天要做、每日打卡、近 7 天紀錄、連續天數 🔥，可暫停 |
| 筆記 | 「筆記」可釘選、加標籤；「日記」每天一篇、可記心情；兩者都能搜尋 |

- 右下角 **＋** 會依目前頁面新增對應項目。
- **離線也能新增和修改**：右上角會顯示「離線・N 筆待上傳」，連上網路後自動上傳。
- 想讓總覽再排除其他類別（例如各種「餘額」），在 `app.js` 開頭的 `DASH_EXCLUDE` 加上類別名稱即可。
- 回到 App 時會自動同步；右上 ⟳ 可手動同步。
- 也可以直接在試算表裡看資料、做樞紐分析或匯出。

---

## 從 v1 更新到 v2

1. **先更新後端**：Apps Script 貼上新的 `Code.gs`（全部取代）→ 儲存 → 執行一次 `setup()`
   （補上新欄位與「Notes」工作表，**不會刪資料、Token 不變**）
   → 部署 → 管理部署作業 → ✏ 編輯 → 版本選「新版本」→ 部署。
2. **再更新前端**：把 `web/` 裡的 `index.html`、`app.js`、`styles.css`、`sw.js` 上傳到 GitHub 覆蓋 → Commit。
3. 手機把 App 完全關掉再開；設定頁最下面顯示 **LifeOS v2.0.0** 就完成了。

## 之後要修改程式怎麼做

**改後端（Code.gs）**：修改後儲存 → **部署 → 管理部署作業 → ✏ 編輯 → 版本選「新版本」→ 部署**。
這樣網址不會變，不用重新設定 App。（如果按「新增部署作業」，網址會變。）

**改前端（web/）**：在 GitHub 上編輯或重新上傳檔案，並把 `sw.js` 第一行的
`lifeos-v1` 改成 `lifeos-v2`（依此類推），使用者下次開 App 就會拿到新版。

**想在自己電腦上試跑前端**：在 `web/` 資料夾執行 `python3 -m http.server 8000`，
打開 `http://localhost:8000`。

---

## 資料表結構

| 工作表 | 欄位 |
|---|---|
| Transactions | id, date, type(income/expense), amount, category, account, note, createdAt, updatedAt |
| Tasks | id, title, note, due, priority(1一般/2中/3高), done, doneAt, createdAt, updatedAt, repeat |
| Events | id, title, date, start, end, allDay, location, note, createdAt, updatedAt, repeat, repeatUntil |
| Routines | id, name, days(0=日…6=六，如 `12345`=平日), active, sort, createdAt, updatedAt |
| RoutineLogs | id, routineId, date, createdAt（有一筆＝當天完成） |
| Notes | id, kind(note/diary), title, content, date, mood, tags, pinned, createdAt, updatedAt |

repeat：`daily` / `weekly` / `monthly` / `yearly`（空白＝不重複）。每月 31 號的項目在小月會對齊到月底。

## API（POST 到 /exec，body 為 JSON）

```json
{ "token": "…", "action": "list",   "entity": "Transactions", "from": "2026-11-01", "to": "2026-11-30" }
{ "token": "…", "action": "create", "entity": "Tasks", "data": { "title": "繳電話費", "due": "2026-11-25" } }
{ "token": "…", "action": "update", "entity": "Tasks", "id": "…", "data": { "done": true } }
{ "token": "…", "action": "remove", "entity": "Events", "id": "…" }
{ "token": "…", "action": "setRoutineLog", "routineId": "…", "date": "2026-11-20", "done": true }
{ "token": "…", "action": "batch", "requests": [ { "action": "list", "entity": "Tasks" } ] }
```

## 常見問題

- **連線失敗：Token 錯誤** → 在 Apps Script 執行 `showToken()` 看正確 Token。
- **連線失敗：Failed to fetch** → 確認網址結尾是 `/exec`（不是 `/dev`），且部署時「誰可以存取」選「所有人」。
- **改了 Code.gs 沒生效** → 要「管理部署作業 → 編輯 → 新版本」，只按儲存不會更新線上版本。
- **反應有點慢（約 1–2 秒）** → Apps Script 的正常速度；App 會先更新畫面再背景儲存（打卡、勾待辦）。

## 下一步可以加的功能

1. 常用按鈕（一鍵帶入內容、金額、類別、支付方式）
2. 分類預算
3. 固定支出每月自動產生
4. 各帳戶餘額
5. 重複行程「只改這一次」
