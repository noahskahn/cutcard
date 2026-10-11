import { defaultConfig } from '../src/core/rules.js';
import { compileSetup } from '../src/sim/compile.js';
import { Simulator } from '../src/sim/simulator.js';
import { buildStrategy } from '../src/strategy/basicStrategy.js';
import { strategyEV } from '../src/strategy/houseEdge.js';
const over = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const N = +(process.argv[3] || 4e6);
const cfg = defaultConfig(); Object.assign(cfg.rules, over.rules||{}); Object.assign(cfg.player, over.player||{}); Object.assign(cfg.table, over.table||{});
cfg.player.deviations = cfg.player.deviations || 'none';
const setup = compileSetup(cfg);
const sim = new Simulator(setup, 42);
let t0 = Date.now();
const r = sim.runBins(N);
const dt = (Date.now()-t0)/1000;
let tn=0,ts=0,t2=0; for (let i=0;i<r.n.length;i++){tn+=r.n[i];ts+=r.s1[i];t2+=r.s2[i];}
const mean=ts/tn, sd=Math.sqrt(t2/tn-mean*mean);
console.log(`rounds ${tn} in ${dt.toFixed(1)}s (${(tn/dt/1e6).toFixed(2)}M/s)  EV ${(mean*100).toFixed(3)}% +-${(sd/Math.sqrt(tn)*100).toFixed(3)}  SD/round ${sd.toFixed(3)}`);
console.log('engine BS EV (fresh shoe):', (strategyEV(cfg.rules, setup.strategy)*100).toFixed(3)+'%');
console.log('bins:', Array.from(r.n).map((n,i)=>n>tn*0.002?`${i-12}:${(r.s1[i]/n*100).toFixed(2)}%(${(n/tn*100).toFixed(1)}%)`:'').filter(Boolean).join('  '));
