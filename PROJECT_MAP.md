# PROJECT_MAP — Cutcard (blackjack counting calculator)

Static web app (no build step, no dependencies). ES modules + Web Workers + canvas charts.
Run: `npm start` → http://localhost:8080 (or host the folder on any static host). Tests: `npm test`. Strategy cross-check: `npm run verify`.
Use this file as context instead of reading all source.

## App structure (user view)
Home screen = the 3D table (`src/trainer/`). Floating controls: Tutorial · Settings · **EV calculator**; bottom launch panel picks the mode (Keep the count / Basic strategy / Count + play with optional index plays) — switching modes glides the camera, **Start** begins. **EV calculator**: the camera dives into the felt (`felt` camera) and the calculator UI (`src/ui/evpanel.js`, `css/ev.css`) fades in as if printed on it — hero numbers (EV/hr, risk of ruin, edge vs house), six secondary metrics, two charts; all inputs live in four sub-tables (Game · Bet spread · Skill · Bankroll & costs) and a "More tools" menu opens the detailed tools in modals. "Use my training performance" / "Calculate EV from my play" converts session accuracy into mistake and count-slip rates (`applySession` in `src/ui/app.js`).

## Data flow (one paragraph)
`config` (rules, table, player, costs, spread) → `compileSetup` builds strategy tables (engine) + active deviations →
`Simulator.runBins` deals millions of flat-bet rounds in Web Workers and records, per **perceived true count bin**, `n, Σx, Σx²` →
`binStats` smooths them (shrink toward linear fit) → `evaluateBets` turns any bet spread into EV/hr, SD, RoR, N0, hours-to-95% instantly →
`optimizeSpread` finds the best ramp for a bankroll/RoR →
`Simulator.runBankroll` (Monte Carlo, workers) validates with real dealt-card bankroll paths → `aggregateRuns` → charts.

## Root
| File | Purpose |
|---|---|
| `index.html` | App shell: `#trainer` (home table), `#ev` (EV calculator overlay with its own bar), tool modal, tutorial container. |
| `package.json` | `type: module`; scripts `start`, `test`, `verify`. |
| `README.md` | User/dev quick start & deploy notes. |
| `PROJECT_MAP.md` | This file. |
| `docs/STRATEGY_SOURCES.md` | How strategy/deviation/house-edge numbers were verified. |
| `.claude/launch.json` | Dev-server config for the Claude desktop preview. |

## `assets/` (solid-colour 2D SVGs)
`logo.svg`, `favicon.svg`, `suit-*.svg`, `chip.svg`, `card-back.svg`, `icon-*.svg`.

## `css/style.css`
Whole dark theme (CSS variables at top), cards, forms, tables, strategy chart colours, responsive rules.

## `src/core/` — config & rules (no DOM)
| File | Purpose |
|---|---|
| `constants.js` | `ACT` action codes, Hi-Lo tag table, true-count bin range (`TC_MIN/TC_MAX/NBINS`). |
| `rng.js` | Seedable fast PRNG (`makeRng`). |
| `rules.js` | Defaults for rules/table/player/costs/spread, `canDouble`, `cutCard`, `validateConfig`, `simKey` (what invalidates cached simulation). |
| `rulesParser.js` | Table-rules text syntax ⇄ rules (`parseRules`, `toRulesString`, `applyParsed`); also natural language. |
| `presets.js` | 9 presets (Vegas strip, great 2D, single deck, 6:5 trap, CSM, ENHC…) → `configFromPreset`. |

## `src/strategy/` — math engine (no DOM)
| File | Purpose |
|---|---|
| `engine.js` | Dealer outcome distribution (exact, memoised, with card removal); hit/stand DP; `actionValues` = EV of stand/hit/double/split/surrender for a hand under a deck composition (handles peek/ENHC/OBO/early+late surrender, DAS, resplit limits, split aces); `countsAtTC` mean-field Hi-Lo composition. |
| `basicStrategy.js` | `buildStrategy(rules, composition?)` → tables `initial/split/multi` (hard/soft/pair × upcard) with best action, 2nd-best (`*Alt`, used for mistakes) and display fallback (`*Fb`). `cellCode` for charts. |
| `houseEdge.js` | `strategyEV`: exact EV per round of following the tables from a composition (house edge). |
| `deviations.js` | Published I18 + Fab 4 (`PUBLISHED`), extended chart set (`EXTRA`, rule-tagged), engine-derived indices (`deriveIndices`), insurance crossing, `compileDeviations` (filters by rule applicability & user toggles). |

## `src/sim/` — Monte Carlo (no DOM)
| File | Purpose |
|---|---|
| `simulator.js` | `Simulator`: lazy-Fisher-Yates shoe, cut card, full round (others, peek, insurance, splits, doubles, surrender, dealer play, settlement, commission), perceived true count (rounding, deck resolution, count-error drift), deviations, mistakes. `runBins` (flat bet stats by TC) and `runBankroll` (spread-driven bankroll walks). |
| `compile.js` | `compileSetup(cfg, derived)` → serialisable setup passed to workers. |
| `worker.js` | Web Worker entry running `bins`/`bankroll` tasks. |
| `pool.js` | `SimPool`: splits jobs over `hardwareConcurrency` workers, merges, progress, cancel, inline fallback. |

## `src/analysis/` — turns simulation into decisions (no DOM)
| File | Purpose |
|---|---|
| `stats.js` | `mergeBins`, `binStats` (per-TC f, μ, E[x²], shrinkage to linear fit, slope). |
| `spread.js` | Spread presets, `betsFromSpread` ($ per TC bin w/ limits/wong-out), `evaluateBets` (EV/hr, SD, RoR, N0, n95, costs, comps), ruin & trip-ruin formulas. |
| `optimizer.js` | `optimizeSpread`: Kelly-proportional ramp scaled to a RoR target (grid search over scale and min bet); `rampToSpread`. |
| `runStats.js` | `aggregateRuns`: mean, SD, percentiles, cumulative ruin from Monte Carlo matrices. |

## `src/ui/` — browser UI
| File | Purpose |
|---|---|
| `app.js` | Entry. Shared `app` state (config, persistence in localStorage + share link `#c=`), debounced `recompute()`. Home page = the 3D table; `openEV/closeEV` run the felt-zoom EV calculator; every detailed module is a **tool** opened in a modal from the EV calculator's **More tools** menu (`TOOLS` list, `show(id)`, `show('home')` closes). |
| `dom.js` | `h()` element builder, number formatters, path helpers. |
| `fields.js` | Declarative inputs bound to config paths (`makeField`, `card`). |
| `charts.js` | Canvas line/band charts with hover, bar charts, histogram. |
| `evpanel.js` | EV calculator page printed on the felt (see App structure). |
| `tabs/game.js` | Presets, rules, table & pace, costs/rake/comps, copy/paste rules. |
| `tabs/player.js` | Deviation set, TC rounding, deck estimation, count-error & mistake rates, bankroll, back-counting, per-deviation toggles. |
| `tabs/results.js` | Spread editor, metrics, spread comparison, EV-by-TC charts, sanity checks. |
| `tabs/simulate.js` | Monte Carlo bankroll runs: paths + ±1σ/2σ, percentile fan, final histogram, ruin curve vs formula. |
| `tabs/ideal.js` | Optimal spread for bankroll & RoR, bankroll tiers table, "use this spread". |
| `tabs/whatif.js` | Sweep one factor (count error, mistakes, penetration, deviations, decks, players, resolution). |
| `tabs/strategy.js` | Generated charts with deviation index tags. |
| `tabs/help.js` | Quick start, glossary, syntax, method, limits. |

## `src/trainer/` — Home screen / Trainer
| File | Purpose |
|---|---|
| `shoe.js` | Trainer shoe: lazy shuffle, running count, decks-left estimate, floored true count, rigged draws for drills. |
| `advisor.js` | Correct-play oracle built on `strategy/` (generated basic strategy for the user's rules + I18/Fab4/engine deviations), legality, hand descriptions, EV cost of mistakes. |
| `scene.js` | Semi-3D table in pure CSS 3D (perspective plane, rim, felt, vignette); cards, chips, pills, count tags; camera presets (`wide`, `mid`, `close`); all motion via transform/opacity (Web Animations API) so it stays GPU-cheap. |
| `session.js` | Game flow (deal order, peek, insurance, split/double/surrender, dealer play, settlement), three modes (count / strategy / both), count quizzes (running/true), scoring, mistake log. |
| `ui.js` | Home UI floating over the table (incl. left-side running decision log): brand, Tutorial/Settings/EV buttons, mode picker + Start, stats bar, dock (actions, quizzes, feedback), settings drawer, session review; exposes `app.getPerformance()` for the EV calculator. |
| `mistakes.js` | Persistent bank of 2-card basic-strategy mistakes (localStorage) used by "Drill only my mistakes"; a spot is cleared after two correct answers in a row. |
| `tutorial.js` | Interactive 7-step tutorial (Hi-Lo tags, running count, true count, basic strategy, index plays, EV calculator). |
| `css/trainer.css` | Table, cards, HUD styling. |

## `tests/` (`npm test`, Node ≥ 18)
`trainer.test.js` advisor/shoe; `parser.test.js` rules text; `strategy.test.js` charts vs published, house edges, indices vs engine; `sim.test.js` simulator vs exact EV, effect of errors/mistakes, MC vs analytic.

## `scripts/`
`verify-extra.mjs`/`devcompare.mjs`/`devablate.mjs`/`devone.mjs` deviation checks · `serve.mjs` static server · `verify-strategy.mjs` published-vs-engine index table · `he.mjs` house edges · `quick.mjs` print a chart · `simcheck.mjs`, `analysis-check.mjs` ad-hoc checks.

## Extending
* New rule: add to `defaultRules`, handle in `engine.js` (`actionValues`) AND `simulator.js`, add a field in `tabs/game.js`, token in `rulesParser.js`, test in `tests/`.
* New counting system: add tag table in `constants.js`, thread through `simulator.js` (`HI_LO`) and `countsAtTC`; indices must be regenerated (engine set).
* Anything that changes round play must be in `simKey` (rules.js) so statistics refresh.
