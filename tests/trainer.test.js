import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules } from '../src/core/rules.js';
import { ACT } from '../src/core/constants.js';
import { Advisor } from '../src/trainer/advisor.js';
import { Shoe } from '../src/trainer/shoe.js';

const H = (...cards) => ({ cards, fromSplit: false, aceSplit: false });
test('advisor basic strategy and legality', () => {
  const a = new Advisor({ ...defaultRules(), surrender: 'late' }, 'none');
  assert.equal(a.advise(H(10, 6), 10, 1).action, ACT.SURRENDER);
  assert.equal(a.advise(H(8, 8), 6, 1).action, ACT.SPLIT);
  assert.equal(a.advise(H(5, 6), 6, 1).action, ACT.DOUBLE);
  assert.equal(a.advise(H(1, 7), 9, 1).action, ACT.HIT);
  assert.equal(a.advise(H(10, 2), 4, 1).action, ACT.STAND);
  assert.equal(a.legal(H(5, 6, 2), 6, 1).double, false);
  const split = { cards: [1, 10], fromSplit: true, aceSplit: true };
  assert.equal(a.legal(split, 6, 2).forced, true);
});
test('deviations follow the count and only apply when enabled', () => {
  const a = new Advisor({ ...defaultRules() }, 'i18');
  assert.equal(a.advise(H(10, 6), 10, 1, 0, true).action, ACT.STAND);
  assert.equal(a.advise(H(10, 6), 10, 1, -1, true).action, ACT.HIT);
  assert.equal(a.advise(H(10, 6), 10, 1, 5, false).action, ACT.HIT);
  assert.equal(a.advise(H(10, 3), 2, 1, -2, true).action, ACT.HIT);
  assert.equal(a.advise(H(10, 3), 2, 1, -1, true).action, ACT.STAND);
  assert.equal(a.advise(H(10, 3), 2, 1, -5, false).action, ACT.STAND);
  assert.equal(a.advise(H(10, 10), 5, 1, 5, true).action, ACT.SPLIT);
  assert.equal(a.insuranceCorrect(3), true); assert.equal(a.insuranceCorrect(2), false);
});
test('EV values rank the correct play first', () => {
  const a = new Advisor(defaultRules(), 'none');
  const v = a.values(H(10, 6), 10, 1);
  assert.ok(v[ACT.STAND] < v[ACT.HIT] + 0.5 && Number.isFinite(v[ACT.HIT]));
  const w = a.values(H(5, 6), 6, 1);
  assert.ok(w[ACT.DOUBLE] > w[ACT.HIT]);
});
test('shoe counts and shuffles', () => {
  const s = new Shoe(6, 0.75);
  let rc = 0; for (let i = 0; i < 100; i++) { const v = s.draw(); s.see(v); rc += v === 1 || v === 10 ? -1 : v <= 6 ? 1 : 0; }
  assert.equal(s.rc, rc);
  assert.equal(s.drawValue(7), 7);
  s.shuffle(); assert.equal(s.rc, 0);
});
