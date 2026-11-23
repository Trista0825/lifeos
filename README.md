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
| 記帳・報表 | 帳戶餘額（不含信用卡，可展開看收支類別）、信用卡費、前月帳戶餘額對帳（差額＝1 號餘額−前月結餘）、共同生活開銷 |
| 記帳・扣款 | 固定扣款（信用卡、貸款…）：每月扣款清單與狀態、各扣款帳戶「目前餘額／待扣／扣完剩」與不足提醒、信用卡本期刷卡合計；扣款日與結帳日顯示在行事曆 |
| 月初對帳 | 記帳 → 報表 →「開始對帳」（每月 1–10 號今天頁也會提醒）：填各帳戶實際餘額，自動建立／更新期初餘額，列出有差額帳戶的上月明細 |
| 記帳・明細 | 最上面可**篩選帳戶**（支付方式／入帳銀行），列出該帳戶當月明細與小計（信用卡：刷卡、回饋、淨額；帳戶：期初、收入、支出、結餘）。依日期分組的全部紀錄（**含帳戶互轉**，標示「不計入總覽」），點一筆可編輯／刪除 |
| 待辦 | 依「逾期／今天／接下來／未排日期」分組；可設優先度與**重複**（完成後自動建立下一次） |
| 行事曆 | 月曆（藍點＝行程、橘點＝待辦到期）；行程可設全天、時段、**每天／每週／每月／每年重複**與結束日 |
| 習慣 | 設定每週哪幾天要做、每日打卡、近 7 天紀錄、連續天數 🔥，可暫停 |
| 筆記 | 「筆記」可釘選、加標籤；「日記」每天一篇、可記心情；兩者都能搜尋 |

- 右下角 **＋** 會依目前頁面新增對應項目。
- 記一筆可選「支出／收入／**轉帳**」：轉帳一次建立轉出、轉入兩筆，修改刪除也會一起；報表有「帳戶互轉檢查」找出只記了一邊的轉帳。
- 記帳表單上方有**常用按鈕**：釘選的優先，其餘依最常記的項目自動產生；在設定頁管理。
- **離線也能新增和修改**：右上角會顯示「離線・N 筆待上傳」，連上網路後自動上傳。
- 想讓總覽再排除其他類別（例如各種「餘額」），在 `app.js` 開頭的 `DASH_EXCLUDE` 加上類別名稱即可。
- 回到 App 時會自動同步；右上 ⟳ 可手動同步。
- 也可以直接在試算表裡看資料、做樞紐分析或匯出。

---

## 共同帳（和伴侶分帳、共同基金、代墊應收）

**在哪裡**：記帳 →「分帳」。今天頁也會顯示累計。

- **各付各的、累計結算**：你記帳勾「和○○共同」→ 共同帳自動一筆（你付、對方分攤一半）；改金額、刪除會同步。
  也可以在分帳頁直接記，選「對半／全額代付／自訂對方要負擔多少」。
  最上面是累計「張咘要給你 $X」，按「記錄還款」可還一部分，剩的繼續累計；填了帳戶會同時記到你的個人帳（類別「共同結算」）。
- **共同基金**：「存入基金」（預設 5000；你存的會記成你個人帳「共同基金」支出）、「用基金付」。顯示餘額、本月各自存多少、累計誰多存。
- **代墊應收**（同事等）：記帳時勾「幫別人代墊」，可填人數（自動算你的部分）或先空著。
  分帳頁的「代墊應收」按「收到錢」→ 記成「代墊收回」收入並連到原本那筆；收齊自動結案，人數不定的可手動「結案」。
- **總覽**：別人還你的錢（代墊收回、共同結算、其他收入(代付)）會從支出扣掉，不算收入。
- **舊資料**：分帳頁上方會提示 8 月起還沒轉入的「(共同)」，按「檢查並轉入」，可逐筆改成「基金付」或取消。

### 給伴侶用（只看得到共同帳）
1. 設定 →「共同帳」：填你的稱呼（LINE 回覆和他的畫面會用）和伴侶稱呼 → 儲存。
2. 按「產生連結」→「複製連結」→ 用 LINE 私訊傳給他。
3. 他用手機瀏覽器（iPhone 用 Safari）打開 → 自動設定好 → 加入主畫面。
   他只會看到共同帳；你的個人帳、帳戶、薪資他都看不到（後端擋住，不只是畫面隱藏）。他不能修改你記的項目。
4. 連結外流時按「重新產生」，舊連結立刻失效。

## LINE 群組自動記帳

張咘在你們的記帳群組傳「晚餐250」或「水果480 娃娃機70」，機器人會自動記成「張咘付、對半」並回覆。
只記張咘的訊息（你的請在 App 記，避免重複）。機器人只用「回覆」，不花推播額度，免費方案即可。

**設定（約 15 分鐘，只要一次）**
1. 到 LINE Official Account Manager（manager.line.biz）建立一個官方帳號（免費方案即可）。
2. 官方帳號的「設定 → Messaging API」→ 啟用 Messaging API。
3. 「設定 → 帳號設定」把「加入群組或多人聊天室」改成接受；「回應設定」裡開啟 Webhook、關閉自動回應訊息和加入好友的歡迎訊息。
4. 到 LINE Developers（developers.line.biz）→ 你的 channel →「Messaging API」分頁 → Channel access token（long-lived）按 Issue → 複製。
5. Apps Script → 專案設定 → 指令碼屬性 → 新增 `LINE_CHANNEL_TOKEN`，貼上剛剛的 token。
6. 換上新版 `Code.gs` → 部署 → 管理部署作業 → 編輯 → 新版本。
7. 編輯器選函式 **`setupLine`** → 執行 → 執行紀錄會出現 Webhook URL（App 的設定頁「共同帳」也看得到）。
8. LINE Developers →「Messaging API」→ Webhook URL 貼上 → Update → 打開「Use webhook」。
   （按 Verify 可能顯示錯誤，這是 Apps Script 網址轉址造成的，直接用下一步實際測試即可。）
9. 用手機掃官方帳號的 QR code 加好友 → 邀請它進你們的記帳群組。
10. 在群組裡：**你**傳「綁定記帳」→ **張咘**傳「我是張咘」。完成！

**張咘可以這樣傳**
- `晚餐250`、`午餐 365`、`水果480 娃娃機70 安全帽罩子175`（一則多筆）
- `代付 果乾200` 或 `果乾200(代付)` → 全額代付（你要還全部）
- `基金 晚餐350` → 用共同基金付
- `11/20 晚餐250` → 記在 11/20
- 沒寫金額的品項（例如「下午茶」）不會記，機器人會請他補
- `復原`：刪掉他上一則記的；`結算`：回覆目前誰欠誰（你也可以用）；`說明`：格式說明

**安全性**：Webhook 網址帶一組只有你知道的密鑰，而且只處理綁定的群組、只記張咘的帳號。
要重新綁定時，在 Apps Script 執行 `resetLineBinding()`。

## 匯入刷卡／電子支付截圖（Gemini 辨識）

**設定（只要一次）**
1. 到 Google AI Studio（aistudio.google.com）登入 → 「Get API key」→ 建立金鑰 → 複製。
2. Apps Script 編輯器左側 ⚙「專案設定」→ 最下面「指令碼屬性」→「新增指令碼屬性」：
   屬性 `GEMINI_API_KEY`，值貼上金鑰 → 儲存。
3. 函式選單選 **`testGemini`** → 執行。會要求新的授權（「連線到外部服務」），允許後在執行紀錄看到「✅ Gemini 可以使用」。
4. 部署 → 管理部署作業 → ✏ 編輯 → 新版本 → 部署。
5. （選用）想指定模型：再新增指令碼屬性 `GEMINI_MODEL`，例如 `gemini-3.7-flash`。沒設定時會自動依序嘗試新到舊的 Flash 模型。

**使用**：記帳 → 明細 →「📷 匯入刷卡／電子支付截圖」
1. 先選這是哪個帳戶的截圖（或「讓 App 自動判斷」）→ 選截圖（可多張）。
2. 確認畫面：可改日期、內容、金額、類型、類別、勾共同；取消勾選不要的。
   - 已經記過的（同金額、日期差 1 天內）會標「可能已記過」並預設不勾。
   - 沒年份的自動補成最近的年份；截圖看不到日期的標紅，要補上才能匯入。
   - 刷卡回饋／退款 → 記成這張卡的收入「刷卡回饋」，卡費預估會自動扣掉。
   - 電子錢包「從銀行儲值」→ 記成轉帳（銀行 → 錢包）。
   - 自動判斷帳戶的順序：之前記住的末四碼 → 截圖上的銀行／錢包名稱 → 跟你已記的帳比對推測。
3. 按「匯入勾選的 N 筆」。有末四碼的卡，會記住對應的帳戶，下次自動帶入（存在這台裝置）。

**貼上文字**：同一個畫面切到「📋 貼上文字」，貼上從網銀、App、Excel 或帳單 Email 複製的交易紀錄 →「解析」。
- 一行一筆（有日期和金額）的格式直接在手機上解析，不會送出去；支援「日期單獨一行、下面接交易」、+/− 號、NT$／$／TWD，「餘額 NT$xxx」會自動略過。
- 排版亂掉的（例如一筆交易分成好幾行）會交給 Gemini 讀；沒網路或沒設定金鑰時，改用手機解析並提醒你核對。
- 類別：先沿用你以前同樣內容記的類別，沒有的話用關鍵字猜（超商→餐食、捷運→交通、蝦皮→家用…）。

注意：Gemini 免費額度送出的內容可能被 Google 用來改善產品；不想這樣可在 AI Studio 綁定付費帳戶。

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
| Transactions | id, date, type(income/expense), amount, category, account, note, createdAt, updatedAt, link（轉帳兩筆共用）, reimb（代墊）, myShare（自己負擔）, refId（收回連到哪筆代墊）, closed（代墊結案） |
| Tasks | id, title, note, due, priority(1一般/2中/3高), done, doneAt, createdAt, updatedAt, repeat |
| Events | id, title, date, start, end, allDay, location, note, createdAt, updatedAt, repeat, repeatUntil |
| Routines | id, name, days(0=日…6=六，如 `12345`=平日), active, sort, createdAt, updatedAt |
| RoutineLogs | id, routineId, date, createdAt（有一筆＝當天完成） |
| Bills | id, name, kind(card/fixed), card, payAccount, closeDay, dueDay, dueOffset(0當月/1次月), amount, category, recordNote, overrides(各月實際金額 JSON), active, sort, createdAt, updatedAt |
| Shared | id, date, kind(expense/settle/fund_in), payer(me/partner/fund), amount, split(half/full/custom), otherShare, note, category, createdBy(me/partner/line), txId, lineMsgId, createdAt, updatedAt |
| Quick | id, name, type, amount, category, account, shared, sort, createdAt, updatedAt（釘選的常用按鈕） |
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
