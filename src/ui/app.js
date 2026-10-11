// App orchestrator: shared state, persistence, background recompute, tab routing, KPI strip.
import { configFromPreset, DEFAULT_PRESET } from '../core/presets.js';
import { simKey, defaultConfig } from '../core/rules.js';
import { compileSetup } from '../sim/compile.js';
import { SimPool } from '../sim/pool.js';
import { binStats } from '../analysis/stats.js';
import { betsFromSpread, evaluateBets } from '../analysis/spread.js';
import { strategyEV } from '../strategy/houseEdge.js';
import { deriveIndices } from '../strategy/deviations.js';
import { h, fmt, debounce } from './dom.js';
import * as dashTab from './tabs/dashboard.js';
import * as gameTab from './tabs/game.js';
import * as playerTab from './tabs/player.js';
import * as resultsTab from './tabs/results.js';
import * as simTab from './tabs/simulate.js';
import * as idealTab from './tabs/ideal.js';
import * as whatifTab from './tabs/whatif.js';
import * as strategyTab from './tabs/strategy.js';
import * as helpTab from './tabs/help.js';

const STORAGE = 'cutcard.cfg.v1';
export const ACCURACY = { quick: 1e6, standard: 4e6, high: 20e6 };

function normalize(obj) {
  const base = configFromPreset(DEFAULT_PRESET);
  const d = defaultConfig();
  const out = { ...base, preset: obj.preset || null };
  for (const k of ['rules', 'table', 'player', 'costs']) out[k] = { ...d[k], ...(obj[k] || {}) };
  out.spread = { unit: obj.spread?.unit || base.spread.unit, bets: (obj.spread?.bets || base.spread.bets).map(Number) };
  return out;
}
function load() {
  try {
    const m = location.hash.match(/#c=([^&]+)/);
    if (m) return normalize(JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))));
  } catch (e) { /* ignore bad link */ }
  try { const s = localStorage.getItem(STORAGE); if (s) return normalize(JSON.parse(s)); } catch (e) { /* no storage */ }
  return configFromPreset(DEFAULT_PRESET);
}

export const app = {
  cfg: load(), fields: [], listeners: {}, stats: null, setup: null, baseEdge: null,
  ui: { accuracy: 'standard' }, pool: new SimPool(), derived: null, derivedKey: '', lastKey: '', seq: 0, busy: false, progress: 0,
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
  emit(ev) { (this.listeners[ev] || []).forEach((f) => f()); },
  syncFields() { this.fields.forEach((f) => f.set()); },
  save() { try { localStorage.setItem(STORAGE, JSON.stringify(this.cfg)); } catch (e) { /* ignore */ } },
  shareLink() {
    const b = btoa(unescape(encodeURIComponent(JSON.stringify(this.cfg)))).replace(/\+/g, '-').replace(/\//g, '_');
    return location.origin + location.pathname + '#c=' + b;
  },
  setCfg(cfg) { this.cfg = cfg; this.save(); this.syncFields(); this.emit('cfg'); this.recompute(); },
  change(path) {
    this.save(); this.syncFields();
    this.emit('cfg');
    const light = /^(spread|player\.(bankroll|wongOutBelow)|table\.(roundsPerHour|increment)|costs\.(hourlyCost|rakePerHand|compPct))/.test(path);
    if (light && simKey(this.cfg) === this.lastKey) { this.emit('analysis'); return; }
    this.scheduleRecompute();
  },
  scheduleRecompute: debounce(() => app.recompute(), 450),
  /** Evaluate the current spread against the latest per-TC statistics. */
  evalCurrent(bankroll = this.cfg.player.bankroll) {
    if (!this.stats) return null;
    const bets = betsFromSpread(this.cfg.spread, this.cfg.table, this.cfg.player);
    return { bets, ev: evaluateBets(this.stats, bets, this.cfg.table, this.cfg.costs, bankroll) };
  },
  /** Compile current config (derives engine indices lazily). */
  compile(cfg = this.cfg) {
    let derived = null;
    if (cfg.player.deviations === 'engine') {
      const key = JSON.stringify(cfg.rules);
      if (this.derivedKey !== key) { this.derived = deriveIndices(cfg.rules); this.derivedKey = key; }
      derived = this.derived;
    }
    return compileSetup(JSON.parse(JSON.stringify(cfg)), derived);
  },
  async recompute() {
    const my = ++this.seq;
    this.pool.cancel();
    this.setBusy(true, 0);
    await new Promise((r) => setTimeout(r, 20));
    try {
      this.lastKey = simKey(this.cfg);
      this.setup = this.compile();
      this.baseEdge = strategyEV(this.cfg.rules, this.setup.strategy);
      this.emit('setup');
      const bins = await this.pool.runBins(this.setup, ACCURACY[this.ui.accuracy], (p) => { if (my === this.seq) this.setBusy(true, p); }, my);
      if (my !== this.seq) return;
      this.stats = binStats(bins);
      this.setBusy(false);
      this.emit('stats');
    } catch (e) {
      if (my === this.seq) { console.error(e); this.setBusy(false, 0, 'Error: ' + e.message); }
    }
  },
  setBusy(b, p = 0, msg) {
    this.busy = b; this.progress = p;
    const el = document.getElementById('status');
    el.classList.toggle('busy', b);
    document.getElementById('statusText').textContent = msg || (b ? `Simulating… ${Math.round(p * 100)}%` : `Up to date · ${fmt.big(this.stats?.overall.rounds || 0)} rounds`);
  },
};

const TOOLS = [
  ['game', 'Rules, table & costs', gameTab, 'All rules, limits, rake/comps, paste & copy table rules'],
  ['player', 'Player skill & deviations', playerTab, 'Which deviations, rounding, mistakes, back-counting'],
  ['ideal', 'Ideal bets for bankroll', idealTab, 'Optimal spread at a target risk of ruin'],
  ['sim', 'Monte Carlo simulation', simTab, 'Thousands of bankroll runs with bands'],
  ['whatif', 'What-if comparisons', whatifTab, 'Count errors, mistakes, penetration…'],
  ['results', 'Detailed spread results', resultsTab, 'Every metric, spread comparison, sanity checks'],
  ['strategy', 'Strategy charts', strategyTab, 'Generated basic strategy + deviation indices'],
  ['help', 'Help & method', helpTab, 'Glossary, rules syntax, how it works'],
];
const mounted = {};
let active = null;

function closeTool() { active = null; document.getElementById('modal').hidden = true; }
function show(id) {
  if (id === 'home') return closeTool();
  const tool = TOOLS.find(([t]) => t === id); if (!tool) return;
  active = id;
  const body = document.getElementById('mbody');
  if (!mounted[id]) { const el = h('div'); body.append(el); mounted[id] = { el, api: tool[2].mount(el, app) }; }
  for (const k of Object.keys(mounted)) mounted[k].el.style.display = k === id ? '' : 'none';
  document.getElementById('mtitle').textContent = tool[1];
  document.getElementById('modal').hidden = false;
  body.scrollTop = 0;
  mounted[id].api.update && mounted[id].api.update();
}
app.show = show;
const dash = h('div');
document.getElementById('main').append(dash);
dashTab.mount(dash, app);

function updateActive() { if (active && mounted[active]?.api.update) mounted[active].api.update(); }
app.on('stats', updateActive);
app.on('analysis', updateActive);

const menu = document.getElementById('toolsMenu');
for (const [id, title, , sub] of TOOLS) menu.append(h('button', { onclick: () => { menu.classList.remove('open'); show(id); } }, h('b', {}, title), h('small', {}, sub)));
document.getElementById('toolsBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
document.addEventListener('click', () => menu.classList.remove('open'));
document.getElementById('mclose').addEventListener('click', closeTool);
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeTool(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTool(); });
document.getElementById('shareBtn').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(app.shareLink()); b.textContent = 'Link copied ✓'; } catch (err) { b.textContent = 'Copy failed'; }
  setTimeout(() => (b.textContent = 'Share'), 2000);
});

const accSel = document.getElementById('accuracy');
try { const a = localStorage.getItem('cutcard.acc'); if (a && ACCURACY[a]) app.ui.accuracy = a; } catch (e) { /* ignore */ }
accSel.value = app.ui.accuracy;
accSel.addEventListener('change', () => { app.ui.accuracy = accSel.value; try { localStorage.setItem('cutcard.acc', accSel.value); } catch (e) { /* ignore */ } app.recompute(); });
app.recompute();
window.app = app; // handy for debugging in devtools
