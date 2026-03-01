# FRC 2026 REBUILT — Complete Scouting System Specification

> **Purpose**: This is the single authoritative reference for the entire TBA/FMS integration, reconciliation, validation, and pre-scouting system for the FRC 2026 REBUILT scouting app. Drop this in your project root so any AI assistant or developer working on this codebase understands the full system design.
>
> **App Stack**: React + TypeScript PWA using Firebase for backend/auth. Match schedule pull from TBA already exists — extend the existing TBA API utility code.
>
> **Last Updated**: February 22, 2026

---

## Table of Contents

1. [Key Dates & Timeline](#1-key-dates--timeline)
2. [The 2026 REBUILT Game — What FMS Tracks](#2-the-2026-rebuilt-game--what-fms-tracks)
3. [TBA API Reference](#3-tba-api-reference)
4. [Field Name Mapping (REQUIRES WEEK 0 CALIBRATION)](#4-field-name-mapping)
5. [Data Authority Hierarchy](#5-data-authority-hierarchy)
6. [FMS Match Result Sync](#6-fms-match-result-sync)
7. [Fuel Count Verification & Correction](#7-fuel-count-verification--correction)
8. [Fuel Priors (Multi-Match Bayesian)](#8-fuel-priors)
9. [Scout Accuracy Report](#9-scout-accuracy-report)
10. [Match Health Scoring & Bad Match Flagging](#10-match-health-scoring--bad-match-flagging)
11. [Cross-Reference Checks (Pre-FMS)](#11-cross-reference-checks)
12. [Analysis Exclusion & Confidence Weighting](#12-analysis-exclusion--confidence-weighting)
13. [Data Source Toggle](#13-data-source-toggle)
14. [Pre-Scouting Engine](#14-pre-scouting-engine)
15. [Complete Correction Pipeline](#15-complete-correction-pipeline)
16. [Data Models (All TypeScript Interfaces)](#16-data-models)
17. [File Structure](#17-file-structure)
18. [Configuration & Thresholds](#18-configuration--thresholds)
19. [Environment Variables](#19-environment-variables)
20. [Implementation Priority](#20-implementation-priority)
21. [Edge Cases & Gotchas](#21-edge-cases--gotchas)
22. [Week 0 Calibration Checklist](#22-week-0-calibration-checklist)

---

## 1. Key Dates & Timeline

| Date | Event | Relevance |
|---|---|---|
| **Feb 21, 2026** | Official FIRST Week 0 (Bishop Guertin, Nashua NH) — event key `2026week0` | First real FMS data. Calibrate field name mapping. |
| **Feb 21-22, 2026** | Blue Twilight Week Zero (Eagan, MN) — event key `2026mnbt` | Additional Week 0 data source |
| Feb 28, 2026 | Community Week 0 events | May NOT use FMS — don't rely on API data |
| **Mar 4-7, 2026** | Week 1 official events | First official season data |
| Mar 11+, 2026 | Week 2+ events | Full pre-scouting available |

---

## 2. The 2026 REBUILT Game — What FMS Tracks

### 2.1 Match Structure
- **Auto**: 20 seconds (robots autonomous)
- **Teleop**: Transition Shift (10s) → 4 Alliance Shifts (25s each) → Endgame (30s)
- **Total match**: 2 minutes 40 seconds

Hub Activity Shifts: During teleop, Hubs alternate being active and inactive. Only the active Hub accepts scoring. FMS enforces this — fuel shot into an inactive Hub doesn't count.

### 2.2 Scoring Summary

| Action | Auto Points | Teleop Points |
|---|---|---|
| Fuel in Hub | Same as teleop | 1 pt per fuel (confirm from live data) |
| Tower Climb L1 | 15 | 10 |
| Tower Climb L2 | — | 20 |
| Tower Climb L3 | — | 30 |
| Auto Leave | 2 (expected, confirm) | — |

### 2.3 Ranking Points (Qualification only)
- **Win**: 3 RP (Tie: 1 RP)
- **Energized RP**: Alliance scores ≥100 fuel points
- **Supercharged RP**: Alliance scores ≥360 fuel points
- **Traversal RP**: Alliance earns ≥50 tower points

### 2.4 FMS Data Granularity

**Per-Robot (directly from FMS per each robot):**
- Auto leave (boolean/enum per robot)
- End game climb level (None/L1/L2/L3 per robot)
- Auto climb (L1 in auto, per robot)

**Per-Alliance only (scouts must track per-robot breakdown manually):**
- Auto fuel count/points (alliance total)
- Teleop fuel count/points (alliance total)
- Auto/teleop tower points
- Foul/tech foul count and points
- Total score
- RP booleans

**Open Question**: Does FMS publish fuel-per-shift data (how much scored during each active Hub window) or just lump teleop total? Check Week 0 JSON.

---

## 3. TBA API Reference

### 3.1 Authentication
All requests require header: `X-TBA-Auth-Key: {YOUR_API_KEY}`

Get a key at: https://www.thebluealliance.com/account

### 3.2 Key Endpoints

```
Base URL: https://www.thebluealliance.com/api/v3
```

**Event Teams (for pre-scouting):**
```
GET /event/{event_key}/teams/keys → ["frc254", "frc1678", ...]
GET /event/{event_key}/teams → [{ team_number, nickname, city, state_prov, ... }]
```

**Match Schedule (already implemented):**
```
GET /event/{event_key}/matches/simple
```

**Match Results with Score Breakdown (core of this integration):**
```
GET /event/{event_key}/matches → Full match objects with score_breakdown
GET /match/{match_key} → Single match with full detail
```

The `score_breakdown` object lives at `match.score_breakdown.red` and `match.score_breakdown.blue`.

**Team History at Prior Events (for pre-scouting):**
```
GET /team/{team_key}/events/{year} → List of events attended
GET /team/{team_key}/events/{year}/keys → Just event keys
GET /team/{team_key}/event/{event_key}/matches → All matches at that event (with score_breakdown)
GET /team/{team_key}/event/{event_key}/status → Qual ranking, playoff alliance, playoff status
```

**OPR/DPR/CCWM (for pre-scouting):**
```
GET /event/{event_key}/oprs → { oprs: { "frc254": 85.2, ... }, dprs: { ... }, ccwms: { ... } }
```

**Event Rankings:**
```
GET /event/{event_key}/rankings → Full ranking list with record, RP, sort orders
```

### 3.3 Caching & ETags
TBA supports `If-None-Match` headers. Store the `ETag` from each response and send it back on subsequent requests. If data hasn't changed, TBA returns `304 Not Modified` with an empty body. This is important for polling during live events.

### 3.4 Rate Limiting
- Space requests 100-150ms apart
- Implement a request queue with retry on 429 and 503
- Cache ETags per endpoint
- Completed event data never changes — cache once, done

---

## 4. Field Name Mapping

**CRITICAL: The exact field names in the TBA `score_breakdown` JSON are NOT confirmed until real FMS data is produced. The mapping below uses best guesses from past years. You MUST update this config after pulling real Week 0 JSON.**

```typescript
// config/tbaFieldMap2026.ts

export const TBA_FIELD_MAP_2026 = {
  // Per-robot fields — keys are our internal names, values are TBA JSON paths
  autoLeave: {
    robot1: "autoLeaveRobot1",      // UPDATE AFTER WEEK 0
    robot2: "autoLeaveRobot2",
    robot3: "autoLeaveRobot3",
    trueValues: ["Yes", true, "TRUE"],  // handle whatever format TBA uses
  },
  endGameClimb: {
    robot1: "endGameRobot1",        // UPDATE AFTER WEEK 0
    robot2: "endGameRobot2",
    robot3: "endGameRobot3",
    valueMap: {                      // UPDATE enum strings after Week 0
      "None": 0,
      "Level1": 1,
      "Level2": 2,
      "Level3": 3,
    },
  },

  // Alliance-level fields           // UPDATE field names after Week 0
  autoFuelPoints: "autoFuelPoints",
  teleopFuelPoints: "teleopFuelPoints",
  autoFuelCount: "autoFuelCount",     // may not exist — check
  teleopFuelCount: "teleopFuelCount", // may not exist — check
  autoTowerPoints: "autoTowerPoints",
  teleopTowerPoints: "teleopTowerPoints",
  foulPoints: "foulPoints",
  foulCount: "foulCount",
  techFoulCount: "techFoulCount",
  totalScore: "totalScore",
  autoPoints: "autoPoints",
  teleopPoints: "teleopPoints",

  // Ranking points
  energizedRP: "energizedRankingPoint",
  superchargedRP: "superchargedRankingPoint",
  traversalRP: "traversalRankingPoint",
  rp: "rp",
} as const;
```

**To calibrate**: Pull one match from Week 0:
```bash
curl -s -H "X-TBA-Auth-Key: YOUR_KEY" \
  "https://www.thebluealliance.com/api/v3/match/2026week0_qm1" | python3 -m json.tool
```

If that event key has no quals, list matches first:
```bash
curl -s -H "X-TBA-Auth-Key: YOUR_KEY" \
  "https://www.thebluealliance.com/api/v3/event/2026week0/matches/keys" | python3 -m json.tool
```

Also try `2026mnbt` (Blue Twilight, MN).

---

## 5. Data Authority Hierarchy

This applies **everywhere** in the app — analysis, pick lists, strategy views, exports, everything.

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: FMS Per-Robot Data (AUTHORITATIVE — no override)   │
│  • Climb level (None / L1 / L2 / L3)                       │
│  • Auto leave (yes / no)                                    │
│  • Auto climb                                               │
│  Rule: ALWAYS use FMS value. Scout value is for accuracy    │
│        reporting only — never used in analysis.             │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: FMS Alliance-Level Data (AUTHORITATIVE total)      │
│  • Total fuel scored (auto + teleop)                        │
│  • Total alliance score                                     │
│  • Foul points                                              │
│  • Ranking points earned                                    │
│  Rule: FMS total is the hard ceiling and floor. Scout data  │
│        only distributes the FMS total across robots.        │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: Scout-Only Data (no FMS equivalent)                │
│  • Per-robot fuel count (distribution within alliance)      │
│  • Qualitative observations (defense, driver skill, etc.)   │
│  • Cycle times, intake/shooting notes                       │
│  • Human player performance notes                           │
│  Rule: Use as-is, validated only by reasonableness checks.  │
│        Fuel distribution gets constrained by Tier 2 total.  │
└─────────────────────────────────────────────────────────────┘
```

**What this means in practice:**
- If the scout says L2 and FMS says L3, the answer is **L3**. No toggle, no reconciliation, no blending.
- FMS says the alliance scored 22 fuel. That's the number. The ONLY question is how those 22 break down across robots — that's where scouts come in.
- The scout's raw data never gets modified or deleted. It lives in its own field forever. But it never reaches any analysis view for Tier 1 or Tier 2 data.

---

## 6. FMS Match Result Sync

### 6.1 Polling Strategy During Live Events

After a match is played, start polling for FMS data:

1. Poll `GET /match/{match_key}` every 30 seconds
2. Once `score_breakdown` is non-null, run the correction pipeline
3. Stop polling for that match
4. Show notification/badge on matches with mismatches

Use ETags to avoid re-downloading unchanged data.

### 6.2 Data Storage

```typescript
// Store TBA match data in a separate collection from manual scouting data
// Firebase: scoutData/{match}/{team}/manual   — raw scout entry
// Firebase: scoutData/{match}/{team}/fms      — raw FMS data
// Firebase: scoutData/{match}/{team}/analysis  — FMS-corrected final data
```

---

## 7. Fuel Count Verification & Correction

### 7.1 The Core Check

Every match where we have both scout data and FMS data, compute the gap:

```typescript
function fuelVerdict(scoutTotal: number, fmsTotal: number): "accurate" | "close" | "off" | "way_off" | "unusable" {
  if (fmsTotal === 0) return scoutTotal === 0 ? "accurate" : "unusable";
  const pctGap = Math.abs(scoutTotal - fmsTotal) / fmsTotal;
  if (pctGap <= 0.10) return "accurate";    // within 10%
  if (pctGap <= 0.25) return "close";       // within 25%
  if (pctGap <= 0.45) return "off";         // within 45%
  if (pctGap <= 0.70) return "way_off";     // within 70%
  return "unusable";                         // 70%+
}
```

### 7.2 Asymmetric Confidence

Overcounting is worse than undercounting for trusting the distribution:

- **Undercounting** (scout < FMS): Scout probably tracked accurately but missed some balls — likely Human Player scoring, fast sequences, or momentary distraction. The relative proportions between robots are probably still good. Scale up with reasonable confidence.
- **Overcounting** (scout > FMS): Scout counted balls that didn't actually score — maybe shots that missed, balls during inactive Hub shifts, or double-counting. If perception was that wrong, distribution is also suspect. Scale down with lower confidence.

```typescript
function correctionConfidence(
  scoutTotal: number,
  fmsTotal: number,
  verdict: "accurate" | "close" | "off" | "way_off" | "unusable"
): "high" | "medium" | "low" {
  if (verdict === "accurate") return "high";
  if (verdict === "unusable") return "low";
  const direction = scoutTotal > fmsTotal ? "over" : "under";
  if (verdict === "close") return direction === "under" ? "high" : "medium";
  if (verdict === "off") return direction === "under" ? "medium" : "low";
  return "low"; // way_off
}
```

### 7.3 Correction Logic by Confidence Level

| Confidence | Distribution Source | Logic |
|---|---|---|
| **High** | Scout proportions × FMS total | `robotFuel = (scoutRobotFuel / scoutTotal) × fmsTotal` |
| **Medium** | Blend 60% scout / 40% priors × FMS total | If priors exist. Otherwise scout proportions only |
| **Low** | Priors only × FMS total | Don't trust this scout's distribution. Fall back to priors or even split |

```typescript
function correctFuelCounts(
  scoutByRobot: { robot1: number; robot2: number; robot3: number },
  fmsTotal: number,
  confidence: "high" | "medium" | "low",
  priors: { robot1Share: number; robot2Share: number; robot3Share: number } | null
): { robot1: number; robot2: number; robot3: number } {
  const scoutTotal = scoutByRobot.robot1 + scoutByRobot.robot2 + scoutByRobot.robot3;

  const scoutProps = scoutTotal > 0
    ? {
        r1: scoutByRobot.robot1 / scoutTotal,
        r2: scoutByRobot.robot2 / scoutTotal,
        r3: scoutByRobot.robot3 / scoutTotal,
      }
    : { r1: 1/3, r2: 1/3, r3: 1/3 };

  let finalProps: { r1: number; r2: number; r3: number };

  switch (confidence) {
    case "high":
      finalProps = scoutProps;
      break;

    case "medium":
      if (priors) {
        const priorSum = priors.robot1Share + priors.robot2Share + priors.robot3Share;
        const normPriors = {
          r1: priors.robot1Share / priorSum,
          r2: priors.robot2Share / priorSum,
          r3: priors.robot3Share / priorSum,
        };
        finalProps = {
          r1: scoutProps.r1 * 0.6 + normPriors.r1 * 0.4,
          r2: scoutProps.r2 * 0.6 + normPriors.r2 * 0.4,
          r3: scoutProps.r3 * 0.6 + normPriors.r3 * 0.4,
        };
      } else {
        finalProps = scoutProps;
      }
      break;

    case "low":
      if (priors) {
        const priorSum = priors.robot1Share + priors.robot2Share + priors.robot3Share;
        finalProps = {
          r1: priors.robot1Share / priorSum,
          r2: priors.robot2Share / priorSum,
          r3: priors.robot3Share / priorSum,
        };
      } else {
        finalProps = { r1: 1/3, r2: 1/3, r3: 1/3 };
      }
      break;
  }

  // Normalize and apply to FMS total
  const propSum = finalProps.r1 + finalProps.r2 + finalProps.r3;
  const raw = {
    robot1: (finalProps.r1 / propSum) * fmsTotal,
    robot2: (finalProps.r2 / propSum) * fmsTotal,
    robot3: (finalProps.r3 / propSum) * fmsTotal,
  };

  // Round to 1 decimal, fix residual onto largest value
  const rounded = {
    robot1: Math.round(raw.robot1 * 10) / 10,
    robot2: Math.round(raw.robot2 * 10) / 10,
    robot3: Math.round(raw.robot3 * 10) / 10,
  };
  const residual = fmsTotal - (rounded.robot1 + rounded.robot2 + rounded.robot3);
  if (Math.abs(residual) > 0.01) {
    const largest = raw.robot1 >= raw.robot2 && raw.robot1 >= raw.robot3 ? "robot1"
      : raw.robot2 >= raw.robot3 ? "robot2" : "robot3";
    rounded[largest] = Math.round((rounded[largest] + residual) * 10) / 10;
  }

  return rounded;
}
```

### 7.4 Auto vs Teleop — Separate Correction

FMS provides auto fuel and teleop fuel as separate totals. Verify and correct them independently:

- **Auto fuel**: Small numbers (0-15), easy to count. Errors are suspicious.
- **Teleop fuel**: Large numbers, fast-paced, Hub shifts. Most scout error lives here.

```typescript
interface PhaseFuelVerification {
  auto: { scoutTotal: number; fmsTotal: number; gap: number; verdict: string };
  teleop: { scoutTotal: number; fmsTotal: number; gap: number; verdict: string };
  combined: { scoutTotal: number; fmsTotal: number; gap: number; verdict: string };
}
```

Apply correction separately per phase so good auto data stays clean even if teleop is corrected heavily.

---

## 8. Fuel Priors

After 3+ matches, build rolling averages of each team's typical fuel share:

```typescript
interface TeamFuelPriors {
  teamKey: string;
  matchesUsed: number;
  avgFuelShare: number;        // 0.0-1.0, what % of alliance fuel this team scores
  avgFuelShareAuto: number;
  avgFuelShareTeleop: number;
  strength: number;            // 0.0-1.0, plateaus around 6 matches
  history: {
    matchKey: string;
    thisTeamCorrectedFuel: number;
    allianceFmsTotal: number;
    shareOfAlliance: number;
  }[];
}

// Prior strength: increases with matches, plateaus around 6-8
function calculatePriorStrength(matchesObserved: number): number {
  return 1 - (1 / (1 + matchesObserved * 0.4));
  // 0 matches = 0, 3 matches = ~0.55, 6 matches = ~0.71, 10 matches = ~0.80
}
```

### Using Priors for Three-Way Distribution

When you have priors for all three robots in an alliance, reconstruct the expected split:

```typescript
function distributeFuelWithPriors(
  fmsAllianceTotal: number,
  robot1Prior: TeamFuelPriors,
  robot2Prior: TeamFuelPriors,
  robot3Prior: TeamFuelPriors
): { r1: number; r2: number; r3: number } {
  const shares = {
    r1: robot1Prior.avgFuelShare,
    r2: robot2Prior.avgFuelShare,
    r3: robot3Prior.avgFuelShare,
  };
  // These shares come from different alliance contexts — normalize
  const sum = shares.r1 + shares.r2 + shares.r3;
  if (sum === 0) return { r1: fmsAllianceTotal / 3, r2: fmsAllianceTotal / 3, r3: fmsAllianceTotal / 3 };
  return {
    r1: Math.round((shares.r1 / sum) * fmsAllianceTotal * 10) / 10,
    r2: Math.round((shares.r2 / sum) * fmsAllianceTotal * 10) / 10,
    r3: Math.round((shares.r3 / sum) * fmsAllianceTotal * 10) / 10,
  };
}
```

This is powerful mid-event. By match 20 you have 3-4 data points for most teams. You can distribute FMS totals even with garbage scout data or NO scout data (scout absent, app crash, etc.).

### Advanced: Bayesian Blending with Priors

When reconciling with priors available:

```typescript
function reconcileWithPriors(
  scoutData: { robot1Fuel: number; robot2Fuel: number; robot3Fuel: number },
  fmsAllianceTotal: number,
  priors: { robot1Prior: TeamFuelPriors | null; robot2Prior: TeamFuelPriors | null; robot3Prior: TeamFuelPriors | null }
): ReconciledFuelData {
  const scoutTotal = scoutData.robot1Fuel + scoutData.robot2Fuel + scoutData.robot3Fuel;
  const scoutProps = scoutTotal > 0
    ? { r1: scoutData.robot1Fuel / scoutTotal, r2: scoutData.robot2Fuel / scoutTotal, r3: scoutData.robot3Fuel / scoutTotal }
    : { r1: 1/3, r2: 1/3, r3: 1/3 };

  const hasPriors = priors.robot1Prior && priors.robot2Prior && priors.robot3Prior;
  if (!hasPriors || scoutTotal === 0) {
    // Fall back to basic proportional
    return basicReconcile(scoutData, fmsAllianceTotal);
  }

  // Normalize priors
  const priorProps = {
    r1: priors.robot1Prior!.avgFuelShare,
    r2: priors.robot2Prior!.avgFuelShare,
    r3: priors.robot3Prior!.avgFuelShare,
  };
  const priorSum = priorProps.r1 + priorProps.r2 + priorProps.r3;
  priorProps.r1 /= priorSum;
  priorProps.r2 /= priorSum;
  priorProps.r3 /= priorSum;

  // Weight priors more when scouts were way off or priors are strong
  const scoutError = scoutTotal > 0
    ? Math.abs(scoutTotal - fmsAllianceTotal) / fmsAllianceTotal : 1.0;
  const avgPriorStrength = (
    (priors.robot1Prior?.strength ?? 0) +
    (priors.robot2Prior?.strength ?? 0) +
    (priors.robot3Prior?.strength ?? 0)
  ) / 3;

  // priorWeight: 0.0 (trust scouts) to 0.7 (heavily trust priors)
  // Never above 0.7 because the scout WAS watching this specific match
  const priorWeight = Math.min(0.7, (scoutError * 0.5) + (avgPriorStrength * 0.3));
  const scoutWeight = 1.0 - priorWeight;

  const blended = {
    r1: (scoutProps.r1 * scoutWeight) + (priorProps.r1 * priorWeight),
    r2: (scoutProps.r2 * scoutWeight) + (priorProps.r2 * priorWeight),
    r3: (scoutProps.r3 * scoutWeight) + (priorProps.r3 * priorWeight),
  };
  const blendedSum = blended.r1 + blended.r2 + blended.r3;

  return {
    robot1Fuel: Math.round((blended.r1 / blendedSum) * fmsAllianceTotal * 10) / 10,
    robot2Fuel: Math.round((blended.r2 / blendedSum) * fmsAllianceTotal * 10) / 10,
    robot3Fuel: Math.round((blended.r3 / blendedSum) * fmsAllianceTotal * 10) / 10,
    fmsAllianceTotal,
    scoutAllianceTotal: scoutTotal,
    reconciliationMethod: `blended_prior_weight_${(priorWeight * 100).toFixed(0)}pct`,
    confidence: scoutError < 0.15 && avgPriorStrength > 0.5 ? "high" :
                scoutError < 0.35 ? "medium" : "low",
  };
}
```

---

## 9. Scout Accuracy Report

### 9.1 Per-Scout Accuracy Profile

```typescript
interface ScoutAccuracyProfile {
  scoutId: string;
  scoutName: string;
  eventKey: string;
  matchesScouted: number;

  climbExactRate: number;      // % exact match
  climbWithin1Rate: number;    // % within 1 level
  climbMissRate: number;       // % off by 2+
  commonClimbErrors: { reported: number; actual: number; count: number }[];

  autoLeaveAccuracyRate: number;

  fuelTendency: "accurate" | "overcounts" | "undercounts";
  avgFuelPercentError: number;
  avgFuelAbsoluteError: number;

  reliabilityScore: number;    // 0-100
}
```

### 9.2 Reliability Score Calculation

```typescript
function calculateReliabilityScore(profile: ScoutAccuracyProfile): number {
  const climbWeight = 0.40;
  const autoWeight = 0.15;
  const fuelWeight = 0.45;

  const climbScore = (
    profile.climbExactRate * 1.0 +
    (profile.climbWithin1Rate - profile.climbExactRate) * 0.5
  ) * 100;

  const autoScore = profile.autoLeaveAccuracyRate * 100;

  // 0% error = 100, 10% error = 80, 25% error = 50, 50%+ error = 0
  const fuelScore = Math.max(0, 100 - (profile.avgFuelPercentError * 2));

  return Math.round(
    climbScore * climbWeight +
    autoScore * autoWeight +
    fuelScore * fuelWeight
  );
}
```

### 9.3 Report UI

- Bar chart: reliability scores for all scouts, sorted high to low
- Highlight scouts below threshold (< 70) in yellow/red
- Per-scout drill-down: match-by-match comparison, pattern detection, trend line
- Per-match view: green/yellow/red indicators next to each scouted field

---

## 10. Match Health Scoring & Bad Match Flagging

Every scouted match gets a health score from 0 to 100.

### 10.1 Field-Level Scores

**Climb Level Score:**

| Scenario | Score |
|---|---|
| Exact match | 100 |
| Off by 1 level | 60 |
| Off by 2 levels | 20 |
| Off by 3 levels | 0 |
| Scout says None, FMS says climbed L2+ | 0 |

**Auto Leave Score:**

| Scenario | Score |
|---|---|
| Correct | 100 |
| Wrong | 30 |

**Fuel Total Score (alliance-level):**

Continuous curve: `score = max(0, round(100 * (1 - (percentError / 0.55) ^ 1.5)))`

| % Error | Score |
|---|---|
| 0-10% | 90-100 |
| 10-20% | 70-90 |
| 20-35% | 40-70 |
| 35-50% | 15-40 |
| 50%+ | 0-15 |

### 10.2 Composite Score

```typescript
interface MatchHealthReport {
  matchKey: string;
  teamKey: string;
  alliance: "red" | "blue";
  robotPosition: 1 | 2 | 3;
  scoutId: string;
  fieldScores: FieldHealthScore[];
  compositeScore: number;          // 0-100
  tier: "clean" | "minor" | "significant" | "unreliable";
  fieldFlags: {
    climbReliable: boolean;        // score >= 60
    autoLeaveReliable: boolean;    // score >= 30 (i.e. correct)
    fuelReliable: boolean;         // score >= 40
  };
  recommendation: "use" | "use_with_caution" | "review" | "exclude";
}
```

### 10.3 Tier Thresholds

| Tier | Composite Score | Badge | Default Behavior |
|---|---|---|---|
| **Clean** | 80-100 | 🟢 | Include in all analysis |
| **Minor** | 55-79 | 🟡 | Include but reconcile |
| **Significant** | 30-54 | 🟠 | Include reconciled only. Flag for review |
| **Unreliable** | 0-29 | 🔴 | Exclude from analysis by default |

Field weights: Climb 0.35, Auto Leave 0.15, Fuel 0.50

Override: if ANY field scored 0, bump to at least "minor". If ANY field scored 0 AND composite < 50, force "unreliable".

---

## 11. Cross-Reference Checks

Run immediately on scout data ingestion, before FMS data is available:

```typescript
interface CrossReferenceFlag {
  type: "team_mismatch" | "alliance_mismatch" | "position_mismatch" | "duplicate_entry" | "missing_entry" | "schedule_not_found";
  severity: "error" | "warning";
  detail: string;
  matchKey: string;
  teamKey?: string;
}
```

**Checks:**
1. **Team-Match assignment**: Is this team in this match per TBA? (error if not)
2. **Alliance**: Does the scout's red/blue match TBA? (error if not)
3. **Robot position**: Does position 1/2/3 match TBA? (warning if not)
4. **Duplicate**: More than one entry for same team-match? (warning)
5. **Missing entry**: After match played, any robot unscouted? (warning — breaks reconciliation)

---

## 12. Analysis Exclusion & Confidence Weighting

### 12.1 Default Analysis Config

```typescript
interface AnalysisConfig {
  includeTiers: Set<"clean" | "minor" | "significant" | "unreliable">;
  weightByHealth: boolean;
  preferReconciled: boolean;
}

const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  includeTiers: new Set(["clean", "minor", "significant"]),  // exclude red only
  weightByHealth: true,
  preferReconciled: true,
};
```

### 12.2 Confidence-Weighted Aggregation

When `weightByHealth` is true:

```typescript
function weightedAverage(dataPoints: { value: number; healthScore: number }[]): number {
  const weighted = dataPoints.map(d => ({
    value: d.value,
    weight: Math.max(0.05, d.healthScore / 100),  // floor at 0.05
  }));
  const totalWeight = weighted.reduce((sum, d) => sum + d.weight, 0);
  return weighted.reduce((sum, d) => sum + d.value * d.weight, 0) / totalWeight;
}
```

### 12.3 Per-Field Selective Inclusion

A match's climb data can be used even if its fuel data is flagged:

```typescript
// Only use matches where climb data is reliable
const reliableClimbMatches = matchHealthReports.filter(
  r => r.teamKey === teamKey && r.fieldFlags.climbReliable
);
```

Don't throw away good climb observations because the scout miscounted balls.

---

## 13. Data Source Toggle

```typescript
type DataSourceMode =
  | "manual"          // raw scout data, no corrections
  | "tba"             // FMS data only (alliance-level for fuel)
  | "reconciled"      // FMS-corrected per-robot estimates (RECOMMENDED DEFAULT)
  | "side-by-side";   // show all columns

interface ScoutingConfig {
  defaultSource: DataSourceMode;
  fieldOverrides?: {
    endGameClimb?: DataSourceMode;
    autoLeave?: DataSourceMode;
    fuelScored?: DataSourceMode;
  };
}
```

### Which Source for Which View

| App View | Climb Source | Auto Leave Source | Fuel Source |
|---|---|---|---|
| Live scouting (mid-match) | Scout entry | Scout entry | Scout entry |
| Post-match review | FMS ✅/❌ vs scout | FMS ✅/❌ vs scout | FMS total vs scout + correction |
| Team analysis | FMS only | FMS only | FMS-corrected per-robot |
| Pick list / rankings | FMS only | FMS only | FMS-corrected per-robot |
| Strategy / match planning | FMS only | FMS only | FMS-corrected per-robot |
| Scout accuracy report | Scout vs FMS | Scout vs FMS | Scout total vs FMS total |
| Data export (CSV) | Both columns | Both columns | All three: scout, FMS, corrected |
| Pre-scout (historical) | FMS only | FMS only | OPR-estimated |

---

## 14. Pre-Scouting Engine

### 14.1 Purpose

For events like Worlds (600+ teams), pull every team's entire 2026 season history from TBA — match by match, event by event — before you ever see them play.

### 14.2 TBA API Call Flow

1. `GET /event/{event_key}/teams` — get team list
2. For each team: `GET /team/{team_key}/events/2026` — filter to official completed events (event_type 0-5, end_date in past)
3. For each prior event:
   - `GET /team/{team_key}/event/{event_key}/matches` (with score_breakdown)
   - `GET /event/{event_key}/oprs` (DEDUPLICATE — fetch once per unique event)
   - `GET /event/{event_key}/rankings` (DEDUPLICATE)
   - `GET /team/{team_key}/event/{event_key}/status`

### 14.3 Request Volume (Worlds ~600 teams)

- ~600 team event history calls
- ~1200 team-event match calls (avg 2 prior events per team)
- ~200 unique event OPR calls (deduped)
- ~200 unique event ranking calls
- ~1200 team-event status calls
- **Total: ~3,400 API calls** at 100ms spacing = ~5.5 minutes

**Deduplication is critical.** If 30 teams all attended the same district event, fetch that event's OPR and rankings ONCE.

### 14.4 Pre-Scout Match Record

```typescript
interface PreScoutMatchRecord {
  teamKey: string;
  matchKey: string;
  eventKey: string;
  compLevel: "qm" | "ef" | "qf" | "sf" | "f";
  matchNumber: number;
  setNumber: number;
  alliance: "red" | "blue";
  robotPosition: 1 | 2 | 3;
  alliancePartners: [string, string];

  // Per-robot FMS data
  autoLeave: boolean;
  endGameClimb: number;            // 0-3
  autoClimb: boolean;

  // Alliance-level FMS data
  allianceFuelAuto: number;
  allianceFuelTeleop: number;
  allianceFuelTotal: number;
  allianceTowerPointsAuto: number;
  allianceTowerPointsTeleop: number;
  allianceTotalScore: number;
  opponentTotalScore: number;

  // Match outcome
  won: boolean;
  tied: boolean;

  // Ranking points (quals only)
  rpEarned: number | null;
  energizedRP: boolean | null;
  superchargedRP: boolean | null;
  traversalRP: boolean | null;

  // Penalties
  allianceFoulPoints: number;
  opponentFoulPoints: number;

  actualTime: number | null;
  pulledAt: string;
}
```

### 14.5 Pre-Scout Team Profile

```typescript
interface PreScoutTeamProfile {
  teamKey: string;
  teamNumber: number;
  teamName: string;
  city: string | null;
  stateProv: string | null;
  country: string | null;
  rookieYear: number;

  eventsAttended: number;
  totalMatchesPlayed: number;
  overallRecord: { wins: number; losses: number; ties: number };
  overallWinRate: number;

  // ===== CLIMB PROFILE =====
  climb: {
    distribution: { none: number; level1: number; level2: number; level3: number };
    totalClimbOpportunities: number;
    climbRate: number;
    level3Rate: number;
    level2PlusRate: number;
    avgClimbLevel: number;
    avgClimbLevelWhenClimbing: number;
    climbConsistency: number;       // 0-1
    mostCommonClimb: number;
    bestClimb: number;
    climbTrend: "improving" | "declining" | "stable";
    recentClimbRate: number;
    recentAvgClimb: number;
    autoClimbCount: number;
    autoClimbRate: number;
    byEvent: {
      eventKey: string;
      eventWeek: number;
      climbRate: number;
      avgClimb: number;
      distribution: { none: number; level1: number; level2: number; level3: number };
    }[];
    matchHistory: {
      matchKey: string;
      eventKey: string;
      climbLevel: number;
      wasPlayoff: boolean;
    }[];
  };

  // ===== AUTO PROFILE =====
  auto: {
    leaveRate: number;
    autoClimbRate: number;
    recentLeaveRate: number;
    autoTrend: "improving" | "declining" | "stable";
    byEvent: {
      eventKey: string;
      eventWeek: number;
      leaveRate: number;
      autoClimbRate: number;
    }[];
  };

  // ===== SCORING PROFILE =====
  scoring: {
    oprHistory: {
      eventKey: string;
      eventWeek: number;
      opr: number;
      dpr: number;
      ccwm: number;
    }[];
    bestOPR: number;
    avgOPR: number;
    recentOPR: number;
    oprTrend: "improving" | "declining" | "stable";
    avgAllianceFuelTotal: number;
    avgAllianceScore: number;
    avgWinMargin: number;
  };

  // ===== COMPETITION PROFILE =====
  competition: {
    events: PreScoutEventSummary[];
    avgQualRank: number;
    avgQualRankPercentile: number;
    bestQualRank: number;
    bestQualRankPercentile: number;
    timesPickedForPlayoffs: number;
    timesCaptain: number;
    timesFirstPick: number;
    bestPlayoffResult: string | null;
    avgPlayoffAlliance: number | null;
  };

  // ===== METADATA =====
  meta: {
    totalDataPoints: number;
    dataFreshness: string;
    profileBuiltAt: string;
    eventsIncluded: string[];
    confidence: "high" | "medium" | "low";
  };
}
```

### 14.6 Trend Detection

Robots evolve over season. A team that couldn't climb at Week 1 but hits L3 at Week 5 clearly upgraded.

```typescript
function detectTrend(
  values: number[],
  windowSize: number = 5
): "improving" | "declining" | "stable" {
  if (values.length < windowSize) return "stable";
  const overall = values.reduce((a, b) => a + b, 0) / values.length;
  const recent = values.slice(-windowSize);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const diff = recentAvg - overall;
  const threshold = overall * 0.15;  // 15% change = trend
  const recentSlope = linearSlope(recent);

  if (diff > threshold && recentSlope >= 0) return "improving";
  if (diff < -threshold && recentSlope <= 0) return "declining";
  return "stable";
}

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}
```

### 14.7 Profile Confidence

```typescript
function profileConfidence(
  totalMatches: number,
  mostRecentMatchDate: Date,
  targetEventDate: Date
): "high" | "medium" | "low" {
  const daysSinceLastMatch = (targetEventDate.getTime() - mostRecentMatchDate.getTime()) / (1000 * 60 * 60 * 24);
  if (totalMatches >= 12 && daysSinceLastMatch <= 21) return "high";
  if (totalMatches >= 6 || daysSinceLastMatch <= 14) return "medium";
  return "low";
}
```

### 14.8 Pre-Scout Queries

**"Who can climb L3 consistently?"**
```typescript
profiles.filter(p =>
  p.climb.level3Rate >= 0.6 &&
  p.climb.totalClimbOpportunities >= 6 &&
  p.climb.climbTrend !== "declining"
).sort((a, b) => b.climb.level3Rate - a.climb.level3Rate);
```

**"Who has improved the most?"**
Sort by `(lastEventOPR - firstEventOPR)` for teams with 2+ events.

**"Who always leaves in auto?"**
```typescript
profiles.filter(p => p.auto.leaveRate >= 0.90 && p.meta.totalDataPoints >= 6);
```

**"Rank all teams by alliance contribution"**
Composite score: 35% OPR, 30% climb, 10% auto, 15% consistency, 10% trend. Normalize each dimension across all teams at the event.

### 14.9 OPR-Based Fuel Estimation (Pre-Scout)

For pre-scouting, no per-robot scout data exists. Estimate fuel contribution from OPR:

```typescript
function estimateFuelFromOPR(
  teamOPR: number,
  avgClimbPoints: number,
  avgAutoLeavePoints: number
): number {
  // OPR = total contribution to alliance score
  // Subtract known per-robot components to isolate fuel contribution
  return Math.max(0, teamOPR - avgClimbPoints - avgAutoLeavePoints);
}
```

### 14.10 Caching & Storage

```
preScout/{targetEventKey}/
  meta/
    fetchPlan, lastFullSync, teamCount, profilesBuilt
  teams/{teamKey}/
    profile: PreScoutTeamProfile
    matchRecords/{matchKey}: PreScoutMatchRecord
    eventSummaries/{eventKey}: PreScoutEventSummary
  rankings/
    composite, byClimb, byOPR
  eventCache/{eventKey}/
    oprs, rankings, lastFetched
```

Completed event data never changes — cache once, done. Incremental refresh: check for NEW events since last sync, fetch only those, rebuild affected profiles.

### 14.11 When to Run

- **Initial pull**: As soon as team list is published (weeks before for Worlds)
- **Weekly refresh**: Every Monday, check for new completed events
- **Night-before**: Final pull before your event starts
- **Manual trigger**: "Refresh now" button

---

## 15. Complete Correction Pipeline

```
  Scout submits data (per-robot fuel, climb, auto, notes)
         │
         ▼
  Cross-reference check ← Uses TBA schedule (runs immediately)
  (team in match? right alliance? right position?)
         │
         ▼
  Store raw scout data → Firebase: scoutData/{match}/{team}/manual
         │
         │ ... wait for FMS data (poll TBA every 30s) ...
         │
         ▼
  FMS data arrives → Firebase: scoutData/{match}/{team}/fms
         │
         ▼
  TIER 1 OVERRIDE: Per-robot FMS replaces scout
  • climbLevel = FMS endGameRobot{N}
  • autoLeave = FMS autoLeaveRobot{N}
  (Scout values saved for accuracy reporting only)
         │
         ▼
  TIER 2 VERIFICATION: Alliance fuel check
  • Sum scout per-robot fuel → scoutTotal
  • Get FMS alliance fuel → fmsTotal
  • Compare → verdict (accurate/close/off/way_off/unusable)
  • Determine correction confidence (high/med/low)
  • Factor in over vs under asymmetry
         │
         ▼
  FUEL CORRECTION: Distribute FMS total across robots
  • High confidence:   scout proportions × FMS total
  • Medium confidence: blend scout + priors × FMS total
  • Low confidence:    priors only × FMS total (or even split)
  • Applied separately for auto and teleop
         │
         ▼
  HEALTH SCORING: Composite match quality
  • Climb: exact=100, off by 1=60, etc.
  • Auto leave: correct=100, wrong=30
  • Fuel: continuous curve based on % gap
  • Composite → tier (clean/minor/significant/unreliable)
         │
         ▼
  UPDATE PRIORS: Rebuild fuel share model for this team
  (only if correction confidence was high or medium)
         │
         ▼
  STORE FINAL → Firebase: scoutData/{match}/{team}/analysis
  {
    autoLeave: true,          // from FMS
    climbLevel: 3,            // from FMS
    fuelAuto: 4.2,            // FMS-corrected
    fuelTeleop: 11.8,         // FMS-corrected
    fuelTotal: 16.0,          // FMS-corrected
    fuelConfidence: "high",
    healthScore: 87,
    healthTier: "clean",
    scoutNotes: "...",        // pass-through
  }
```

---

## 16. Data Models

### 16.1 Analysis-Ready Match Data

```typescript
interface AnalysisMatchData {
  matchKey: string;
  teamKey: string;
  alliance: "red" | "blue";
  robotPosition: 1 | 2 | 3;

  // TIER 1: Straight from FMS
  autoLeave: boolean;
  climbLevel: number;

  // TIER 2: FMS total, scout-distributed
  fuelAuto: number;
  fuelTeleop: number;
  fuelTotal: number;
  fuelDistributionConfidence: "high" | "medium" | "low";

  // TIER 2: Straight from FMS
  allianceTotalScore: number;
  allianceFuelAuto: number;
  allianceFuelTeleop: number;
  foulPoints: number;
  rpEarned: number;

  // TIER 3: Scout only
  scoutNotes: string;
  defensePlayed: boolean;
  driverSkillRating: number;
}
```

### 16.2 Team-Match Data (All Three Versions)

```typescript
interface TeamMatchData {
  matchKey: string;
  teamKey: string;
  alliance: "red" | "blue";
  robotPosition: 1 | 2 | 3;

  manual: {
    autoLeave: boolean;
    climbLevel: number;
    fuelAuto: number;
    fuelTeleop: number;
    // ...other scouted fields
  };

  fms: {
    autoLeave: boolean;
    climbLevel: number;
    allianceFuelAuto: number;
    allianceFuelTeleop: number;
    allianceTotalScore: number;
  } | null;

  reconciled: {
    autoLeave: boolean;
    climbLevel: number;
    fuelAuto: number;
    fuelTeleop: number;
    fuelTotal: number;
    reconciliationConfidence: "high" | "medium" | "low";
    reconciliationMethod: string;
  } | null;
}
```

### 16.3 Fuel Verification Result

```typescript
interface FuelVerification {
  matchKey: string;
  alliance: "red" | "blue";
  scoutTotal: number;
  scoutByRobot: {
    robot1: { teamKey: string; fuel: number };
    robot2: { teamKey: string; fuel: number };
    robot3: { teamKey: string; fuel: number };
  };
  fmsTotal: number;
  absoluteGap: number;
  percentGap: number;
  direction: "over" | "under" | "exact";
  verdict: "accurate" | "close" | "off" | "way_off" | "unusable";
  correctedByRobot: {
    robot1: { teamKey: string; fuel: number };
    robot2: { teamKey: string; fuel: number };
    robot3: { teamKey: string; fuel: number };
  };
  correctionConfidence: "high" | "medium" | "low";
}
```

### 16.4 Scout Match Accuracy

```typescript
interface ScoutMatchAccuracy {
  matchKey: string;
  scoutId: string;
  teamKey: string;
  alliance: "red" | "blue";
  robotPosition: 1 | 2 | 3;
  climbAccuracy: {
    scoutValue: number;
    fmsValue: number;
    exact: boolean;
    offBy: number;
  };
  autoLeaveAccuracy: {
    scoutValue: boolean;
    fmsValue: boolean;
    correct: boolean;
  };
  scoutedFuelAuto: number;
  scoutedFuelTeleop: number;
  scoutedFuelTotal: number;
}
```

### 16.5 Alliance Match Accuracy

```typescript
interface AllianceMatchAccuracy {
  matchKey: string;
  alliance: "red" | "blue";
  fuelComparison: {
    scoutTotal: number;
    fmsTotal: number;
    absoluteError: number;
    percentError: number;
    direction: "over" | "under" | "exact";
  };
  towerComparison: {
    scoutTowerPoints: number;
    fmsTowerPoints: number;
    match: boolean;
  };
}
```

### 16.6 Field Health Score

```typescript
interface FieldHealthScore {
  field: string;
  score: number;
  weight: number;
  detail: string;
  scoutValue: any;
  fmsValue: any;
}
```

### 16.7 Reconciled Fuel Data

```typescript
interface ReconciledFuelData {
  robot1Fuel: number;
  robot2Fuel: number;
  robot3Fuel: number;
  fmsAllianceTotal: number;
  scoutAllianceTotal: number;
  reconciliationMethod: string;
  confidence: "high" | "medium" | "low";
}
```

### 16.8 Pre-Scout Event Summary

```typescript
interface PreScoutEventSummary {
  teamKey: string;
  eventKey: string;
  eventName: string;
  eventType: number;
  eventWeek: number;
  eventDate: string;
  qualRecord: { wins: number; losses: number; ties: number };
  qualRank: number | null;
  totalTeamsAtEvent: number;
  qualRankPercentile: number | null;
  qualMatchesPlayed: number;
  playoffMatchesPlayed: number;
  totalMatchesPlayed: number;
  climbDistribution: { none: number; level1: number; level2: number; level3: number };
  climbRate: number;
  avgClimbLevel: number;
  bestClimb: number;
  climbInAuto: number;
  autoLeaveRate: number;
  avgAllianceFuelTotal: number;
  avgAllianceScore: number;
  avgOpponentScore: number;
  avgWinMargin: number;
  opr: number | null;
  dpr: number | null;
  ccwm: number | null;
  playoffAlliance: number | null;
  playoffRole: "captain" | "pick1" | "pick2" | "backup" | null;
  playoffResult: "winner" | "finalist" | "semifinalist" | "quarterfinalist" | "eliminated_round1" | null;
  awards: { name: string; type: number }[];
}
```

### 16.9 Pre-Scout Ranking

```typescript
interface PreScoutRanking {
  teamKey: string;
  teamNumber: number;
  compositeScore: number;
  components: {
    oprScore: number;
    climbScore: number;
    autoScore: number;
    consistencyScore: number;
    trendScore: number;
  };
}
```

---

## 17. File Structure

```
src/
  features/
    tba/
      tbaApi.ts                    # Raw API client with auth, caching, ETags
      tbaFieldMap2026.ts           # Field name mapping config (UPDATE AFTER WEEK 0)
      tbaMatchSync.ts              # Polling + syncing match results post-match
      tbaTypes.ts                  # TypeScript interfaces for TBA API responses

    fmsAuthority/
      authorityRules.ts            # The hierarchy: which fields come from where
      fuelVerification.ts          # Gap check, verdict, asymmetric confidence
      fuelCorrection.ts            # Distribution logic (high/med/low confidence)
      fuelPriors.ts                # Build and maintain per-team fuel share models
      phaseCorrection.ts           # Separate auto vs teleop correction
      correctionPipeline.ts        # Full flow: scout → FMS → corrected → stored
      fmsAuthorityTypes.ts         # All interfaces

    accuracy/
      accuracyEngine.ts            # Compare scout vs FMS, produce accuracy results
      accuracyTypes.ts             # ScoutMatchAccuracy, ScoutAccuracyProfile
      reliabilityScore.ts          # Weighted scoring algorithm
      AccuracyDashboard.tsx        # Event-level scout accuracy overview
      ScoutAccuracyCard.tsx        # Per-scout drill-down
      MatchAccuracyBadge.tsx       # Inline badge on match detail

    reconciliation/
      reconcileBasic.ts            # Proportional scaling (single-match, no priors)
      reconcilePriors.ts           # Bayesian blending with multi-match history
      priorTracker.ts              # Builds and maintains TeamFuelPrior objects
      reconciliationTypes.ts       # ReconciledFuelData, TeamFuelPrior
      ReconciliationView.tsx       # Manual / FMS / reconciled side-by-side

    matchHealth/
      healthScoring.ts             # Field-level scorers + composite calculator
      healthTypes.ts               # MatchHealthReport, FieldHealthScore, tiers
      crossReferenceChecks.ts      # Pre-FMS validation against TBA schedule
      analysisExclusion.ts         # Filtering + weighting logic for aggregations
      MatchHealthBadge.tsx         # Colored badge (🟢🟡🟠🔴)
      MatchHealthDetail.tsx        # Full drill-down for flagged match
      BadMatchDashboard.tsx        # Event-level data quality overview
      ScoutQualityView.tsx         # Per-scout tied to bad match flags

    validation/
      validationEngine.ts          # Compare manual vs TBA, produce ValidationResults
      validationTypes.ts           # ValidationResult, severity enums
      ValidationBadge.tsx          # Mismatch count
      ValidationDetail.tsx         # Side-by-side comparison view

    prescout/
      prescoutFetcher.ts           # Orchestrates all TBA API calls
      prescoutFetchPlan.ts         # Builds and tracks the fetch plan
      prescoutCache.ts             # Firebase read/write for cached data
      prescoutProfileBuilder.ts    # Assembles PreScoutTeamProfile from raw records
      climbAnalysis.ts             # Climb distribution, consistency, trends
      autoAnalysis.ts              # Auto leave rates, trends
      scoringAnalysis.ts           # OPR history, scoring context
      competitionAnalysis.ts       # Rankings, playoff history, event summaries
      trendDetection.ts            # Linear regression, trend classification
      prescoutRanker.ts            # Composite ranking with configurable weights
      prescoutQueries.ts           # Pre-built queries (L3 climbers, improvers, etc.)
      prescoutTypes.ts             # All interfaces
      PreScoutDashboard.tsx        # Event overview with team table
      TeamProfileView.tsx          # Single team deep-dive
      TeamComparisonView.tsx       # Side-by-side comparison
      ClimbDistributionChart.tsx   # Stacked bar chart
      OPRTrendChart.tsx            # Line chart
      SeasonTimeline.tsx           # Horizontal event timeline
      QuickFilters.tsx             # Pre-built filter buttons

    scouting/
      dataSourceToggle.ts          # DataSourceMode state management
      DataSourceToggle.tsx         # UI toggle component
```

---

## 18. Configuration & Thresholds

All thresholds are adjustable without code changes. Store in a config object or Firebase Remote Config.

```typescript
interface SystemConfig {
  // Health scoring thresholds
  healthTierThresholds: {
    clean: 80;
    minor: 55;
    significant: 30;
  };

  // Field weights for health composite
  healthFieldWeights: {
    climb: 0.35;
    autoLeave: 0.15;
    fuel: 0.50;
  };

  // Fuel verification thresholds
  fuelVerdictThresholds: {
    accurate: 0.10;    // within 10%
    close: 0.25;       // within 25%
    off: 0.45;         // within 45%
    way_off: 0.70;     // within 70%
  };

  // Fuel leniency
  fuelLeniency: {
    undercountBuffer: 0.10;  // 10% undercount is expected (HP fuel)
  };

  // Reconciliation
  reconciliation: {
    highConfidenceBlend: { scout: 1.0, prior: 0.0 };
    mediumConfidenceBlend: { scout: 0.6, prior: 0.4 };
    maxPriorWeight: 0.7;
  };

  // Prior building
  priors: {
    minMatchesForPrior: 3;
    priorStrengthMultiplier: 0.4;  // for sigmoid
  };

  // Analysis defaults
  analysisDefaults: {
    excludeTier: "unreliable";
    weightByHealth: true;
    preferReconciled: true;
  };

  // Pre-scout ranking weights
  prescoutRankingWeights: {
    opr: 0.35;
    climb: 0.30;
    auto: 0.10;
    consistency: 0.15;
    trend: 0.10;
  };

  // Trend detection
  trendDetection: {
    windowSize: 5;
    thresholdPercent: 0.15;
  };

  // TBA polling
  polling: {
    intervalMs: 30000;          // 30 seconds
    requestSpacingMs: 100;      // 100ms between API calls
  };
}
```

---

## 19. Environment Variables

```env
VITE_TBA_API_KEY=your_tba_read_key_here
# Get at https://www.thebluealliance.com/account

# Optional: FIRST's official API
VITE_FRC_API_USERNAME=your_frc_api_username
VITE_FRC_API_AUTH_TOKEN=your_frc_api_token
# Get at https://frc-events.firstinspires.org/services/API
```

---

## 20. Implementation Priority

1. **NOW**: Pull 2026week0 or 2026mnbt match JSON from TBA → update `tbaFieldMap2026.ts` with confirmed field names
2. **Phase 1**: TBA client (`tbaApi.ts`, `tbaTypes.ts`, `tbaFieldMap2026.ts`) — test against Week 0 data
3. **Phase 2**: Match result sync (`tbaMatchSync.ts`) — post-match polling for score_breakdown
4. **Phase 3**: FMS authority pipeline — Tier 1 override, Tier 2 verification, fuel correction
5. **Phase 4**: Validation engine + health scoring — compare stored TBA vs scout entries
6. **Phase 5**: Data source toggle — global + per-field, affects analysis views
7. **Phase 6**: Pre-scout fetcher — run overnight before events, build team profiles
8. **Phase 7**: Scout accuracy reports, bad match dashboard, reconciliation UI

---

## 21. Edge Cases & Gotchas

### Hub Activity Shifts
FMS enforces active/inactive Hubs automatically. Don't model shifts in reconciliation. But be aware: scouts counting fuel during inactive shifts is a common source of overcounting.

### Human Player Fuel
FMS fuel totals include Human Player scoring. Scouts typically track robot-scored only. FMS totals will consistently be slightly higher. Be more lenient on FMS > scout gaps.

### Replayed Matches
If replayed, FMS updates in place on TBA. Your scouts have data from original play. Detect when FMS data changes for already-verified match (compare hashes). Notify user.

### No-Show Robots
FMS shows no climb and no auto leave. If scout recorded "None" and "No", they're correct. If scout recorded nothing (null), flag as "no data", not "wrong".

### FMS Data Not Yet Available
During live events, gap between scout submit and FMS arrival:
- Cross-reference checks run immediately
- Health scoring deferred — show "pending verification"
- Don't show green badges until FMS confirmed
- Store `verificationStatus: "pending" | "verified" | "fms_unavailable"`

### Upstream Data Corrections
If scouting database edits a record after health scoring:
- Change detection (hash comparison) catches it on next sync
- Re-ingest, re-run cross-reference checks and health scoring
- Re-run reconciliation if FMS data exists
- Keep version history

### Teams with No Pre-Scout History
Rookies or teams with no 2026 events get empty profiles with "No data" badge and low confidence rating. Once your event starts, live scouting builds their profile.

### Community Week 0 Events
Some do NOT use official FMS. Only official FIRST Week 0 produces real API data. Verify event uses FMS before relying on its data. Don't use Week 0 for pre-scouting profiles — just for field name calibration.

---

## 22. Week 0 Calibration Checklist

The official FIRST Week 0 completed **February 21, 2026** at Bishop Guertin, Nashua NH. Blue Twilight Week Zero at Eagan, MN also ran Feb 21-22. Both should have real FMS data.

- [ ] Pull `GET /event/2026week0/matches/keys` to see available matches
- [ ] Pull one full match: `GET /match/{match_key}` and inspect `score_breakdown`
- [ ] Confirm exact field names for per-robot climb (e.g., `endGameRobot1` vs `towerRobot1`)
- [ ] Confirm exact field names for auto leave (e.g., `autoLeaveRobot1` vs `mobilityRobot1`)
- [ ] Confirm value formats (boolean vs "Yes"/"No" vs enum strings like "Level1")
- [ ] Confirm fuel field names and whether counts vs points are available
- [ ] Confirm RP field names and boolean format
- [ ] Check if auto tower climb shows up as separate field or combined with endgame
- [ ] Check if fuel-per-shift data exists (Hub shift granularity)
- [ ] Check for any surprise fields not anticipated
- [ ] Update `TBA_FIELD_MAP_2026` config with confirmed names
- [ ] Try `2026mnbt` if `2026week0` has limited data
- [ ] Run validation engine against a few matches to verify logic

---

## Notes for AI Assistants

- This is a **React + TypeScript PWA** using **Firebase** for backend/auth
- Match schedule pull from TBA already exists — extend existing TBA API utility code, don't create duplicates
- The field name mapping is **estimated** and MUST be updated from real Week 0 data
- Fuel scoring is **alliance-level only** from FMS — never try to validate per-robot fuel against TBA
- The data source toggle should persist in local state or Firebase user prefs
- For pre-scouting, implement request queuing with 100-150ms delays between TBA calls
- Store TBA match data in separate Firebase collection from manual scouting
- FMS is always king. Scout data never overwrites FMS for Tier 1/2 fields.
- Overcounting is worse than undercounting for trusting fuel distribution
- Auto vs teleop fuel is corrected separately (different error profiles)
- Priors build over time (3+ matches minimum, strength plateaus ~6 matches)
- Pre-scout profiles must show trends (improving/declining/stable)
- Completed event data is cached forever (never changes)
