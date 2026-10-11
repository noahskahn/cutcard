// "Help" tab: quick start, glossary, rule syntax, method and limitations.
import { h } from '../dom.js';

export function mount(root) {
  const html = `
<div class="card help">
<h3>Quick start</h3>
<ol>
<li><b>Game</b> — pick a preset (or paste the rules you saw at a table). Tweak any rule, penetration, speed, table limits and costs.</li>
<li><b>Player</b> — choose basic strategy only or add count deviations (Illustrious 18 / Fab 4 / full engine set), and optionally model counting errors or strategy mistakes.</li>
<li><b>Spread &amp; EV</b> — set your bet at each true count. See hourly EV, variance, risk of ruin and hours until you are 95% likely to be ahead.</li>
<li><b>Simulate</b> — run thousands of bankroll trips and view paths with ±1σ/±2σ bands.</li>
<li><b>Ideal Bets</b> — get the optimal spread for your bankroll at a 1% (or any) risk of ruin.</li>
<li><b>What-If</b> — compare e.g. 0%, 2%, 5% count errors side by side.</li>
</ol>
<h4>Glossary</h4>
<ul>
<li><b>Running count (RC)</b> — Hi-Lo tally: +1 for 2–6, 0 for 7–9, −1 for 10–A.</li>
<li><b>True count (TC)</b> — RC ÷ decks remaining. Each +1 TC is worth roughly +0.5% to the player.</li>
<li><b>Index / deviation</b> — a true count at which a different play beats basic strategy.</li>
<li><b>EV</b> — expected value (average profit). <b>SD</b> — standard deviation. <b>N0</b> — hands needed for EV to equal one SD.</li>
<li><b>Risk of ruin</b> — probability of losing the entire bankroll before it grows without bound: exp(−2·EV·bankroll / variance).</li>
<li><b>Penetration</b> — share of the shoe dealt before the shuffle. The most important rule for a counter.</li>
<li><b>Back-counting (wonging)</b> — watching and only sitting down at positive counts.</li>
</ul>
<h4>Table rules syntax</h4>
<p>Write rules as tokens in any order, e.g. <code>6D H17 DAS NoRSA LS 3:2 PEEK SPL4 DBL:ANY PEN:75% MIN:25 MAX:1000 RPH:90 PLAYERS:2</code></p>
<ul>
<li><code>1D 2D 4D 6D 8D</code> decks · <code>S17</code>/<code>H17</code> · <code>DAS</code>/<code>NoDAS</code> · <code>RSA</code>/<code>NoRSA</code> · <code>HSA</code>/<code>NoHSA</code></li>
<li><code>LS</code> late, <code>ES</code> early, <code>NoSur</code> · <code>3:2</code> <code>6:5</code> <code>7:5</code> <code>2:1</code> <code>1:1</code> blackjack payout</li>
<li><code>PEEK</code> or <code>ENHC</code> (+ <code>OBO</code> / <code>ALLBETS</code>) · <code>SPL2..8</code> max hands · <code>DBL:ANY|9-11|10-11|NONE</code> · <code>CSM</code></li>
<li><code>PEN:75%</code>, <code>PEN:4.5/6</code> (decks dealt / decks) or <code>PEN:0.75</code> · <code>MIN: MAX: RPH: PLAYERS: INC:</code></li>
<li>Plain English also works: “eight decks, dealer stands on soft 17, no double after split, blackjack pays 6:5”.</li>
</ul>
<h4>How the numbers are produced</h4>
<ul>
<li><b>Basic strategy</b> is generated for your exact rules by an expected-value engine: exact dealer outcome probabilities with card removal, hit/stand dynamic programming, recursive resplitting. It reproduces published charts and house-edge figures (see docs/STRATEGY_SOURCES.md).</li>
<li><b>Simulation</b> deals real shoes card by card: other players use basic strategy, the cut card ends the shoe after the round in progress, the count includes every visible card, insurance/indices use the live true count.</li>
<li><b>EV by true count</b> is measured from many millions of flat-bet rounds per game setup, binned by the true count <i>you</i> perceive (so counting errors and mistakes are included). Any spread is then evaluated instantly from those statistics.</li>
<li><b>Risk of ruin &amp; hours to profit</b> use the standard Brownian-motion formulas; the <b>Simulate</b> tab verifies them against dealt-card Monte Carlo.</li>
<li><b>Ideal Bets</b> sizes bets proportional to edge ÷ variance (Kelly-style) and scales them to hit your risk-of-ruin target.</li>
</ul>
<h4>Known limits</h4>
<ul>
<li>Hi-Lo counting only. One hand played per round. Other players follow basic strategy. Count errors are modelled as ±1 drift that persists until the shuffle.</li>
<li>Strategy mistakes play the second-best action (or skip a deviation); real mistakes can be worse.</li>
<li>Engine-derived indices are mean-field approximations (typically within ±1 of published values); the single-deck basic-strategy EV from the exact engine is ~0.05% optimistic versus dealt-card simulation.</li>
<li>Casino countermeasures (shuffling early, flat-betting requirements, backoffs) and heat are not modelled.</li>
</ul>
</div>`;
  root.append(h('div', { html }));
  return {};
}
