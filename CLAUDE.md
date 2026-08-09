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

**Item generation invariant: exact sum, best-effort everything else — except
the rank floor on non-first boards, which is now hard.**
`generateCandidate(target, desiredCount)` decomposes `target` into powers of
two (binary decomposition) then repeatedly splits the largest splittable item
in half until the item count reaches `desiredCount`. This **always**
preserves the exact sum. Item count is soft everywhere — the loop stops early
rather than breaking the sum if every item bottoms out at rank 1 first.

The `[minRank, maxRank]` window used to be soft on both ends (best-effort,
could leave a lone item outside it) — **the floor is now hard for
`generateCandidateInRange`** (every board after the first; board 0 keeps the
old best-effort behavior, see below), by explicit economist request: every
item's value is a power of two, and a sum of values all `>= valueOf(minRank)`
is only exactly possible when the target is itself a multiple of
`valueOf(minRank)` — otherwise there is no exact decomposition at all, floor
or no floor. `raiseUndersized` (`rankWindow.js`) handles this by rounding the
target up to the nearest multiple of `valueOf(minRank)` (at most
`valueOf(minRank) - 1` DR of overallocation, only when the exact target isn't
already a multiple — never rounds down, so the board's blocked value never
comes in under what was configured). `BoardEditor`'s "Sum vs. target" check
reflects this: `sum >= target` is OK, with a note explaining the overallocation
when it happens. The ceiling (`maxRank`) was already effectively hard
(`splitOversized` always fully splits anything above it, no escape valve) —
this change just brings the floor in line with it.

Board 0's small-rank guarantee (`generateCandidateWithSmallRanks`, next
paragraph) still uses the OLD best-effort `mergeUndersized` for its own
remainder, unchanged — a stray item below `minRank` there isn't the same
problem, since board 0 already guarantees rank 1/2/3 presence regardless. If
this ever needs to change too, that's a separate decision — don't assume the
non-first-board fix should silently carry over there.

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
applies uniformly across all three tiers within a board. The distribution is
solved as a geometric decay: `p(normal) = p0`, `p(+1 rank) = p0*k`,
`p(+2 ranks) = p0*k^2`, where `k` is the positive root in (0,1) of
`(1 + 2k + 4k^2) / (1 + k + k^2) = targetEv` (see `solveK`). Still
intentionally a single free parameter per board — don't add per-tier EV
without an explicit ask, that was a deliberate simplification.

`targetEv` is now a per-board field (`board.js`, default
`DEFAULT_TARGET_EV = 1.05`), editable in the editor's "Lucky drops" card —
per-*segment* uniformity was the original design intent (segments aren't
implemented yet, see "Implementation status"), but per-*board* variation
during design/tuning was an explicit ask, not scope creep; don't read this
as license to also add per-tier variation, which remains unasked-for.
`generateCandidateInRange`/`generateCandidateWithSmallRanks` don't touch
`targetEv` at all — it's a generator-RNG parameter read only at play time
(`spendGenerator`, `simulatePlaythrough`), never at item-generation time.

Both the automatic simulator and the play tester roll a bonus the same way
(same `computeProbs`, same rank-7-held gate as the x2 tier unlock — see
"Multiplier tiers" above) but via different mechanisms, deliberately: the
automatic simulator uses `createEvScheduler`'s deterministic deficit
round-robin (reproducible aggregate math, no randomness); the play tester
uses `rollBonus` (`Math.random()`-based genuine per-tap unpredictability,
since a real player doesn't experience a converging sequence). A lucky drop
in the play tester triggers a distinct celebration (`LuckyDropCelebration`,
tier by bonus amount: +1 = medium, +2 = big — never "small," a lucky drop is
always meant to feel like a moment) separate from `MergeCelebration`.
`session.targetEv` is fixed at play-session creation from the *starting*
board's own field and never re-reads a later wave board's value — lucky-drop
chance belongs to the generator/player, not to whichever tile pattern
happens to be visible.

**The geometric-decay model has a hard ceiling: `targetEv` only has a valid
solution in `[1, 7/3]` (`MIN_TARGET_EV`/`MAX_TARGET_EV`, `luckyDrop.js`).**
At `k=0`, EV=1 (never a bonus); at `k=1`, EV=7/3≈2.33 (as close to a flat
1/3-1/3-1/3 split as this specific 3-outcome model allows) — there is no
valid probability distribution for this formula above that. `solveK` clamps
its input to that range before solving (a target above 7/3 clamps down to
the k=1 distribution, not "more generous than that"), and clamps its own
output `k` to `[0,1]` with a small epsilon around the boundary (7/3 isn't
exactly representable in floating point, so the unclamped root can land a
hair outside `[0,1]` right at the ceiling and get wrongly rejected in favor
of the *other*, unrelated root — which silently produces the worst-possible
wrong answer, a collapse to "never any bonus," rather than an overshoot).
This was found live: exposing `targetEv` as a free-typed field surfaces this
ceiling constantly (any input past ~2.33, or CC Management's EV suggestions
math on a moderate base value) — treat any future change to this formula as
needing the same clamp-at-the-source treatment, not a "seems unlikely"
caveat.

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
  automatic simulator always, but the play tester always passes `false` —
  a merge only ever reveals a locked tile next to the receiver, never next
  to wherever the mover started, even when the two were directly adjacent.
  Revealing next to the mover's old cell doesn't read as connected to the
  merge the player is watching happen at the receiver, confirmed by an
  economist report of exactly that (an adjacent one-cell merge revealing a
  tile two rows away, above the mover's old spot).
- **Native drag-and-drop drag images are timing-sensitive.** `handleDragStart`
  explicitly calls `setDragImage` on the tile *before* triggering any
  re-render that would restyle that same node (e.g. adding a selection
  ring) — if a future change re-renders the dragged node synchronously
  inside `onDragStart` before `setDragImage` runs, Chromium can intermittently
  show a corrupted/blank drag ghost. Keep the "grab the drag image first,
  defer the state update" ordering if you touch this handler.
- **RanksBar** (rendered above the board) is a game-style event-track
  showing progress toward rank `MAX_RANK`, one node per rank. It detects its
  own "just reached a new rank" moment internally (comparing against the
  previous render's `maxRankReached`), not something the caller signals —
  keep it a drop-in display, don't push milestone-detection logic up into
  PlayTester. `board.rewardRanks` (set in the editor's "Rank rewards" card,
  entirely optional, empty by default) marks which ranks get a gift badge;
  reaching a reward rank additionally fires a `MergeCelebration` burst
  layered on top of the plain scale+glow every rank gets — a reward is
  meant to read as a bigger deal than an ordinary tick. `rewardRanks` is
  purely a display marker: it doesn't feed generation, placement, or
  simulation at all, on purpose.

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

## CC Management

A read-only, all-boards-at-once view (`CCManagement.jsx`), separate from the
per-board Editor. Two independent comparisons, each board's own Card:

- **Queue value suggestions** (`suggestQueues`, `ccManagement.js`): Current /
  +30% / +50% `blockedValue` — *relative* to the board's own current value —
  `maxRank` capped one rank higher on the suggestions to give the extra
  value somewhere to go. Computed fresh through whatever generation
  pipeline that board position already uses (board 0's small-rank guarantee
  included) — not read from the board's saved
  `semiPlacements`/`blockedQueue`, so it stays comparable across all three
  columns even if the board hasn't been generated yet.
- **Lucky-drop EV suggestions** (`suggestEv`, same file): Current / +8% /
  +12% `targetEv` — deliberately *fixed absolute* targets (1.08x, 1.12x),
  **not** relative to the board's own current EV the way the queue
  suggestions are relative to blockedValue. Don't "fix" this into a
  relative +30%/+50% to match the queue pattern — that was explicitly
  rejected as too aggressive for EV specifically. Both suggestion values are
  clamped to `[MIN_TARGET_EV, MAX_TARGET_EV]` before display (see the
  lucky-drops ceiling note above) so the shown EV number always matches its
  own displayed probabilities.

Both are purely informational: nothing on this page writes to a board. The
Ops syntax export used to live here too; it's now its own "Syntax" tab (see
below) since it grew a second variant.

## Syntax

A dedicated tab (`SyntaxPage.jsx`) with a Normal/CC toggle, both backed by
`boardSyntax.js`:

- **Normal** (`boardsToSyntax`/`boardToSyntax`): every board's *actual*
  saved config, in play order — layout, semi placements, blocked queue,
  targetEv. This is the "real" Ops export.
- **CC** (`boardsSuggestionsToSyntax`/`boardSuggestionsToSyntax`): the same
  document shape, but for CC Management's suggestions instead — each
  board's +30%/+50% queue and +8%/+12% EV numbers, formatted the same way.
  Calls into `ccManagement.js`'s `suggestQueues`/`suggestEv` directly (no
  circular import — `ccManagement.js` doesn't import back from
  `boardSyntax.js`).

Both are placeholder formats pending the real Ops spec — see the caveat
below. If the real spec turns out to need a different shape for
suggestions vs. real config, that's an argument for keeping them as two
separate functions in `boardSyntax.js` (already true), not for merging them.

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
- **Rank-window floor is now hard for non-first boards, resolving part of
  the old "accepted but not final" caveat** (see "Item generation
  invariant" above) — the min-rank floor overallocates sum rather than
  drifting, by explicit economist request. Item count is still soft
  everywhere, board 0's small-rank remainder still drifts the old way, and
  the max-rank ceiling was already hard. If a similar complaint comes up for
  board 0 or for item count, don't assume the same fix (overallocate)
  applies there too without confirming — this was scoped specifically to
  non-first boards' rank floor.
- **Presets are only correct at the size they were captured at.** A preset
  saved from a 5×8 board applied to a 6×10 board only fills the top-left
  5×8 region, leaving the rest `"open"` — see "Board layout presets" above.
- **`src/lib/boardSyntax.js` is an explicitly placeholder Ops export
  format**, not a design decision — the economist hasn't gotten the real
  syntax spec from Ops yet. It's deliberately isolated (one file, four pure
  functions — real-config and suggestions variants, each with a per-board
  and a whole-chain form — nothing else in the app reads its output) so it
  can be replaced wholesale the moment the real spec exists. Don't treat its
  current shape (tile-map ASCII, `(row,col)=Rrank` semi list, comma-separated
  blocked queue, `QUEUE +N%:`/`EV +N%:` suggestion lines) as meaningful or
  worth preserving — it's a stand-in.

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
