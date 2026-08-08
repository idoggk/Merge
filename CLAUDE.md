# Merge Mania economy toolkit — Claude Code handoff

This project is a game-economy design tool for **Merge Mania**, a 7-day timed
live-ops event on Disney Solitaire (SuperPlay). It was designed collaboratively
with the game economist across a long conversation; this file exists so a
Claude Code agent picking up the codebase understands the domain rules well
enough not to silently break them while adding features.

The project started as a single-file React artifact (`merge_mania_toolkit.jsx`)
and has since been split into a proper Vite + React project under `src/`
(`components/`, `lib/`) — that split is done; preserve every invariant below
when extending it further.

**Implementation status.** Not every domain-model concept below is built yet.
Board layout, item generation/placement, the playthrough simulator, and the
interactive play tester (`src/components/PlayTester.jsx`) are implemented.
**Segments** and **Push/stall pacing** are design intent only — there is no
`segment` field, no per-segment budget, and no pacing-gap/push/stall code
anywhere in `src/`. The app currently edits and simulates one flat list of
boards, full stop. Don't assume a segments layer exists when reading the
code, and don't bolt one on speculatively — ask first, since that's a
substantial architecture change (segment-scoped board lists, segment-scoped
subsidy totals, etc.), not an incremental addition.

## Domain model (do not casually change these)

**Value chain.** An item of rank `r` has value `2^(r-1)`. Rank 12 = the
completed grand-prize item = 2048, which is the total chain value. This
identity (`valueOf(rank) = 2^(rank-1)`) underlies almost every calculation in
the app (subsidy math, generator tiers, lucky drops, pacing curve). Do not
change the base without re-deriving everything downstream.

**Segments.** There are 4 player segments, bucketed by daily "Brut Win" (BW)
habit. Higher BW habit = harder segment. Segments differ **only** in:
- total subsidy DR (value handed out via blocked/semi-blocked board tiles)
- generator effort budget over the 7 days

They do **not** differ in: board size, chain length (always rank 1–12), or
lucky-drop odds/EV. This was an explicit design decision — the team rejected
"stronger players get less DR per action" as a lever; all segment difficulty
lives in how much of the rank-12 climb is subsidized by the board vs. earned
by active play.

*Not implemented in code yet* (see "Implementation status" above) — today
the app manages a single flat `boards` list with no segment wrapper, and
there's no per-segment `budget` field. Earlier design math computed that
7-day generator DR budget as roughly 140% of `(2048 - subsidy)`, but that
relationship isn't encoded anywhere; if/when a segment layer gets built,
don't silently wire that formula in as automatic — confirm with the
economist first, since they may want it manually overridable per segment
the same way board `blockedValue` is manually overridable per board today.

**Boards.** Each segment has its own ordered list of boards (not shared
globally). Each board has:
- a `rows` x `cols` grid of tile states: `"blocked"`, `"semi"` (semi-blocked —
  revealed but needs one more merge to fully clear), or `"open"` (playable)
- `blockedValue` — the DR-equivalent subsidy value assigned to that board's
  blocked+semi tiles combined
- `minRank` / `maxRank` — a best-effort constraint on which item ranks are
  allowed under that board's blocked/semi tiles

A segment's boards' `blockedValue`s should sum to that segment's total
subsidy DR. The app surfaces this as a live check; it does not hard-enforce
it, by design (the economist may want to over/under-allocate temporarily
while iterating).

**Board 1 is special.** The first board a player sees for a given segment
always guarantees at least one rank-1, rank-2, and rank-3 item among its
placed items, so early merges always have small pieces to combine. This is
implemented via `generateCandidateWithSmallRanks` and should stay scoped to
board index 0 only, not all boards.

**Item generation invariant: exact sum, best-effort everything else.**
`generateCandidate(target, desiredCount)` decomposes `target` into powers of
two (binary decomposition) then repeatedly splits the largest splittable item
in half until the item count reaches `desiredCount`. This **always**
preserves the exact sum. `generateCandidateInRange` additionally tries to
respect a `[minRank, maxRank]` window by splitting oversized items down and
merging undersized pairs up — this is best-effort and may leave a lone
item slightly outside the window if it can't find a pair to merge. Never
"fix" this by changing the target sum; sum correctness is the hard
constraint, rank window and item count are soft.

**Placement: distance-to-player queue, not a sorted ramp.** Items are not
just sorted ascending onto tiles in reading order. The rule is:
1. Compute each blocked/semi tile's grid distance to the nearest `open` tile
   (multi-source BFS) — this is "distance to the player."
2. Sort tiles by that distance, closest first.
3. Take the ascending-sorted item list and run it through
   `buildNoisyQueue(items, noise)` — a few passes of probabilistic adjacent
   swaps that keep the sequence *mostly* increasing but let it dip and
   recover locally. Noise is tunable (0 = strict ascending).
4. Assign the queue to the distance-ordered tiles.

The result: tiles near the player tend to be smaller, tiles far tend to be
bigger, but it's not a rigid staircase. Preserve this two-step
(distance-order, then noisy-queue) structure — don't collapse it back into a
single sort.

**Board layout presets are literal, not generative, and economist-authored.**
There are no shipped/hardcoded presets — `presets.js`'s `createPreset` just
snapshots whatever tile pattern the economist is currently looking at in the
editor (via the "Suggestions" card's Save button), at whatever size that
board happens to be. `applyPresetToBoard` then stamps that literal grid onto
another board, top-left aligned; cells outside the preset's original
`rows × cols` default to `"open"` rather than extending the pattern — this is
a known limitation (presets don't scale to a board bigger than the one they
were captured on), not a bug to silently "fix" by inventing pattern-extension
math. Do not replace this literal-stamp behavior with procedural generation
without being asked — the whole point is that it's a faithful copy of a
layout the economist hand-approved.

**Multiplier tiers (generator).** x1 costs 1 DR / normally drops rank 1. x2
costs 2 DR / rank 2, unlocks once the player's cumulative effort reaches
rank 7. x4 costs 4 DR / rank 3, unlocks at rank 10. These thresholds
(`generatorTier.js`'s `GENERATOR_TIERS`/`TIER2_UNLOCK_RANK`/
`TIER4_UNLOCK_RANK`) are pinned to absolute chain rank, not DR amount, so
they fire at the same *rank* for every segment even though segments need
different total DR to reach that rank. The unlock check is dynamic, keyed
off the player's *current* max rank **held** (`currentMaxRank`), not a
ratchet on the best rank ever reached — see "Tier re-lock is resolved as
dynamic" below. The automatic simulator (`simulatePlaythrough`) always
greedily spends at the highest unlocked tier via `currentTier`; the
interactive play tester lets the player pick *any* currently-unlocked tier
via `unlockedGeneratorTiers` (see "Play Tester" below) — those are
deliberately different behaviors for the same underlying thresholds, not a
bug to reconcile.

**Lucky drops.** One shared expected-value multiple (`targetEv`, e.g. 1.05x)
applies uniformly across all three tiers and all four segments. The
distribution is solved as a geometric decay: `p(normal) = p0`,
`p(+1 rank) = p0*k`, `p(+2 ranks) = p0*k^2`, where `k` is the positive root
in (0,1) of `(1 + 2k + 4k^2) / (1 + k + k^2) = targetEv` (see `solveK`). This
is intentionally a single free parameter — don't add per-tier or per-segment
EV without an explicit ask, that was a deliberate simplification.

**Push / stall.** A daily pacing-gap trigger compares actual cumulative
progress to an expected day-N curve (currently 8/17/28/40/55/75/100 as % of
the 2048 chain, back-loaded so segments land around rank 11 — "FU," verge of
completion — roughly 2 days before the event ends). Players behind the curve
get a "push" DR-per-click factor (>1x) plus access to live blocked-tile
swaps and repeatable guaranteed lucky drops; players too far ahead get a
"stall" factor (<1x).

*Not implemented in code yet* (see "Implementation status" above) — there is
no pacing simulator, no push/stall factor, and no day-N curve anywhere in
`src/`. This whole section is design intent for future work, not a
description of `simulatePlaythrough` (which just runs a board to a DR budget
or max rank with no notion of "days" or a target curve at all). When this
does get built, it'll need real variance/spread modeling (Monte Carlo or
equivalent) from the start — the existing `simulatePlaythrough` and lucky
drop's `createEvScheduler` are both deliberately deterministic
expected-value machinery (see "Lucky drops" above), which is fine for what
they do but is not a substitute for player-to-player variance once pacing
gates start branching on "ahead of curve" vs "behind."

## Play Tester

`src/components/PlayTester.jsx` + `src/lib/playSession.js` let the economist
manually play a generated board — click/drag to move or merge, spend the
generator — as a ground-truth check against `simulatePlaythrough`'s
automatic result. It shares `mergeSimulation.js`'s core primitives
(`buildInitialState`, `buildReachability`, `performMerge`) with the automatic
simulator, so these rules apply to both:

- **Merge legality is fully position-agnostic**, by explicit economist
  decision: two same-rank items merge regardless of where they sit on the
  board — adjacent, far apart, or one fully boxed in with no empty-cell path
  to it. Don't reintroduce an adjacency or reachability requirement for
  merging; `buildReachability`'s connected-open-space graph is still used,
  but only for the separate "can this item *move* to that empty cell" check.
- **The `stuck` flag is what actually prevents free cascades**, not
  position. A semi tile's item starts `stuck`; a blocked tile's item becomes
  `stuck` the instant it's revealed. A `stuck` item can be merged *into* but
  can never be the mover, so two still-`stuck` items can never merge with
  each other on their own — some player-driven mover (something the
  generator placed, or a chain of merges rooted in one) has to reach it
  first. Once merged into, it clears (`stuck` → `false`) and is a fully
  normal item from then on — this is the "revealed but needs one more merge
  to fully clear" rule from the Boards section above, and it's the same for
  a semi-origin or blocked-origin item.
- **The generator lets the player pick any currently-unlocked tier**
  (`unlockedGeneratorTiers`), defaulting to x1 even after x2/x4 unlock — it
  does not auto-force the highest tier the way the automatic simulator's
  greedy `currentTier` does. If the player's chosen tier re-locks (their
  qualifying rank-7/rank-10 item gets merged away), spending silently falls
  back to the highest tier still unlocked rather than erroring.
- **A merge reveals near where it visually happened, not near a stale
  origin.** `performMerge`'s `revealAroundMover` option is `true` for the
  automatic simulator always, but in the play tester it's set to
  `areAdjacent(from, to)` — a long-distance drag-merge only reveals a locked
  tile next to the receiver, never next to wherever the dragged item
  started, since that would look like a random unrelated event to the
  player watching the merge happen at the receiver.
- **Native drag-and-drop drag images are timing-sensitive.** `handleDragStart`
  explicitly calls `setDragImage` on the tile *before* triggering any
  re-render that would restyle that same node (e.g. adding a selection
  ring) — if a future change re-renders the dragged node synchronously
  inside `onDragStart` before `setDragImage` runs, Chromium can intermittently
  show a corrupted/blank drag ghost. Keep the "grab the drag image first,
  defer the state update" ordering if you touch this handler.

## Board chaining (waves + inventory)

The board list (sidebar) doubles as a queue: **board 0 is the one actually
played; every board after it is a wave.** Once the active board has no
locked or unrevealed-stuck cells left at all (`boardIsCleared`), the next
board in the list pushes in as a strip of its own rows from the top
(`pushBoardIn`) — its own tile pattern, `semiPlacements`, and `blockedQueue`,
top-left column-aligned — shifting everything else down. Items shifted past
the bottom edge go into an inventory (a plain array of ranks) instead of
being lost; the player clicks an inventory chip then a free cell to place it
back (`placeFromInventory`), and the automatic simulator drains its own
inventory automatically (right after merging, before spending new DR — both
are free actions). This cascades through consecutive boards that clear
instantly (e.g. an all-open one) rather than stalling on the first empty one,
and simply stops firing once the list is exhausted — no error, no wraparound.

This is genuinely shared machinery, not something either consumer owns:
`boardIsCleared`/`pushBoardIn`/`advanceBoards`/`recordAllOccupied` live in
`mergeSimulation.js` and are called from both `playSession.js` (after every
merge — the only action that can clear the last locked/stuck cell) and
`simulatePlaythrough` (same trigger, plus it auto-places from inventory
before spending DR). Keep both callers going through these shared functions
rather than reimplementing the row-shift/overflow logic separately — they
need to agree exactly on what counts as "cleared" and how columns align.

Consequences for the Boards section above: a board's `rows` now means two
different things depending on its position. Board 0's `rows` is its actual
grid height. Any later board's `rows` is capped at 3 in the editor (`pushBoardIn`
also defensively re-clamps to 3, in case older data has more) and represents
how many rows it contributes as a wave — its `cols` should match board 0's
for the columns to line up; a mismatch is handled the same best-effort,
top-left-aligned way as board layout presets, not enforced.
`simulatePlaythrough`'s signature changed accordingly: it now takes the full
board array plus `options.startIndex`, not a single board — every internal
caller (`onboardingGoal.js`, `placement.js`) that only wants to test one
board in isolation wraps it in a one-element array.

## Known open items / do not silently resolve these

- **Tier re-lock is resolved as dynamic (non-ratchet).** If a player's only
  rank-7+ item gets merged away, x2 re-locks — `generatorTier.js`'s
  `currentTier`/`unlockedTiers` are keyed off the player's *current* max
  rank held, re-evaluated every time, not the best rank ever reached. This
  was an open question in earlier design discussion; it's now the shipped
  behavior in both the automatic simulator and the play tester. Flag it
  here (not just in a code comment) since it's the kind of subtle rule a
  future change could silently break by switching to a ratchet without
  realizing one was deliberately avoided.
- **Rank-window best-effort caveat is accepted but not "final."** The
  economist has been told item count / rank window can drift when they
  can't be satisfied alongside an exact sum, but hasn't signed off that this
  is permanent behavior — flag any change here rather than assuming it's fine.
- **Presets are only correct at the size they were captured at.** A preset
  saved from a 5×8 board applied to a 6×10 board only fills the top-left
  5×8 region, leaving the rest `"open"` — see "Board layout presets" above.

## Persistence

`src/lib/persistence.js` uses real browser `localStorage` (personal, not
shared) under key `merge-mania-board-simulator`, storing `{ boards, presets }`
as JSON — note there's no `segments`/`boardsBySeg` shape yet since segments
aren't implemented (see "Implementation status" above); if a segments layer
gets built later, this is the shape that'll need to grow to accommodate it.
Save stays an explicit action (the header's Save button, `App.jsx`'s
`handleSave`) rather than continuous autosave — preserve that if this grows
a real backend.

## Style/stack notes

- React functional components, hooks-based, Tailwind v4 (`@tailwindcss/vite`
  plugin, no `tailwind.config.js` — theme tokens live in `src/index.css`'s
  `@theme` block).
- `src/index.css` is not just a Tailwind entrypoint: it also defines the
  `--font-sans`/`--font-display` theme tokens, the `.app-backdrop` gradient
  background used by `App.jsx`, and the `@keyframes merge-particle` the merge
  celebration uses. It's small and deliberate, not a place utility classes
  accidentally leaked into — keep new global/animation CSS there rather than
  reaching for inline `<style>` blocks or a second CSS file.
- Visual identity: Baloo 2 (`font-display`, loaded via Google Fonts link tags
  in `index.html`) for headings/big numbers, Inter (`font-sans`) for
  everything else; a soft purple/fuchsia "aurora" gradient backdrop
  (`.app-backdrop`); gradient purple→fuchsia for primary actions and active
  nav/tier-selection states; icon badges on card headers. Reuse these rather
  than introducing a second visual language for new UI.
- Charts via `recharts`. Icons via `lucide-react`.
- Color ramp for rank display (`RAMP` / `colorForRank` in `src/lib/ranks.js`)
  is a rarity-style gradient — emerald→teal→cyan→sky→blue→indigo→violet→
  purple→fuchsia→pink→rose→gold as rank increases 1–12 — **not** the
  single-hue light→dark purple ramp originally specified; that read as flat
  and washed-out and was changed on explicit request. Reuse this convention
  (and this exact ramp) for any new rank visualization rather than reverting
  to single-hue purple or inventing a second palette.
- No backend, no database, no auth — pure client-side state plus
  `localStorage` for persistence.
