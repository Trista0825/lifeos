/* LifeOS 前端 — 原生 JavaScript，不需要編譯 */
'use strict';

const APP_VERSION = '2.0.0';
const ENTITIES = ['Transactions', 'Tasks', 'Events', 'Routines', 'RoutineLogs', 'Notes'];

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

// 「共同」：勾選時在備註後面加上這段文字（沿用原本記帳程序的規則）
const SHARED_SUFFIX = '(共同)';
const SHARED_RE = /[(（]共同[)）]\s*$/;

const REPEAT_OPTS = [['', '不重複'], ['daily', '每天'], ['weekly', '每週'], ['monthly', '每月'], ['yearly', '每年']];
const REPEAT_LABEL = Object.fromEntries(REPEAT_OPTS);
const MOODS = [['', '—'], ['😄', '😄 很好'], ['🙂', '🙂 不錯'], ['😐', '😐 普通'], ['😔', '😔 低落'], ['😫', '😫 很累']];
const DOW = ['日', '一', '二', '三', '四', '五', '六'];
const TITLES = { today: '今天', money: '記帳', tasks: '待辦', calendar: '行事曆', routines: '習慣', notes: '筆記', settings: '設定' };

/* ───────── 狀態 ───────── */
const S = {
  cfg: loadJSON('lifeos.cfg', { url: '', token: '' }),
  data: Object.assign(Object.fromEntries(ENTITIES.map(e => [e, []])), loadJSON('lifeos.data', {})),
  queue: loadJSON('lifeos.queue', []), // 尚未上傳的修改（離線時累積）
  lastSync: localStorage.getItem('lifeos.lastSync') || '',
  view: 'today',
  moneyMode: 'dash',
  moneyMonth: ymd(new Date()).slice(0, 7),
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
function txItem(t) {
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
      <div class="card"><h3>本月收支 <a data-act="goMoney">總覽 ›</a></h3>
        <div class="stats">
          <div class="stat" style="padding:0"><div class="label">今日支出</div><div class="value expense">${money(todayExp)}</div></div>
          <div class="stat" style="padding:0"><div class="label">本月支出</div><div class="value expense">${money(monthExp)}</div></div>
          <div class="stat" style="padding:0"><div class="label">本月收入</div><div class="value income">${money(monthInc)}</div></div>
        </div></div>`;
  },

  money() {
    const dash = S.moneyMode === 'dash';
    return `
      <div class="toolbar">
        <div class="seg">
          <button class="${dash ? 'on' : ''}" data-act="moneyMode" data-v="dash">總覽</button>
          <button class="${dash ? '' : 'on'}" data-act="moneyMode" data-v="list">明細</button>
        </div>
        ${monthNav('moneyMonth', S.moneyMonth)}
      </div>
      ${dash ? moneyDashboard() : moneyList()}`;
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
      const dots = '<i></i>'.repeat(Math.min(ev, 3)) + (tk ? '<i class="t"></i>' : '');
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
      ${dueTasks.length ? `<div class="card"><h3>當天到期的待辦</h3>${list(dueTasks.map(taskItem), '')}</div>` : ''}`;
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

function moneyList() {
  const tx = monthTx(S.moneyMonth)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  if (!tx.length) return '<div class="card"><div class="empty">這個月還沒有記帳，按右下角 ＋ 開始記一筆</div></div>';
  const groups = {};
  tx.forEach(x => (groups[x.date] = groups[x.date] || []).push(x));
  return Object.entries(groups).map(([d, arr]) => {
    const out = sum(arr.filter(x => x.type === 'expense' && counted(x)));
    return `<div class="group-head"><span>${dateLabel(d)}</span><span>${out ? '支出 ' + money(out) : ''}</span></div>
      <div class="card tight">${list(arr.map(txItem), '')}</div>`;
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
  $('#fab').classList.toggle('hidden', v === 'settings');
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
      <button type="submit" class="btn">儲存</button>
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
    case 'txType':
      return `<div class="field"><div class="type-toggle">
        <button type="button" class="expense ${v === 'expense' ? 'on' : ''}" data-act="pickType" data-v="expense">支出</button>
        <button type="button" class="income ${v === 'income' ? 'on' : ''}" data-act="pickType" data-v="income">收入</button>
      </div></div>`;
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
function rerenderForm() {
  readForm();
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

function txForm(rec) {
  openForm({
    title: rec ? '編輯記帳' : '記一筆',
    values: rec
      ? Object.assign({}, rec, { shared: isShared(rec), note: stripShared(rec.note) })
      : { type: 'expense', shared: false, date: S.view === 'money' && S.moneyMonth !== today().slice(0, 7) ? S.moneyMonth + '-01' : today(), account: lastAccount('expense') },
    fields: [
      { name: 'type', type: 'txType' },
      { name: 'amount', label: '金額', type: 'number', placeholder: '0' },
      { name: 'category', label: '類別', placeholder: '點一下可從清單選，或直接輸入', suggest: v => uniq((v.type === 'income' ? INCOME_CATS : EXPENSE_CATS).concat(S.data.Transactions.filter(t => t.type === v.type).map(t => t.category))) },
      { type: 'row', fields: [
        { name: 'date', label: '日期', type: 'date' },
        { name: 'account', label: v => v.type === 'income' ? '入帳銀行' : '支付方式', suggest: v => uniq((v.type === 'income' ? BANKS : PAY_METHODS).concat(S.data.Transactions.filter(t => t.type === v.type).map(t => t.account))) },
      ] },
      { name: 'note', label: '內容／備註' },
      { name: 'shared', label: '共同（儲存時在內容後加上「(共同)」）', type: 'checkbox' },
    ],
    onSave: v => {
      if (!(Number(v.amount) > 0)) throw new Error('請輸入金額');
      if (!v.date) throw new Error('請選擇日期');
      const base = stripShared(v.note);
      const note = v.shared ? (base ? base + SHARED_SUFFIX : SHARED_SUFFIX) : base;
      const data = { type: v.type, amount: Number(v.amount), category: (v.category || '').trim() || '其他', date: v.date, account: (v.account || '').trim(), note };
      rec ? updateRec('Transactions', rec.id, data) : createRec('Transactions', data);
    },
    onDelete: rec && (() => removeRec('Transactions', rec.id)),
  });
}

function taskForm(rec, presetDue) {
  openForm({
    title: rec ? '編輯待辦' : '新增待辦',
    values: rec ? Object.assign({}, rec) : { priority: 1, due: presetDue || '', repeat: '' },
    fields: [
      { name: 'title', label: '要做什麼', placeholder: '例如：繳電話費' },
      { type: 'row', fields: [
        { name: 'due', label: '期限', type: 'date' },
        { name: 'priority', label: '優先度', type: 'select', options: [[1, '一般'], [2, '中'], [3, '高']] },
      ] },
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
      { type: 'row', hidden: v => v.allDay, fields: [
        { name: 'start', label: '開始', type: 'time' },
        { name: 'end', label: '結束', type: 'time' },
      ] },
      { type: 'row', fields: [
        { name: 'repeat', label: '重複', type: 'select', options: REPEAT_OPTS },
        { name: 'repeatUntil', label: '重複到（可留空）', type: 'date', hidden: v => !v.repeat },
      ] },
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
      { type: 'row', fields: [
        { name: 'date', label: '日期', type: 'date' },
        { name: 'mood', label: '心情', type: 'select', options: MOODS },
      ] },
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
      v.account = lastAccount(v.type);
    }
    rerenderForm();
  },
  pickDay: el => {
    readForm();
    const d = el.dataset.v;
    let days = String(formState.values.days || '');
    days = days.includes(d) ? days.replace(d, '') : days + d;
    formState.values.days = days.split('').sort().join('');
    rerenderForm();
  },
  formDelete: () => {
    if (!confirm('確定要刪除嗎？')) return;
    formState.opts.onDelete();
    closeForm();
    render();
    toast('已刪除');
  },
};

/* ───────── 事件綁定 ───────── */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) {
    e.preventDefault();
    ACTIONS[el.dataset.act](el);
  }
});
document.addEventListener('input', e => {
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
$('#modalForm').addEventListener('change', e => { if (['allDay', 'repeat'].includes(e.target.name)) rerenderForm(); });
$('#fab').addEventListener('click', () => {
  ({
    today: () => txForm(), money: () => txForm(), tasks: () => taskForm(),
    calendar: () => eventForm(null, S.calSel), routines: () => routineForm(),
    notes: () => S.notesMode === 'diary' ? openDiary(today()) : noteForm(null, 'note'),
  })[S.view]();
});

/* ───────── 啟動 ───────── */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
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
