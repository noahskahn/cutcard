// One-click game presets. Each is a partial override applied over defaults.
import { defaultConfig } from './rules.js';

export const PRESETS = [
  { id: 'solid-6d', name: 'Solid 6-deck shoe', tag: 'Beatable',
    blurb: '6D, dealer stands on S17, DAS, late surrender, 3:2, 80% penetration. A realistic good shoe game.',
    rules: { decks: 6, h17: false, das: true, surrender: 'late', penetration: 0.8, bjPay: 1.5, maxHands: 4 },
    table: { minBet: 25, maxBet: 1000, roundsPerHour: 90, otherPlayers: 2 }, spread: { unit: 25, preset: '1-12' } },
  { id: 'vegas-strip', name: 'Typical Vegas Strip 6-deck', tag: 'Marginal',
    blurb: '6D, dealer hits soft 17, DAS, no surrender, 3:2, ~75% penetration, busy table. Barely beatable.',
    rules: { decks: 6, h17: true, das: true, surrender: 'none', penetration: 0.75, bjPay: 1.5, maxHands: 4 },
    table: { minBet: 25, maxBet: 2000, roundsPerHour: 80, otherPlayers: 3 }, spread: { unit: 25, preset: '1-8' } },
  { id: 'dream-2d', name: 'Great 2-deck game (heads-up)', tag: 'Great',
    blurb: '2D, S17, DAS, late surrender, resplit aces, 3:2, 85% penetration, heads-up with the dealer.',
    rules: { decks: 2, h17: false, das: true, surrender: 'late', resplitAces: true, penetration: 0.85, bjPay: 1.5, maxHands: 4 },
    table: { minBet: 25, maxBet: 1000, roundsPerHour: 180, otherPlayers: 0 }, spread: { unit: 25, preset: '1-8' } },
  { id: 'good-sd', name: 'Good single deck (3:2)', tag: 'Great',
    blurb: '1D, S17, DAS, double any, 3:2, 65% penetration, two other players. Small bet spreads are enough.',
    rules: { decks: 1, h17: false, das: true, surrender: 'none', penetration: 0.65, bjPay: 1.5, maxHands: 2 },
    table: { minBet: 25, maxBet: 500, roundsPerHour: 140, otherPlayers: 2 }, spread: { unit: 25, preset: '1-4' } },
  { id: 'sd-65', name: 'Single deck 6:5 (trap)', tag: 'Avoid',
    blurb: '1D that pays 6:5 for blackjack. The payout destroys the counter\'s edge.',
    rules: { decks: 1, h17: false, das: false, surrender: 'none', penetration: 0.5, bjPay: 1.2, maxHands: 2, doubleOn: '9-11' },
    table: { minBet: 15, maxBet: 300, roundsPerHour: 150, otherPlayers: 2 }, spread: { unit: 15, preset: '1-4' } },
  { id: 'riverboat-8d', name: 'Riverboat 8-deck, shallow cut', tag: 'Poor',
    blurb: '8D, H17, DAS, no surrender, 3:2, ~60% penetration. Common, hard to beat.',
    rules: { decks: 8, h17: true, das: true, surrender: 'none', penetration: 0.6, bjPay: 1.5, maxHands: 4 },
    table: { minBet: 15, maxBet: 1000, roundsPerHour: 85, otherPlayers: 3 }, spread: { unit: 15, preset: '1-12' } },
  { id: 'online-csm', name: 'Online / CSM table', tag: 'Unbeatable',
    blurb: 'Reshuffled every round (continuous shuffling machine or RNG table). Counting does nothing.',
    rules: { decks: 8, h17: false, das: true, surrender: 'none', csm: true, penetration: 0.5, bjPay: 1.5, maxHands: 4 },
    table: { minBet: 10, maxBet: 1000, roundsPerHour: 200, otherPlayers: 0 }, spread: { unit: 10, preset: '1-4' } },
  { id: 'enhc', name: 'European no-hole-card', tag: 'Poor',
    blurb: '6D, S17, no hole-card peek (lose doubles/splits to dealer blackjack), double 9-11, 3:2.',
    rules: { decks: 6, h17: false, das: true, peek: false, obo: false, doubleOn: '9-11', surrender: 'none', penetration: 0.75, maxHands: 4, bjPay: 1.5 },
    table: { minBet: 25, maxBet: 1000, roundsPerHour: 90, otherPlayers: 2 }, spread: { unit: 25, preset: '1-8' } },
  { id: 'bad-6-5-shoe', name: '6:5 six-deck shoe (trap)', tag: 'Avoid',
    blurb: '6D, H17, 6:5 blackjack. House edge over 2% before any counting.',
    rules: { decks: 6, h17: true, das: true, surrender: 'none', bjPay: 1.2, penetration: 0.75, maxHands: 4 },
    table: { minBet: 15, maxBet: 1000, roundsPerHour: 85, otherPlayers: 3 }, spread: { unit: 15, preset: '1-8' } },
];

export const DEFAULT_PRESET = 'solid-6d';

import { SPREAD_PRESETS } from '../analysis/spread.js';

export function configFromPreset(id) {
  const p = PRESETS.find((x) => x.id === id) || PRESETS[0];
  const cfg = defaultConfig();
  Object.assign(cfg.rules, p.rules);
  Object.assign(cfg.table, p.table);
  cfg.table.increment = cfg.table.minBet >= 25 ? 5 : 1;
  cfg.spread = { unit: p.spread.unit, bets: [...SPREAD_PRESETS[p.spread.preset]] };
  cfg.player.bankroll = Math.round(cfg.table.minBet * 800 / 1000) * 1000 || 20000;
  cfg.preset = p.id;
  return cfg;
}
