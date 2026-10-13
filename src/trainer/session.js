// Training session controller: runs rounds on the scene, applies the three training modes.
//   count    : watch the deal, answer count quizzes (everyone, including you, plays basic strategy automatically)
//   strategy : camera zooms to your hand; you choose every play
//   both     : count quizzes + you make every play using index deviations from your own running count
import { ACT, ACT_NAMES } from '../core/constants.js';
import { Shoe } from './shoe.js';
import { Advisor, handInfo, upName } from './advisor.js';

class Abort extends Error {}
const TAG = [0, -1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
const WEIGHT = [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 16];
const pickVal = () => { let r = Math.random() * 52, v = 1; for (; v < 10; v++) { r -= WEIGHT[v]; if (r < 0) break; } return v; };

export class Session {
  constructor({ scene, ui, getRules, settings }) {
    this.scene = scene; this.ui = ui; this.getRules = getRules; this.set = settings;
    this.tk = null; this.paused = false; this._resume = [];
    this.stats = this.freshStats();
    this.roundNo = 0;
  }
  freshStats() {
    return { count: { n: 0, ok: 0, streak: 0, best: 0, errs: [], times: [] }, strat: { n: 0, ok: 0, streak: 0, best: 0, mistakes: [] }, started: Date.now() };
  }

  get useDev() { return this.set.mode === 'both' && this.set.devOn !== false; }

  // ----------------------------------------------------------------- lifecycle
  configure() {
    const R = this.getRules();
    this.R = R;
    this.adv = new Advisor(R, this.set.devSet);
    this.shoe = new Shoe(R.decks, R.csm ? 0.3 : R.penetration);
    this.scene.setRules({ bjPay: R.bjPay, h17: R.h17, penetration: R.penetration });
    this.layoutScene();
    this.scene.setStacks(1);
    this.applySpeed();
  }
  /** Strategy drill: just you and the dealer, laid out compactly. Other modes: the full table. */
  layoutScene() {
    const strat = this.set.mode === 'strategy';
    this.nSeats = strat ? 1 : this.set.others + 1;
    this.mySeat = Math.floor(this.nSeats / 2);
    this.scene.setCompact(strat);
    this.scene.setSeats(this.nSeats, this.mySeat);
    this.scene.stage.classList.toggle('focus', strat);
  }
  applySpeed() { this.scene.speed = this.set.mode === 'strategy' ? 2.6 : Math.max(0.5, Math.min(5, this.set.cps / 2)); }
  start() {
    this.stop(); this.configure();
    this.tk = {}; this.paused = false;
    this.camera('deal', 1600);
    this.run(this.tk).catch((e) => { if (!(e instanceof Abort)) console.error(e); });
  }
  stop() { this.tk = null; this._resume.splice(0).forEach((r) => r()); this.ui.clearDock(); }
  togglePause() {
    this.paused = !this.paused;
    if (!this.paused) this._resume.splice(0).forEach((r) => r());
    this.ui.onPause(this.paused);
  }
  setMode(m) { this.set.mode = m; this.camera(this._deciding ? 'decide' : 'deal', 1800); }

  camera(phase, ms) {
    const m = this.set.mode;
    const cam = m === 'count' ? 'wide' : m === 'strategy' ? 'close' : phase === 'decide' ? 'mid' : 'wide';
    this.scene.camera(cam, ms);
  }

  // ----------------------------------------------------------------- timing
  async w(ms, tk = this.tk) {
    await new Promise((r) => setTimeout(r, ms));
    while (this.paused && tk === this.tk) await new Promise((r) => this._resume.push(r));
    this.g(tk);
  }
  g(tk = this.tk) { if (tk !== this.tk || !tk) throw new Abort(); }
  get interval() { return this.set.mode === 'strategy' ? 170 : 1000 / this.set.cps; }
  get flight() { return this.set.mode === 'strategy' ? 330 : 380; }

  // ----------------------------------------------------------------- main loop
  async run(tk) {
    for (;;) {
      this.g(tk);
      await this.round(tk);
      await this.w(this.set.mode === 'strategy' ? 500 : 900 / Math.max(0.6, this.set.cps / 2), tk);
    }
  }

  seeCard(card, v) {
    this.shoe.see(v);
    if (this.set.showTags) this.scene.tag(card, TAG[v]);
    this.ui.updateCount(this.shoe);
    this.scene.setStacks(1 - this.shoe.ptr / this.shoe.n);
    this.roundCards++;
  }

  async dealTo(tk, target, v, faceUp = true) {
    const c = await this.scene.deal(target, v, { faceUp, ms: this.flight });
    this.g(tk);
    if (faceUp) { this.seeCard(c, v); await this.maybeQuizMid(tk); }
    return c;
  }

  makeRig() {
    const f = this.set.focus, R = this.R;
    for (let i = 0; i < 400; i++) {
      const a = pickVal(), b = pickVal(), up = pickVal();
      const t = a + b, soft = (a === 1 || b === 1) && !(a === 1 && b === 1);
      const nat = t === 11 && (a === 1 || b === 1);
      if (nat) continue;
      const pair = a === b, hard = !soft && !pair;
      const ok = f === 'hard' ? hard && t >= 5 && t <= 17 : f === 'soft' ? soft && t >= 13 && t <= 20 : f === 'pairs' ? pair
        : f === 'double' ? (hard && t >= 8 && t <= 11) || (soft && t >= 13 && t <= 18)
        : f === 'surrender' ? R.surrender !== 'none' && ((hard && t >= 14 && t <= 17 && (up === 9 || up === 10 || up === 1)) || (pair && a === 8 && up === 1)) : true;
      if (ok) return { c: [a, b], up };
    }
    return null;
  }

  // ----------------------------------------------------------------- one round
  async round(tk) {
    const { scene, shoe, R, set } = this;
    this.roundNo++; this.roundCards = 0; this._deciding = false;
    this.camera('deal', 1500);
    this.ui.feedback(null);
    if (shoe.needsShuffle || R.csm) {
      if (!R.csm) { await scene.shuffleFx(); this.g(tk); }
      shoe.shuffle(); scene.setStacks(1); this.ui.updateCount(shoe);
    }
    const n = this.nSeats, my = this.mySeat;
    this.seats = Array.from({ length: n }, () => ({ hands: [this.newHand()] }));
    for (let k = 0; k < n; k++) scene.setBet(k, 1);
    this.quizRoundAt = set.quizFreq === 'random' ? 4 + Math.floor(Math.random() * (n * 4 + 6)) : -1;
    const rig = set.mode !== 'count' && set.focus !== 'all' ? this.makeRig() : null;
    const ms = this.interval;
    const hole = {};
    // deal: first card each seat, dealer up, second card each seat, dealer hole
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < n; k++) {
        const v = k === my && rig ? shoe.drawValue(rig.c[pass]) : shoe.draw();
        const c = await this.dealTo(tk, { seat: k, hand: 0 }, v);
        this.seats[k].hands[0].cards.push(v);
        this.seats[k].hands[0].els = [...(this.seats[k].hands[0].els || []), c];
        await this.w(ms, tk);
      }
      if (pass === 0) {
        const v = rig ? shoe.drawValue(rig.up) : shoe.draw();
        this.up = v;
        await this.dealTo(tk, { seat: 'dealer' }, v);
        await this.w(ms, tk);
      } else if (R.peek) {
        hole.v = shoe.draw();
        hole.el = await scene.deal({ seat: 'dealer' }, hole.v, { faceUp: false, ms: this.flight });
        this.g(tk); await this.w(ms, tk);
      }
    }
    const up = this.up;
    this.dealerCards = [up];
    // naturals
    for (let k = 0; k < n; k++) {
      const h = this.seats[k].hands[0];
      if (h.cards.length === 2 && handInfo(h.cards).eff === 21) { h.natural = true; h.done = true; }
    }
    // insurance (asked in strategy / both modes)
    let tcNow = shoe.tcFloor;
    if (R.peek && up === 1 && set.mode !== 'count') {
      this.camera('decide', 1200); this._deciding = true;
      const want = await this.ui.ask('Dealer shows an ace — take insurance?', 'yesno');
      this.g(tk);
      const right = this.useDev ? this.adv.insuranceCorrect(tcNow) : false;
      const ok = want === right;
      this.record('strat', ok, { desc: 'Insurance vs A', chosen: want ? 'Take it' : 'Decline', correct: right ? 'Take it' : 'Decline', cost: ok ? 0 : 0.07, dev: set.mode === 'both' });
      this.ui.feedback(ok ? 'ok' : 'bad', ok ? (right ? 'Correct — take insurance' : 'Correct — never insure') : right ? 'Take insurance' : 'Decline insurance',
        this.useDev ? `Index +${this.adv.insIdx ?? 3} · your true count is ${tcNow >= 0 ? '+' : ''}${tcNow}` : 'Basic strategy: insurance is a losing bet without the count');
      await this.w(ok ? 900 : 1900, tk);
    }
    // dealer peek
    let dealerNat = false;
    if (R.peek && (up === 1 || up === 10)) {
      scene.banner('Dealer peeks…', 900); await this.w(900 / Math.max(1, scene.speed / 1.5), tk);
      dealerNat = (up === 1 && hole.v === 10) || (up === 10 && hole.v === 1);
    }
    if (dealerNat) {
      await scene.reveal(hole.el); this.seeCard(hole.el, hole.v); this.dealerCards.push(hole.v);
      scene.banner('Dealer blackjack', 1500);
      scene.pill({ seat: 'dealer' }, 'BLACKJACK', 'bj');
      this.seats.forEach((s, k) => this.settle(k, s.hands[0], { nat: true }));
      await this.finishRound(tk);
      return;
    }
    // players act left to right
    for (let k = 0; k < n; k++) {
      const seat = this.seats[k];
      for (const h of [...seat.hands]) if (!h.done) await this.playHand(tk, k, h);
      if (k === this.mySeat && this.set.mode === 'both') { this._deciding = false; this.camera('deal', 1300); }
    }
    this._deciding = false; this.camera('deal', 1500);
    // dealer
    const live = this.seats.some((s) => s.hands.some((h) => !h.natural && !h.bust && !h.surrendered));
    if (R.peek) { await scene.reveal(hole.el); this.seeCard(hole.el, hole.v); this.dealerCards.push(hole.v); }
    else { const v = shoe.draw(); await this.dealTo(tk, { seat: 'dealer' }, v); this.dealerCards.push(v); }
    await this.w(ms * 0.6, tk);
    const dInfo0 = handInfo(this.dealerCards);
    const nat = this.dealerCards.length === 2 && dInfo0.eff === 21;
    if (live && !nat) {
      for (;;) {
        const di = handInfo(this.dealerCards);
        scene.pill({ seat: 'dealer' }, di.total > 21 ? 'BUST' : String(di.eff), di.total > 21 ? 'lose' : '');
        if (di.eff > 21 || di.eff >= 18 || (di.eff === 17 && !(di.soft && R.h17))) break;
        const v = shoe.draw(); await this.dealTo(tk, { seat: 'dealer' }, v); this.dealerCards.push(v);
        await this.w(ms * 0.7, tk);
      }
    } else scene.pill({ seat: 'dealer' }, nat ? 'BLACKJACK' : String(dInfo0.eff), nat ? 'bj' : '');
    const dI = handInfo(this.dealerCards);
    this.dealerFinal = { nat: nat, bust: dI.total > 21, eff: dI.eff };
    this.seats.forEach((s, k) => s.hands.forEach((h) => this.settle(k, h, this.dealerFinal)));
    await this.finishRound(tk);
  }

  newHand() { return { cards: [], els: [], fromSplit: false, aceSplit: false, doubled: false, done: false }; }

  async finishRound(tk) {
    if (this.set.quizFreq === 'round' && this.set.mode !== 'strategy') { await this.w(500, tk); await this.askCount(tk); }
    await this.w(this.set.mode === 'strategy' ? 700 : 1300, tk);
    this.ui.clearDock(); this.ui.feedback(null);
    await this.scene.sweep(); this.g(tk);
  }

  // ----------------------------------------------------------------- hands
  async playHand(tk, k, hand) {
    const { scene, adv } = this, seat = this.seats[k], up = this.up;
    const me = k === this.mySeat, interactive = me && this.set.mode !== 'count';
    const idx = () => seat.hands.indexOf(hand);
    for (;;) {
      const info = handInfo(hand.cards);
      if (info.total > 21) { hand.bust = true; hand.done = true; this.label(k, hand); return; }
      if (info.eff === 21) { hand.done = true; this.label(k, hand); return; }
      const lg = adv.legal(hand, up, seat.hands.length);
      if (lg.forced) { hand.done = true; this.label(k, hand); return; }
      scene.active(me ? { seat: k, hand: idx() } : null);
      this.label(k, hand);
      let act;
      if (interactive) { this._deciding = true; this.camera('decide', 1300); await this.w(260, tk); act = await this.askAction(tk, hand, seat.hands.length); }
      else { act = adv.advise(hand, up, seat.hands.length, 0, false).action; await this.w(this.interval * (me ? 1.2 : 0.8), tk); }
      if (act === ACT.STAND) { hand.done = true; scene.active(null); this.label(k, hand); return; }
      if (act === ACT.SURRENDER) { hand.surrendered = true; hand.done = true; scene.active(null); return; }
      if (act === ACT.HIT || act === ACT.DOUBLE) {
        if (act === ACT.DOUBLE) { hand.doubled = true; scene.setBet(k, 2 + (seat.hands.length > 1 ? 1 : 0)); }
        const v = this.shoe.draw();
        const c = await this.dealTo(tk, { seat: k, hand: idx() }, v);
        hand.cards.push(v); hand.els.push(c);
        if (act === ACT.DOUBLE) { hand.done = true; scene.active(null); this.label(k, hand); if (handInfo(hand.cards).total > 21) hand.bust = true; await this.w(this.interval * 0.8, tk); return; }
        await this.w(this.interval * 0.6, tk);
        continue;
      }
      if (act === ACT.SPLIT) {
        const c1 = hand.cards[0];
        const nh = this.newHand();
        nh.cards = [hand.cards.pop()]; nh.els = [hand.els.pop()];
        hand.fromSplit = nh.fromSplit = true; hand.aceSplit = nh.aceSplit = c1 === 1;
        seat.hands.splice(idx() + 1, 0, nh);
        await scene.split(k, idx());
        for (const h of [hand, nh]) {
          const v = this.shoe.draw();
          const c = await this.dealTo(tk, { seat: k, hand: seat.hands.indexOf(h) }, v);
          h.cards.push(v); h.els.push(c);
          await this.w(this.interval * 0.6, tk);
          await this.playHand(tk, k, h);
        }
        return;
      }
    }
  }

  label(k, hand) {
    const me = k === this.mySeat;
    if (!me || this.set.mode === 'count' || !this.set.showLabels) return;
    const i = this.seats[k].hands.indexOf(hand);
    const { total, eff, soft } = handInfo(hand.cards);
    const [a, b] = hand.cards;
    const txt = total > 21 ? 'BUST' : hand.cards.length === 2 && a === b ? `Pair ${a === 1 ? 'A' : a}s` : soft ? `Soft ${eff}` : `Hard ${total}`;
    this.scene.pill({ seat: k, hand: i }, txt, total > 21 ? 'lose' : '');
  }

  settle(k, hand, d) {
    const i = this.seats[k].hands.indexOf(hand), me = k === this.mySeat;
    const mult = hand.doubled ? 2 : 1, info = handInfo(hand.cards), total = info.eff;
    let text, kind;
    if (hand.natural) {
      if (d.nat) { text = 'PUSH'; kind = 'push'; } else { text = `BLACKJACK +${this.R.bjPay}`; kind = 'bj'; }
    } else if (hand.surrendered) { text = 'SURRENDER −½'; kind = 'lose'; }
    else if (hand.bust) { text = `BUST −${mult}`; kind = 'lose'; }
    else if (d.nat) { text = `LOSE −${this.R.peek || !this.R.obo ? mult : 1}`; kind = 'lose'; }
    else if (d.bust || total > d.eff) { text = `WIN +${mult}`; kind = 'win'; }
    else if (total < d.eff) { text = `LOSE −${mult}`; kind = 'lose'; }
    else { text = 'PUSH'; kind = 'push'; }
    this.scene.pill({ seat: k, hand: i }, text, kind);
    void me;
  }

  // ----------------------------------------------------------------- interaction
  async askAction(tk, hand, nHands) {
    const { adv, shoe, set, up } = this;
    const useDev = this.useDev;
    const tc = shoe.tcFloor;
    const lg = adv.legal(hand, up, nHands);
    const correct = adv.advise(hand, up, nHands, tc, useDev);
    const t0 = performance.now();
    const chosen = await this.ui.chooseAction(lg, this.R.surrender !== 'none');
    this.g(tk);
    const ok = chosen === correct.action;
    const desc = adv.describe(hand, up);
    let cost = 0;
    if (!ok) {
      try { const v = adv.values(hand, up, nHands, tc, useDev); cost = Math.max(0, (v[correct.action] - v[chosen]) || 0); } catch (e) { cost = 0; }
    }
    this.record('strat', ok, { desc, chosen: ACT_NAMES[chosen], correct: ACT_NAMES[correct.action], cost, dev: !!correct.dev && !correct.dev.held });
    const dv = correct.dev && !correct.dev.held ? correct.dev : null;
    const tcTxt = `RC ${shoe.rc >= 0 ? '+' : ''}${shoe.rc} · ${shoe.decksEst} decks → true count ${tc >= 0 ? '+' : ''}${tc}`;
    if (ok) {
      this.ui.feedback('ok', `${ACT_NAMES[chosen]} ✓`, dv ? `Index play: ${ACT_NAMES[dv.above]} at TC ≥ ${dv.idx} (${tcTxt})` : useDev && correct.dev?.held ? `Basic play holds — index ${dv0(correct.dev)} not reached (${tcTxt})` : (set.mode === 'both' ? tcTxt : ''));
      await this.w(500, tk);
    } else {
      this.ui.shake();
      this.ui.feedback('bad', `${desc}: ${ACT_NAMES[correct.action]}, not ${ACT_NAMES[chosen]}`,
        (dv ? `Index play: ${ACT_NAMES[dv.above]} at TC ≥ ${dv.idx} — ${tcTxt}. ` : '') + (cost > 0.005 ? `That mistake costs ≈ ${(cost * 100).toFixed(1)}% of a bet.` : 'Close call — tiny EV difference.'));
      await this.w(2300 + (dv ? 700 : 0), tk);
    }
    this.ui.clearDock();
    return correct.action;
    function dv0(d) { return `${d.baseSide === 'below' ? '≥' : '<'} ${d.idx}`; }
  }

  record(kind, ok, info) {
    const st = this.stats;
    if (ok) { st.streak = (st.streak || 0) + 1; st.best = Math.max(st.best || 0, st.streak); } else st.streak = 0;
    const s = st[kind];
    s.n++; if (ok) { s.ok++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
    if (kind === 'strat' && !ok) s.mistakes.push(info);
    this.ui.updateStats(this.stats);
    this.ui.logEntry(kind, ok, info);
  }

  async maybeQuizMid(tk) {
    if (this.set.mode === 'strategy') return;
    const f = this.set.quizFreq;
    if (f === 'cards') { if (this.shoe.seen % this.set.quizN === 0 && this.shoe.seen > 0) await this.askCount(tk); }
    else if (f === 'random' && this.roundCards === this.quizRoundAt) await this.askCount(tk);
  }

  async askCount(tk) {
    const { shoe, set } = this;
    const type = set.quizType === 'mixed' ? (Math.random() < 0.5 ? 'running' : 'true') : set.quizType;
    const wasDeciding = this._deciding;
    const sgn = (v) => (v >= 0 ? '+' : '') + v;
    const t0 = performance.now();
    const ans = await this.ui.ask(type === 'running' ? 'What is the running count?' : 'What is the true count?', 'number', type === 'true' ? 'Estimate decks remaining from the discard tray, then divide.' : 'Hi-Lo: 2–6 = +1 · 7–9 = 0 · 10–A = −1');
    this.g(tk);
    const secs = (performance.now() - t0) / 1000;
    const exact = type === 'running' ? shoe.rc : shoe.tcExact;
    const err = Math.abs(ans - exact);
    const ok = type === 'running' ? ans === shoe.rc : err <= set.tol + 1e-9;
    this.stats.count.errs.push(err); this.stats.count.times.push(secs);
    this.record('count', ok, { desc: type === 'running' ? 'Running count' : 'True count', chosen: sgn(ans), correct: type === 'running' ? sgn(shoe.rc) : sgn(+exact.toFixed(1)) });
    const detail = type === 'running' ? `Running count ${sgn(shoe.rc)}` : `RC ${sgn(shoe.rc)} ÷ ${shoe.decksLeft.toFixed(1)} decks = ${sgn(exact.toFixed(1))}`;
    this.ui.feedback(ok ? 'ok' : 'bad', ok ? `Correct — ${detail}` : `Not quite — ${detail}`, ok ? `${secs.toFixed(1)}s` : `You said ${sgn(ans)}`);
    this.ui.clearDock(true);
    await this.w(ok ? 900 : 2200, tk);
    this._deciding = wasDeciding;
  }
}
