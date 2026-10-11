import { defaultConfig } from '../src/core/rules.js';
import { compileSetup } from '../src/sim/compile.js';
import { Simulator } from '../src/sim/simulator.js';
import { binStats } from '../src/analysis/stats.js';
import { betsFromSpread, evaluateBets, SPREAD_PRESETS } from '../src/analysis/spread.js';
import { optimizeSpread } from '../src/analysis/optimizer.js';
import { aggregateRuns } from '../src/analysis/runStats.js';
const cfg = defaultConfig(); cfg.rules.h17=false; cfg.rules.surrender='late'; cfg.rules.penetration=0.8; cfg.table.otherPlayers=0; cfg.table.roundsPerHour=200; cfg.table.minBet=10;cfg.spread.unit=10;
const setup = compileSetup(cfg); console.log('devs', setup.devs.list.length, 'ins', setup.devs.insuranceIdx);
const sim = new Simulator(setup, 7); const bins = sim.runBins(20e6); const st = binStats(bins);
console.log('overall', (st.overall.mean*100).toFixed(3)+'%', 'slope/TC', (st.slope*100).toFixed(3)+'%');
for (const [k,v] of Object.entries(SPREAD_PRESETS)) { const bets = betsFromSpread({unit:10,bets:v}, cfg.table, cfg.player); const e = evaluateBets(st,bets,cfg.table,cfg.costs,10000); console.log(k.padEnd(6),'EV/hr',e.evHr.toFixed(1),'SD/hr',e.sdHr.toFixed(0),'RoR',(e.ror*100).toFixed(1)+'%','n95 hrs',e.n95Hours.toFixed(0), 'avgBet', e.avgBet.toFixed(1)); }
const opt = optimizeSpread(st,{bankroll:10000,targetRor:0.01,table:cfg.table,costs:cfg.costs}); console.log('opt feasible',opt.feasible,'EV/hr',opt.ev.evHr.toFixed(1),'RoR',(opt.ev.ror*100).toFixed(2)+'%',Array.from(opt.bets).slice(10,22).join(','));
// MC validation of the 1-8 spread
const bets = betsFromSpread({unit:10,bets:SPREAD_PRESETS['1-8']}, cfg.table, cfg.player); const e = evaluateBets(st,bets,cfg.table,cfg.costs,5000);
const hours=200, rounds=hours*200, cp=50; const t0=Date.now();
const res = sim.runBankroll({runs:400, rounds, checkpoints:cp, bets, bankroll:5000, minBet:10, perRoundCost:0, rakePerHand:0, compPct:0});
const ag = aggregateRuns([res],400,cp,rounds,5000);
console.log(`MC ${((Date.now()-t0)/1000).toFixed(1)}s mean final ${ag.mean[cp].toFixed(0)} (predicted ${(5000+e.evHr*hours).toFixed(0)}) sd ${ag.sd[cp].toFixed(0)} (pred ${(e.sdHr*Math.sqrt(hours)).toFixed(0)}) ruin ${(ag.ruinProb*100).toFixed(1)}% (analytic trip ${(e.tripRuin(hours)*100).toFixed(1)}%)`);
