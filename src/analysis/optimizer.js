// Finds the bet ramp that maximises hourly EV subject to a risk-of-ruin cap.
// Theory: maximising EV^2/Var over ramps gives bet_k proportional to mu_k / E[x^2]_k
// (Kelly-proportional); the overall scale is then pinned by the RoR target.
import { NBINS, TC_MIN } from '../core/constants.js';
import { evaluateBets } from './spread.js';

const roundTo = (v, inc) => (inc > 0 ? Math.round(v / inc) * inc : v);

export function buildRamp(stats, s, minBetUsed, table, sitOut) {
  const bets = new Float64Array(NBINS);
  for (let i = 0; i < NBINS; i++) {
    const kappa = stats.mu[i] / stats.m2[i];
    if (kappa <= 0) { bets[i] = sitOut ? 0 : minBetUsed; continue; }
    let b = roundTo(s * kappa, table.increment);
    b = Math.max(minBetUsed, Math.min(table.maxBet, b));
    bets[i] = b;
  }
  return bets;
}

/**
 * @returns {{bets, ev, feasible, minBetUsed, wongOutBelow}}
 */
export function optimizeSpread(stats, { bankroll, targetRor = 0.01, table, costs, sitOut = false }) {
  let best = null, bestAny = null;
  const mins = new Set();
  for (const m of [1, 1.5, 2, 3, 4, 6, 8]) {
    const v = Math.max(table.minBet, roundTo(table.minBet * m, table.increment));
    if (v <= table.maxBet) mins.add(v);
  }
  for (const m of mins) {
    for (let k = 0; k < 90; k++) {
      const s = Math.max(1, m * 0.2) * Math.pow(1.12, k) * 40; // dollars scale; spans ~3 orders of magnitude
      const bets = buildRamp(stats, s, m, table, sitOut);
      const ev = evaluateBets(stats, bets, table, costs, bankroll);
      const cand = { bets, ev, minBetUsed: m };
      if (!bestAny || ev.ror < bestAny.ev.ror) bestAny = cand;
      if (ev.evRound > 0 && ev.ror <= targetRor && (!best || ev.evRound > best.ev.evRound)) best = cand;
    }
  }
  const pick = best || bestAny;
  let wong = null;
  if (sitOut) {
    for (let i = NBINS - 1; i >= 0; i--) { if (pick.bets[i] === 0) { wong = i + TC_MIN + 1; break; } }
  }
  return { ...pick, feasible: !!best, wongOutBelow: wong };
}

/** Convert a dollar-per-bin ramp to the editor's unit format (index = TC 0..9). */
export function rampToSpread(bets, unit) {
  const units = [];
  for (let tc = 0; tc <= 9; tc++) {
    const b = bets[tc - TC_MIN];
    units.push(Math.round((b / unit) * 100) / 100);
  }
  return { unit, bets: units };
}
