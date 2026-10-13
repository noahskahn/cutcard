// "Spread & EV" tab: bet spread editor, metrics, EV-by-count charts, spread comparison.
import { h, fmt } from '../dom.js';
import { card } from '../fields.js';
import { barChart } from '../charts.js';
import { SPREAD_PRESETS, betsFromSpread, evaluateBets } from '../../analysis/spread.js';
import { TC_MIN, NBINS } from '../../core/constants.js';

export function mount(root, app) {
  const inputs = [], dollars = [];
  const unitIn = h('input', { type: 'number', min: 1, step: 1 });
  unitIn.addEventListener('change', () => { app.cfg.spread.unit = Math.max(1, +unitIn.value || 25); app.change('spread.unit'); });
  const row = h('div', { class: 'spread' });
  for (let i = 0; i < 10; i++) {
    const inp = h('input', { type: 'number', min: 0, step: 0.5 });
    inp.addEventListener('change', () => { app.cfg.spread.bets[i] = Math.max(0, +inp.value || 0); app.cfg.preset = app.cfg.preset; app.change('spread.bets'); });
    const d = h('small');
    inputs.push(inp); dollars.push(d);
    row.append(h('div', {}, h('label', {}, i === 0 ? 'TC ≤ 0' : i === 9 ? 'TC ≥ 9' : 'TC ' + i), inp, d));
  }
  const presetRow = h('div', { class: 'row' }, ...Object.keys(SPREAD_PRESETS).map((k) =>
    h('button', { class: 'btn small', onclick: () => { app.cfg.spread.bets = [...SPREAD_PRESETS[k]]; app.change('spread.bets'); } }, k)));
  const cEV = h('canvas', { class: 'chart' }), cFreq = h('canvas', { class: 'chart' }), cHr = h('canvas', { class: 'chart' });
  const metrics = h('div'), compare = h('div'), sanity = h('div');
  root.append(h('div', { class: 'stack' },
    card('Bet spread', 'Units bet at each true count. Index 0 covers every count ≤ 0; the last box covers every count above it. Dollar amounts are clipped to table limits.',
      h('div', { class: 'row', style: { marginBottom: '12px' } }, h('label', { style: { fontWeight: 600 } }, '1 unit = $'), unitIn, h('span', { class: 'sub' }, 'Quick spreads:'), presetRow), row),
    h('div', { class: 'grid g2' },
      card('Results for this spread', 'Calculated from per-count statistics measured over millions of simulated rounds.', metrics),
      card('Compare standard spreads', 'Same game, same bankroll, same unit. Highlighted row = your current spread.', compare)),
    h('div', { class: 'grid g2' },
      card('Player edge by true count', 'Average result per unit bet at each count (flat bet). Whiskers = ±1 standard error. Gold line = smoothed fit used for bins with little data.', cEV),
      card('How often each count occurs', 'Share of rounds at each (floored) true count — penetration and deck count shape this.', cFreq)),
    card('Where your hourly profit comes from', 'EV per hour contributed by each true count under your spread.', cHr),
    card('Sanity checks', 'Independent checks that the numbers are self-consistent.', sanity),
  ));

  const update = () => {
    const c = app.cfg;
    unitIn.value = c.spread.unit;
    const bets = betsFromSpread(c.spread, c.table, c.player);
    inputs.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = c.spread.bets[i]; });
    dollars.forEach((d, i) => { d.textContent = fmt.money(bets[Math.max(0, Math.min(NBINS - 1, i - TC_MIN))]); });
    const st = app.stats;
    if (!st) { metrics.textContent = 'Calculating…'; return; }
    const e = app.evalCurrent().ev;
    const rowM = (a, b, cls) => h('tr', {}, h('td', {}, a), h('td', { class: cls || '' }, b));
    metrics.innerHTML = '';
    metrics.append(h('table', { class: 't' },
      rowM('Expected win / hour', fmt.money(e.evHr, 2), fmt.signCls(e.evHr)),
      rowM('Expected win / 100 hands played', fmt.money(e.handsPlayedHr ? e.evHr / e.handsPlayedHr * 100 : 0, 2), fmt.signCls(e.evHr)),
      rowM('Standard deviation / hour', fmt.money(e.sdHr)),
      rowM('Average bet (hands played)', fmt.money(e.avgBet, 2)),
      rowM('Hands played / hour', fmt.num(e.handsPlayedHr, 1)),
      rowM('Money wagered / hour', fmt.money(e.wagerHr)),
      rowM('Edge on money wagered', fmt.pct(e.edgePct / 100, 3), fmt.signCls(e.edgePct)),
      rowM('Costs / comps per hour (net)', fmt.money(-e.costHr, 2)),
      rowM('Risk of ruin (bankroll ' + fmt.money(c.player.bankroll) + ')', e.evRound > 0 ? fmt.pct(e.ror, 2) : '100%', e.ror > 0.05 ? 'neg' : 'pos'),
      rowM('Bankroll for 5% / 1% risk of ruin', `${fmt.money(bankrollFor(e, 0.05))} / ${fmt.money(bankrollFor(e, 0.01))}`),
      rowM('Hands until ≥95% chance of profit', fmt.big(e.n95Rounds)),
      rowM('Hours until ≥95% chance of profit', fmt.hours(e.n95Hours)),
      rowM('N0 (hands for 1 SD = expected win)', fmt.big(e.n0)),
      rowM('Chance of profit after 10 / 100 / 500 h', `${fmt.pct(e.pProfit(10), 1)} / ${fmt.pct(e.pProfit(100), 1)} / ${fmt.pct(e.pProfit(500), 1)}`),
      rowM('Expected hours to double bankroll', fmt.hours(e.hoursToDouble)),
    ));
    // compare spreads
    const tbl = h('table', { class: 't' }, h('tr', {}, ...['Spread', 'EV/hr', 'SD/hr', 'RoR', 'Avg bet', 'Hrs to 95%'].map((t) => h('th', {}, t))));
    const cur = c.spread.bets.join(',');
    for (const [name, arr] of Object.entries(SPREAD_PRESETS)) {
      const b = betsFromSpread({ unit: c.spread.unit, bets: arr }, c.table, c.player);
      const x = evaluateBets(st, b, c.table, c.costs, c.player.bankroll);
      tbl.append(h('tr', { class: arr.join(',') === cur ? 'hl' : '' }, h('td', {}, name), h('td', { class: fmt.signCls(x.evHr) }, fmt.money(x.evHr, 1)),
        h('td', {}, fmt.money(x.sdHr)), h('td', { class: x.ror > 0.05 ? 'neg' : '' }, x.evRound > 0 ? fmt.pct(x.ror, 1) : '100%'), h('td', {}, fmt.money(x.avgBet, 0)), h('td', {}, fmt.hours(x.n95Hours))));
    }
    compare.innerHTML = ''; compare.append(tbl);
    // charts
    const labels = [], vals = [], errs = [], fit = [], freq = [], hr = [], cols = [];
    const rph = c.table.roundsPerHour;
    for (let i = 0; i < NBINS; i++) {
      const tc = i + TC_MIN;
      if (st.f[i] < 0.0004 && (tc < -6 || tc > 10)) continue;
      labels.push(tc <= TC_MIN ? '≤' + tc : tc >= 12 ? '≥' + tc : String(tc));
      vals.push(st.rawMu[i] * 100); errs.push(st.se[i] * 100); fit.push(st.fit[i] * 100); freq.push(st.f[i] * 100);
      hr.push(bets[i] * st.f[i] * st.mu[i] * rph);
      cols.push(st.n[i] < 3000 ? '#5d6c7b' : st.rawMu[i] >= 0 ? '#4cc9a0' : '#e5707a');
    }
    barChart(cEV, { labels, values: vals, errs, colors: cols, line: { values: fit, color: '#bcd9cc' }, yFmt: (v) => v.toFixed(1) + '%', xLabel: 'True count' });
    barChart(cFreq, { labels, values: freq, colors: labels.map(() => '#6ea8e0'), yFmt: (v) => v.toFixed(0) + '%', xLabel: 'True count' });
    barChart(cHr, { labels, values: hr, yFmt: (v) => fmt.money(v, 0), xLabel: 'True count' });
    // sanity
    const b0 = TC_MIN * -1;
    const n0 = st.n[b0], mu0 = st.rawMu[b0], se0 = st.se[b0];
    sanity.innerHTML = '';
    sanity.append(h('table', { class: 't' },
      h('tr', {}, h('td', {}, 'Exact basic-strategy edge, fresh shoe (analytic engine)'), h('td', {}, fmt.pct(app.baseEdge, 3))),
      h('tr', {}, h('td', {}, 'Simulated edge at true count 0 (regression; floored bins sit +0.5 high)'), h('td', {}, `${fmt.pct(st.intercept - 0.5 * st.slope, 3)} (with your deviations/mistakes; ≥ exact BS edge when deviations are on)`)),
      h('tr', {}, h('td', {}, 'Simulated average edge over all rounds, flat bet'), h('td', {}, `${fmt.pct(st.overall.mean, 3)} ± ${fmt.pct(st.overall.se, 3)}`)),
      h('tr', {}, h('td', {}, 'Measured edge gain per +1 true count'), h('td', {}, fmt.pct(st.slope, 3) + ' (Hi-Lo rule of thumb ≈ 0.5%)')),
      h('tr', {}, h('td', {}, 'Std dev per round at 1 unit'), h('td', {}, st.overall.sd.toFixed(3) + ' (typical 1.10–1.15)'))));
  };
  const bankrollFor = (e, t) => (e.evRound > 0 ? (-Math.log(t) * e.variance) / (2 * e.evRound) : Infinity);
  app.on('cfg', () => { if (root.offsetParent) update(); });
  return { update };
}
