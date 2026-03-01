# 2026 REBUILT Scouting Database Spec

> **For AI assistants working on this codebase**: This document describes the full database schema for the 2026 FRC scouting system. Use it to understand how data flows from scout tablets → PostgreSQL → the app, what TBA/FMS fields are available for validation, and how 2026 differs from 2025. Drop this file in your project root.

---

## Database Connection

- **Engine**: PostgreSQL on AWS RDS
- **Database name**: `2025_148`
- **Total tables**: 35 (across `public`, `tba`, and `statbotics` schemas)

---

## 1. Scouting Data Tables (Your Data)

### 1.1 `public.summary_2026` — Primary Scouting Table

**102 rows** | One row per scout observation per robot per match.

This is the main table you'll query for 2026 analysis. Each row is what one scouter recorded about one robot in one match.

#### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `match_number` | bigint | Match number |
| `team_number` | bigint | Team being scouted |
| `year` | text | `"2026"` |
| `configured_team` | text | Alliance position: `blue_1`, `blue_2`, `blue_3`, `red_1`, `red_2`, `red_3` |
| `event_key` | text | Event identifier (e.g. `2026week0`, `2025txwac` for practice) |
| `match_key` | text | Full match key (e.g. `2026week0_qm5`, `configuredEvent_pm1` for practice) |
| `scouter_id` | text | Name of the person scouting |
| `lost_connection` | boolean | Tablet lost connection during match |
| `no_robot_on_field` | boolean | Robot was absent or disabled |
| `second_review` | boolean | Flagged for review |
| `notes` | text | Free-text scouter observations |
| `relative_driver_performance` | text | Qualitative driver skill rating |

#### Scoring Action Fields (Counts — NULL means 0)

| Field | Description |
|-------|-------------|
| `prematch_AUTON_START_ZONE_1` through `_6` | Which starting zone (1-6) the robot began in. Only one will be 1, rest NULL. |
| `auton_FUEL_SCORE` | Fuel scored into hub during auto |
| `auton_FUEL_PASS` | Fuel passed to alliance partner during auto |
| `auton_AUTON_CLIMBED` | Robot climbed tower during auto period |
| `auton_SCORE_PLUS_1` | +1 bonus action during auto |
| `auton_SCORE_PLUS_2` | +2 bonus action during auto |
| `auton_SCORE_PLUS_3` | +3 bonus action during auto |
| `auton_SCORE_PLUS_5` | +5 bonus action during auto |
| `auton_SCORE_PLUS_10` | +10 bonus action during auto |
| `teleop_FUEL_SCORE` | Fuel scored into hub during teleop |
| `teleop_FUEL_PASS` | Fuel passed to alliance partner during teleop |
| `teleop_SCORE_PLUS_1` | +1 bonus action during teleop |
| `teleop_SCORE_PLUS_2` | +2 bonus action during teleop |
| `teleop_SCORE_PLUS_3` | +3 bonus action during teleop |
| `teleop_SCORE_PLUS_5` | +5 bonus action during teleop |
| `teleop_SCORE_PLUS_10` | +10 bonus action during teleop |

#### Endgame & Qualitative Fields

| Field | Type | Description |
|-------|------|-------------|
| `climb_level` | text | Endgame result. Values seen: `"1. None"`, potentially `"Level 1"`, `"Level 2"`, `"Level 3"` |
| `teleop_climb_failed` | boolean | Attempted climb but failed |
| `dedicated_passer` | boolean | Robot acted as a fuel passer, not scorer |
| `auton_did_nothing` | boolean | Robot did not move/score in auto |
| `eff_rep_bulldozed_fuel` | boolean | Robot pushed fuel around inefficiently |
| `poor_fuel_scoring_accuracy` | boolean | Consistently missed fuel shots |

#### Important Notes for `summary_2026`

- Some rows have `event_key: "2025txwac"` with `match_key: "configuredEvent_pm*"` — these are **practice matches** run at the Waco 2025 event using the 2026 game config. Filter these separately from competition data.
- `year` is `"2026"` even for practice matches at 2025 events.
- NULL in scoring fields means 0 (not observed), not "unknown".

---

### 1.2 `public.auton_actions` — Auto Phase Events

**242 rows** | Individual timestamped actions during autonomous.

```
| Field         | Type             | Description                                    |
|---------------|------------------|------------------------------------------------|
| index         | bigint           | Row index                                      |
| x             | double precision | Field x-coordinate (0.0 if not spatial)        |
| y             | double precision | Field y-coordinate (0.0 if not spatial)        |
| time_stamp    | bigint           | Unix timestamp when scout recorded action      |
| type          | text             | Action type string                             |
| event_key     | text             | Event identifier                               |
| year          | text             | Season year                                    |
| team_number   | bigint           | Team being scouted                             |
| match_number  | bigint           | Match number                                   |
| value         | bigint           | Typically 1 (action occurred)                  |
| score         | bigint           | Running score at time of action                |
```

**2026 action types in this table**: `FUEL_SCORE`, `FUEL_PASS`, `AUTON_CLIMBED`, `SCORE_PLUS_1`, `SCORE_PLUS_2`, `SCORE_PLUS_3`, `SCORE_PLUS_5`, `SCORE_PLUS_10`

---

### 1.3 `public.teleop_actions` — Teleop Phase Events

**1,002 rows** | Same schema as `auton_actions` plus end-of-match flags.

Extra fields (populated only on the final action row for each robot/match):

| Field | Type | Description |
|-------|------|-------------|
| `auton_did_nothing` | boolean | Robot was inactive during auto |
| `eff_rep_bulldozed_fuel` | boolean | Robot pushed fuel inefficiently |
| `poor_fuel_scoring_accuracy` | boolean | Robot consistently missed shots |
| `climb_ranking` | text | Legacy 2025 field — ignore for 2026 |
| `teleop_hang_missed` | boolean | Legacy 2025 field — ignore for 2026 |
| `teleop_robot_played_defence` | boolean | Legacy 2025 field — ignore for 2026 |
| `teleop_robot_steal` | boolean | Legacy 2025 field — ignore for 2026 |

**2026 action types in this table**: `FUEL_SCORE`, `FUEL_PASS`, `SCORE_PLUS_1`, `SCORE_PLUS_2`, `SCORE_PLUS_3`, `SCORE_PLUS_5`, `SCORE_PLUS_10`

---

### 1.4 `public.prematch_actions` — Starting Zone Selection

**91 rows** | Records which starting zone each robot was placed in before the match.

Same schema as `auton_actions`. Only action types: `AUTON_START_ZONE_1` through `AUTON_START_ZONE_6`.

---

### 1.5 `public.raw_tablet_data` — Raw Tablet JSON

**439 rows** | Raw data from scout tablets before aggregation.

| Field | Type | Description |
|-------|------|-------------|
| `event_key` | text | Event identifier |
| `year` | text | Season year |
| `team_number` | bigint | Team being scouted |
| `match_number` | bigint | Match number |
| `phase` | text | `"autonomous"` or `"teleop"` |
| `scouter_id` | text | Scout name |
| `match_key` | text | Full match key |
| `configured_team` | text | Alliance position |
| `scoring` | json | Full JSON blob of all timestamped actions |
| `created_at` | date | Date the record was created |

The `scoring` JSON array contains objects like:
```json
[
  {"x": 0.0, "y": 0.0, "time_stamp": 1771697315, "type": "SCORE_PLUS_10"},
  {"x": 1011.8, "y": 530.0, "time_stamp": 1770523916, "type": "FUEL_SCORE"}
]
```

---

## 2. TBA Data — 2026 Score Breakdown Schema

### 2.1 `tba.2026week0_matches` — TBA Match Data

**186 rows** | One row per team per match from TBA API.

The key structure is `tba.score_breakdown.{red|blue}.{field}`. Here are the **confirmed 2026 field names** from Week 0:

#### Per-Robot Fields (the ones scouts can validate against)

```
tba.score_breakdown.{color}.autoTowerRobot1    -- text, per-robot auto tower climb
tba.score_breakdown.{color}.autoTowerRobot2    -- text
tba.score_breakdown.{color}.autoTowerRobot3    -- text
tba.score_breakdown.{color}.endGameTowerRobot1 -- text, per-robot endgame tower climb
tba.score_breakdown.{color}.endGameTowerRobot2 -- text
tba.score_breakdown.{color}.endGameTowerRobot3 -- text
```

**⚠️ ALL tower robot fields returned `None` at Week 0.** The enum values (Level1? Level2? Level3? None?) are unconfirmed until Week 1 events (March 4-7, 2026).

#### Hub Score Object (Alliance-Level Fuel Scoring)

```
tba.score_breakdown.{color}.hubScore.autoCount          -- bigint
tba.score_breakdown.{color}.hubScore.autoPoints         -- bigint
tba.score_breakdown.{color}.hubScore.teleopCount        -- bigint
tba.score_breakdown.{color}.hubScore.teleopPoints       -- bigint
tba.score_breakdown.{color}.hubScore.endgameCount       -- bigint
tba.score_breakdown.{color}.hubScore.endgamePoints      -- bigint
tba.score_breakdown.{color}.hubScore.shift1Count        -- bigint (teleop time window 1)
tba.score_breakdown.{color}.hubScore.shift1Points       -- bigint
tba.score_breakdown.{color}.hubScore.shift2Count        -- bigint (teleop time window 2)
tba.score_breakdown.{color}.hubScore.shift2Points       -- bigint
tba.score_breakdown.{color}.hubScore.shift3Count        -- bigint (teleop time window 3)
tba.score_breakdown.{color}.hubScore.shift3Points       -- bigint
tba.score_breakdown.{color}.hubScore.shift4Count        -- bigint (teleop time window 4)
tba.score_breakdown.{color}.hubScore.shift4Points       -- bigint
tba.score_breakdown.{color}.hubScore.transitionCount    -- bigint
tba.score_breakdown.{color}.hubScore.transitionPoints   -- bigint
tba.score_breakdown.{color}.hubScore.totalCount         -- bigint
tba.score_breakdown.{color}.hubScore.totalPoints        -- bigint
tba.score_breakdown.{color}.hubScore.uncounted          -- bigint (fuel entered but not scored)
```

**This is all alliance-level.** FMS does not know which robot scored which fuel. Per-robot fuel tracking is scouting-only.

#### Alliance Summary Fields

```
tba.score_breakdown.{color}.autoTowerPoints      -- bigint (0 at Week 0)
tba.score_breakdown.{color}.endGameTowerPoints   -- bigint (0 at Week 0)
tba.score_breakdown.{color}.totalTowerPoints     -- bigint (0 at Week 0)
tba.score_breakdown.{color}.totalAutoPoints      -- bigint ✓ working
tba.score_breakdown.{color}.totalTeleopPoints    -- bigint ✓ working
tba.score_breakdown.{color}.totalPoints          -- bigint ✓ working
tba.score_breakdown.{color}.foulPoints           -- bigint ✓ working
tba.score_breakdown.{color}.majorFoulCount       -- bigint ✓ working
tba.score_breakdown.{color}.minorFoulCount       -- bigint ✓ working
tba.score_breakdown.{color}.adjustPoints         -- bigint ✓ working
tba.score_breakdown.{color}.rp                   -- bigint ✓ working
```

#### Ranking Point Booleans

```
tba.score_breakdown.{color}.energizedAchieved    -- boolean (≥100 fuel pts)
tba.score_breakdown.{color}.superchargedAchieved -- boolean (≥360 fuel pts)
tba.score_breakdown.{color}.traversalAchieved    -- boolean (≥50 tower pts)
tba.score_breakdown.{color}.g206Penalty          -- boolean
```

#### Alliance/Team Identity Fields

```
tba.blue.1 / tba.blue.2 / tba.blue.3    -- text (e.g. "frc1768")
tba.red.1 / tba.red.2 / tba.red.3       -- text (e.g. "frc2342")
tba.alliance                              -- text ("red" or "blue")
tba.station                               -- bigint (0, 1, 2)
tba.team_number                           -- bigint
tba.team_key                              -- text (e.g. "frc1768")
```

#### Match Metadata

```
tba.key              -- text (e.g. "2026week0_f1m1")
tba.event_key        -- text (e.g. "2026week0")
tba.comp_level       -- text ("qm", "sf", "f")
tba.match_number     -- bigint
tba.set_number       -- bigint
tba.actual_time      -- bigint (unix timestamp)
tba.winning_alliance -- text ("red", "blue", "")
tba.alliances.{color}.score -- bigint (final score)
```

### 2.2 `tba.2026week0_rankings`

**29 rows** | One per team at the event.

```
tba.team_key        -- text (e.g. "frc6328")
tba.rank            -- bigint
tba.matches_played  -- bigint
tba.record.wins     -- bigint
tba.record.losses   -- bigint
tba.record.ties     -- bigint
tba.sort_orders     -- text (e.g. "{4.0,171.0,19.0,0.0,0.0,0.0}")
tba.extra_stats     -- text (e.g. "{12}")
tba.dq              -- bigint
```

---

## 3. Views (Pre-Joined Data)

### 3.1 `public.v_2026week0_matches` — The Main Analysis View

**186 rows** | LEFT JOIN of TBA match data + scouting data + statbotics.

This view contains ALL columns from:
1. `tba.2026week0_matches` (all TBA score_breakdown fields)
2. `public.summary_2026` (all scouting fields)
3. `statbotics.matches` (predictions, results — **all NULL for 2026 currently**)

**Join logic**: TBA rows always appear. Scouting fields are NULL when no scout data exists for that team/match combo. At Week 0, all scouting fields are NULL because Team 148 was not scouting.

**Use this view** when you want to compare TBA data against scouting observations for the same team in the same match.

### 3.2 `public.v_2026week0_stats` — Per-Team Aggregated Stats

**29 rows** | One per team, combining scouting aggregates + TBA rankings.

Scouting aggregates (from `summary_2026`):
```
Average/Max/Min/Sum Auton Start Zone 1-6
Average/Max/Min/Sum Auton Fuel Score
Average/Max/Min/Sum Auton Fuel Pass
Average/Max/Min/Sum Teleop Fuel Score
Average/Max/Min/Sum Teleop Fuel Pass
Sum Auton Climbed
Sum Teleop Hang Missed
Sum Auton Did Nothing
Sum Teleop Effective Bulldozed Fuel
Sum Poor Fuel Scoring Accuracy
Telop Level 1 / Teleop Level 2 / Teleop Level 3 / Teleop No Climb
```

TBA ranking fields (from `tba.2026week0_rankings`):
```
tba.rank, tba.matches_played, tba.record.wins/losses/ties, tba.sort_orders
```

---

## 4. Statbotics Data

### 4.1 `statbotics.team_events` — EPA Ratings

**198 rows** | Statbotics EPA (Expected Points Added) ratings per team per event.

Contains detailed EPA breakdowns including `total_points.mean`, `auto_points`, `teleop_points`, `endgame_points`, and game-specific breakdowns. **Currently only has 2025 Reefscape data** (coral_l1-4, processor_algae, net_algae, barge_points, etc.).

**⚠️ Statbotics has NOT indexed 2026 yet.** All statbotics fields in `v_2026week0_matches` are NULL. The EPA breakdown fields will likely change once Statbotics adds 2026 game support. When that happens, expect fields like fuel-related EPA components instead of the current coral/algae ones.

### 4.2 `statbotics.matches` — Match Predictions & Results

**422 rows** | Match-level predictions (win probability, predicted scores) and actual results. Same situation — only 2025 data currently populating.

---

## 5. Validation Mapping: TBA vs Scouting

When building the validation/comparison engine, here's what can be cross-referenced:

### ✅ TBA Authoritative (use as ground truth)
- **RPs**: `energizedAchieved`, `superchargedAchieved`, `traversalAchieved`
- **Fouls**: `majorFoulCount`, `minorFoulCount`, `foulPoints`
- **Total Score**: `totalPoints`

### 🟡 Partial Validation Possible
- **Tower Climb**: TBA `endGameTowerRobot{N}` vs scout `climb_level` — per-robot from both sources, but TBA values are unconfirmed (all None at Week 0)
- **Fuel Scoring**: TBA `hubScore.totalCount` is alliance-level. Sum of 3 scouts' (`auton_FUEL_SCORE` + `teleop_FUEL_SCORE` + all `SCORE_PLUS_*`) should approximate it. Can flag scouts whose totals are way off.

### ❌ Scout-Only (no TBA equivalent)
- **Auto Mobility / Starting Zone**: `prematch_AUTON_START_ZONE_*`, `auton_did_nothing` — FMS does NOT track auto mobility in 2026 (no `autoLineRobot` field)
- **Fuel Passing**: `FUEL_PASS` — FMS only knows fuel that enters the hub, not who passed it
- **Per-Robot Fuel Breakdown**: Which robot scored how much fuel — FMS only has alliance totals
- **Qualitative Flags**: `eff_rep_bulldozed_fuel`, `poor_fuel_scoring_accuracy`, `dedicated_passer`

### Timestamp Cross-Reference Opportunity

Scout actions in `auton_actions` and `teleop_actions` have `time_stamp` fields. TBA's `hubScore.shift1-4` breaks fuel scoring into time windows. You could correlate scout timestamps against shift periods to verify scouts are accurately tracking when scoring happens.

---

## 6. Key Differences from 2025 (Reefscape)

If the codebase has 2025 logic, here's what changed for 2026:

| Category | 2025 (Reefscape) | 2026 (REBUILT) |
|----------|-------------------|----------------|
| **Game pieces** | Coral (4 levels) + Algae (net/processor) | Fuel (hub) + bonus multipliers |
| **Scout scoring fields** | `CORAL_SCORE_LEVEL_1/2_AND_3/4`, `ALGAE_NET_SCORE`, `ALGAE_PROCESS` | `FUEL_SCORE`, `FUEL_PASS`, `SCORE_PLUS_1/2/3/5/10` |
| **Scout error fields** | `CORAL_DROPPED/MISSED`, `ALGAE_DROPPED/MISSED` | `eff_rep_bulldozed_fuel`, `poor_fuel_scoring_accuracy` |
| **Auto mobility** | `auton_AUTON_LEFT_POSITION` (scout) + `autoLineRobot{N}` (TBA) | `prematch_AUTON_START_ZONE_1-6` + `auton_did_nothing` (scout ONLY, no TBA) |
| **Endgame** | `climb_level` + `endGameRobot{N}` (DeepCage/ShallowCage/Parked/None) | `climb_level` + `endGameTowerRobot{N}` (values TBD) |
| **TBA scoring detail** | 144 reef node booleans (botRow/midRow/topRow × 12 nodes) | `hubScore` object with phase + shift breakdowns |
| **TBA RPs** | `autoBonusAchieved`, `bargeBonusAchieved`, `coralBonusAchieved` | `energizedAchieved`, `superchargedAchieved`, `traversalAchieved` |
| **Statbotics EPA** | coral_l1-4, processor/net_algae, barge_points | Not yet available |

---

## 7. Implementation Notes

### Data Flow
```
Scout tablets → raw_tablet_data (JSON) → auton_actions / teleop_actions / prematch_actions → summary_2026
TBA API → tba.2026week0_matches, tba.2026week0_rankings
Statbotics API → statbotics.matches, statbotics.team_events
Views → v_2026week0_matches (all three joined), v_2026week0_stats (aggregated)
```

### Filtering 2026 Data
- Use `year = '2026'` on scouting tables
- Practice matches: `match_key LIKE 'configuredEvent_pm%'`
- Competition matches: `event_key = '2026week0'` (or future event keys)
- When querying `summary_2026`, be aware it contains BOTH practice and competition data

### Event Key Pattern for 2026
- Week 0: `2026week0`
- Regular season: `2026{regioncode}` (e.g., `2026txwac`, `2026txpla`, etc.)
- The app already pulls match schedules from TBA, so look for existing TBA API utility code and extend it

### NULL Handling
- In `summary_2026`, NULL scoring fields = 0 (not observed). Use `COALESCE(field, 0)` in queries.
- In views, NULL scouting fields = no scout data exists for that team/match. Don't COALESCE these — the NULL is meaningful (means nobody scouted it).

### What to Build for Week 1 (March 4-7)
1. Confirm `endGameTowerRobot{N}` values are populated and capture the enum strings
2. Confirm `autoTowerRobot{N}` values
3. Map `SCORE_PLUS_*` to specific game mechanics
4. Check if Statbotics has started indexing 2026
5. Run first validation pass: scout `climb_level` vs TBA `endGameTowerRobot`
6. Run first fuel sanity check: sum of 3 scouts' fuel vs TBA `hubScore.totalCount`

---

## 8. Existing Database Patterns to Follow

The database already has this pattern for 2025 events:
- Per-event TBA tables: `tba.2025txwac_matches`, `tba.2025txwac_rankings`, etc.
- Per-event views: `v_2025txwac_matches`, `v_2025txwac_stats`
- Shared scouting tables: `summary_2025` (all events), action tables (all events, filter by `event_key`)

For 2026, follow the same pattern:
- New events get their own `tba.{event_key}_matches` and `tba.{event_key}_rankings` tables
- New views `v_{event_key}_matches` and `v_{event_key}_stats` JOIN everything together
- Scouting data goes into the shared `summary_2026` and action tables with `event_key` filtering
