// "Ideal Bets" tab: Kelly-style optimal ramp for a bankroll at a target risk of ruin.
import { h, fmt } from '../dom.js';
import { card, makeField } from '../fields.js';
import { optimizeSpread, rampToSpread } from '../../analysis/optimizer.js';
import { TC_MIN } from '../../core/constants.js';

export function mount(root, app) {
  const st = { ror: 1, sitOut: false };
  const rorIn = h('input', { type: 'number', min: 0.1, max: 50, step: 0.1, value: st.ror });
  rorIn.addEventListener('change', () => { st.ror = Math.max(0.1, +rorIn.value || 1); update(); });
  const sit = h('input', { type: 'checkbox' });
  sit.addEventListener('change', () => { st.sitOut = sit.checked; update(); });
  const result = h('div'), tiers = h('div');
  root.append(h('div', { class: 'stack' },
    card('Ideal bet spread for your bankroll', 'Chooses bet sizes at every count to maximise hourly profit while keeping risk of ruin at your target — the fastest safe way to compound a bankroll. Bets scale up with bankroll: re-run as your stack grows.',
      h('div', { class: 'grid g3' },
        makeField(app, { path: 'player.bankroll', label: 'Bankroll ($)', min: 100, step: 100 }),
        h('div', { class: 'field' }, h('label', {}, 'Target risk of ruin (%)'), rorIn, h('div', { class: 'hint' }, 'Professionals typically use 1–5%.')),
        h('div', { class: 'field' }, h('label', {}, 'Allow sitting out at bad counts'), h('label', { class: 'switch' }, sit, h('span')), h('div', { class: 'hint' }, 'Back-counting: needs other players at the table.')))),
    result,
    card('Ideal spreads at different bankrolls', 'Same game & table limits. Shows how the spread and profit scale as your bankroll grows.', tiers)));

  function update() {
    const stats = app.stats; if (!stats) { result.textContent = 'Calculating…'; return; }
    const c = app.cfg;
    const target = st.ror / 100;
    const opt = optimizeSpread(stats, { bankroll: c.player.bankroll, targetRor: target, table: c.table, costs: c.costs, sitOut: st.sitOut });
    const e = opt.ev;
    result.innerHTML = '';
    const body = [];
    if (!(e.evRound > 0)) body.push(h('div', { class: 'notice bad' }, 'This game has no positive expectation with any ramp — the edge from counting does not beat the house edge plus costs. Try a better game, deeper penetration, or fewer costs.'));
    else if (!opt.feasible) body.push(h('div', { class: 'notice' }, `With a ${fmt.money(c.player.bankroll)} bankroll the lowest achievable risk of ruin at this table is ${fmt.pct(e.ror, 1)} (target ${st.ror}%). Showing the lowest-risk ramp. You need about ${fmt.money(bankrollNeeded(e, target))} to hit ${st.ror}%.`));
    else body.push(h('div', { class: 'notice good' }, `Risk of ruin ${fmt.pct(e.ror, 2)} ≤ target ${st.ror}%.`));
    const tbl = h('table', { class: 't' }, h('tr', {}, ...['True count', 'Bet', 'Units', '% of rounds', 'Edge', 'EV/hr share'].map((t) => h('th', {}, t))));
    const rph = c.table.roundsPerHour;
    for (let tc = -2; tc <= 12; tc++) {
      const i = tc - TC_MIN, b = opt.bets[i], f = app.stats.f[i];
      if (f < 0.0005 && tc > 8) continue;
      tbl.append(h('tr', { class: b > opt.minBetUsed ? 'hl' : '' }, h('td', {}, tc <= -2 ? '≤ -2' : tc === 12 ? '≥ 12' : (tc > 0 ? '+' : '') + tc), h('td', {}, b > 0 ? fmt.money(b) : 'sit out'),
        h('td', {}, b > 0 ? (b / opt.minBetUsed).toFixed(1) : '—'), h('td', {}, fmt.pct(f, 1)), h('td', { class: fmt.signCls(app.stats.mu[i]) }, fmt.pct(app.stats.mu[i], 2)), h('td', {}, fmt.money(b * f * app.stats.mu[i] * rph, 2))));
    }
    result.append(card('Recommended ramp', null, ...body,
      h('div', { class: 'grid g3', style: { marginBottom: '12px' } },
        kp('Minimum bet (1 unit)', fmt.money(opt.minBetUsed), 'bet this at low counts'),
        kp('Top bet', fmt.money(Math.max(...opt.bets)), `spread 1 – ${(Math.max(...opt.bets) / opt.minBetUsed).toFixed(0)}`),
        kp('Expected win / hour', fmt.money(e.evHr, 2), `SD ${fmt.money(e.sdHr)}/hr`),
        kp('Risk of ruin', fmt.pct(e.ror, 2), `bankroll ${fmt.money(c.player.bankroll)}`),
        kp('Hours to double', fmt.hours(e.hoursToDouble), 'at constant bets'),
        kp('Hours to 95% profit chance', fmt.hours(e.n95Hours), '')),
      tbl,
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => {
        const sp = rampToSpread(opt.bets, opt.minBetUsed);
        c.spread = sp; c.player.wongOutBelow = st.sitOut ? opt.wongOutBelow : null;
        app.change('spread.bets'); app.syncFields(); app.show('home');
      } }, 'Use this spread in the calculator'), h('span', { class: 'sub' }, 'Copies it to the Spread & EV tab so you can simulate it.'))));
    // tiers
    const tt = h('table', { class: 't' }, h('tr', {}, ...['Bankroll', 'Min bet', 'Top bet', 'EV/hr', 'SD/hr', 'RoR', 'Growth/hr'].map((t) => h('th', {}, t))));
    for (const B of [2500, 5000, 10000, 20000, 50000, 100000, 250000, 500000]) {
      const o = optimizeSpread(stats, { bankroll: B, targetRor: target, table: c.table, costs: c.costs, sitOut: st.sitOut });
      tt.append(h('tr', { class: B === c.player.bankroll ? 'hl' : '' }, h('td', {}, fmt.money(B)), h('td', {}, fmt.money(o.minBetUsed)), h('td', {}, fmt.money(Math.max(...o.bets))),
        h('td', { class: fmt.signCls(o.ev.evHr) }, fmt.money(o.ev.evHr, 1)), h('td', {}, fmt.money(o.ev.sdHr)), h('td', { class: o.feasible ? '' : 'neg' }, fmt.pct(o.ev.ror, 2)), h('td', {}, fmt.pct(o.ev.evHr / B, 3))));
    }
    tiers.innerHTML = ''; tiers.append(tt, h('p', { class: 'sub', style: { marginTop: '8px' } }, 'Red risk = table minimum/maximum prevents reaching your target at that bankroll. Table limits and chip size come from the Game tab.'));
  }
  const bankrollNeeded = (e, t) => (-Math.log(t) * e.variance) / (2 * e.evRound);
  const kp = (a, b, c) => h('div', { class: 'kpi', style: { '--c': '#4cc9a0' } }, h('label', {}, a), h('b', {}, b), h('small', {}, c));
  app.on('cfg', () => { if (root.offsetParent) update(); });
  return { update };
}
