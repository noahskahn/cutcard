// Bet spreads -> EV, variance, risk metrics (all analytic from per-TC stats).
import { NBINS, TC_MIN } from '../core/constants.js';

export function normCdf(x) {
  // Abramowitz-Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export const SPREAD_PRESETS = {
  '1-2': [1, 1, 1, 2, 2, 2, 2, 2, 2, 2],
  '1-4': [1, 1, 2, 3, 4, 4, 4, 4, 4, 4],
  '1-8': [1, 1, 2, 4, 6, 8, 8, 8, 8, 8],
  '1-12': [1, 1, 2, 4, 8, 10, 12, 12, 12, 12],
  '1-16': [1, 1, 2, 4, 8, 12, 16, 16, 16, 16],
  '1-20': [1, 1, 2, 5, 10, 15, 20, 20, 20, 20],
  'Flat': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
};

const roundTo = (v, inc) => (inc > 0 ? Math.round(v / inc) * inc : v);

/** Dollar bet per TC bin from the editable spread. 0 = sit out. */
export function betsFromSpread(spread, table, player) {
  const out = new Float64Array(NBINS);
  const L = spread.bets.length;
  for (let b = 0; b < NBINS; b++) {
    const tc = b + TC_MIN;
    const units = spread.bets[Math.max(0, Math.min(L - 1, tc))];
    if (player.wongOutBelow != null && tc < player.wongOutBelow) { out[b] = 0; continue; }
    if (!(units > 0)) { out[b] = 0; continue; }
    out[b] = Math.max(table.minBet, Math.min(table.maxBet, roundTo(units * spread.unit, table.increment)));
  }
  return out;
}

/** Risk of ruin for Brownian approx. mu, var per round, bankroll B. */
export const ruinProb = (mu, v, B) => (mu <= 0 ? 1 : Math.min(1, Math.exp((-2 * mu * B) / v)));

/** Probability of ruin within T rounds (Brownian motion with drift). */
export function tripRuin(mu, v, B, T) {
  const s = Math.sqrt(v * T);
  if (s === 0) return 0;
  const a = normCdf((-B - mu * T) / s);
  const c = mu === 0 ? 1 : Math.exp((-2 * mu * B) / v) * normCdf((-B + mu * T) / s);
  return Math.min(1, a + c);
}

/**
 * Evaluate a bet array. stats = binStats() output.
 * Returns hourly EV, SD, risk metrics etc. Costs deducted at the round level.
 */
export function evaluateBets(stats, bets, table, costs, bankroll) {
  const rph = table.roundsPerHour;
  let ev = 0, m2 = 0, play = 0, wager = 0;
  for (let i = 0; i < NBINS; i++) {
    const b = bets[i], f = stats.f[i];
    if (b <= 0 || f === 0) continue;
    ev += f * b * stats.mu[i];
    m2 += f * b * b * stats.m2[i];
    play += f; wager += f * b;
  }
  const gross = ev;
  const costPerRound = (costs.hourlyCost || 0) / rph + (costs.rakePerHand || 0) * play - (costs.compPct || 0) / 100 * wager;
  const mu = ev - costPerRound;
  const variance = Math.max(m2 - ev * ev, 1e-9);
  const sd = Math.sqrt(variance);
  const evHr = mu * rph, sdHr = sd * Math.sqrt(rph);
  const avgBet = play > 0 ? wager / play : 0;
  const n95 = mu > 0 ? (1.645 * sd / mu) ** 2 : Infinity;
  const ror = ruinProb(mu, variance, bankroll);
  return {
    evRound: mu, grossEvRound: gross, variance, sdRound: sd,
    evHr, grossEvHr: gross * rph, sdHr, costHr: costPerRound * rph,
    handsPlayedHr: play * rph, avgBet, wagerHr: wager * rph,
    edgePct: wager > 0 ? (gross / wager) * 100 : 0,       // % of total action
    edgeNetPct: wager > 0 ? (mu / wager) * 100 : 0,
    ror, n0: mu > 0 ? variance / (mu * mu) : Infinity,
    n95Rounds: n95, n95Hours: n95 / rph,
    di: mu > 0 ? mu / sd : 0,
    kellyBankroll: mu > 0 ? variance / mu : Infinity,
    roundsPerHour: rph,
    hoursToDouble: mu > 0 ? bankroll / (mu * rph) : Infinity,
    pProfit: (hours) => normCdf((mu * rph * hours) / (sdHr * Math.sqrt(hours) || 1)),
    tripRuin: (hours) => tripRuin(mu, variance, bankroll, hours * rph),
    mu, play,
  };
}

/** Bankroll required for a target ruin probability with these bets. */
export function bankrollForRor(ev, target) {
  if (ev.evRound <= 0) return Infinity;
  return (-Math.log(target) * ev.variance) / (2 * ev.evRound);
}
