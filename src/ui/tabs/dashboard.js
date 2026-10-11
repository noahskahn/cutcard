// Home dashboard: the essentials (game, spread, skill, bankroll) + live analysis, no scrolling.
import { h, fmt } from '../dom.js';
import { makeField } from '../fields.js';
import { lineChart, barChart } from '../charts.js';
import { PRESETS, configFromPreset } from '../../core/presets.js';
import { SPREAD_PRESETS } from '../../analysis/spread.js';
import { aggregateRuns } from '../../analysis/runStats.js';
import { TC_MIN, NBINS } from '../../core/constants.js';
import { getPath, setPath } from '../dom.js';

export function mount(root, app) {
  const F = (s) => makeField(app, s);
  const st = { hours: 200, view: 'profit', mc: null, mcBusy: false };

  // ---------- left: controls ----------
  const presetSel = h('select', { class: 'wide' }, h('option', { value: '' }, 'Custom game'), PRESETS.map((p) => h('option', { value: p.id }, `${p.name} — ${p.tag}`)));
  presetSel.addEventListener('change', () => {
    if (!presetSel.value) return;
    const c = configFromPreset(presetSel.value);
    Object.assign(app.cfg, { rules: c.rules, table: c.table, spread: c.spread, preset: c.preset });
    app.cfg.player.bankroll = c.player.bankroll;
    app.setCfg(app.cfg);
  });
  const blurb = h('div', { class: 'blurb' });

  const slider = (path, label, max, step, hint) => {
    const out = h('b', { class: 'sv' });
    const inp = h('input', { type: 'range', min: 0, max, step, class: 'range' });
    inp.addEventListener('input', () => { out.textContent = inp.value + '%'; });
    inp.addEventListener('change', () => { setPath(app.cfg, path, +inp.value / 100); app.change(path); });
    app.fields.push({ path, set: () => { inp.value = +(getPath(app.cfg, path) * 100).toFixed(2); out.textContent = inp.value + '%'; } });
    app.fields[app.fields.length - 1].set();
    return h('div', { class: 'sl' }, h('div', { class: 'row sp' }, h('label', { title: hint }, label), out), inp);
  };

  const unitIn = h('input', { type: 'number', min: 1, step: 1 });
  unitIn.addEventListener('change', () => { app.cfg.spread.unit = Math.max(1, +unitIn.value || 25); app.change('spread.unit'); });
  const sp = h('div', { class: 'spread10' });
  const spIn = [], spUsd = [];
  for (let i = 0; i < 10; i++) {
    const inp = h('input', { type: 'number', min: 0, step: 0.5 });
    inp.addEventListener('change', () => { app.cfg.spread.bets[i] = Math.max(0, +inp.value || 0); app.change('spread.bets'); });
    const d = h('small'); spIn.push(inp); spUsd.push(d);
    sp.append(h('div', {}, h('label', {}, i === 0 ? '≤0' : i === 9 ? '9+' : i), inp, d));
  }
  const spreadBtns = h('div', { class: 'chips' }, ...['1-4', '1-8', '1-12', '1-16', 'Flat'].map((k) =>
    h('button', { class: 'chip', onclick: () => { app.cfg.spread.bets = [...SPREAD_PRESETS[k]]; app.change('spread.bets'); } }, k)));

  const left = h('aside', { class: 'side' },
    h('section', { class: 'blk' }, h('h4', {}, '1 · Game'), presetSel,
      h('div', { class: 'mini' },
        F({ path: 'rules.decks', label: 'Decks', type: 'select', options: [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']] }),
        F({ path: 'rules.h17', label: 'Dealer hits soft 17', type: 'bool' }),
        F({ path: 'rules.bjPay', label: 'Blackjack pays', type: 'select', options: [[1.5, '3:2'], [1.2, '6:5'], [1.4, '7:5'], [1, '1:1'], [2, '2:1']] }),
        F({ path: 'rules.surrender', label: 'Surrender', type: 'select', options: [['none', 'None'], ['late', 'Late'], ['early', 'Early']] }),
        F({ path: 'rules.penetration', label: 'Penetration %', scale: 100, min: 30, max: 95, disabledIf: (c) => c.rules.csm }),
        F({ path: 'table.roundsPerHour', label: 'Hands per hour', min: 20, max: 300 })),
      h('button', { class: 'link', onclick: () => app.show('game') }, 'All rules, table limits, costs & paste/copy rules →')),
    h('section', { class: 'blk' }, h('h4', {}, '2 · Bet spread ', h('small', {}, 'units bet at each true count')),
      h('div', { class: 'row', style: { marginBottom: '6px' } }, h('label', { class: 'u' }, '1 unit = $'), unitIn, spreadBtns), sp),
    h('section', { class: 'blk' }, h('h4', {}, '3 · Your skill'),
      F({ path: 'player.deviations', label: 'Plays', type: 'select', options: [['none', 'Basic strategy only'], ['insurance', '+ insurance'], ['i18', '+ Illustrious 18'], ['i18fab4', '+ I18 & Fab 4'], ['engine', 'Everything (engine set)']] }),
      h('div', { class: 'two' }, slider('player.countErrorRate', 'Count slips / round', 20, 0.5, 'Chance each round your running count slips by ±1'),
        slider('player.mistakeRate', 'Wrong plays / decision', 20, 0.5, 'Chance you play the wrong move')),
      h('button', { class: 'link', onclick: () => app.show('player') }, 'More skill settings →')),
    h('section', { class: 'blk' }, h('h4', {}, '4 · Bankroll'),
      F({ path: 'player.bankroll', label: 'Bankroll ($)', min: 100, step: 500 }),
      h('button', { class: 'link', onclick: () => app.show('ideal') }, 'What spread is ideal for this bankroll? →')));

  // ---------- right: analysis ----------
  const verdict = h('div', { class: 'verdict' });
  const kpis = h('div', { class: 'kpis2' });
  const fanCanvas = h('canvas'), tcCanvas = h('canvas');
  const hoursIn = h('input', { type: 'range', min: 10, max: 1000, step: 10, value: st.hours, class: 'range' });
  const hoursOut = h('b', {}, st.hours + ' h');
  hoursIn.addEventListener('input', () => { st.hours = +hoursIn.value; hoursOut.textContent = st.hours + ' h'; st.mc = null; draw(); });
  const mcBtn = h('button', { class: 'btn small' }, 'Verify with dealt cards');
  const mcNote = h('span', { class: 'sub' });
  mcBtn.onclick = async () => {
    if (!app.stats || st.mcBusy) return;
    st.mcBusy = true; mcBtn.disabled = true;
    const cfg = app.cfg, cur = app.evalCurrent(), rounds = Math.round(st.hours * cfg.table.roundsPerHour), cp = 60, runs = 300;
    try {
      const parts = await app.pool.runBankroll(app.setup || app.compile(), { runs, rounds, checkpoints: cp, bets: cur.bets, bankroll: cfg.player.bankroll, minBet: cfg.table.minBet,
        perRoundCost: (cfg.costs.hourlyCost || 0) / cfg.table.roundsPerHour, rakePerHand: cfg.costs.rakePerHand || 0, compPct: (cfg.costs.compPct || 0) / 100 },
      (p) => { mcBtn.textContent = `Simulating ${Math.round(p * 100)}%`; }, Date.now() % 100000);
      st.mc = aggregateRuns(parts, runs, cp, rounds, cfg.player.bankroll);
      st.mcHours = st.hours;
    } catch (e) { mcNote.textContent = 'Stopped.'; }
    st.mcBusy = false; mcBtn.disabled = false; mcBtn.textContent = 'Verify with dealt cards'; draw();
  };
  const seg = h('div', { class: 'seg' }, ...[['profit', 'Profit by count'], ['edge', 'Edge by count'], ['bet', 'Your bets']].map(([k, l]) =>
    h('button', { class: k === st.view ? 'on' : '', 'data-k': k, onclick: () => { st.view = k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); draw(); } }, l)));

  const right = h('section', { class: 'main2' }, verdict, kpis,
    h('div', { class: 'charts' },
      h('div', { class: 'card ch' }, h('div', { class: 'row sp' }, h('h3', {}, 'Bankroll over time'), h('div', { class: 'row' }, h('span', { class: 'sub' }, 'Horizon'), hoursIn, hoursOut)), h('div', { class: 'cwrap' }, fanCanvas),
        h('div', { class: 'row sp' }, h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#e6edf3' } }), 'Expected'), h('span', {}, h('i', { style: { background: '#4cc9a0' } }), '68% range (±1σ)'), h('span', {}, h('i', { style: { background: '#4cc9a088' } }), '95% range (±2σ)')),
          h('div', { class: 'row' }, mcNote, mcBtn))),
      h('div', { class: 'card ch' }, h('div', { class: 'row sp' }, h('h3', {}, 'Where the edge comes from'), seg), h('div', { class: 'cwrap' }, tcCanvas), h('div', { class: 'sub', id: 'tcNote' }))));
  root.append(h('div', { class: 'dash' }, left, right));

  const kpi = (l, v, s, c, cls) => h('div', { class: 'k', style: { '--c': c } }, h('label', {}, l), h('b', { class: cls || '' }, v), h('small', {}, s));

  function draw() {
    const c = app.cfg;
    presetSel.value = c.preset || '';
    const p = PRESETS.find((x) => x.id === c.preset);
    presetSel.title = p ? p.blurb : 'Custom rules';
    unitIn.value = c.spread.unit;
    const cur = app.evalCurrent();
    spIn.forEach((i, k) => { if (document.activeElement !== i) i.value = c.spread.bets[k]; });
    if (cur) spUsd.forEach((d, k) => { d.textContent = '$' + Math.round(cur.bets[Math.max(0, Math.min(NBINS - 1, k - TC_MIN))]); });
    if (!cur) { verdict.textContent = 'Crunching millions of simulated hands…'; verdict.className = 'verdict'; return; }
    const e = cur.ev, B = c.player.bankroll, H = st.hours;
    const good = e.evHr > 0 && e.ror < 0.05, ok = e.evHr > 0;
    verdict.className = 'verdict ' + (good ? 'good' : ok ? 'warn' : 'bad');
    verdict.textContent = e.evHr <= 0
      ? `Not beatable with this setup: you lose about ${fmt.money(-e.evHr)} per hour even with counting.`
      : `You win about ${fmt.money(e.evHr)} per hour on average — but with ${fmt.money(B)} there is a ${fmt.pct(e.ror, 1)} chance of going broke${good ? ' (acceptable).' : e.ror > 0.2 ? ' (too risky — raise bankroll or shrink the spread).' : '.'}`;
    kpis.innerHTML = '';
    kpis.append(
      kpi('Win / hour', fmt.money(e.evHr, 2), `${fmt.money(e.evHr / Math.max(1, e.handsPlayedHr) * 100, 2)} per 100 hands`, '#4cc9a0', fmt.signCls(e.evHr)),
      kpi('Swing (1σ / hour)', fmt.money(e.sdHr), `N0 ${fmt.big(e.n0)} hands`, '#d6a85a'),
      kpi('Risk of ruin', e.evRound > 0 ? fmt.pct(e.ror, 1) : '100%', `bankroll ${fmt.money(B)}`, '#e5707a', e.ror > 0.05 ? 'neg' : 'pos'),
      kpi('Hours to 95% sure profit', fmt.hours(e.n95Hours), `${fmt.big(e.n95Rounds)} hands`, '#a592da'),
      kpi('Edge vs. house', fmt.pct(e.edgePct / 100, 2), `house edge ${fmt.pct(-app.baseEdge, 2)} · avg bet ${fmt.money(e.avgBet)}`, '#6ea8e0', fmt.signCls(e.edgePct)));
    // fan chart
    const xs = Array.from({ length: 61 }, (_, i) => (i / 60) * H);
    const mean = xs.map((x) => B + e.evHr * x), sd = xs.map((x) => e.sdHr * Math.sqrt(x));
    const lo = (k) => xs.map((_, i) => Math.max(0, mean[i] - k * sd[i])), hi = (k) => xs.map((_, i) => mean[i] + k * sd[i]);
    const series = [{ name: 'Expected', x: xs, y: mean, color: '#e6edf3', width: 2.4 }];
    if (st.mc && st.mcHours === H) {
      const m = st.mc, mx = Array.from({ length: m.W }, (_, i) => (i / m.cp) * H);
      for (let r = 0; r < Math.min(8, m.runs); r++) series.push({ name: 'Run ' + (r + 1), x: mx, y: Array.from({ length: m.W }, (_, k) => m.traj[r * m.W + k]), color: ['#6ea8e0', '#a592da', '#d6a85a', '#e0955f', '#7fcfb4', '#e5707a', '#9cc3e8', '#bfaee6'][r], width: 1, alpha: 0.7, tip: false });
      series.push({ name: 'Simulated average', x: mx, y: m.mean, color: '#d6a85a', width: 2 });
      mcNote.textContent = `300 real runs: ${fmt.pct(m.profit, 0)} ended in profit, ${fmt.pct(m.ruinProb, 1)} went broke.`;
    } else mcNote.textContent = st.mc ? '' : 'Analytic projection';
    lineChart(fanCanvas, { bands: [{ x: xs, lo: lo(2), hi: hi(2), color: '#4cc9a0', alpha: 0.10 }, { x: xs, lo: lo(1), hi: hi(1), color: '#4cc9a0', alpha: 0.22 }], series, refLines: [{ y: B, color: '#d6a85a' }], yMin: 0, yFmt: (v) => fmt.money(v), xFmt: (v) => v.toFixed(0) + 'h' });
    // TC chart
    const s = app.stats, labels = [], vals = [], errs = [], line = [], cols = [];
    const rph = c.table.roundsPerHour;
    for (let i = 0; i < NBINS; i++) {
      const tc = i + TC_MIN; if (tc < -4 || tc > 10) continue;
      labels.push(String(tc));
      if (st.view === 'edge') { vals.push(s.rawMu[i] * 100); errs.push(s.se[i] * 100); line.push(s.fit[i] * 100); cols.push(s.n[i] < 3000 ? '#5d6c7b' : s.rawMu[i] >= 0 ? '#4cc9a0' : '#e5707a'); }
      else if (st.view === 'bet') { vals.push(cur.bets[i]); cols.push('#6ea8e0'); }
      else { const v = cur.bets[i] * s.f[i] * s.mu[i] * rph; vals.push(v); cols.push(v >= 0 ? '#4cc9a0' : '#e5707a'); }
    }
    barChart(tcCanvas, st.view === 'edge' ? { labels, values: vals, errs, colors: cols, line: { values: line, color: '#d6a85a' }, yFmt: (v) => v.toFixed(1) + '%', xLabel: 'True count' }
      : { labels, values: vals, colors: cols, yFmt: (v) => fmt.money(v), xLabel: 'True count (higher = more big cards left)' });
    document.getElementById('tcNote').textContent = { profit: 'Dollars per hour earned at each count under your spread — big bets at high counts pay the bills.', edge: 'Your average edge per $ bet at each count. Each +1 count ≈ +0.5%. Gold = trend line.', bet: 'The bet you place at each count (after table limits).' }[st.view];
  }
  app.on('cfg', () => { st.mc = null; draw(); });
  app.on('stats', draw); app.on('analysis', draw);
  draw();
  return { update: draw };
}
