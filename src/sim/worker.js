// Web worker entry: runs simulation tasks off the UI thread.
import { Simulator } from './simulator.js';

self.onmessage = (e) => {
  const { id, type, setup, seed, args } = e.data;
  try {
    const sim = new Simulator(setup, seed);
    const progress = (done) => self.postMessage({ id, progress: done });
    let result;
    if (type === 'bins') result = sim.runBins(args.rounds, progress);
    else if (type === 'bankroll') result = sim.runBankroll(args, progress);
    else throw new Error('unknown task ' + type);
    const transfer = [];
    for (const k of Object.keys(result)) if (ArrayBuffer.isView(result[k])) transfer.push(result[k].buffer);
    self.postMessage({ id, result }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
