// EV calculator, "set into the felt": three headline numbers + simulated bankroll lines.
// Everything editable lives in the pop-up menu at the bottom (rules, spread, skill, bankroll, and the detailed tools).
import { h, fmt, getPath, setPath, debounce } from './dom.js';
import { makeField } from './fields.js';
import { lineChart } from './charts.js';
import { PRESETS, configFromPreset } from '../core/presets.js';
import { SPREAD_PRESETS } from '../analysis/spread.js';
import { aggregateRuns } from '../analysis/runStats.js';
import { SimPool } from '../sim/pool.js';
import { TC_MIN, NBINS } from '../core/constants.js';

const MC_RUNS = 80, MC_SHOW = 16;

export function mount(root, app) {
  const F = (s) => makeField(app, s);
  const st = { hours: 200, open: null, mc: null, mcSeq: 0, mcBusy: false };
  const mcPool = new SimPool(Math.min(4, (navigator.hardwareConcurrency || 4)));
  root.innerHTML = '';

  // ---------- header
  const status = h('span', { class: 'evf-status' }, h('i', { class: 'dot' }), h('span', {}, 'Ready'));
  app.statusEl = status; app.statusTextEl = status.lastChild;
  const head = h('div', { class: 'evf-head' },
    h('button', { class: 'glass', onclick: () => app.closeEV() }, '‹ Back to table'),
    h('div', { class: 'evf-title' }, h('b', {}, 'EV CALCULATOR'), h('span', { id: 'evGame' })), h('div', { class: 'grow' }), status);

  // ---------- left: headline numbers + simple setup
  const hero = h('div', { class: 'evf-hero' });
  const sec = h('div', { class: 'evf-sec' });
  const presetSel = h('select', {}, h('option', { value: '' }, 'Custom game'), PRESETS.map((p) => h('option', { value: p.id }, p.name)));
  presetSel.addEventListener('change', () => {
    if (!presetSel.value) return;
    const c = configFromPreset(presetSel.value);
    Object.assign(app.cfg, { rules: c.rules, table: c.table, spread: c.spread, preset: c.preset }); app.cfg.player.bankroll = c.player.bankroll;
    app.setCfg(app.cfg);
  });
  const unitIn = h('input', { type: 'number', min: 1, step: 1 });
  unitIn.addEventListener('change', () => { app.cfg.spread.unit = Math.max(1, +unitIn.value || 25); app.change('spread.unit'); });
  const chipBtn = (k) => h('button', { class: 'chip', 'data-k': k, onclick: () => { app.cfg.spread.bets = [...SPREAD_PRESETS[k]]; app.change('spread.bets'); } }, k);
  const spreadSummary = h('div', { class: 'evf-note' });
  const setup = h('div', { class: 'evf-setup' },
    h('div', { class: 'evf-row' }, h('label', {}, 'Ruleset'), presetSel),
    F({ path: 'player.bankroll', label: 'Bankroll ($)', min: 100, step: 500 }),
    h('div', { class: 'evf-row' }, h('label', {}, 'Bet spread'), h('div', { class: 'chips' }, ['1-4', '1-8', '1-12', '1-16'].map(chipBtn))),
    h('div', { class: 'evf-row' }, h('label', {}, '1 unit ($)'), unitIn), spreadSummary,
    h('p', { class: 'evf-note' }, 'Open the menu below for every rule, spread box, skill setting and tool.'));
  const left = h('div', { class: 'evf-left' }, hero, sec, setup);

  // ---------- right: bankroll over time with real simulated runs
  const fanC = h('canvas');
  const hoursOut = h('b', {}, st.hours + ' h');
  const hoursIn = h('input', { type: 'range', min: 25, max: 1000, step: 25, value: st.hours, class: 'range' });
  hoursIn.addEventListener('input', () => { st.hours = +hoursIn.value; hoursOut.textContent = st.hours + ' h'; st.mc = null; draw(); scheduleMC(); });
  const mcNote = h('span', { class: 'evf-note' });
  const chartCard = h('div', { class: 'evf-card ch' },
    h('div', { class: 'row sp' }, h('div', {}, h('h3', {}, 'Expected bankroll over time'), h('div', { class: 'evf-note' }, `${MC_RUNS} real dealt-card runs vs. the expected curve`)),
      h('div', { class: 'row' }, h('span', { class: 'evf-note' }, 'Hours'), hoursIn, hoursOut)),
    h('div', { class: 'cwrap' }, fanC),
    h('div', { class: 'row sp' }, h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: '#f2f6f3' } }), 'Average of runs'), h('span', {}, h('i', { style: { background: '#7ad4b4' } }), 'Single runs'), h('span', {}, h('i', { style: { background: '#4cc9a055' } }), 'Typical range'), h('span', {}, h('i', { style: { background: '#f2f6f3', opacity: 0.5 } }), 'Theory')), mcNote));

  // ---------- pop-up menu (bottom): editors + detailed tools, each with a title and Back button
  const sessNote = h('div', { class: 'sessnote', hidden: true });
  const unitIn2 = h('input', { type: 'number', min: 1, step: 1 });
  unitIn2.addEventListener('change', () => { app.cfg.spread.unit = Math.max(1, +unitIn2.value || 25); app.change('spread.unit'); });
  const sp = h('div', { class: 'spread10' }), spIn = [], spUsd = [];
  for (let i = 0; i < 10; i++) {
    const inp = h('input', { type: 'number', min: 0, step: 0.5 });
    inp.addEventListener('change', () => { app.cfg.spread.bets[i] = Math.max(0, +inp.value || 0); app.change('spread.bets'); });
    const d = h('small'); spIn.push(inp); spUsd.push(d);
    sp.append(h('div', {}, h('label', {}, i === 0 ? 'TC ≤0' : i === 9 ? 'TC 9+' : 'TC ' + i), inp, d));
  }
  const slider = (path, label, max, hint) => {
    const out = h('b', { class: 'sv' }), inp = h('input', { type: 'range', min: 0, max, step: 0.5, class: 'range' });
    inp.addEventListener('input', () => { out.textContent = inp.value + '%'; });
    inp.addEventListener('change', () => { setPath(app.cfg, path, +inp.value / 100); app.change(path); });
    const reg = { path, set: () => { inp.value = +(getPath(app.cfg, path) * 100).toFixed(2); out.textContent = inp.value + '%'; } }; app.fields.push(reg); reg.set();
    return h('div', { class: 'sl' }, h('div', { class: 'row sp' }, h('label', { title: hint }, label), out), h('div', { class: 'evf-note' }, hint), inp);
  };
  const go = (txt, id) => h('button', { class: 'link', onclick: () => openPanel(id) }, txt);
  const PANELS = {
    game: ['Game rules', 'The table you are playing: decks, dealer rules, payout, penetration and limits', () => h('div', {}, h('div', { class: 'mini3' },
      h('div', { class: 'field' }, h('label', {}, 'Ruleset'), (() => { const s = presetSel.cloneNode(true); s.value = app.cfg.preset || ''; s.addEventListener('change', () => { presetSel.value = s.value; presetSel.dispatchEvent(new Event('change')); }); return s; })()),
      F({ path: 'rules.decks', label: 'Decks', type: 'select', options: [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']] }),
      F({ path: 'rules.h17', label: 'Dealer hits soft 17', type: 'bool' }),
      F({ path: 'rules.bjPay', label: 'Blackjack pays', type: 'select', options: [[1.5, '3:2'], [1.2, '6:5'], [1.4, '7:5'], [1, '1:1'], [2, '2:1']] }),
      F({ path: 'rules.surrender', label: 'Surrender', type: 'select', options: [['none', 'None'], ['late', 'Late'], ['early', 'Early']] }),
      F({ path: 'rules.penetration', label: 'Penetration %', scale: 100, min: 30, max: 95, disabledIf: (c) => c.rules.csm }),
      F({ path: 'table.roundsPerHour', label: 'Hands per hour', min: 20, max: 300 }),
      F({ path: 'table.minBet', label: 'Table minimum ($)', min: 1 }), F({ path: 'table.maxBet', label: 'Table maximum ($)', min: 1 })),
    go('Every rule, other players, copy/paste table rules →', 'fullrules'))],
    spread: ['Bet spread', 'How many units you bet at each true count (TC); dollars shown under each box after table limits', () => h('div', {},
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('label', { class: 'u' }, '1 unit = $'), unitIn2, h('div', { class: 'chips' }, ['1-4', '1-8', '1-12', '1-16', '1-20', 'Flat'].map(chipBtn))), sp,
      go('What spread is ideal for my bankroll? →', 'ideal'))],
    skill: ['Player skill', 'Which index plays you use, and how often you slip on the count or play the wrong move', () => h('div', {}, sessNote, h('div', { class: 'mini3' },
      F({ path: 'player.deviations', label: 'Plays', type: 'select', options: [['none', 'Basic strategy only'], ['insurance', '+ insurance'], ['i18', '+ Illustrious 18'], ['i18fab4', '+ I18 & Fab 4'], ['full', '+ extended chart set'], ['engine', 'Everything (engine set)']] }),
      slider('player.countErrorRate', 'Count slips per round', 20, 'Chance each round your running count is off by one'),
      slider('player.mistakeRate', 'Wrong plays per decision', 20, 'Chance you play the wrong move')), go('Rounding, deck estimation, back-counting, per-play switches →', 'skilldetails'))],
    bank: ['Bankroll & costs', 'Your stake, plus anything that eats into (or adds to) your hourly', () => h('div', {}, h('div', { class: 'mini3' },
      F({ path: 'player.bankroll', label: 'Bankroll ($)', min: 100, step: 500 }),
      F({ path: 'costs.hourlyCost', label: 'Fixed cost per hour ($)', min: 0 }), F({ path: 'costs.rakePerHand', label: 'Rake per hand ($)', min: 0, step: 0.05 }),
      F({ path: 'costs.winCommission', label: 'Commission on wins (%)', min: 0, max: 20, step: 0.5 }), F({ path: 'costs.compPct', label: 'Comps (% of wagers)', min: 0, max: 5, step: 0.05 })),
    go('Ideal bets for this bankroll →', 'ideal'))],
  };
  const TOOL = { fullrules: 'game', skilldetails: 'player' };
  const TOOL_META = {
    fullrules: ['Full rules, table & costs', 'Every rule, other players, rake/comps, and copy/paste table-rules text'],
    skilldetails: ['Skill details', 'True-count rounding, deck estimation, back-counting and per-play switches'],
    ideal: ['Ideal bets', 'The best bet spread for your bankroll at a target risk of ruin'],
    sim: ['Simulation', 'Thousands of bankroll runs with confidence bands and ruin curves'],
    whatif: ['What-if', 'Compare count errors, mistakes, penetration, decks and more side by side'],
    results: ['Spread details', 'Every metric, spread comparison and sanity check'],
    strategy: ['Strategy charts', 'Basic strategy generated for your rules, with index plays marked'],
    help: ['Help', 'Glossary, table-rules syntax and how the numbers are produced'],
  };
  const toolMod = Object.fromEntries(app.tools.map(([id, , mod]) => [id, mod]));
  const drawer = h('div', { class: 'evf-drawer' }), tabBtns = {}, built = {};
  const drawerTitle = h('b'), drawerSub = h('span'), drawerBody = h('div', { class: 'evf-drawerbody' });
  drawer.append(h('div', { class: 'evf-drawerhead' }, h('button', { class: 'glass', onclick: () => openPanel(null) }, '‹ Back'), h('div', {}, drawerTitle, drawerSub)), drawerBody);
  function openPanel(k) {
    st.open = k && st.open !== k ? k : null;
    if (!st.open) { drawer.classList.remove('open'); Object.values(tabBtns).forEach((b) => b.classList.remove('on')); return; }
    if (!built[st.open]) {
      const el = h('div');
      if (PANELS[st.open]) el.append(PANELS[st.open][2]());
      else { const mod = toolMod[TOOL[st.open] || st.open]; built[st.open] = { el, api: mod.mount(el, app) }; }
      built[st.open] = built[st.open] || { el };
      built[st.open].el = el; drawerBody.append(el);
    }
    const [title, sub] = PANELS[st.open] ? [PANELS[st.open][0], PANELS[st.open][1]] : TOOL_META[st.open];
    drawerTitle.textContent = title; drawerSub.textContent = sub;
    for (const [id, b] of Object.entries(built)) b.el.style.display = id === st.open ? '' : 'none';
    built[st.open].api && built[st.open].api.update && built[st.open].api.update();
    drawerBody.scrollTop = 0; drawer.classList.add('open');
    Object.entries(tabBtns).forEach(([kk, b]) => b.classList.toggle('on', kk === st.open));
    draw();
  }
  app.evOpenPanel = (id) => { if (id === 'home') openPanel(null); else if (id !== st.open) openPanel(id); };
  app.evClosePanel = () => { if (st.open) { openPanel(null); return true; } return false; };
  const TABS = [['game', 'Game'], ['spread', 'Bet spread'], ['skill', 'Skill'], ['bank', 'Bankroll & costs'], null, ['ideal', 'Ideal bets'], ['sim', 'Simulation'], ['whatif', 'What-if'], ['strategy', 'Strategy charts'], ['results', 'Details'], ['help', 'Help']];
  const tabs = h('div', { class: 'evf-tabs' }, TABS.map((t) => { if (!t) return h('i', { class: 'evf-sep' }); const b = h('button', { class: 'evf-tab', onclick: () => openPanel(t[0]) }, t[1]); tabBtns[t[0]] = b; return b; }));

  root.append(h('div', { class: 'evf' }, head, h('div', { class: 'evf-main' }, left, chartCard), h('div', { class: 'evf-bottom' }, drawer, h('div', { class: 'evf-dock' }, h('span', { class: 'evf-docklabel' }, 'Edit & explore'), tabs))));

  // ---------- drawing
  const heroCard = (label, value, sub, cls, big) => h('div', { class: 'evf-h ' + (cls || '') + (big ? ' big' : '') }, h('label', {}, label), h('b', {}, value), h('small', {}, sub));
  function draw() {
    const c = app.cfg;
    presetSel.value = c.preset || '';
    const p = PRESETS.find((x) => x.id === c.preset);
    document.getElementById('evGame').textContent = p ? p.name : 'Custom game';
    unitIn.value = unitIn2.value = c.spread.unit;
    sessNote.hidden = !app.sessionNote; sessNote.textContent = app.sessionNote || '';
    const cur = app.evalCurrent();
    spIn.forEach((i, k) => { if (document.activeElement !== i) i.value = c.spread.bets[k]; });
    if (cur) {
      spUsd.forEach((d, k) => { d.textContent = '$' + Math.round(cur.bets[Math.max(0, Math.min(NBINS - 1, k - TC_MIN))]); });
      const played = [...cur.bets].filter((b) => b > 0);
      spreadSummary.textContent = played.length ? `Bets from ${fmt.money(Math.min(...played))} to ${fmt.money(Math.max(...played))} · average ${fmt.money(cur.ev.avgBet)}` : '';
    }
    root.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', SPREAD_PRESETS[b.dataset.k]?.join(',') === c.spread.bets.join(',')));
    if (!cur) { hero.innerHTML = ''; hero.append(h('div', { class: 'evf-note' }, 'Crunching millions of simulated hands…')); return; }
    const e = cur.ev, B = c.player.bankroll, H = st.hours;
    hero.innerHTML = '';
    hero.append(
      heroCard('EV per hour', fmt.money(e.evHr, 2), `${fmt.money(e.evHr / Math.max(1, e.handsPlayedHr) * 100, 2)} per 100 hands`, e.evHr > 0 ? 'pos' : 'neg', true),
      heroCard('Risk of ruin', e.evRound > 0 ? fmt.pct(e.ror, 1) : '100%', `with ${fmt.money(B)}`, e.ror > 0.05 ? 'neg' : 'pos'),
      heroCard('Edge vs. house', fmt.pct(e.edgePct / 100, 2), `house ${fmt.pct(-app.baseEdge, 2)} at neutral`, e.edgePct > 0 ? 'pos' : 'neg'));
    sec.innerHTML = '';
    sec.append(h('div', {}, h('label', {}, 'Swing per hour (1σ)'), h('b', {}, fmt.money(e.sdHr))), h('div', {}, h('label', {}, 'Hours to 95% sure profit'), h('b', {}, fmt.hours(e.n95Hours))),
      h('div', {}, h('label', {}, 'Bankroll for 1% risk'), h('b', {}, fmt.money(e.evRound > 0 ? (-Math.log(0.01) * e.variance) / (2 * e.evRound) : Infinity))));
    // chart: simulated runs + average + range, theory dashed
    const xs = Array.from({ length: 61 }, (_, i) => (i / 60) * H);
    const mean = xs.map((x) => B + e.evHr * x), sd = xs.map((x) => e.sdHr * Math.sqrt(x));
    const theory = { name: 'Theory', x: xs, y: mean, color: '#f2f6f3', width: 1.4, dash: [5, 4], alpha: 0.55 };
    const series = [], bands = [];
    if (st.mc && st.mcHours === H) {
      const m = st.mc, mx = Array.from({ length: m.W }, (_, i) => (i / m.cp) * H);
      bands.push({ x: mx, lo: Array.from(m.mean, (v, i) => Math.max(0, v - m.sd[i])), hi: Array.from(m.mean, (v, i) => v + m.sd[i]), color: '#4cc9a0', alpha: 0.16 });
      for (let r = 0; r < Math.min(MC_SHOW, m.runs); r++) series.push({ name: 'Run ' + (r + 1), x: mx, y: Array.from({ length: m.W }, (_, k) => m.traj[r * m.W + k]), color: '#7ad4b4', width: 1, alpha: 0.5, tip: false });
      series.push({ name: 'Average of runs', x: mx, y: m.mean, color: '#f2f6f3', width: 2.6 });
      mcNote.textContent = `${fmt.pct(m.profit, 0)} of runs finished ahead · ${fmt.pct(m.ruinProb, 1)} went broke`;
    } else {
      bands.push({ x: xs, lo: xs.map((_, i) => Math.max(0, mean[i] - sd[i])), hi: xs.map((_, i) => mean[i] + sd[i]), color: '#4cc9a0', alpha: 0.14 });
      mcNote.textContent = st.mcBusy ? 'Dealing real hands…' : '';
    }
    series.push(theory);
    lineChart(fanC, { bands, series, refLines: [{ y: B, color: '#8fb2a5' }], yMin: 0, yFmt: (v) => fmt.money(v), xFmt: (v) => v.toFixed(0) + 'h' });
  }

  // real simulated runs (own worker pool so the main statistics job is never interrupted)
  async function runMC() {
    if (!app.stats || !app.setup || root.closest('[hidden]')) return;
    const my = ++st.mcSeq; mcPool.cancel(); st.mcBusy = true; draw();
    const cfg = app.cfg, cur = app.evalCurrent(), H = st.hours, rounds = Math.round(H * cfg.table.roundsPerHour), cp = 60;
    try {
      const parts = await mcPool.runBankroll(app.setup, { runs: MC_RUNS, rounds, checkpoints: cp, bets: cur.bets, bankroll: cfg.player.bankroll, minBet: cfg.table.minBet,
        perRoundCost: (cfg.costs.hourlyCost || 0) / cfg.table.roundsPerHour, rakePerHand: cfg.costs.rakePerHand || 0, compPct: (cfg.costs.compPct || 0) / 100 }, null, (Date.now() % 99991) + my);
      if (my !== st.mcSeq) return;
      st.mc = aggregateRuns(parts, MC_RUNS, cp, rounds, cfg.player.bankroll); st.mcHours = H;
    } catch (e) { /* cancelled */ }
    if (my === st.mcSeq) { st.mcBusy = false; draw(); }
  }
  const scheduleMC = debounce(runMC, 450);

  const toolsRefresh = () => { const b = st.open && built[st.open]; if (b && b.api && b.api.update) b.api.update(); };
  app.on('cfg', () => { if (!root.closest('[hidden]')) { st.mc = null; draw(); } });
  app.on('stats', () => { draw(); toolsRefresh(); scheduleMC(); });
  app.on('analysis', () => { st.mc = null; draw(); toolsRefresh(); scheduleMC(); });
  draw();
  return { update: draw };
}
