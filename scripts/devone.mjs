import { configFromPreset } from '../src/core/presets.js';
import { compileSetup } from '../src/sim/compile.js';
import { Simulator } from '../src/sim/simulator.js';
const [id, mode, N, seed] = [process.argv[2], process.argv[3], +process.argv[4], +process.argv[5] || 1];
const cfg = configFromPreset(id); cfg.player.deviations = mode;
const r = new Simulator(compileSetup(cfg), seed).runBins(N);
let n = 0, s = 0, q = 0; for (let i = 0; i < r.n.length; i++) { n += r.n[i]; s += r.s1[i]; q += r.s2[i]; }
const m = s / n, se = Math.sqrt(q / n - m * m) / Math.sqrt(n);
console.log(id, mode.padEnd(8), (m * 100).toFixed(3) + '% ±' + (se * 100).toFixed(3));
