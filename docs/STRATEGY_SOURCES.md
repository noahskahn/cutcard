# Strategy & number verification

How the basic strategy, deviations and house-edge figures were cross-checked.

## 1. Basic strategy
Tables are **generated** (not typed in) by `src/strategy/engine.js` + `basicStrategy.js` for the exact rule set. They were verified against:

| Reference | What was compared | Result |
|---|---|---|
| Wizard of Odds, 4-deck S17 strategy page (text summary, fetched) | All hard/soft/pair plays, surrender (hard 16 vs 9/10/A, 15 vs 10), H17 differences (surrender 15 & 8,8 & 17 vs A; double 11 vs A; double soft 18 vs 2; soft 19 vs 6) | Identical |
| Standard published 6-deck S17 DAS chart (widely reproduced; memorised reference) | Every cell of hard 9–16, soft 13–18, all pairs | Identical (`tests/strategy.test.js`) |
| Single-deck charts (known single-deck exceptions) | 11 vs A double, 8 vs 5/6 double, 7,7 vs 10 stand, 9 vs 2 double | Identical |

## 2. House edge (exact engine) vs published
Baseline 6D, S17, DAS, resplit to 4, no RSA, no surrender, 3:2, dealer peeks.

| Quantity | Engine | Published (Wizard of Odds / standard references) |
|---|---|---|
| 6D S17 DAS baseline | 0.402% | ≈0.40% |
| 8D S17 DAS | 0.429% | ≈0.43% |
| H17 penalty | +0.21% | ≈0.2% |
| 6:5 payout penalty | +1.36% | ≈1.39% |
| Late surrender | −0.07% | ≈−0.07% |
| No DAS | +0.14% | ≈+0.14% |
| No hole card (lose all bets) | +0.11% | ≈+0.11% |

## 3. Simulation vs engine
`tests/sim.test.js` deals tens of millions of rounds with a continuous shuffler and compares the mean to the exact engine for four rule sets (agreement within 5 standard errors; typical agreement ≤ 1 SE). A single-deck, no-DAS, no-resplit game differs by ≈0.05% (engine optimistic) because the engine draws later hit cards from a fixed composition; for 2+ decks the gap is within noise.

## 4. Count deviations (Hi-Lo)
Published sets in `src/strategy/deviations.js`:

* **Illustrious 18** (Schlesinger): insurance +3, 16v10 0, 15v10 +4, 10,10v5 +5, 10,10v6 +4, 10v10 +4, 12v3 +2, 12v2 +3, 11vA +1, 9v2 +1, 10vA +4, 9v7 +3, 16v9 +5, 13v2 −1, 12v4 0, 12v5 −2, 12v6 −1, 13v3 −2.
* **Fab 4** (late surrender): 14v10 +3, 15v10 0, 15v9 +2, 15vA +1.

Cross-referenced against (a) Wizard of Odds Hi-Lo page (fetched; matched all 22 numbers exactly), (b) Schlesinger/Blackjack Attack figures as widely reproduced, and (c) an **independent computation**: the EV engine with a mean-field Hi-Lo composition (`countsAtTC`) finds the true count where the best play changes. For 6D S17 DAS the engine's floored indices agree with every published I18 value within ±1 (many exactly): e.g. insurance crossing 3.06 (index 3), 12v2 3.06 (3), 13v2 −1.04 (−1), 12v5 −2.01 (−2), 9v7 2.56 (3), 15v10-surrender −0.14 (0), 14v10-surrender 3.47 (3), 15v9-surrender 2.12 (2). `npm run verify` prints the full comparison for several rule sets.

Applicability rules: a published index is only used if basic strategy under *your* rules already plays the expected "base" action (e.g. 11 vs A double is skipped under H17 because basic strategy already doubles; surrender entries are skipped without surrender). Published indices were derived for ~6-deck S17 games; with other rules they are close but not optimal. The experimental "engine" set recomputes indices for the exact rules; the engine is a mean-field approximation, so treat individual values (especially 1–2 deck and H17 cases) as ±1–2 estimates.

## 5. Known approximations
* Other players follow basic strategy; one player hand per round.
* Mistakes = 2nd-best action; count error = persistent ±1 drift.
* Variance/ruin formulas treat rounds as independent (standard practice).
