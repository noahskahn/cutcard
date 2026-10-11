// Trainer shoe: lazy Fisher-Yates over card values 1..10, with running-count tracking.
import { HI_LO } from '../core/constants.js';

export class Shoe {
  constructor(decks, penetration, rand = Math.random) {
    this.decks = decks; this.pen = penetration; this.rand = rand;
    this.n = decks * 52;
    this.cards = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) { const r = (i % 13) + 1; this.cards[i] = r > 10 ? 10 : r; }
    this.cut = Math.max(10, Math.min(Math.floor(this.n * penetration), this.n - 30));
    this.ptr = 0; this.rc = 0; this.seen = 0;
  }
  get needsShuffle() { return this.ptr >= this.cut; }
  shuffle() { this.ptr = 0; this.rc = 0; this.seen = 0; }
  get decksLeft() { return (this.n - this.ptr) / 52; }
  /** Estimated decks left, rounded to nearest half deck (what a player would estimate). */
  get decksEst() { return Math.max(0.5, Math.round(this.decksLeft * 2) / 2); }
  get tcExact() { return this.rc / Math.max(this.decksLeft, 0.25); }
  get tcFloor() { return Math.floor(this.rc / this.decksEst + 1e-9); }
  draw() {
    if (this.ptr >= this.n) this.ptr = 0;
    const p = this.ptr, j = p + Math.floor(this.rand() * (this.n - p));
    const v = this.cards[j]; this.cards[j] = this.cards[p]; this.cards[p] = v;
    this.ptr = p + 1; return v;
  }
  /** Draw a specific value if any remain (used to rig drills); falls back to a normal draw. */
  drawValue(val) {
    const idx = [];
    for (let i = this.ptr; i < this.n; i++) if (this.cards[i] === val) idx.push(i);
    if (!idx.length) return this.draw();
    const j = idx[Math.floor(this.rand() * idx.length)], p = this.ptr;
    const v = this.cards[j]; this.cards[j] = this.cards[p]; this.cards[p] = v;
    this.ptr = p + 1; return v;
  }
  /** Record a card as face-up/seen by the player (updates the running count). */
  see(v) { this.rc += HI_LO[v]; this.seen++; }
}
