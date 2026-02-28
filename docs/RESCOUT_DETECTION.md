# Rescout Detection

The Data Quality page automatically flags matches that may need rescouting. A match is flagged when **either** of two conditions is met. Each flagged row shows a red **RESCOUT?** badge followed by a reason tag so you can immediately see what triggered it without expanding the row.

## Condition 1: Scoring Mismatch

Shown as: `RESCOUT?` `MISMATCH`

This is the primary detection mechanism. It compares what our scouts tracked against the official FMS score for each alliance.

### How It Works

1. Take the total balls our scouts reported each robot moving.
2. Subtract passes between teammates to get **scoring attempts** (shots at the hub).
3. Compare that against the official FMS ball count for the alliance.
4. If the difference exceeds **50% of the FMS total or 5 balls** (whichever is larger), flag it.

```
adjustedTotal = scoutTotal - totalPasses
delta = |adjustedTotal - tbaTotal|
flag if: tbaTotal > 0 AND delta > max(tbaTotal * 0.5, 5)
```

### Important: This Is Alliance-Level

The comparison is against the **entire alliance's** scout total vs FMS total. A single robot's bad scout data can push the whole alliance over the threshold. When you see a mismatch, the diagnosis banner (see below) tells you whether one robot drove it or the whole alliance was off.

### Why the Dual Threshold

- For **low-scoring alliances** (e.g. 6 balls scored), a flat 50% threshold would be just 3 balls, which is too sensitive. The floor of 5 balls prevents noisy false positives.
- For **high-scoring alliances** (e.g. 50 balls scored), the 50% threshold (25 balls) scales proportionally to catch genuinely large discrepancies.

### Examples

**Not flagged:** FMS = 20 scored. Scouts tracked 37 moved (19 shots + 18 passes). Adjusted = 37 - 18 = 19. Delta = |19 - 20| = 1. Threshold = max(10, 5) = 10. 1 < 10, so no flag.

**Flagged:** FMS = 20 scored. Scouts tracked 45 moved (30 shots + 15 passes). Adjusted = 45 - 15 = 30. Delta = |30 - 20| = 10. Threshold = max(10, 5) = 10. 10 >= 10, so **RESCOUT?**

## Condition 2: Scouter Flagged for Second Review

Shown as: `RESCOUT?` `SCOUTER`

If a scouter manually set `second_review` on any robot in the alliance, the entire match is flagged. This is the human escape hatch -- scouters can mark entries they're uncertain about (confusing match, lost track of a robot, etc.) and the system surfaces them for review.

## Both Conditions

A match can trigger both conditions at once, in which case both reason tags appear: `RESCOUT?` `MISMATCH` `SCOUTER`

## What You See When a Match Is Flagged

The flagged row has a red left border and the reason badges next to the match number. Expanding the row shows:

### Diagnosis Banner (Mismatch only)

For mismatch flags, a diagnosis banner at the top of the expanded view explains what caused it:

- **Single-robot outlier:** "Team 1153 drove this mismatch -- 33 attempts scouted, 20.5 attributed by FMS" -- shown when one robot accounts for >60% of the delta
- **Alliance-wide:** "Alliance-wide mismatch -- average scoring accuracy 45%" -- shown when no single robot dominates
- Includes direction: whether scouts tracked more or FMS scored more
- A horizontal bar shows each robot's share of the delta, with the outlier highlighted in red

### No-Show Mislabel Detection

The expanded view distinguishes between real and mislabeled no-shows:

- **NO-SHOW** (red badge): Robot was marked `no_robot_on_field` and has zero fuel data. This is a genuine no-show -- the robot gets 0 attribution and is excluded from the power curve.
- **NO-SHOW?** (yellow badge): Robot was marked `no_robot_on_field` but has actual fuel actions or scoring data logged. The no-show flag is likely a scouter mistake. The system ignores the flag and computes attribution normally from the actual data, redistributing the FMS total across all 3 alliance robots.

### Per-Robot Detail Cards

- **Quality flags** per robot: FLAGGED, EXCLUDED, NO-SHOW, NO-SHOW?, BULLDOZE, PASSER, SCORER, DIED, 0-WT
- **Raw scout input** (score/pass counts, bucket distributions)
- **Computed estimates** (total moved, shots, passes, auto/teleop)
- **Attribution results** (FMS-attributed scored balls, accuracy %)

## Excluding Bad Data

Each robot card has an **EXCLUDE** button. Excluding a scout entry removes it from:

- Team statistics and averages
- Fuel attribution calculations
- Monte Carlo predictions

Excluded entries appear dimmed with an `EXCLUDED` badge. Click **RESTORE** to bring them back. No confirmation needed for restore -- it's easy to undo.

Exclusions are stored in a separate Firestore collection (`excludedEntries/{eventKey}/excluded`) so they persist across sessions and sync in real-time to all team members. The Postgres sync cannot overwrite them.

The DataQuality page always shows all entries (including excluded ones) so you can review and toggle them.

## Key Files

| File | Role |
|------|------|
| `src/pages/DataQuality.tsx` | Main UI, mismatch detection, diagnosis, and exclude toggle |
| `src/utils/fuelAttribution.ts` | Per-robot scoring attribution from FMS alliance totals |
| `src/store/useAnalyticsStore.ts` | Exclusion state, Firestore subscription, stat filtering |
| `src/types/scouting.ts` | `ExcludedEntry` type definition |
| `firestore.rules` | Security rules for the exclusions collection |
