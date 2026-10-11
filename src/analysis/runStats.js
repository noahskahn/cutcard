// Aggregates bankroll-walk matrices into chart-ready series.
export function aggregateRuns(parts, runsTotal, cp, rounds, bankroll) {
  const W = cp + 1;
  const traj = new Float32Array(runsTotal * W);
  const ruin = new Int32Array(runsTotal);
  let o = 0, ro = 0;
  for (const p of parts) { traj.set(p.traj, o); o += p.traj.length; ruin.set(p.ruin, ro); ro += p.ruin.length; }
  const mean = new Float64Array(W), sd = new Float64Array(W);
  const pct = { 5: new Float64Array(W), 25: new Float64Array(W), 50: new Float64Array(W), 75: new Float64Array(W), 95: new Float64Array(W) };
  const ruinCum = new Float64Array(W);
  const col = new Float64Array(runsTotal);
  const step = rounds / cp;
  for (let c = 0; c < W; c++) {
    let s = 0;
    for (let r = 0; r < runsTotal; r++) { const v = traj[r * W + c]; col[r] = v; s += v; }
    mean[c] = s / runsTotal;
    let q = 0;
    for (let r = 0; r < runsTotal; r++) q += (col[r] - mean[c]) ** 2;
    sd[c] = Math.sqrt(q / Math.max(runsTotal - 1, 1));
    const sorted = Float64Array.from(col).sort();
    for (const k of Object.keys(pct)) pct[k][c] = sorted[Math.min(runsTotal - 1, Math.floor((k / 100) * runsTotal))];
    let ruined = 0; const t = c * step;
    for (let r = 0; r < runsTotal; r++) if (ruin[r] >= 0 && ruin[r] <= t) ruined++;
    ruinCum[c] = ruined / runsTotal;
  }
  const finals = Array.from({ length: runsTotal }, (_, r) => traj[r * W + cp]);
  const profit = finals.filter((v) => v > bankroll).length / runsTotal;
  return { W, cp, mean, sd, pct, ruinCum, finals, profit, ruinProb: ruinCum[cp], traj, runs: runsTotal };
}
