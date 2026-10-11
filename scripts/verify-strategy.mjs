// Compares published Illustrious 18 / Fab 4 indices against engine-derived crossings.
import { defaultRules } from '../src/core/rules.js';
import { buildStrategy } from '../src/strategy/basicStrategy.js';
import { PUBLISHED, deriveIndices, devKey, devLabel, indexFromCrossing, insuranceCrossing } from '../src/strategy/deviations.js';
const variants = [['6D S17 DAS LS', {surrender:'late'}], ['6D S17 DAS', {}], ['6D H17 DAS LS', {h17:true,surrender:'late'}], ['2D S17 DAS LS',{decks:2,surrender:'late'}]];
console.log('Insurance t* =', insuranceCrossing().toFixed(2), '-> floor idx', indexFromCrossing(insuranceCrossing(),'floor'));
for (const [name, o] of variants) {
  const rules = { ...defaultRules(), ...o };
  const t0=Date.now(); const der = deriveIndices(rules); 
  const strat = buildStrategy(rules);
  console.log(`\n== ${name} (derived in ${Date.now()-t0}ms, ${der.length} deviations)`);
  let ok=0, tot=0;
  for (const p of PUBLISHED) {
    const d = der.find(x => devKey(x)===devKey(p) && x.baseSide===p.baseSide);
    const e = d ? indexFromCrossing(d.tStar,'floor') : null;
    const applies = !(p.set==='fab4' && rules.surrender==='none');
    if (!applies) continue;
    tot++; const diff = e==null? null : e - p.idx; if (diff!=null && Math.abs(diff)<=1) ok++;
    console.log(devLabel(p).padEnd(14), 'pub', String(p.idx).padStart(3), ' engine', e==null?'  -- (no change in range / not applicable)':String(e).padStart(3)+` (t*=${d.tStar.toFixed(2)})`, diff==null?'':(diff===0?'':`  diff ${diff}`));
  }
  console.log(`within +-1: ${ok}/${tot}`);
}
