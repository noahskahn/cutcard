// EV calculator, "printed on the felt": hero numbers + two charts; every input lives in small sub-tables.
import { h, fmt, getPath, setPath } from './dom.js';
import { makeField } from './fields.js';
import { lineChart, barChart } from './charts.js';
import { PRESETS, configFromPreset } from '../core/presets.js';
import { SPREAD_PRESETS } from '../analysis/spread.js';
import { aggregateRuns } from '../analysis/runStats.js';
import { TC_MIN, NBINS } from '../core/constants.js';

export function mount(root, app) {
  const F = (s) => makeField(app, s);
  const st = { hours: 200, view: 'profit', mc: null, mcBusy: false, open: null };
  root.innerHTML = '';

  // ---------- header
  const status = h('span', { class: 'evf-status' }, h('i', { class: 'dot' }), h('span', { id: 'statusText' }, 'Ready'));
  app.statusEl = status; app.statusTextEl = status.querySelector('span');
  const useBtn = h('button', { class: 'glass', title: 'Fill in count slips and wrong-play rates from your last training session', onclick: () => app.applySession() }, 'Use my training performance');
  app.evMsg = (m) => { useBtn.textContent = m; setTimeout(() => (useBtn.textContent = 'Use my training performance'), 2200); };
  const menu = h('div', { class: 'evf-menu' });
  const accSel = h('select', {}, [['quick', 'Quick (1M rounds)'], ['standard', 'Standard (4M)'], ['high', 'High (20M)']].map(([v, l]) => h('option', { value: v }, l)));
  accSel.value = app.ui.accuracy;
  accSel.addEventListener('change', () => { app.ui.accuracy = accSel.value; try { localStorage.setItem('cutcard.acc', accSel.value); } catch (e) { /* ignore */ } app.recompute(); });
  const shareBtn = h('button', { onclick: async () => { try { await navigator.clipboard.writeText(app.shareLink()); shareBtn.textContent = 'Link copied ✓'; } catch (e) { shareBtn.textContent = 'Copy failed'; } setTimeout(() => (shareBtn.textContent = 'Copy share link'), 1800); } }, 'Copy share link');
  menu.append(...app.tools.map(([id, title, , sub]) => h('button', { onclick: () => { menu.classList.remove('open'); app.show(id); } }, h('b', {}, title), h('small', {}, sub))),
    h('div', { class: 'evf-menusep' }), h('label', { class: 'evf-menurow' }, 'Simulation accuracy', accSel), shareBtn);
  const moreBtn = h('button', { class: 'glass', onclick: (e) => { e.stopPropagation(); menu.classList.toggle('open'); } }, 'More tools ▾');
  document.addEventListener('click', () => menu.classList.remove('open'));
  const head = h('div', { class: 'evf-head' },
    h('div', { class: 'evf-title' }, h('b', {}, 'EV CALCULATOR'), h('span', { id: 'evGame' })),
    h('div', { class: 'grow' }), status, useBtn, h('div', { class: 'menuwrap' }, moreBtn, menu),
    h('button', { class: 'glass accent', onclick: () => app.closeEV() }, '‹ Back to table'));

  // ---------- hero + secondary metrics
  const verdict = h('div', { class: 'evf-verdict' });
  const hero = h('div', { class: 'evf-hero' });
  const sec = h('div', { class: 'evf-sec' });

  // ---------- charts
  const fanC = h('canvas'), tcC = h('canvas');
  const hoursIn = h('input', { type: 'range', min: 10, max: 1000, step: 10, value: st.hours, class: 'range' });
  const hoursOut = h('b', {}, st.hours + ' h');
  hoursIn.addEventListener('input', () => { st.hours = +hoursIn.value; hoursOut.textContent = st.hours + ' h'; st.mc = null; draw(); });
  const mcNote = h('span', { class: 'evf-note' });
  const mcBtn = h('button', { class: 'glass' }, 'Verify with dealt cards');
  mcBtn.onclick = async () => {
    if (!app.stats || st.mcBusy) return;
    st.mcBusy = true; mcBtn.disabled = true;
    const cfg = app.cfg, cur = app.evalCurrent(), rounds = Math.round(st.hours * cfg.table.roundsPerHour), cp = 60, runs = 300;
    try {
      const parts = await app.pool.runBankroll(app.setup || app.compile(), { runs, rounds, checkpoints: cp, bets: cur.bets, bankroll: cfg.player.bankroll, minBet: cfg.table.minBet,
        perRoundCost: (cfg.costs.hourlyCost || 0) / cfg.table.roundsPerHour, rakePerHand: cfg.costs.rakePerHand || 0, compPct: (cfg.costs.compPct || 0) / 100 },
      (p) => { mcBtn.textContent = `Simulating ${Math.round(p * 100)}%`; }, Date.now() % 100000);
      st.mc = aggregateRuns(parts, runs, cp, rounds, cfg.player.bankroll); st.mcHours = st.hours;
    } catch (e) { mcNote.textContent = 'Stopped.'; }
    st.mcBusy = false; mcBtn.disabled = false; mcBtn.textContent = 'Verify with dealt cards'; draw();
  };
  const seg = h('div', { class: 'seg' }, ...[['profit', 'Profit by count'], ['edge', 'Edge by count'], ['bet', 'Your bets']].map(([k, l]) =>
    h('button', { class: k === st.view ? 'on' : '', 'data-k': k, onclick: () => { st.view = k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); draw(); } }, l)));
  const tcNote = h('div', { class: 'evf-note' });
  const charts = h('div', { class: 'evf-charts' },
    h('div', { class: 'evf-card ch' }, h('div', { class: 'row sp' }, h('h3', {}, 'Bankroll over time'), h('div', { class: 'row' }, h('span', { class: 'evf-note' }, 'Horizon'), hoursIn, hoursOut)),
      h('div', { class: 'cwrap' }, fanC),
      h('div', { class: 'row sp' }, h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#f4efe0' } }), 'Expected'), h('span', {}, h('i', { style: { background: '#4cc9a0' } }), '68% range'), h('span', {}, h('i', { style: { background: '#4cc9a088' } }), '95% range')), h('div', { class: 'row' }, mcNote, mcBtn))),
    h('div', { class: 'evf-card ch' }, h('div', { class: 'row sp' }, h('h3', {}, 'Where the edge comes from'), seg), h('div', { class: 'cwrap' }, tcC), tcNote));

  // ---------- sub-tables (everything editable lives here)
  const presetSel = h('select', {}, h('option', { value: '' }, 'Custom game'), PRESETS.map((p) => h('option', { value: p.id }, `${p.name} — ${p.tag}`)));
  presetSel.addEventListener('change', () => {
    if (!presetSel.value) return;
    const c = configFromPreset(presetSel.value);
    Object.assign(app.cfg, { rules: c.rules, table: c.table, spread: c.spread, preset: c.preset }); app.cfg.player.bankroll = c.player.bankroll;
    app.setCfg(app.cfg);
  });
  const unitIn = h('input', { type: 'number', min: 1, step: 1 });
  unitIn.addEventListener('change', () => { app.cfg.spread.unit = Math.max(1, +unitIn.value || 25); app.change('spread.unit'); });
  const sp = h('div', { class: 'spread10' }), spIn = [], spUsd = [];
  for (let i = 0; i < 10; i++) {
    const inp = h('input', { type: 'number', min: 0, step: 0.5 });
    inp.addEventListener('change', () => { app.cfg.spread.bets[i] = Math.max(0, +inp.value || 0); app.change('spread.bets'); });
    const d = h('small'); spIn.push(inp); spUsd.push(d);
    sp.append(h('div', {}, h('label', {}, i === 0 ? '≤0' : i === 9 ? '9+' : i), inp, d));
  }
  const spreadChips = h('div', { class: 'chips' }, ...['1-4', '1-8', '1-12', '1-16', '1-20', 'Flat'].map((k) =>
    h('button', { class: 'chip', onclick: () => { app.cfg.spread.bets = [...SPREAD_PRESETS[k]]; app.change('spread.bets'); } }, k)));
  const slider = (path, label, max, hint) => {
    const out = h('b', { class: 'sv' }), inp = h('input', { type: 'range', min: 0, max, step: 0.5, class: 'range' });
    inp.addEventListener('input', () => { out.textContent = inp.value + '%'; });
    inp.addEventListener('change', () => { setPath(app.cfg, path, +inp.value / 100); app.change(path); });
    const reg = { path, set: () => { inp.value = +(getPath(app.cfg, path) * 100).toFixed(2); out.textContent = inp.value + '%'; } }; app.fields.push(reg); reg.set();
    return h('div', { class: 'sl' }, h('div', { class: 'row sp' }, h('label', { title: hint }, label), out), inp);
  };
  const sessNote = h('div', { class: 'sessnote', hidden: true });
  const link = (txt, id) => h('button', { class: 'link', onclick: () => app.show(id) }, txt);
  const panels = {
    game: ['Game', h('div', {}, h('div', { class: 'mini3' }, h('div', { class: 'field' }, h('label', {}, 'Preset'), presetSel),
      F({ path: 'rules.decks', label: 'Decks', type: 'select', options: [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']] }),
      F({ path: 'rules.h17', label: 'Dealer hits soft 17', type: 'bool' }),
      F({ path: 'rules.bjPay', label: 'Blackjack pays', type: 'select', options: [[1.5, '3:2'], [1.2, '6:5'], [1.4, '7:5'], [1, '1:1'], [2, '2:1']] }),
      F({ path: 'rules.surrender', label: 'Surrender', type: 'select', options: [['none', 'None'], ['late', 'Late'], ['early', 'Early']] }),
      F({ path: 'rules.penetration', label: 'Penetration %', scale: 100, min: 30, max: 95, disabledIf: (c) => c.rules.csm }),
      F({ path: 'table.roundsPerHour', label: 'Hands per hour', min: 20, max: 300 }),
      F({ path: 'table.minBet', label: 'Table minimum ($)', min: 1 }), F({ path: 'table.maxBet', label: 'Table maximum ($)', min: 1 })),
    link('All rules, other players, paste/copy table rules →', 'game'))],
    spread: ['Bet spread', h('div', {}, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('label', { class: 'u' }, '1 unit = $'), unitIn, spreadChips), sp, h('p', { class: 'evf-note' }, 'Units bet at each true count (≤0 up to 9+). Dollars shown under each box after table limits.'), link('What spread is ideal for my bankroll? →', 'ideal'))],
    skill: ['Skill', h('div', {}, sessNote, h('div', { class: 'mini3' },
      F({ path: 'player.deviations', label: 'Plays', type: 'select', options: [['none', 'Basic strategy only'], ['insurance', '+ insurance'], ['i18', '+ Illustrious 18'], ['i18fab4', '+ I18 & Fab 4'], ['full', '+ extended chart set'], ['engine', 'Everything (engine set)']] }),
      slider('player.countErrorRate', 'Count slips / round', 20, 'Chance each round your running count slips by ±1'),
      slider('player.mistakeRate', 'Wrong plays / decision', 20, 'Chance you play the wrong move')), link('Rounding, deck estimation, back-counting, per-play toggles →', 'player'))],
    bank: ['Bankroll & costs', h('div', {}, h('div', { class: 'mini3' },
      F({ path: 'player.bankroll', label: 'Bankroll ($)', min: 100, step: 500 }),
      F({ path: 'costs.hourlyCost', label: 'Fixed cost / hour ($)', min: 0 }), F({ path: 'costs.rakePerHand', label: 'Rake per hand ($)', min: 0, step: 0.05 }),
      F({ path: 'costs.winCommission', label: 'Commission on wins (%)', min: 0, max: 20, step: 0.5 }), F({ path: 'costs.compPct', label: 'Comps (% of wagers)', min: 0, max: 5, step: 0.05 })),
    link('Ideal bets for this bankroll →', 'ideal'))],
  };
  const drawer = h('div', { class: 'evf-drawer' });
  const tabBtns = {};
  const openPanel = (k) => {
    st.open = st.open === k ? null : k;
    drawer.innerHTML = '';
    if (st.open) drawer.append(h('div', { class: 'evf-drawerhead' }, h('b', {}, panels[st.open][0]), h('button', { class: 'glass', onclick: () => openPanel(st.open) }, 'Done')), panels[st.open][1]);
    drawer.classList.toggle('open', !!st.open);
    Object.entries(tabBtns).forEach(([kk, b]) => b.classList.toggle('on', kk === st.open));
  };
  const bankIn = F({ path: 'player.bankroll', label: 'Bankroll', min: 100, step: 500 });
  const dock = h('div', { class: 'evf-dock' },
    h('div', { class: 'evf-quick' }, bankIn, h('div', { class: 'evf-spreadq' }, h('label', {}, 'Spread'), h('div', { class: 'chips' }, ...['1-4', '1-8', '1-12', '1-16'].map((k) => h('button', { class: 'chip', 'data-k': k, onclick: () => { app.cfg.spread.bets = [...SPREAD_PRESETS[k]]; app.change('spread.bets'); } }, k))))),
    h('div', { class: 'evf-tabs' }, ...Object.entries(panels).map(([k, [t]]) => { const b = h('button', { class: 'evf-tab', onclick: () => openPanel(k) }, t); tabBtns[k] = b; return b; })));

  root.append(h('div', { class: 'evf' }, head, verdict, hero, sec, charts, h('div', { class: 'evf-bottom' }, drawer, dock)));

  const heroCard = (label, value, sub, cls) => h('div', { class: 'evf-h ' + (cls || '') }, h('label', {}, label), h('b', {}, value), h('small', {}, sub));
  const secItem = (l, v) => h('div', {}, h('label', {}, l), h('b', {}, v));

  function draw() {
    const c = app.cfg;
    presetSel.value = c.preset || '';
    const p = PRESETS.find((x) => x.id === c.preset);
    document.getElementById('evGame').textContent = p ? p.name : 'Custom game';
    unitIn.value = c.spread.unit;
    sessNote.hidden = !app.sessionNote; sessNote.textContent = app.sessionNote || '';
    const cur = app.evalCurrent();
    spIn.forEach((i, k) => { if (document.activeElement !== i) i.value = c.spread.bets[k]; });
    if (cur) spUsd.forEach((d, k) => { d.textContent = '$' + Math.round(cur.bets[Math.max(0, Math.min(NBINS - 1, k - TC_MIN))]); });
    dock.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', SPREAD_PRESETS[b.dataset.k]?.join(',') === c.spread.bets.join(',')));
    if (!cur) { verdict.textContent = 'Crunching millions of simulated hands…'; verdict.className = 'evf-verdict'; return; }
    const e = cur.ev, B = c.player.bankroll, H = st.hours;
    const good = e.evHr > 0 && e.ror < 0.05, ok = e.evHr > 0;
    verdict.className = 'evf-verdict ' + (good ? 'good' : ok ? 'warn' : 'bad');
    verdict.textContent = e.evHr <= 0 ? `Not beatable with this setup: expect to lose about ${fmt.money(-e.evHr)} per hour even while counting.`
      : `Expect to win about ${fmt.money(e.evHr)} per hour — with ${fmt.money(B)} there is a ${fmt.pct(e.ror, 1)} chance of going broke${good ? ' (acceptable).' : e.ror > 0.2 ? ' (too risky — raise the bankroll or shrink the spread).' : '.'}`;
    hero.innerHTML = '';
    hero.append(
      heroCard('EV per hour', fmt.money(e.evHr, 2), `${fmt.money(e.evHr / Math.max(1, e.handsPlayedHr) * 100, 2)} per 100 hands · ${fmt.num(e.handsPlayedHr, 0)} hands/hr`, e.evHr > 0 ? 'pos' : 'neg'),
      heroCard('Risk of ruin', e.evRound > 0 ? fmt.pct(e.ror, 1) : '100%', `bankroll ${fmt.money(B)}`, e.ror > 0.05 ? 'neg' : 'pos'),
      heroCard('Your edge vs. house', fmt.pct(e.edgePct / 100, 2), `house edge ${fmt.pct(-app.baseEdge, 2)} at a neutral count`, e.edgePct > 0 ? 'pos' : 'neg'));
    sec.innerHTML = '';
    sec.append(secItem('Swing (1σ / hr)', fmt.money(e.sdHr)), secItem('Average bet', fmt.money(e.avgBet)), secItem('Hours to 95% sure profit', fmt.hours(e.n95Hours)),
      secItem('Bankroll for 5% risk', fmt.money(e.evRound > 0 ? (-Math.log(0.05) * e.variance) / (2 * e.evRound) : Infinity)),
      secItem('Bankroll for 1% risk', fmt.money(e.evRound > 0 ? (-Math.log(0.01) * e.variance) / (2 * e.evRound) : Infinity)), secItem('N0 (hands)', fmt.big(e.n0)));
    // fan
    const xs = Array.from({ length: 61 }, (_, i) => (i / 60) * H);
    const mean = xs.map((x) => B + e.evHr * x), sd = xs.map((x) => e.sdHr * Math.sqrt(x));
    const lo = (k) => xs.map((_, i) => Math.max(0, mean[i] - k * sd[i])), hi = (k) => xs.map((_, i) => mean[i] + k * sd[i]);
    const series = [{ name: 'Expected', x: xs, y: mean, color: '#f4efe0', width: 2.4 }];
    if (st.mc && st.mcHours === H) {
      const m = st.mc, mx = Array.from({ length: m.W }, (_, i) => (i / m.cp) * H);
      for (let r = 0; r < Math.min(8, m.runs); r++) series.push({ name: 'Run ' + (r + 1), x: mx, y: Array.from({ length: m.W }, (_, k) => m.traj[r * m.W + k]), color: ['#6ea8e0', '#a592da', '#d6a85a', '#e0955f', '#7fcfb4', '#e5707a', '#9cc3e8', '#bfaee6'][r], width: 1, alpha: 0.7, tip: false });
      series.push({ name: 'Simulated average', x: mx, y: m.mean, color: '#d6a85a', width: 2 });
      mcNote.textContent = `300 real runs: ${fmt.pct(m.profit, 0)} ended in profit, ${fmt.pct(m.ruinProb, 1)} went broke.`;
    } else mcNote.textContent = st.mc ? '' : 'Analytic projection';
    lineChart(fanC, { bands: [{ x: xs, lo: lo(2), hi: hi(2), color: '#4cc9a0', alpha: 0.12 }, { x: xs, lo: lo(1), hi: hi(1), color: '#4cc9a0', alpha: 0.24 }], series, refLines: [{ y: B, color: '#d6a85a' }], yMin: 0, yFmt: (v) => fmt.money(v), xFmt: (v) => v.toFixed(0) + 'h' });
    // by count
    const s = app.stats, labels = [], vals = [], errs = [], line = [], cols = [], rph = c.table.roundsPerHour;
    for (let i = 0; i < NBINS; i++) {
      const tc = i + TC_MIN; if (tc < -4 || tc > 10) continue;
      labels.push(String(tc));
      if (st.view === 'edge') { vals.push(s.rawMu[i] * 100); errs.push(s.se[i] * 100); line.push(s.fit[i] * 100); cols.push(s.n[i] < 3000 ? '#5d6c7b' : s.rawMu[i] >= 0 ? '#4cc9a0' : '#e5707a'); }
      else if (st.view === 'bet') { vals.push(cur.bets[i]); cols.push('#6ea8e0'); }
      else { const v = cur.bets[i] * s.f[i] * s.mu[i] * rph; vals.push(v); cols.push(v >= 0 ? '#4cc9a0' : '#e5707a'); }
    }
    barChart(tcC, st.view === 'edge' ? { labels, values: vals, errs, colors: cols, line: { values: line, color: '#d6a85a' }, yFmt: (v) => v.toFixed(1) + '%', xLabel: 'True count' } : { labels, values: vals, colors: cols, yFmt: (v) => fmt.money(v), xLabel: 'True count' });
    tcNote.textContent = { profit: 'Dollars per hour earned at each count under your spread — big bets at high counts pay the bills.', edge: 'Average edge per dollar bet at each count. Each +1 count is worth about +0.5%.', bet: 'The bet you place at each count, after table limits.' }[st.view];
  }
  app.on('cfg', () => { st.mc = null; if (!root.closest('[hidden]')) draw(); });
  app.on('stats', draw); app.on('analysis', draw);
  draw();
  return { update: draw, redraw: draw };
}
