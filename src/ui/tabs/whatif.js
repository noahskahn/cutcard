// "What-If" tab: sweep one parameter (count errors, mistakes, penetration, ...) and compare EV.
import { h, fmt, getPath, setPath } from '../dom.js';
import { card } from '../fields.js';
import { barChart } from '../charts.js';
import { lineChart } from '../charts.js';
import { binStats } from '../../analysis/stats.js';
import { betsFromSpread, evaluateBets } from '../../analysis/spread.js';
import { ACCURACY } from '../app.js';

const SWEEPS = {
  count: { label: 'Running-count error rate', path: 'player.countErrorRate', values: [0, 0.01, 0.02, 0.05, 0.1, 0.2], f: (v) => fmt.pct(v, 0) + ' of rounds', parse: (s) => +s / 100, show: (v) => v * 100 },
  mistake: { label: 'Basic-strategy mistake rate', path: 'player.mistakeRate', values: [0, 0.01, 0.02, 0.05, 0.1, 0.2], f: (v) => fmt.pct(v, 0) + ' of decisions', parse: (s) => +s / 100, show: (v) => v * 100 },
  pen: { label: 'Penetration', path: 'rules.penetration', values: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9], f: (v) => fmt.pct(v, 0), parse: (s) => +s / 100, show: (v) => v * 100 },
  dev: { label: 'Deviation set', path: 'player.deviations', values: ['none', 'insurance', 'i18', 'i18fab4', 'engine'], f: (v) => ({ none: 'Basic only', insurance: 'Insurance only', i18: 'Illustrious 18', i18fab4: 'I18 + Fab 4', engine: 'Engine full set' }[v]), parse: (s) => s.trim(), show: (v) => v },
  decks: { label: 'Number of decks', path: 'rules.decks', values: [1, 2, 4, 6, 8], f: (v) => v + ' decks', parse: (s) => +s, show: (v) => v },
  players: { label: 'Other players at table', path: 'table.otherPlayers', values: [0, 1, 2, 3, 5], f: (v) => v + ' others', parse: (s) => +s, show: (v) => v },
  res: { label: 'Deck-estimation resolution', path: 'player.deckResolution', values: [0, 0.25, 0.5, 1], f: (v) => (v === 0 ? 'Exact' : v + ' deck'), parse: (s) => +s, show: (v) => v },
};

export function mount(root, app) {
  const sel = h('select', {}, Object.entries(SWEEPS).map(([k, s]) => h('option', { value: k }, s.label)));
  const vals = h('input', { type: 'text', style: { width: '100%' } });
  const fill = () => { const s = SWEEPS[sel.value]; vals.value = s.values.map(s.show).join(', '); };
  sel.addEventListener('change', fill); fill();
  const run = h('button', { class: 'btn primary' }, 'Run comparison');
  const prog = h('div', { class: 'prog' }, h('i')), out = h('div', { class: 'stack' }), msg = h('div', { class: 'sub' });
  let running = false;

  run.onclick = async () => {
    if (running) return;
    running = true; run.disabled = true;
    const sw = SWEEPS[sel.value];
    const list = vals.value.split(',').map((s) => s.trim()).filter(Boolean).map(sw.parse);
    const rows = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const cfg = JSON.parse(JSON.stringify(app.cfg));
        setPath(cfg, sw.path, list[i]);
        if (sw.path === 'rules.penetration') cfg.rules.csm = false;
        msg.textContent = `Simulating ${sw.f(list[i])} (${i + 1}/${list.length})…`;
        const setup = app.compile(cfg);
        const bins = await app.pool.runBins(setup, ACCURACY[app.ui.accuracy], (p) => { prog.firstChild.style.width = (((i + p) / list.length) * 100).toFixed(0) + '%'; }, 900 + i);
        const stats = binStats(bins);
        const bets = betsFromSpread(cfg.spread, cfg.table, cfg.player);
        rows.push({ v: list[i], label: sw.f(list[i]), ev: evaluateBets(stats, bets, cfg.table, cfg.costs, cfg.player.bankroll), cfg });
      }
      msg.textContent = 'Done. Same bet spread and bankroll used for every row.';
      render(rows, sw);
    } catch (e) { msg.textContent = 'Stopped: ' + e.message; }
    running = false; run.disabled = false; prog.firstChild.style.width = '0';
  };

  function render(rows, sw) {
    out.innerHTML = '';
    const base = rows[0].ev.evHr;
    const tbl = h('table', { class: 't' }, h('tr', {}, ...[sw.label, 'EV / hour', '% of first row', 'SD / hour', 'Risk of ruin', 'Hours to 95% profit'].map((t) => h('th', {}, t))));
    rows.forEach((r) => tbl.append(h('tr', {}, h('td', {}, r.label), h('td', { class: fmt.signCls(r.ev.evHr) }, fmt.money(r.ev.evHr, 2)),
      h('td', {}, base > 0 ? fmt.pct(r.ev.evHr / base, 0) : '—'), h('td', {}, fmt.money(r.ev.sdHr)), h('td', {}, r.ev.evRound > 0 ? fmt.pct(r.ev.ror, 1) : '100%'), h('td', {}, fmt.hours(r.ev.n95Hours)))));
    const c1 = h('canvas', { class: 'chart' }), c2 = h('canvas', { class: 'chart tall' });
    out.append(card('Comparison', msg, tbl), h('div', { class: 'grid g2' },
      card('Expected profit per hour', null, c1),
      card('Expected profit over time', 'Average winnings if you play many hours. Shaded = ±1 standard deviation of the first row, to show how luck compares with the effect.', c2,
        h('div', { class: 'legend' }, ...rows.map((r, i) => h('span', {}, h('i', { style: { background: COLORS[i % COLORS.length] } }), r.label))))));
    barChart(c1, { labels: rows.map((r) => r.label.replace(' of rounds', '').replace(' of decisions', '')), values: rows.map((r) => r.ev.evHr), yFmt: (v) => fmt.money(v, 0), valueLabels: rows.map((r) => fmt.money(r.ev.evHr, 0)) });
    const hours = Array.from({ length: 101 }, (_, i) => i * 5);
    lineChart(c2, {
      bands: [{ x: hours, lo: hours.map((x) => rows[0].ev.evHr * x - rows[0].ev.sdHr * Math.sqrt(x)), hi: hours.map((x) => rows[0].ev.evHr * x + rows[0].ev.sdHr * Math.sqrt(x)), color: COLORS[0], alpha: 0.12 }],
      series: rows.map((r, i) => ({ name: r.label, x: hours, y: hours.map((x) => r.ev.evHr * x), color: COLORS[i % COLORS.length], width: 2 })),
      yFmt: (v) => fmt.money(v), xFmt: (v) => v + 'h', xLabel: 'Hours played',
    });
  }
  const COLORS = ['#4cc9a0', '#6ea8e0', '#d6a85a', '#a592da', '#e0955f', '#e5707a', '#9cc3e8'];
  root.append(h('div', { class: 'stack' },
    card('What-if comparison', 'Pick a factor, list the values to test, and see how profit changes. Each value runs a full card-by-card simulation of your game using your current spread and bankroll. Great for "how much does miscounting cost me?"',
      h('div', { class: 'grid g2' },
        h('div', { class: 'field' }, h('label', {}, 'Factor to vary'), sel),
        h('div', { class: 'field' }, h('label', {}, 'Values (comma-separated; % where relevant)'), vals)),
      h('div', { class: 'row' }, run), prog),
    out));
  return { update() {} };
}
void getPath;
