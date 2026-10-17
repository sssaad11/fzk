// تنسيق الأرقام والمعادلات وتقييم تعابير المسائل
import katex from 'katex';

const HELPERS = {
  sqrt: Math.sqrt, pow: Math.pow, sin: Math.sin, cos: Math.cos, abs: Math.abs, min: Math.min, max: Math.max,
  cbrt: Math.cbrt, PI: Math.PI, rad: (d) => (d * Math.PI) / 180, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  G: 6.67e-11, g: 9.8, c: 3.0e8,
};
const fnCache = new Map();

/** يقيّم تعبيراً (مخزّناً في قاعدة البيانات المحلية) ضمن نطاق من المتغيرات. */
export function evalExpr(expr, scope) {
  const names = [...Object.keys(HELPERS), ...Object.keys(scope)];
  const key = names.join(',') + '|' + expr;
  let fn = fnCache.get(key);
  if (!fn) { fn = new Function(...names, `return (${expr});`); fnCache.set(key, fn); }
  return fn(...Object.values(HELPERS), ...Object.values(scope));
}

/** يحسب كل نواتج المسألة بالترتيب. */
export function solve(ex, raw) {
  const vals = {};
  for (const p of ex.params) vals[p.key] = (raw[p.key] ?? p.value) * (p.scale || 1);
  for (const [k, expr] of ex.compute) vals[k] = evalExpr(expr, vals);
  return vals;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function trimZeros(s) { return s.includes('.') ? s.replace(/\.?0+$/, '') : s; }

/** رقم بصيغة LaTeX بثلاثة أرقام معنوية تقريباً. */
export function texNum(x, sig = 3) {
  if (!isFinite(x)) return '\\infty';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a));
    let m = x / 10 ** e;
    let ms = m.toFixed(sig - 1);
    if (Math.abs(parseFloat(ms)) >= 10) { ms = (m / 10).toFixed(sig - 1); return `${ms}\\times10^{${e + 1}}`; }
    return `${ms}\\times10^{${e}}`;
  }
  if (a >= 100) return String(Math.round(x));
  return trimZeros(x.toPrecision(sig));
}

/** نص عادي (للوحات ثلاثية الأبعاد) */
export function plainNum(x, sig = 3) {
  return texNum(x, sig).replace(/\\times10\^\{(-?\d+)\}/, (_, e) => '×10' + [...e].map((ch) => SUP[ch]).join(''));
}

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** قيمة متغير الإدخال بصيغة LaTeX مع احترام المقياس (مثل 7.35×10²²) */
export function paramTex(p, v) {
  const d = decimals(p.step);
  const scale = p.scale || 1;
  if (scale !== 1) {
    const e = Math.round(Math.log10(scale));
    return `${(+v).toFixed(d)}\\times10^{${e}}`;
  }
  return trimZeros((+v).toFixed(d)) || '0';
}

export function paramPlain(p, v) {
  return paramTex(p, v).replace(/\\times10\^\{(-?\d+)\}/, (_, e) => '×10' + [...e].map((ch) => SUP[ch]).join(''));
}

/** يبني خريطة نصوص LaTeX لكل المتغيرات والنواتج */
export function texMap(ex, raw, vals) {
  const map = {};
  for (const [k, v] of Object.entries(vals)) map[k] = texNum(v);
  for (const p of ex.params) map[p.key] = paramTex(p, raw[p.key] ?? p.value);
  return map;
}

export function fill(tpl, map) {
  return tpl.replace(/\[\[(\w+)\]\]/g, (_, k) => (k in map ? map[k] : '?'));
}

export function tex(latex, display = false) {
  try {
    return katex.renderToString(latex, { displayMode: display, throwOnError: false, output: 'html', strict: false });
  } catch {
    return latex;
  }
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** نص عربي يحتوي مقاطع رياضية بين $…$ */
export function rich(text) {
  return text.split(/(\$[^$]+\$)/g).map((part) =>
    part.startsWith('$') && part.endsWith('$') && part.length > 1
      ? `<span class="m">${tex(part.slice(1, -1))}</span>`
      : esc(part)).join('');
}

/** رمز المتغير/الوحدة كـ LaTeX داخل سطر */
export function sym(s) { return `<span class="m">${tex(s)}</span>`; }
