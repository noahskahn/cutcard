// Ablation: flat-bet edge of the extended set with each new play removed, to catch harmful entries.
import { configFromPreset } from '../src/core/presets.js';
import { compileSetup } from '../src/sim/compile.js';
import { Simulator } from '../src/sim/simulator.js';
const id = process.argv[2] || 'solid-6d', N = +(process.argv[3] || 40e6);
const keys = ['', 'pair:10:4', 'soft:19:4', 'soft:19:5', 'soft:19:6', 'soft:17:2', 'hard:8:6', 'hard:16:8', 'hard:16:9'];
const base = configFromPreset(id);
for (const k of keys) {
  const cfg = JSON.parse(JSON.stringify(base)); cfg.player.deviations = 'full'; cfg.player.disabledDeviations = k ? [k] : [];
  const r = new Simulator(compileSetup(cfg), 5).runBins(N);
  let n = 0, s = 0, q = 0; for (let i = 0; i < r.n.length; i++) { n += r.n[i]; s += r.s1[i]; q += r.s2[i]; }
  const m = s / n, se = Math.sqrt(q / n - m * m) / Math.sqrt(n);
  console.log((k || 'all new plays').padEnd(16), (m * 100).toFixed(3) + '%', '±' + (se * 100).toFixed(3));
}
