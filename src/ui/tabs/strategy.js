// "Strategy" tab: generated basic strategy charts with deviation markers.
import { h } from '../dom.js';
import { card } from '../fields.js';
import { cellCode } from '../../strategy/basicStrategy.js';
import { ACT_LETTER } from '../../core/constants.js';

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
export function mount(root, app) {
  const body = h('div', { class: 'stack' });
  root.append(body);
  const grid = (T, kind, keys, rowLabel, devs) => {
    const t = h('table', { class: 'bs' }, h('tr', {}, h('th', {}), ...UPS.map((u) => h('th', {}, u === 1 ? 'A' : u))));
    for (const k of keys) {
      t.append(h('tr', {}, h('td', { class: 'rowh' }, rowLabel(k)), ...UPS.map((u) => {
        const code = cellCode(T, kind, k, u);
        const dv = devs.get(`${kind}:${k}:${u}`);
        return h('td', { class: 'c-' + code, title: dv ? `${dv.label}: ${ACT_LETTER[dv.above]} at TC ≥ ${dv.idx} / ${ACT_LETTER[dv.below]} below` : '' }, code, dv ? h('sup', {}, (dv.baseSide === 'below' ? '≥' : '<') + dv.idx) : null);
      })));
    }
    return h('div', { class: 'sc' }, t);
  };
  const update = () => {
    const setup = app.setup; if (!setup) { body.textContent = 'Calculating…'; return; }
    const T = setup.strategy.initial;
    const devs = new Map(setup.devs.list.map((d) => [d.k, d]));
    body.innerHTML = '';
    body.append(h('div', { class: 'notice info' }, 'Generated from your exact rules by the EV engine. Gold tags show the Hi-Lo true-count index where you should switch to the other play (≥ index = deviate up; < index = deviate down). Hover a tag for details.'),
      h('div', { class: 'key' }, ...[['S', 'Stand', 'c-S'], ['H', 'Hit', 'c-H'], ['D', 'Double (else hit)', 'c-D'], ['Ds', 'Double (else stand)', 'c-Ds'], ['P', 'Split', 'c-P'], ['R', 'Surrender (else hit)', 'c-R'], ['Rs', 'Surrender (else stand)', 'c-R'], ['Rp', 'Surrender (else split)', 'c-R']].map(([a, b, c]) => h('span', {}, h('i', { class: c }), `${a} = ${b}`))),
      h('div', { class: 'grid g3' },
        card('Hard totals', null, grid(T, 'hard', [17, 16, 15, 14, 13, 12, 11, 10, 9, 8], (k) => (k >= 17 ? '17+' : k === 8 ? '5–8' : k), devs)),
        card('Soft totals', null, grid(T, 'soft', [20, 19, 18, 17, 16, 15, 14, 13], (k) => 'A,' + (k - 11), devs)),
        card('Pairs', null, grid(T, 'pair', [1, 10, 9, 8, 7, 6, 5, 4, 3, 2], (k) => (k === 1 ? 'A,A' : `${k === 10 ? 'T' : k},${k === 10 ? 'T' : k}`), devs))));
    if (setup.devs.insuranceIdx !== null) body.append(h('p', { class: 'sub' }, `Insurance: take it at TC ≥ ${setup.devs.insuranceIdx}. Never otherwise.`));
  };
  app.on('setup', () => { if (root.offsetParent) update(); });
  return { update };
}
