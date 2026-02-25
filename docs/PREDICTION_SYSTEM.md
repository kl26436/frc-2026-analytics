# Prediction & Simulation System

How Data Wrangler predicts match scores, win probabilities, and ranking point (RP) outcomes for FRC 2026 REBUILT.

---

## Overview

The prediction system has three layers:

1. **Data Layer** — Per-robot per-match scoring data from FMS attribution + scouting
2. **Deterministic Prediction** — Expected alliance score based on team averages
3. **Monte Carlo Simulation** — 1,000-trial simulation for win probability and RP probabilities

---

## 1. Data Layer: Where the Numbers Come From

### Two Data Sources

Every team gets a `dataSource` label: **`fms`** or **`scout`**.

| Source | When Used | What It Is |
|--------|-----------|------------|
| **FMS** | Team has ≥1 match with TBA data | Official FIRST Match System scores, attributed to individual robots via power curve |
| **Scout** | No TBA data yet (early event, practice) | Our scouts' tap-based estimates of fuel moved, climb rates, etc. |

**FMS is always preferred when available.** Scout data is the fallback.

### FMS Data: Power Curve Attribution

FMS only reports **alliance-level** hub scores (e.g., "Red alliance scored 47 auto points"). We need **per-robot** numbers. The power curve distributes alliance totals to individual robots based on how many shots each robot attempted:

```
attributed_points(robot) = (robot_shots ^ 0.7) / Σ(all_robots_shots ^ 0.7) × alliance_total
```

The exponent β = 0.7 is sub-linear — a robot with twice as many shots doesn't get exactly twice the credit. This accounts for the fact that high-volume shooters may have slightly lower accuracy. The power curve is applied independently to:
- Auto hub points
- Teleop hub points
- Auto ball counts
- Teleop ball counts

### Tower Data: No Attribution Needed

Tower (climb) data is already per-robot in FMS — `autoTowerRobot1`, `endGameTowerRobot2`, etc. We just look up which robot position corresponds to which team number and read the values directly.

### What Gets Tracked Per Team

After processing all matches, each team has:

| Stat | Description |
|------|-------------|
| `avgAutoHubPoints` | Average auto fuel points per match |
| `avgTeleopHubPoints` | Average teleop fuel points per match |
| `stdAutoHubPoints` | Standard deviation of auto hub points (match-to-match variance) |
| `stdTeleopHubPoints` | Standard deviation of teleop hub points |
| `autoClimbRate` | Fraction of matches where robot climbed in auto (0–1) |
| `endgameClimbRates` | [none, L1, L2, L3] — fraction of matches at each climb level |
| `avgAutoTowerPoints` | Average auto tower points (autoClimbRate × 15) |
| `avgEndgameTowerPoints` | Average endgame tower points |
| `stdAutoTowerPoints` | Std dev of auto tower points |
| `stdEndgameTowerPoints` | Std dev of endgame tower points |
| `reliability` | 1 − (lostConnection% + noRobot%) — probability robot actually plays |

### Scout Fallback

When a team has no FMS data, we estimate from scout entries:
- Hub points = scout `avgAutoFuelEstimate` and `avgTeleopFuelEstimate` (ball-equivalent estimates)
- Climb rates = scout `autoClimbRate`, `level1ClimbRate`, `level2ClimbRate`, `level3ClimbRate` (converted from 0–100 to 0–1)
- Standard deviations = **40% of the mean** (heuristic, since we don't have per-match scout variance)
- Reliability = same formula (scout flags for lost connection / no robot)

---

## 2. Deterministic Prediction

The deterministic prediction gives a single expected score for an alliance. It's what you see as the main predicted score.

### How It Works

For each robot on the alliance:

```
robot_score = (avgAutoHub + avgTeleopHub + avgAutoTower + avgEndgameTower) × reliability
```

Alliance score = sum of all 3 robots.

The `reliability` multiplier accounts for the chance a robot doesn't show up or loses connection — if a robot has 90% reliability, its expected contribution is scaled to 90% of its average performance.

### Confidence Rating

Based on the least-experienced team on the alliance:
- **High**: All teams have 6+ matches
- **Medium**: All teams have 3+ matches
- **Low**: Any team has fewer than 3 matches

---

## 3. Monte Carlo Simulation

The Monte Carlo simulation runs 1,000 independent "fake matches" to estimate probabilities. This captures the variance/randomness of FRC matches that a single average can't.

### Per Trial (One Simulated Match)

For each of the 3 robots on an alliance:

1. **Reliability check**: Roll a random number. If > robot's reliability, the robot contributes 0 points this trial (simulates a no-show or disconnect).

2. **Hub scoring**: Sample from a normal distribution:
   - Auto hub points ~ Normal(avgAutoHubPoints, stdAutoHubPoints), clamped ≥ 0
   - Teleop hub points ~ Normal(avgTeleopHubPoints, stdTeleopHubPoints), clamped ≥ 0

3. **Auto tower**: Roll a random number. If < autoClimbRate, score 15 points.

4. **Endgame tower**: Roll from the categorical distribution [none, L1, L2, L3] with the robot's historical climb rates → score 0, 10, 20, or 30 points.

5. Sum all 3 robots' points → that alliance's score for this trial.

Both alliances are simulated independently in each trial.

### Normal Distribution Sampling

We use the **Box-Muller transform** to generate normally distributed random numbers from JavaScript's uniform `Math.random()`:

```
z = sqrt(-2 × ln(u₁)) × cos(2π × u₂)
sample = max(0, mean + stddev × z)
```

The `max(0, ...)` clamp prevents negative scores (which are physically impossible).

### What We Compute From 1,000 Trials

| Output | How Computed |
|--------|-------------|
| **Win Probability** | Fraction of trials where this alliance's score > opponent's score |
| **Energized RP Prob** | Fraction of trials where alliance hub points ≥ 100 |
| **Supercharged RP Prob** | Fraction of trials where alliance hub points ≥ 360 |
| **Traversal RP Prob** | Fraction of trials where alliance tower points ≥ 50 |
| **Expected Win RP** | winProb × 3 + tieProb × 1 (2026 uses 3 RP for a win) |
| **Expected Total RP** | expectedWinRP + energizedProb + superchargedProb + traversalProb |
| **Score Percentiles** | p10, p25, p50 (median), p75, p90 of the 1,000 simulated scores |
| **Mean / Std Score** | Average and standard deviation across all trials |

### RP Thresholds (2026 REBUILT)

| RP | Condition | Points |
|----|-----------|--------|
| Win | Score more than opponent | 3 RP |
| Tie | Equal score | 1 RP each |
| Energized | Alliance hub points ≥ 100 | 1 RP |
| Supercharged | Alliance hub points ≥ 360 | 1 RP |
| Traversal | Alliance tower points ≥ 50 | 1 RP |

Maximum possible RP per match: **3 (win) + 1 + 1 + 1 = 6 RP**.

---

## Data Flow

```
Scout Entries ──→ TeamStatistics (scout averages)
                          ↘
                    buildPredictionInputs() ──→ PredictionTeamInput[]
                          ↗                           ↓
FMS TBA Matches ──→ Fuel Attribution ──→ TeamFuelStats    ↓
                    (power curve β=0.7)               computeMatchup()
                                                      ├── predictAlliance()  → deterministic score
                                                      └── monteCarloMatchup() → win/RP probabilities
```

### Calculation Chain in the Store

1. Scout data arrives → `calculateRealStats()` → TeamStatistics
2. TBA match data arrives → `calculateFuelAttribution()` → TeamFuelStats
3. Either of the above → `calculatePredictionInputs()` → PredictionTeamInput[]
4. UI calls `computeMatchup(redTeams, blueTeams, predictionInputs)` → full prediction

---

## Key Files

| File | What It Does |
|------|-------------|
| `src/utils/fuelAttribution.ts` | Power curve attribution, tower lookup, team-level aggregation with variance |
| `src/utils/predictions.ts` | Prediction engine: deterministic scores, Monte Carlo simulation, matchup orchestration |
| `src/store/useAnalyticsStore.ts` | Zustand store — wires data subscriptions to calculation chain |
| `src/pages/AlliancePredictor.tsx` | Main prediction UI (quals, playoffs, custom matchups) |
| `src/pages/Dashboard.tsx` | Dashboard with next-match predictions |

---

## Why Monte Carlo Instead of a Formula?

A simple formula like "Team A averages 50 points" can tell you expected scores, but it can't answer questions like:
- "What's the chance this alliance gets the Supercharged RP?"
- "How likely is a 20+ point blowout?"
- "What if one of our robots disconnects?"

Monte Carlo naturally handles:
- **Non-linear RP thresholds** — The jump from 99 to 100 hub points matters enormously for Energized RP. A normal distribution around 95 might hit 100 in 60% of trials.
- **Categorical outcomes** — Climb levels aren't continuous. A robot either climbs L3 (30 pts) or doesn't. You can't "average" that meaningfully.
- **Reliability** — A team that disconnects 20% of the time has a very different probability profile than one that's rock-solid, even if their averages are similar.
- **Correlated risk** — Each trial simulates all 6 robots independently, so the simulation naturally captures scenarios where multiple things go wrong (or right) simultaneously.
