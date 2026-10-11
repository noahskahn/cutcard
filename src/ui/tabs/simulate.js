// "Simulate" tab: Monte Carlo bankroll paths with confidence bands.
import { h, fmt } from '../dom.js';
import { card } from '../fields.js';
import { lineChart, barChart, histogram } from '../charts.js';
import { aggregateRuns } from '../../analysis/runStats.js';
import { tripRuin } from '../../analysis/spread.js';

export function mount(root, app) {
  const st = { runs: 1000, hours: 200, cp: 100 };
  const num = (key, label, min, max, hint) => {
    const i = h('input', { type: 'number', min, max, value: st[key] });
    i.addEventListener('change', () => { st[key] = Math.max(min, Math.min(max, +i.value || min)); i.value = st[key]; });
    return h('div', { class: 'field' }, h('label', {}, label), i, h('div', { class: 'hint' }, hint));
  };
  const prog = h('div', { class: 'prog' }, h('i')), msg = h('div', { class: 'sub' });
  const runBtn = h('button', { class: 'btn primary' }, 'Run simulation');
  const cancelBtn = h('button', { class: 'btn', disabled: true }, 'Cancel');
  const out = h('div', { class: 'stack' });
  let last = null;

  runBtn.onclick = async () => {
    if (!app.stats) return;
    const cfg = app.cfg;
    const cur = app.evalCurrent();
    const setup = app.setup || app.compile();
    const rounds = Math.round(st.hours * cfg.table.roundsPerHour);
    const args = {
      runs: st.runs, rounds, checkpoints: st.cp, bets: cur.bets, bankroll: cfg.player.bankroll, minBet: cfg.table.minBet,
      perRoundCost: (cfg.costs.hourlyCost || 0) / cfg.table.roundsPerHour, rakePerHand: cfg.costs.rakePerHand || 0, compPct: (cfg.costs.compPct || 0) / 100,
    };
    runBtn.disabled = true; cancelBtn.disabled = false; msg.textContent = 'Dealing every card…';
    const t0 = performance.now();
    try {
      const parts = await app.pool.runBankroll(setup, args, (p) => { prog.firstChild.style.width = (p * 100).toFixed(0) + '%'; }, Date.now() % 100000);
      const ag = aggregateRuns(parts, st.runs, st.cp, rounds, cfg.player.bankroll);
      last = { ag, args, ev: cur.ev, hours: st.hours, secs: (performance.now() - t0) / 1000 };
      render();
    } catch (e) { msg.textContent = 'Stopped: ' + e.message; }
    runBtn.disabled = false; cancelBtn.disabled = true; prog.firstChild.style.width = '0';
  };
  cancelBtn.onclick = () => { app.pool.cancel(); runBtn.disabled = false; cancelBtn.disabled = true; msg.textContent = 'Cancelled.'; prog.firstChild.style.width = '0'; app.recompute(); };

  function render() {
    const { ag, args, ev, hours, secs } = last;
    const cfg = app.cfg, B = cfg.player.bankroll;
    out.innerHTML = '';
    msg.textContent = `${fmt.num(st.runs)} runs × ${fmt.num(args.rounds)} rounds (${fmt.num(args.rounds * st.runs / 1e6, 1)}M rounds) dealt card-by-card in ${secs.toFixed(1)}s.`;
    const cp = ag.cp, xs = Array.from({ length: ag.W }, (_, i) => (i / cp) * hours);
    const sorted = [...ag.finals].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const predicted = B + ev.evHr * hours, predSd = ev.sdHr * Math.sqrt(hours);
    const trip = ev.tripRuin(hours);
    out.append(card('Simulation summary', msg,
      h('div', { class: 'grid g3' },
        mini('Average final bankroll', fmt.money(ag.mean[cp]), `predicted ${fmt.money(predicted)}`),
        mini('Median final', fmt.money(med), `5th–95th: ${fmt.money(ag.pct[5][cp])} – ${fmt.money(ag.pct[95][cp])}`),
        mini('Std dev of final', fmt.money(ag.sd[cp]), `predicted ${fmt.money(predSd)}`),
        mini('Chance of profit', fmt.pct(ag.profit, 1), `predicted ${fmt.pct(ev.pProfit(hours), 1)}`),
        mini('Ruined within horizon', fmt.pct(ag.ruinProb, 1), `analytic ${fmt.pct(trip, 1)} · lifetime ${fmt.pct(ev.ror, 1)}`),
        mini('Best / worst run', fmt.money(sorted[sorted.length - 1]), 'worst ' + fmt.money(sorted[0])))));
    // chart 1: paths + sigma bands
    const c1 = h('canvas', { class: 'chart tall' });
    const nShow = Math.min(8, ag.runs), W = ag.W;
    const pathColors = ['#6ea8e0', '#a592da', '#d6a85a', '#e0955f', '#7fcfb4', '#e5707a', '#9cc3e8', '#bfaee6'];
    const band = (k, color, a) => ({ x: xs, lo: Array.from(ag.mean, (m, i) => m - k * ag.sd[i]), hi: Array.from(ag.mean, (m, i) => m + k * ag.sd[i]), color, alpha: a });
    out.append(card('Bankroll over time — sample runs with ±1σ / ±2σ bands', 'Thin lines: individual simulated runs. White line: average across all runs. Shaded: one and two standard deviations across runs.', c1,
      h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#e6edf3' } }), 'Mean'), h('span', {}, h('i', { style: { background: '#4cc9a0' } }), '±1σ'), h('span', {}, h('i', { style: { background: '#4cc9a088' } }), '±2σ'), h('span', {}, h('i', { style: { background: '#d6a85a' } }), 'Starting bankroll'))));
    lineChart(c1, {
      bands: [band(2, '#4cc9a0', 0.10), band(1, '#4cc9a0', 0.20)],
      series: [
        ...Array.from({ length: nShow }, (_, r) => ({ name: 'Run ' + (r + 1), x: xs, y: Array.from({ length: W }, (_, c) => ag.traj[r * W + c]), color: pathColors[r % 8], width: 1, alpha: 0.65, tip: false })),
        { name: 'Mean', x: xs, y: ag.mean, color: '#e6edf3', width: 2.4 },
        { name: '+1σ', x: xs, y: Array.from(ag.mean, (m, i) => m + ag.sd[i]), color: '#4cc9a0', width: 1, dash: [4, 3] },
        { name: '−1σ', x: xs, y: Array.from(ag.mean, (m, i) => m - ag.sd[i]), color: '#4cc9a0', width: 1, dash: [4, 3] },
      ],
      refLines: [{ y: B, color: '#d6a85a' }], yFmt: (v) => fmt.money(v), xFmt: (v) => v.toFixed(0) + 'h', xLabel: 'Hours played', yMin: Math.min(0, ...ag.pct[5]),
    });
    // chart 2: percentile fan
    const c2 = h('canvas', { class: 'chart' });
    out.append(card('Distribution of outcomes over time', 'Percentile fan across all runs: median, middle 50% and middle 90%.', c2));
    lineChart(c2, {
      bands: [{ x: xs, lo: ag.pct[5], hi: ag.pct[95], color: '#6ea8e0', alpha: 0.14 }, { x: xs, lo: ag.pct[25], hi: ag.pct[75], color: '#6ea8e0', alpha: 0.28 }],
      series: [{ name: 'Median', x: xs, y: ag.pct[50], color: '#6ea8e0', width: 2.2 }, { name: '95th pct', x: xs, y: ag.pct[95], color: '#6ea8e0', width: 1, dash: [3, 3] }, { name: '5th pct', x: xs, y: ag.pct[5], color: '#6ea8e0', width: 1, dash: [3, 3] },
        { name: 'Expected (theory)', x: xs, y: xs.map((x) => B + ev.evHr * x), color: '#d6a85a', width: 1.6, dash: [6, 4] }],
      refLines: [{ y: B, color: '#5d6c7b' }], yFmt: (v) => fmt.money(v), xFmt: (v) => v.toFixed(0) + 'h', xLabel: 'Hours played',
    });
    // chart 3 histogram, chart 4 ruin
    const c3 = h('canvas', { class: 'chart' }), c4 = h('canvas', { class: 'chart' });
    out.append(h('div', { class: 'grid g2' },
      card('Final bankroll distribution', `After ${hours} hours.`, c3),
      card('Cumulative risk of ruin', 'Simulated share of runs that went broke by each time vs. the Brownian-motion formula.', c4)));
    const hist = histogram(ag.finals, 28);
    barChart(c3, { labels: hist.counts.map((_, i) => fmt.big(hist.lo + (i + .5) * hist.w)), values: hist.counts.map((c) => c / ag.runs * 100),
      colors: hist.counts.map((_, i) => (hist.lo + (i + .5) * hist.w >= B ? '#4cc9a0' : '#e5707a')), yFmt: (v) => v.toFixed(0) + '%', xLabel: 'Final bankroll ($)' });
    lineChart(c4, {
      series: [{ name: 'Simulated', x: xs, y: Array.from(ag.ruinCum, (v) => v * 100), color: '#e5707a', width: 2.2 },
        { name: 'Formula', x: xs, y: xs.map((x) => tripRuin(ev.mu, ev.variance, B, x * cfg.table.roundsPerHour) * 100), color: '#d6a85a', width: 1.6, dash: [6, 4] }],
      yFmt: (v) => v.toFixed(1) + '%', xFmt: (v) => v.toFixed(0) + 'h', xLabel: 'Hours played', yMin: 0,
    });
  }
  const mini = (a, b, c) => h('div', { class: 'kpi', style: { '--c': '#6ea8e0' } }, h('label', {}, a), h('b', {}, b), h('small', {}, c));

  root.append(h('div', { class: 'stack' },
    card('Monte Carlo bankroll simulation', 'Plays real hands (every card dealt, your deviations, mistakes, count errors, bet spread, costs) many times over to show the spread of possible outcomes. It uses the spread and bankroll from the other tabs.',
      h('div', { class: 'grid g3' },
        num('runs', 'Number of runs', 50, 20000, '1,000 runs is smooth; 5,000+ for tail risk.'),
        num('hours', 'Hours per run', 1, 5000, 'Length of each simulated trip.'),
        num('cp', 'Chart resolution (points)', 20, 400, 'Samples along the time axis.')),
      h('div', { class: 'row' }, runBtn, cancelBtn), prog),
    out));
  return { update() { /* results persist until rerun */ } };
}
