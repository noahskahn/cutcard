import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig } from '../src/core/rules.js';
import { compileSetup } from '../src/sim/compile.js';
import { Simulator } from '../src/sim/simulator.js';
import { strategyEV } from '../src/strategy/houseEdge.js';
import { binStats } from '../src/analysis/stats.js';
import { betsFromSpread, evaluateBets, ruinProb, SPREAD_PRESETS } from '../src/analysis/spread.js';
import { optimizeSpread } from '../src/analysis/optimizer.js';

function cfgWith(o = {}) {
  const c = defaultConfig();
  Object.assign(c.rules, { csm: true }, o.rules || {});
  Object.assign(c.player, { deviations: 'none' }, o.player || {});
  Object.assign(c.table, o.table || {});
  return c;
}
function edge(cfg, n, seed = 5) {
  const setup = compileSetup(cfg);
  const r = new Simulator(setup, seed).runBins(n);
  const N = r.n.reduce((a, b) => a + b, 0), m = r.s1.reduce((a, b) => a + b, 0) / N;
  const sd = Math.sqrt(r.s2.reduce((a, b) => a + b, 0) / N - m * m);
  return { m, se: sd / Math.sqrt(N), setup };
}

test('simulation matches exact engine EV at a fresh shoe (continuous shuffle)', () => {
  for (const rules of [{}, { h17: true, surrender: 'late', decks: 2 }, { peek: false, obo: false }, { bjPay: 1.2 }]) {
    const cfg = cfgWith({ rules });
    const { m, se, setup } = edge(cfg, 12e6);
    const exact = strategyEV(cfg.rules, setup.strategy);
    assert.ok(Math.abs(m - exact) < 5 * se + 0.0005, `${JSON.stringify(rules)} sim ${m} exact ${exact} se ${se}`);
  }
});

test('perfect count info: edge rises with true count; flat-bet counter with deviations beats basic', () => {
  const base = cfgWith({ rules: { csm: false, penetration: 0.8 }, table: { otherPlayers: 0 } });
  const s = binStats(new Simulator(compileSetup(base), 9).runBins(6e6));
  assert.ok(s.slope > 0.004 && s.slope < 0.007, 'slope per TC ~0.5%: ' + s.slope);
  const dev = cfgWith({ rules: { csm: false, penetration: 0.8 }, table: { otherPlayers: 0 }, player: { deviations: 'i18fab4' } });
  const s2 = binStats(new Simulator(compileSetup(dev), 9).runBins(6e6));
  assert.ok(s2.overall.mean > s.overall.mean, 'deviations help: ' + s2.overall.mean + ' vs ' + s.overall.mean);
});

test('count errors and strategy mistakes reduce EV', () => {
  const mk = (player) => cfgWith({ rules: { csm: false, penetration: 0.8 }, table: { otherPlayers: 0 }, player: { deviations: 'i18fab4', ...player } });
  const spread = { unit: 25, bets: SPREAD_PRESETS['1-12'] };
  const ev = (player) => {
    const c = mk(player);
    const st = binStats(new Simulator(compileSetup(c), 3).runBins(6e6));
    return evaluateBets(st, betsFromSpread(spread, c.table, c.player), c.table, c.costs, 20000).evHr;
  };
  const clean = ev({}), err = ev({ countErrorRate: 0.1 }), mist = ev({ mistakeRate: 0.1 });
  assert.ok(err < clean * 0.97, `count errors: ${err} < ${clean}`);
  assert.ok(mist < clean * 0.97, `mistakes: ${mist} < ${clean}`);
});

test('no positive EV when counting is impossible (CSM): ideal spread is not feasible', () => {
  const c = cfgWith({ rules: { csm: true } });
  const st = binStats(new Simulator(compileSetup(c), 3).runBins(2e6));
  const o = optimizeSpread(st, { bankroll: 50000, targetRor: 0.01, table: c.table, costs: c.costs });
  assert.equal(o.feasible, false);
});

test('Monte Carlo bankroll walk agrees with analytic mean, SD and ruin formula', () => {
  const c = cfgWith({ rules: { csm: false, penetration: 0.8, surrender: 'late' }, table: { otherPlayers: 0, roundsPerHour: 200, minBet: 10 }, player: { deviations: 'i18fab4' } });
  const sim = new Simulator(compileSetup(c), 21);
  const st = binStats(sim.runBins(10e6));
  const bets = betsFromSpread({ unit: 10, bets: SPREAD_PRESETS['1-8'] }, c.table, c.player);
  const e = evaluateBets(st, bets, c.table, c.costs, 100000);
  const hours = 100, rounds = hours * 200, runs = 600;
  const { traj } = sim.runBankroll({ runs, rounds, checkpoints: 10, bets, bankroll: 100000, minBet: 10, perRoundCost: 0, rakePerHand: 0, compPct: 0 });
  const finals = Array.from({ length: runs }, (_, r) => traj[r * 11 + 10] - 100000);
  const mean = finals.reduce((a, b) => a + b, 0) / runs;
  const sd = Math.sqrt(finals.reduce((a, b) => a + (b - mean) ** 2, 0) / (runs - 1));
  const predSd = e.sdHr * Math.sqrt(hours);
  assert.ok(Math.abs(mean - e.evHr * hours) < 4.5 * predSd / Math.sqrt(runs), `mean ${mean} vs ${e.evHr * hours}`);
  assert.ok(Math.abs(sd / predSd - 1) < 0.12, `sd ${sd} vs ${predSd}`);
});

test('ruin formula sanity', () => {
  assert.ok(Math.abs(ruinProb(1, 100, 100) - Math.exp(-2)) < 1e-12);
  assert.equal(ruinProb(-1, 100, 100), 1);
});
