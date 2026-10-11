// Card-by-card blackjack simulator. Environment neutral (browser, worker, Node).
//
// A round: other players + you + dealer are dealt from a lazily shuffled shoe,
// everyone plays by table-driven strategy, the dealer plays out, bets settle.
// The running count includes every face-up card (hole card counted when revealed).
import { ACT, HI_LO, NBINS, TC_MIN, TC_MAX } from '../core/constants.js';
import { makeRng } from '../core/rng.js';
import { canDouble } from '../core/rules.js';

const SZ = 22 * 11;
const NAN32 = () => new Float32Array(SZ).fill(NaN);

export class Simulator {
  constructor(setup, seed = 1) {
    const { rules, table, player, costs, strategy, devs } = setup;
    this.R = rules;
    this.nOthers = table.otherPlayers;
    this.P = player;
    this.comm = (costs.winCommission || 0) / 100;
    this.S = strategy;
    this.rand = makeRng(seed);
    this.n = rules.decks * 52;
    this.shoe = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) { const r = i % 13 + 1; this.shoe[i] = r > 10 ? 10 : r; }
    this.cut = setup.cut;
    this.ptr = 0; this.rc = 0; this.drift = 0;
    this.errRate = player.countErrorRate || 0;
    this.mistake = player.mistakeRate || 0;
    this.deckRes = player.deckResolution || 0;
    this.rounding = player.tcRounding;
    this.rL = new Float64Array(8); // unused scratch
    this.rT = new Int8Array(16); this.rM = new Int8Array(16); this.rN = 0;
    this.nHands = 1; this.live = false; this.up = 0;
    // deviation lookup tables
    this.dev = { hard: NAN32(), soft: NAN32(), pair: NAN32() };
    this.devA = { hard: new Uint8Array(SZ), soft: new Uint8Array(SZ), pair: new Uint8Array(SZ) };
    this.devB = { hard: new Uint8Array(SZ), soft: new Uint8Array(SZ), pair: new Uint8Array(SZ) };
    this.hasDev = false;
    for (const d of devs.list) {
      const i = d.key * 11 + d.up;
      this.dev[d.kind][i] = d.idx; this.devA[d.kind][i] = d.above; this.devB[d.kind][i] = d.below;
      this.hasDev = true;
    }
    this.insIdx = devs.insuranceIdx;
    this.lastPlayed = false;
  }

  reshuffle() { this.ptr = 0; this.rc = 0; this.drift = 0; }

  draw() {
    const s = this.shoe;
    if (this.ptr >= this.n) this.ptr = 0; // emergency (extremely rare): reshuffle silently
    const p = this.ptr;
    const j = p + ((this.rand() * (this.n - p)) | 0);
    const v = s[j]; s[j] = s[p]; s[p] = v;
    this.ptr = p + 1;
    return v;
  }
  drawSee() { const v = this.draw(); this.rc += HI_LO[v]; return v; }

  /** Perceived true count (integer for floor/round modes). */
  tcNow() {
    const left = (this.n - this.ptr) / 52;
    const res = this.deckRes;
    const est = res > 0 ? Math.max(Math.round(left / res) * res, res) : Math.max(left, 1 / 52);
    const cont = (this.rc + this.drift) / est;
    if (this.rounding === 'floor') return Math.floor(cont + 1e-9);
    if (this.rounding === 'round') return Math.round(cont);
    return cont;
  }
  binTC() {
    const tc = Math.floor(this.tcNow() + 1e-9);
    return (tc < TC_MIN ? TC_MIN : tc > TC_MAX ? TC_MAX : tc) - TC_MIN;
  }

  rec(isMe, val, mult) {
    if (isMe) { this.rT[this.rN] = val; this.rM[this.rN] = mult; this.rN++; }
    if (val > 0) this.live = true;
  }

  /** Plays one hand (and any split descendants). */
  playHand(c1, c2, fromSplit, aceSplit, isMe) {
    const R = this.R, up = this.up, S = this.S;
    let total = c1 + c2, ha = c1 === 1 || c2 === 1, n = 2, mult = 1;
    for (;;) {
      if (total > 21) { this.rec(isMe, 0, mult); return; }
      const eff = ha && total + 10 <= 21 ? total + 10 : total;
      if (eff === 21) { this.rec(isMe, 21, mult); return; }
      const soft = eff !== total;
      let act;
      let canPair = false;
      if (aceSplit && !R.hitSplitAces) {
        act = n === 2 && c2 === 1 && R.resplitAces && this.nHands < R.maxHands ? ACT.SPLIT : ACT.STAND;
      } else {
        let A, AA, ci, kind;
        if (n === 2) {
          const T = fromSplit ? S.split : S.initial;
          canPair = c1 === c2 && this.nHands < R.maxHands && !(c1 === 1 && fromSplit && !R.resplitAces);
          if (canPair) { A = T.pair; AA = T.pairAlt; ci = c1 * 11 + up; kind = 'pair'; }
          else if (soft) { A = T.soft; AA = T.softAlt; ci = eff * 11 + up; kind = 'soft'; }
          else { A = T.hard; AA = T.hardAlt; ci = total * 11 + up; kind = 'hard'; }
        } else if (soft) { A = S.multi.soft; AA = S.multi.softAlt; ci = eff * 11 + up; kind = 'soft'; }
        else { A = S.multi.hard; AA = S.multi.hardAlt; ci = total * 11 + up; kind = 'hard'; }
        const base = A[ci];
        act = base;
        let devApplied = false;
        if (isMe && this.hasDev) {
          const di = this.dev[kind][ci];
          if (di === di) {
            const above = this.devA[kind][ci], below = this.devB[kind][ci];
            if (base === above || base === below) {
              const want = this.tcNow() >= di ? above : below;
              if (want !== act) {
                let ok = true;
                if (want === ACT.DOUBLE) ok = n === 2 && (!fromSplit || R.das) && canDouble(R, total, soft);
                else if (want === ACT.SURRENDER) ok = n === 2 && !fromSplit && R.surrender !== 'none';
                else if (want === ACT.SPLIT) ok = canPair;
                if (ok) { act = want; devApplied = true; }
              }
            }
          }
        }
        if (isMe && this.mistake > 0 && this.rand() < this.mistake) {
          act = devApplied ? base : AA[ci];
        }
      }
      switch (act) {
        case ACT.STAND: this.rec(isMe, eff, mult); return;
        case ACT.HIT: {
          const v = this.drawSee();
          total += v; if (v === 1) ha = true; n++;
          continue;
        }
        case ACT.DOUBLE: {
          const v = this.drawSee();
          total += v; if (v === 1) ha = true;
          const e2 = ha && total + 10 <= 21 ? total + 10 : total;
          this.rec(isMe, total > 21 ? 0 : e2, 2);
          return;
        }
        case ACT.SURRENDER: this.rec(isMe, -1, 1); return;
        case ACT.SPLIT: {
          this.nHands++;
          this.playHand(c1, this.drawSee(), true, c1 === 1, isMe);
          this.playHand(c1, this.drawSee(), true, c1 === 1, isMe);
          return;
        }
        default: this.rec(isMe, eff, mult); return;
      }
    }
  }

  /** Plays a complete round. `play` = whether you are in the hand. Returns units won (per 1 unit bet). */
  playRound(play) {
    const R = this.R;
    const nO = !play && this.nOthers === 0 ? 1 : this.nOthers;
    // deal
    const o1 = this._o1 || (this._o1 = new Uint8Array(8)), o2 = this._o2 || (this._o2 = new Uint8Array(8));
    for (let i = 0; i < nO; i++) o1[i] = this.drawSee();
    let m1 = 0, m2 = 0;
    if (play) m1 = this.drawSee();
    const up = this.drawSee();
    this.up = up;
    for (let i = 0; i < nO; i++) o2[i] = this.drawSee();
    if (play) m2 = this.drawSee();
    let hole = 0;
    if (R.peek) hole = this.draw();
    let x = 0;
    let dealerNat = false;
    // insurance & peek
    let ins = 0;
    if (R.peek && (up === 1 || up === 10)) {
      if (play && up === 1 && this.insIdx !== null && this.tcNow() >= this.insIdx) ins = 1;
      dealerNat = (up === 1 && hole === 10) || (up === 10 && hole === 1);
      if (dealerNat) {
        this.rc += HI_LO[hole];
        if (!play) return 0;
        const nat = m1 + m2 === 11 && (m1 === 1 || m2 === 1);
        return (nat ? 0 : -1) + (ins ? 1 : 0);
      }
    }
    if (ins) x -= 0.5;
    this.live = false;
    this.nHands = 1;
    for (let i = 0; i < nO; i++) {
      if (o1[i] + o2[i] === 11 && (o1[i] === 1 || o2[i] === 1)) continue;
      this.playHand(o1[i], o2[i], false, false, false);
    }
    let myNat = false;
    this.rN = 0;
    if (play) {
      if (m1 + m2 === 11 && (m1 === 1 || m2 === 1)) myNat = true;
      else { this.nHands = 1; this.playHand(m1, m2, false, false, true); }
    }
    // dealer
    if (!R.peek) hole = this.draw();
    this.rc += HI_LO[hole];
    let dTot = up + hole, dAce = up === 1 || hole === 1;
    const nat = dTot === 11 && dAce;
    let D = 0;
    if (nat) { dealerNat = true; D = 22 + 1; }
    else {
      if (this.live) {
        for (;;) {
          const e = dAce && dTot + 10 <= 21 ? dTot + 10 : dTot;
          if (e > 21) break;
          if (e >= 18 || (e === 17 && !(e !== dTot && R.h17))) break;
          const v = this.drawSee(); dTot += v; if (v === 1) dAce = true;
        }
      }
      D = dAce && dTot + 10 <= 21 ? dTot + 10 : dTot; // >21 means bust
    }
    if (!play) return 0;
    const comm = this.comm;
    const win = (u) => (comm > 0 ? u * (1 - comm) : u);
    if (myNat) { return x + (dealerNat ? 0 : win(R.bjPay)); }
    if (dealerNat) { // only reachable without peek
      if (R.obo) return x - 1;
      let s = 0; for (let k = 0; k < this.rN; k++) s += this.rT[k] === -1 ? 0.5 : this.rM[k];
      return x - s;
    }
    for (let k = 0; k < this.rN; k++) {
      const t = this.rT[k], m = this.rM[k];
      if (t === -1) x -= 0.5;
      else if (t === 0) x -= m;
      else if (D > 21 || t > D) x += win(m);
      else if (t < D) x -= m;
    }
    return x;
  }

  /** Called before each round: advance counting error, return perceived TC bin. */
  beginRound() {
    if (this.errRate > 0 && this.rand() < this.errRate) this.drift += this.rand() < 0.5 ? -1 : 1;
  }
  endRound() {
    if (this.R.csm || this.ptr >= this.cut) this.reshuffle();
  }

  /** Flat 1-unit bet every round; statistics by perceived true count bin. */
  runBins(rounds, progress) {
    const n = new Float64Array(NBINS), s1 = new Float64Array(NBINS), s2 = new Float64Array(NBINS);
    const tick = 200000;
    for (let r = 0; r < rounds; r++) {
      this.beginRound();
      const b = this.binTC();
      const x = this.playRound(true);
      this.endRound();
      n[b]++; s1[b] += x; s2[b] += x * x;
      if (progress && r % tick === tick - 1) progress(r + 1);
    }
    return { n, s1, s2, rounds };
  }

  /**
   * Bankroll walks. bets: Float64Array(NBINS) dollars per bin (0 = sit out).
   * Returns { traj: Float32Array(runs*(cp+1)), ruin: Int32Array(runs) (round of ruin or -1) }.
   */
  runBankroll({ runs, rounds, checkpoints, bets, bankroll, minBet, perRoundCost, rakePerHand, compPct }, progress) {
    const cp = checkpoints;
    const traj = new Float32Array(runs * (cp + 1));
    const ruin = new Int32Array(runs).fill(-1);
    const step = rounds / cp;
    for (let run = 0; run < runs; run++) {
      this.reshuffle();
      let bank = bankroll;
      let nextCp = 0, cpi = 0;
      let dead = false;
      for (let r = 0; r <= rounds; r++) {
        if (r >= nextCp && cpi <= cp) { traj[run * (cp + 1) + cpi] = bank; cpi++; nextCp = cpi * step; }
        if (r === rounds || dead) { if (dead) continue; break; }
        if (bank < minBet) { dead = true; ruin[run] = r; continue; }
        this.beginRound();
        let bet = bets[this.binTC()];
        if (bet > bank) bet = bank;
        const x = this.playRound(bet > 0);
        this.endRound();
        if (bet > 0) bank += bet * x - rakePerHand + compPct * bet;
        bank -= perRoundCost;
      }
      while (cpi <= cp) { traj[run * (cp + 1) + cpi] = bank; cpi++; }
      if (progress && run % 20 === 19) progress(run + 1);
    }
    return { traj, ruin };
  }
}
