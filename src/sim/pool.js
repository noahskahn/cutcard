// Worker pool with a Node/main-thread fallback. Splits a job across workers.
import { mergeBins } from '../analysis/stats.js';
import { Simulator } from './simulator.js';

export class SimPool {
  constructor(size) {
    this.size = size || Math.max(1, Math.min(8, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4));
    this.workers = [];
    this.nextId = 1;
    this.cancelled = false;
  }
  _spawn() {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.workers.push(w);
    return w;
  }
  cancel() {
    this.cancelled = true;
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
  _run(tasks, onProgress, total) {
    this.cancelled = false;
    const done = new Array(tasks.length).fill(0);
    return Promise.all(tasks.map((t, i) => new Promise((res, rej) => {
      let w;
      try { w = this._spawn(); } catch (e) { // no worker support: run inline
        try { res(this._inline(t)); } catch (err) { rej(err); }
        return;
      }
      const id = this.nextId++;
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.progress != null) { done[i] = m.progress; onProgress && onProgress(done.reduce((a, b) => a + b, 0) / total); }
        else if (m.error) { rej(new Error(m.error)); w.terminate(); }
        else { done[i] = Infinity; w.terminate(); res(m.result); }
      };
      w.onerror = () => { try { res(this._inline(t)); } catch (err) { rej(err); } };
      w.postMessage({ id, type: t.type, setup: t.setup, seed: t.seed, args: t.args });
    })));
  }
  _inline(t) {
    const sim = new Simulator(t.setup, t.seed);
    return t.type === 'bins' ? sim.runBins(t.args.rounds) : sim.runBankroll(t.args);
  }
  async runBins(setup, rounds, onProgress, seed = 1) {
    const per = Math.ceil(rounds / this.size);
    const tasks = [];
    for (let i = 0; i < this.size; i++) tasks.push({ type: 'bins', setup, seed: seed * 7919 + i * 104729 + 17, args: { rounds: per } });
    // progress counts rounds finished per worker; normalise with total
    const parts = await this._run(tasks.map((t) => t), (frac) => onProgress && onProgress(Math.min(1, frac)), per * this.size);
    return mergeBins(parts);
  }
  async runBankroll(setup, args, onProgress, seed = 1) {
    const per = Math.ceil(args.runs / this.size);
    const tasks = []; let left = args.runs;
    for (let i = 0; i < this.size && left > 0; i++) {
      const r = Math.min(per, left); left -= r;
      tasks.push({ type: 'bankroll', setup, seed: seed * 7919 + i * 104729 + 31, args: { ...args, runs: r } });
    }
    return this._run(tasks, (frac) => onProgress && onProgress(Math.min(1, frac)), args.runs);
  }
}
