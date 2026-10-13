// Home screen: the 3D table fills the page; everything else floats on top of it.
//   brand (top-left) · tutorial / settings / EV calculator (top-right) · mode picker + Start (bottom)
//   while training: stats bar, action buttons, quizzes, feedback.
import { h } from '../ui/dom.js';
import { makeField } from '../ui/fields.js';
import { Scene } from './scene.js';
import { Session } from './session.js';
import { ACT } from '../core/constants.js';
import { mistakeBank } from './mistakes.js';

const KEY = 'cutcard.trainer.v1';
const DEFAULTS = { mode: 'count', cps: 2.5, others: 3, quizFreq: 'round', quizN: 14, quizType: 'running', tol: 1, showCount: false, showTags: false, showLabels: true, devSet: 'i18fab4', devOn: true, focus: 'all' };
const MODES = {
  count: { title: 'Keep the count', sub: 'Hi-Lo running & true count', desc: 'Watch the whole table deal and keep the Hi-Lo count in your head. You’ll be quizzed along the way.' },
  strategy: { title: 'Basic strategy', sub: 'zoomed in on your hand', desc: 'The camera moves in on your hand and the dealer’s. Pick the right play every time and see what each mistake costs.' },
  both: { title: 'Count + play', sub: 'the real thing', desc: 'Keep the count from the wide view and make every play yourself — with index deviations if you like.' },
};
const ACTIONS = [[ACT.HIT, 'Hit', 'H', 'hit'], [ACT.STAND, 'Stand', 'S', 'stand'], [ACT.DOUBLE, 'Double', 'D', 'double'], [ACT.SPLIT, 'Split', 'P', 'split'], [ACT.SURRENDER, 'Surrender', 'R', 'surrender']];
const camFor = (m) => (m === 'strategy' ? 'close' : m === 'both' ? 'both' : 'wide');

export function mountTrainer(root, app) {
  let set = { ...DEFAULTS };
  try { Object.assign(set, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { /* ignore */ } };
  root.className = 'tr-root';

  // ---------------- structure
  const stageEl = h('div', { class: 'tr-stage' });
  const hud = h('div', { class: 'tr-hud' });
  const fb = h('div', { class: 'tr-fb' });
  const panel = h('div', { class: 'tr-panelslot' });
  const dock = h('div', { class: 'tr-dock' }, fb, panel);
  const drawer = h('div', { class: 'tr-drawer' });
  const review = h('div', { class: 'tr-review', hidden: true });
  const logList = h('div', { class: 'tr-loglist' });
  const log = h('div', { class: 'tr-log', hidden: true }, h('div', { class: 'tr-loghead' }, h('b', {}, 'Decisions'), h('span', {}, 'newest first')), logList);

  const brand = h('div', { class: 'tr-brand' }, h('img', { src: 'assets/logo.svg', width: 24, height: 24, alt: '' }), h('b', {}, 'CUTCARD'));
  const corner = h('div', { class: 'tr-corner' },
    h('button', { class: 'glass', onclick: () => openTutorial() }, 'Tutorial'),
    h('button', { class: 'glass', onclick: () => drawer.classList.toggle('open') }, 'Settings'),
    h('button', { class: 'glass accent', onclick: () => app.openEV() }, 'EV calculator ›'));

  // stats bar (visible while training)
  const statAcc = h('b', {}, '—'), statPlay = h('b', {}, '—'), statStreak = h('b', {}, '0');
  const modeLbl = h('b', {});
  const pauseBtn = h('button', { class: 'glass', onclick: () => session.togglePause() }, 'Pause');
  const statbar = h('div', { class: 'tr-statbar', hidden: true },
    h('div', { class: 'tr-stat' }, h('label', {}, 'Mode'), modeLbl),
    h('div', { class: 'tr-stat' }, h('label', {}, 'Count'), statAcc),
    h('div', { class: 'tr-stat' }, h('label', {}, 'Plays'), statPlay),
    h('div', { class: 'tr-stat' }, h('label', {}, 'Streak'), statStreak),
    pauseBtn, h('button', { class: 'glass', onclick: () => endSession() }, 'End'));

  // launch panel (visible while idle)
  const modeCards = Object.entries(MODES).map(([k, m]) => h('button', { class: 'tr-mode', 'data-m': k, onclick: () => setMode(k) }, h('b', {}, m.title), h('span', {}, m.sub)));
  const desc = h('p', { class: 'tr-desc' });
  const opts = h('div', { class: 'tr-opts' });
  const hint = h('button', { class: 'tr-newhere', onclick: () => openTutorial() }, 'New here? Take the 2-minute tutorial →');
  const launch = h('div', { class: 'tr-launch' }, hint, h('div', { class: 'tr-modes3' }, modeCards), desc, opts,
    h('button', { class: 'tr-go', onclick: () => begin() }, 'Start training'));

  root.append(h('div', { class: 'tr-body' }, stageEl, hud, log, brand, corner, statbar, dock, launch, drawer, review));

  const scene = new Scene(stageEl);
  const ui = {
    clearDock(keepFb) { panel.innerHTML = ''; if (!keepFb) fb.classList.remove('on'); },
    onPause(p) { pauseBtn.textContent = p ? 'Resume' : 'Pause'; if (p) scene.banner('Paused — press Space', 600000); else scene._banner.classList.remove('on'); },
    updateCount(shoe) {
      hud.innerHTML = '';
      if (!set.showCount || set.mode === 'strategy') return;
      const chip = (l, v) => h('div', { class: 'tr-chip' }, h('label', {}, l), h('b', {}, v));
      const sg = (v) => (v > 0 ? '+' : '') + v;
      hud.append(chip('Running', sg(shoe.rc)), chip('Decks left', shoe.decksEst.toFixed(1)), chip('True count', sg(shoe.tcFloor)));
    },
    updateStats(s) {
      const pct = (o) => (o.n ? Math.round((o.ok / o.n) * 100) + '%' : '—');
      statAcc.textContent = pct(s.count); statPlay.textContent = pct(s.strat);
      statStreak.textContent = (s.streak || 0) + (s.best ? ` · best ${s.best}` : '');
    },
    feedback(kind, title, small) {
      if (!kind) { fb.classList.remove('on'); return; }
      fb.className = 'tr-fb on ' + kind; fb.innerHTML = '';
      fb.append(title); if (small) fb.append(h('small', {}, small));
    },
    logEntry(kind, ok, info) {
      const costTxt = !ok && kind === 'strat' && info.cost > 0.004 ? `−${(info.cost * 100).toFixed(1)}%` : '';
      const sub = kind === 'strat'
        ? (ok ? `${info.correct}${info.dev ? ' · index play' : ''}` : `${info.chosen} → ${info.correct}`)
        : (ok ? `${info.chosen}` : `${info.chosen} → ${info.correct}`);
      const row = h('div', { class: 'tr-logrow ' + (ok ? 'ok' : 'bad') },
        h('i', {}, ok ? '✓' : '✗'), h('div', {}, h('b', {}, info.desc || ''), h('span', {}, sub)), costTxt ? h('em', {}, costTxt) : null);
      logList.prepend(row);
      while (logList.children.length > 40) logList.lastChild.remove();
    },
    shake() { stageEl.classList.remove('tr-shake'); void stageEl.offsetWidth; stageEl.classList.add('tr-shake'); },
    ask(prompt, type, hintTxt) {
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
        panel.append(h('div', { class: 'tr-quiz' }, h('h4', {}, prompt), h('div', { class: 'row' }, inp, h('button', { class: 'btn primary', onclick: go }, 'Submit')), hintTxt ? h('small', {}, hintTxt) : null));
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
          const k = e.key.toUpperCase(); const hit = btns.find(([, kk]) => kk === k); if (hit && !hit[2].disabled) pick(hit[0]);
        };
        document.addEventListener('keydown', keyh);
        panel.append(h('div', { class: 'tr-actions' }, btns.map((b) => b[2])));
      });
    },
  };

  const session = new Session({ scene, ui, settings: set, getRules: () => app.cfg.rules });

  // ---------------- state transitions
  function showIdle() {
    statbar.hidden = true; launch.hidden = false; log.hidden = true; hud.innerHTML = ''; ui.clearDock(); session.paused = false; pauseBtn.textContent = 'Pause';
    scene._banner.classList.remove('on');
  }
  function setMode(m) {
    const changed = m !== set.mode, was = !!session.tk;
    if (was) { session.stop(); scene.clearInstant(); review.hidden = true; }
    set.mode = m; save(); markModes(); renderOpts(); showIdle(); session.applySpeed(); session.layoutScene();
    if (changed || was) scene.camera(camFor(m), 2000);   // camera glides to the new mode's view
  }
  function markModes() { modeCards.forEach((b) => b.classList.toggle('on', b.dataset.m === set.mode)); desc.textContent = MODES[set.mode].desc; }
  function begin() {
    review.hidden = true; launch.hidden = true; statbar.hidden = false; logList.innerHTML = ''; log.hidden = false;
    modeLbl.textContent = MODES[set.mode].title;
    session.stats = session.freshStats(); session.roundNo = 0; ui.updateStats(session.stats);
    try { localStorage.setItem('cutcard.tut', localStorage.getItem('cutcard.tut') || 'skipped'); } catch (e) { /* ignore */ }
    session.start();
  }
  function endSession() { statbar.hidden = true; log.hidden = true; session.stop(); scene.banner('', 1); scene._banner.classList.remove('on'); showReview(); }
  function backToTable() { review.hidden = true; scene.clearInstant(); showIdle(); scene.camera(camFor(set.mode), 1600); }

  function mistakesRow() {
    const n = mistakeBank.count();
    const on = h('input', { type: 'checkbox' }); on.checked = set.focus === 'mistakes' && n > 0; on.disabled = n === 0;
    on.addEventListener('change', () => { set.focus = on.checked ? 'mistakes' : 'all'; save(); });
    return h('label', { class: 'tr-optrow' + (n ? '' : ' dim') }, h('span', { class: 'switch' }, on, h('span')), n ? `Drill only my mistakes (${n} saved)` : 'Drill my mistakes (none saved yet)');
  }
  ui.updateMistakes = () => renderOpts();
  function renderOpts() {
    opts.innerHTML = '';
    if (set.mode !== 'count') opts.append(mistakesRow());
    if (set.mode !== 'both') return;
    const dev = h('input', { type: 'checkbox' }); dev.checked = set.devOn;
    dev.addEventListener('change', () => { set.devOn = dev.checked; save(); renderOpts(); });
    const sel = h('select', {}, [['i18', 'Illustrious 18'], ['i18fab4', 'Illustrious 18 + Fab 4'], ['full', 'Extended set'], ['engine', 'Full engine set']].map(([v, l]) => h('option', { value: v }, l)));
    sel.value = set.devSet; sel.addEventListener('change', () => { set.devSet = sel.value; save(); });
    opts.append(h('label', { class: 'tr-optrow' }, h('span', { class: 'switch' }, dev, h('span')), 'Include index plays (deviations)'));
    if (set.devOn) opts.append(sel);
  }

  // ---------------- session review
  function showReview() {
    const s = session.stats, c = s.count;
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const agg = new Map();
    for (const m of s.strat.mistakes) { const k = `${m.desc}|${m.correct}`; const e = agg.get(k) || { ...m, n: 0, cost: 0, chosen: new Set() }; e.n++; e.cost += m.cost; e.chosen.add(m.chosen); agg.set(k, e); }
    const rows = [...agg.values()].sort((a, b) => b.cost - a.cost || b.n - a.n).slice(0, 10);
    const mins = ((Date.now() - s.started) / 60000).toFixed(1);
    const kcard = (l, v, sub) => h('div', { class: 'kpi', style: { '--c': '#4cc9a0' } }, h('label', {}, l), h('b', {}, v), h('small', {}, sub));
    review.innerHTML = ''; review.hidden = false;
    review.append(h('div', { class: 'tr-reviewbox' },
      h('h2', {}, 'Session review'),
      h('p', { class: 'sub' }, `${mins} min · ${c.n} count quizzes · ${s.strat.n} play decisions · best streak ${s.best || 0}`),
      h('div', { class: 'grid g3' },
        kcard('Count accuracy', c.n ? Math.round((c.ok / c.n) * 100) + '%' : '—', c.n ? `avg response ${avg(c.times).toFixed(1)}s` : 'no count quizzes'),
        kcard('Play accuracy', s.strat.n ? Math.round((s.strat.ok / s.strat.n) * 100) + '%' : '—', `${s.strat.mistakes.length} mistakes`),
        kcard('EV given away', `${(s.strat.mistakes.reduce((a, m) => a + m.cost, 0) * 100).toFixed(1)}%`, 'of one bet in total')),
      rows.length ? h('table', { class: 't' }, h('tr', {}, ...['Spot', 'You played', 'Correct', 'Times', 'EV lost'].map((x) => h('th', {}, x))),
        ...rows.map((r) => h('tr', {}, h('td', {}, r.desc + (r.dev ? ' (index play)' : '')), h('td', {}, [...r.chosen].join(', ')), h('td', {}, r.correct), h('td', {}, String(r.n)), h('td', {}, (r.cost * 100).toFixed(1) + '%')))) : h('p', { class: 'sub' }, 'No mistakes recorded — nice.'),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '18px' } },
        h('button', { class: 'tr-go small', onclick: () => { review.hidden = true; scene.clearInstant(); begin(); } }, 'New session'),
        mistakeBank.count() ? h('button', { class: 'glass', onclick: () => { set.focus = 'mistakes'; save(); review.hidden = true; scene.clearInstant(); if (set.mode === 'count') setMode('strategy'); begin(); } }, `Drill my ${mistakeBank.count()} mistakes`) : null,
        h('button', { class: 'glass', onclick: backToTable }, 'Back to table'),
        h('button', { class: 'glass accent', onclick: () => { app.openEV({ fromSession: true }); } }, 'Calculate EV from my play ›'))));
  }

  // ---------------- settings drawer
  const sel = (key, optsList, after) => { const s = h('select', {}, optsList.map(([v, l]) => h('option', { value: String(v) }, l))); s.value = String(set[key]); s.addEventListener('change', () => { const o = optsList.find(([v]) => String(v) === s.value); set[key] = o[0]; save(); after && after(); renderDrawer(); }); return s; };
  const tog = (key, after) => { const i = h('input', { type: 'checkbox' }); i.checked = !!set[key]; i.addEventListener('change', () => { set[key] = i.checked; save(); after && after(); }); return h('label', { class: 'switch' }, i, h('span')); };
  const frow = (label, ctl, hintTxt) => h('div', { class: 'field' }, h('label', {}, label), ctl, hintTxt ? h('div', { class: 'hint' }, hintTxt) : null);
  const restart = () => { clearTimeout(restart.t); restart.t = setTimeout(() => { if (session.tk) { session.stop(); scene.clearInstant(); } scene.setRules({ bjPay: app.cfg.rules.bjPay, h17: app.cfg.rules.h17, penetration: app.cfg.rules.penetration }); session.layoutScene(); showIdle(); }, 400); };
  const cpsOut = h('b', {});
  function renderDrawer() {
    drawer.innerHTML = '';
    const cps = h('input', { type: 'range', min: 0.5, max: 8, step: 0.5, class: 'range', value: set.cps });
    cpsOut.textContent = set.cps + ' cards/s';
    cps.addEventListener('input', () => { set.cps = +cps.value; cpsOut.textContent = set.cps + ' cards/s'; session.applySpeed(); });
    cps.addEventListener('change', save);
    const items = [
      h('div', { class: 'row sp' }, h('b', {}, 'Settings'), h('button', { class: 'glass', onclick: () => drawer.classList.remove('open') }, 'Close')),
      h('h5', {}, 'Pace'), h('div', { class: 'row sp' }, h('label', {}, 'Dealing speed'), cpsOut), cps,
      h('h5', {}, 'Count quizzes'),
      frow('Ask', sel('quizFreq', [['round', 'End of every round'], ['cards', 'Every N cards'], ['random', 'Random moment each round']])),
      set.quizFreq === 'cards' ? frow('N cards', (() => { const i = h('input', { type: 'number', min: 3, max: 80, value: set.quizN }); i.addEventListener('change', () => { set.quizN = Math.max(3, +i.value || 14); save(); }); return i; })()) : null,
      frow('Question', sel('quizType', [['running', 'Running count'], ['true', 'True count'], ['mixed', 'Mix of both']])),
      frow('True-count tolerance', sel('tol', [[0.5, '± 0.5'], [1, '± 1'], [2, '± 2']])),
      h('h5', {}, 'Play drills'),
      frow('Hand focus', sel('focus', [['all', 'Everything'], ['mistakes', 'Only my past mistakes'], ['hard', 'Hard totals'], ['soft', 'Soft hands'], ['pairs', 'Pairs'], ['double', 'Double-down spots'], ['surrender', 'Surrender spots']])),
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
      h('p', { class: 'sub', style: { marginTop: '10px' } }, 'Table rules are shared with the EV calculator.')];
    drawer.append(...items.filter(Boolean));
  }

  async function openTutorial() {
    const m = await import('./tutorial.js');
    m.openTutorial(app, { onFinish: () => {}, startTraining: () => { setMode('count'); begin(); } });
  }

  // rule changes rebuild the table; any running session returns to idle
  app.on('cfg', () => { if (app.trainerActive) restart(); });
  document.addEventListener('keydown', (e) => {
    if (!app.trainerActive || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space' && session.tk) { e.preventDefault(); session.togglePause(); }
    if (e.code === 'Enter' && !launch.hidden && review.hidden) begin();
  });

  // EV calculator hooks
  app.onEVOpen = () => {
    if (session.tk) { session.stop(); scene.clearInstant(); }
    drawer.classList.remove('open'); review.hidden = true; showIdle();
    root.classList.add('ev-mode'); stageEl.classList.remove('focus');
    scene.camera('felt', 2200);                       // dive down into the felt
  };
  app.onEVClose = () => {
    root.classList.remove('ev-mode');
    session.layoutScene(); scene.camera(camFor(set.mode), 1900);
  };
  app.getPerformance = () => {
    const s = session.stats;
    return { mode: set.mode, devOn: set.mode === 'both' && set.devOn, devSet: set.devSet, rounds: session.roundNo, quizzes: s.count.n, quizWrong: s.count.n - s.count.ok, decisions: s.strat.n, mistakes: s.strat.n - s.strat.ok };
  };

  window.__trainer = { session, scene, set };
  markModes(); renderOpts(); renderDrawer(); ui.updateStats(session.stats);
  let seen = null; try { seen = localStorage.getItem('cutcard.tut'); } catch (e) { /* ignore */ }
  hint.hidden = !!seen;
  scene.setRules({ bjPay: app.cfg.rules.bjPay, h17: app.cfg.rules.h17, penetration: app.cfg.rules.penetration });
  session.layoutScene(); session.applySpeed();
  scene.camera(camFor(set.mode), 0);
}
