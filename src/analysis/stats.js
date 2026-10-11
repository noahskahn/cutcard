// Turns raw per-TC-bin simulation sums into smoothed per-bin statistics.
import { NBINS, TC_MIN } from '../core/constants.js';

export function mergeBins(list) {
  const out = { n: new Float64Array(NBINS), s1: new Float64Array(NBINS), s2: new Float64Array(NBINS), rounds: 0 };
  for (const b of list) {
    for (let i = 0; i < NBINS; i++) { out.n[i] += b.n[i]; out.s1[i] += b.s1[i]; out.s2[i] += b.s2[i]; }
    out.rounds += b.rounds;
  }
  return out;
}

/**
 * Per-bin stats with empirical-Bayes shrinkage toward a weighted linear fit
 * (EV vs TC is close to linear). Returns { f, mu, m2, n, rawMu, se, fit, overall }.
 *   f  : fraction of rounds in the bin     mu: mean result per unit bet
 *   m2 : mean squared result (second moment about 0)
 */
export function binStats(bins, { shrinkW = 60000, minFit = 3000 } = {}) {
  const { n, s1, s2 } = bins;
  let N = 0, S1 = 0, S2 = 0;
  for (let i = 0; i < NBINS; i++) { N += n[i]; S1 += s1[i]; S2 += s2[i]; }
  const rawMu = new Float64Array(NBINS), rawM2 = new Float64Array(NBINS);
  for (let i = 0; i < NBINS; i++) { rawMu[i] = n[i] ? s1[i] / n[i] : 0; rawM2[i] = n[i] ? s2[i] / n[i] : 0; }
  // weighted least squares: mu = a + b*tc
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, sy2 = 0, sxy2 = 0;
  for (let i = 0; i < NBINS; i++) {
    if (n[i] < minFit) continue;
    const w = n[i], x = i + TC_MIN;
    sw += w; sx += w * x; sy += w * rawMu[i]; sxx += w * x * x; sxy += w * x * rawMu[i];
    sy2 += w * rawM2[i]; sxy2 += w * x * rawM2[i];
  }
  const den = sw * sxx - sx * sx;
  const b = den > 0 ? (sw * sxy - sx * sy) / den : 0;
  const a = sw > 0 ? (sy - b * sx) / sw : 0;
  const m2pool = sw > 0 ? sy2 / sw : S2 / Math.max(N, 1);
  const bm2 = den > 0 ? (sw * sxy2 - sx * sy2) / den : 0;
  const am2 = sw > 0 ? (sy2 - bm2 * sx) / sw : m2pool;
  const f = new Float64Array(NBINS), mu = new Float64Array(NBINS), m2 = new Float64Array(NBINS), fit = new Float64Array(NBINS), se = new Float64Array(NBINS);
  for (let i = 0; i < NBINS; i++) {
    const x = i + TC_MIN;
    f[i] = N ? n[i] / N : 0;
    fit[i] = a + b * x;
    mu[i] = (n[i] * rawMu[i] + shrinkW * fit[i]) / (n[i] + shrinkW);
    const fm2 = Math.max(0.5, am2 + bm2 * x);
    m2[i] = (n[i] * rawM2[i] + shrinkW * fm2) / (n[i] + shrinkW);
    se[i] = n[i] > 1 ? Math.sqrt(Math.max(rawM2[i] - rawMu[i] ** 2, 0) / n[i]) : NaN;
  }
  const mean = S1 / Math.max(N, 1);
  return { f, mu, m2, n, rawMu, se, fit, slope: b, intercept: a,
    overall: { rounds: N, mean, sd: Math.sqrt(Math.max(S2 / Math.max(N, 1) - mean * mean, 0)), se: Math.sqrt(Math.max(S2 / Math.max(N, 1) - mean * mean, 0) / Math.max(N, 1)) } };
}
