// Trainer UI: top bar, HUD, dock (actions / quizzes / feedback), settings drawer, review.
import { h } from '../ui/dom.js';
import { makeField } from '../ui/fields.js';
import { Scene } from './scene.js';
import { Session } from './session.js';
import { ACT } from '../core/constants.js';

const KEY = 'cutcard.trainer.v1';
const DEFAULTS = { mode: 'count', cps: 2.5, others: 3, quizFreq: 'round', quizN: 14, quizType: 'running', tol: 1, showCount: false, showTags: false, showLabels: true, devSet: 'i18fab4', focus: 'all' };
const MODES = {
  count: ['Keep the count', 'Hi-Lo quizzes', 'Watch the whole table deal and keep the Hi-Lo running count in your head. You will be quizzed along the way.'],
  strategy: ['Basic strategy', 'zoomed in', 'The camera swoops in on your hand. Choose the correct play for every hand — you will see what each mistake costs.'],
  both: ['Count + deviations', 'the full game', 'Keep the count from the wide view, then make every play using index deviations from your own true count.'],
};
const ACTIONS = [[ACT.HIT, 'Hit', 'H', 'hit'], [ACT.STAND, 'Stand', 'S', 'stand'], [ACT.DOUBLE, 'Double', 'D', 'double'], [ACT.SPLIT, 'Split', 'P', 'split'], [ACT.SURRENDER, 'Surrender', 'R', 'surrender']];

export function mountTrainer(root, app) {
  let set = { ...DEFAULTS };
  try { Object.assign(set, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { /* ignore */ } };

  // ---------------- structure
  const stageEl = h('div', { class: 'tr-stage' });
  const hud = h('div', { class: 'tr-hud' });
  const fb = h('div', { class: 'tr-fb' });
  const panel = h('div', { class: 'tr-panelslot' });
  const dock = h('div', { class: 'tr-dock' }, fb, panel);
  const drawer = h('div', { class: 'tr-drawer' });
  const startBox = h('div', { class: 'tr-start' });
  const review = h('div', { class: 'tr-review', hidden: true });
  const modeBtns = Object.entries(MODES).map(([k, [t, sub]]) => h('button', { 'data-m': k, onclick: () => setMode(k) }, t, h('small', {}, sub)));
  const statAcc = h('b', {}, '—'), statPlay = h('b', {}, '—'), statStreak = h('b', {}, '0');
  const pauseBtn = h('button', { class: 'btn small', onclick: () => session.togglePause() }, 'Pause');
  const top = h('div', { class: 'tr-top' }, h('div', { class: 'tr-modes' }, modeBtns),
    h('div', { class: 'tr-stats' },
      h('div', { class: 'tr-stat' }, h('label', {}, 'Count accuracy'), statAcc),
      h('div', { class: 'tr-stat' }, h('label', {}, 'Play accuracy'), statPlay),
      h('div', { class: 'tr-stat' }, h('label', {}, 'Streak'), statStreak),
      pauseBtn,
      h('button', { class: 'btn small', onclick: () => drawer.classList.toggle('open') }, 'Settings'),
      h('button', { class: 'btn small', onclick: () => endSession() }, 'End & review')));
  root.append(h('div', { class: 'tr-root' }, top, h('div', { class: 'tr-body' }, stageEl, hud, dock, drawer, startBox, review)));

  const scene = new Scene(stageEl);
  const ui = {
    clearDock(keepFb) { panel.innerHTML = ''; if (!keepFb) fb.classList.remove('on'); },
    onPause(p) { pauseBtn.textContent = p ? 'Resume' : 'Pause'; scene.banner(p ? 'Paused' : '', p ? 60000 : 1); if (!p) scene._banner.classList.remove('on'); },
    updateCount(shoe) {
      hud.innerHTML = '';
      if (!set.showCount || set.mode === 'strategy') return;
      const chip = (l, v) => h('div', { class: 'tr-chip' }, h('label', {}, l), h('b', {}, v));
      const sg = (v) => (v > 0 ? '+' : '') + v;
      hud.append(chip('Running', sg(shoe.rc)), chip('Decks left', shoe.decksEst.toFixed(1)), chip('True count', sg(shoe.tcFloor)));
    },
    updateStats(s) {
      const pct = (o) => (o.n ? Math.round((o.ok / o.n) * 100) + '%' : '—');
      statAcc.textContent = pct(s.count) + (s.count.n ? ` (${s.count.n})` : '');
      statPlay.textContent = pct(s.strat) + (s.strat.n ? ` (${s.strat.n})` : '');
      statStreak.textContent = (s.streak || 0) + (s.best ? ` · best ${s.best}` : '');
    },
    feedback(kind, title, small) {
      if (!kind) { fb.classList.remove('on'); return; }
      fb.className = 'tr-fb on ' + kind; fb.innerHTML = '';
      fb.append(title); if (small) fb.append(h('small', {}, small));
    },
    shake() { stageEl.classList.remove('tr-shake'); void stageEl.offsetWidth; stageEl.classList.add('tr-shake'); },
    ask(prompt, type, hint) {
      return new Promise((resolve) => {
        panel.innerHTML = '';
        if (type === 'yesno') {
          const done = (v) => { off(); resolve(v); };
          const b = (t, v, k) => h('button', { class: 'tr-act', onclick: () => done(v) }, t, h('kbd', {}, k));
          const keyh = (e) => { const k = e.key.toLowerCase(); if (k === 'y') done(true); else if (k === 'n') done(false); };
          const off = () => document.removeEventListener('keydown', keyh);
          document.addEventListener('keydown', keyh);
          panel.append(h('div', { class: 'tr-quiz' }, h('h4', {}, prompt), h('div', { class: 'row' }, b('Yes, insure', true, 'Y'), b('No thanks', false, 'N'))));
          return;
        }
        const inp = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
        const go = () => { const v = parseFloat(inp.value.replace('−', '-')); if (Number.isFinite(v)) resolve(v); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
        panel.append(h('div', { class: 'tr-quiz' }, h('h4', {}, prompt), h('div', { class: 'row' }, inp, h('button', { class: 'btn primary', onclick: go }, 'Submit')), hint ? h('small', {}, hint) : null));
        setTimeout(() => inp.focus(), 30);
      });
    },
    chooseAction(lg, showSur) {
      return new Promise((resolve) => {
        panel.innerHTML = '';
        const off = () => document.removeEventListener('keydown', keyh);
        const pick = (a) => { off(); resolve(a); };
        const btns = ACTIONS.filter(([a]) => a !== ACT.SURRENDER || showSur).map(([a, name, k, lgk]) => {
          const b = h('button', { class: 'tr-act', onclick: () => pick(a) }, name, h('kbd', {}, k));
          if (!lg[lgk]) b.disabled = true; return [a, k, b];
        });
        const keyh = (e) => {
          if (e.target.tagName === 'INPUT') return;
          const k = e.key.toUpperCase();
          const hit = btns.find(([, kk]) => kk === k); if (hit && !hit[2].disabled) pick(hit[0]);
        };
        document.addEventListener('keydown', keyh);
        panel.append(h('div', { class: 'tr-actions' }, btns.map((b) => b[2])));
      });
    },
  };

  const session = new Session({ scene, ui, settings: set, getRules: () => app.cfg.rules });

  // ---------------- controls
  function setMode(m) {
    set.mode = m; save(); markModes();
    if (session.tk) { session.setMode(m); ui.updateCount(session.shoe); }
    renderStart(); renderDrawer();
  }
  function markModes() { modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.m === set.mode)); }
  function begin() { startBox.hidden = true; review.hidden = true; session.stats = session.freshStats(); ui.updateStats(session.stats); session.start(); }
  function renderStart() {
    const [t, , d] = MODES[set.mode];
    startBox.innerHTML = '';
    startBox.append(h('div', { class: 'box' }, h('h2', {}, t), h('p', {}, d),
      h('p', { style: { fontSize: '12px' } }, 'Uses the rules from your Analyzer game. Space pauses · H S D P R to play · Enter submits a count.'),
      h('button', { class: 'btn primary', onclick: begin }, 'Start training')));
  }
  function endSession() {
    if (!session.tk && startBox.hidden === false) return;
    session.stop(); scene.banner('', 1); showReview();
  }
  function showReview() {
    const s = session.stats, c = s.count;
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const agg = new Map();
    for (const m of s.strat.mistakes) { const k = `${m.desc}|${m.correct}`; const e = agg.get(k) || { ...m, n: 0, cost: 0, chosen: new Set() }; e.n++; e.cost += m.cost; e.chosen.add(m.chosen); agg.set(k, e); }
    const rows = [...agg.values()].sort((a, b) => b.cost - a.cost || b.n - a.n).slice(0, 12);
    const mins = ((Date.now() - s.started) / 60000).toFixed(1);
    review.innerHTML = ''; review.hidden = false;
    review.append(h('div', { style: { maxWidth: '760px', margin: '0 auto' } },
      h('h2', { style: { margin: '0 0 4px' } }, 'Session review'),
      h('p', { class: 'sub' }, `${mins} min · ${c.n} count quizzes · ${s.strat.n} play decisions · best streak ${s.best || 0}`),
      h('div', { class: 'grid g3' },
        kcard('Count accuracy', c.n ? Math.round((c.ok / c.n) * 100) + '%' : '—', c.n ? `avg response ${avg(c.times).toFixed(1)}s` : 'no count quizzes'),
        kcard('Play accuracy', s.strat.n ? Math.round((s.strat.ok / s.strat.n) * 100) + '%' : '—', `${s.strat.mistakes.length} mistakes`),
        kcard('EV given away', `${(s.strat.mistakes.reduce((a, m) => a + m.cost, 0) * 100).toFixed(1)}%`, 'of one bet in total')),
      rows.length ? h('table', { class: 't' }, h('tr', {}, ...['Spot', 'You played', 'Correct', 'Times', 'EV lost'].map((x) => h('th', {}, x))),
        ...rows.map((r) => h('tr', {}, h('td', {}, r.desc + (r.dev ? ' (index play)' : '')), h('td', {}, [...r.chosen].join(', ')), h('td', {}, r.correct), h('td', {}, String(r.n)), h('td', {}, (r.cost * 100).toFixed(1) + '%')))) : h('p', { class: 'sub' }, 'No mistakes recorded — nice.'),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '16px' } },
        h('button', { class: 'btn primary', onclick: begin }, 'New session'), h('button', { class: 'btn', onclick: () => { review.hidden = true; startBox.hidden = false; } }, 'Back'))));
  }
  const kcard = (l, v, s) => h('div', { class: 'kpi', style: { '--c': '#4cc9a0' } }, h('label', {}, l), h('b', {}, v), h('small', {}, s));

  // ---------------- settings drawer
  const sel = (key, opts, after) => { const s = h('select', {}, opts.map(([v, l]) => h('option', { value: String(v) }, l))); s.value = String(set[key]); s.addEventListener('change', () => { const o = opts.find(([v]) => String(v) === s.value); set[key] = o[0]; save(); after && after(); renderDrawer(); }); return s; };
  const tog = (key, after) => { const i = h('input', { type: 'checkbox' }); i.checked = !!set[key]; i.addEventListener('change', () => { set[key] = i.checked; save(); after && after(); }); return h('label', { class: 'switch' }, i, h('span')); };
  const frow = (label, ctl, hint) => h('div', { class: 'field' }, h('label', {}, label), ctl, hint ? h('div', { class: 'hint' }, hint) : null);
  const restart = () => { if (session.tk) { clearTimeout(restart.t); restart.t = setTimeout(() => session.start(), 400); } };
  const cpsOut = h('b', {});
  function renderDrawer() {
    drawer.innerHTML = '';
    const cps = h('input', { type: 'range', min: 0.5, max: 8, step: 0.5, class: 'range', value: set.cps });
    cpsOut.textContent = set.cps + ' cards/s';
    cps.addEventListener('input', () => { set.cps = +cps.value; cpsOut.textContent = set.cps + ' cards/s'; session.applySpeed(); });
    cps.addEventListener('change', save);
    const items = [
      h('div', { class: 'row sp' }, h('b', {}, 'Trainer settings'), h('button', { class: 'btn small', onclick: () => drawer.classList.remove('open') }, 'Close')),
      h('h5', {}, 'Pace'), h('div', { class: 'row sp' }, h('label', {}, 'Dealing speed'), cpsOut), cps,
      h('h5', {}, 'Count quizzes'),
      frow('Ask', sel('quizFreq', [['round', 'End of every round'], ['cards', 'Every N cards'], ['random', 'Random moment each round']])),
      set.quizFreq === 'cards' ? frow('N cards', (() => { const i = h('input', { type: 'number', min: 3, max: 80, value: set.quizN }); i.addEventListener('change', () => { set.quizN = Math.max(3, +i.value || 14); save(); }); return i; })()) : null,
      frow('Question', sel('quizType', [['running', 'Running count'], ['true', 'True count'], ['mixed', 'Mix of both']])),
      frow('True-count tolerance', sel('tol', [[0.5, '± 0.5'], [1, '± 1'], [2, '± 2']])),
      h('h5', {}, 'Play drills'),
      frow('Hand focus', sel('focus', [['all', 'Everything'], ['hard', 'Hard totals'], ['soft', 'Soft hands'], ['pairs', 'Pairs'], ['double', 'Double-down spots'], ['surrender', 'Surrender spots']])),
      frow('Index plays', sel('devSet', [['i18fab4', 'Illustrious 18 + Fab 4'], ['i18', 'Illustrious 18'], ['full', 'Extended published set'], ['engine', 'Full engine set']], restart), 'Used in "Count + deviations".'),
      frow('Hand labels', tog('showLabels')),
      h('h5', {}, 'Training wheels'),
      frow('Show running count', tog('showCount', () => ui.updateCount(session.shoe || { rc: 0, decksEst: 1, tcFloor: 0 }))),
      frow('Show +1 / 0 / −1 tags', tog('showTags')),
      h('h5', {}, 'Table'),
      frow('Other players', sel('others', [0, 1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), restart)),
      makeField(app, { path: 'rules.decks', label: 'Decks', type: 'select', options: [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']] }),
      makeField(app, { path: 'rules.penetration', label: 'Penetration %', scale: 100, min: 30, max: 90 }),
      makeField(app, { path: 'rules.h17', label: 'Dealer hits soft 17', type: 'bool' }),
      makeField(app, { path: 'rules.das', label: 'Double after split', type: 'bool' }),
      makeField(app, { path: 'rules.surrender', label: 'Surrender', type: 'select', options: [['none', 'None'], ['late', 'Late'], ['early', 'Early']] }),
      makeField(app, { path: 'rules.bjPay', label: 'Blackjack pays', type: 'select', options: [[1.5, '3:2'], [1.2, '6:5']] }),
      h('p', { class: 'sub', style: { marginTop: '10px' } }, 'Rule changes are shared with the Analyzer.')];
    drawer.append(...items.filter(Boolean));
  }

  // restart when rules change
  app.on('cfg', () => { if (app.trainerActive) restart(); });
  document.addEventListener('keydown', (e) => {
    if (!app.trainerActive || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space' && session.tk) { e.preventDefault(); session.togglePause(); }
  });

  window.__trainer = { session, scene, set };
  markModes(); renderStart(); renderDrawer(); ui.updateStats(session.stats);
  scene.setRules({ bjPay: app.cfg.rules.bjPay, h17: app.cfg.rules.h17, penetration: app.cfg.rules.penetration });
  scene.setSeats(set.others + 1, Math.floor((set.others + 1) / 2));
  scene.camera(set.mode === 'strategy' ? 'close' : 'wide', 0);
  return {
    show() { scene.camera(set.mode === 'strategy' ? 'close' : 'wide', 0); },
    hide() { if (session.tk) { session.stop(); startBox.hidden = false; renderStart(); } },
  };
}
