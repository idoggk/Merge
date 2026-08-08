// Generator tier, gated dynamically on the player's CURRENT highest-held
// rank (not a ratchet) — re-evaluated after every step. See CLAUDE.md's
// multiplier-tier section for the thresholds; re-lock semantics were an
// explicitly open question, resolved as "dynamic" for this simulation.
export const TIER2_UNLOCK_RANK = 7
export const TIER4_UNLOCK_RANK = 10

export const GENERATOR_TIERS = [
  { cost: 1, normalRank: 1, unlocksAt: null },
  { cost: 2, normalRank: 2, unlocksAt: TIER2_UNLOCK_RANK },
  { cost: 4, normalRank: 3, unlocksAt: TIER4_UNLOCK_RANK },
]

// All tiers unlocked at this max-rank-held, ascending by cost.
export function unlockedTiers(maxRankHeld) {
  return GENERATOR_TIERS.filter((t) => t.unlocksAt == null || maxRankHeld >= t.unlocksAt)
}

// The automatic simulator always greedily spends at the highest unlocked
// tier - it has no notion of "choosing" a lower one.
export function currentTier(maxRankHeld) {
  const unlocked = unlockedTiers(maxRankHeld)
  return unlocked[unlocked.length - 1]
}
