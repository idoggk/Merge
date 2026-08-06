# Merge Mania economy toolkit — Claude Code handoff

This project is a game-economy design tool for **Merge Mania**, a 7-day timed
live-ops event on Disney Solitaire (SuperPlay). It was designed collaboratively
with the game economist across a long conversation; this file exists so a
Claude Code agent picking up the codebase understands the domain rules well
enough not to silently break them while adding features.

The current implementation is a single-file React artifact
(`merge_mania_toolkit.jsx`). It is expected to be split into a proper project
structure here — that split should preserve every invariant below.

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

**Board layout presets are literal, not generative.** `BOARD_PRESETS`
("Suggestion 1"–"Suggestion 5") are hardcoded 5×8 grids the economist
hand-designed and approved — they are not formulas. Do not replace them with
procedural generation without being asked. If a preset is applied to a board
whose size isn't 5×8, cells outside the original grid default to `"open"`
(no pattern extension) — this is a known limitation, not a bug to silently
"fix" by inventing new pattern math.

**Multiplier tiers (generator).** x1 costs 1 DR / normally drops rank 1. x2
costs 2 DR / rank 2, unlocks once the player's cumulative effort reaches
rank 7. x4 costs 4 DR / rank 3, unlocks at rank 10. These thresholds
(`tierForRank`) are pinned to absolute chain rank, not DR amount, so they
fire at the same *rank* for every segment even though segments need
different total DR to reach that rank.

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
"stall" factor (<1x). The pacing simulator in the current build uses
expected-value math, not Monte Carlo — there's an open request to add
variance/spread modeling here.

## Known open items / do not silently resolve these

- **Tier re-lock semantics are undefined.** If a player's only rank-7+ item
  gets merged away, does x2 re-lock? Not yet decided — ask before assuming
  either answer.
- **Pacing simulator needs a Monte Carlo rework.** Current version is
  expected-value only; economist has asked for player-to-player variance
  modeling but it hasn't been built yet.
- **Rank-window best-effort caveat is accepted but not "final."** The
  economist has been told item count / rank window can drift when they
  can't be satisfied alongside an exact sum, but hasn't signed off that this
  is permanent behavior — flag any change here rather than assuming it's fine.
- **Segment `budget` (7-day generator DR budget) is a free-standing number**,
  not derived automatically from `subsidy`. Earlier design math computed it
  as roughly 140% of `(2048 - subsidy)`, but the app does not enforce or
  recompute that relationship — it's manually editable. Don't silently wire
  an automatic formula back in without checking; the economist may be
  intentionally overriding it during iteration.
- **Presets don't scale to arbitrary board sizes.** Only correct at the 5×8
  size they were authored at.

## Persistence

The artifact version uses `window.storage` (personal, not shared) under key
`merge-mania-segments-and-boards`, storing `{ segments, boardsBySeg }` as
JSON. If this becomes a real app with its own backend, preserve this shape
as the migration source, and keep save explicit (a button) rather than
continuous autosave, matching current UX.

## Style/stack notes

- React functional components, hooks-based, Tailwind utility classes only
  (no custom CSS files in the current version).
- Charts via `recharts`. Icons via `lucide-react`.
- Color ramp for rank display (`RAMP` / `colorForRank`) goes light→dark
  purple as rank increases 1–12; reuse this convention for any new rank
  visualization rather than inventing a second palette.
- No backend, no database, no auth in the current version — pure
  client-side state plus the artifact storage API for persistence.
