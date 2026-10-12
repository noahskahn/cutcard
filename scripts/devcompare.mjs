// Compare deviation sets by simulated EV (same spread) — checks the engine-derived set is sane.
import { configFromPreset } from '../src/core/presets.js';
import { compileSetup } from '../src/sim/compile.js';
import { Simulator } from '../src/sim/simulator.js';
import { binStats } from '../src/analysis/stats.js';
import { betsFromSpread, evaluateBets } from '../src/analysis/spread.js';
import { deriveIndices } from '../src/strategy/deviations.js';
const id = process.argv[2] || 'solid-6d', N = +(process.argv[3] || 30e6);
const base = configFromPreset(id); const derived = deriveIndices(base.rules);
for (const mode of ['none', 'insurance', 'i18', 'i18fab4', 'full', 'engine']) {
  const cfg = JSON.parse(JSON.stringify(base)); cfg.player.deviations = mode;
  const setup = compileSetup(cfg, derived);
  const st = binStats(new Simulator(setup, 77).runBins(N));
  const e = evaluateBets(st, betsFromSpread(cfg.spread, cfg.table, cfg.player), cfg.table, cfg.costs, cfg.player.bankroll);
  console.log(mode.padEnd(10), 'devs', String(setup.devs.list.length).padStart(3), 'EV/hr', e.evHr.toFixed(2).padStart(7), ' flat-bet edge', (st.overall.mean * 100).toFixed(3) + '%');
}
