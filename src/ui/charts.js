// Dependency-free canvas charts (line+bands, bars) with hover read-outs.
const C = { grid: 'rgba(233,215,159,.13)', axis: 'rgba(233,215,159,.38)', text: '#c9d4c4', bg: '#131a22' };

function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) { hi = lo + 1; }
  const span = hi - lo, step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(+v.toPrecision(12));
  return out;
}

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, hgt = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = hgt * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  return { ctx, w, h: hgt };
}

function frame(ctx, w, h, m, xr, yr, o) {
  const X = (v) => m.l + ((v - xr[0]) / (xr[1] - xr[0])) * (w - m.l - m.r);
  const Y = (v) => h - m.b - ((v - yr[0]) / (yr[1] - yr[0])) * (h - m.t - m.b);
  ctx.font = '11px ui-sans-serif,system-ui,sans-serif';
  ctx.textBaseline = 'middle';
  const yt = niceTicks(yr[0], yr[1], 5);
  ctx.strokeStyle = C.grid; ctx.fillStyle = C.text; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (const t of yt) { const y = Math.round(Y(t)) + .5; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke(); ctx.fillText((o.yFmt || String)(t), m.l - 6, y); }
  if (!o.noXTicks) {
    const xt = o.xTicks || niceTicks(xr[0], xr[1], Math.max(3, Math.floor((w - m.l - m.r) / 90)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of xt) { const x = X(t); ctx.fillText((o.xFmt || String)(t), x, h - m.b + 6); }
  }
  if (o.xLabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xLabel, m.l + (w - m.l - m.r) / 2, h - 1); }
  if (o.yLabel) { ctx.save(); ctx.translate(11, m.t + (h - m.t - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.yLabel, 0, 0); ctx.restore(); }
  if (yr[0] < 0 && yr[1] > 0) { ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(m.l, Math.round(Y(0)) + .5); ctx.lineTo(w - m.r, Math.round(Y(0)) + .5); ctx.stroke(); }
  return { X, Y };
}

/** series:[{name,x:ArrayLike,y:ArrayLike,color,width,dash}] bands:[{x,lo,hi,color,alpha}] refLines:[{y,color,label,dash}] */
export function lineChart(canvas, o) {
  const draw = () => {
    const { ctx, w, h } = setup(canvas);
    const m = { l: 64, r: 14, t: 12, b: o.xLabel ? 38 : 26 };
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    const eat = (xs, ys) => { for (let i = 0; i < xs.length; i++) { const x = xs[i], y = ys[i]; if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; } };
    for (const s of o.series || []) eat(s.x, s.y);
    for (const b of o.bands || []) { eat(b.x, b.lo); eat(b.x, b.hi); }
    for (const r of o.refLines || []) { if (r.y < ymin) ymin = r.y; if (r.y > ymax) ymax = r.y; }
    if (o.yMin != null) ymin = o.yMin; if (o.yMax != null) ymax = o.yMax;
    const pad = (ymax - ymin) * 0.05 || 1;
    const yr = [o.yMin != null ? ymin : ymin - pad, o.yMax != null ? ymax : ymax + pad];
    const { X, Y } = frame(ctx, w, h, m, [xmin, xmax], yr, o);
    ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, w - m.l - m.r, h - m.t - m.b); ctx.clip();
    for (const b of o.bands || []) {
      ctx.fillStyle = b.color; ctx.globalAlpha = b.alpha ?? 0.15; ctx.beginPath();
      for (let i = 0; i < b.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(b.x[i]), Y(b.hi[i]));
      for (let i = b.x.length - 1; i >= 0; i--) ctx.lineTo(X(b.x[i]), Y(b.lo[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (const r of o.refLines || []) {
      ctx.strokeStyle = r.color || C.axis; ctx.setLineDash(r.dash || [5, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.l, Y(r.y)); ctx.lineTo(w - m.r, Y(r.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const s of o.series || []) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.6; ctx.globalAlpha = s.alpha ?? 1; ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      for (let i = 0; i < s.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(s.x[i]), Y(s.y[i]));
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.restore();
    canvas._hover = { m, w, h, X, Y, xr: [xmin, xmax], o, base: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  };
  draw();
  attachHover(canvas, draw);
  return draw;
}

function attachHover(canvas, redraw) {
  if (canvas._wired) { canvas._redraw = redraw; return; }
  canvas._wired = true; canvas._redraw = redraw;
  const tip = document.createElement('div');
  tip.style.cssText = 'position:fixed;pointer-events:none;background:#0b0f14ee;border:1px solid #223040;border-radius:8px;padding:6px 9px;font:12px ui-sans-serif,system-ui;color:#e6edf3;display:none;z-index:50;white-space:nowrap';
  document.body.append(tip);
  canvas.addEventListener('mousemove', (e) => {
    const hv = canvas._hover; if (!hv || !hv.o.series || !hv.o.series.length) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const xv = hv.xr[0] + ((px - hv.m.l) / (hv.w - hv.m.l - hv.m.r)) * (hv.xr[1] - hv.xr[0]);
    if (xv < hv.xr[0] || xv > hv.xr[1]) { tip.style.display = 'none'; return; }
    const ref = hv.o.series[0];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < ref.x.length; i++) { const d = Math.abs(ref.x[i] - xv); if (d < bd) { bd = d; bi = i; } }
    const ctx = canvas.getContext('2d');
    ctx.putImageData(hv.base, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = '#8b9bab'; ctx.setLineDash([3, 3]);
    const x = hv.X(ref.x[bi]); ctx.beginPath(); ctx.moveTo(x, hv.m.t); ctx.lineTo(x, hv.h - hv.m.b); ctx.stroke(); ctx.restore();
    const xf = hv.o.xFmt || String, yf = hv.o.yFmt || String;
    tip.innerHTML = `<div style="color:#8b9bab">${xf(ref.x[bi])}</div>` + hv.o.series.filter((s) => s.tip !== false).map((s) => `<div><span style="color:${s.color}">●</span> ${s.name}: <b>${yf(s.y[Math.min(bi, s.y.length - 1)])}</b></div>`).join('');
    tip.style.display = 'block'; tip.style.left = Math.min(e.clientX + 14, innerWidth - 220) + 'px'; tip.style.top = e.clientY + 14 + 'px';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; if (canvas._hover) canvas.getContext('2d').putImageData(canvas._hover.base, 0, 0); });
  new ResizeObserver(() => { if (canvas.clientWidth) canvas._redraw(); }).observe(canvas);
}

/** o: {labels, values, colors?, errs?, line?:{values,color}, yFmt, yLabel, xLabel, valueLabels?} */
export function barChart(canvas, o) {
  const draw = () => {
    const { ctx, w, h } = setup(canvas);
    const m = { l: 64, r: 14, t: 14, b: o.xLabel ? 40 : 28 };
    const n = o.values.length;
    let lo = Math.min(0, ...o.values.map((v, i) => v - (o.errs ? o.errs[i] : 0)));
    let hi = Math.max(0, ...o.values.map((v, i) => v + (o.errs ? o.errs[i] : 0)));
    if (o.line) { lo = Math.min(lo, ...o.line.values); hi = Math.max(hi, ...o.line.values); }
    const pad = (hi - lo) * 0.06 || 1;
    const yr = [lo < 0 ? lo - pad : 0, hi + pad];
    const { X, Y } = frame(ctx, w, h, m, [0, n], yr, { ...o, noXTicks: true });
    const bw = (w - m.l - m.r) / n;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = C.text;
    const every = bw < 24 ? 2 : 1;
    o.labels.forEach((lb, i) => { if (i % every === 0) ctx.fillText(lb, m.l + bw * (i + .5), h - m.b + 6); });
    o.values.forEach((v, i) => {
      ctx.fillStyle = (o.colors && o.colors[i]) || (v >= 0 ? '#4cc9a0' : '#e5707a');
      const x = m.l + bw * i + bw * 0.12, ww = bw * 0.76;
      ctx.fillRect(x, Math.min(Y(v), Y(0)), ww, Math.abs(Y(v) - Y(0)) || 1);
      if (o.errs && isFinite(o.errs[i])) {
        ctx.strokeStyle = '#e6edf3aa'; ctx.beginPath();
        const cx = x + ww / 2; ctx.moveTo(cx, Y(v - o.errs[i])); ctx.lineTo(cx, Y(v + o.errs[i])); ctx.stroke();
      }
      if (o.valueLabels) { ctx.fillStyle = '#c3cfdb'; ctx.textBaseline = 'bottom'; ctx.fillText(o.valueLabels[i], x + ww / 2, Y(Math.max(v, 0)) - 2); }
    });
    if (o.line) {
      ctx.strokeStyle = o.line.color || '#d6a85a'; ctx.lineWidth = 2; ctx.beginPath();
      o.line.values.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](m.l + bw * (i + .5), Y(v)));
      ctx.stroke();
    }
    void X;
  };
  draw();
  if (!canvas._wiredBar) { canvas._wiredBar = true; new ResizeObserver(() => { if (canvas.clientWidth) canvas._drawBar(); }).observe(canvas); }
  canvas._drawBar = draw;
}

export function histogram(values, bins = 30) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi === lo) hi = lo + 1;
  const w = (hi - lo) / bins, counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return { lo, hi, w, counts };
}
