/**
 * LifeOS 後端 — Google Apps Script
 * 資料存放在綁定的 Google 試算表，每個資料表一個工作表。
 *
 * 第一次使用：在 Apps Script 編輯器選擇函式 setup → 執行 → 授權，
 * 再到「執行紀錄」複製 API Token。
 *
 * 從舊版更新：貼上新程式碼 → 執行一次 setup()（不會刪資料、Token 不變）
 *            → 部署 → 管理部署作業 → 編輯 → 新版本。
 */

const APP_VERSION = '1.6.1';

// 資料表定義：欄位順序 = 工作表欄位順序。
// 新增欄位一律加在最後面，舊資料才不會錯位。
const SCHEMA = {
  Transactions: {
    // link：轉帳的兩筆（轉出、轉入）共用同一個 link
    // reimb：幫別人代墊（之後會收回）；myShare：自己負擔的部分；refId：收回的錢連到哪一筆代墊；closed：代墊已結案
    fields: ['id', 'date', 'type', 'amount', 'category', 'account', 'note', 'createdAt', 'updatedAt', 'link', 'reimb', 'myShare', 'refId', 'closed'],
    types: { date: 'date', amount: 'number', reimb: 'bool', myShare: 'number', closed: 'bool' },
    required: ['date', 'type', 'amount'],
  },
  Tasks: {
    // repeat：'' | daily | weekly | monthly | yearly
    fields: ['id', 'title', 'note', 'due', 'priority', 'done', 'doneAt', 'createdAt', 'updatedAt', 'repeat'],
    types: { due: 'date', priority: 'number', done: 'bool' },
    required: ['title'],
  },
  Events: {
    fields: ['id', 'title', 'date', 'start', 'end', 'allDay', 'location', 'note', 'createdAt', 'updatedAt', 'repeat', 'repeatUntil'],
    types: { date: 'date', start: 'time', end: 'time', allDay: 'bool', repeatUntil: 'date' },
    required: ['title', 'date'],
  },
  Routines: {
    // days：一週中要執行的日子，0=週日 … 6=週六，例如 "12345" 代表平日
    fields: ['id', 'name', 'days', 'active', 'sort', 'createdAt', 'updatedAt'],
    types: { active: 'bool', sort: 'number' },
    required: ['name'],
  },
  RoutineLogs: {
    fields: ['id', 'routineId', 'date', 'createdAt'],
    types: { date: 'date' },
    required: ['routineId', 'date'],
  },
  Notes: {
    // kind：note（筆記）| diary（日記）
    fields: ['id', 'kind', 'title', 'content', 'date', 'mood', 'tags', 'pinned', 'createdAt', 'updatedAt'],
    types: { date: 'date', pinned: 'bool' },
    required: ['kind'],
  },
  Shared: {
    // 共同帳（你和伴侶都看得到）
    // kind：expense 共同支出｜settle 還款｜fund_in 存入共同基金
    // payer：me 你｜partner 伴侶｜fund 共同基金（只用在 expense）
    // split：half 對半｜full 全額代付｜custom 自訂；otherShare：沒付錢的那一方要負擔的金額
    // createdBy：me｜partner｜line；txId：連到你個人帳的那一筆；lineMsgId：LINE 訊息編號（避免重複）
    fields: ['id', 'date', 'kind', 'payer', 'amount', 'split', 'otherShare', 'note', 'category', 'createdBy', 'txId', 'lineMsgId', 'createdAt', 'updatedAt'],
    types: { date: 'date', amount: 'number', otherShare: 'number' },
    required: ['date', 'kind', 'payer', 'amount'],
  },
  Quick: {
    // 記帳表單的常用按鈕（釘選的項目）
    fields: ['id', 'name', 'type', 'amount', 'category', 'account', 'shared', 'sort', 'createdAt', 'updatedAt'],
    types: { amount: 'number', shared: 'bool', sort: 'number' },
    required: ['name', 'type'],
  },
  Bills: {
    // 固定扣款設定。kind：card（信用卡，金額依帳單）| fixed（固定金額，如貸款）
    // dueOffset：0＝結帳當月扣款，1＝結帳次月扣款；overrides：各月實際帳單金額 JSON，如 {"2026-12":7338}
    fields: ['id', 'name', 'kind', 'card', 'payAccount', 'closeDay', 'dueDay', 'dueOffset', 'amount', 'category', 'recordNote', 'overrides', 'active', 'sort', 'createdAt', 'updatedAt'],
    types: { closeDay: 'number', dueDay: 'number', dueOffset: 'number', amount: 'number', active: 'bool', sort: 'number' },
    required: ['name', 'kind', 'payAccount', 'dueDay'],
  },
};

const REPEATS = ['', 'daily', 'weekly', 'monthly', 'yearly'];

/* ───────────── 初始化 ───────────── */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    writeHeader_(sh, name);
  });
  // 刪掉預設的空白工作表
  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) {
    props.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('設定完成。你的 API Token：' + props.getProperty('API_TOKEN'));
}

function writeHeader_(sh, name) {
  const fields = SCHEMA[name].fields;
  sh.getRange(1, 1, 1, fields.length).setValues([fields]).setFontWeight('bold');
  sh.setFrozenRows(1);
  // 全部存成純文字，避免試算表自動把日期、時間轉格式
  sh.getRange(1, 1, sh.getMaxRows(), fields.length).setNumberFormat('@');
}

/** 忘記 Token 時執行這個函式查看 */
function showToken() {
  Logger.log('API Token：' + PropertiesService.getScriptProperties().getProperty('API_TOKEN'));
}

/** 想換一組新 Token 時執行（舊 Token 立即失效） */
function resetToken() {
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  showToken();
}

/* ───────────── HTTP 入口 ───────────── */

function doGet() {
  return json_({ ok: true, app: 'LifeOS', version: APP_VERSION });
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // LINE 群組機器人：網址帶 ?line=密鑰 才處理
    if (req.events && e.parameter && e.parameter.line) {
      const key = props.getProperty('LINE_WEBHOOK_KEY');
      const keyOk = !!key && e.parameter.line === key;
      lineLog_({ at: new Date().toISOString(), keyOk: keyOk, events: (req.events || []).length, steps: [] }, true);
      if (keyOk) handleLine_(req);
      return json_({ ok: true });
    }
    const owner = props.getProperty('API_TOKEN');
    const partner = props.getProperty('PARTNER_TOKEN');
    let role = '';
    if (owner && req.token === owner) role = 'owner';
    else if (partner && req.token === partner) role = 'partner';
    if (!role) return json_({ ok: false, error: 'Token 錯誤或尚未執行 setup()' });
    return json_(handle_(req, role));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// 伴侶 Token 只能用共同帳
const PARTNER_ACTIONS = ['ping', 'whoami', 'list', 'create', 'update', 'remove'];

function handle_(req, role) {
  role = role || 'owner';
  if (req.action === 'batch') {
    const results = (req.requests || []).map(function (r) {
      try { return handle_(r, role); } catch (err) { return { ok: false, error: String(err.message || err) }; }
    });
    return { ok: true, results: results };
  }
  if (role === 'partner') {
    if (PARTNER_ACTIONS.indexOf(req.action) < 0) throw new Error('沒有權限');
    if (['list', 'create', 'update', 'remove'].indexOf(req.action) >= 0 && req.entity !== 'Shared') throw new Error('沒有權限');
    if (req.action === 'update' || req.action === 'remove') {
      const row = findShared_(req.id);
      if (row && row.createdBy === 'me') throw new Error('這筆是對方記的，只有她能修改');
    }
  }
  if (req.action === 'create' && req.entity === 'Shared') {
    req.data = Object.assign({}, req.data, { createdBy: role === 'partner' ? 'partner' : 'me' });
  }
  switch (req.action) {
    case 'ping': return { ok: true, version: APP_VERSION, role: role };
    case 'whoami': return { ok: true, data: whoami_(role) };
    case 'shareConfig': return { ok: true, data: shareConfig_(req.data) };
    case 'resetPartnerToken': return { ok: true, data: resetPartnerToken_() };
    case 'list': return { ok: true, data: list_(req.entity, req.from, req.to) };
    case 'create': return withLock_(function () { return { ok: true, data: create_(req.entity, req.data || {}) }; });
    case 'update': return withLock_(function () { return { ok: true, data: update_(req.entity, req.id, req.data || {}) }; });
    case 'remove': return withLock_(function () { remove_(req.entity, req.id); return { ok: true }; });
    case 'setRoutineLog': return withLock_(function () { return { ok: true, data: setRoutineLog_(req.routineId, req.date, req.done, req.id) }; });
    case 'parseStatement': return { ok: true, data: parseStatement_(req) };
    case 'toggleRoutine': return withLock_(function () { return { ok: true, data: toggleRoutine_(req.routineId, req.date) }; });
    default: throw new Error('未知的 action：' + req.action);
  }
}

/* ───────────── 資料存取 ───────────── */

// 取得工作表；不存在就建立，欄位比定義少（舊版）就自動補上標題
function sheet_(entity) {
  if (!SCHEMA[entity]) throw new Error('未知的資料表：' + entity);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(entity);
  if (!sh) {
    sh = ss.insertSheet(entity);
    writeHeader_(sh, entity);
  } else if (sh.getLastColumn() < SCHEMA[entity].fields.length) {
    writeHeader_(sh, entity);
  }
  return sh;
}

function list_(entity, from, to) {
  const sh = sheet_(entity);
  const def = SCHEMA[entity];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, def.fields.length).getValues();
  const dateField = def.types.date ? 'date' : null;
  return values
    .filter(function (row) { return row[0] !== '' && row[0] !== null; })
    .map(function (row) { return fromRow_(entity, row); })
    .filter(function (r) {
      if (!dateField) return true;
      if (from && r[dateField] < from) return false;
      if (to && r[dateField] > to) return false;
      return true;
    });
}

// 可由前端指定 id（離線新增時需要）。同一個 id 重送時直接回傳既有資料，不會重複新增。
function create_(entity, data) {
  const def = SCHEMA[entity];
  const sh = sheet_(entity);
  const wantId = validId_(data.id) ? String(data.id) : '';
  if (wantId) {
    const existing = findRow_(sh, wantId);
    if (existing) return fromRow_(entity, sh.getRange(existing, 1, 1, def.fields.length).getValues()[0]);
  }
  validate_(entity, data);
  const now = nowIso_();
  const rec = clean_(entity, data);
  rec.id = wantId || Utilities.getUuid();
  rec.createdAt = validIso_(data.createdAt) ? data.createdAt : now;
  if (def.fields.indexOf('updatedAt') >= 0) rec.updatedAt = now;
  if (entity === 'Tasks' && rec.done && !rec.doneAt) rec.doneAt = now;
  if (entity === 'Shared') normalizeShared_(rec);
  const values = toRow_(entity, rec);
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, def.fields.length).setNumberFormat('@').setValues([values]);
  return fromRow_(entity, values); // 回傳完整欄位（沒填的欄位也有預設值）
}

function update_(entity, id, data) {
  const def = SCHEMA[entity];
  const sh = sheet_(entity);
  const rowIdx = findRow_(sh, id);
  if (!rowIdx) throw new Error('找不到資料（可能已在其他裝置刪除）');
  const current = fromRow_(entity, sh.getRange(rowIdx, 1, 1, def.fields.length).getValues()[0]);
  const patch = clean_(entity, data);
  const merged = Object.assign({}, current, patch, { id: current.id, createdAt: current.createdAt });
  validate_(entity, merged);
  if (def.fields.indexOf('updatedAt') >= 0) merged.updatedAt = nowIso_();
  if (entity === 'Shared') { merged.createdBy = current.createdBy; normalizeShared_(merged); }
  if (entity === 'Tasks') {
    if (merged.done && !current.done) merged.doneAt = nowIso_();
    if (!merged.done) merged.doneAt = '';
  }
  sh.getRange(rowIdx, 1, 1, def.fields.length).setValues([toRow_(entity, merged)]);
  return merged;
}

// 找不到也視為成功（可能已經刪過），方便離線佇列重送
function remove_(entity, id) {
  const sh = sheet_(entity);
  const rowIdx = findRow_(sh, id);
  if (rowIdx) sh.deleteRow(rowIdx);
  // 刪除例行公事時，一併刪掉它的打卡紀錄
  if (entity === 'Routines') {
    const logs = sheet_('RoutineLogs');
    const last = logs.getLastRow();
    if (last >= 2) {
      const ids = logs.getRange(2, 2, last - 1, 1).getValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0]) === String(id)) logs.deleteRow(i + 2);
      }
    }
  }
}

// 設定某天是否完成（重送多次結果相同）
function setRoutineLog_(routineId, date, done, id) {
  if (!routineId || !date) throw new Error('缺少 routineId 或 date');
  const sh = sheet_('RoutineLogs');
  const last = sh.getLastRow();
  let foundRow = 0, found = null;
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 3).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) === String(routineId) && normDate_(rows[i][2]) === date) {
        foundRow = i + 2;
        found = fromRow_('RoutineLogs', rows[i].concat(['']));
        break;
      }
    }
  }
  if (done) {
    if (found) return { done: true, log: found };
    return { done: true, log: create_('RoutineLogs', { id: id, routineId: routineId, date: date }) };
  }
  if (foundRow) sh.deleteRow(foundRow);
  return { done: false };
}

// 舊版前端相容用
function toggleRoutine_(routineId, date) {
  const logs = list_('RoutineLogs').filter(function (l) { return l.routineId === routineId && l.date === date; });
  return setRoutineLog_(routineId, date, !logs.length);
}

/* ───────────── 共同帳 ───────────── */

function normalizeShared_(rec) {
  const amt = Number(rec.amount) || 0;
  if (rec.kind !== 'expense' || rec.payer === 'fund') { rec.split = ''; rec.otherShare = 0; return; }
  if (['half', 'full', 'custom'].indexOf(rec.split) < 0) rec.split = 'half';
  if (rec.split === 'half') rec.otherShare = Math.round(amt / 2 * 100) / 100;
  else if (rec.split === 'full') rec.otherShare = amt;
  else {
    const o = Number(rec.otherShare);
    if (!(o >= 0) || o > amt) throw new Error('自訂的分攤金額要在 0 到總額之間');
    rec.otherShare = o;
  }
}

function findShared_(id) {
  const sh = sheet_('Shared');
  const r = findRow_(sh, id);
  return r ? fromRow_('Shared', sh.getRange(r, 1, 1, SCHEMA.Shared.fields.length).getValues()[0]) : null;
}

function names_() {
  const p = PropertiesService.getScriptProperties();
  return { ownerName: p.getProperty('OWNER_NAME') || '我', partnerName: p.getProperty('PARTNER_NAME') || '伴侶' };
}

function whoami_(role) { return Object.assign({ role: role }, names_()); }

function shareConfig_(data) {
  const p = PropertiesService.getScriptProperties();
  if (data) {
    if (data.ownerName !== undefined) p.setProperty('OWNER_NAME', String(data.ownerName).trim() || '我');
    if (data.partnerName !== undefined) p.setProperty('PARTNER_NAME', String(data.partnerName).trim() || '伴侶');
  }
  const key = p.getProperty('LINE_WEBHOOK_KEY');
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* 編輯器以外可能取不到 */ }
  let lastHit = null;
  try { lastHit = JSON.parse(p.getProperty('LINE_LAST_HIT') || 'null'); } catch (e) { lastHit = null; }
  return Object.assign(names_(), {
    partnerToken: p.getProperty('PARTNER_TOKEN') || '',
    line: {
      configured: !!(p.getProperty('LINE_CHANNEL_TOKEN') && key),
      hasToken: !!p.getProperty('LINE_CHANNEL_TOKEN'),
      key: key || '',
      groupBound: !!p.getProperty('LINE_GROUP_ID'),
      partnerBound: !!p.getProperty('LINE_PARTNER_USER_ID'),
      webhookUrl: key && url && /\/exec$/.test(url) ? url + '?line=' + key : '',
      lastHit: lastHit,
    },
  });
}

function resetPartnerToken_() {
  PropertiesService.getScriptProperties().setProperty('PARTNER_TOKEN', 'p' + Utilities.getUuid().replace(/-/g, ''));
  return shareConfig_();
}

// 累計：伴侶欠你多少（正數＝伴侶要給你；負數＝你要給伴侶）
function sharedBalance_() {
  let owed = 0, fund = 0;
  list_('Shared').forEach(function (r) {
    const amt = Number(r.amount) || 0;
    if (r.kind === 'expense') {
      if (r.payer === 'me') owed += Number(r.otherShare) || 0;
      else if (r.payer === 'partner') owed -= Number(r.otherShare) || 0;
      else fund -= amt;
    } else if (r.kind === 'settle') {
      owed += r.payer === 'partner' ? -amt : amt;
    } else if (r.kind === 'fund_in') fund += amt;
  });
  return { owed: Math.round(owed * 100) / 100, fund: Math.round(fund * 100) / 100 };
}

/* ───────────── LINE 群組機器人 ─────────────
 * 設定：見 README「LINE 群組自動記帳」。指令碼屬性：LINE_CHANNEL_TOKEN（Channel access token）
 * 在編輯器執行 setupLine() 取得 Webhook 網址。
 */
function setupLine() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('LINE_WEBHOOK_KEY')) p.setProperty('LINE_WEBHOOK_KEY', Utilities.getUuid().replace(/-/g, ''));
  if (!p.getProperty('LINE_CHANNEL_TOKEN')) Logger.log('⚠️ 還沒設定指令碼屬性 LINE_CHANNEL_TOKEN');
  const url = ScriptApp.getService().getUrl();
  if (url && /\/exec$/.test(url)) Logger.log('Webhook URL：' + url + '?line=' + p.getProperty('LINE_WEBHOOK_KEY'));
  else Logger.log('⚠️ 這裡取得的網址不是正式部署（/exec）網址。請改用 App「設定 → 共同帳」顯示的 Webhook URL，'
    + '或自己組合：你在 App 設定的 Apps Script 網址（結尾 /exec）＋ ?line=' + p.getProperty('LINE_WEBHOOK_KEY'));
}

/** 想重新綁定群組或張咘的 LINE 帳號時執行 */
function resetLineBinding() {
  const p = PropertiesService.getScriptProperties();
  p.deleteProperty('LINE_GROUP_ID');
  p.deleteProperty('LINE_PARTNER_USER_ID');
  Logger.log('已清除綁定，請在群組重新傳「綁定記帳」和「我是' + names_().partnerName + '」');
}

const LINE_HELP = [
  '記帳格式（一則可記多筆）：',
  '・晚餐250　或　水果480 娃娃機70',
  '・代付 果乾200 → 你全額幫她付，她要還全部',
  '・基金 晚餐350 → 用共同基金付',
  '・11/20 晚餐250 → 記在 11/20',
  '指令：結算｜復原（刪掉你上一則記的）｜說明',
].join('\n');

function handleLine_(body) {
  const p = PropertiesService.getScriptProperties();
  (body.events || []).forEach(function (ev) {
    try {
      if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') { lineStep_(ev.type + '（不是文字訊息，略過）'); return; }
      const text = String(ev.message.text || '').trim();
      const src = ev.source || {};
      const groupId = src.groupId || src.roomId || '';
      const nm = names_();
      lineStep_('收到「' + text.slice(0, 30) + '」' + (groupId ? '' : '（不是在群組裡）'));
      if (text === '綁定記帳') {
        if (!groupId) return lineReply_(ev.replyToken, '請在你們的記帳群組裡傳「綁定記帳」');
        p.setProperty('LINE_GROUP_ID', groupId);
        return lineReply_(ev.replyToken, '✅ 已綁定這個群組。接下來請' + nm.partnerName + '傳「我是' + nm.partnerName + '」');
      }
      const boundGroup = p.getProperty('LINE_GROUP_ID');
      if (!boundGroup || groupId !== boundGroup) { lineStep_(boundGroup ? '不是綁定的群組，略過' : '還沒綁定群組（請先傳「綁定記帳」）'); return; } // 只處理綁定的群組
      if (text === '我是' + nm.partnerName) {
        p.setProperty('LINE_PARTNER_USER_ID', src.userId || '');
        return lineReply_(ev.replyToken, '✅ 好的，' + nm.partnerName + '傳的金額會自動記到共同帳。\n' + LINE_HELP);
      }
      if (text === '說明' || text === '?' || text === '？') return lineReply_(ev.replyToken, LINE_HELP);
      if (text === '結算') return lineReply_(ev.replyToken, balanceText_(nm));
      if (!src.userId || src.userId !== p.getProperty('LINE_PARTNER_USER_ID')) {
        lineStep_(p.getProperty('LINE_PARTNER_USER_ID') ? '不是' + nm.partnerName + '傳的，不記' : '還沒認出' + nm.partnerName + '（請他傳「我是' + nm.partnerName + '」）');
        return;
      } // 只記張咘的訊息
      if (text === '復原') return lineReply_(ev.replyToken, undoLine_());
      const parsed = parseLineText_(text, lineDate_(ev.timestamp));
      if (!parsed.items.length) { lineStep_('沒有找到金額，不記'); return; } // 沒有任何金額（例如聊天），不回覆
      const msgId = String(ev.message.id || '');
      const ids = withLock_(function () {
        if (msgId && list_('Shared').some(function (r) { return r.lineMsgId === msgId; })) return null; // 重送的訊息
        return parsed.items.map(function (it) {
          return create_('Shared', { date: it.date, kind: 'expense', payer: it.fund ? 'fund' : 'partner', amount: it.amount,
            split: it.full ? 'full' : 'half', note: it.name, category: '', createdBy: 'line', lineMsgId: msgId }).id;
        });
      });
      if (!ids) { lineStep_('重複的訊息，略過'); return; }
      lineStep_('✅ 記了 ' + ids.length + ' 筆');
      p.setProperty('LINE_LAST_BATCH', JSON.stringify(ids));
      lineReply_(ev.replyToken, recordedText_(parsed, nm));
    } catch (err) {
      lineStep_('❌ 錯誤：' + (err.message || err));
      try { lineReply_(ev.replyToken, '⚠️ 記帳失敗：' + (err.message || err)); } catch (e2) { /* 忽略 */ }
    }
  });
}

function lineDate_(ms) {
  return Utilities.formatDate(ms ? new Date(Number(ms)) : new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// 「水果480 娃娃機70 下午茶」→ 有金額的記下來，沒金額的列為缺漏
function parseLineText_(text, today) {
  let date = today;
  let t = String(text).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  const dm = t.match(/^\s*(?:(\d{4})[\/\.\-])?(\d{1,2})[\/\.\-](\d{1,2})\s+/);
  if (dm) {
    const y = dm[1] ? Number(dm[1]) : Number(today.slice(0, 4));
    let d = y + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2);
    if (!dm[1] && d > today) d = (y - 1) + d.slice(4); // 例如 1 月補記 12/30
    date = d; t = t.slice(dm[0].length);
  }
  const allFull = /(^|\s)代付(\s|$)/.test(t), allFund = /(^|\s)基金(\s|$)/.test(t);
  const tokens = t.replace(/(^|\s)(代付|基金)(?=\s|$)/g, ' ').split(/[\s,，、;；]+/).filter(Boolean);
  const items = [], missing = [];
  let pending = null;
  let pendFlags = null;
  tokens.forEach(function (raw) {
    // 「果乾200(代付)」「代付果乾200」「基金晚餐350」：先把標記拿掉再讀金額
    const flags = { full: /代付/.test(raw), fund: /^基金/.test(raw) };
    const tok = raw.replace(/[\(（]?代付[\)）]?/g, '').replace(/^基金/, '').trim();
    if (!tok) return;
    const m = tok.match(/^(.*?)(\d+(?:\.\d+)?)(?:元|塊)?$/);
    if (m && m[1] && !/^[\d\.\-\/]*$/.test(m[1])) { if (pending) missing.push(pending); pending = null; items.push(mkItem_(m[1], Number(m[2]), flags)); }
    else if (m && !m[1] && pending) { items.push(mkItem_(pending, Number(m[2]), { full: flags.full || pendFlags.full, fund: flags.fund || pendFlags.fund })); pending = null; }
    else if (!/\d/.test(tok)) { if (pending) missing.push(pending); pending = tok; pendFlags = flags; }
  });
  if (pending) missing.push(pending);
  function mkItem_(name, amount, f) {
    const n = name.replace(/[：:＝=]$/, '').trim();
    return { name: n || '共同支出', amount: amount, date: date, full: allFull || f.full, fund: allFund || f.fund };
  }
  return { date: date, items: items.filter(function (i) { return i.amount > 0; }), missing: missing };
}

function recordedText_(parsed, nm) {
  const its = parsed.items;
  const total = its.reduce(function (s, i) { return s + i.amount; }, 0);
  const owe = its.reduce(function (s, i) { return s + (i.fund ? 0 : i.full ? i.amount : i.amount / 2); }, 0);
  const dateNote = parsed.date !== lineDate_() ? '（' + Number(parsed.date.slice(5, 7)) + '/' + Number(parsed.date.slice(8)) + '）' : '';
  const lines = ['✅ 已記 ' + its.length + ' 筆' + dateNote + '：' + its.map(function (i) {
    return i.name + ' ' + i.amount + (i.fund ? '（基金）' : i.full ? '（代付）' : '');
  }).join('、')];
  if (its.length > 1) lines.push('合計 ' + total);
  if (owe) lines.push(nm.ownerName + '要給' + nm.partnerName + ' ' + fmtNum_(owe));
  if (parsed.missing.length) lines.push('「' + parsed.missing.join('」「') + '」沒有金額，請補上，例如：' + parsed.missing[0] + ' 120');
  const b = sharedBalance_();
  lines.push(balanceLine_(b.owed, nm));
  return lines.join('\n');
}

function balanceLine_(owed, nm) {
  if (Math.abs(owed) < 1) return '目前累計：已結清 👍';
  return '目前累計：' + (owed > 0 ? nm.partnerName + '要給' + nm.ownerName : nm.ownerName + '要給' + nm.partnerName) + ' ' + fmtNum_(Math.abs(owed));
}

function balanceText_(nm) {
  const b = sharedBalance_();
  return balanceLine_(b.owed, nm) + '\n共同基金餘額：' + fmtNum_(b.fund);
}

function fmtNum_(n) {
  const r = Math.round(n * 100) / 100;
  return String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function undoLine_() {
  const p = PropertiesService.getScriptProperties();
  let ids = [];
  try { ids = JSON.parse(p.getProperty('LINE_LAST_BATCH') || '[]'); } catch (e) { ids = []; }
  if (!ids.length) return '沒有可以復原的紀錄';
  withLock_(function () { ids.forEach(function (id) { remove_('Shared', id); }); });
  p.deleteProperty('LINE_LAST_BATCH');
  return '↩️ 已刪除剛才記的 ' + ids.length + ' 筆\n' + balanceLine_(sharedBalance_().owed, names_());
}

function lineReply_(replyToken, text) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
  if (!token) { lineStep_('❌ 沒有設定 LINE_CHANNEL_TOKEN，無法回覆'); return; }
  if (!replyToken) return;
  let res;
  try {
    res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    lineStep_('❌ 回覆失敗（Apps Script 可能還沒授權連線到外部服務，請在編輯器執行一次 setupLine）：' + (err.message || err));
    return;
  }
  const code = res.getResponseCode();
  if (code === 200) lineStep_('已回覆');
  else lineStep_('❌ LINE 拒絕回覆（HTTP ' + code + '）：' + res.getContentText().slice(0, 120) + (code === 401 ? ' → Channel access token 錯誤' : ''));
}

// 診斷：記下最後一次收到 LINE webhook 的處理過程，App 設定頁會顯示
function lineLog_(obj, reset) {
  const p = PropertiesService.getScriptProperties();
  let cur = {};
  if (!reset) { try { cur = JSON.parse(p.getProperty('LINE_LAST_HIT') || '{}'); } catch (e) { cur = {}; } }
  p.setProperty('LINE_LAST_HIT', JSON.stringify(Object.assign(cur, obj)).slice(0, 8000));
}
function lineStep_(msg) {
  const p = PropertiesService.getScriptProperties();
  let cur = {};
  try { cur = JSON.parse(p.getProperty('LINE_LAST_HIT') || '{}'); } catch (e) { cur = {}; }
  cur.steps = (cur.steps || []).concat([msg]).slice(-12);
  p.setProperty('LINE_LAST_HIT', JSON.stringify(cur).slice(0, 8000));
}

/* ───────────── 截圖辨識（Gemini） ─────────────
 * 設定：Apps Script → 專案設定 → 指令碼屬性 → 新增 GEMINI_API_KEY（到 Google AI Studio 申請）
 * 選用：GEMINI_MODEL 指定模型；沒設定時依序嘗試下面的模型，前一個不能用就換下一個。
 */
const GEMINI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

const STATEMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    source: {
      type: 'OBJECT',
      properties: {
        kind: { type: 'STRING', enum: ['credit_card', 'e_wallet', 'bank_account', 'unknown'] },
        issuer: { type: 'STRING', nullable: true, description: '畫面上明確出現的銀行或錢包名稱；沒有明確文字就填 null，不要從商店名稱猜' },
        appTitle: { type: 'STRING', nullable: true },
        last4: { type: 'STRING', nullable: true },
        evidence: { type: 'STRING', description: '判斷來源依據的畫面文字' },
      },
      required: ['kind', 'evidence'],
    },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          year: { type: 'INTEGER', nullable: true },
          month: { type: 'INTEGER', nullable: true },
          day: { type: 'INTEGER', nullable: true },
          merchant: { type: 'STRING' },
          amount: { type: 'NUMBER', description: '一律填正數' },
          direction: { type: 'STRING', enum: ['expense', 'fee', 'refund', 'income', 'topup', 'transfer_out'] },
          counterparty: { type: 'STRING', nullable: true, description: '儲值來源銀行或轉帳對象' },
          category: { type: 'STRING', description: '從提供的類別清單中選一個' },
          installment: { type: 'STRING', nullable: true },
          truncated: { type: 'BOOLEAN', description: '商店名稱在畫面上被截斷（有…）' },
        },
        required: ['merchant', 'amount', 'direction', 'category'],
      },
    },
  },
  required: ['source', 'items'],
};

function statementPrompt_(hint) {
  hint = hint || {};
  return [
    (hint.isText ? '以下是使用者從台灣的信用卡、電子支付或網路銀行複製貼上的交易紀錄文字（排版可能亂掉，一筆交易可能分成好幾行）。' : '這是一張台灣的信用卡、電子支付或銀行 App 的交易紀錄截圖。')
      + '請把「每一筆交易」都列出來，不要漏掉、不要自己編造。',
    '規則：',
    '1. 日期：依畫面上的日期（可能是每筆旁邊、或是上方的日期分組標題）。畫面沒有年份就 year 填 null；某筆上方的日期標題被截掉看不到，就 year/month/day 全部填 null。',
    '2. 金額一律填正數，用 direction 表示性質：一般消費 expense；國外交易手續費／服務費 fee；退款、刷卡回饋、負數金額 refund；電子錢包從銀行儲值 topup（counterparty 填銀行名稱）；好友轉帳、轉出 transfer_out（counterparty 填對象）；其他入帳 income。',
    '3. 「餘額 NT$xxx」是帳戶餘額，不是交易，不要列出。入帳起息日、末四碼、時間不是交易。',
    '4. source.issuer 只填畫面上明確寫出的銀行或錢包名稱（例如標題「LINE Pay Money紀錄」→ LINE Pay）。畫面沒寫就填 null，不要從商店名稱推測。有「末四碼」就填 last4。',
    '5. category 從這些類別選最接近的一個：' + (hint.expenseCats || []).join('、') + '；收入類：' + (hint.incomeCats || []).join('、') + '。',
    '6. 商店名稱照畫面原文（全形字可轉半形、去掉多餘空白），被「…」截斷就 truncated=true。分期付款的「12/12期」填在 installment。',
    '今天是 ' + (hint.today || '') + '。',
  ].join('\n');
}

function parseStatement_(req) {
  if (!req.image && !req.text) throw new Error('沒有收到圖片或文字');
  if (req.text && String(req.text).length > 30000) throw new Error('文字太長，請分批貼上（一次 3 萬字以內）');
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('尚未設定 Gemini API 金鑰：請到 Apps Script →「專案設定」→「指令碼屬性」新增 GEMINI_API_KEY');
  const custom = props.getProperty('GEMINI_MODEL');
  const models = custom ? [custom] : GEMINI_MODELS;
  const body = {
    contents: [{ role: 'user', parts: req.text
      ? [{ text: statementPrompt_(Object.assign({}, req.hint, { isText: true })) + '\n\n──── 貼上的文字 ────\n' + req.text }]
      : [{ inlineData: { mimeType: req.mimeType || 'image/jpeg', data: req.image } }, { text: statementPrompt_(req.hint) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: STATEMENT_SCHEMA, temperature: 0 },
  };
  let lastErr = '';
  for (let i = 0; i < models.length; i++) {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
      payload: JSON.stringify(body), muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    let json = {};
    try { json = JSON.parse(res.getContentText()); } catch (e) { /* 非 JSON 回應 */ }
    if (code === 200) {
      const cand = (json.candidates || [])[0];
      const text = cand && cand.content && (cand.content.parts || []).map(function (p) { return p.text || ''; }).join('');
      if (!text) throw new Error('Gemini 沒有回傳結果（' + ((cand && cand.finishReason) || '空白回應') + '），請換一張截圖再試');
      const out = JSON.parse(text);
      out.model = models[i];
      return out;
    }
    const msg = (json.error && json.error.message) || ('HTTP ' + code);
    if (code === 400 && /API key/i.test(msg)) throw new Error('Gemini API 金鑰無效，請確認 GEMINI_API_KEY');
    if (code === 403) throw new Error('Gemini 拒絕存取（金鑰權限不足或未啟用）：' + msg);
    lastErr = models[i] + '：' + msg;
    // 404（模型不存在）或 429（額度用完）就換下一個模型
    if (code !== 404 && code !== 429 && code !== 503) break;
  }
  throw new Error('Gemini 辨識失敗：' + lastErr);
}

/** 在編輯器執行一次：確認金鑰可用，並授權「連線到外部服務」 */
function testGemini() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('請先在指令碼屬性新增 GEMINI_API_KEY');
  const custom = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  const models = custom ? [custom] : GEMINI_MODELS;
  for (let i = 0; i < models.length; i++) {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ parts: [{ text: '只回覆兩個字：成功' }] }] }),
    });
    Logger.log(models[i] + ' → HTTP ' + res.getResponseCode() + '：' + res.getContentText().slice(0, 200));
    if (res.getResponseCode() === 200) { Logger.log('✅ Gemini 可以使用（模型 ' + models[i] + '）'); return; }
  }
  Logger.log('❌ 所有模型都失敗，請看上面的錯誤訊息');
}

/* ───────────── 工具函式 ───────────── */

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function validId_(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

function validIso_(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
}

function clean_(entity, data) {
  const def = SCHEMA[entity];
  const out = {};
  def.fields.forEach(function (f) {
    if (f === 'id' || f === 'createdAt' || f === 'updatedAt') return;
    if (Object.prototype.hasOwnProperty.call(data, f)) out[f] = coerce_(def.types[f], data[f]);
  });
  return out;
}

function validate_(entity, rec) {
  SCHEMA[entity].required.forEach(function (f) {
    if (rec[f] === undefined || rec[f] === null || rec[f] === '') throw new Error('欄位「' + f + '」必填');
  });
  if (entity === 'Transactions' && ['income', 'expense'].indexOf(rec.type) < 0) {
    throw new Error('type 必須是 income 或 expense');
  }
  if ((entity === 'Tasks' || entity === 'Events') && rec.repeat && REPEATS.indexOf(rec.repeat) < 0) {
    throw new Error('repeat 只能是 daily / weekly / monthly / yearly');
  }
  if (entity === 'Notes' && ['note', 'diary'].indexOf(rec.kind) < 0) {
    throw new Error('kind 必須是 note 或 diary');
  }
  if (entity === 'Shared') {
    if (['expense', 'settle', 'fund_in'].indexOf(rec.kind) < 0) throw new Error('kind 必須是 expense、settle 或 fund_in');
    if (['me', 'partner', 'fund'].indexOf(rec.payer) < 0) throw new Error('payer 必須是 me、partner 或 fund');
    if (rec.payer === 'fund' && rec.kind !== 'expense') throw new Error('共同基金只能用來付支出');
    if (!(Number(rec.amount) > 0)) throw new Error('金額要大於 0');
  }
  if (entity === 'Quick' && ['income', 'expense'].indexOf(rec.type) < 0) {
    throw new Error('type 必須是 income 或 expense');
  }
  if (entity === 'Bills') {
    if (['card', 'fixed'].indexOf(rec.kind) < 0) throw new Error('kind 必須是 card 或 fixed');
    if (!(rec.dueDay >= 1 && rec.dueDay <= 31)) throw new Error('扣款日要在 1–31 之間');
    if (rec.kind === 'card' && !(rec.closeDay >= 1 && rec.closeDay <= 31)) throw new Error('結帳日要在 1–31 之間');
  }
}

function coerce_(type, v) {
  if (v === undefined || v === null) return type === 'bool' ? false : '';
  switch (type) {
    case 'number': return v === '' ? '' : Number(v);
    case 'bool': return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1';
    case 'date': return normDate_(v);
    case 'time': return normTime_(v);
    default: return String(v);
  }
}

function fromRow_(entity, row) {
  const def = SCHEMA[entity];
  const rec = {};
  def.fields.forEach(function (f, i) {
    const v = row[i];
    rec[f] = def.types[f] ? coerce_(def.types[f], v) : (isDate_(v) ? v.toISOString() : String(v === null || v === undefined ? '' : v));
  });
  return rec;
}

function toRow_(entity, rec) {
  return SCHEMA[entity].fields.map(function (f) {
    const v = rec[f];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  });
}

function normDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (isDate_(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

function normTime_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (isDate_(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return String(v).slice(0, 5);
}

function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function nowIso_() {
  return new Date().toISOString();
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}