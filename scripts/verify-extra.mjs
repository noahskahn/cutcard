// Engine cross-check of the extra published plays.
import { defaultRules } from '../src/core/rules.js';
import { EXTRA, deriveIndices, devKey, devLabel, indexFromCrossing } from '../src/strategy/deviations.js';
for (const [name, o] of [['6D H17 LS', { h17: true, surrender: 'late' }], ['6D S17 LS', { surrender: 'late' }]]) {
  const rules = { ...defaultRules(), ...o }; const der = deriveIndices(rules);
  console.log('\n==', name);
  for (const p of EXTRA) {
    if (p.h17 !== undefined && p.h17 !== rules.h17) continue;
    const d = der.find((x) => devKey(x) === devKey(p) && x.baseSide === p.baseSide);
    console.log(devLabel(p).padEnd(16), 'chart', String(p.idx).padStart(3), ' engine', d ? String(indexFromCrossing(d.tStar, 'floor')).padStart(3) + ` (t*=${d.tStar.toFixed(2)})` : '  -- (not a deviation under these rules)');
  }
}
