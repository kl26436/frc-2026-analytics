# Fuel Attribution Analysis — Week 0 Data (2026week0)

## Problem Statement

Scouts track **balls moved** per robot (shots taken + passes), but FMS/TBA only reports **alliance-level balls scored**. We need to distribute the FMS alliance total back to individual robots to create a per-team "balls scored" metric.

Key challenges:
- Scouts use SCORE_PLUS buttons (+1, +2, +3, +5, +10) to count balls moved, then confirm with FUEL_SCORE (shot at hub) or FUEL_PASS (passed to partner)
- **+1/+2 are precise, +3 is medium, +5/+10 are rough estimates** (e.g., +10 × 3 = "about 30 balls" but could be 22–36)
- High-volume teams likely miss more shots, so the relationship between shots taken and balls scored is probably not linear
- **Passes must be excluded** — only shots at hub should be used for attribution since passes don't directly score

---

## Important: Action Data vs Summary Data

**Always use action (timestamped button press) data, not summary aggregates.**

The action table records the exact sequence: `[SCORE_PLUS_X, ...] → FUEL_SCORE/FUEL_PASS`. The `attributePassesAndShots()` function processes these sequences and correctly:
- Accumulates SCORE_PLUS values as "pending" until confirmed by FUEL_SCORE or FUEL_PASS
- Discards "orphaned" pending values (SCORE_PLUS with no following confirmation)
- Separates shots (FUEL_SCORE) from passes (FUEL_PASS)

The summary table's SCORE_PLUS columns count ALL button presses including orphans, which inflates totals. Using summary data gives ~73% efficiency; action data gives the correct **82.4%** that matches the app's Data Quality page.

76 of 90 robot entries (84%) have action data; 14 are summary-only (mostly robots that did nothing).

---

## Data Overview (15 qual matches, 30 alliance-matches)

### Alliance-Level Efficiency (Action-Based Scout Shots → FMS Scored)

| Metric | Value |
|--------|-------|
| Total alliance-matches | 30 |
| **Overall efficiency** | **82.4%** |
| Grand total shots | 2,871 |
| Grand total FMS scored | 2,365 |
| Grand total passes | 1,018 |

### Per-Alliance Efficiency (sorted)

```
  1%  — Q1 RED: 73 shots → 1 scored (field/robot issues)
 46%  — Q12 RED: 263 shots → 122 scored (heavy +10 usage)
 45%  — Q10 BLUE: 64 shots → 29 scored
 57%  — Q9 BLUE, Q13 BLUE
 58%  — Q7 BLUE
 61%  — Q5 RED, Q10 RED
 63%  — Q11 RED
 64%  — Q4 RED
 65%  — Q5 BLUE
 67%  — Q8 RED
 77%  — Q8 BLUE
 82%  — Q4 BLUE, Q9 RED
 85%  — Q14 RED
 89%  — Q7 RED
 90%  — Q6 RED
 91%  — Q3 RED
 93%  — Q15 RED
 94%  — Q14 BLUE
 98%  — Q11 BLUE
 99%  — Q1 BLUE
100%  — Q2 BLUE, Q13 RED
108%  — Q6 BLUE (slight undercount)
113%  — Q11 BLUE (undercount)
119%  — Q2 RED (undercount)
121%  — Q15 BLUE (6328 "scored over 100 balls")
163%  — Q3 BLUE (bulldozer bots scoring untracked)
463%  — Q12 BLUE (8 shots → 37 scored — bulldozers)
```

---

## How the Scouting App Works (Action Sequences)

From playing back actual action timestamps:

1. Scout watches robot, taps SCORE_PLUS buttons to build up a count: `+10, +10, +5` = 25 pending
2. Scout taps FUEL_SCORE (shot at hub) or FUEL_PASS (passed to partner) to confirm
3. The pending count gets attributed to that action, pending resets to 0
4. If scout taps more SCORE_PLUS after last confirm but match ends → **orphaned** (discarded)

**Example — Team 6328, Match 15** (scored "over 100 balls"):
```
+0s  [AUTO] +10, +10, +3, +2 → pending=25
+18s [AUTO] FUEL_SCORE → 25 balls SHOT
+69s [TELEOP] +10, +10, +5, +10, +10, +10, +10, +5, +10, +10, +5, +2, +2, +10, +10, +10, +10, +5, +1
+185s [TELEOP] FUEL_SCORE → 145 balls SHOT
TOTAL: 170 shots, 0 passes
```
The scout accumulated 145 balls of SCORE_PLUS presses over 2 minutes of teleop, then confirmed with a single FUEL_SCORE. This is how high-volume tracking works — batch entry.

**Example — Team 2342, Match 5** (passer/bulldozer):
```
+0s  [TELEOP] +1 → FUEL_SCORE (1 shot)
+27s [TELEOP] +1 → FUEL_SCORE (1 shot)
+95s [TELEOP] +3 → FUEL_PASS (3 passed)
+103s [TELEOP] +5 → FUEL_PASS (5 passed)
+115s [TELEOP] +2 → FUEL_PASS (2 passed)
TOTAL: 2 shots, 10 passes
```
Low precision tracking, mixture of small shots and passes.

---

## Key Data Patterns

### 1. Precision Degradation by Bucket Size

89% of all estimated balls come from low-precision +5/+10 buckets. High-volume teams (6328: 553 total, 4909: 416, 2877: 345) rely almost entirely on +5/+10. Their raw scout counts have ±20–30% noise.

### 2. Undercount Cases (FMS > Scout Shots)

| Match | Shots | FMS | Cause |
|-------|-------|-----|-------|
| Q15 BLUE | 178 | 215 | Team 6328 "scored over 100 balls" — scout may have undercounted |
| Q3 BLUE | 32 | 52 | "Bulldozer bot" teams scoring without being tracked as shooters |
| Q12 BLUE | 8 | 37 | "No shots, tried to bulldoze" + "Just pushing fuel" — bulldozers accidentally scoring |
| Q2 RED | 130 | 155 | Undercount — Team 78 "didn't shoot much, only carried balls around" but scout may have missed some |
| Q6 BLUE | 158 | 171 | Slight undercount |

**Bulldozer bots** can push fuel into the hub without intentional shooting. Scouts don't track this as FUEL_SCORE, creating unattributed scoring.

### 3. Overcount Cases (FMS < 60% of Scout Shots)

| Match | Shots | FMS | Cause |
|-------|-------|-----|-------|
| Q1 RED | 73 | 1 | 1% eff — likely field/robot issues, 1 ball scored from 73 attempts |
| Q12 RED | 263 | 122 | +10 button spam — 111 from 2877, 128 from 1721 |
| Q10 BLUE | 64 | 29 | Team 5687 "10-14 per volley" — loading count ≠ scored count |
| Q7 BLUE | 64 | 37 | 5000 "was doing passing and shooting, 50/50" |
| Q9 BLUE | 60 | 34 | |

---

## Model Comparison

### Three Attribution Models Tested

All models distribute FMS alliance-level scored total back to individual robots proportionally based on their tracked shots:

1. **Linear (β=1.0)**: `robotScored = (robotShots / allianceShots) × fmsTotal`
2. **Power curve (β<1.0)**: `robotScored = (robotShots^β / Σ(shots^β)) × fmsTotal` — compresses high-volume estimates
3. **Log curve**: `robotScored = (ln(robotShots+1) / Σ(ln(shots+1))) × fmsTotal` — strongest compression

### Per-Team Averages Under Each Model

| Team | Matches | Linear | β=0.8 | β=0.7 | β=0.6 | β=0.5 | Log |
|------|---------|--------|-------|-------|-------|-------|-----|
| 6328 | 4 | 137.5 | 129.8 | 124.9 | 119.1 | 112.5 | 95.1 |
| 4909 | 3 | 87.2 | 82.3 | 79.6 | 76.6 | 73.4 | 64.9 |
| 1768 | 3 | 56.3 | 52.5 | 50.5 | 48.3 | 46.0 | 40.5 |
| 190 | 3 | 51.3 | 48.6 | 47.0 | 45.3 | 43.3 | 38.6 |
| 2877 | 4 | 40.9 | 41.4 | 41.5 | 41.6 | 41.6 | 41.6 |
| 5687 | 3 | 39.4 | 37.3 | 36.2 | 35.1 | 33.8 | 31.1 |
| 5000 | 3 | 38.8 | 35.7 | 34.0 | 32.2 | 30.3 | 26.6 |
| 8724 | 3 | 30.4 | 33.7 | 35.4 | 37.0 | 38.6 | 43.5 |

Rankings stay mostly the same across models — 6328 > 4909 > 1768 > 190. The models differ in **how much credit** they give high-volume vs low-volume teams.

### Consistency Analysis (Coefficient of Variation — lower is better)

| Model | Avg CV across all teams |
|-------|------------------------|
| Linear | 43% |
| β=0.8 | 39% |
| **β=0.7** | **38%** |
| **β=0.6** | **37%** |
| β=0.5 | 38% |
| Log | 41% |

**β=0.6–0.7 gives the most stable per-team averages across matches.** Notable improvements:
- Team 1153: 33% CV (linear) → 8% CV (β=0.7)
- Team 4041: 48% CV (linear) → 22% CV (β=0.7)
- Team 1512: 20% CV (linear) → 10% CV (β=0.7)
- Team 2342: 59% CV (linear) → 27% CV (β=0.7)

Some medium-volume teams get slightly worse (8724: 18%→29%) because compression over-credits low-volume alliance partners.

---

## Recommended Approach: Power Curve β=0.7

### Why β=0.7

1. **Best aggregate consistency** — lowest average CV across all teams (tied with β=0.6)
2. **Appropriate compression** — dampens noise from +5/+10 imprecision without over-crediting low-volume teams
3. **Preserves rankings** — team ordering stays the same as linear; just narrows the spread
4. **Simple to implement** — one parameter, clear mathematical relationship

### The Formula

For each match, for each alliance:

```
robotScored = (robotShots^0.7 / Σ(allRobotShots^0.7)) × fmsAllianceTotal
```

Where:
- `robotShots` = shots from action data (`attributePassesAndShots()` — excludes passes and orphaned presses)
- `fmsAllianceTotal` = `hubScore.totalCount` from TBA/FMS (ground truth)
- Dedicated passers get 0 shots → 0 scored attribution
- Sum is over the 3 robots on the alliance

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Alliance has 0 total shots but FMS > 0 | Divide FMS equally among non-passer robots |
| Only 1 robot has shots | That robot gets all FMS scored |
| Dedicated passer | 0 shots → 0 scored attribution |
| FMS > scout shots (undercount) | Model still works — attributed total sums to FMS truth |
| Field anomaly (Q1 RED: 73→1) | Model works — everyone gets ~0.3 scored |

---

## What This Gets Us

- Per-team **"balls scored" average** grounded in FMS truth
- Accounts for non-linear noise in +5/+10 tracking
- Always sums to actual alliance scored total
- Separates shooters from passers cleanly

## Limitations

1. **Small sample** — 15 qual matches at Week 0; β may need tuning with more data
2. **Bulldozer scoring is invisible** — untracked robots pushing fuel into hub gets attributed to tracked shooters
3. **No per-robot ground truth** — can only validate at alliance level
4. **Consistency ≠ accuracy** — low CV means stable, not necessarily correct per-robot

## Next Steps

1. Implement `attributeFuelScoring()` utility function using action data
2. Add per-team "estimated balls scored" to TeamStatistics
3. Display on team comparison views
4. Re-evaluate β after regular-season events with more matches per team
5. Consider adding match-level undercount/overcount alerts to Data Quality page

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/playback_actions.cjs` | Play back timestamped action sequences per robot per match |
| `scripts/compare_action_vs_summary.cjs` | Compare action-based vs summary-based totals (shows 82.4% vs ~73%) |
| `scripts/explore_fuel_models.cjs` | Run Linear/Power/Log models, compute per-team averages and CV |
| `scripts/explore_fuel_deep.cjs` | Match-by-match deep dive with notes, flags, FMS comparison |
| `scripts/explore_fuel_curve.cjs` | Initial alliance-level analysis |
| `scripts/explore_notes_flags.cjs` | All notes and flags dump (⚠ uses summary data, shows lower efficiency) |
