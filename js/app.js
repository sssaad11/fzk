// نقطة الدخول: التحميل، الموجّه (Router)، الفلترة، وربط الخط الزمني بالبطاقة والغرفة
import { openDB } from './db.js';
import { Cosmos } from './timeline.js';
import { renderCard, closeCard } from './card.js';

const $ = (s) => document.querySelector(s);
const state = { db: null, cosmos: null, room: null, chapter: null, lesson: null };

async function boot() {
  try {
    await document.fonts.load('600 16px "Plex Arabic"');
    await document.fonts.load('700 20px "Amiri"');
  } catch {}
  state.db = await openDB();
  buildFilters();
  state.cosmos = new Cosmos($('#cosmos'), state.db.chapters, {
    onChapter: (id, code) => selectChapter(id, { fly: false, lesson: code }),
    onLesson: (code) => go(`#/lesson/${code}`),
  });
  state.cosmos.start();
  $('#zoomIn').onclick = () => state.cosmos.zoomAt(innerWidth / 2, innerHeight / 2, 1.5);
  $('#zoomOut').onclick = () => state.cosmos.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.5);
  $('#zoomHome').onclick = () => { selectChapter(null); state.cosmos.home(); };
  addEventListener('hashchange', route);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#cardLayer').hidden) go('#/'); });
  await route();
  $('#loader').classList.add('done');
  setTimeout(() => ($('#tlHint').style.opacity = 0), 7000);
  window.__museum = state; window.__museumReady = true;
}

/* ─── الفلترة ─── */
function buildFilters() {
  const row = $('#chapterChips');
  const all = chip('الكل', null, '#ffffff');
  all.setAttribute('aria-pressed', 'true');
  row.appendChild(all);
  for (const c of state.db.chapters) row.appendChild(chip(c.title, c.id, c.color, c.id));
}

function chip(label, id, color, num) {
  const b = document.createElement('button');
  b.className = 'chip'; b.style.setProperty('--c', color); b.dataset.chapter = id ?? '';
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<span class="dot"></span>${num ? `<span class="num">${num}</span>` : ''}<span>${label}</span>`;
  b.onclick = () => {
    if (id === null) { selectChapter(null); state.cosmos.home(); }
    else selectChapter(id, { fly: true });
  };
  return b;
}

function selectChapter(id, { fly = false, lesson = null } = {}) {
  state.chapter = id;
  document.querySelectorAll('#chapterChips .chip').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.chapter || null) == id)));
  const active = document.querySelector(`#chapterChips .chip[aria-pressed="true"]`);
  active?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  const row = $('#lessonChips'); row.innerHTML = '';
  if (id !== null) {
    const c = state.db.chapters.find((x) => x.id === id);
    c.lessons.forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.style.setProperty('--c', c.color); b.style.animationDelay = `${i * 60}ms`;
      b.dataset.lesson = l.code; b.setAttribute('aria-pressed', String(l.code === lesson));
      b.innerHTML = `<b>${l.code}</b><span>${l.title}</span>`;
      b.onclick = () => {
        row.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        state.cosmos.focusLesson(l.code, () => go(`#/lesson/${l.code}`));
      };
      row.appendChild(b);
    });
    if (fly) state.cosmos.focusChapter(id);
  } else state.cosmos?.setFocus(null, null);
  // إعادة حساب ارتفاع الترويسة
  requestAnimationFrame(() => state.cosmos && (state.cosmos.headH = document.querySelector('.tl-head').offsetHeight));
}

/* ─── الموجّه ─── */
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/(lesson|room)\/(\d-\d)(?:\/(\d-\d-\d|stage))?/);
  if (!m) { await leaveRoom(); await closeCard($('#cardLayer')); state.cosmos.focus.lesson = null; return; }
  const [, kind, code, exhibit] = m;
  const L = state.db.lesson(code);
  if (!L) return go('#/');
  if (kind === 'lesson') {
    await leaveRoom();
    if (state.chapter !== L.chapter.id) selectChapter(L.chapter.id, { lesson: code });
    else document.querySelectorAll('#lessonChips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lesson === code)));
    state.cosmos.setFocus(L.chapter.id, code);
    openCard(L);
  } else {
    await closeCard($('#cardLayer'));
    await enterRoom(L, exhibit);
  }
}

function openCard(L) {
  const i = state.db.order.indexOf(L.code);
  renderCard($('#cardLayer'), L, {
    onClose: () => go('#/'),
    onEnter: () => go(`#/room/${L.code}`),
    onNav: (dir) => {
      const code = state.db.order[i + (dir === 'next' ? 1 : -1)];
      if (code) { state.cosmos.focusLesson(code); go(`#/lesson/${code}`); }
    },
    hasPrev: i > 0, hasNext: i < state.db.order.length - 1,
  });
}

/* ─── الغرفة (تُحمَّل عند الطلب لتخفيف الصفحة الأولى) ─── */
async function enterRoom(L, exhibit) {
  const roomEl = $('#room');
  if (!state.room || state.room.code !== L.code) {
    await leaveRoom();
    const { Room } = await import('./room/room.js');
    state.cosmos.stop();
    $('#timeline').hidden = true;
    roomEl.hidden = false;
    state.room = new Room(roomEl, L, {
      onExit: () => go(`#/lesson/${L.code}`),
      onHome: () => go('#/'),
      onInspect: (id) => history.replaceState(null, '', id ? `#/room/${L.code}/${id}` : `#/room/${L.code}`),
    });
    await state.room.ready;
  }
  if (exhibit) state.room.inspect(exhibit);
}

async function leaveRoom() {
  if (!state.room) return;
  state.room.dispose(); state.room = null;
  $('#room').hidden = true; $('#room').innerHTML = '';
  $('#timeline').hidden = false;
  state.cosmos.resize(); state.cosmos.start();
}

boot().catch((e) => {
  console.error(e);
  $('#loader p').textContent = 'تعذّر التشغيل: ' + e.message;
});
