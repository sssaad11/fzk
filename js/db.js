// طبقة البيانات: تحميل قاعدة SQLite المحلية في المتصفح عبر sql.js
const J = (s, d = null) => (s ? JSON.parse(s) : d);

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('تعذّر تحميل ' + src));
    document.head.appendChild(s);
  });
}

export async function openDB() {
  await loadScript('vendor/sqljs/sql-wasm.js');
  const SQL = await window.initSqlJs({ locateFile: (f) => 'vendor/sqljs/' + f });
  const buf = await fetch('data/physics.db').then((r) => {
    if (!r.ok) throw new Error('قاعدة البيانات غير موجودة — شغّل npm run seed');
    return r.arrayBuffer();
  });
  const db = new SQL.Database(new Uint8Array(buf));
  const all = (sql, params = []) => {
    const st = db.prepare(sql); st.bind(params);
    const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free();
    return rows;
  };

  const constants = Object.fromEntries(all('SELECT symbol, value FROM constants').map((r) => [r.symbol, r.value]));
  const chapters = all('SELECT * FROM chapters ORDER BY id').map((c) => ({
    ...c,
    lessons: all('SELECT code, title FROM lessons WHERE chapter_id = ? ORDER BY ord', [c.id]),
  }));

  function lesson(code) {
    const l = all('SELECT * FROM lessons WHERE code = ?', [code])[0];
    if (!l) return null;
    const chapter = chapters.find((c) => c.id === l.chapter_id);
    const eqs = all('SELECT latex, label, is_main FROM equations WHERE lesson_code = ? ORDER BY ord', [code]);
    const sim = all('SELECT * FROM simulations WHERE lesson_code = ?', [code])[0];
    const exhibits = all('SELECT * FROM exhibits WHERE lesson_code = ? ORDER BY ord', [code]).map((e) => ({
      id: e.id, kind: e.kind, title: e.title, tag: e.tag, statement: e.statement, insight: e.insight, body: e.body,
      params: J(e.params_json, []), compute: J(e.compute_json, []), steps: J(e.steps_json, []), answer: J(e.answer_json, {}),
      bind: J(e.sim_bind_json, {}), events: J(e.events_json, []),
    }));
    return {
      ...l, chapter,
      main: eqs.find((e) => e.is_main), related: eqs.filter((e) => !e.is_main),
      vars: all('SELECT symbol, meaning, unit FROM variables WHERE lesson_code = ? ORDER BY ord', [code]),
      sim: sim && { type: sim.type, title: sim.title, desc: sim.description, params: J(sim.params_json, {}) },
      exhibits,
    };
  }

  const order = chapters.flatMap((c) => c.lessons.map((l) => l.code));
  return { chapters, lesson, order, constants };
}
