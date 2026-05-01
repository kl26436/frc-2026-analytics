# CLAUDE.md

Project-specific notes for Claude Code working in this repo.
Read this **before** writing any code that touches points, fuel, scoring, or data display.

---

## Point Calculation Models

This codebase has **two distinct scoring models** that must not be mixed without
intent. Mixing them produces user-visible contradictions (e.g., a banner that
says "274 pts/match" while the table directly below shows matches averaging
"403 pts/match").

### Model A — Scout estimate

Function: `estimateMatchPoints(entry: ScoutEntry): { autoPoints, teleopPoints, endgamePoints, total }`
File: `src/types/scouting.ts`

Formula:
- Auto points = `fuel.auto * (auton_FUEL_SCORE / (auton_FUEL_SCORE + auton_FUEL_PASS))` + 15 if auton climbed
- Teleop points = `fuel.teleop * (teleop_FUEL_SCORE / (teleop_FUEL_SCORE + teleop_FUEL_PASS))`
- Endgame points = `climbPoints(climb_level)` — 10 / 20 / 30 for L1 / L2 / L3
- Total = sum of the three

Where `fuel.{auto,teleop}` is `sum(SCORE_PLUS_N × N)` from `estimateMatchFuel`.
That's **balls touched** (scored + passed), so the score-fraction multiplier
extracts the scored portion. Result: 1 ball scored = 1 point + climb bonus.

**When this fires:** pre-scout entries always (no FMS data exists for them).
Live entries before sync, or when fuel attribution hasn't been computed yet.

### Model B — FMS attribution

Per-match record: `RobotMatchFuel` in `src/utils/fuelAttribution.ts`.
Per-team aggregate: `TeamFuelStats` (also in fuelAttribution.ts).

Formula: takes the actual FMS `hubScore` and tower bonuses for each alliance,
then attributes them across the 3 robots based on each robot's contribution
share (computed from scout actions / SCORE_PLUS counts). Returns:
- `totalPointsScored` = autoPointsScored + teleopPointsScored (fuel only)
- `totalTowerPoints` = autoTowerPoints + endgameTowerPoints (NB: 2026 has no teleop tower)
- The full match total = `totalPointsScored + totalTowerPoints`

For a per-team aggregate, `avgTotalPointsScored = avgFuelPointsScored + avgTowerPoints`
(the field name is misleading — it includes tower).

**When this fires:** live entries after the sync that produces `matchFuelAttribution`.

### The merge in the analytics store

`useAnalyticsStore.calculateFuelAttribution` overwrites these on `teamStatistics`
(and `liveOnlyTeamStatistics`):

```ts
avgAutoPoints    = fuel.avgAutoPointsScored + fuel.avgAutoTowerPoints
avgTeleopPoints  = fuel.avgTeleopPointsScored        // no teleop tower in 2026
avgEndgamePoints = fuel.avgEndgameTowerPoints
avgTotalPoints   = fuel.avgTotalPointsScored         // already includes tower
```

For pre-scout-only teams (no FMS attribution) the original
`calculateAllTeamStatistics` values from scout-derived counts are kept.

### Canonical access pattern for new code

When you need "this team's avg points per match," **always** read
`teamStats.avgTotalPoints`. It's already FMS-first / scout-fallback merged.
**Never** sum `avgAutoFuelEstimate + avgTeleopFuelEstimate` — those are raw
scout-counted **balls touched**, not points. They will systematically
under-report live performance and over-report pre-scout performance.

When you need per-match points, use `matchData[i].points.total` from the
`useMemo` in `TeamDetail.tsx` — it's the same FMS-first / scout-fallback
ladder, applied per-match via `matchFuelAttribution.find(...)`.

When you need to compare pre-scout vs live (e.g., the source-delta banner),
**use scout-estimate for BOTH sides**:
```ts
e => estimateMatchPoints(e).total
```

This is apples-to-apples and toggle-independent. **Do NOT** mix FMS
attribution into one side of a comparison and scout estimate into the
other — the result will be structurally biased AND toggle-dependent
(see "The toggle trap" below).

### The toggle trap (don't use matchFuelAttribution in cross-source code)

`matchFuelAttribution` looks like the canonical FMS-attributed source, but
the analytics store **clears it to `[]` when the user flips the data-source
toggle to "pre-scout-only"** (see `useAnalyticsStore.calculateRealStats`
lines ~478). Any code that uses `matchFuelAttribution` to "look up the
real points for this entry" will silently produce different answers
depending on the toggle.

Symptom we hit before: a comparison banner read "+10% above pre-scout"
in live mode and "-18% below pre-scout" in pre-scout-only mode for the
same team — because the live-side estimator switched from FMS to scout
estimate when the toggle wiped the attribution. Toggling the data source
should never silently change a comparison percentage.

**Rules:**
- Per-team aggregate comparisons (banners, deltas, AI-prompt sorts):
  always read `teamStats.avgTotalPoints` (already toggle-aware) OR call
  `estimateMatchPoints` per entry. Never mix.
- Per-match displays where you want "real points" (Match History table,
  charts): use `matchFuelAttribution` with the explicit fallback ladder
  shown above. These are inherently toggle-affected; that's accepted
  because the user is actively choosing what they want to see.

### Known structural bias

Even within a single mode, scout estimate ≈ ball count while FMS
attribution can be 2-3× higher because the actual game has
tower/multiplier scoring scouts don't tally directly. So:

- Per-match "Total Pts" in the Match History table (FMS-attributed) is
  larger than scout estimate.
- The team's "Avg Score" hero stat (also FMS-attributed via the merge)
  is also larger.
- The source-delta banner uses scout-estimate on both sides, so its
  baseline is *smaller* than the table — they will not match in absolute
  numbers, but the banner's **percent comparison** is meaningful.

If a future feature wants table and banner numbers to match, it must
either standardize the table on scout-estimate (loses real-game
information) or build a per-match scout→FMS multiplier model. Don't
half-fix by mixing models on a single page.

---

## Game-specific facts (2026 Rebuilt)

- **1 ball = 1 point.** No multipliers in scoring buttons. `SCORE_PLUS_N` are
  scout shortcut buttons that mean "scored N balls in one tap" — not a
  multiplier. **Do not** display rows like "Bonus +20" sourced from
  `avgAutoPlus20` / `avgTeleopPlus20`; those are scout tap-count totals,
  not points.
- **Tower scoring** exists in auto and endgame. There is **no teleop tower**.
- **Climb points**: L1 = 10, L2 = 20, L3 = 30 (in `climbPoints`).
- **Auto climb bonus**: +15 if `auton_AUTON_CLIMBED > 0`.

---

## Display rules for any "scored / passed / touched" column

- **"Auto Scored" / "Teleop Scored"** columns must show actual **scored** ball
  counts, not balls touched. Use `entry.{auton,teleop}_FUEL_SCORE` directly,
  or `actionFuel.{auto,teleop}Shots` when scout actions are available. Never
  use `fuel.{auto,teleop}` from `estimateMatchFuel` — that's balls touched
  (scored + passed) and will look wrong next to an adjacent "Pts" column.
- **"Passes"** should show pass counts (`FUEL_PASS`).
- **"Balls Touched"** is allowed as an explicitly-labeled column for
  `fuel.{auto,teleop}` (sum of SCORE_PLUS_N × N). Do not call this
  "Fuel Estimate" — the word "estimate" implies points.

---

## Pre-scout vs live — where each is allowed

Per project memory (file `feedback_*.md`, `project_*.md`):

> "Pre-scout is only for predictions, team stats page, team details page.
> Nothing else."

That means picklist, alliance selection, dashboard, alliance predictor, AI
insights, match schedule, etc. should consume `liveOnlyTeamStatistics`, not
`teamStatistics`. Today only the picklist enforces this; rolling it to other
pages is open work but explicitly deferred. If you're touching one of those
other pages, ask before changing the data source.
