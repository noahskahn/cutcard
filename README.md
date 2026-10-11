# Cutcard

Advantage-play analytics for blackjack. Model any rule set, count with Hi-Lo and index plays, size a bet spread, and see expected value, variance, risk of ruin and bankroll trajectories — backed by an exact expected-value engine and a card-by-card Monte Carlo simulator.

**Live app:** https://noahskahn.github.io/cutcard/

## Features
- **Any rule set:** decks, S17/H17, blackjack payout, double restrictions, DAS, resplits, split-ace rules, early/late surrender, hole-card peek vs. European no-hole-card, penetration, continuous shufflers, table limits, pace and crowding.
- **Presets** from a typical Strip shoe to a great heads-up double-deck game, plus a **copy/paste rules syntax** (`6D H17 DAS LS 3:2 PEEK SPL4 PEN:75% MIN:25 RPH:90 PLAYERS:2`; plain English works too).
- **Generated basic strategy** for the exact rules, **Illustrious 18 / Fab 4**, and an engine-derived full index set.
- **Player imperfection:** running-count error rate and strategy-mistake rate, applied in simulation and what-if sweeps.
- **Spread analytics:** EV and standard deviation per hour, risk of ruin, N0, hours to a 95% chance of profit, costs / rake / comps.
- **Monte Carlo:** thousands of dealt-card bankroll runs with ±1σ/±2σ bands, percentile fans and ruin curves.
- **Ideal bets:** Kelly-proportional ramp scaled to a target risk of ruin for any bankroll.

## Trainer
A separate **Trainer** view with a semi-3D table: *Keep the count* (Hi-Lo quizzes at configurable moments, running or true count), *Basic strategy* (camera swoops in; every play is graded with its EV cost; drill hard/soft/pairs/doubles/surrender spots), and *Count + deviations* (play Illustrious 18 / Fab 4 / engine indices from your own count). Deal speed, quiz cadence, training wheels (show count, +1/0/−1 tags) and table size are adjustable. Rendering uses CSS 3D transforms only (no WebGL, no per-frame JavaScript).

## Verification
Basic strategy and house edges match published references (Wizard of Odds); simulation agrees with the exact engine; published indices are reproduced independently by the engine within ±1. Details: [docs/STRATEGY_SOURCES.md](docs/STRATEGY_SOURCES.md). Run `npm test`.

## Run locally
```bash
npm start      # http://localhost:8080
npm test       # engine, strategy, simulator and parser tests (Node 18+)
```
No build step or dependencies; any static host works. Module Web Workers require http(s).

## Project layout
See [PROJECT_MAP.md](PROJECT_MAP.md).

## Disclaimer
Educational analysis tool. Results are statistical estimates under stated assumptions (Hi-Lo, one hand, others on basic strategy). Casinos may refuse service to counters; gamble responsibly.

MIT licensed.
