// Interactive tutorial: counting, true count, basic strategy, deviations, then the EV calculator.
import { h } from '../ui/dom.js';
import { Advisor } from './advisor.js';
import { ACT, ACT_NAMES } from '../core/constants.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const TAG = [0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
const rank = (v) => (v === 1 ? 'A' : v === 10 ? ['10', 'J', 'Q', 'K'][(Math.random() * 4) | 0] : String(v));
const card = (v, small) => {
  const s = SUITS[(Math.random() * 4) | 0], red = s === '♥' || s === '♦';
  return h('div', { class: 'tcard' + (red ? ' red' : '') + (small ? ' sm' : '') }, h('span', {}, rank(v), h('br'), s), h('i', {}, s));
};
const rv = () => { const w = [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 16]; let r = Math.random() * 52, v = 1; for (; v < 10; v++) { r -= w[v]; if (r < 0) break; } return v; };
const sg = (v) => (v > 0 ? '+' : '') + v;

export function openTutorial(app, { startTraining }) {
  const root = document.getElementById('tutorial');
  root.hidden = false; root.innerHTML = '';
  const close = () => { root.hidden = true; root.innerHTML = ''; try { localStorage.setItem('cutcard.tut', 'done'); } catch (e) { /* ignore */ } document.querySelector('.tr-newhere') && (document.querySelector('.tr-newhere').hidden = true); };
  let step = 0;

  const steps = [
    { t: 'Welcome to Cutcard', body: () => [
      h('p', {}, 'Cutcard trains the skills of advantage play on a 3D table, then tells you what they are worth in dollars.'),
      h('div', { class: 'tut-three' },
        h('div', {}, h('b', {}, 'Keep the count'), h('span', {}, 'Track Hi-Lo as cards fall and answer quizzes.')),
        h('div', {}, h('b', {}, 'Basic strategy'), h('span', {}, 'Make every play correctly — mistakes show their cost.')),
        h('div', {}, h('b', {}, 'Count + play'), h('span', {}, 'Combine both, with index deviations if you want.'))),
      h('p', { class: 'sub' }, 'Pick a mode at the bottom of the table and press Start. Press “EV calculator” any time to see what your skills are worth.')] },
    { t: 'Hi-Lo: three kinds of cards', body: () => {
      const wrap = h('div'); const fb = h('p', { class: 'tut-fb' }, 'Tap the value of the card. Streak: 0'); let streak = 0, cur;
      const stage = h('div', { class: 'tut-cardstage' });
      const next = () => { cur = rv(); stage.innerHTML = ''; stage.append(card(cur)); };
      const answer = (v) => { const ok = v === TAG[cur]; streak = ok ? streak + 1 : 0; fb.className = 'tut-fb ' + (ok ? 'ok' : 'bad'); fb.textContent = ok ? `Correct. Streak: ${streak}` : `Not quite — that card is ${sg(TAG[cur])}. Streak: 0`; next(); };
      next();
      wrap.append(
        h('div', { class: 'tut-three' }, h('div', {}, h('b', { class: 'pos' }, '+1'), h('span', {}, '2 3 4 5 6 — each one dealt leaves a richer shoe: good for you')), h('div', {}, h('b', {}, '0'), h('span', {}, '7 8 9 — neutral')), h('div', {}, h('b', { class: 'neg' }, '−1'), h('span', {}, '10 J Q K A — each one dealt leaves a poorer shoe: bad for you'))),
        h('p', { class: 'sub' }, 'High cards left in the shoe favour the player. A positive count means the remaining shoe is rich in tens and aces.'),
        stage, h('div', { class: 'row', style: { justifyContent: 'center' } }, [[1, '+1'], [0, '0'], [-1, '−1']].map(([v, l]) => h('button', { class: 'tr-act', onclick: () => answer(v) }, l))), fb);
      return [wrap]; } },
    { t: 'Running count', body: () => {
      const cards = Array.from({ length: 8 }, rv); const rc = cards.reduce((a, v) => a + TAG[v], 0);
      const row = h('div', { class: 'tut-cards' }, cards.map((v) => h('div', { class: 'tut-c' }, card(v, true), h('em', {}, '')))); const fb = h('p', { class: 'tut-fb' });
      const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0' });
      const go = () => { const v = parseFloat(inp.value.replace('−', '-')); if (!Number.isFinite(v)) return; const ok = v === rc;
        row.querySelectorAll('em').forEach((e, i) => { e.textContent = sg(TAG[cards[i]]); e.className = TAG[cards[i]] > 0 ? 'pos' : TAG[cards[i]] < 0 ? 'neg' : ''; });
        fb.className = 'tut-fb ' + (ok ? 'ok' : 'bad'); fb.textContent = ok ? `Yes — running count ${sg(rc)}.` : `The running count is ${sg(rc)} (you said ${sg(v)}). Add the tags under each card.`; };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      return [h('p', {}, 'Add each card’s value as you see it. The running count is the total so far. Here are 8 cards — what’s the running count?'), row,
        h('div', { class: 'row', style: { justifyContent: 'center' } }, inp, h('button', { class: 'btn primary', onclick: go }, 'Check')), fb]; } },
    { t: 'True count', body: () => {
      const out = h('div', { class: 'big' }); const info = h('p', { class: 'sub' });
      let rc = 6, dk = 3;
      const upd = () => { const tc = rc / dk; out.textContent = `True count ≈ ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}`; info.textContent = tc >= 1 ? `Each +1 true count is worth roughly +0.5% to the player — about ${(tc * 0.5 - 0.4).toFixed(1)}% edge in a typical shoe.` : 'Near zero or negative: the house is favoured. Bet the minimum.'; };
      const sl = (lab, min, max, step, v, f) => { const o = h('b', {}, v); const i = h('input', { type: 'range', min, max, step, value: v, class: 'range' }); i.addEventListener('input', () => { o.textContent = i.value; f(+i.value); upd(); }); return h('div', { class: 'tut-sl' }, h('div', { class: 'row sp' }, h('label', {}, lab), o), i); };
      upd();
      return [h('p', {}, 'The running count means more in a fresh shoe than a nearly dealt one. Divide by the decks still to be dealt to get the true count — that’s what you bet and play by.'),
        sl('Running count', -10, 20, 1, rc, (v) => (rc = v)), sl('Decks remaining', 0.5, 6, 0.5, dk, (v) => (dk = v)), out, info]; } },
    { t: 'Basic strategy', body: () => {
      const adv = new Advisor(app.cfg.rules, 'none');
      const spots = [[[10, 6], 10], [[8, 8], 6], [[1, 7], 9], [[5, 6], 6], [[10, 2], 4]];
      let i = 0; const stage = h('div', { class: 'tut-cardstage' }), fb = h('p', { class: 'tut-fb' }), btns = h('div', { class: 'row', style: { justifyContent: 'center' } });
      const load = () => {
        const [cards, up] = spots[i % spots.length]; const hand = { cards, fromSplit: false, aceSplit: false };
        stage.innerHTML = ''; stage.append(h('div', { class: 'tut-hand' }, h('span', {}, 'You'), cards.map((c) => card(c, true))), h('div', { class: 'tut-hand' }, h('span', {}, 'Dealer'), card(up, true)));
        const lg = adv.legal(hand, up, 1), right = adv.advise(hand, up, 1, 0, false).action;
        btns.innerHTML = '';
        [[ACT.HIT, 'Hit', 'hit'], [ACT.STAND, 'Stand', 'stand'], [ACT.DOUBLE, 'Double', 'double'], [ACT.SPLIT, 'Split', 'split']].forEach(([a, n, k]) => {
          const b = h('button', { class: 'tr-act', onclick: () => { const ok = a === right; fb.className = 'tut-fb ' + (ok ? 'ok' : 'bad'); fb.textContent = ok ? `Correct — ${ACT_NAMES[right]}.` : `Basic strategy says ${ACT_NAMES[right]} here.`; i++; setTimeout(load, 1300); } }, n);
          if (!lg[k]) b.disabled = true; btns.append(b);
        });
        if (lg.surrender && right === ACT.SURRENDER) btns.append(h('button', { class: 'tr-act', onclick: () => { fb.className = 'tut-fb ok'; fb.textContent = 'Correct — Surrender.'; i++; setTimeout(load, 1300); } }, 'Surrender'));
      };
      load();
      return [h('p', {}, 'Basic strategy is the mathematically best play for every hand against every dealer upcard. It’s generated here from your game’s exact rules. Try a few:'), stage, btns, fb,
        h('p', { class: 'sub' }, 'In training, every wrong play shows the correct move and roughly how much it costs.')]; } },
    { t: 'Index plays (deviations)', body: () => {
      let tc = 0; const out = h('div', { class: 'big' }), ins = h('p', { class: 'sub' }), lab = h('b', {}, '0');
      const upd = () => { out.innerHTML = ''; out.append(h('span', {}, '16 vs dealer 10: '), h('span', { class: tc >= 0 ? 'pos' : 'neg' }, tc >= 0 ? 'STAND' : 'HIT')); ins.textContent = tc >= 3 ? 'Insurance: at +3 or higher it becomes a winning bet — take it.' : 'Insurance: still a losing bet below +3.'; lab.textContent = sg(tc); };
      const i = h('input', { type: 'range', min: -4, max: 6, step: 1, value: 0, class: 'range' }); i.addEventListener('input', () => { tc = +i.value; upd(); });
      upd();
      return [h('p', {}, 'When the count is high or low enough, a different play beats basic strategy. The switch point is called an index. The most valuable are the “Illustrious 18” and “Fab 4” surrender plays.'),
        h('div', { class: 'tut-sl' }, h('div', { class: 'row sp' }, h('label', {}, 'True count'), lab), i), out, ins,
        h('p', { class: 'sub' }, 'Choose “Count + play” with index plays switched on, and the trainer checks these decisions against your own count.')]; } },
    { t: 'What is it worth?', body: () => [
      h('p', {}, 'The EV calculator turns all this into money: expected profit per hour, swings, risk of ruin, how large a bankroll you need, and how your bet spread changes things.'),
      h('div', { class: 'tut-three' }, h('div', {}, h('b', {}, 'Your game'), h('span', {}, 'Rules, decks, penetration, table limits.')), h('div', {}, h('b', {}, 'Your spread'), h('span', {}, 'How much you bet at each true count.')), h('div', {}, h('b', {}, 'Your skill'), h('span', {}, 'Use your own training results automatically.'))),
      h('p', { class: 'sub' }, 'After a session, press “Calculate EV from my play” to see what you would earn at your real accuracy.')] },
  ];

  const last = h('button', { class: 'glass accent', onclick: () => { close(); app.openEV(); } }, 'Open EV calculator');
  const body = h('div', { class: 'tut-body' }), dots = h('div', { class: 'tut-dots' }), title = h('h2', {});
  const back = h('button', { class: 'glass', onclick: () => go(step - 1) }, 'Back'), nxt = h('button', { class: 'tr-go small' });
  const render = () => {
    title.textContent = steps[step].t; body.innerHTML = ''; body.append(...steps[step].body());
    dots.innerHTML = ''; steps.forEach((_, i) => dots.append(h('i', { class: i === step ? 'on' : i < step ? 'done' : '' })));
    back.style.visibility = step ? 'visible' : 'hidden';
    nxt.textContent = step === steps.length - 1 ? 'Start training' : 'Next';
    last.style.display = step === steps.length - 1 ? '' : 'none';
  };
  const go = (n) => { step = Math.max(0, Math.min(steps.length - 1, n)); render(); };
  nxt.onclick = () => { if (step === steps.length - 1) { close(); startTraining(); } else go(step + 1); };
  root.append(h('div', { class: 'tut-panel' }, h('div', { class: 'row sp' }, h('div', { class: 'tut-step' }, 'Tutorial'), h('button', { class: 'glass', onclick: close }, 'Skip')), title, body, dots,
    h('div', { class: 'row sp', style: { marginTop: '14px' } }, back, h('div', { class: 'row' }, last, nxt))));
  root.onclick = (e) => { if (e.target === root) close(); };
  render();
}
