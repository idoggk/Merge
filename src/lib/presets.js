// User-authored board-layout suggestions (no built-in patterns are shipped —
// the economist saves their own from a board they've designed in the app).

export function createPreset(name, board) {
  return {
    id: crypto.randomUUID(),
    name,
    rows: board.rows,
    cols: board.cols,
    tiles: board.tiles.map((row) => [...row]),
  }
}

// Apply a preset's tile pattern onto a board of a possibly different size.
// Top-left aligned; cells outside the preset's original grid default to
// "open" rather than extending the pattern (matches the literal-grid rule
// in CLAUDE.md, generalized to arbitrary preset sizes).
export function applyPresetToBoard(preset, rows, cols) {
  const next = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'open'))
  for (let r = 0; r < Math.min(rows, preset.rows); r++) {
    for (let c = 0; c < Math.min(cols, preset.cols); c++) {
      next[r][c] = preset.tiles[r][c]
    }
  }
  return next
}
