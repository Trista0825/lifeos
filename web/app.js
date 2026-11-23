/* LifeOS 前端 — 原生 JavaScript，不需要編譯 */
'use strict';

const APP_VERSION = '2.6.0';
const ENTITIES = ['Transactions', 'Tasks', 'Events', 'Routines', 'RoutineLogs', 'Notes', 'Bills', 'Quick'];

// 選項來自原本的記帳小程序；清單只是建議，輸入框仍可打清單以外的新值
const EXPENSE_CATS = ['餐食', '飲料', '交通', '家用', '服飾', '保養品', '課程', '娛樂', '醫療', '保險', '固定開銷',
  '其他', '卡費', '帳戶互轉', '旅遊', '咘咘表晚餐', 'Hana', '股票'];
const INCOME_CATS = ['薪資收入', '利息收入', '獎金收入', '咘咘收入', '其他收入(代付)', '富邦餘額', '國泰餘額', '中信餘額',
  '第一餘額', '台新餘額', '安泰餘額', '現金餘額', '聯邦餘額', 'Line pay餘額', 'LINE BANK 餘額', '支付寶',
  '玉山餘額', '帳戶互轉', 'IPass money餘額', '永豐餘額'];
// 支出用「支付方式」
const PAY_METHODS = ['現金', '國泰信用卡', '台新信用卡', '富邦信用卡', '聯邦信用卡', '中信信用卡', '玉山信用卡',
  '國泰帳戶', '第一帳戶', '富邦帳戶', '中信帳戶', '上海帳戶', '玉山帳戶', '安泰帳戶', '台新帳戶',
  'line pay', '聯邦帳戶', '計咘咘帳上', '支付寶', '王道帳戶', 'IPass money', '收銀機'];
// 收入用「入帳銀行」
const BANKS = ['現金', '富邦帳戶', '國泰帳戶', '中信帳戶', '台新帳戶', '第一帳戶', '安泰帳戶', '上海帳戶', '聯邦帳戶',
  'line pay', 'LINE BANK', '回饋金', '支付寶', '王道帳戶', '玉山帳戶', '永豐帳戶', 'IPass money', '收銀機'];

// 記帳「總覽」與「今天」的收支統計不列入這些類別（明細仍會顯示）。想排除更多就加在這裡。
const DASH_EXCLUDE = ['帳戶互轉'];

// 報表：支付方式名稱含這段文字的視為信用卡（不算在帳戶餘額，改列在信用卡費）
const CARD_RE = /信用卡/;
// 報表：收入類別以「餘額」結尾的視為當月 1 號的期初餘額
const OPENING_RE = /餘額\s*$/;

const TRANSFER_CAT = '帳戶互轉';
const QUICK_MAX = 12;        // 常用按鈕最多幾個（釘選的先排，再用歷史紀錄補）
const QUICK_HISTORY = 1500;  // 統計常用按鈕時往回看幾筆

// 「建立固定扣款」按鈕會建立的預設項目（之後都可以在 App 裡修改）
const BILL_SEED = [
  { name: '富邦卡費', kind: 'card', card: '富邦信用卡', payAccount: '富邦帳戶', closeDay: 20, dueDay: 5, dueOffset: 1, category: '卡費', recordNote: '富邦卡費' },
  { name: '台新卡費', kind: 'card', card: '台新信用卡', payAccount: '台新帳戶', closeDay: 7, dueDay: 23, dueOffset: 0, category: '卡費', recordNote: '台新卡費' },
  { name: '聯邦卡費', kind: 'card', card: '聯邦信用卡', payAccount: '聯邦帳戶', closeDay: 12, dueDay: 27, dueOffset: 0, category: '卡費', recordNote: '聯邦卡費' },
  { name: '國泰卡費', kind: 'card', card: '國泰信用卡', payAccount: '國泰帳戶', closeDay: 8, dueDay: 24, dueOffset: 0, category: '卡費', recordNote: '國泰卡費' },
  { name: '富邦學貸', kind: 'fixed', payAccount: '富邦帳戶', dueDay: 1, amount: 4811, category: '貸款', recordNote: '學貸' },
  { name: '第一學貸', kind: 'fixed', payAccount: '第一帳戶', dueDay: 1, amount: 1600, category: '貸款', recordNote: '學貸' },
  { name: '第一房貸', kind: 'fixed', payAccount: '第一帳戶', dueDay: 11, amount: 16535, category: '貸款', recordNote: '信貸' },
];

// 「共同」：勾選時在備註後面加上這段文字（沿用原本記帳程序的規則）
const SHARED_SUFFIX = '(共同)';
const SHARED_RE = /[(（]共同[)）]\s*$/;

const REPEAT_OPTS = [['', '不重複'], ['daily', '每天'], ['weekly', '每週'], ['monthly', '每月'], ['yearly', '每年']];
const REPEAT_LABEL = Object.fromEntries(REPEAT_OPTS);
const MOODS = [['', '—'], ['😄', '😄 很好'], ['🙂', '🙂 不錯'], ['😐', '😐 普通'], ['😔', '😔 低落'], ['😫', '😫 很累']];
const DOW = ['日', '一', '二', '三', '四', '五', '六'];
const TITLES = { import: '匯入明細', today: '今天', money: '記帳', tasks: '待辦', calendar: '行事曆', routines: '習慣', notes: '筆記', settings: '設定', reconcile: '月初對帳' };

/* ───────── 狀態 ───────── */
const S = {
  cfg: loadJSON('lifeos.cfg', { url: '', token: '' }),
  data: Object.assign(Object.fromEntries(ENTITIES.map(e => [e, []])), loadJSON('lifeos.data', {})),
  queue: loadJSON('lifeos.queue', []), // 尚未上傳的修改（離線時累積）
  lastSync: localStorage.getItem('lifeos.lastSync') || '',
  view: 'today',
  moneyMode: 'dash',
  moneyMonth: ymd(new Date()).slice(0, 7),
  recMonth: ymd(new Date()).slice(0, 7),
  listAcct: '', // 明細篩選的帳戶（空白＝全部）
  calMonth: ymd(new Date()).slice(0, 7),
  calSel: ymd(new Date()),
  taskFilter: 'open',
  notesMode: 'note',
  noteQuery: '',
  busy: 0,
  flushing: false,
  offline: false,
};

/* ───────── 小工具 ───────── */
function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 空間不足時忽略 */ } }
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return ymd(new Date()); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('zh-TW'); }
function moneyShort(n) { n = Math.round(n); return Math.abs(n) >= 10000 ? (n / 10000).toFixed(n % 10000 ? 1 : 0) + '萬' : String(n); }
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}
function nowIso() { return new Date().toISOString(); }
function dateLabel(s) {
  if (!s) return '';
  const t = today();
  if (s === t) return '今天';
  if (s === addDays(t, 1)) return '明天';
  if (s === addDays(t, -1)) return '昨天';
  const d = parseYmd(s);
  const yr = s.slice(0, 4) !== t.slice(0, 4) ? d.getFullYear() + '/' : '';
  return yr + (d.getMonth() + 1) + '/' + d.getDate() + '（' + DOW[d.getDay()] + '）';
}
function $(sel) { return document.querySelector(sel); }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function isShared(t) { return SHARED_RE.test(String(t.note || '')); }
function stripShared(note) { return String(note || '').replace(SHARED_RE, '').trim(); }
function counted(t) { return !DASH_EXCLUDE.includes(String(t.category || '').trim()); }
function sum(arr) { return arr.reduce((s, x) => s + Number(x.amount || 0), 0); }

function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), isErr ? 4000 : 1800);
}

function updateStatus() {
  const n = S.queue.length;
  let txt;
  if (n && (S.offline || !navigator.onLine)) txt = '離線・' + n + ' 筆待上傳';
  else if (n) txt = '上傳中…';
  else if (S.busy) txt = '同步中…';
  else txt = S.lastSync ? '已同步 ' + S.lastSync.slice(11, 16) : '';
  $('#syncState').textContent = txt;
  $('#syncState').classList.toggle('pending', !!n);
}

/* ───────── 重複規則 ───────── */
// 某個重複項目在 date 這天是否發生（月底日自動對齊，例如 31 號在 2 月變 28/29 號）
function occursOn(item, date, startField) {
  const start = item[startField || 'date'];
  if (!start || date < start) return false;
  if (!item.repeat) return date === start;
  if (item.repeatUntil && date > item.repeatUntil) return false;
  const s = parseYmd(start), d = parseYmd(date);
  switch (item.repeat) {
    case 'daily': return true;
    case 'weekly': return s.getDay() === d.getDay();
    case 'monthly': return d.getDate() === Math.min(s.getDate(), daysInMonth(d.getFullYear(), d.getMonth() + 1));
    case 'yearly': return d.getMonth() === s.getMonth() && d.getDate() === Math.min(s.getDate(), daysInMonth(d.getFullYear(), d.getMonth() + 1));
    default: return date === start;
  }
}
// 下一次的日期（待辦完成後用）
function nextDate(date, repeat) {
  const d = parseYmd(date);
  if (repeat === 'daily') return addDays(date, 1);
  if (repeat === 'weekly') return addDays(date, 7);
  const months = repeat === 'monthly' ? 1 : repeat === 'yearly' ? 12 : 0;
  if (!months) return date;
  const y = d.getFullYear(), m = d.getMonth() + months;
  const ny = y + Math.floor(m / 12), nm = m % 12;
  return ny + '-' + pad(nm + 1) + '-' + pad(Math.min(d.getDate(), daysInMonth(ny, nm + 1)));
}

/* ───────── 與後端溝通 ───────── */
async function api(payload) {
  if (!S.cfg.url || !S.cfg.token) throw new Error('請先到「設定」填入 API 網址與 Token');
  S.busy++; updateStatus();
  try {
    let res;
    try {
      // 不加自訂 header（Content-Type 會是 text/plain），避免 CORS 預檢，Apps Script 才收得到
      res = await fetch(S.cfg.url, { method: 'POST', body: JSON.stringify(Object.assign({ token: S.cfg.token }, payload)) });
    } catch (e) {
      const err = new Error('目前離線，連上網路後會自動上傳');
      err.network = true;
      throw err;
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('伺服器回應格式錯誤（網址是否正確、是否已部署新版本？）'); }
    if (!json.ok) throw new Error(json.error || '伺服器錯誤');
    S.offline = false;
    return json;
  } catch (err) {
    if (err.network) S.offline = true;
    throw err;
  } finally {
    S.busy--; updateStatus();
  }
}

function persist() { saveJSON('lifeos.data', S.data); }
function saveQueue() { saveJSON('lifeos.queue', S.queue); }

// 所有修改都先套用到本機畫面、放進佇列，再嘗試上傳；離線時會保留到下次連線
function enqueue(op) {
  S.queue.push(op);
  saveQueue();
  persist();
  updateStatus();
  flush();
}

async function flush() {
  if (S.flushing || !S.queue.length || !S.cfg.url) return;
  S.flushing = true;
  let failed = [];
  try {
    while (S.queue.length) {
      const batch = S.queue.slice(0, 25);
      let res;
      try {
        res = await api({ action: 'batch', requests: batch });
      } catch (err) {
        if (!err.network) toast('上傳失敗：' + err.message, true);
        break; // 留在佇列，之後再試
      }
      S.queue.splice(0, batch.length);
      res.results.forEach((r, i) => {
        if (r.ok) applyServer(batch[i], r);
        else failed.push(r.error);
      });
      saveQueue();
      persist();
    }
  } finally {
    S.flushing = false;
    updateStatus();
  }
  if (failed.length) {
    toast(failed.length + ' 筆儲存失敗：' + failed[0], true);
    syncAll(true); // 以試算表為準重新整理
  } else {
    render();
  }
}

// 伺服器回傳的正規化資料覆蓋本機版本（若佇列裡還有同一筆的後續修改就先不覆蓋）
function applyServer(op, r) {
  const pendingSameId = id => S.queue.some(q => q.id === id || (q.data && q.data.id === id));
  if ((op.action === 'create' || op.action === 'update') && r.data) {
    if (pendingSameId(r.data.id)) return;
    const arr = S.data[op.entity];
    const i = arr.findIndex(x => x.id === r.data.id);
    if (i >= 0) arr[i] = r.data;
  }
  if (op.action === 'setRoutineLog' && r.data && r.data.done && r.data.log) {
    const logs = S.data.RoutineLogs;
    const i = logs.findIndex(l => l.routineId === op.routineId && l.date === op.date);
    if (i >= 0) logs[i] = r.data.log;
  }
}

async function syncAll(silent) {
  if (!S.cfg.url || !S.cfg.token) return;
  await flush();
  if (S.queue.length) { render(); return; } // 還有沒上傳的，先不要用伺服器資料覆蓋
  try {
    const res = await api({ action: 'batch', requests: ENTITIES.map(e => ({ action: 'list', entity: e })) });
    const errs = [];
    res.results.forEach((r, i) => {
      if (r.ok) S.data[ENTITIES[i]] = r.data;
      else errs.push(ENTITIES[i] + '：' + r.error);
    });
    if (S.queue.length) return; // 同步途中又有新修改，等下一輪
    persist();
    const now = new Date();
    S.lastSync = ymd(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    localStorage.setItem('lifeos.lastSync', S.lastSync);
    updateStatus();
    render();
    if (errs.length) toast(errs[0], true);
    else if (!silent) toast('同步完成');
  } catch (err) {
    if (!err.network || !silent) toast(err.message, !err.network);
  }
}

/* ───────── 資料操作（本機立即生效） ───────── */
const find = (entity, id) => S.data[entity].find(r => r.id === id);

function createRec(entity, data) {
  const now = nowIso();
  const rec = Object.assign({}, data, { id: uid(), createdAt: now, updatedAt: now });
  if (entity === 'Tasks' && rec.done) rec.doneAt = now;
  S.data[entity].push(rec);
  enqueue({ action: 'create', entity, data: rec });
  return rec;
}
function updateRec(entity, id, patch) {
  const rec = find(entity, id);
  if (!rec) return;
  if (entity === 'Tasks' && 'done' in patch) rec.doneAt = patch.done ? (rec.done ? rec.doneAt : nowIso()) : '';
  Object.assign(rec, patch, { updatedAt: nowIso() });
  enqueue({ action: 'update', entity, id, data: patch });
}
function removeRec(entity, id) {
  S.data[entity] = S.data[entity].filter(r => r.id !== id);
  if (entity === 'Routines') S.data.RoutineLogs = S.data.RoutineLogs.filter(l => l.routineId !== id);
  enqueue({ action: 'remove', entity, id });
}
function setRoutineLog(routineId, date, done) {
  S.data.RoutineLogs = S.data.RoutineLogs.filter(l => !(l.routineId === routineId && l.date === date));
  const id = uid();
  if (done) S.data.RoutineLogs.push({ id, routineId, date, createdAt: nowIso() });
  enqueue({ action: 'setRoutineLog', routineId, date, done, id });
}

/* ───────── 查詢輔助 ───────── */
function isDoneOn(routineId, date) {
  return S.data.RoutineLogs.some(l => l.routineId === routineId && l.date === date);
}
function scheduledOn(routine, date) {
  return String(routine.days || '0123456').indexOf(String(parseYmd(date).getDay())) >= 0;
}
function streakOf(routine) {
  let d = today();
  if (!isDoneOn(routine.id, d)) d = addDays(d, -1); // 今天還沒做不算中斷
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (scheduledOn(routine, d)) {
      if (isDoneOn(routine.id, d)) n++;
      else break;
    }
    d = addDays(d, -1);
  }
  return n;
}
function activeRoutines() {
  return S.data.Routines.filter(r => r.active !== false)
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
function eventsOn(date) {
  return S.data.Events.filter(e => occursOn(e, date))
    .sort((a, b) => (a.allDay ? '' : (a.start || '99')).localeCompare(b.allDay ? '' : (b.start || '99')));
}
function sortTasks(arr) {
  return arr.slice().sort((a, b) => {
    const da = a.due || '9999', db = b.due || '9999';
    if (da !== db) return da.localeCompare(db);
    return (Number(b.priority) || 0) - (Number(a.priority) || 0);
  });
}
function monthTx(m) { return S.data.Transactions.filter(x => String(x.date).slice(0, 7) === m); }
function groupSum(arr, key) {
  const out = {};
  arr.forEach(x => { const k = String(x[key] || '').trim() || '其他'; out[k] = (out[k] || 0) + Number(x.amount || 0); });
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

/* ───────── 畫面元件 ───────── */
function taskItem(t) {
  const overdue = !t.done && t.due && t.due < today();
  const p = Number(t.priority) || 0;
  const tags = [
    t.due ? `<span class="tag ${overdue ? 'overdue' : ''}">${overdue ? '逾期 ' : ''}${esc(dateLabel(t.due))}</span>` : '',
    t.repeat ? `<span class="tag">↻ ${REPEAT_LABEL[t.repeat] || ''}</span>` : '',
    p === 3 ? '<span class="tag p3">高</span>' : p === 2 ? '<span class="tag p2">中</span>' : '',
  ].join('');
  return `<li class="item ${t.done ? 'done' : ''}">
    <button class="check ${t.done ? 'on' : ''}" data-act="toggleTask" data-id="${t.id}" aria-label="完成">${t.done ? '✓' : ''}</button>
    <div class="main" data-act="editTask" data-id="${t.id}">
      <div class="title">${esc(t.title)}</div>
      ${tags || t.note ? `<div class="sub">${tags}${t.note ? esc(t.note).slice(0, 40) : ''}</div>` : ''}
    </div></li>`;
}
function eventItem(e) {
  const time = e.allDay ? '全天' : (e.start || '') + (e.end ? '<br>' + e.end : '');
  const sub = [e.repeat ? '↻ ' + REPEAT_LABEL[e.repeat] : '', e.location, e.note].filter(Boolean).join(' · ');
  return `<li class="item">
    <div class="time-col">${time}</div>
    <div class="main" data-act="editEvent" data-id="${e.id}">
      <div class="title">${esc(e.title)}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div></li>`;
}
function txItem(t, focus) {
  const pr = transferPair(t);
  if (focus && pr && pr.out && pr.in) { // 篩選單一帳戶時：轉帳兩邊各自顯示，標出方向
    const out = t.type === 'expense';
    return `<li class="item"><div class="main" data-act="editTx" data-id="${t.id}">
      <div class="title">${out ? '轉出 → ' + esc(pr.in.account) : '轉入 ← ' + esc(pr.out.account)}</div>
      <div class="sub">轉帳${t.note && t.note !== TRANSFER_CAT ? ' · ' + esc(t.note) : ''}</div></div>
      <div class="amount ${out ? 'expense' : 'income'}">${out ? '-' : '+'}${money(t.amount)}</div></li>`;
  }
  if (pr && pr.out && pr.in && t.type === 'expense') {
    return `<li class="item"><div class="main" data-act="editTx" data-id="${t.id}">
      <div class="title">轉帳 <span class="tag muted">不計入總覽</span></div>
      <div class="sub">${esc(pr.out.account)} → ${esc(pr.in.account)}${t.note && t.note !== TRANSFER_CAT ? ' · ' + esc(t.note) : ''}</div></div>
      <div class="amount muted">${money(t.amount)}</div></li>`;
  }
  if (pr && pr.out && pr.in && t.type === 'income') return '';
  const cls = t.type === 'income' ? 'income' : 'expense';
  const note = stripShared(t.note);
  return `<li class="item">
    <div class="main" data-act="editTx" data-id="${t.id}">
      <div class="title">${esc(note || t.category || (t.type === 'income' ? '收入' : '支出'))}${isShared(t) ? ' <span class="tag">共同</span>' : ''}${counted(t) ? '' : ' <span class="tag muted">不計入總覽</span>'}</div>
      <div class="sub">${esc([note ? t.category : '', t.account].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="amount ${cls}">${Number(t.amount) ? (t.type === 'income' ? '+' : '-') : ''}${money(t.amount)}</div></li>`;
}
function routineItem(r, date) {
  const done = isDoneOn(r.id, date);
  const st = streakOf(r);
  return `<li class="item ${done ? 'done' : ''}">
    <button class="check ${done ? 'on' : ''}" data-act="toggleRoutine" data-id="${r.id}" data-date="${date}" aria-label="打卡">${done ? '✓' : ''}</button>
    <div class="main" data-act="editRoutine" data-id="${r.id}"><div class="title">${esc(r.name)}</div></div>
    <span class="streak">${st ? '🔥 ' + st : ''}</span></li>`;
}
function noteItem(n) {
  const first = String(n.content || '').split('\n').find(Boolean) || '';
  const title = n.kind === 'diary' ? (n.mood ? n.mood + ' ' : '') + dateLabel(n.date) : (n.title || first || '（無標題）');
  const sub = n.kind === 'diary' ? first : (n.title ? first : '');
  const tags = String(n.tags || '').split(/[,，\s]+/).filter(Boolean).map(t => `<span class="tag">#${esc(t)}</span>`).join('');
  return `<li class="item">
    <div class="main" data-act="editNote" data-id="${n.id}">
      <div class="title">${n.pinned ? '📌 ' : ''}${esc(title)}</div>
      ${sub || tags ? `<div class="sub">${tags}${esc(sub).slice(0, 60)}</div>` : ''}
    </div></li>`;
}
function list(items, emptyText) {
  return items.length ? `<ul class="list">${items.join('')}</ul>` : `<div class="empty">${emptyText}</div>`;
}
function bars(entries, total, cls) {
  entries = entries.filter(e => e[1] > 0);
  const max = entries.length ? entries[0][1] : 1;
  return entries.map(([c, v]) => `
    <div class="bar-row"><span>${esc(c)}</span><div class="bar"><i class="${cls || ''}" style="width:${Math.max(2, v / max * 100)}%"></i></div>
    <span class="num">${money(v)}${total ? ' · ' + Math.round(v / total * 100) + '%' : ''}</span></div>`).join('');
}
function monthNav(act, ym) {
  const [y, m] = ym.split('-');
  return `<div class="month-nav"><button data-act="${act}" data-n="-1" aria-label="上個月">‹</button><span>${y} 年 ${Number(m)} 月</span><button data-act="${act}" data-n="1" aria-label="下個月">›</button></div>`;
}

/* ───────── 各頁面 ───────── */
const VIEWS = {
  today() {
    const t = today();
    const d = new Date();
    const month = t.slice(0, 7);
    const tx = S.data.Transactions.filter(counted);
    const todayExp = sum(tx.filter(x => x.date === t && x.type === 'expense'));
    const monthExp = sum(tx.filter(x => x.date.slice(0, 7) === month && x.type === 'expense'));
    const monthInc = sum(tx.filter(x => x.date.slice(0, 7) === month && x.type === 'income'));
    const tasks = sortTasks(S.data.Tasks.filter(x => !x.done && (!x.due || x.due <= t)));
    const routines = activeRoutines().filter(r => scheduledOn(r, t));
    const doneCount = routines.filter(r => isDoneOn(r.id, t)).length;
    const diary = S.data.Notes.find(n => n.kind === 'diary' && n.date === t);

    return `
      <p class="date-hero">${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${DOW[d.getDay()]}</p>
      <div class="quick">
        <button data-act="newTx"><span>💰</span>記一筆</button>
        <button data-act="newTask"><span>✅</span>待辦</button>
        <button data-act="newEvent"><span>📅</span>行程</button>
        <button data-act="todayDiary"><span>📔</span>${diary ? '今日日記' : '寫日記'}</button>
      </div>
      <div class="card"><h3>今日行程 <a data-act="go" data-view="calendar">行事曆 ›</a></h3>
        ${list(eventsOn(t).map(eventItem), '今天沒有行程')}</div>
      <div class="card"><h3>例行公事 ${routines.length ? `<span>${doneCount} / ${routines.length}</span>` : ''}</h3>
        ${list(routines.map(r => routineItem(r, t)), '今天沒有排定的例行公事')}</div>
      <div class="card"><h3>待辦（今天與逾期）<a data-act="go" data-view="tasks">全部 ›</a></h3>
        ${list(tasks.slice(0, 8).map(taskItem), '都完成了 🎉')}</div>
      ${todayReconcile()}
      ${todayBills()}
      <div class="card"><h3>本月收支 <a data-act="goMoney">總覽 ›</a></h3>
        <div class="stats">
          <div class="stat" style="padding:0"><div class="label">今日支出</div><div class="value expense">${money(todayExp)}</div></div>
          <div class="stat" style="padding:0"><div class="label">本月支出</div><div class="value expense">${money(monthExp)}</div></div>
          <div class="stat" style="padding:0"><div class="label">本月收入</div><div class="value income">${money(monthInc)}</div></div>
        </div></div>`;
  },

  money() {
    const mode = S.moneyMode;
    const seg = (v, label) => `<button class="${mode === v ? 'on' : ''}" data-act="moneyMode" data-v="${v}">${label}</button>`;
    return `
      <div class="toolbar">
        <div class="seg">${seg('dash', '總覽')}${seg('report', '報表')}${seg('bills', '扣款')}${seg('list', '明細')}</div>
        ${monthNav('moneyMonth', S.moneyMonth)}
      </div>
      ${mode === 'dash' ? moneyDashboard() : mode === 'report' ? moneyReports() : mode === 'bills' ? moneyBills() : moneyList()}`;
  },

  tasks() {
    const open = S.taskFilter === 'open';
    const arr = open
      ? sortTasks(S.data.Tasks.filter(t => !t.done))
      : S.data.Tasks.filter(t => t.done).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
    const t = today();
    let body;
    if (open) {
      const sections = [
        ['逾期', arr.filter(x => x.due && x.due < t)],
        ['今天', arr.filter(x => x.due === t)],
        ['接下來', arr.filter(x => x.due && x.due > t)],
        ['未排日期', arr.filter(x => !x.due)],
      ].filter(s => s[1].length);
      body = sections.length
        ? sections.map(([name, items]) => `<div class="group-head"><span>${name}</span><span>${items.length}</span></div>
            <div class="card tight">${list(items.map(taskItem), '')}</div>`).join('')
        : '<div class="card"><div class="empty">沒有未完成的待辦 🎉</div></div>';
    } else {
      body = `<div class="card">${list(arr.slice(0, 100).map(taskItem), '還沒有完成的項目')}</div>`;
    }
    return `
      <div class="toolbar"><div class="seg">
        <button class="${open ? 'on' : ''}" data-act="taskFilter" data-v="open">未完成</button>
        <button class="${open ? '' : 'on'}" data-act="taskFilter" data-v="done">已完成</button>
      </div></div>${body}`;
  },

  calendar() {
    const [y, m] = S.calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = addDays(ymd(first), -first.getDay());
    const t = today();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const inMonth = d.slice(0, 7) === S.calMonth;
      if (i >= 35 && !inMonth) break;
      const ev = S.data.Events.filter(e => occursOn(e, d)).length;
      const tk = S.data.Tasks.filter(x => !x.done && x.due === d).length;
      const bl = activeBills().filter(b => dayIn(d.slice(0, 7), b.dueDay) === d).length;
      const dots = '<i></i>'.repeat(Math.min(ev, 3)) + (tk ? '<i class="t"></i>' : '') + (bl ? '<i class="b"></i>' : '');
      cells.push(`<button class="day ${inMonth ? '' : 'other'} ${d === t ? 'today' : ''} ${d === S.calSel ? 'sel' : ''}" data-act="calSel" data-d="${d}">
        ${parseYmd(d).getDate()}<span class="dots">${dots}</span></button>`);
    }
    const sel = S.calSel;
    const dueTasks = sortTasks(S.data.Tasks.filter(x => x.due === sel));
    return `
      <div class="toolbar">${monthNav('calMonth', S.calMonth)}
        <button class="chip" data-act="calToday">今天</button></div>
      <div class="card"><div class="cal">${DOW.map(d => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div></div>
      <div class="card"><h3>${dateLabel(sel)} 的行程</h3>${list(eventsOn(sel).map(eventItem), '沒有行程')}</div>
      ${dueTasks.length ? `<div class="card"><h3>當天到期的待辦</h3>${list(dueTasks.map(taskItem), '')}</div>` : ''}
      ${calendarBills(sel)}`;
  },

  routines() {
    const t = today();
    const all = activeRoutines();
    const paused = S.data.Routines.filter(r => r.active === false);
    const last7 = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
    const card = r => {
      const week = last7.map(d => `<i class="${!scheduledOn(r, d) ? 'off' : isDoneOn(r.id, d) ? 'on' : ''}" title="${d}"></i>`).join('');
      const done = isDoneOn(r.id, t);
      const sched = scheduledOn(r, t);
      const days = String(r.days || '0123456');
      const freq = days.length === 7 ? '每天' : days === '12345' ? '平日' : days === '06' ? '週末' : '每週' + days.split('').map(x => DOW[x]).join('、');
      const st = streakOf(r);
      return `<li class="item ${done ? 'done' : ''}">
        <button class="check ${done ? 'on' : ''}" data-act="toggleRoutine" data-id="${r.id}" data-date="${t}" aria-label="打卡" ${sched ? '' : 'style="opacity:.35"'}>${done ? '✓' : ''}</button>
        <div class="main" data-act="editRoutine" data-id="${r.id}">
          <div class="title">${esc(r.name)}</div>
          <div class="sub">${freq}${sched ? '' : '（今天休息）'}</div>
          <div class="week">${week}</div>
        </div>
        <span class="streak">${st ? '🔥 ' + st + ' 天' : ''}</span></li>`;
    };
    return `
      <div class="card"><h3>例行公事 <span>近 7 天</span></h3>${list(all.map(card), '還沒有例行公事，按右下角 ＋ 新增，例如：喝水 2000ml、運動 30 分鐘、睡前閱讀')}</div>
      ${paused.length ? `<div class="card"><h3>已暫停</h3>${list(paused.map(r => `<li class="item"><div class="main" data-act="editRoutine" data-id="${r.id}"><div class="title">${esc(r.name)}</div></div></li>`), '')}</div>` : ''}`;
  },

  notes() {
    const diary = S.notesMode === 'diary';
    return `
      <div class="toolbar"><div class="seg">
        <button class="${diary ? '' : 'on'}" data-act="notesMode" data-v="note">筆記</button>
        <button class="${diary ? 'on' : ''}" data-act="notesMode" data-v="diary">日記</button>
      </div></div>
      <div class="field search"><input id="noteSearch" type="search" placeholder="搜尋${diary ? '日記' : '筆記'}…" value="${esc(S.noteQuery)}"></div>
      <div id="notesList">${notesList()}</div>`;
  },

  settings() {
    const pending = S.queue.length;
    return `<div class="settings">
      <div class="card"><h3>連線設定</h3>
        <div class="field"><label>Apps Script 網址（結尾是 /exec）</label><input id="cfgUrl" value="${esc(S.cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
        <div class="field"><label>API Token</label><input id="cfgToken" value="${esc(S.cfg.token)}" placeholder="執行 setup() 後在執行紀錄中取得"></div>
        <div class="form-actions"><button class="btn" data-act="saveCfg">儲存並測試連線</button></div>
      </div>
      <div class="card"><h3>常用按鈕</h3>
        <p class="help">記帳時最上面的快捷按鈕。釘選的會排在最前面，其餘依你最常記的項目自動補上（最多 ${QUICK_MAX} 個）。記帳時勾選「加入常用按鈕」就能釘選。</p>
        ${list(S.data.Quick.map(q => `<li class="item"><div class="main" data-act="editQuick" data-id="${q.id}"><div class="title">📌 ${esc(q.name)}${q.shared ? ' <span class="tag">共同</span>' : ''}</div>
          <div class="sub">${q.type === 'income' ? '收入' : '支出'} · ${esc([q.category, q.account].filter(Boolean).join(' · '))}${Number(q.amount) ? ' · ' + money(q.amount) : ''}</div></div></li>`), '還沒有釘選的常用按鈕')}
      </div>
      <div class="card"><h3>資料</h3>
        <p class="help">資料都存在你自己的 Google 試算表裡，這台裝置保留一份快取。<br>
        離線時可以照常查看與新增，連上網路後會自動上傳。<br>
        最後同步：${esc(S.lastSync || '尚未同步')}${pending ? `<br><b>待上傳：${pending} 筆</b>` : ''}</p>
        <div class="form-actions">
          <button class="btn secondary" data-act="sync">立即同步</button>
          <button class="btn danger" data-act="clearCache">清除這台裝置的快取</button>
        </div>
      </div>
      <p class="help" style="text-align:center">LifeOS v${APP_VERSION}</p>
    </div>`;
  },
};

// 今天頁：每月 1–10 號，還沒登記期初餘額時提醒對帳
function todayReconcile() {
  const t = today(), m = t.slice(0, 7);
  if (Number(t.slice(8)) > 10 || !S.data.Transactions.length) return '';
  if (monthTx(m).some(x => isOpening(x) && !isCard(x.account))) return '';
  return `<div class="card"><h3>月初對帳</h3>
    <p class="help" style="margin:0 0 10px">${Number(m.slice(5))} 月的期初餘額還沒登記。填一下各帳戶的實際餘額，順便檢查上個月有沒有漏記。</p>
    <button class="btn" data-act="openReconcile" data-m="${m}">開始 ${Number(m.slice(5))} 月對帳</button></div>`;
}

// 今天頁：7 天內（含已過期未記帳）的扣款，與帳戶不足提醒
function todayBills() {
  if (!activeBills().length) return '';
  const t = today(), ym = t.slice(0, 7), until = addDays(t, 7);
  let infos = billsInMonth(ym);
  if (until.slice(0, 7) !== ym) infos = infos.concat(billsInMonth(until.slice(0, 7)));
  const soon = infos.filter(i => !i.paid && i.due <= until);
  const short = accountReadiness(ym).filter(r => r.after < 0);
  if (!soon.length && !short.length) return '';
  return `<div class="card"><h3>即將扣款 <a data-act="goBills">扣款總覽 ›</a></h3>
    ${short.length ? shortfallBanner(accountReadiness(ym)) : ''}
    ${list(soon.map(i => billRow(i)), '7 天內沒有扣款')}</div>`;
}

function calendarBills(date) {
  const ym = date.slice(0, 7);
  const dues = billsInMonth(ym).filter(i => i.due === date);
  const closes = activeBills().filter(b => b.kind === 'card' && dayIn(ym, b.closeDay) === date);
  if (!dues.length && !closes.length) return '';
  const closeRows = closes.map(b => {
    const dueYm = addMonths(ym, Number(b.dueOffset) || 0);
    const i = billInfo(b, dueYm);
    return `<li class="item"><div class="time-col">結帳</div><div class="main" data-act="billDetail" data-id="${b.id}" data-ym="${dueYm}">
      <div class="title">${esc(b.card)} 結帳日</div><div class="sub">本期已刷 ${money(i.estimate)} · ${md(i.due)} 從${esc(b.payAccount)}扣款</div></div></li>`;
  });
  return `<div class="card"><h3>扣款與結帳 <a data-act="goBills">扣款總覽 ›</a></h3>${list(dues.map(i => billRow(i, false)).concat(closeRows), '')}</div>`;
}

function moneyDashboard() {
  const m = S.moneyMonth;
  const all = monthTx(m);
  const tx = all.filter(counted);
  const incTx = tx.filter(x => x.type === 'income'), expTx = tx.filter(x => x.type === 'expense');
  const inc = sum(incTx), exp = sum(expTx);
  const prevExp = sum(monthTx(addMonths(m, -1)).filter(x => counted(x) && x.type === 'expense'));
  const sharedExp = sum(expTx.filter(isShared));
  const excludedN = all.length - tx.length;

  // 每日支出
  const [y, mo] = m.split('-').map(Number);
  const nDays = daysInMonth(y, mo);
  const daily = Array.from({ length: nDays }, (_, i) => sum(expTx.filter(x => Number(x.date.slice(8, 10)) === i + 1)));
  const dMax = Math.max(1, ...daily);
  const isCur = m === today().slice(0, 7);
  const passedDays = isCur ? Number(today().slice(8, 10)) : nDays;
  const avg = passedDays ? exp / passedDays : 0;

  // 近 6 個月
  const months = Array.from({ length: 6 }, (_, i) => addMonths(m, i - 5));
  const trend = months.map(mm => {
    const t = monthTx(mm).filter(counted);
    return { m: mm, inc: sum(t.filter(x => x.type === 'income')), exp: sum(t.filter(x => x.type === 'expense')) };
  });
  const tMax = Math.max(1, ...trend.map(x => Math.max(x.inc, x.exp)));

  const diff = prevExp ? Math.round((exp - prevExp) / prevExp * 100) : null;
  const expCats = groupSum(expTx, 'category');
  const incCats = groupSum(incTx, 'category');
  const accts = groupSum(expTx, 'account').slice(0, 6);

  if (!all.length) return '<div class="card"><div class="empty">這個月還沒有記帳，按右下角 ＋ 開始記一筆</div></div>';

  return `
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><div class="label">收入</div><div class="value income">${money(inc)}</div></div>
      <div class="stat"><div class="label">支出</div><div class="value expense">${money(exp)}</div></div>
      <div class="stat"><div class="label">結餘</div><div class="value">${money(inc - exp)}</div></div>
    </div>
    <div class="card kv">
      <div><span>比上個月支出</span><b class="${diff > 0 ? 'expense' : 'income'}">${diff === null ? '—' : (diff > 0 ? '+' : '') + diff + '%'}</b></div>
      <div><span>${isCur ? '目前' : ''}日平均支出</span><b>${money(avg)}</b></div>
      <div><span>其中共同支出</span><b class="expense">${money(sharedExp)}</b></div>
    </div>
    <div class="card"><h3>每日支出 <span>最高 ${money(dMax === 1 ? 0 : dMax)}</span></h3>
      <div class="chart">${daily.map((v, i) => `<div class="col" title="${mo}/${i + 1} ${money(v)}"><i style="height:${v ? Math.max(3, v / dMax * 100) : 0}%"></i></div>`).join('')}</div>
      <div class="chart-x">${daily.map((_, i) => `<span>${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</span>`).join('')}</div>
    </div>
    ${exp ? `<div class="card"><h3>支出類別</h3>${bars(expCats, exp)}</div>` : ''}
    ${inc ? `<div class="card"><h3>收入類別</h3>${bars(incCats, inc, 'inc')}</div>` : ''}
    ${exp ? `<div class="card"><h3>支付方式（支出）</h3>${bars(accts, exp)}</div>` : ''}
    <div class="card"><h3>近 6 個月 <span><i class="legend inc"></i>收入 <i class="legend"></i>支出</span></h3>
      <div class="chart pair">${trend.map(t => `<div class="col"><i class="inc" style="height:${t.inc ? Math.max(3, t.inc / tMax * 100) : 0}%"></i><i style="height:${t.exp ? Math.max(3, t.exp / tMax * 100) : 0}%"></i></div>`).join('')}</div>
      <div class="chart-x pair">${trend.map(t => `<span>${Number(t.m.slice(5))}月<br><small>${moneyShort(t.inc - t.exp)}</small></span>`).join('')}</div>
    </div>
    ${excludedN ? `<p class="help" style="text-align:center">總覽不含「${DASH_EXCLUDE.join('、')}」${excludedN} 筆，可在明細查看</p>` : ''}`;
}

/* ───────── 固定扣款 ───────── */
function md(date) { return Number(date.slice(5, 7)) + '/' + Number(date.slice(8, 10)); }
function dayIn(ym, day) { const [y, m] = ym.split('-').map(Number); return ym + '-' + pad(Math.min(Math.max(1, Number(day) || 1), daysInMonth(y, m))); }
function activeBills() {
  return S.data.Bills.filter(b => b.active !== false)
    .sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
// 在 ym 這個月扣款的那期信用卡帳單，涵蓋哪段刷卡期間
function billCycle(b, ym) {
  const closeYm = addMonths(ym, -(Number(b.dueOffset) || 0));
  return { start: addDays(dayIn(addMonths(closeYm, -1), b.closeDay), 1), end: dayIn(closeYm, b.closeDay) };
}
function parseOverrides(b) { try { return JSON.parse(b.overrides || '{}') || {}; } catch (e) { return {}; } }
function billNote(b) { return String(b.recordNote || b.name).trim(); }
// 某個固定扣款在 ym 月的狀態
function billInfo(b, ym) {
  const due = dayIn(ym, b.dueDay);
  const paidTx = S.data.Transactions.filter(t => t.type === 'expense' && String(t.date).slice(0, 7) === ym
    && String(t.account || '').trim() === b.payAccount && stripShared(t.note) === billNote(b));
  const ov = parseOverrides(b)[ym];
  const hasOv = ov !== undefined && ov !== null && ov !== '';
  let cycle = null, swipes = [], estimate = 0, closed = false;
  if (b.kind === 'card') {
    cycle = billCycle(b, ym);
    // 信用卡上的支出加總，回饋／退款（記成這張卡的收入）扣掉
    swipes = S.data.Transactions.filter(t => String(t.account || '').trim() === b.card && t.date >= cycle.start && t.date <= cycle.end);
    estimate = sum(swipes.filter(t => t.type === 'expense')) - sum(swipes.filter(t => t.type === 'income'));
    closed = today() > cycle.end;
  }
  const planned = hasOv ? Number(ov) : b.kind === 'card' ? estimate : Number(b.amount) || 0;
  const paid = paidTx.length > 0;
  return {
    bill: b, ym, due, paid, paidTx, paidAmt: sum(paidTx), planned, amount: paid ? sum(paidTx) : planned,
    hasOv, cycle, swipes, estimate, closed, overdue: !paid && due < today()
  };
}
function billsInMonth(ym) { return activeBills().map(b => billInfo(b, ym)).sort((a, b) => a.due.localeCompare(b.due)); }
function billStatusText(i) {
  if (i.paid) return '已扣款';
  if (i.overdue) return '已過扣款日・尚未記帳';
  if (i.bill.kind === 'card') return i.hasOv ? '帳單金額' : i.closed ? '已結帳・請填帳單金額' : '預估（尚未結帳）';
  return '固定金額';
}
// 帳戶在 ym 月的餘額（和「帳戶餘額」報表相同）；這個月還沒登記期初餘額時，接續上個月的結餘
function acctBalance(ym, acct) {
  const tx = monthTx(ym).filter(t => String(t.account || '').trim() === acct);
  let bal = tx.reduce((s, t) => s + signed(t), 0);
  if (!tx.some(t => t.type === 'income' && OPENING_RE.test(String(t.category || '')))) {
    bal += monthTx(addMonths(ym, -1)).filter(t => String(t.account || '').trim() === acct).reduce((s, t) => s + signed(t), 0);
  }
  return bal;
}
// 每個扣款帳戶：目前餘額、還沒扣的金額、扣完剩多少
function accountReadiness(ym) {
  const infos = billsInMonth(ym);
  return uniq(infos.map(i => i.bill.payAccount)).sort(acctOrder).map(a => {
    const items = infos.filter(i => i.bill.payAccount === a && !i.paid);
    const pending = items.reduce((s, i) => s + i.amount, 0);
    const bal = acctBalance(ym, a);
    return { acct: a, bal, pending, after: bal - pending, items };
  });
}
function billRow(i, showDate) {
  return `<li class="item">
    <div class="time-col">${showDate === false ? '' : md(i.due)}</div>
    <div class="main" data-act="billDetail" data-id="${i.bill.id}" data-ym="${i.ym}">
      <div class="title">${esc(i.bill.name)} ${i.paid ? '<span class="tag ok">✓ 已扣款</span>' : i.overdue ? '<span class="tag overdue">未記帳</span>' : ''}</div>
      <div class="sub">${esc(i.bill.payAccount)} · ${billStatusText(i)}</div>
    </div>
    <div class="amount ${i.paid ? 'muted' : 'expense'}">${money(i.amount)}</div></li>`;
}
function shortfallBanner(ready) {
  const short = ready.filter(r => r.after < 0);
  if (!ready.length) return '';
  return short.length
    ? `<div class="alert warn">⚠️ ${short.map(r => `<b>${esc(r.acct)}</b> 還差 <b>${money(-r.after)}</b>`).join('、')}</div>`
    : `<div class="alert ok">✅ 本月所有扣款帳戶餘額都足夠</div>`;
}

function moneyBills() {
  const ym = S.moneyMonth;
  if (!S.data.Bills.length) {
    return `<div class="card"><h3>固定扣款</h3>
      <p class="help">設定每月固定扣款後，App 會自動：<br>・在行事曆標出扣款日和信用卡結帳日<br>・用你的刷卡紀錄預估每期卡費<br>・比對明細，看哪些已經扣款<br>・算出每個扣款帳戶還差多少</p>
      <div class="form-actions"><button class="btn" data-act="seedBills">一鍵建立 4 張信用卡＋3 筆貸款</button><button class="btn secondary" data-act="newBill">自己新增</button></div>
      <p class="help">會建立：<br>${BILL_SEED.map(b => esc(b.name) + (b.kind === 'card'
      ? `：每月 ${b.closeDay} 號結帳，${b.dueOffset ? '次月' : '當月'} ${b.dueDay} 號從${esc(b.payAccount)}扣款`
      : `：每月 ${b.dueDay} 號從${esc(b.payAccount)}扣 ${money(b.amount)}`)).join('<br>')}</p></div>`;
  }
  const infos = billsInMonth(ym);
  const ready = accountReadiness(ym);
  const tot = k => ready.reduce((s, r) => s + r[k], 0);
  const cards = activeBills().filter(b => b.kind === 'card');
  return `
    ${shortfallBanner(ready)}
    <div class="card report"><h3>扣款帳戶準備金 <span>扣完剩 = 餘額 − 待扣</span></h3>
      <table class="rtable">
        <thead><tr><th>帳戶</th><th>目前餘額</th><th>待扣</th><th>扣完剩</th></tr></thead>
        <tbody>${ready.map(r => `<tr><td>${esc(r.acct)}</td><td>${num(r.bal)}</td><td>${r.pending ? num(-r.pending) : '<span class="muted">0</span>'}</td><td class="${r.after < 0 ? 'short' : ''}">${num(r.after)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>總和</td><td>${num(tot('bal'))}</td><td>${num(-tot('pending'))}</td><td class="${tot('after') < 0 ? 'short' : ''}">${num(tot('after'))}</td></tr></tfoot>
      </table></div>
    <div class="card"><h3>${Number(ym.slice(5))} 月扣款 <span>${infos.filter(i => i.paid).length} / ${infos.length} 已扣</span></h3>
      ${list(infos.map(i => billRow(i)), '這個月沒有扣款')}</div>
    ${cards.length ? `<div class="card"><h3>信用卡本期 <span>點卡片看刷卡明細</span></h3>${list(cards.map(b => {
    const nextDueYm = addMonths(ym, Number(b.dueOffset) || 0);
    const i = billInfo(b, nextDueYm);
    return `<li class="item"><div class="time-col">${md(i.cycle.end)}<br><small>結帳</small></div>
        <div class="main" data-act="billDetail" data-id="${b.id}" data-ym="${nextDueYm}"><div class="title">${esc(b.card)}</div>
        <div class="sub">${md(i.cycle.start)}–${md(i.cycle.end)} · ${md(i.due)} 扣款${i.closed ? ' · 已結帳' : ''}</div></div>
        <div class="amount">${money(i.estimate)}</div></li>`;
  }), '')}<p class="help">金額＝這期已記帳的刷卡合計。實際帳單可能包含沒記到的消費，收到帳單後點進去填實際金額。</p></div>` : ''}
    <div class="card"><h3>固定扣款設定 <a data-act="newBill">＋ 新增</a></h3>${list(S.data.Bills.slice().sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0)).map(b => `
      <li class="item"><div class="main" data-act="editBill" data-id="${b.id}"><div class="title">${esc(b.name)}${b.active === false ? ' <span class="tag muted">暫停</span>' : ''}</div>
      <div class="sub">${b.kind === 'card' ? `${esc(b.card)} · ${b.closeDay} 號結帳 · ${b.dueOffset ? '次月' : '當月'} ${b.dueDay} 號扣款` : `每月 ${b.dueDay} 號 · ${money(b.amount)}`} · ${esc(b.payAccount)}</div></div></li>`), '')}</div>`;
}

function saveOverride(b, ym, val) {
  const o = parseOverrides(b);
  if (val === '' || val === null || val === undefined) delete o[ym];
  else o[ym] = Number(val);
  const str = JSON.stringify(o);
  if (str !== (b.overrides || '{}')) updateRec('Bills', b.id, { overrides: str });
}

function billDetail(id, ym) {
  const b = find('Bills', id);
  if (!b) return;
  const i = billInfo(b, ym);
  const lines = [];
  if (b.kind === 'card') {
    lines.push(`<b>帳單週期</b>：${md(i.cycle.start)} – ${md(i.cycle.end)}（${i.closed ? '已結帳' : '尚未結帳'}）`);
    lines.push(`<b>這期刷卡紀錄</b>：${i.swipes.length} 筆，合計 ${money(i.estimate)}`);
    i.swipes.sort((a, c) => a.date.localeCompare(c.date)).forEach(t => lines.push(`<span class="muted">・${md(t.date)} ${esc(stripShared(t.note) || t.category)} ${t.type === 'income' ? '-' : ''}${money(t.amount)}</span>`));
  }
  lines.push(`<b>扣款</b>：${dateLabel(i.due)} 從 ${esc(b.payAccount)}`);
  if (i.paid) lines.push(`<b class="income">✓ 已記帳扣款 ${money(i.paidAmt)}</b>（${i.paidTx.map(t => md(t.date)).join('、')}）`);
  else lines.push(`還沒找到這筆扣款的記帳（比對：${esc(b.payAccount)}、內容「${esc(billNote(b))}」）`);
  openForm({
    title: `${b.name}・${Number(ym.slice(5))} 月`,
    values: { amount: i.hasOv ? i.planned : '' },
    fields: [{
      name: 'amount', type: 'number',
      label: b.kind === 'card' ? `實際帳單金額（留空＝用刷卡合計 ${money(i.estimate)}）` : `本月金額（留空＝固定 ${money(b.amount)}）`
    }],
    hint: lines.join('<br>'),
    submitLabel: '儲存金額',
    extra: [
      i.paid
        ? { label: '查看扣款紀錄', fn: () => { closeForm(); txForm(i.paidTx[0]); } }
        : {
          label: '記為已扣款（新增一筆記帳）', primary: true, fn: v => {
            const amt = v.amount !== '' ? Number(v.amount) : i.planned;
            if (!(amt > 0)) throw new Error('請先填帳單金額');
            saveOverride(b, ym, v.amount);
            createRec('Transactions', { type: 'expense', amount: amt, category: b.category || (b.kind === 'card' ? '卡費' : '貸款'), date: i.due, account: b.payAccount, note: billNote(b) });
            toast('已新增扣款記帳');
          }
        },
      { label: '修改這個固定扣款的設定', fn: () => { closeForm(); billForm(b); } },
    ],
    onSave: v => saveOverride(b, ym, v.amount),
  });
}

function billForm(rec) {
  const cardSuggest = () => uniq(PAY_METHODS.filter(isCard).concat(S.data.Transactions.map(t => t.account).filter(isCard)));
  const acctSuggest = () => uniq(BANKS.concat(S.data.Transactions.map(t => t.account)).filter(a => !isCard(a)));
  openForm({
    title: rec ? '編輯固定扣款' : '新增固定扣款',
    values: rec ? Object.assign({}, rec, { paused: rec.active === false }) : { kind: 'card', dueOffset: 0, category: '卡費', paused: false },
    fields: [
      { name: 'kind', label: '類型', type: 'select', options: [['card', '信用卡（金額依每期帳單）'], ['fixed', '固定金額（貸款、房租、保險…）']] },
      { name: 'name', label: '名稱', placeholder: '例如：玉山卡費、中信房租' },
      { name: 'card', label: '信用卡', suggest: cardSuggest, hidden: v => v.kind !== 'card' },
      {
        type: 'row', hidden: v => v.kind !== 'card', fields: [
          { name: 'closeDay', label: '每月結帳日', type: 'number', placeholder: '1–31' },
          { name: 'dueOffset', label: '扣款月份', type: 'select', options: [[0, '結帳當月'], [1, '結帳次月']] },
        ]
      },
      {
        type: 'row', fields: [
          { name: 'dueDay', label: '每月扣款日', type: 'number', placeholder: '1–31' },
          { name: 'amount', label: '每月金額', type: 'number', hidden: v => v.kind !== 'fixed' },
        ]
      },
      { name: 'payAccount', label: '扣款帳戶', suggest: acctSuggest },
      {
        type: 'row', fields: [
          { name: 'category', label: '記帳類別', suggest: () => uniq(['卡費', '貸款', '固定開銷', '保險'].concat(EXPENSE_CATS)) },
          { name: 'recordNote', label: '記帳內容', placeholder: '留空＝同名稱' },
        ]
      },
      { name: 'paused', label: '暫停（不再出現在行事曆和扣款）', type: 'checkbox', hidden: () => !rec },
    ],
    hint: '怎麼判斷「已扣款」：同一個月、同一個扣款帳戶、內容和「記帳內容」相同的支出，就算已扣款。日期超過該月天數時（例如 31 號），自動改成月底。',
    onSave: v => {
      const day = x => Math.round(Number(x));
      if (!String(v.name || '').trim()) throw new Error('請輸入名稱');
      if (!String(v.payAccount || '').trim()) throw new Error('請輸入扣款帳戶');
      if (!(day(v.dueDay) >= 1 && day(v.dueDay) <= 31)) throw new Error('扣款日要在 1–31 之間');
      const data = {
        name: v.name.trim(), kind: v.kind, payAccount: v.payAccount.trim(), dueDay: day(v.dueDay),
        category: (v.category || '').trim(), recordNote: (v.recordNote || '').trim(), active: !v.paused
      };
      if (v.kind === 'card') {
        if (!String(v.card || '').trim()) throw new Error('請輸入信用卡');
        if (!(day(v.closeDay) >= 1 && day(v.closeDay) <= 31)) throw new Error('結帳日要在 1–31 之間');
        Object.assign(data, { card: v.card.trim(), closeDay: day(v.closeDay), dueOffset: Number(v.dueOffset) || 0, amount: 0 });
      } else {
        if (!(Number(v.amount) >= 0) || v.amount === '') throw new Error('請輸入每月金額');
        Object.assign(data, { card: '', closeDay: '', dueOffset: 0, amount: Number(v.amount) });
      }
      if (rec) updateRec('Bills', rec.id, data);
      else createRec('Bills', Object.assign(data, { overrides: '{}', sort: S.data.Bills.length }));
    },
    onDelete: rec && (() => removeRec('Bills', rec.id)),
  });
}

/* ───────── 帳戶互轉檢查 ───────── */
// 同一天轉出合計＝轉入合計的視為相符（支援一筆轉出分到多個帳戶）；其餘再用相同金額配對
function transferCheck(m) {
  const tr = monthTx(m).filter(t => String(t.category || '').trim() === TRANSFER_CAT);
  const outs = tr.filter(t => t.type === 'expense'), ins = tr.filter(t => t.type === 'income');
  let left = [];
  uniq(tr.map(t => t.date)).forEach(d => {
    const o = outs.filter(t => t.date === d), i = ins.filter(t => t.date === d);
    if (Math.round(sum(o)) !== Math.round(sum(i))) left = left.concat(o, i);
  });
  const lo = left.filter(t => t.type === 'expense'), li = left.filter(t => t.type === 'income');
  const unmatched = [];
  lo.forEach(t => {
    const k = li.findIndex(x => Math.round(x.amount) === Math.round(t.amount));
    if (k >= 0) li.splice(k, 1); else unmatched.push(t);
  });
  return { out: sum(outs), in: sum(ins), count: tr.length, unmatched: unmatched.concat(li) };
}
function transferCard(m) {
  const c = transferCheck(m);
  if (!c.count) return '';
  return `<div class="card report"><h3>帳戶互轉檢查 <span>轉出 ${money(c.out)}・轉入 ${money(c.in)}</span></h3>
    ${c.unmatched.length ? `<div class="alert warn" style="margin-bottom:6px">有 ${c.unmatched.length} 筆找不到對應的另一邊，帳戶餘額可能會不準</div>
      ${c.unmatched.sort((a, b) => a.date.localeCompare(b.date)).map(t => `<div class="sub-row" data-act="editTx" data-id="${t.id}">
        <span><small>${md(t.date)}</small> ${esc(t.account)} ${t.type === 'expense' ? '轉出' : '轉入'}</span><span class="${numCls(signed(t))}">${num(signed(t))}</span></div>`).join('')}
      <p class="help">可能是漏記了另一邊，或是其實不是轉帳（例如期初餘額）。點一下可以修改。</p>`
      : '<div class="alert ok" style="margin-bottom:0">✅ 轉出和轉入全部相符</div>'}</div>`;
}

/* ───────── 月初對帳 ───────── */
function isOpening(t) { return t.type === 'income' && OPENING_RE.test(String(t.category || '')); }
function openingCategoryFor(acct) {
  const prev = S.data.Transactions.filter(t => isOpening(t) && String(t.account || '').trim() === acct)
    .sort((a, b) => b.date.localeCompare(a.date));
  return prev.length ? prev[0].category : acct.replace(/帳戶$/, '') + '餘額';
}
function reconcileData(m) {
  const prevM = addMonths(m, -1);
  const prev = accountBalances(prevM);
  const openTx = monthTx(m).filter(t => isOpening(t) && !isCard(t.account));
  const opening = {};
  openTx.forEach(t => { const a = String(t.account || '').trim(); (opening[a] = opening[a] || []).push(t); });
  const prevOpenAccts = monthTx(prevM).filter(t => isOpening(t) && !isCard(t.account)).map(t => String(t.account).trim());
  const accts = uniq(Object.keys(prev).concat(Object.keys(opening), prevOpenAccts)).sort(acctOrder);
  return accts.map(a => {
    const rows = opening[a] || [];
    return { acct: a, computed: Math.round(prev[a] || 0), rows, actual: rows.length ? sum(rows) : null };
  });
}

VIEWS.reconcile = function () {
  const m = S.recMonth, prevM = addMonths(m, -1);
  const data = reconcileData(m);
  const done = data.filter(r => r.actual !== null).length;
  const pm = Number(prevM.slice(5)), cm = Number(m.slice(5));
  const diffs = data.filter(r => r.actual !== null && Math.round(r.actual - r.computed) !== 0);
  return `
    <div class="toolbar"><button class="chip" data-act="backToMoney">‹ 返回記帳</button>${monthNav('recMonth', m)}</div>
    <div class="card"><p class="help" style="margin:0">
      ① 打開各家銀行 App，把 <b>${cm} 月 1 號</b> 的實際餘額填進「實際餘額」。<br>
      ② 按「儲存」，會自動建立（或更新）${cm} 月的期初餘額，不用再一筆筆記帳。<br>
      ③ 差額不是 0 的帳戶，代表 ${pm} 月有漏記或記錯，下面會列出該帳戶 ${pm} 月的明細方便核對。</p></div>
    <div class="card report"><h3>${cm} 月期初餘額 <span>${done} / ${data.length} 已登記</span></h3>
      <table class="rtable rec">
        <thead><tr><th>帳戶</th><th>${pm} 月結餘<br><small>App 計算</small></th><th>實際餘額</th><th>差額</th></tr></thead>
        <tbody>${data.map(r => `<tr>
          <td>${esc(r.acct)}</td><td>${num(r.computed)}</td>
          <td><input class="rec-input" type="number" inputmode="decimal" data-acct="${esc(r.acct)}" data-computed="${r.computed}" value="${r.actual === null ? '' : Math.round(r.actual)}" placeholder="${r.computed > 0 ? num(r.computed) : ''}"></td>
          <td class="rec-diff" data-acct="${esc(r.acct)}">${r.actual === null ? '<span class="muted">—</span>' : diffHtml(r.actual - r.computed)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="form-actions">
        <button class="btn secondary" data-act="recFill">空白的帶入 App 計算的結餘</button>
        <button class="btn" data-act="recSave">儲存 ${cm} 月期初餘額</button>
      </div></div>
    ${diffs.length ? `<div class="card report"><h3>有差額的帳戶 <span>點開看 ${pm} 月明細</span></h3>
      ${diffs.map(r => drill(`${r.acct}（差 ${r.actual - r.computed > 0 ? '+' : ''}${num(r.actual - r.computed)}）`, r.computed,
    itemRows(monthTx(prevM).filter(t => String(t.account || '').trim() === r.acct)))).join('')}
      <p class="help">常見原因：漏記一筆、轉帳只記了一邊、金額打錯、刷卡記成帳戶扣款。</p></div>` : ''}`;
};
function diffHtml(d) {
  d = Math.round(d);
  return d ? `<span class="diff">${d > 0 ? '+' : ''}${num(d)}</span>` : '<span class="income">✓ 0</span>';
}

/* ───────── 報表 ───────── */
function signed(t) { return (t.type === 'income' ? 1 : -1) * Number(t.amount || 0); }
function num(n) { n = Math.round(n); return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('zh-TW'); }
function numCls(n) { return n < 0 ? 'expense' : n > 0 ? 'income' : 'muted'; }
function isCard(acc) { return CARD_RE.test(String(acc || '')); }
// 依 BANKS 清單順序排列帳戶，清單外的排後面
function acctOrder(a, b) {
  const ia = BANKS.indexOf(a), ib = BANKS.indexOf(b);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
}
function accountBalances(m) {
  const out = {};
  monthTx(m).filter(t => !isCard(t.account)).forEach(t => {
    const a = String(t.account || '').trim() || '（未填帳戶）';
    out[a] = (out[a] || 0) + signed(t);
  });
  return out;
}
// 可展開的一列：summary 顯示總計，展開後顯示明細
function drill(label, total, inner) {
  return `<details class="drill"><summary><span>${esc(label)}</span><b class="${numCls(total)}">${num(total)}</b></summary><div class="drill-body">${inner}</div></details>`;
}
function subRows(entries) {
  return entries.map(([k, v]) => `<div class="sub-row"><span>${esc(k)}</span><span class="${numCls(v)}">${num(v)}</span></div>`).join('');
}
function itemRows(arr) {
  return arr.sort((a, b) => a.date.localeCompare(b.date))
    .map(t => `<div class="sub-row" data-act="editTx" data-id="${t.id}"><span><small>${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8))}</small> ${esc(stripShared(t.note) || t.category)}</span><span class="${numCls(signed(t))}">${num(signed(t))}</span></div>`).join('');
}
function reportTotal(label, total) {
  return `<div class="report-total"><span>${label}</span><b class="${numCls(total)}">${num(total)}</b></div>`;
}
function bySum(arr, keyFn) {
  const g = {};
  arr.forEach(t => { const k = keyFn(t); (g[k] = g[k] || []).push(t); });
  return g;
}

function listLink(acct) {
  return `<div class="sub-row"><a class="link" data-act="listAcct" data-acct="${esc(acct)}">看 ${esc(acct)} 的完整明細 ›</a></div>`;
}

function moneyReports() {
  const m = S.moneyMonth;
  const tx = monthTx(m);
  if (!tx.length) return '<div class="card"><div class="empty">這個月還沒有記帳</div></div>';

  // 1. 帳戶餘額：信用卡以外的帳戶，收入加、支出減（含帳戶互轉）
  const bankTx = tx.filter(t => !isCard(t.account));
  const byAcct = bySum(bankTx, t => String(t.account || '').trim() || '（未填帳戶）');
  const acctNames = Object.keys(byAcct).sort(acctOrder);
  const balTotal = sum(bankTx.map(t => ({ amount: signed(t) })));
  const balanceCard = `<div class="card report"><h3>帳戶餘額 <span>點帳戶看明細</span></h3>
    ${acctNames.map(a => {
    const arr = byAcct[a];
    const part = (type, label) => {
      const g = groupSum(arr.filter(t => t.type === type), 'category').map(([k, v]) => [k, type === 'income' ? v : -v]);
      return g.length ? `<div class="sub-head">${label}</div>${subRows(g)}` : '';
    };
    return drill(a, sum(arr.map(t => ({ amount: signed(t) }))), part('expense', '支出') + part('income', '收入') + listLink(a));
  }).join('')}
    ${reportTotal('總和', balTotal)}</div>`;

  // 2. 信用卡費：用信用卡付的支出
  const cardTx = tx.filter(t => t.type === 'expense' && isCard(t.account));
  const byCard = bySum(cardTx, t => t.account);
  const cardCard = `<div class="card report"><h3>信用卡費</h3>
    ${Object.keys(byCard).length ? Object.entries(byCard).sort((a, b) => sum(b[1]) - sum(a[1]))
      .map(([c, arr]) => drill(c, -sum(arr), itemRows(arr) + listLink(c))).join('') + reportTotal('總和', -sum(cardTx))
      : '<div class="empty">這個月沒有刷卡</div>'}</div>`;

  // 3. 前月帳戶餘額：上個月各帳戶結餘 vs 這個月 1 號登記的餘額
  const prev = accountBalances(addMonths(m, -1));
  const opening = {};
  tx.filter(t => t.type === 'income' && OPENING_RE.test(String(t.category || '')) && !isCard(t.account))
    .forEach(t => { const a = String(t.account || '').trim(); opening[a] = (opening[a] || 0) + Number(t.amount || 0); });
  const recAccts = uniq(Object.keys(prev).concat(Object.keys(opening))).sort(acctOrder);
  const pSum = recAccts.reduce((s, a) => s + (prev[a] || 0), 0);
  const oSum = recAccts.reduce((s, a) => s + (opening[a] || 0), 0);
  const recCard = `<div class="card report"><h3>前月帳戶餘額 <a data-act="openReconcile" data-m="${m}">開始對帳 ›</a></h3>
    <p class="help" style="margin-top:-4px">差額 = 1 號餘額 − 前月結餘</p>
    ${recAccts.length ? `<table class="rtable">
      <thead><tr><th>帳戶</th><th>前月結餘</th><th>1 號餘額</th><th>差額</th></tr></thead>
      <tbody>${recAccts.map(a => {
    const p = prev[a] || 0, o = opening[a] || 0, d = o - p;
    return `<tr><td>${esc(a)}</td><td>${num(p)}</td><td>${num(o)}</td><td class="${Math.round(d) ? 'diff' : 'muted'}">${num(d)}</td></tr>`;
  }).join('')}</tbody>
      <tfoot><tr><td>總和</td><td>${num(pSum)}</td><td>${num(oSum)}</td><td>${num(oSum - pSum)}</td></tr></tfoot>
    </table>${Object.keys(prev).length ? '' : '<p class="help">上個月沒有記帳資料，前月結餘以 0 計算。</p>'}`
      : '<div class="empty">沒有資料</div>'}</div>`;

  // 4. 共同生活開銷：內容有「(共同)」的支出
  const sharedTx = tx.filter(t => t.type === 'expense' && isShared(t));
  const byCat = bySum(sharedTx, t => String(t.category || '').trim() || '其他');
  const sharedCard = `<div class="card report"><h3>共同生活開銷</h3>
    ${sharedTx.length ? Object.entries(byCat).sort((a, b) => sum(b[1]) - sum(a[1]))
      .map(([c, arr]) => drill(c, -sum(arr), itemRows(arr))).join('') + reportTotal('總和', -sum(sharedTx))
      : '<div class="empty">這個月沒有共同支出</div>'}</div>`;

  return transferCard(m) + balanceCard + cardCard + recCard + sharedCard;
}

function moneyList() {
  const importBtn = '<button class="btn secondary import-entry" data-act="openImport">📷 匯入截圖／📋 貼上明細</button>';
  return importBtn + moneyListBody();
}
function acctOf(t) { return String(t.account || '').trim() || '（未填帳戶）'; }

// 明細的帳戶篩選選單：只列這個月有紀錄的帳戶（含筆數），依信用卡／電子支付／銀行帳戶分組
function listAcctSelect(tx) {
  const cnt = {};
  tx.forEach(t => { const a = acctOf(t); cnt[a] = (cnt[a] || 0) + 1; });
  if (S.listAcct && !cnt[S.listAcct]) cnt[S.listAcct] = 0;
  const names = Object.keys(cnt).sort(acctOrder);
  const opt = a => `<option value="${esc(a)}" ${a === S.listAcct ? 'selected' : ''}>${esc(a)}（${cnt[a]}）</option>`;
  const grp = (label, arr) => arr.length ? `<optgroup label="${label}">${arr.map(opt).join('')}</optgroup>` : '';
  const cards = names.filter(isCard), wallets = names.filter(a => !isCard(a) && isWallet(a)), banks = names.filter(a => !isCard(a) && !isWallet(a));
  return `<div class="list-filter">
    <select id="listAcct" aria-label="篩選帳戶"><option value="" ${!S.listAcct ? 'selected' : ''}>全部帳戶（${tx.length}）</option>
      ${grp('信用卡（支付方式）', cards)}${grp('電子支付', wallets)}${grp('銀行帳戶／現金', banks)}</select>
    ${S.listAcct ? '<button class="chip" data-act="listAcctClear">清除</button>' : ''}</div>`;
}

// 篩選後最上面的小計
function listAcctSummary(a, arr) {
  const exp = sum(arr.filter(t => t.type === 'expense'));
  const inc = sum(arr.filter(t => t.type === 'income'));
  const stat = (label, v, cls) => `<div class="stat"><div class="label">${label}</div><div class="value ${cls || ''}">${v}</div></div>`;
  if (isCard(a)) {
    return `<div class="stats" style="margin-bottom:12px">
      ${stat('刷卡', money(exp), 'expense')}${stat('回饋／退款', money(inc), 'income')}${stat('本月淨額', money(exp - inc))}</div>`;
  }
  const opening = sum(arr.filter(isOpening));
  const tin = sum(arr.filter(t => t.type === 'income' && !isOpening(t)));
  return `<div class="stats four" style="margin-bottom:12px">
    ${stat('期初餘額', money(opening))}${stat('收入／轉入', money(tin), 'income')}${stat('支出／轉出', money(exp), 'expense')}${stat('目前結餘', money(opening + tin - exp))}</div>`;
}

function moneyListBody() {
  const all = monthTx(S.moneyMonth)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!all.length) return '<div class="card"><div class="empty">這個月還沒有記帳，按右下角 ＋ 開始記一筆</div></div>';
  const f = S.listAcct;
  const tx = f ? all.filter(t => acctOf(t) === f) : all;
  const head = listAcctSelect(all) + (f ? listAcctSummary(f, tx) : '');
  if (!tx.length) return head + `<div class="card"><div class="empty">${esc(f)} 這個月沒有紀錄</div></div>`;
  const groups = {};
  tx.forEach(x => (groups[x.date] = groups[x.date] || []).push(x));
  return head + Object.entries(groups).map(([d, arr]) => {
    // 全部：當天支出（不含互轉）；單一帳戶：當天這個帳戶的進出淨額
    let right;
    if (f) { const net = arr.reduce((s2, t) => s2 + signed(t), 0); right = net ? (net > 0 ? '+' : '-') + money(Math.abs(net)) : ''; }
    else { const out = sum(arr.filter(x => x.type === 'expense' && counted(x))); right = out ? '支出 ' + money(out) : ''; }
    return `<div class="group-head"><span>${dateLabel(d)}</span><span>${right}</span></div>
      <div class="card tight">${list(arr.map(t => txItem(t, f)).filter(Boolean), '')}</div>`;
  }).join('');
}

function notesList() {
  const diary = S.notesMode === 'diary';
  const q = S.noteQuery.trim().toLowerCase();
  let arr = S.data.Notes.filter(n => n.kind === (diary ? 'diary' : 'note'));
  if (q) arr = arr.filter(n => [n.title, n.content, n.tags, n.date].join(' ').toLowerCase().includes(q));
  arr.sort(diary
    ? (a, b) => String(b.date).localeCompare(String(a.date))
    : (a, b) => (b.pinned === true) - (a.pinned === true) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const empty = q ? '找不到符合的內容' : diary ? '還沒有日記，按右下角 ＋ 寫今天的日記' : '還沒有筆記，按右下角 ＋ 新增';
  if (!diary) return `<div class="card">${list(arr.map(noteItem), empty)}</div>`;
  // 日記依月份分組
  const groups = {};
  arr.forEach(n => (groups[String(n.date).slice(0, 7)] = groups[String(n.date).slice(0, 7)] || []).push(n));
  if (!arr.length) return `<div class="card"><div class="empty">${empty}</div></div>`;
  return Object.entries(groups).map(([ym, items]) => `<div class="group-head"><span>${ym.slice(0, 4)} 年 ${Number(ym.slice(5))} 月</span><span>${items.length} 篇</span></div>
    <div class="card tight">${list(items.map(noteItem), '')}</div>`).join('');
}

function render() {
  const v = S.view;
  const search = document.activeElement && document.activeElement.id === 'noteSearch';
  $('#pageTitle').textContent = TITLES[v];
  $('#view').innerHTML = VIEWS[v]();
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#fab').classList.toggle('hidden', v === 'settings' || v === 'reconcile' || v === 'import');
  if (v === 'reconcile' || v === 'import') document.querySelector('.tabbar [data-view="money"]').classList.add('active');
  if (search) { const el = $('#noteSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  updateStatus();
}
function go(view) {
  S.view = view;
  render();
  window.scrollTo(0, 0);
}

/* ───────── 通用表單 ───────── */
let formState = null;

function openForm(opts) {
  formState = { opts, values: Object.assign({}, opts.values || {}) };
  $('#modalTitle').textContent = opts.title;
  const f = $('#modalForm');
  f.innerHTML = opts.fields.map(fieldHtml).join('') + `
    ${opts.hint ? `<p class="help">${opts.hint}</p>` : ''}
    <div class="form-actions">
      ${(opts.extra || []).filter(x => x.primary).map(x => `<button type="button" class="btn" data-act="formExtra" data-i="${opts.extra.indexOf(x)}">${esc(x.label)}</button>`).join('')}
      <button type="submit" class="btn ${(opts.extra || []).some(x => x.primary) ? 'secondary' : ''}">${esc(opts.submitLabel || '儲存')}</button>
      ${(opts.extra || []).filter(x => !x.primary).map(x => `<button type="button" class="btn secondary" data-act="formExtra" data-i="${opts.extra.indexOf(x)}">${esc(x.label)}</button>`).join('')}
      ${opts.onDelete ? '<button type="button" class="btn danger" data-act="formDelete">刪除</button>' : ''}
    </div>`;
  $('#modal').classList.remove('hidden');
  const firstInput = f.querySelector('input[type=text], input[type=number], textarea');
  if (firstInput && opts.autofocus !== false) setTimeout(() => firstInput.focus(), 50);
}

function fieldHtml(fd) {
  if (fd.hidden && fd.hidden(formState.values)) return '';
  if (typeof fd.label === 'function') fd = Object.assign({}, fd, { label: fd.label(formState.values) });
  const v = formState.values[fd.name];
  const id = 'f_' + fd.name;
  switch (fd.type) {
    case 'row':
      return `<div class="row2">${fd.fields.map(fieldHtml).join('')}</div>`;
    case 'txType': {
      const tr = formState.values._allowTransfer;
      return `<div class="field"><div class="type-toggle ${tr ? 'three' : ''}">
        <button type="button" class="expense ${v === 'expense' ? 'on' : ''}" data-act="pickType" data-v="expense">支出</button>
        <button type="button" class="income ${v === 'income' ? 'on' : ''}" data-act="pickType" data-v="income">收入</button>
        ${tr ? `<button type="button" class="transfer ${v === 'transfer' ? 'on' : ''}" data-act="pickType" data-v="transfer">轉帳</button>` : ''}
      </div></div>`;
    }
    case 'chips': {
      const chips = fd.chips(formState.values);
      if (!chips.length) return '';
      return `<div class="field"><label>常用</label><div class="chips">${chips.map((c, i) =>
        `<button type="button" class="qchip ${c.type}${c.pinned ? ' pinned' : ''}" data-act="pickChip" data-i="${i}">${esc(c.name)}${c.shared ? '<sup>共</sup>' : ''}${c.amount ? `<small>${moneyShort(c.amount)}</small>` : ''}</button>`).join('')}</div></div>`;
    }
    case 'textarea':
      return `<div class="field"><label for="${id}">${fd.label}</label><textarea id="${id}" name="${fd.name}" class="${fd.tall ? 'tall' : ''}" placeholder="${esc(fd.placeholder || '')}">${esc(v)}</textarea></div>`;
    case 'select':
      return `<div class="field"><label for="${id}">${fd.label}</label><select id="${id}" name="${fd.name}">
        ${fd.options.map(o => `<option value="${esc(o[0])}" ${String(v == null ? '' : v) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
    case 'checkbox':
      return `<div class="field inline"><input type="checkbox" id="${id}" name="${fd.name}" ${v ? 'checked' : ''}><label for="${id}">${fd.label}</label></div>`;
    case 'days': {
      const days = String(v || '');
      return `<div class="field"><label>${fd.label}</label><div class="days-pick">
        ${DOW.map((d, i) => `<button type="button" class="${days.includes(String(i)) ? 'on' : ''}" data-act="pickDay" data-v="${i}">${d}</button>`).join('')}
      </div></div>`;
    }
    default: {
      const dl = fd.suggest ? `list="${id}_dl"` : '';
      const dlHtml = fd.suggest ? `<datalist id="${id}_dl">${fd.suggest(formState.values).map(s => `<option value="${esc(s)}">`).join('')}</datalist>` : '';
      const extra = fd.type === 'number' ? 'inputmode="decimal" step="any"' : '';
      return `<div class="field"><label for="${id}">${fd.label}</label>
        <input type="${fd.type || 'text'}" id="${id}" name="${fd.name}" value="${esc(v)}" ${dl} ${extra} ${fd.placeholder ? `placeholder="${esc(fd.placeholder)}"` : ''}>${dlHtml}</div>`;
    }
  }
}

function readForm() {
  const vals = formState.values;
  $('#modalForm').querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.name) return;
    // 有建議清單的欄位在點進去時會暫時清空，讀取時以原值為準
    if (el.dataset.prev !== undefined && !el.value) { vals[el.name] = el.dataset.prev; return; }
    vals[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return vals;
}
// skipRead：呼叫端已經讀過並修改了 values，不要再用畫面上的舊值蓋掉
function rerenderForm(skipRead) {
  if (!skipRead) readForm();
  const o = formState.opts;
  o.values = formState.values;
  o.autofocus = false;
  openForm(o);
}
function closeForm() {
  $('#modal').classList.add('hidden');
  formState = null;
}

function submitForm() {
  const vals = readForm();
  try {
    formState.opts.onSave(vals); // 本機立即生效，背景上傳
    closeForm();
    render();
    toast(S.queue.length && (S.offline || !navigator.onLine) ? '已儲存（離線，稍後上傳）' : '已儲存');
  } catch (err) {
    toast(err.message, true);
  }
}

/* ───────── 各類表單 ───────── */
// 同類型最近一筆用的支付方式／入帳銀行，當作新增時的預設值
function lastAccount(type) {
  const arr = S.data.Transactions.filter(t => t.type === type && t.account)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return arr.length ? arr[0].account : '現金';
}

function lastTransferAccount(type) {
  const arr = S.data.Transactions.filter(t => t.type === type && t.category === TRANSFER_CAT && t.account)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return arr.length ? arr[0].account : '';
}
function transferPair(t) {
  if (!t || !t.link) return null;
  const pair = S.data.Transactions.filter(x => x.link === t.link);
  return { out: pair.find(x => x.type === 'expense'), in: pair.find(x => x.type === 'income') };
}

/* 常用按鈕：釘選的先排，再依歷史出現次數補滿 */
function quickChips() {
  const pinned = S.data.Quick.slice().sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0))
    .map(q => ({ name: q.name, type: q.type, amount: Number(q.amount) || 0, category: q.category, account: q.account, shared: q.shared === true, pinned: true, id: q.id }));
  const used = new Set(pinned.map(c => c.type + '|' + c.name + '|' + c.shared));
  const stats = {};
  S.data.Transactions.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, QUICK_HISTORY)
    .forEach(t => {
      const name = stripShared(t.note);
      if (!name || t.category === TRANSFER_CAT || OPENING_RE.test(String(t.category || '')) || name === '餘額') return;
      const k = t.type + '|' + name + '|' + isShared(t);
      if (used.has(k)) return;
      if (!stats[k]) stats[k] = { name, type: t.type, amount: Number(t.amount) || 0, category: t.category, account: t.account, shared: isShared(t), n: 0 };
      stats[k].n++; // 欄位以最新一筆為準（已依建立時間新到舊排序）
    });
  const auto = Object.values(stats).filter(c => c.n >= 2).sort((a, b) => b.n - a.n);
  return pinned.concat(auto).slice(0, Math.max(QUICK_MAX, pinned.length));
}

function txForm(rec) {
  const pair = transferPair(rec);
  const isTr = !!(pair && pair.out && pair.in);
  const defDate = S.view === 'money' && S.moneyMonth !== today().slice(0, 7) ? S.moneyMonth + '-01' : today();
  let values;
  if (isTr) values = { type: 'transfer', amount: pair.out.amount, from: pair.out.account, to: pair.in.account, date: pair.out.date, note: stripShared(pair.out.note) === TRANSFER_CAT ? '' : stripShared(pair.out.note), _allowTransfer: true };
  else if (rec) values = Object.assign({}, rec, { shared: isShared(rec), note: stripShared(rec.note), _allowTransfer: false });
  else values = { type: 'expense', shared: false, date: defDate, account: lastAccount('expense'), _allowTransfer: true };
  const chipList = rec ? [] : quickChips();
  const whenTransfer = v => v.type === 'transfer';
  const acctList = () => uniq(BANKS.concat(S.data.Transactions.map(t => t.account)).filter(a => !isCard(a)));
  openForm({
    title: isTr ? '編輯轉帳' : rec ? '編輯記帳' : '記一筆',
    values,
    chipList,
    fields: [
      { name: 'type', type: 'txType' },
      { type: 'chips', chips: v => v.type === 'transfer' ? [] : chipList },
      { name: 'amount', label: '金額', type: 'number', placeholder: '0' },
      { name: 'category', label: '類別', placeholder: '點一下可從清單選，或直接輸入', hidden: whenTransfer, suggest: v => uniq((v.type === 'income' ? INCOME_CATS : EXPENSE_CATS).concat(S.data.Transactions.filter(t => t.type === v.type).map(t => t.category))) },
      {
        type: 'row', hidden: v => v.type !== 'transfer', fields: [
          { name: 'from', label: '轉出帳戶', suggest: acctList },
          { name: 'to', label: '轉入帳戶', suggest: acctList },
        ]
      },
      {
        type: 'row', fields: [
          { name: 'date', label: '日期', type: 'date' },
          { name: 'account', label: v => v.type === 'income' ? '入帳銀行' : '支付方式', hidden: whenTransfer, suggest: v => uniq((v.type === 'income' ? BANKS : PAY_METHODS).concat(S.data.Transactions.filter(t => t.type === v.type).map(t => t.account))) },
        ]
      },
      { name: 'note', label: v => v.type === 'transfer' ? '備註（可留空）' : '內容／備註' },
      { name: 'shared', label: '共同（儲存時在內容後加上「(共同)」）', type: 'checkbox', hidden: whenTransfer },
      { name: 'pin', label: '加入常用按鈕', type: 'checkbox', hidden: v => !!rec || v.type === 'transfer' },
    ],
    hint: isTr ? '轉帳會同時修改轉出、轉入兩筆。' : '',
    onSave: v => {
      if (!(Number(v.amount) > 0)) throw new Error('請輸入金額');
      if (!v.date) throw new Error('請選擇日期');
      if (v.type === 'transfer') return saveTransfer(v, isTr ? pair : null, rec);
      const base = stripShared(v.note);
      const note = v.shared ? (base ? base + SHARED_SUFFIX : SHARED_SUFFIX) : base;
      const data = { type: v.type, amount: Number(v.amount), category: (v.category || '').trim() || '其他', date: v.date, account: (v.account || '').trim(), note };
      rec ? updateRec('Transactions', rec.id, data) : createRec('Transactions', data);
      if (v.pin && base && !S.data.Quick.some(q => q.type === v.type && q.name === base && (q.shared === true) === !!v.shared)) {
        createRec('Quick', { name: base, type: v.type, amount: data.amount, category: data.category, account: data.account, shared: !!v.shared, sort: S.data.Quick.length });
      }
    },
    onDelete: rec && (() => {
      if (isTr) { removeRec('Transactions', pair.out.id); removeRec('Transactions', pair.in.id); }
      else removeRec('Transactions', rec.id);
    }),
  });
}

function saveTransfer(v, pair) {
  const from = String(v.from || '').trim(), to = String(v.to || '').trim();
  if (!from || !to) throw new Error('請填轉出和轉入帳戶');
  if (from === to) throw new Error('轉出和轉入不能是同一個帳戶');
  const note = String(v.note || '').trim() || TRANSFER_CAT;
  const base = { amount: Number(v.amount), category: TRANSFER_CAT, date: v.date, note };
  if (pair) {
    updateRec('Transactions', pair.out.id, Object.assign({ type: 'expense', account: from }, base));
    updateRec('Transactions', pair.in.id, Object.assign({ type: 'income', account: to }, base));
  } else {
    const link = uid();
    createRec('Transactions', Object.assign({ type: 'expense', account: from, link }, base));
    createRec('Transactions', Object.assign({ type: 'income', account: to, link }, base));
  }
}

function quickForm(q) {
  openForm({
    title: '編輯常用按鈕',
    values: Object.assign({}, q),
    fields: [
      { name: 'type', label: '類型', type: 'select', options: [['expense', '支出'], ['income', '收入']] },
      { name: 'name', label: '內容' },
      {
        type: 'row', fields: [
          { name: 'amount', label: '預設金額（0＝每次自己填）', type: 'number' },
          { name: 'category', label: '類別', suggest: v => v.type === 'income' ? INCOME_CATS : EXPENSE_CATS },
        ]
      },
      { name: 'account', label: '支付方式／入帳銀行', suggest: v => v.type === 'income' ? BANKS : PAY_METHODS },
      { name: 'shared', label: '共同', type: 'checkbox' },
    ],
    onSave: v => {
      if (!String(v.name || '').trim()) throw new Error('請輸入內容');
      updateRec('Quick', q.id, { type: v.type, name: v.name.trim(), amount: Number(v.amount) || 0, category: (v.category || '').trim(), account: (v.account || '').trim(), shared: !!v.shared });
    },
    onDelete: () => removeRec('Quick', q.id),
  });
}

function taskForm(rec, presetDue) {
  openForm({
    title: rec ? '編輯待辦' : '新增待辦',
    values: rec ? Object.assign({}, rec) : { priority: 1, due: presetDue || '', repeat: '' },
    fields: [
      { name: 'title', label: '要做什麼', placeholder: '例如：繳電話費' },
      {
        type: 'row', fields: [
          { name: 'due', label: '期限', type: 'date' },
          { name: 'priority', label: '優先度', type: 'select', options: [[1, '一般'], [2, '中'], [3, '高']] },
        ]
      },
      { name: 'repeat', label: '重複', type: 'select', options: REPEAT_OPTS },
      { name: 'note', label: '備註', type: 'textarea' },
      { name: 'done', label: '已完成', type: 'checkbox', hidden: () => !rec },
    ],
    hint: '重複的待辦：打勾完成後，會自動建立下一次的待辦。',
    onSave: v => {
      if (!v.title.trim()) throw new Error('請輸入待辦內容');
      if (v.repeat && !v.due) throw new Error('重複的待辦需要設定期限');
      const data = { title: v.title.trim(), due: v.due, priority: Number(v.priority), note: v.note, repeat: v.repeat };
      if (rec) {
        const completing = !!v.done && !rec.done;
        data.done = !!v.done;
        updateRec('Tasks', rec.id, data);
        if (completing) spawnNextTask(Object.assign({}, rec, data));
      } else {
        createRec('Tasks', data);
      }
    },
    onDelete: rec && (() => removeRec('Tasks', rec.id)),
  });
}

function spawnNextTask(t) {
  if (!t.repeat || !t.due) return;
  let due = nextDate(t.due, t.repeat);
  while (due < today() && t.repeat === 'daily') due = nextDate(due, t.repeat); // 每天的待辦不要累積到過去
  createRec('Tasks', { title: t.title, note: t.note, priority: t.priority, repeat: t.repeat, due, done: false });
  toast('已完成，下一次：' + dateLabel(due));
}

function eventForm(rec, presetDate) {
  openForm({
    title: rec ? '編輯行程' : '新增行程',
    values: rec ? Object.assign({}, rec) : { date: presetDate || today(), start: '09:00', end: '10:00', allDay: false, repeat: '' },
    fields: [
      { name: 'title', label: '標題', placeholder: '例如：牙醫回診' },
      { name: 'date', label: v => v.repeat ? '開始日期' : '日期', type: 'date' },
      { name: 'allDay', label: '全天', type: 'checkbox' },
      {
        type: 'row', hidden: v => v.allDay, fields: [
          { name: 'start', label: '開始', type: 'time' },
          { name: 'end', label: '結束', type: 'time' },
        ]
      },
      {
        type: 'row', fields: [
          { name: 'repeat', label: '重複', type: 'select', options: REPEAT_OPTS },
          { name: 'repeatUntil', label: '重複到（可留空）', type: 'date', hidden: v => !v.repeat },
        ]
      },
      { name: 'location', label: '地點' },
      { name: 'note', label: '備註', type: 'textarea' },
    ],
    hint: rec && rec.repeat ? '這是重複行程，修改或刪除會套用到每一次。' : '',
    onSave: v => {
      if (!v.title.trim()) throw new Error('請輸入標題');
      if (!v.date) throw new Error('請選擇日期');
      if (!v.allDay && v.start && v.end && v.end < v.start) throw new Error('結束時間早於開始時間');
      if (v.repeat && v.repeatUntil && v.repeatUntil < v.date) throw new Error('「重複到」早於開始日期');
      const data = {
        title: v.title.trim(), date: v.date, allDay: !!v.allDay, start: v.allDay ? '' : v.start, end: v.allDay ? '' : v.end,
        location: v.location, note: v.note, repeat: v.repeat, repeatUntil: v.repeat ? (v.repeatUntil || '') : '',
      };
      rec ? updateRec('Events', rec.id, data) : createRec('Events', data);
      if (!v.repeat) { S.calSel = v.date; S.calMonth = v.date.slice(0, 7); }
    },
    onDelete: rec && (() => removeRec('Events', rec.id)),
  });
}

function routineForm(rec) {
  openForm({
    title: rec ? '編輯例行公事' : '新增例行公事',
    values: rec ? Object.assign({}, rec, { paused: rec.active === false }) : { days: '0123456', paused: false },
    fields: [
      { name: 'name', label: '名稱', placeholder: '例如：運動 30 分鐘' },
      { name: 'days', label: '哪幾天要做', type: 'days' },
      { name: 'paused', label: '暫停這個習慣', type: 'checkbox', hidden: () => !rec },
    ],
    onSave: v => {
      if (!v.name.trim()) throw new Error('請輸入名稱');
      if (!v.days) throw new Error('至少選一天');
      const data = { name: v.name.trim(), days: String(v.days).split('').sort().join(''), active: !v.paused };
      if (!rec) data.sort = S.data.Routines.length;
      rec ? updateRec('Routines', rec.id, data) : createRec('Routines', data);
    },
    onDelete: rec && (() => removeRec('Routines', rec.id)),
  });
}

function noteForm(rec, kind) {
  kind = rec ? rec.kind : (kind || 'note');
  const diary = kind === 'diary';
  openForm({
    title: (rec ? '編輯' : '新增') + (diary ? '日記' : '筆記'),
    values: rec ? Object.assign({}, rec) : { kind, date: diary ? today() : '', pinned: false, mood: '' },
    fields: diary ? [
      {
        type: 'row', fields: [
          { name: 'date', label: '日期', type: 'date' },
          { name: 'mood', label: '心情', type: 'select', options: MOODS },
        ]
      },
      { name: 'content', label: '今天發生了什麼', type: 'textarea', tall: true },
      { name: 'tags', label: '標籤（用空格分開）', placeholder: '例如：旅行 家人' },
    ] : [
      { name: 'title', label: '標題' },
      { name: 'content', label: '內容', type: 'textarea', tall: true },
      { name: 'tags', label: '標籤（用空格分開）', placeholder: '例如：工作 購物清單' },
      { name: 'pinned', label: '釘選在最上面', type: 'checkbox' },
    ],
    onSave: v => {
      if (diary && !v.date) throw new Error('請選擇日期');
      if (!String(v.content || '').trim() && !String(v.title || '').trim()) throw new Error('請輸入內容');
      const data = diary
        ? { kind, date: v.date, mood: v.mood, content: v.content, tags: v.tags.trim() }
        : { kind, title: v.title.trim(), content: v.content, tags: v.tags.trim(), pinned: !!v.pinned };
      rec ? updateRec('Notes', rec.id, data) : createRec('Notes', data);
    },
    onDelete: rec && (() => removeRec('Notes', rec.id)),
  });
}

function openDiary(date) {
  const existing = S.data.Notes.find(n => n.kind === 'diary' && n.date === date);
  existing ? noteForm(existing) : noteForm(null, 'diary');
}

/* ───────── 動作 ───────── */
const ACTIONS = {
  go: el => go(el.dataset.view),
  openReconcile: el => { S.recMonth = el.dataset.m || today().slice(0, 7); go('reconcile'); },
  backToMoney: () => { S.moneyMode = 'report'; S.moneyMonth = S.recMonth; go('money'); },
  recMonth: el => { S.recMonth = addMonths(S.recMonth, Number(el.dataset.n)); render(); },
  recFill: () => {
    document.querySelectorAll('.rec-input').forEach(el => {
      const c = Number(el.dataset.computed);
      if (el.value === '' && c >= 0) { el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }
    });
  },
  recSave: () => {
    const m = S.recMonth;
    const data = reconcileData(m);
    let created = 0, updated = 0;
    const bad = [];
    document.querySelectorAll('.rec-input').forEach(el => {
      if (el.value === '') return;
      const val = Number(el.value);
      const r = data.find(x => x.acct === el.dataset.acct);
      if (!(val >= 0)) { bad.push(r.acct); return; }
      if (r.rows.length) {
        // 已經有期初餘額：改第一筆的金額，多出來的重複筆數刪掉
        if (Math.round(sum(r.rows)) !== Math.round(val) || r.rows.length > 1) {
          updateRec('Transactions', r.rows[0].id, { amount: val });
          r.rows.slice(1).forEach(x => removeRec('Transactions', x.id));
          updated++;
        }
      } else {
        createRec('Transactions', { type: 'income', date: m + '-01', amount: val, category: openingCategoryFor(r.acct), account: r.acct, note: '餘額' });
        created++;
      }
    });
    render();
    if (bad.length) toast(bad.join('、') + '：餘額不能是負數', true);
    else toast(created || updated ? `已儲存（新增 ${created}、更新 ${updated} 筆）` : '沒有變更');
  },
  editQuick: el => quickForm(find('Quick', el.dataset.id)),
  listAcct: el => { S.listAcct = el.dataset.acct; S.moneyMode = 'list'; render(); window.scrollTo(0, 0); },
  listAcctClear: () => { S.listAcct = ''; render(); },
  goBills: () => { S.moneyMode = 'bills'; S.moneyMonth = today().slice(0, 7); go('money'); },
  newBill: () => billForm(),
  editBill: el => billForm(find('Bills', el.dataset.id)),
  billDetail: el => billDetail(el.dataset.id, el.dataset.ym),
  seedBills: () => {
    if (S.data.Bills.length) return;
    BILL_SEED.forEach((b, i) => createRec('Bills', Object.assign({ card: '', closeDay: '', dueOffset: 0, amount: 0, overrides: '{}', active: true, sort: i }, b)));
    render();
    toast('已建立 ' + BILL_SEED.length + ' 筆固定扣款');
  },
  formExtra: el => {
    const x = formState.opts.extra[Number(el.dataset.i)];
    const before = formState;
    try {
      x.fn(readForm());
      if (formState === before) closeForm(); // fn 自己開了別的表單就不要關
      render();
    } catch (err) { toast(err.message, true); }
  },
  goMoney: () => { S.moneyMode = 'dash'; S.moneyMonth = today().slice(0, 7); go('money'); },
  newTx: () => txForm(),
  newTask: () => taskForm(),
  newEvent: () => eventForm(),
  newRoutine: () => routineForm(),
  todayDiary: () => openDiary(today()),
  editTx: el => txForm(find('Transactions', el.dataset.id)),
  editTask: el => taskForm(find('Tasks', el.dataset.id)),
  editEvent: el => eventForm(find('Events', el.dataset.id)),
  editRoutine: el => routineForm(find('Routines', el.dataset.id)),
  editNote: el => noteForm(find('Notes', el.dataset.id)),
  moneyMode: el => { S.moneyMode = el.dataset.v; render(); },
  moneyMonth: el => { S.moneyMonth = addMonths(S.moneyMonth, Number(el.dataset.n)); render(); },
  calMonth: el => { S.calMonth = addMonths(S.calMonth, Number(el.dataset.n)); render(); },
  calSel: el => { S.calSel = el.dataset.d; S.calMonth = el.dataset.d.slice(0, 7); render(); },
  calToday: () => { S.calSel = today(); S.calMonth = today().slice(0, 7); render(); },
  taskFilter: el => { S.taskFilter = el.dataset.v; render(); },
  notesMode: el => { S.notesMode = el.dataset.v; S.noteQuery = ''; render(); },
  sync: () => syncAll(),
  clearCache: () => {
    if (!confirm('清除這台裝置的快取並重新下載？（試算表裡的資料不會受影響，尚未上傳的修改會保留）')) return;
    S.data = Object.fromEntries(ENTITIES.map(e => [e, []]));
    localStorage.removeItem('lifeos.data');
    render();
    syncAll();
  },
  saveCfg: async () => {
    S.cfg = { url: $('#cfgUrl').value.trim(), token: $('#cfgToken').value.trim() };
    saveJSON('lifeos.cfg', S.cfg);
    try {
      const r = await api({ action: 'ping' });
      toast('連線成功（後端 v' + r.version + '）');
      await syncAll(true);
    } catch (err) {
      toast('連線失敗：' + err.message, true);
    }
  },
  toggleTask: el => {
    const t = find('Tasks', el.dataset.id);
    const completing = !t.done;
    updateRec('Tasks', t.id, { done: completing });
    if (completing) spawnNextTask(t);
    render();
  },
  toggleRoutine: el => {
    setRoutineLog(el.dataset.id, el.dataset.date, !isDoneOn(el.dataset.id, el.dataset.date));
    render();
  },
  // 表單內
  pickType: el => {
    readForm();
    const v = formState.values;
    if (v.type !== el.dataset.v) {
      v.type = el.dataset.v;
      // 切換收入／支出時，類別和帳戶清單不同，清掉舊值並帶入該類型上次用的帳戶
      v.category = '';
      if (v.type === 'transfer') { v.from = v.from || lastTransferAccount('expense'); v.to = v.to || ''; }
      else v.account = lastAccount(v.type);
    }
    rerenderForm(true);
  },
  pickChip: el => {
    readForm();
    const c = formState.opts.chipList[Number(el.dataset.i)];
    Object.assign(formState.values, { type: c.type, category: c.category, account: c.account, note: c.name, shared: c.shared });
    if (c.amount) formState.values.amount = c.amount;
    rerenderForm(true);
    const amt = $('#f_amount');
    if (amt && !c.amount) amt.focus();
  },
  pickDay: el => {
    readForm();
    const d = el.dataset.v;
    let days = String(formState.values.days || '');
    days = days.includes(d) ? days.replace(d, '') : days + d;
    formState.values.days = days.split('').sort().join('');
    rerenderForm(true);
  },
  formDelete: () => {
    if (!confirm('確定要刪除嗎？')) return;
    formState.opts.onDelete();
    closeForm();
    render();
    toast('已刪除');
  },
};

/* ───────── 匯入截圖（Gemini 辨識） ───────── */
const WALLETS = ['line pay', 'IPass money', '支付寶'];
// 畫面上的銀行名稱 → 你的帳戶名稱用的簡稱
const BANK_ALIASES = [['國泰世華', '國泰'], ['國泰', '國泰'], ['台新', '台新'], ['富邦', '富邦'], ['聯邦', '聯邦'], ['中國信託', '中信'], ['中信', '中信'],
['玉山', '玉山'], ['第一', '第一'], ['永豐', '永豐'], ['上海', '上海'], ['安泰', '安泰'], ['王道', '王道']];
const REBATE_CAT = '刷卡回饋';
const IMP = { batches: [], account: localStorage.getItem('lifeos.impAccount') || '', mode: 'image', text: '' };

function isWallet(a) { return WALLETS.includes(String(a || '').trim()); }
function bankShort(name) {
  const n = String(name || '');
  const hit = BANK_ALIASES.find(([k]) => n.includes(k));
  return hit ? hit[1] : null;
}
function bankToAccount(name) { const s = bankShort(name); return s ? s + '帳戶' : ''; }
function issuerToAccount(src) {
  const iss = String((src && src.issuer) || '') + ' ' + String((src && src.appTitle) || '');
  if (/line\s*pay/i.test(iss)) return 'line pay';
  if (/ipass|一卡通/i.test(iss)) return 'IPass money';
  if (/支付寶/.test(iss)) return '支付寶';
  const s = bankShort(src && src.issuer);
  if (!s) return '';
  return (src.kind === 'bank_account' ? s + '帳戶' : s + '信用卡');
}
function last4Map() { return loadJSON('lifeos.last4', {}); }
function importAccountOptions() {
  const seen = S.data.Transactions.map(t => String(t.account || '').trim()).filter(Boolean);
  const cards = uniq(PAY_METHODS.filter(isCard).concat(seen.filter(isCard)));
  const wallets = uniq(WALLETS.concat(seen.filter(isWallet)));
  const banks = uniq(BANKS.concat(seen).filter(a => !isCard(a) && !isWallet(a)));
  return { cards, wallets, banks };
}
function accountSelect(id, value, attrs) {
  const o = importAccountOptions();
  const opt = a => `<option value="${esc(a)}" ${a === value ? 'selected' : ''}>${esc(a)}</option>`;
  return `<select id="${id}" ${attrs || ''}><option value="" ${!value ? 'selected' : ''}>讓 App 自動判斷</option>
    <optgroup label="信用卡">${o.cards.map(opt).join('')}</optgroup>
    <optgroup label="電子支付">${o.wallets.map(opt).join('')}</optgroup>
    <optgroup label="銀行帳戶">${o.banks.map(opt).join('')}</optgroup></select>`;
}
// 沒有年份時：取「今天往前最近的那個日期」
function inferYear(m, d) {
  const t = today(), y = Number(t.slice(0, 4));
  const cand = y + '-' + pad(m) + '-' + pad(d);
  return cand > addDays(t, 7) ? y - 1 : y;
}
function dayDiff(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 86400000); }
// 已經記過的帳：同金額、日期差 1 天內；同帳戶最可信，其他帳戶也提醒
function findDup(it, account) {
  if (!it.date || !(it.amount > 0)) return null;
  const accts = it.type === 'transfer' ? [it.from, it.to] : [account];
  const near = S.data.Transactions.filter(t => Math.round(t.amount) === Math.round(it.amount) && Math.abs(dayDiff(t.date, it.date)) <= 1 && !isOpening(t));
  const strong = near.find(t => accts.includes(String(t.account || '').trim()));
  const any = strong || near.find(t => t.date === it.date);
  if (!any) return null;
  return { strong: !!strong, text: `${md(any.date)} ${any.account} ${stripShared(any.note) || any.category} ${money(any.amount)}` };
}
// 用「跟已記帳的資料比對」推測是哪個帳戶
function guessAccountByHistory(items) {
  const tally = {};
  items.forEach(it => {
    if (!it.date || it.type === 'transfer') return;
    S.data.Transactions.filter(t => t.date === it.date && Math.round(t.amount) === Math.round(it.amount) && !isOpening(t) && t.category !== TRANSFER_CAT)
      .forEach(t => { const a = String(t.account || '').trim(); (tally[a] = tally[a] || []).push(t); });
  });
  const best = Object.entries(tally).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) return null;
  const t = best[1][0];
  return { account: best[0], reason: `你已記的 ${md(t.date)}「${stripShared(t.note) || t.category}」${money(t.amount)} 是用${best[0]}` };
}

// 類別：先看你以前同樣內容記成什麼，再用關鍵字猜
const CAT_KEYWORDS = [
  [/超商|7-?11|統一超|全家|萊爾富|OK mart|ＯＫ|麥當勞|摩斯|肯德基|早餐|便當|餐廳|食堂|雞蛋糕|小吃|Uber ?Eats|foodpanda|熊貓/i, '餐食'],
  [/飲料|咖啡|星巴克|cama|路易莎|茶|50嵐|清心|可不可|麻古/i, '飲料'],
  [/捷運|乘車|台鐵|高鐵|客運|公車|悠遊|uber|優步|計程|加油|中油|台塑石油|停車|ETC|遠通/i, '交通'],
  [/蝦皮|好市多|costco|全聯|家樂福|大買家|酷澎|coupang|momo|pchome|淘寶|IKEA|寶雅|屈臣氏|康是美|大創|水電|瓦斯|電信|網路費/i, '家用'],
  [/netflix|spotify|nintendo|steam|apple|google play|youtube|disney|影城|威秀|KKBOX|遊戲/i, '娛樂'],
  [/uniqlo|\bgu\b|zara|h&m|net\b|服飾|鞋/i, '服飾'],
  [/保險|人壽|產險/i, '保險'],
  [/醫院|診所|藥局|牙醫|醫療/i, '醫療'],
  [/課程|書店|博客來|誠品|hahow|udemy|openai|chatgpt/i, '課程'],
  [/客路|klook|kkday|agoda|booking|airbnb|航空|飯店|旅行/i, '旅遊'],
];
function guessCategory(note, type, fallback) {
  const name = stripShared(note);
  const hist = S.data.Transactions.filter(t => t.type === type && stripShared(t.note) === name && t.category && t.category !== TRANSFER_CAT)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (hist) return hist.category;
  if (type === 'expense') { const k = CAT_KEYWORDS.find(([re]) => re.test(name)); if (k) return k[1]; }
  return fallback || '其他';
}

/* 本機解析貼上的文字：一行一筆（日期、商家、金額），也支援「日期單獨一行、下面接交易」 */
const RE_DATE = /(?:^|[^\d])(?:(\d{4})\s*[\/\.\-年]\s*)?(\d{1,2})\s*[\/\.\-月]\s*(\d{1,2})日?(?![\d\/])/;
const RE_TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
// 找第一個合理的日期（月 1–12、日 1–31），避免把 460.00 這類金額當成日期
function findDate(str) {
  const re = new RegExp(RE_DATE.source, 'g');
  let m;
  while ((m = re.exec(str))) {
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31) return m;
    re.lastIndex = m.index + 1;
  }
  return null;
}
function localParse(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/　/g, ' ').trim()).filter(Boolean);
  const anyPlus = lines.some(l => /(^|\s)[+＋]\s*(NT\$|\$|＄)?\s*\d/.test(l));
  let carry = null;
  const items = [];
  let meaningful = 0;
  lines.forEach(raw => {
    // 「餘額 NT$ 143」是帳戶餘額，不是交易金額，先拿掉；帳單摘要（合計、應繳…）整行略過
    const line = raw.replace(/餘額\s*[:：]?\s*(NT\$|NTD|\$|＄)?\s*-?[\d,]+(\.\d+)?/g, ' ').trim();
    if (!line) return;
    if (/小計|合計|總計|應繳|本期|上期|最低應繳|信用額度/.test(line)) return;
    let rest = ' ' + line + ' ';
    const dm = findDate(rest);
    if (dm) rest = rest.replace(dm[0], dm[0][0].match(/\d/) ? ' ' : dm[0][0] + ' ');
    rest = rest.replace(RE_TIME, ' ');
    // 金額：有貨幣符號的優先；否則取最後一個獨立的數字
    const amtRe = /([+\-－−＋]?)\s*(NT\$|NTD|TWD|＄|\$)?\s*([+\-－−]?)(?<![A-Za-z0-9.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![A-Za-z0-9])\s*(元|TWD)?/g;
    const nums = [...rest.matchAll(amtRe)].filter(m => m[4]);
    if (!nums.length) { if (dm && rest.trim().length < 6) carry = dm; return; }
    meaningful++;
    const pick = nums.filter(m => m[2] || m[6]).pop() || nums[nums.length - 1];
    const sign = (pick[1] || pick[3] || '').replace(/[－−]/, '-').replace('＋', '+');
    const amount = Number((pick[4] + (pick[5] || '')).replace(/,/g, ''));
    const date = dm || carry;
    let merchant = rest.replace(pick[0], ' ').replace(/[>›＞]\s*$/, '').replace(/\s+/g, ' ').replace(/^[\s\-－|,，:：]+|[\s\-－|,，:：]+$/g, '').trim();
    if (!date || !merchant || !(amount > 0)) return;
    let direction = 'expense';
    if (/手續費|服務費/.test(merchant)) direction = 'fee';
    else if (/回饋|退款|退貨|折抵/.test(merchant) || (!anyPlus && sign === '-')) direction = 'refund';
    else if (/儲值/.test(merchant) && (sign === '+' || !anyPlus)) direction = 'topup';
    else if (anyPlus && sign === '+') direction = 'income';
    items.push({
      year: date[1] ? Number(date[1]) : null, month: Number(date[2]), day: Number(date[3]), merchant, amount, direction,
      counterparty: direction === 'topup' ? merchant : null, category: '', installment: null, truncated: /…|\.\.\.$/.test(merchant)
    });
  });
  const t = String(text || '');
  const l4 = t.match(/末四碼\s*[:：]?\s*(\d{4})/);
  const src = { kind: 'unknown', issuer: null, appTitle: null, last4: l4 ? l4[1] : null, evidence: '貼上的文字（手機上直接解析）' };
  if (/line\s*pay/i.test(t)) Object.assign(src, { kind: 'e_wallet', issuer: 'LINE Pay', evidence: '文字中有「LINE Pay」' });
  else if (/ipass/i.test(t)) Object.assign(src, { kind: 'e_wallet', issuer: 'iPASS MONEY', evidence: '文字中有「iPASS」' });
  return { source: src, items, meaningful };
}

function buildItems(batch) {
  const isCardAcct = isCard(batch.account);
  return (batch.raw.items || []).map(r => {
    const date = r.month && r.day ? (r.year || inferYear(r.month, r.day)) + '-' + pad(r.month) + '-' + pad(r.day) : '';
    let note = String(r.merchant || '').replace(/\s+/g, ' ').trim();
    if (r.installment) note += '（' + r.installment + '）';
    const it = { date, note, amount: Math.abs(Number(r.amount) || 0), shared: false, raw: r, truncated: !!r.truncated, yearGuessed: !r.year && !!date };
    const cats = r.direction === 'income' || r.direction === 'refund' ? INCOME_CATS : EXPENSE_CATS;
    const isIn = r.direction === 'income' || r.direction === 'refund';
    const cat = guessCategory(note, isIn ? 'income' : 'expense', cats.includes(r.category) ? r.category : '其他');
    switch (r.direction) {
      case 'topup':
        Object.assign(it, { type: 'transfer', from: bankToAccount(r.counterparty), to: batch.account, category: TRANSFER_CAT });
        break;
      case 'refund':
        Object.assign(it, { type: 'income', category: isCardAcct ? REBATE_CAT : cat });
        break;
      case 'income':
        Object.assign(it, { type: 'income', category: cat });
        break;
      default: // expense / fee / transfer_out
        Object.assign(it, { type: 'expense', category: cat });
    }
    return it;
  });
}
function refreshDups(batch) {
  batch.items.forEach(it => {
    if (it.type === 'transfer') it.to = it.to || batch.account;
    it.dup = findDup(it, batch.account);
    if (it.sel === undefined) it.sel = !it.dup;
  });
}
function resolveAccount(batch) {
  const src = batch.raw.source || {};
  const detected = issuerToAccount(src);
  const byLast4 = src.last4 ? last4Map()[src.last4] : '';
  if (batch.chosen) {
    batch.account = batch.chosen;
    const other = byLast4 || detected;
    if (other && other !== batch.chosen) batch.warn = `你選的是「${batch.chosen}」，但截圖看起來是「${other}」（${byLast4 ? '末四碼 ' + src.last4 + ' 之前對應的帳戶' : src.evidence}），請確認`;
    return;
  }
  if (byLast4) { batch.account = byLast4; batch.reason = `末四碼 ${src.last4}（之前匯入時記下的）`; return; }
  if (detected) { batch.account = detected; batch.reason = src.evidence || '截圖上的文字'; return; }
  batch.account = '';
  batch.items = buildItems(batch);
  const g = guessAccountByHistory(batch.items);
  if (g) { batch.account = g.account; batch.reason = '推測：' + g.reason; batch.guessed = true; }
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 2000, scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.85);
      const t = document.createElement('canvas');
      const ts = 160 / img.width;
      t.width = 160; t.height = Math.round(img.height * ts);
      t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
      URL.revokeObjectURL(url);
      resolve({ base64: data.split(',')[1], thumb: t.toDataURL('image/jpeg', 0.7) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片')); };
    img.src = url;
  });
}

async function handleImportText() {
  const text = IMP.text.trim();
  if (!text) { toast('請先貼上交易紀錄', true); return; }
  const batch = { id: uid(), name: '貼上的文字', status: 'loading', chosen: IMP.account, items: [] };
  IMP.batches.unshift(batch);
  renderImport();
  const local = localParse(text);
  // 大部分有數字的行都解析成功 → 直接用本機結果；否則交給 Gemini
  const goodLocal = local.items.length && local.items.length / Math.max(1, local.meaningful) >= 0.7;
  try {
    if (goodLocal) {
      batch.raw = local; batch.engine = '手機直接解析';
    } else {
      try {
        const res = await api({
          action: 'parseStatement', name: 'pasted-text', text,
          hint: { today: today(), expenseCats: uniq(EXPENSE_CATS.concat(['貸款'])), incomeCats: INCOME_CATS.concat([REBATE_CAT]) }
        });
        batch.raw = res.data; batch.engine = 'Gemini 辨識';
      } catch (err) {
        if (!local.items.length) throw err;
        batch.raw = local; batch.engine = '手機直接解析';
        batch.warn = `Gemini 無法使用（${err.message}），改用手機直接解析，只抓到 ${local.items.length} 筆，請仔細核對`;
      }
    }
    resolveAccount(batch);
    batch.items = buildItems(batch);
    refreshDups(batch);
    batch.status = 'done';
    IMP.text = '';
  } catch (err) {
    batch.status = 'error';
    batch.error = err.network ? '這段文字格式比較複雜，需要網路用 Gemini 辨識' : err.message;
  }
  renderImport();
}

async function handleImportFiles(files) {
  const chosen = IMP.account;
  const list = Array.from(files || []);
  for (const f of list) {
    const batch = { id: uid(), name: f.name, status: 'loading', chosen, items: [] };
    IMP.batches.unshift(batch);
    renderImport();
    try {
      const img = await compressImage(f);
      batch.thumb = img.thumb;
      renderImport();
      const res = await api({
        action: 'parseStatement', name: f.name, image: img.base64, mimeType: 'image/jpeg',
        hint: { today: today(), expenseCats: uniq(EXPENSE_CATS.concat(['貸款'])), incomeCats: INCOME_CATS.concat([REBATE_CAT]) }
      });
      batch.raw = res.data; batch.engine = 'Gemini 辨識';
      resolveAccount(batch);
      batch.items = buildItems(batch);
      refreshDups(batch);
      batch.status = 'done';
    } catch (err) {
      batch.status = 'error';
      batch.error = err.network ? '需要網路才能辨識截圖' : err.message;
    }
    renderImport();
  }
}

function importRow(b, it, i) {
  const k = `data-b="${b.id}" data-i="${i}"`;
  const bad = it.sel && (!it.date || !(it.amount > 0) || (it.type === 'transfer' ? !it.from || !it.to : !b.account));
  const flags = [
    !it.date ? '<span class="tag overdue">⚠ 截圖看不到日期，請補上</span>' : '',
    it.yearGuessed ? '<span class="tag muted">年份自動補</span>' : '',
    it.truncated ? '<span class="tag muted">名稱被截斷</span>' : '',
    it.dup ? `<span class="tag ${it.dup.strong ? 'overdue' : 'p2'}">可能已記過：${esc(it.dup.text)}</span>` : '',
  ].filter(Boolean);
  return `<div class="imp-row ${it.sel ? '' : 'off'} ${bad ? 'bad' : ''}">
    <div class="imp-line">
      <input type="checkbox" class="imp-f" ${k} data-f="sel" ${it.sel ? 'checked' : ''} aria-label="匯入這筆">
      <input class="imp-f imp-note" ${k} data-f="note" value="${esc(it.note)}" aria-label="內容">
      <input type="number" inputmode="decimal" class="imp-f imp-amt ${it.type}" ${k} data-f="amount" value="${it.amount}" aria-label="金額">
    </div>
    <div class="imp-line sub">
      <input type="date" class="imp-f imp-date ${it.date ? '' : 'missing'}" ${k} data-f="date" value="${esc(it.date)}" aria-label="日期">
      <select class="imp-f" ${k} data-f="type">
        <option value="expense" ${it.type === 'expense' ? 'selected' : ''}>支出</option>
        <option value="income" ${it.type === 'income' ? 'selected' : ''}>${isCard(b.account) ? '回饋/退款' : '收入'}</option>
        <option value="transfer" ${it.type === 'transfer' ? 'selected' : ''}>轉帳</option>
      </select>
    </div>
    <div class="imp-line sub">
      ${it.type === 'transfer'
      ? `<input class="imp-f" ${k} data-f="from" list="impAccts" value="${esc(it.from)}" placeholder="轉出帳戶"><span>→</span><input class="imp-f" ${k} data-f="to" list="impAccts" value="${esc(it.to)}" placeholder="轉入帳戶">`
      : `<input class="imp-f imp-cat" ${k} data-f="category" list="impCats_${it.type}" value="${esc(it.category)}">
           <label class="imp-shared"><input type="checkbox" class="imp-f" ${k} data-f="shared" ${it.shared ? 'checked' : ''}>共同</label>`}
    </div>
    ${flags.length ? `<div class="imp-flags">${flags.join(' ')}</div>` : ''}
  </div>`;
}

function importBatchCard(b) {
  if (b.status === 'loading') return `<div class="card imp-batch"><div class="imp-head">${b.thumb ? `<img src="${b.thumb}" alt="">` : ''}<div><b>${esc(b.name)}</b><div class="help">辨識中…</div></div></div></div>`;
  if (b.status === 'error') return `<div class="card imp-batch"><div class="imp-head">${b.thumb ? `<img src="${b.thumb}" alt="">` : ''}<div><b>${esc(b.name)}</b>
    <div class="alert warn" style="margin:6px 0 0">${esc(b.error)}</div></div></div><button class="btn danger" data-act="impRemove" data-b="${b.id}">移除</button></div>`;
  const src = b.raw.source || {};
  const n = b.items.filter(x => x.sel).length;
  return `<div class="card imp-batch">
    <div class="imp-head">${b.thumb ? `<img src="${b.thumb}" alt="">` : ''}
      <div style="flex:1;min-width:0">
        <b>${esc(b.name)}</b> <span class="muted">· ${b.items.length} 筆${src.last4 ? ' · 末四碼 ' + esc(src.last4) : ''}${b.engine ? ' · ' + b.engine : ''}</span>
        <div class="field" style="margin:6px 0 0"><label>帳戶${b.account ? '' : '（請選擇）'}</label>${accountSelect('', b.account, `class="imp-acct ${b.account ? '' : 'missing'}" data-b="${b.id}"`)}</div>
        ${b.reason ? `<div class="help">${b.guessed ? '🔎 ' : '✓ '}${esc(b.reason)}</div>` : ''}
        ${b.warn ? `<div class="alert warn" style="margin:6px 0 0">${esc(b.warn)}</div>` : ''}
      </div></div>
    ${b.items.map((it, i) => importRow(b, it, i)).join('')}
    <div class="imp-actions"><span class="muted">已勾選 ${n} 筆</span><button class="chip" data-act="impRemove" data-b="${b.id}">移除這張</button></div>
  </div>`;
}

VIEWS.import = function () {
  const total = IMP.batches.filter(b => b.status === 'done').reduce((s, b) => s + b.items.filter(x => x.sel).length, 0);
  return `
    <div class="toolbar"><button class="chip" data-act="impBack">‹ 返回記帳</button></div>
    <div class="card">
      <div class="seg" style="margin-bottom:12px">
        <button class="${IMP.mode === 'image' ? 'on' : ''}" data-act="impMode" data-v="image">📷 截圖</button>
        <button class="${IMP.mode === 'text' ? 'on' : ''}" data-act="impMode" data-v="text">📋 貼上文字</button>
      </div>
      <div class="field"><label>① 這是哪個帳戶的${IMP.mode === 'text' ? '紀錄' : '截圖'}？</label>${accountSelect('impAccount', IMP.account)}</div>
      ${IMP.mode === 'image' ? `
      <label class="btn" for="impFile" style="display:block;text-align:center">② 選擇截圖（可一次選多張）</label>
      <input id="impFile" type="file" accept="image/*" multiple hidden>` : `
      <div class="field"><label>② 貼上交易紀錄（從網銀、App、Excel 或帳單 Email 複製）</label>
        <textarea id="impText" class="tall" placeholder="例如：&#10;11/03 NETFLIX.COM NT$460&#10;11/05 樂購蝦皮－愛家寢飾 NT$320&#10;2026/11/15 刷卡現金回饋 -17">${esc(IMP.text)}</textarea></div>
      <button class="btn" data-act="impParseText">解析</button>`}
      <p class="help">${IMP.mode === 'text' ? '一行一筆（有日期和金額）的格式會直接在手機上解析；排版比較亂的（例如一筆分成好幾行）會交給 Gemini 讀。' : 'Gemini 會讀出每一筆的日期、商家、金額。'}匯入前你可以修改、取消勾選；已經記過的會自動標出來並預設不勾。刷卡回饋會記成這張卡的「${REBATE_CAT}」，自動從卡費扣掉；電子錢包的儲值會記成轉帳。</p>
    </div>
    <datalist id="impCats_expense">${EXPENSE_CATS.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="impCats_income">${uniq(INCOME_CATS.concat([REBATE_CAT])).map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="impAccts">${uniq(importAccountOptions().banks.concat(importAccountOptions().wallets)).map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div id="impBatches">${IMP.batches.map(importBatchCard).join('')}</div>
    ${total ? `<div class="imp-bar"><button class="btn" data-act="impCommit">匯入勾選的 ${total} 筆</button></div>` : ''}`;
};
function renderImport() { if (S.view === 'import') render(); }

function commitImport() {
  const errs = [];
  let n = 0;
  IMP.batches.filter(b => b.status === 'done').forEach(b => {
    b.items.forEach(it => {
      if (!it.sel) return;
      if (!it.date) errs.push(`「${it.note}」沒有日期`);
      else if (!(Number(it.amount) > 0)) errs.push(`「${it.note}」金額不正確`);
      else if (it.type === 'transfer' ? (!it.from || !it.to || it.from === it.to) : !b.account) errs.push(it.type === 'transfer' ? `「${it.note}」轉帳帳戶不完整` : `${b.name} 還沒選帳戶`);
    });
  });
  if (errs.length) { toast(uniq(errs)[0] + (errs.length > 1 ? `（還有 ${errs.length - 1} 個問題）` : ''), true); renderImport(); return; }
  IMP.batches.filter(b => b.status === 'done').forEach(b => {
    b.items.filter(it => it.sel).forEach(it => {
      if (it.type === 'transfer') {
        saveTransfer({ amount: Number(it.amount), from: it.from, to: it.to, date: it.date, note: it.note });
      } else {
        const base = stripShared(it.note);
        createRec('Transactions', {
          type: it.type, amount: Number(it.amount), category: String(it.category || '').trim() || '其他',
          date: it.date, account: b.account, note: it.shared ? base + SHARED_SUFFIX : base
        });
      }
      n++;
    });
    const l4 = b.raw.source && b.raw.source.last4;
    if (l4 && b.account) { const m = last4Map(); m[l4] = b.account; saveJSON('lifeos.last4', m); }
  });
  IMP.batches = IMP.batches.filter(b => b.status === 'loading');
  render();
  toast(`已匯入 ${n} 筆`);
}

Object.assign(ACTIONS, {
  openImport: () => go('import'),
  impBack: () => { S.moneyMode = 'list'; go('money'); },
  impRemove: el => { IMP.batches = IMP.batches.filter(b => b.id !== el.dataset.b); render(); },
  impCommit: () => commitImport(),
  impMode: el => { IMP.mode = el.dataset.v; render(); },
  impParseText: () => handleImportText(),
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'listAcct') { S.listAcct = el.value; render(); return; }
  if (el.id === 'impAccount') { IMP.account = el.value; localStorage.setItem('lifeos.impAccount', el.value); return; }
  if (el.id === 'impFile') { handleImportFiles(el.files); el.value = ''; return; }
  if (el.classList.contains('imp-acct')) {
    const b = IMP.batches.find(x => x.id === el.dataset.b);
    b.account = el.value; b.chosen = el.value; b.reason = ''; b.guessed = false; b.warn = '';
    b.items.forEach(it => { if (it.type === 'transfer' && !isCard(b.account)) it.to = b.account; delete it.sel; });
    refreshDups(b);
    render();
    return;
  }
  if (el.classList.contains('imp-f') && ['sel', 'type', 'shared', 'date'].includes(el.dataset.f)) {
    impField(el);
    if (el.dataset.f === 'type') {
      const it = IMP.batches.find(x => x.id === el.dataset.b).items[Number(el.dataset.i)];
      if (it.type === 'transfer') { it.category = TRANSFER_CAT; it.to = it.to || IMP.batches.find(x => x.id === el.dataset.b).account; }
      else if (it.category === TRANSFER_CAT || (it.type === 'expense' && it.category === REBATE_CAT)) it.category = '其他';
    }
    render();
  }
});
document.addEventListener('input', e => { if (e.target.id === 'impText') IMP.text = e.target.value; });
document.addEventListener('input', e => { if (e.target.classList.contains('imp-f') && !['sel', 'type', 'shared'].includes(e.target.dataset.f)) impField(e.target); });
function impField(el) {
  const b = IMP.batches.find(x => x.id === el.dataset.b);
  if (!b) return;
  const it = b.items[Number(el.dataset.i)];
  const f = el.dataset.f;
  it[f] = el.type === 'checkbox' ? el.checked : f === 'amount' ? Number(el.value) : el.value;
  if (f === 'date' || f === 'amount') { it.dup = findDup(it, b.account); it.yearGuessed = false; }
}

/* ───────── 事件綁定 ───────── */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) {
    e.preventDefault();
    ACTIONS[el.dataset.act](el);
  }
});
document.addEventListener('input', e => {
  if (e.target.classList.contains('rec-input')) {
    const cell = document.querySelector(`.rec-diff[data-acct="${CSS.escape(e.target.dataset.acct)}"]`);
    if (cell) cell.innerHTML = e.target.value === '' ? '<span class="muted">—</span>' : diffHtml(Number(e.target.value) - Number(e.target.dataset.computed));
  }
  if (e.target.id === 'noteSearch') {
    S.noteQuery = e.target.value;
    $('#notesList').innerHTML = notesList();
  }
});
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
$('#btnSettings').addEventListener('click', () => go('settings'));
$('#btnSync').addEventListener('click', () => syncAll());
$('#modalClose').addEventListener('click', closeForm);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeForm(); });
$('#modalForm').addEventListener('submit', e => { e.preventDefault(); submitForm(); });
// 有建議清單的欄位：點進去時先暫時清空，才會列出完整清單；沒選就離開則還原原本的值
$('#modalForm').addEventListener('focusin', e => {
  const el = e.target;
  if (!el.matches('input[list]') || !el.value) return;
  el.dataset.prev = el.value;
  el.placeholder = el.value;
  el.value = '';
});
$('#modalForm').addEventListener('focusout', e => {
  const el = e.target;
  if (!el.matches('input[list]') || el.dataset.prev === undefined) return;
  if (!el.value) el.value = el.dataset.prev;
  delete el.dataset.prev;
});
$('#modalForm').addEventListener('change', e => { if (['allDay', 'repeat', 'kind'].includes(e.target.name)) rerenderForm(); });
$('#fab').addEventListener('click', () => {
  ({
    today: () => txForm(), money: () => S.moneyMode === 'bills' ? billForm() : txForm(), tasks: () => taskForm(),
    calendar: () => eventForm(null, S.calSel), routines: () => routineForm(),
    notes: () => S.notesMode === 'diary' ? openDiary(today()) : noteForm(null, 'note'),
  })[S.view]();
});

/* ───────── 啟動 ───────── */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
if (!S.cfg.url || !S.cfg.token) {
  go('settings');
  toast('第一次使用，請先填入連線設定');
} else {
  render();
  syncAll(true);
}
// 回到 App、恢復網路時自動同步；有待上傳的資料時每 30 秒重試
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.cfg.url && !S.busy) syncAll(true);
});
window.addEventListener('online', () => { S.offline = false; syncAll(true); });
window.addEventListener('offline', () => { S.offline = true; updateStatus(); });
setInterval(() => { if (S.queue.length && !S.flushing) flush(); }, 30000);