// Turns a user config into a plain, structured-clone-safe "compiled setup" that
// the simulator (main thread or worker) consumes.
import { buildStrategy } from '../strategy/basicStrategy.js';
import { compileDeviations } from '../strategy/deviations.js';
import { cutCard } from '../core/rules.js';

export function compileSetup(cfg, derived = null) {
  const strategy = buildStrategy(cfg.rules);
  const devs = compileDeviations(cfg.rules, strategy, cfg.player, derived);
  return {
    rules: cfg.rules, table: cfg.table, player: cfg.player, costs: cfg.costs,
    strategy, devs, cut: cutCard(cfg.rules, cfg.table),
  };
}
