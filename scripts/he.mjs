import { defaultRules } from '../src/core/rules.js';
import { buildStrategy } from '../src/strategy/basicStrategy.js';
import { strategyEV } from '../src/strategy/houseEdge.js';
const cases = [
 ['6D S17 DAS', {}],['6D S17 DAS LS', {surrender:'late'}],['6D H17 DAS', {h17:true}],['6D H17 DAS 6:5', {h17:true,bjPay:1.2}],
 ['8D S17 DAS', {decks:8}],['2D S17 DAS', {decks:2}],['1D S17 noDAS', {decks:1,das:false}],['1D S17 DAS',{decks:1}],
 ['6D S17 noDAS', {das:false}],['6D S17 DAS RSA', {resplitAces:true}],['6D S17 DAS maxHands2', {maxHands:2}],['6D S17 DAS double9-11',{doubleOn:'9-11'}],
 ['6D S17 DAS ENHC OBO',{peek:false}],['6D S17 DAS ENHC all',{peek:false,obo:false}],
];
for (const [n,o] of cases){const r={...defaultRules(),...o};const S=buildStrategy(r);console.log(n.padEnd(24),(strategyEV(r,S)*100).toFixed(3)+'%');}
