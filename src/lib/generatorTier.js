// Generator tier, gated dynamically on the player's CURRENT highest-held
// rank (not a ratchet) — re-evaluated after every step. See CLAUDE.md's
// multiplier-tier section for the thresholds; re-lock semantics were an
// explicitly open question, resolved as "dynamic" for this simulation.
export const TIER2_UNLOCK_RANK = 7
export const TIER4_UNLOCK_RANK = 10

export function currentTier(maxRankHeld) {
  if (maxRankHeld >= TIER4_UNLOCK_RANK) return { cost: 4, normalRank: 3 }
  if (maxRankHeld >= TIER2_UNLOCK_RANK) return { cost: 2, normalRank: 2 }
  return { cost: 1, normalRank: 1 }
}
