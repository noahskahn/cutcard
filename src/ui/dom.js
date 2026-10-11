// Tiny DOM + formatting helpers.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export const fmt = {
  money(v, d = 0) { if (!isFinite(v)) return '—'; const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); return (v < 0 ? '-$' : '$') + s; },
  pct(v, d = 2) { return isFinite(v) ? (v * 100).toFixed(d) + '%' : '—'; },
  num(v, d = 0) { return isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'; },
  big(v) { if (!isFinite(v)) return '∞'; if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M'; if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(0) + 'k'; return Math.round(v).toLocaleString('en-US'); },
  hours(v) { if (!isFinite(v)) return '∞'; if (v >= 1e5) return fmt.big(v) + ' h'; if (v >= 100) return Math.round(v).toLocaleString('en-US') + ' h'; return v.toFixed(1) + ' h'; },
  signCls(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; },
};

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
export function setPath(obj, path, val) {
  const ks = path.split('.'); const last = ks.pop();
  const t = ks.reduce((o, k) => o[k], obj); t[last] = val;
}
