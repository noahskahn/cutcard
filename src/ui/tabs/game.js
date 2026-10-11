// "Game" tab: presets, rules, table & pace, costs, paste/copy table rules.
import { h } from '../dom.js';
import { makeField, card } from '../fields.js';
import { PRESETS, configFromPreset } from '../../core/presets.js';
import { parseRules, toRulesString, applyParsed } from '../../core/rulesParser.js';
import { validateConfig } from '../../core/rules.js';

export function mount(root, app) {
  const F = (s) => makeField(app, s);
  const presetBox = h('div', { class: 'presets' });
  const renderPresets = () => {
    presetBox.innerHTML = '';
    for (const p of PRESETS) {
      presetBox.append(h('button', { class: 'preset' + (app.cfg.preset === p.id ? ' sel' : ''), title: p.blurb, onclick: () => {
        const c = configFromPreset(p.id);
        app.cfg.rules = c.rules; app.cfg.table = c.table; app.cfg.spread = c.spread; app.cfg.preset = p.id;
        app.cfg.player.bankroll = c.player.bankroll;
        app.setCfg(app.cfg);
      } }, h('b', {}, p.name, h('span', { class: 'badge b-' + p.tag }, p.tag)), h('small', {}, p.blurb)));
    }
  };

  const warn = h('div');
  const ta = h('textarea', { rows: 3, readonly: true });
  const paste = h('textarea', { rows: 3, placeholder: 'Paste rules here, e.g.  6D H17 DAS NoRSA LS 3:2 PEEK SPL4 DBL:ANY PEN:75% MIN:25 MAX:500 RPH:90 PLAYERS:2\n…or plain English: "eight decks, dealer stands on soft 17, no surrender, blackjack pays 6:5"' });
  const feedback = h('div', { class: 'sub', style: { marginTop: '6px' } });
  paste.addEventListener('input', () => {
    const p = parseRules(paste.value);
    feedback.innerHTML = '';
    if (!paste.value.trim()) return;
    feedback.append(h('div', { class: 'notice good' }, 'Understood: ' + (p.understood.join(' · ') || 'nothing')));
    if (p.ignored.length) feedback.append(h('div', { class: 'notice' }, 'Ignored: ' + p.ignored.join(', ')));
  });
  const copyMsg = h('span', { class: 'sub' });
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); copyMsg.textContent = msg; } catch (e) { copyMsg.textContent = 'Copy failed — select the text manually.'; } setTimeout(() => (copyMsg.textContent = ''), 2500); };

  root.append(
    h('div', { class: 'stack' },
      card('Start from a preset', 'One click sets every rule, table and spread default. Everything below stays editable.', presetBox),
      h('div', { class: 'grid g3' },
        card('Rules', 'Dealer, payout and player options.',
          F({ path: 'rules.decks', label: 'Number of decks', type: 'select', options: [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']] }),
          F({ path: 'rules.h17', label: 'Dealer hits soft 17 (H17)', type: 'bool', hint: 'Off = dealer stands on all 17s (S17), better for you by ~0.2%.' }),
          F({ path: 'rules.bjPay', label: 'Blackjack pays', type: 'select', options: [[1.5, '3:2'], [1.4, '7:5'], [1.2, '6:5'], [1, '1:1'], [2, '2:1']], hint: '6:5 costs about 1.4% — avoid.' }),
          F({ path: 'rules.doubleOn', label: 'Doubling allowed on', type: 'select', options: [['any', 'Any two cards'], ['9-11', 'Hard 9, 10, 11'], ['10-11', 'Hard 10, 11'], ['none', 'Never']] }),
          F({ path: 'rules.das', label: 'Double after split (DAS)', type: 'bool' }),
          F({ path: 'rules.maxHands', label: 'Max hands after resplitting', type: 'select', options: [[2, '2 (no resplit)'], [3, '3'], [4, '4'], [6, '6'], [8, '8']] }),
          F({ path: 'rules.resplitAces', label: 'Resplit aces (RSA)', type: 'bool' }),
          F({ path: 'rules.hitSplitAces', label: 'Hit split aces', type: 'bool', hint: 'Normally you get one card per split ace.' }),
          F({ path: 'rules.surrender', label: 'Surrender', type: 'select', options: [['none', 'None'], ['late', 'Late'], ['early', 'Early']] }),
          F({ path: 'rules.peek', label: 'Dealer peeks for blackjack (US)', type: 'bool', hint: 'Off = European no-hole-card game.' }),
          F({ path: 'rules.obo', label: 'Lose original bet only to dealer BJ', type: 'bool', showIf: (c) => !c.rules.peek, hint: 'No-hole-card games only: extra bets from doubles/splits are returned.' }),
        ),
        card('Table & pace', 'Penetration and speed drive how much a count is worth.',
          F({ path: 'rules.penetration', label: 'Penetration (% dealt before shuffle)', type: 'number', scale: 100, min: 30, max: 95, step: 1, disabledIf: (c) => c.rules.csm, hint: '75% on a 6-deck shoe means 4.5 decks dealt, cut card 1.5 decks from the end.' }),
          F({ path: 'rules.csm', label: 'Continuous shuffler (CSM)', type: 'bool', hint: 'Cards are reshuffled constantly — counting is useless.' }),
          F({ path: 'table.otherPlayers', label: 'Other players at table', type: 'select', options: [[0, '0 (heads-up)'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], hint: 'Their cards shape the count and use up penetration.' }),
          F({ path: 'table.roundsPerHour', label: 'Rounds per hour', min: 20, max: 300, hint: 'Heads-up ≈ 200, full table ≈ 60–80.' }),
          F({ path: 'table.minBet', label: 'Table minimum bet ($)', min: 1 }),
          F({ path: 'table.maxBet', label: 'Table maximum bet ($)', min: 1 }),
          F({ path: 'table.increment', label: 'Bet rounding / chip size ($)', min: 0, hint: 'Bets are rounded to this multiple.' }),
        ),
        card('Costs, rake & comps', 'Everything that eats into (or adds to) your hourly. All optional.',
          F({ path: 'costs.hourlyCost', label: 'Fixed cost per hour ($)', min: 0, hint: 'Dealer tips, travel, food, labour, cover play…' }),
          F({ path: 'costs.rakePerHand', label: 'Rake / fee per hand ($)', min: 0, step: 0.05, hint: 'Flat fee each hand you play (online tables, side-fees).' }),
          F({ path: 'costs.winCommission', label: 'Commission on winning hands (%)', min: 0, max: 20, step: 0.5, hint: 'Taken from the profit of winning hands (e.g. 5% in some variants).' }),
          F({ path: 'costs.compPct', label: 'Comps / cashback (% of money wagered)', min: 0, max: 5, step: 0.05, hint: 'Value of comps, free play, rebates as % of total bets.' }),
          warn,
        ),
      ),
      h('div', { class: 'grid g2' },
        card('Copy these table rules', 'Share a game with a friend or the web: copy this line (or the link) and anyone can paste it in.', ta,
          h('div', { class: 'row', style: { marginTop: '8px' } },
            h('button', { class: 'btn small', onclick: () => copy(ta.value, 'Rules copied.') }, 'Copy rules'),
            h('button', { class: 'btn small', onclick: () => copy(app.shareLink(), 'Link to full setup copied.') }, 'Copy share link (everything)'), copyMsg)),
        card('Paste table rules', 'Write down the rules at a table and plug them in. Order does not matter.', paste,
          h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn primary small', onclick: () => {
            const p = parseRules(paste.value);
            if (!p.understood.length) return;
            applyParsed(app.cfg, p); app.cfg.preset = null; app.setCfg(app.cfg); renderPresets(); feedback.prepend(h('div', { class: 'notice good' }, 'Applied.'));
          } }, 'Apply to calculator')), feedback),
      ),
    ),
  );
  const update = () => {
    ta.value = toRulesString(app.cfg);
    renderPresets();
    warn.innerHTML = '';
    for (const w of validateConfig(app.cfg)) warn.append(h('div', { class: 'notice' }, w));
  };
  app.on('cfg', update);
  update();
  return { update };
}
