import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRules } from '../src/core/rules.js';
import { buildStrategy, cellCode } from '../src/strategy/basicStrategy.js';
import { strategyEV } from '../src/strategy/houseEdge.js';
import { PUBLISHED, deriveIndices, devKey, indexFromCrossing, insuranceCrossing } from '../src/strategy/deviations.js';
import { dealerDist, freshCounts } from '../src/strategy/engine.js';

const R = (o = {}) => ({ ...defaultRules(), ...o });
const code = (S, kind, k, u) => cellCode(S.initial, kind, k, u);

test('dealer outcome probabilities are a distribution; known bust rates (infinite-ish deck)', () => {
  const c = freshCounts(8);
  const bust = {};
  for (const up of [2, 6, 10]) {
    const c2 = Float64Array.from(c); c2[up]--;
    const { dist, pBJ } = dealerDist(up, c2, false);
    assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    bust[up] = dist[5];
    if (up === 10) assert.ok(Math.abs(pBJ - 0.0769) < 0.002, 'dealer 10 shows BJ ~7.7%: ' + pBJ);
  }
  assert.ok(Math.abs(bust[2] - 0.3536) < 0.006, 'dealer 2 busts ~35.4%');
  assert.ok(Math.abs(bust[6] - 0.4231) < 0.006, 'dealer 6 busts ~42.3%');
});

test('6D S17 DAS basic strategy matches the published chart', () => {
  const S = buildStrategy(R());
  const exp = (kind, k, row) => [2, 3, 4, 5, 6, 7, 8, 9, 10, 1].forEach((u, i) => assert.equal(code(S, kind, k, u), row[i], `${kind} ${k} vs ${u}`));
  exp('hard', 16, ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H']);
  exp('hard', 12, ['H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H']);
  exp('hard', 11, ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H']);
  exp('hard', 10, ['D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H']);
  exp('hard', 9, ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H']);
  exp('soft', 18, ['S', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H']);
  exp('soft', 17, ['H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H']);
  exp('soft', 15, ['H', 'H', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H']);
  exp('soft', 13, ['H', 'H', 'H', 'D', 'D', 'H', 'H', 'H', 'H', 'H']);
  exp('pair', 9, ['P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S']);
  exp('pair', 7, ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H']);
  exp('pair', 6, ['P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H']);
  exp('pair', 4, ['H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H']);
  exp('pair', 3, ['P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H']);
  exp('pair', 8, ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P']);
  exp('pair', 10, Array(10).fill('S'));
});

test('H17 and late-surrender differences (Wizard of Odds)', () => {
  const S = buildStrategy(R({ h17: true, surrender: 'late' }));
  assert.equal(code(S, 'hard', 11, 1), 'D');
  assert.equal(code(S, 'soft', 18, 2), 'Ds');
  assert.equal(code(S, 'soft', 19, 6), 'Ds');
  assert.match(code(S, 'hard', 15, 1), /^R/);
  assert.match(code(S, 'hard', 17, 1), /^Rs/);
  assert.match(code(S, 'pair', 8, 1), /^R/);
  assert.match(code(S, 'hard', 15, 10), /^R/);
  for (const u of [9, 10, 1]) assert.match(code(S, 'hard', 16, u), /^R/);
  const S17 = buildStrategy(R({ surrender: 'late' }));
  assert.equal(code(S17, 'hard', 15, 1), 'H');
  assert.equal(code(S17, 'hard', 11, 1), 'H');
});

test('single-deck specifics', () => {
  const S = buildStrategy(R({ decks: 1, das: false, maxHands: 2 }));
  assert.equal(code(S, 'hard', 11, 1), 'D');
  assert.equal(code(S, 'hard', 8, 6), 'D');
  assert.equal(code(S, 'pair', 7, 10), 'S');
});

test('house edges match published values (Wizard of Odds, +-0.04%)', () => {
  const he = (o) => -strategyEV(R(o), buildStrategy(R(o))) * 100;
  const close = (a, b, tol = 0.04) => assert.ok(Math.abs(a - b) < tol, `${a.toFixed(3)} vs ${b}`);
  close(he({}), 0.40);
  close(he({ decks: 8 }), 0.43);
  close(he({ h17: true }) - he({}), 0.21, 0.03);
  close(he({ bjPay: 1.2 }) - he({}), 1.39, 0.06);
  close(he({ surrender: 'late' }) - he({}), -0.07, 0.03);
  close(he({ das: false }) - he({}), 0.14, 0.03);
  close(he({ peek: false, obo: false }) - he({}), 0.11, 0.03);
  assert.ok(he({ decks: 2 }) < 0.25);
});

test('engine-derived indices reproduce published Illustrious 18 within +-1 (6D S17)', () => {
  const rules = R();
  const der = deriveIndices(rules);
  let n = 0;
  for (const p of PUBLISHED.filter((x) => x.set === 'i18')) {
    const d = der.find((x) => devKey(x) === devKey(p) && x.baseSide === p.baseSide);
    if (!d) continue;
    n++;
    assert.ok(Math.abs(indexFromCrossing(d.tStar, 'floor') - p.idx) <= 1, `${devKey(p)} pub ${p.idx} engine ${d.tStar}`);
  }
  assert.ok(n >= 16, 'most I18 plays found: ' + n);
  assert.equal(indexFromCrossing(insuranceCrossing(), 'floor'), 3);
});
