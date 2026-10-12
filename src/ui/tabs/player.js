// "Player" tab: strategy & deviations, counting accuracy, mistakes, bankroll.
import { h } from '../dom.js';
import { makeField, card } from '../fields.js';
import { devLabel } from '../../strategy/deviations.js';
import { ACT_NAMES } from '../../core/constants.js';

export function mount(root, app) {
  const F = (s) => makeField(app, s);
  const list = h('div', { class: 'checks' });
  const info = h('div', { class: 'sub' });
  const renderList = () => {
    list.innerHTML = '';
    const setup = app.setup;
    if (!setup) return;
    const dis = new Set(app.cfg.player.disabledDeviations);
    const add = (key, label, extra) => {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !dis.has(key);
      cb.addEventListener('change', () => {
        const s = new Set(app.cfg.player.disabledDeviations);
        if (cb.checked) s.delete(key); else s.add(key);
        app.cfg.player.disabledDeviations = [...s]; app.change('player.disabledDeviations');
      });
      list.append(h('label', {}, cb, h('span', {}, label, h('span', { class: 'mono', style: { marginLeft: '6px' } }, extra))));
    };
    if (setup.devs.insuranceIdx !== null) add('insurance', 'Insurance', `TC ≥ ${setup.devs.insuranceIdx}`);
    for (const d of setup.devs.list) {
      const lo = d.below, hi = d.above;
      add(d.k, devLabel(d), d.baseSide === 'below' ? `${ACT_NAMES[hi][0]} at TC ≥ ${d.idx}` : `${ACT_NAMES[lo][0]} below ${d.idx}`);
    }
    const n = setup.devs.list.length + (setup.devs.insuranceIdx !== null ? 1 : 0);
    info.textContent = `${n} deviations active under your rules. Untick any you do not want to use.`;
  };
  root.append(h('div', { class: 'stack' },
    h('div', { class: 'grid g2' },
      card('Strategy', 'Basic strategy is generated from your exact rules (never a fixed chart).',
        F({ path: 'player.deviations', label: 'Count-based deviations', type: 'select', options: [
          ['none', 'None — perfect basic strategy only'], ['insurance', 'Insurance only'], ['i18', 'Illustrious 18'],
          ['i18fab4', 'Illustrious 18 + Fab 4 surrenders'], ['full', 'Extended published set (I18 + Fab 4 + more)'], ['engine', 'Full set derived by the engine (experimental)']],
          hint: 'Published sets are Hi-Lo indices (Schlesinger / Wong). "Engine" computes ~100+ indices for your exact rules.' }),
        F({ path: 'player.tcRounding', label: 'True-count rounding', type: 'select', options: [['floor', 'Round down (standard)'], ['round', 'Nearest'], ['none', 'No rounding']], hint: 'Published indices assume you round down.' }),
        F({ path: 'player.deckResolution', label: 'Deck-estimation resolution', type: 'select', options: [[0, 'Exact'], [0.25, 'Quarter deck'], [0.5, 'Half deck'], [1, 'Full deck']], hint: 'How precisely you judge the discard tray.' }),
        h('div', { class: 'notice info' }, 'Counting system: Hi-Lo (balanced, +1 for 2–6, −1 for 10–A).'),
      ),
      card('Imperfection', 'Real players slip. Model it and see what it costs.',
        F({ path: 'player.countErrorRate', label: 'Running-count error rate (% of rounds)', scale: 100, min: 0, max: 50, step: 0.5, hint: 'Each round, this chance that your count drifts by ±1 — and stays off until the shuffle.' }),
        F({ path: 'player.mistakeRate', label: 'Basic-strategy mistake rate (% of decisions)', scale: 100, min: 0, max: 50, step: 0.5, hint: 'You play the 2nd-best action (or forget the deviation) this often.' }),
        h('div', { class: 'notice info' }, 'Try the What-If tab to compare 0%, 1%, 2%, 5%… error rates side by side.'),
      ),
    ),
    h('div', { class: 'grid g2' },
      card('Bankroll & back-counting', null,
        F({ path: 'player.bankroll', label: 'Bankroll ($)', min: 100, step: 100 }),
        F({ path: 'player.wongOutBelow', label: 'Back-count: leave when TC below', nullable: true, placeholder: 'off', min: -10, max: 5, hint: 'Blank = stay and bet the minimum at low counts. Needs other players at the table.' }),
      ),
      card('Active deviations', null, info, list)),
  ));
  const update = () => renderList();
  app.on('setup', update); app.on('cfg', () => { /* list rebuilt after setup */ });
  update();
  return { update };
}
