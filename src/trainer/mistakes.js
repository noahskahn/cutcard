// Persistent bank of basic-strategy mistakes (2-card spots) so they can be drilled later.
const KEY = 'cutcard.mistakes.v1';
let cache = null;
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { cache = []; }
  return cache;
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* ignore */ } };
const keyOf = (i) => `${[...i.cards].sort((a, b) => a - b).join(',')}|${i.up}`;
const usable = (i) => i && i.cards && i.cards.length === 2 && !i.fromSplit && !i.dev;

export const mistakeBank = {
  list() { return load().slice(); },
  count() { return load().length; },
  /** Record an answer for a spot. Wrong -> add/bump; right -> advance toward being cleared (2 in a row). */
  record(info, ok) {
    if (!usable(info)) return;
    const b = load(), k = keyOf(info), i = b.findIndex((e) => e.k === k);
    if (!ok) {
      if (i >= 0) { b[i].count++; b[i].streak = 0; b[i].correct = info.correct; }
      else b.push({ k, cards: [...info.cards], up: info.up, desc: info.desc, correct: info.correct, count: 1, streak: 0 });
    } else if (i >= 0) {
      b[i].streak++; if (b[i].streak >= 2) b.splice(i, 1);
    }
    save();
  },
  /** Weighted random pick (more frequent mistakes come up more often). */
  pick() {
    const b = load(); if (!b.length) return null;
    let r = Math.random() * b.reduce((a, e) => a + e.count + 1, 0);
    for (const e of b) { r -= e.count + 1; if (r <= 0) return e; }
    return b[b.length - 1];
  },
  clear() { cache = []; save(); },
};
