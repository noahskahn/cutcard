import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRules, toRulesString, applyParsed } from '../src/core/rulesParser.js';
import { defaultConfig } from '../src/core/rules.js';
import { PRESETS, configFromPreset } from '../src/core/presets.js';

test('parses compact syntax', () => {
  const p = parseRules('6D H17 DAS NoRSA LS 6:5 ENHC OBO SPL3 DBL:9-11 PEN:4.5/6 MIN:15 MAX:500 RPH:120 PLAYERS:4');
  assert.equal(p.rules.decks, 6); assert.equal(p.rules.h17, true); assert.equal(p.rules.das, true);
  assert.equal(p.rules.resplitAces, false); assert.equal(p.rules.surrender, 'late');
  assert.equal(p.rules.bjPay, 1.2); assert.equal(p.rules.peek, false); assert.equal(p.rules.obo, true);
  assert.equal(p.rules.maxHands, 3); assert.equal(p.rules.doubleOn, '9-11');
  assert.ok(Math.abs(p.rules.penetration - 0.75) < 1e-9);
  assert.deepEqual(p.table, { minBet: 15, maxBet: 500, roundsPerHour: 120, otherPlayers: 4 });
  assert.deepEqual(p.ignored, []);
});
test('parses natural language', () => {
  const p = parseRules('Eight decks, dealer stands on soft 17, no double after split, late surrender, blackjack pays 3:2, penetration 80%');
  assert.equal(p.rules.decks, 8); assert.equal(p.rules.h17, false); assert.equal(p.rules.das, false);
  assert.equal(p.rules.surrender, 'late'); assert.equal(p.rules.bjPay, 1.5); assert.equal(p.rules.penetration, 0.8);
});
test('round trips through string for every preset', () => {
  for (const pr of PRESETS) {
    const cfg = configFromPreset(pr.id);
    const back = applyParsed(defaultConfig(), parseRules(toRulesString(cfg)));
    for (const k of ['decks', 'h17', 'das', 'resplitAces', 'hitSplitAces', 'surrender', 'bjPay', 'peek', 'maxHands', 'doubleOn', 'csm'])
      assert.equal(back.rules[k], cfg.rules[k], `${pr.id}.${k}`);
    if (!cfg.rules.csm) assert.ok(Math.abs(back.rules.penetration - cfg.rules.penetration) < 1e-3);
    assert.equal(back.table.minBet, cfg.table.minBet);
    assert.equal(back.table.otherPlayers, cfg.table.otherPlayers);
  }
});
test('reports unknown words', () => {
  assert.deepEqual(parseRules('6D S17 banana').ignored, ['banana']);
});
