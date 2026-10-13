// Semi-3D blackjack table rendered with CSS 3D transforms (GPU-composited, no WebGL).
// All motion is transform/opacity via the Web Animations API, so it stays light.
export const PW = 1500, PH = 860;           // table plane size (plane px)
const CW = 82, CH = 116, STEP = 27;         // card size, horizontal fan step
const SHOE = { x: 1150, y: 112 }, TRAY = { x: 330, y: 112 };
const SUITS = ['♠', '♥', '♦', '♣'];
const RK = (v) => (v === 1 ? 'A' : v === 10 ? ['10', 'J', 'Q', 'K'][(Math.random() * 4) | 0] : String(v));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CAMERAS = {
  wide:  { rx: 50, s: 0.9,  ty: -52 },
  mid:   { rx: 44, s: 1.05, ty: -30 },
  close: { rx: 37, s: 1.1, ty: -78 },
};

export class Scene {
  constructor(stage) {
    this.stage = stage;
    this.speed = 1;                // animation duration divisor
    this.seats = []; this.dealer = null; this.cam = 'wide';
    stage.innerHTML = '';
    this.room = el('div', 'tr-room');
    this.world = el('div', 'tr-world');
    this.plane = el('div', 'tr-plane');
    this.world.append(this.plane);
    this.vig = el('div', 'tr-vignette');
    this.stage.append(this.room, this.world, this.vig);
    this._buildTable();
    this.ro = new ResizeObserver(() => this.camera(this.cam, 0));
    this.ro.observe(stage);
  }

  destroy() { this.ro.disconnect(); this.stage.innerHTML = ''; }

  _buildTable() {
    const p = this.plane;
    p.append(el('div', 'tr-shadow'), el('div', 'tr-side'), el('div', 'tr-wood'), el('div', 'tr-rail'), el('div', 'tr-felt'));
    const svg = `<svg class="tr-print" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}">
      <defs><path id="arcA" d="M 205 520 A 545 470 0 0 0 1295 520"/><path id="arcB" d="M 300 585 A 450 400 0 0 0 1200 585"/></defs>
      <path d="M 150 470 A 600 560 0 0 0 1350 470" fill="none" stroke="#d8b868" stroke-opacity=".35" stroke-width="2"/>
      <text class="tp big"><textPath href="#arcA" startOffset="50%" text-anchor="middle" id="tp-bj">BLACKJACK PAYS 3 TO 2</textPath></text>
      <text class="tp"><textPath href="#arcB" startOffset="50%" text-anchor="middle">INSURANCE PAYS 2 TO 1</textPath></text>
      <text class="tp dl" x="750" y="268" text-anchor="middle" id="tp-s17">DEALER MUST STAND ON 17</text></svg>`;
    const print = el('div', 'tr-printwrap', svg); p.append(print);
    this.bjText = print.querySelector('#tp-bj'); this.s17Text = print.querySelector('#tp-s17');
    // dealer chip tray, shoe, discard tray
    const chips = el('div', 'tr-chiptray'); p.append(chips);
    this.shoeEl = el('div', 'tr-shoe', '<i class="stack"></i><b class="cutcard"></b>');
    this.shoeEl.style.cssText = `left:${SHOE.x - 62}px;top:${SHOE.y - 62}px`;
    this.trayEl = el('div', 'tr-tray', '<i class="stack"></i>');
    this.trayEl.style.cssText = `left:${TRAY.x - 55}px;top:${TRAY.y - 62}px`;
    p.append(this.shoeEl, this.trayEl);
    this.cardLayer = el('div', 'tr-cards'); this.fxLayer = el('div', 'tr-cards fx');
    p.append(this.cardLayer, this.fxLayer);
    this.dealer = { cx: PW / 2, cy: 168, hands: [this._newHand(PW / 2, 168)] };
    this._banner = el('div', 'tr-banner'); this.stage.append(this._banner);
  }

  setRules({ bjPay, h17, penetration }) {
    const ratio = { 1.5: '3 TO 2', 1.2: '6 TO 5', 1.4: '7 TO 5', 1: '1 TO 1', 2: '2 TO 1' }[bjPay] || `${bjPay} TO 1`;
    this.bjText.textContent = `BLACKJACK PAYS ${ratio}`;
    this.s17Text.textContent = h17 ? 'DEALER HITS SOFT 17' : 'DEALER MUST STAND ON 17';
    this.pen = penetration;
    this.shoeEl.querySelector('.cutcard').style.bottom = `${Math.round((1 - penetration) * 100)}%`;
  }

  /** Create seats along the player arc. mySeat sits dead centre. */
  setSeats(n, mySeat) {
    this.cardLayer.innerHTML = ''; this.fxLayer.innerHTML = '';
    this.plane.querySelectorAll('.tr-spot').forEach((e) => e.remove());
    this.seats = [];
    const worst = Math.max(mySeat, n - 1 - mySeat, 1);
    const step = Math.min(24, 68 / worst);
    for (let k = 0; k < n; k++) {
      const th = ((k - mySeat) * step * Math.PI) / 180;
      const x = PW / 2 + 660 * Math.sin(th), y = 118 + 596 * Math.cos(th);
      const spot = el('div', 'tr-spot' + (k === mySeat ? ' me' : ''), `<i></i><span>${k === mySeat ? 'YOU' : ''}</span>`);
      spot.style.cssText = `left:${x - 36}px;top:${y + 8}px;transform:rotate(${th * 0.55}rad)`;
      this.plane.append(spot);
      this.seats.push({ x, y, me: k === mySeat, spot, hands: [this._newHand(x, y - 40)] });
    }
    this.mySeat = mySeat;
  }

  _newHand(cx, cy) { return { cx, cy, cards: [], pill: null, chips: 1 }; }

  // ---------------------------------------------------------------- camera
  camera(name, ms = 1400) {
    this.cam = name;
    const c = CAMERAS[name], sw = this.stage.clientWidth || 1200, sh = this.stage.clientHeight || 700;
    const fit = Math.min(sw / (PW + 80), sh / (PH * 0.66));
    this.world.style.transition = ms ? `transform ${ms}ms cubic-bezier(.55,.05,.2,1)` : 'none';
    this.world.style.transform = `translate3d(0,${c.ty * fit}px,0) rotateX(${c.rx}deg) scale(${fit * c.s})`;
  }

  // ---------------------------------------------------------------- cards
  _makeCard(value, faceUp) {
    const suit = SUITS[(Math.random() * 4) | 0], red = suit === '♥' || suit === '♦';
    const rk = RK(value);
    const c = el('div', 'tr-card');
    c.innerHTML = `<div class="cf ${faceUp ? '' : 'down'}"><div class="face ${red ? 'red' : ''}"><span class="rk">${rk}<br>${suit}</span><span class="big">${suit}</span><span class="rk br">${rk}<br>${suit}</span></div><div class="back"></div></div>`;
    c._v = value; c._cf = c.querySelector('.cf');
    return c;
  }
  _place(c, x, y, r) { c._p = { x, y, r }; c.style.transform = `translate3d(${x}px,${y}px,0) rotate(${r}deg)`; }
  async _move(c, x, y, r, ms, easing = 'cubic-bezier(.25,.8,.25,1)', lift = 0) {
    const a = c._p, ts = (p, s = 1) => `translate3d(${p.x}px,${p.y}px,0) rotate(${p.r}deg) scale(${s})`;
    const to = { x, y, r };
    const frames = lift ? [{ transform: ts(a) }, { transform: ts({ x: (a.x + x) / 2, y: (a.y + y) / 2 - 24, r: (a.r + r) / 2 }, 1.12), offset: 0.5 }, { transform: ts(to) }] : [{ transform: ts(a) }, { transform: ts(to) }];
    if (ms > 0) { const an = c.animate(frames, { duration: ms, easing }); try { await an.finished; } catch (e) { /* cancelled */ } }
    this._place(c, x, y, r);
  }
  async _flip(c, up, ms) {
    const cf = c._cf; if (cf.classList.contains('down') !== up) return;
    const half = Math.max(40, ms / 2);
    const a = cf.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.02)' }], { duration: half, easing: 'ease-in' });
    try { await a.finished; } catch (e) { /* */ }
    cf.classList.toggle('down', !up);
    cf.animate([{ transform: 'scaleX(0.02)' }, { transform: 'scaleX(1)' }], { duration: half, easing: 'ease-out' });
  }
  _slot(hand, i, n) {
    const total = CW + STEP * (n - 1);
    return { x: hand.cx - total / 2 + i * STEP, y: hand.cy - CH / 2 + i * 2.5, r: ((i - (n - 1) / 2) * 1.6) };
  }
  async _layout(hand, ms) {
    const n = hand.cards.length;
    await Promise.all(hand.cards.map((c, i) => { const s = this._slot(hand, i, n); return this._move(c, s.x, s.y, s.r, ms); }));
  }

  /** Deal one card from the shoe. target: {seat:'dealer'|index, hand:0} */
  async deal(target, value, { faceUp = true, ms = 380 } = {}) {
    const hand = target.seat === 'dealer' ? this.dealer.hands[0] : this.seats[target.seat].hands[target.hand || 0];
    const c = this._makeCard(value, false);
    this.cardLayer.append(c);
    this._place(c, SHOE.x - CW / 2, SHOE.y - CH / 2, -14);
    hand.cards.push(c);
    const n = hand.cards.length, s = this._slot(hand, n - 1, n);
    const d = ms / this.speed;
    // re-centre older cards while the new one flies
    const re = n > 1 ? this._layoutOthers(hand, n, d) : null;
    await this._move(c, s.x, s.y, s.r, d, 'cubic-bezier(.2,.75,.2,1)', 1);
    if (re) await re;
    if (faceUp) await this._flip(c, true, d * 0.55);
    this._shoeLevel(); return c;
  }
  _layoutOthers(hand, n, d) {
    return Promise.all(hand.cards.slice(0, n - 1).map((c, i) => { const s = this._slot(hand, i, n); return this._move(c, s.x, s.y, s.r, d); }));
  }
  async reveal(card) { await this._flip(card, true, 300 / this.speed); }

  /** Split: move the 2nd card of seat's hand into a new hand beside it. */
  async split(seatIdx, handIdx) {
    const seat = this.seats[seatIdx], hand = seat.hands[handIdx];
    const nh = this._newHand(0, hand.cy);
    seat.hands.splice(handIdx + 1, 0, nh);
    const moved = hand.cards.pop(); nh.cards.push(moved);
    this._spreadHands(seat);
    await Promise.all([this._layout(hand, 320 / this.speed), this._layout(nh, 320 / this.speed)]);
    this._pills(seat);
    return nh;
  }
  _spreadHands(seat) {
    const k = seat.hands.length, gap = 150;
    seat.hands.forEach((h, i) => { h.cx = seat.x + (i - (k - 1) / 2) * gap; });
  }

  _pillPos(h, dealer) { return `left:${h.cx - 60}px;top:${dealer ? h.cy + CH / 2 + 8 : h.cy - CH / 2 - 30}px`; }
  _pills(seat) { seat.hands.forEach((h) => { if (h.pill) h.pill.style.cssText = this._pillPos(h, false); }); }
  /** Small label under a hand (hand total, outcome...). */
  pill(target, text, kind = '') {
    const hand = target.seat === 'dealer' ? this.dealer.hands[0] : this.seats[target.seat].hands[target.hand || 0];
    if (!hand.pill) { hand.pill = el('div', 'tr-pill'); this.fxLayer.append(hand.pill); }
    hand.pill.className = 'tr-pill ' + kind + (text ? ' show' : '');
    hand.pill.textContent = text;
    hand.pill.style.cssText = this._pillPos(hand, target.seat === 'dealer');
  }
  /** Highlight the active hand. */
  active(target) {
    this.plane.querySelectorAll('.tr-card.act').forEach((e) => e.classList.remove('act'));
    if (!target) return;
    const hand = target.seat === 'dealer' ? this.dealer.hands[0] : this.seats[target.seat].hands[target.hand || 0];
    hand.cards.forEach((c) => c.classList.add('act'));
  }
  setBet(seatIdx, units) { const s = this.seats[seatIdx]; s.spot.dataset.chips = String(Math.min(4, Math.max(1, units))); s.spot.classList.add('bet'); }
  clearBets() { this.seats.forEach((s) => { s.spot.classList.remove('bet'); }); }

  /** Floating "+1 / -1 / 0" count tag above a card. */
  tag(card, v) {
    const t = el('div', 'tr-tag ' + (v > 0 ? 'p' : v < 0 ? 'n' : 'z'), v > 0 ? '+1' : v < 0 ? '−1' : '0');
    const p = card._p; t.style.cssText = `left:${p.x + CW / 2 - 18}px;top:${p.y - 24}px`;
    this.fxLayer.append(t);
    const a = t.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(-6px)', offset: 0.2 }, { opacity: 0, transform: 'translateY(-34px)' }], { duration: 1100 / Math.sqrt(this.speed), easing: 'ease-out' });
    a.onfinish = () => t.remove();
  }

  /** Sweep every card to the discard tray and clear labels. */
  async sweep() {
    const cards = [...this.cardLayer.querySelectorAll('.tr-card')];
    const d = 520 / this.speed;
    this.plane.querySelectorAll('.tr-card.act').forEach((e) => e.classList.remove('act'));
    this.fxLayer.querySelectorAll('.tr-pill').forEach((p) => p.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }));
    await Promise.all(cards.map((c, i) => {
      const an = c.animate([{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: d + i * 18, fill: 'forwards' });
      return Promise.all([this._move(c, TRAY.x - CW / 2 + (Math.random() - 0.5) * 10, TRAY.y - CH / 2 + (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 20, d + i * 18, 'cubic-bezier(.5,0,.3,1)'), an.finished.catch(() => {})]);
    }));
    this.cardLayer.innerHTML = ''; this.fxLayer.innerHTML = '';
    this.dealer.hands = [this._newHand(PW / 2, 168)];
    this.seats.forEach((s) => { s.hands = [this._newHand(s.x, s.y - 40)]; });
    this.clearBets();
  }

  /** Instantly empty the table (used when a session is stopped or the mode changes). */
  clearInstant() {
    this.cardLayer.innerHTML = ''; this.fxLayer.innerHTML = '';
    this.dealer.hands = [this._newHand(PW / 2, 168)];
    this.seats.forEach((s) => { s.hands = [this._newHand(s.x, s.y - 40)]; });
    this.clearBets(); this._banner.classList.remove('on'); this.setStacks(1);
  }

  setStacks(fracRemaining) {
    this.shoeEl.querySelector('.stack').style.height = `${Math.round(fracRemaining * 100)}%`;
    this.trayEl.querySelector('.stack').style.height = `${Math.round((1 - fracRemaining) * 100)}%`;
  }
  _shoeLevel() { if (this.onShoe) this.onShoe(); }

  banner(text, ms = 1600) {
    const b = this._banner; b.textContent = text; b.classList.add('on');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('on'), ms);
  }
  async shuffleFx() {
    this.banner('Shuffling…', 1500);
    this.shoeEl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 260, iterations: 5 });
    await sleep(1400 / Math.max(1, this.speed / 2));
  }
}
