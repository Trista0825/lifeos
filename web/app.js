/* LifeOS 前端 — 原生 JavaScript，不需要編譯 */
'use strict';

const APP_VERSION = '1.0.0';
const ENTITIES = ['Transactions', 'Tasks', 'Events', 'Routines', 'RoutineLogs'];
const EXPENSE_CATS = ['餐飲', '交通', '購物', '居家', '娛樂', '醫療', '學習', '其他'];
const INCOME_CATS = ['薪資', '獎金', '投資', '其他收入'];
const ACCOUNTS = ['現金', '信用卡', '銀行', '電子支付'];
const DOW = ['日', '一', '二', '三', '四', '五', '六'];
const TITLES = { today: '今天', money: '記帳', tasks: '待辦', calendar: '行事曆', routines: '習慣', settings: '設定' };

/* ───────── 狀態 ───────── */
const S = {
  cfg: loadJSON('lifeos.cfg', { url: '', token: '' }),
  data: loadJSON('lifeos.data', Object.fromEntries(ENTITIES.map(e => [e, []]))),
  lastSync: localStorage.getItem('lifeos.lastSync') || '',
  view: 'today',
  moneyMonth: ymd(new Date()).slice(0, 7),
  calMonth: ymd(new Date()).slice(0, 7),
  calSel: ymd(new Date()),
  taskFilter: 'open',
  busy: 0,
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
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('zh-TW'); }
function dateLabel(s) {
  if (!s) return '';
  const t = today();
  if (s === t) return '今天';
  if (s === addDays(t, 1)) return '明天';
  if (s === addDays(t, -1)) return '昨天';
  const d = parseYmd(s);
  return (d.getMonth() + 1) + '/' + d.getDate() + '（' + DOW[d.getDay()] + '）';
}
function $(sel) { return document.querySelector(sel); }

function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), isErr ? 4000 : 1800);
}

function setBusy(delta) {
  S.busy = Math.max(0, S.busy + delta);
  $('#syncState').textContent = S.busy ? '同步中…' : (S.lastSync ? '已同步 ' + S.lastSync.slice(11, 16) : '');
}

/* ───────── API ───────── */
async function api(payload) {
  if (!S.cfg.url || !S.cfg.token) throw new Error('請先到「設定」填入 API 網址與 Token');
  setBusy(1);
  try {
    // 不加自訂 header（Content-Type 會是 text/plain），避免 CORS 預檢，Apps Script 才收得到
    const res = await fetch(S.cfg.url, {
      method: 'POST',
      body: JSON.stringify(Object.assign({ token: S.cfg.token }, payload)),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '伺服器錯誤');
    return json;
  } finally {
    setBusy(-1);
  }
}

async function syncAll(silent) {
  try {
    const res = await api({ action: 'batch', requests: ENTITIES.map(e => ({ action: 'list', entity: e })) });
    res.results.forEach((r, i) => {
      if (!r.ok) throw new Error(r.error);
      S.data[ENTITIES[i]] = r.data;
    });
    saveJSON('lifeos.data', S.data);
    const now = new Date();
    S.lastSync = ymd(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    localStorage.setItem('lifeos.lastSync', S.lastSync);
    setBusy(0);
    render();
    if (!silent) toast('同步完成');
  } catch (err) {
    toast(err.message, true);
  }
}

async function createRec(entity, data) {
  const res = await api({ action: 'create', entity, data });
  S.data[entity].push(res.data);
  persist();
  return res.data;
}
async function updateRec(entity, id, data) {
  const res = await api({ action: 'update', entity, id, data });
  const arr = S.data[entity];
  const i = arr.findIndex(r => r.id === id);
  if (i >= 0) arr[i] = res.data;
  persist();
  return res.data;
}
async function removeRec(entity, id) {
  await api({ action: 'remove', entity, id });
  S.data[entity] = S.data[entity].filter(r => r.id !== id);
  if (entity === 'Routines') S.data.RoutineLogs = S.data.RoutineLogs.filter(l => l.routineId !== id);
  persist();
}
function persist() { saveJSON('lifeos.data', S.data); }

/* ───────── 查詢輔助 ───────── */
function isDoneOn(routineId, date) {
  return S.data.RoutineLogs.some(l => l.routineId === routineId && l.date === date);
}
function scheduledOn(routine, date) {
  const days = String(routine.days || '0123456');
  return days.indexOf(String(parseYmd(date).getDay())) >= 0;
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
  return S.data.Events.filter(e => e.date === date)
    .sort((a, b) => (a.allDay ? '' : (a.start || '99')).localeCompare(b.allDay ? '' : (b.start || '99')));
}
function sortTasks(arr) {
  return arr.slice().sort((a, b) => {
    const da = a.due || '9999', db = b.due || '9999';
    if (da !== db) return da.localeCompare(db);
    return (Number(b.priority) || 0) - (Number(a.priority) || 0);
  });
}

/* ───────── 畫面元件 ───────── */
function taskItem(t) {
  const overdue = !t.done && t.due && t.due < today();
  const p = Number(t.priority) || 0;
  const tags = [
    t.due ? `<span class="tag ${overdue ? 'overdue' : ''}">${overdue ? '逾期 ' : ''}${esc(dateLabel(t.due))}</span>` : '',
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
  return `<li class="item">
    <div class="time-col">${time}</div>
    <div class="main" data-act="editEvent" data-id="${e.id}">
      <div class="title">${esc(e.title)}</div>
      ${e.location || e.note ? `<div class="sub">${esc([e.location, e.note].filter(Boolean).join(' · '))}</div>` : ''}
    </div></li>`;
}
function txItem(t) {
  const cls = t.type === 'income' ? 'income' : 'expense';
  return `<li class="item">
    <div class="main" data-act="editTx" data-id="${t.id}">
      <div class="title">${esc(t.category || (t.type === 'income' ? '收入' : '支出'))}</div>
      <div class="sub">${esc([t.account, t.note].filter(Boolean).join(' · '))}</div>
    </div>
    <div class="amount ${cls}">${t.type === 'income' ? '+' : '-'}${money(t.amount)}</div></li>`;
}
function routineItem(r, date) {
  const done = isDoneOn(r.id, date);
  return `<li class="item ${done ? 'done' : ''}">
    <button class="check ${done ? 'on' : ''}" data-act="toggleRoutine" data-id="${r.id}" data-date="${date}" aria-label="打卡">${done ? '✓' : ''}</button>
    <div class="main" data-act="editRoutine" data-id="${r.id}"><div class="title">${esc(r.name)}</div></div>
    <span class="streak">${streakOf(r) ? '🔥 ' + streakOf(r) : ''}</span></li>`;
}
function list(items, emptyText) {
  return items.length ? `<ul class="list">${items.join('')}</ul>` : `<div class="empty">${emptyText}</div>`;
}

/* ───────── 各頁面 ───────── */
const VIEWS = {
  today() {
    const t = today();
    const d = new Date();
    const month = t.slice(0, 7);
    const tx = S.data.Transactions;
    const todayExp = tx.filter(x => x.date === t && x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
    const monthExp = tx.filter(x => x.date.slice(0, 7) === month && x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
    const monthInc = tx.filter(x => x.date.slice(0, 7) === month && x.type === 'income').reduce((s, x) => s + Number(x.amount), 0);
    const tasks = sortTasks(S.data.Tasks.filter(x => !x.done && (!x.due || x.due <= t)));
    const routines = activeRoutines().filter(r => scheduledOn(r, t));
    const doneCount = routines.filter(r => isDoneOn(r.id, t)).length;

    return `
      <p class="date-hero">${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${DOW[d.getDay()]}</p>
      <div class="quick">
        <button data-act="newTx"><span>💰</span>記一筆</button>
        <button data-act="newTask"><span>✅</span>待辦</button>
        <button data-act="newEvent"><span>📅</span>行程</button>
        <button data-act="newRoutine"><span>🔁</span>習慣</button>
      </div>
      <div class="card"><h3>今日行程 <a data-act="go" data-view="calendar">行事曆 ›</a></h3>
        ${list(eventsOn(t).map(eventItem), '今天沒有行程')}</div>
      <div class="card"><h3>例行公事 ${routines.length ? `<span>${doneCount} / ${routines.length}</span>` : ''}</h3>
        ${list(routines.map(r => routineItem(r, t)), '今天沒有排定的例行公事')}</div>
      <div class="card"><h3>待辦（今天與逾期）<a data-act="go" data-view="tasks">全部 ›</a></h3>
        ${list(tasks.slice(0, 8).map(taskItem), '都完成了 🎉')}</div>
      <div class="card"><h3>本月收支 <a data-act="go" data-view="money">明細 ›</a></h3>
        <div class="stats">
          <div class="stat" style="padding:0"><div class="label">今日支出</div><div class="value expense">${money(todayExp)}</div></div>
          <div class="stat" style="padding:0"><div class="label">本月支出</div><div class="value expense">${money(monthExp)}</div></div>
          <div class="stat" style="padding:0"><div class="label">本月收入</div><div class="value income">${money(monthInc)}</div></div>
        </div></div>`;
  },

  money() {
    const m = S.moneyMonth;
    const tx = S.data.Transactions.filter(x => x.date.slice(0, 7) === m)
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const inc = tx.filter(x => x.type === 'income').reduce((s, x) => s + Number(x.amount), 0);
    const exp = tx.filter(x => x.type === 'expense').reduce((s, x) => s + Number(x.amount), 0);
    const byCat = {};
    tx.filter(x => x.type === 'expense').forEach(x => { const c = x.category || '其他'; byCat[c] = (byCat[c] || 0) + Number(x.amount); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = cats.length ? cats[0][1] : 1;
    const groups = {};
    tx.forEach(x => (groups[x.date] = groups[x.date] || []).push(x));
    const [y, mo] = m.split('-');

    return `
      <div class="toolbar"><div class="month-nav">
        <button data-act="moneyMonth" data-n="-1">‹</button><span>${y} 年 ${Number(mo)} 月</span><button data-act="moneyMonth" data-n="1">›</button>
      </div></div>
      <div class="stats" style="margin-bottom:12px">
        <div class="stat"><div class="label">收入</div><div class="value income">${money(inc)}</div></div>
        <div class="stat"><div class="label">支出</div><div class="value expense">${money(exp)}</div></div>
        <div class="stat"><div class="label">結餘</div><div class="value">${money(inc - exp)}</div></div>
      </div>
      ${cats.length ? `<div class="card"><h3>支出分類</h3>${cats.map(([c, v]) => `
        <div class="bar-row"><span>${esc(c)}</span><div class="bar"><i style="width:${Math.max(3, v / max * 100)}%"></i></div>
        <span class="num">${money(v)} · ${Math.round(v / exp * 100)}%</span></div>`).join('')}</div>` : ''}
      ${Object.keys(groups).length ? Object.entries(groups).map(([d, arr]) => {
        const net = arr.reduce((s, x) => s + (x.type === 'income' ? 1 : -1) * Number(x.amount), 0);
        return `<div class="group-head"><span>${dateLabel(d)}</span><span>${net >= 0 ? '+' : '-'}${money(Math.abs(net))}</span></div>
          <div class="card" style="padding-top:4px;padding-bottom:4px">${list(arr.map(txItem), '')}</div>`;
      }).join('') : '<div class="card"><div class="empty">這個月還沒有記帳，按右下角 ＋ 開始記一筆</div></div>'}`;
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
            <div class="card" style="padding-top:4px;padding-bottom:4px">${list(items.map(taskItem), '')}</div>`).join('')
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
      const ev = S.data.Events.filter(e => e.date === d).length;
      const tk = S.data.Tasks.filter(x => !x.done && x.due === d).length;
      const dots = '<i></i>'.repeat(Math.min(ev, 3)) + (tk ? '<i class="t"></i>' : '');
      cells.push(`<button class="day ${inMonth ? '' : 'other'} ${d === t ? 'today' : ''} ${d === S.calSel ? 'sel' : ''}" data-act="calSel" data-d="${d}">
        ${parseYmd(d).getDate()}<span class="dots">${dots}</span></button>`);
    }
    const sel = S.calSel;
    const dueTasks = sortTasks(S.data.Tasks.filter(x => x.due === sel));
    return `
      <div class="toolbar"><div class="month-nav">
        <button data-act="calMonth" data-n="-1">‹</button><span>${y} 年 ${m} 月</span><button data-act="calMonth" data-n="1">›</button>
      </div><button class="seg" style="border:none;padding:6px 12px" data-act="calToday">今天</button></div>
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
      return `<li class="item ${done ? 'done' : ''}">
        <button class="check ${done ? 'on' : ''}" data-act="toggleRoutine" data-id="${r.id}" data-date="${t}" aria-label="打卡" ${sched ? '' : 'style="opacity:.35"'}>${done ? '✓' : ''}</button>
        <div class="main" data-act="editRoutine" data-id="${r.id}">
          <div class="title">${esc(r.name)}</div>
          <div class="sub">${freq}${sched ? '' : '（今天休息）'}</div>
          <div class="week">${week}</div>
        </div>
        <span class="streak">${streakOf(r) ? '🔥 ' + streakOf(r) + ' 天' : ''}</span></li>`;
    };
    return `
      <div class="card"><h3>例行公事 <span>近 7 天</span></h3>${list(all.map(card), '還沒有例行公事，按右下角 ＋ 新增，例如：喝水 2000ml、運動 30 分鐘、睡前閱讀')}</div>
      ${paused.length ? `<div class="card"><h3>已暫停</h3>${list(paused.map(r => `<li class="item"><div class="main" data-act="editRoutine" data-id="${r.id}"><div class="title">${esc(r.name)}</div></div></li>`), '')}</div>` : ''}`;
  },

  settings() {
    return `<div class="settings">
      <div class="card"><h3>連線設定</h3>
        <div class="field"><label>Apps Script 網址（結尾是 /exec）</label><input id="cfgUrl" value="${esc(S.cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
        <div class="field"><label>API Token</label><input id="cfgToken" value="${esc(S.cfg.token)}" placeholder="執行 setup() 後在執行紀錄中取得"></div>
        <div class="form-actions"><button class="btn" data-act="saveCfg">儲存並測試連線</button></div>
      </div>
      <div class="card"><h3>資料</h3>
        <p class="help">資料都存在你自己的 Google 試算表裡，這台裝置只保留一份快取，離線時也能查看。<br>
        最後同步：${esc(S.lastSync || '尚未同步')}</p>
        <div class="form-actions">
          <button class="btn secondary" data-act="sync">立即同步</button>
          <button class="btn danger" data-act="clearCache">清除這台裝置的快取</button>
        </div>
      </div>
      <p class="help" style="text-align:center">LifeOS v${APP_VERSION}</p>
    </div>`;
  },
};

function render() {
  const v = S.view;
  $('#pageTitle').textContent = TITLES[v];
  $('#view').innerHTML = VIEWS[v]();
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#fab').classList.toggle('hidden', v === 'settings');
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
    <div class="form-actions">
      <button type="submit" class="btn">儲存</button>
      ${opts.onDelete ? '<button type="button" class="btn danger" data-act="formDelete">刪除</button>' : ''}
    </div>`;
  $('#modal').classList.remove('hidden');
  const firstInput = f.querySelector('input[type=text], input[type=number]');
  if (firstInput && opts.autofocus !== false) setTimeout(() => firstInput.focus(), 50);
}

function fieldHtml(fd) {
  const v = formState.values[fd.name];
  const id = 'f_' + fd.name;
  if (fd.hidden && fd.hidden(formState.values)) return '';
  switch (fd.type) {
    case 'row':
      return `<div class="row2">${fd.fields.map(fieldHtml).join('')}</div>`;
    case 'txType':
      return `<div class="field"><div class="type-toggle">
        <button type="button" class="expense ${v === 'expense' ? 'on' : ''}" data-act="pickType" data-v="expense">支出</button>
        <button type="button" class="income ${v === 'income' ? 'on' : ''}" data-act="pickType" data-v="income">收入</button>
      </div></div>`;
    case 'textarea':
      return `<div class="field"><label for="${id}">${fd.label}</label><textarea id="${id}" name="${fd.name}">${esc(v)}</textarea></div>`;
    case 'select':
      return `<div class="field"><label for="${id}">${fd.label}</label><select id="${id}" name="${fd.name}">
        ${fd.options.map(o => `<option value="${esc(o[0])}" ${String(v) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
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
  const f = $('#modalForm');
  const vals = formState.values;
  f.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.name) return;
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

async function submitForm() {
  const vals = readForm();
  const btn = $('#modalForm button[type=submit]');
  btn.disabled = true;
  btn.textContent = '儲存中…';
  try {
    await formState.opts.onSave(vals);
    closeForm();
    render();
    toast('已儲存');
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
    btn.textContent = '儲存';
  }
}

/* ───────── 各類表單 ───────── */
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

function txForm(rec) {
  openForm({
    title: rec ? '編輯記帳' : '記一筆',
    values: rec ? Object.assign({}, rec) : { type: 'expense', date: S.view === 'money' && S.moneyMonth !== today().slice(0, 7) ? S.moneyMonth + '-01' : today(), account: '現金' },
    fields: [
      { name: 'type', type: 'txType' },
      { name: 'amount', label: '金額', type: 'number', placeholder: '0' },
      { name: 'category', label: '分類', suggest: v => uniq((v.type === 'income' ? INCOME_CATS : EXPENSE_CATS).concat(S.data.Transactions.filter(t => t.type === v.type).map(t => t.category))) },
      { type: 'row', fields: [
        { name: 'date', label: '日期', type: 'date' },
        { name: 'account', label: '帳戶', suggest: () => uniq(ACCOUNTS.concat(S.data.Transactions.map(t => t.account))) },
      ] },
      { name: 'note', label: '備註' },
    ],
    onSave: async v => {
      if (!(Number(v.amount) > 0)) throw new Error('請輸入金額');
      if (!v.date) throw new Error('請選擇日期');
      const data = { type: v.type, amount: Number(v.amount), category: v.category || '其他', date: v.date, account: v.account, note: v.note };
      rec ? await updateRec('Transactions', rec.id, data) : await createRec('Transactions', data);
    },
    onDelete: rec && (() => removeRec('Transactions', rec.id)),
  });
}

function taskForm(rec, presetDue) {
  openForm({
    title: rec ? '編輯待辦' : '新增待辦',
    values: rec ? Object.assign({}, rec) : { priority: 1, due: presetDue || '' },
    fields: [
      { name: 'title', label: '要做什麼', placeholder: '例如：繳電話費' },
      { type: 'row', fields: [
        { name: 'due', label: '期限', type: 'date' },
        { name: 'priority', label: '優先度', type: 'select', options: [[1, '一般'], [2, '中'], [3, '高']] },
      ] },
      { name: 'note', label: '備註', type: 'textarea' },
      { name: 'done', label: '已完成', type: 'checkbox', hidden: () => !rec },
    ],
    onSave: async v => {
      if (!v.title.trim()) throw new Error('請輸入待辦內容');
      const data = { title: v.title.trim(), due: v.due, priority: Number(v.priority), note: v.note };
      if (rec) data.done = !!v.done;
      rec ? await updateRec('Tasks', rec.id, data) : await createRec('Tasks', data);
    },
    onDelete: rec && (() => removeRec('Tasks', rec.id)),
  });
}

function eventForm(rec, presetDate) {
  openForm({
    title: rec ? '編輯行程' : '新增行程',
    values: rec ? Object.assign({}, rec) : { date: presetDate || today(), start: '09:00', end: '10:00', allDay: false },
    fields: [
      { name: 'title', label: '標題', placeholder: '例如：牙醫回診' },
      { name: 'date', label: '日期', type: 'date' },
      { name: 'allDay', label: '全天', type: 'checkbox' },
      { type: 'row', hidden: v => v.allDay, fields: [
        { name: 'start', label: '開始', type: 'time' },
        { name: 'end', label: '結束', type: 'time' },
      ] },
      { name: 'location', label: '地點' },
      { name: 'note', label: '備註', type: 'textarea' },
    ],
    onSave: async v => {
      if (!v.title.trim()) throw new Error('請輸入標題');
      if (!v.date) throw new Error('請選擇日期');
      if (!v.allDay && v.start && v.end && v.end < v.start) throw new Error('結束時間早於開始時間');
      const data = { title: v.title.trim(), date: v.date, allDay: !!v.allDay, start: v.allDay ? '' : v.start, end: v.allDay ? '' : v.end, location: v.location, note: v.note };
      rec ? await updateRec('Events', rec.id, data) : await createRec('Events', data);
      S.calSel = v.date;
      S.calMonth = v.date.slice(0, 7);
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
    onSave: async v => {
      if (!v.name.trim()) throw new Error('請輸入名稱');
      if (!v.days) throw new Error('至少選一天');
      const data = { name: v.name.trim(), days: String(v.days).split('').sort().join(''), active: !v.paused };
      if (!rec) data.sort = S.data.Routines.length;
      rec ? await updateRec('Routines', rec.id, data) : await createRec('Routines', data);
    },
    onDelete: rec && (() => removeRec('Routines', rec.id)),
  });
}

/* ───────── 動作 ───────── */
const find = (entity, id) => S.data[entity].find(r => r.id === id);

const ACTIONS = {
  go: el => go(el.dataset.view),
  newTx: () => txForm(),
  newTask: () => taskForm(),
  newEvent: () => eventForm(),
  newRoutine: () => routineForm(),
  editTx: el => txForm(find('Transactions', el.dataset.id)),
  editTask: el => taskForm(find('Tasks', el.dataset.id)),
  editEvent: el => eventForm(find('Events', el.dataset.id)),
  editRoutine: el => routineForm(find('Routines', el.dataset.id)),
  moneyMonth: el => { S.moneyMonth = addMonths(S.moneyMonth, Number(el.dataset.n)); render(); },
  calMonth: el => { S.calMonth = addMonths(S.calMonth, Number(el.dataset.n)); render(); },
  calSel: el => { S.calSel = el.dataset.d; S.calMonth = el.dataset.d.slice(0, 7); render(); },
  calToday: () => { S.calSel = today(); S.calMonth = today().slice(0, 7); render(); },
  taskFilter: el => { S.taskFilter = el.dataset.v; render(); },
  sync: () => syncAll(),
  clearCache: () => {
    if (!confirm('清除這台裝置的快取？（試算表裡的資料不會受影響）')) return;
    S.data = Object.fromEntries(ENTITIES.map(e => [e, []]));
    localStorage.removeItem('lifeos.data');
    render();
    toast('已清除');
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
  toggleTask: async el => {
    const t = find('Tasks', el.dataset.id);
    const prev = t.done;
    t.done = !prev; // 先更新畫面，失敗再還原
    render();
    try { await updateRec('Tasks', t.id, { done: !prev }); render(); } catch (err) { t.done = prev; render(); toast(err.message, true); }
  },
  toggleRoutine: async el => {
    const id = el.dataset.id, date = el.dataset.date;
    const before = S.data.RoutineLogs.slice();
    const was = isDoneOn(id, date);
    if (was) S.data.RoutineLogs = S.data.RoutineLogs.filter(l => !(l.routineId === id && l.date === date));
    else S.data.RoutineLogs.push({ id: 'tmp', routineId: id, date });
    render();
    try {
      const r = await api({ action: 'toggleRoutine', routineId: id, date });
      S.data.RoutineLogs = S.data.RoutineLogs.filter(l => !(l.routineId === id && l.date === date));
      if (r.data.done) S.data.RoutineLogs.push(r.data.log);
      persist();
      render();
    } catch (err) {
      S.data.RoutineLogs = before;
      render();
      toast(err.message, true);
    }
  },
  // 表單內
  pickType: el => { readForm(); formState.values.type = el.dataset.v; rerenderForm(); },
  pickDay: el => {
    readForm();
    const d = el.dataset.v;
    let days = String(formState.values.days || '');
    days = days.includes(d) ? days.replace(d, '') : days + d;
    formState.values.days = days.split('').sort().join('');
    rerenderForm();
  },
  formDelete: async () => {
    if (!confirm('確定要刪除嗎？')) return;
    try { await formState.opts.onDelete(); closeForm(); render(); toast('已刪除'); } catch (err) { toast(err.message, true); }
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
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
$('#btnSettings').addEventListener('click', () => go('settings'));
$('#btnSync').addEventListener('click', () => syncAll());
$('#modalClose').addEventListener('click', closeForm);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeForm(); });
$('#modalForm').addEventListener('submit', e => { e.preventDefault(); submitForm(); });
$('#modalForm').addEventListener('change', e => { if (e.target.name === 'allDay') rerenderForm(); });
$('#fab').addEventListener('click', () => {
  ({ today: txForm, money: txForm, tasks: () => taskForm(), calendar: () => eventForm(null, S.calSel), routines: () => routineForm() })[S.view]();
});

/* ───────── 啟動 ───────── */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (!S.cfg.url || !S.cfg.token) {
  go('settings');
  toast('第一次使用，請先填入連線設定');
} else {
  render();
  syncAll(true);
}
// 回到 App 時自動同步（例如在電腦上改過資料）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.cfg.url && !S.busy) syncAll(true);
});
