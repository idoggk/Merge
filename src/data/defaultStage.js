// A real, valid 2-board demo stage baked in as the default for the
// player-facing Play view (src/components/PlayStage.jsx) so a fresh browser
// with no saved state sees something designed rather than an empty board.
// Generated once via the app's own placeItems pipeline (see
// _scratch_default_stage.mjs, since deleted) and verified exact-sum against
// each board's blockedValue; the layout below is that verified output,
// frozen as data. IDs are minted fresh on each call rather than embedding
// the generation script's static ones.

export function createDefaultStage() {
  return {
    boards: [
      {
        id: crypto.randomUUID(),
        name: 'Board 1',
        rows: 5,
        cols: 8,
        tiles: [
          ['blocked', 'blocked', 'open', 'open', 'open', 'open', 'blocked', 'blocked'],
          ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open'],
          ['open', 'open', 'open', 'semi', 'semi', 'open', 'open', 'open'],
          ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open'],
          ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open'],
        ],
        blockedValue: 30,
        minRank: 1,
        maxRank: 6,
        targetEv: 1.1,
        semiPlacements: [
          { row: 2, col: 3, rank: 4 },
          { row: 2, col: 4, rank: 4 },
        ],
        blockedQueue: [2, 3, 3, 3],
        onboardingDrBudget: null,
        onboardingTargetRank: null,
        onboardingStatus: null,
        rewardRanks: [3, 5, 8],
      },
      {
        id: crypto.randomUUID(),
        name: 'Board 2',
        rows: 2,
        cols: 8,
        tiles: [
          ['open', 'open', 'blocked', 'blocked', 'blocked', 'blocked', 'open', 'open'],
          ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open'],
        ],
        blockedValue: 15,
        minRank: 1,
        maxRank: 5,
        targetEv: 1.05,
        semiPlacements: [],
        blockedQueue: [1, 2, 3, 4],
        onboardingDrBudget: null,
        onboardingTargetRank: null,
        onboardingStatus: null,
        rewardRanks: [],
      },
    ],
    presets: [],
  }
}
