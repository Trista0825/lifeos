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

const APP_VERSION = '1.1.0';

// 資料表定義：欄位順序 = 工作表欄位順序。
// 新增欄位一律加在最後面，舊資料才不會錯位。
const SCHEMA = {
  Transactions: {
    fields: ['id', 'date', 'type', 'amount', 'category', 'account', 'note', 'createdAt', 'updatedAt'],
    types: { date: 'date', amount: 'number' },
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
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!token || req.token !== token) return json_({ ok: false, error: 'Token 錯誤或尚未執行 setup()' });
    return json_(handle_(req));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handle_(req) {
  if (req.action === 'batch') {
    const results = (req.requests || []).map(function (r) {
      try { return handle_(r); } catch (err) { return { ok: false, error: String(err.message || err) }; }
    });
    return { ok: true, results: results };
  }
  switch (req.action) {
    case 'ping': return { ok: true, version: APP_VERSION };
    case 'list': return { ok: true, data: list_(req.entity, req.from, req.to) };
    case 'create': return withLock_(function () { return { ok: true, data: create_(req.entity, req.data || {}) }; });
    case 'update': return withLock_(function () { return { ok: true, data: update_(req.entity, req.id, req.data || {}) }; });
    case 'remove': return withLock_(function () { remove_(req.entity, req.id); return { ok: true }; });
    case 'setRoutineLog': return withLock_(function () { return { ok: true, data: setRoutineLog_(req.routineId, req.date, req.done, req.id) }; });
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
