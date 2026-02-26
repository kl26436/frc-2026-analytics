# Trend Analysis System

How Data Wrangler tracks team performance trends across matches to identify improving, declining, and stable teams.

---

## Overview

The trend system compares a team's **last 3 matches** against their **overall average** to classify momentum. This powers:
- Pick list watchlist cards (Overall vs Last 3 stats)
- Pick list tier cards (trend glow: green = improving, red = declining)
- Team detail performance charts

---

## How It Works

### Per-Team Computation

For each team, `computeTeamTrend()` processes all their scout entries sorted by match number:

1. **Overall averages** — mean total points, mean auto points, and L3 climb rate across all matches
2. **Last 3 averages** — same metrics over only the most recent 3 matches
3. **Best 3 of 4** — takes the last 4 matches, drops the lowest total, averages the remaining 3 (smooths out one bad match)
4. **Delta** — percentage change: `(last3Avg - overallAvg) / overallAvg × 100`
5. **Trend classification** — based on delta:

| Delta | Classification |
|-------|---------------|
| > +10% | **Improving** |
| < −10% | **Declining** |
| −10% to +10% | **Stable** |

Teams with fewer than 3 matches are always classified as **stable** (not enough data).

### Metrics Tracked

| Metric | Description |
|--------|-------------|
| `total` | Estimated total match points (auto + teleop + endgame) |
| `auto` | Estimated auto phase points |
| `l3ClimbRate` | Percentage of matches with a Level 3 climb (0–100) |

### Match Points Estimation

Points are estimated from scout data using `estimateMatchPoints()`:
- **Auto points** = auto fuel estimate + (15 if auto climbed)
- **Teleop points** = teleop fuel estimate
- **Endgame points** = [0, 10, 20, 30] based on climb level (None, L1, L2, L3)

---

## Where Trends Appear in the UI

### Pick List — Watchlist Cards

Each watchlist card shows a side-by-side comparison:

```
                Overall    Last 3
Total Pts        45.2      52.7   ▲ +16.6%
Auto Pts         12.1      15.3   ▲ +26.4%
L3 Climb          67%       100%  ▲
```

### Pick List — Tier Cards

Teams in Steak/Potatoes/Chicken Nuggets tiers show:
- A mini sparkline of recent match totals
- A **trend glow** border effect:
  - Green glow = improving (last 3 trending up)
  - Red glow = declining (last 3 trending down)
  - No glow = stable

---

## Data Flow

```
Scout Entries ──→ computeTeamTrend(teamNumber, entries)
                     ├── matchResults[]      (per-match breakdowns)
                     ├── overallAvg          (all matches)
                     ├── last3Avg            (recent 3)
                     ├── best3of4Avg         (best 3 of last 4)
                     ├── delta               (% change)
                     └── trend               (improving / declining / stable)

computeAllTeamTrends(entries) ──→ TeamTrend[]  (stored in Zustand)
```

---

## Key Files

| File | What It Does |
|------|-------------|
| `src/utils/trendAnalysis.ts` | Core computation: `computeTeamTrend()`, `computeAllTeamTrends()` |
| `src/store/useAnalyticsStore.ts` | Calls `computeAllTeamTrends()` on data load, stores results |
| `src/pages/PickList.tsx` | Renders watchlist cards and tier cards with trend data |
| `src/pages/TeamDetail.tsx` | Shows performance trend chart |

---

## Design Decisions

### Why ±10% threshold?

- Smaller thresholds (e.g., ±5%) would flag too many teams as improving/declining due to normal match-to-match variance
- Larger thresholds (e.g., ±20%) would only catch extreme swings and miss meaningful momentum shifts
- 10% is a practical middle ground for FRC where match scores vary 15–30% naturally

### Why "Best 3 of 4"?

FRC teams occasionally have one terrible match (robot breaks, field fault, alliance partner no-show). The best 3 of 4 metric lets scouts assess a team's "ceiling when things go okay" by dropping the worst recent performance. This is particularly useful during alliance selection.

### Why scout points, not FMS-attributed points?

Trend analysis runs on scout data (`estimateMatchPoints`) rather than FMS-attributed fuel data because:
1. Scout data is available for every team regardless of TBA availability
2. Trends need to work from match 1 onward, before enough FMS data exists for reliable attribution
3. The relative direction (improving vs declining) is the same regardless of the absolute accuracy of scout estimates
