// بطاقة الدرس: لوحة فيزياء بيضاء أنيقة
import { tex, sym } from './fmt.js';

export function renderCard(layer, L, { onEnter, onClose, onNav, hasPrev, hasNext }) {
  const problems = L.exhibits.filter((e) => e.kind === 'problem').length;
  layer.innerHTML = `
  <article class="board" style="--c:${L.chapter.color}" role="dialog" aria-modal="true" aria-labelledby="boardTitle" data-lesson="${L.code}">
    <div class="board-top">
      <span class="board-chapter"><i></i>الفصل ${L.chapter.id} · ${L.chapter.title}</span>
      <div class="board-actions">
        <button class="icon-btn" data-nav="prev" aria-label="الدرس السابق" ${hasPrev ? '' : 'disabled'}>→</button>
        <button class="icon-btn" data-nav="next" aria-label="الدرس التالي" ${hasNext ? '' : 'disabled'}>←</button>
        <button class="icon-btn" data-close aria-label="إغلاق">✕</button>
      </div>
    </div>
    <div class="board-title"><span class="code">${L.code}</span><h2 id="boardTitle">${L.title}</h2></div>

    <div class="eq-stage">
      <div class="eq-main" dir="ltr">${tex(L.main.latex, true)}</div>
      <span class="eq-label">${L.main.label}</span>
    </div>

    <div class="board-grid">
      <section class="panel">
        <h3>المتغيرات ووحدات القياس</h3>
        <table class="vars">
          <thead><tr><th>الرمز</th><th>المعنى</th><th>الوحدة</th></tr></thead>
          <tbody>${L.vars.map((v) => `<tr><td class="sym">${sym(v.symbol)}</td><td>${meaning(v.meaning)}</td><td class="unit">${v.unit}</td></tr>`).join('')}</tbody>
        </table>
      </section>
      <section class="panel">
        <h3>معادلات مرتبطة من الدرس</h3>
        <div class="rel">${L.related.map((e) => `<div class="rel-item"><span>${e.label}</span><span class="k m">${tex(e.latex)}</span></div>`).join('')}</div>
      </section>
    </div>

    <p class="context">${L.context}<small>السياق التاريخي مستند إلى ويكيبيديا</small></p>

    <footer class="board-foot">
      <div class="stats"><span><b>${L.exhibits.length}</b>معروضات</span><span><b>${problems}</b>مسائل محلولة</span><span><b>1</b>محاكاة ثلاثية الأبعاد</span></div>
      <button class="enter-btn" data-enter>ادخل غرفة المحاكاة <span class="arrow">←</span></button>
    </footer>
  </article>`;
  layer.hidden = false; layer.classList.remove('closing');
  const board = layer.querySelector('.board');
  board.querySelector('[data-close]').onclick = onClose;
  board.querySelector('[data-enter]').onclick = onEnter;
  board.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => onNav(b.dataset.nav)));
  layer.onclick = (e) => { if (e.target === layer) onClose(); };
  board.querySelector('[data-enter]').focus({ preventScroll: true });
}

export function closeCard(layer) {
  return new Promise((res) => {
    if (layer.hidden) return res();
    layer.classList.add('closing');
    setTimeout(() => { layer.hidden = true; layer.innerHTML = ''; layer.classList.remove('closing'); res(); }, 280);
  });
}

// القيم العددية بعد «=» تُعرض من اليسار إلى اليمين
function meaning(t) {
  const i = t.indexOf(' = ');
  return i < 0 ? t : `${t.slice(0, i)} = <span dir="ltr" class="num-ltr">${t.slice(i + 3)}</span>`;
}
