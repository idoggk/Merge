// First-time-play walkthrough logic for PlayStage.jsx - kept separate from
// the economist's "onboarding goal" domain concept (board.onboardingDrBudget
// etc., see GoalSolver.jsx) on purpose; despite the similar English word,
// these are two unrelated features and shouldn't share a name or a file.
const SEEN_KEY = 'merge-mania-play-tutorial-seen'

export function hasSeenPlayTutorial() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // Private browsing / storage disabled - just means the tutorial shows
    // again next time, which is a harmless fallback, not worth surfacing.
    return false
  }
}

export function markPlayTutorialSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Same as above - nothing to do if storage isn't available.
  }
}

// The first pair of same-rank items on the board, if one exists - preferring
// a pair where at least one item is movable (not `stuck`), since a merge
// needs a mover. Returns [[r,c],[r,c]] or null.
export function findMatchingPair(state) {
  const byRank = new Map()
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const rank = state.itemAt[r][c]
      if (rank == null) continue
      if (!byRank.has(rank)) byRank.set(rank, [])
      byRank.get(rank).push([r, c])
    }
  }
  for (const cells of byRank.values()) {
    if (cells.length < 2) continue
    const movable = cells.find(([r, c]) => !state.stuck[r][c])
    if (!movable) continue
    const other = cells.find((cell) => cell !== movable)
    return [movable, other]
  }
  return null
}

// The first still-blocked, unrevealed cell on the board, if any - see
// mergeSimulation.js's buildInitialState for `locked`'s exact meaning.
export function findFirstLockedCell(state) {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.locked[r][c]) return [r, c]
    }
  }
  return null
}

// Three steps: point at the generator, point at a mergeable pair (or back at
// the generator if none exists yet), then explain blocked tiles - skipped
// entirely if this board has none. Returns null when there's nothing left to
// teach for the current step (the caller should treat that as "done").
export function computeTutorialSpec(step, state) {
  if (step === 'generate') {
    return {
      selectors: ['[data-tutorial="generate-button"]'],
      text: 'Tap here to use the generator and create your first item.',
    }
  }
  if (step === 'merge') {
    const pair = findMatchingPair(state)
    if (pair) {
      return {
        selectors: pair.map(([r, c]) => `[data-cell="${r}-${c}"]`),
        text: 'Tap one of these, then tap the other - merging two matching items combines them into the next rank up.',
      }
    }
    return {
      selectors: ['[data-tutorial="generate-button"]'],
      text: 'Keep using the generator until you get two items with the same number, then tap one and tap the other to merge them.',
    }
  }
  if (step === 'blocked') {
    const cell = findFirstLockedCell(state)
    if (!cell) return null
    return {
      selectors: [`[data-cell="${cell[0]}-${cell[1]}"]`],
      text: 'Dark blocked tiles like this one crack open the more you merge nearby - keep merging to clear the whole board.',
      final: true,
    }
  }
  return null
}

// Whether entering the 'blocked' step would actually have something to
// point at - checked once, right after a merge, so the tutorial never
// enters a step with nothing to show rather than needing to recover from it.
export function boardHasLockedCell(state) {
  return findFirstLockedCell(state) != null
}
