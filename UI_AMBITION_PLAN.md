# UI Ambition Plan — Strategist's Console

## For Claude Code — April 30, 2026

---

## ⚠️ Math Conventions (read first, every time)

This plan has previously prescribed metrics that silently broke point math
across pages. Before touching anything that displays a point value, ball
count, fuel estimate, or score-comparison, **read `CLAUDE.md` "Point
Calculation Models" first.** The rules below are the short version.

**Two scoring models** exist and are NOT interchangeable:

| Model | What it returns | When it fires |
|---|---|---|
| **Scout estimate** (`estimateMatchPoints`) | 1 ball scored = 1 pt + climb | Pre-scout always; live before FMS sync |
| **FMS attribution** (`matchFuelAttribution[]`) | Real game points (with tower/multipliers) split across alliance | Live entries after sync |

Live FMS attributions can be **2–3× higher** than scout estimate for the
same robot because the actual 2026 game has tower/multiplier scoring scouts
don't tally directly. Mixing the two on the same page creates contradictions
like "274 pts/match" in a banner above a table averaging "403 pts/match."

**Rules for any feature in this plan:**

1. **Total points per match** — always read `teamStats.avgTotalPoints` (already
   FMS-first / scout-fallback merged in the analytics store). NEVER sum
   `avgAutoFuelEstimate + avgTeleopFuelEstimate` — those are raw balls
   touched, not points.
2. **"Scored" columns** — show actual scored ball counts via
   `entry.{auton,teleop}_FUEL_SCORE` or `actionFuel.{auto,teleop}Shots`.
   NEVER show `fuel.{auto,teleop}` from `estimateMatchFuel` under a
   "Scored" header — that's balls **touched** (scored + passed).
3. **Per-match points** — use the `matchData[i].points` ladder in
   `TeamDetail.tsx` (FMS-first via `matchFuelAttribution.find`,
   `estimateMatchPoints` fallback). Never call `estimateMatchPoints` directly
   for a "points" display when FMS attribution might be available.
4. **Cross-source comparisons** — always use scout-estimate
   (`estimateMatchPoints(e).total`) on **both** sides. Mixing FMS attribution
   into one side and scout estimate into the other produces both structural
   bias AND toggle-dependent results — `matchFuelAttribution` is cleared
   when the user flips to "pre-scout-only" mode, so any comparison that
   reads it will silently give a different answer when the toggle changes.
   Banner percentages must be toggle-independent.
5. **2026 has no "Bonus +N" scoring.** `SCORE_PLUS_N` are scout shortcut
   buttons (one tap = N balls scored), not point multipliers.
   `avgAutoPlus20` / `avgTeleopPlus20` are tap-count totals, not points.
   Don't surface them as bonuses.
6. **2026 has no teleop tower.** Auto and endgame have tower scoring;
   teleop does not. The store merge correctly omits teleop tower.
7. **Pre-scout is only allowed on three pages:** Predictions, Team List,
   Team Details. Everywhere else (picklist, dashboard, alliance selection,
   AI insights, match schedule, etc.) must consume
   `liveOnlyTeamStatistics`. Per-user pre-scout toggles cannot leak into
   shared views.

If a feature in this plan calls for a metric that conflicts with these
rules, **fix the plan first**, then implement.

---

## Context

`UI_CLEANUP_PLAN.md` shipped — Dashboard is mode-aware, the playoff bracket has connector lines, the alliance highlight syncs across users, the nav is flatter, the admin page is reorganized. The app is no longer clunky.

This plan is the next layer: turn the app from a polished stats viewer into a **strategist's console**. The features here are what people see at the alliance station and ask "what app are you using?". They are not safe to ship during a live event — every phase here is post-event work.

**Goal:** by the time we deploy this for the next event, the Dashboard is a strategy console (not a status page), the Teams list reads at a glance, Team Detail answers questions instead of just displaying numbers, and power-user features (Cmd+K, hover previews) make the app feel native to a control room.

---

## Architecture decisions

1. **One new state surface: watchlist.** A persisted set of pinned team numbers, scoped per-user, surfacing across Dashboard, Teams, Team Detail, and PickList. Stored in Firestore so it syncs across devices for the same user.
2. **No new analytics calculations.** Everything reuses `TeamStatistics`, `TeamFuelStats`, `TeamTrends`, and existing `predictionInputs`. The bad-ass tier is presentational — we surface what we already compute, just in much better ways.
3. **Heuristic helpers are pure functions.** `characterizeTeam()`, `buildOpponentBriefing()`, `assessThreat()` are pure functions in `src/utils/strategicInsights.ts`. Easy to unit-test, no React/Firestore coupling.
4. **All Recharts.** Sparklines, heat-map strips, charts use the existing Recharts setup — no new chart library.
5. **Dev-first deploy** continues to apply. See `PRESCOUT_NEWTON_PLAN.md` Phase -1 for the multi-site hosting setup if the dev hosting site needs revisiting.

---

# Phase 1 — Foundation Infrastructure (~90 min)

**Why first:** Several later phases depend on these primitives. Build them once, use everywhere.

### 1.1 Watchlist state — `src/store/useWatchlistStore.ts`

```typescript
interface WatchlistState {
  pinnedTeams: number[];                  // ordered, most-recent-first
  pinTeam: (n: number) => void;
  unpinTeam: (n: number) => void;
  togglePin: (n: number) => void;
  isPinned: (n: number) => boolean;
  reorder: (from: number, to: number) => void;
  subscribeToWatchlist: () => void;
  unsubscribeFromWatchlist: () => void;
}
```

Persisted to Firestore at `userPrefs/{uid}/watchlist` (single doc, just the array). Synced via `onSnapshot` so a pin on phone shows up on laptop. localStorage fallback for offline.

### 1.2 Last-visit tracking — `src/utils/lastVisit.ts`

```typescript
export function recordVisit(): void;                // called on Dashboard mount
export function getLastVisitSnapshot(): VisitSnapshot | null;
export function diffSinceLastVisit(current: AppSnapshot): VisitDiff;

interface VisitSnapshot {
  timestamp: number;
  homeRank: number | null;
  matchesPlayedCount: number;
  topTeamNumbers: number[];   // top-5 by total points
}

interface VisitDiff {
  matchesPlayed: number;          // since last visit
  homeRankDelta: number;          // negative = improved
  newTopTeams: number[];          // teams that newly entered top-5
  notableMatches: TBAMatch[];     // matches with home or with surprises
}
```

localStorage-backed. Snapshot taken on Dashboard mount, replaced on next mount.

### 1.3 Strategic insights helpers — `src/utils/strategicInsights.ts`

Pure functions that synthesize existing analytics into strategy-grade insights.

```typescript
// "Aggressive scorer · weak L2 climbs · plays defense in late teleop"
export function characterizeTeam(
  stats: TeamStatistics,
  trends: TeamTrend,
  fuelStats?: TeamFuelStats,
): string;

// "Q49: vs A6 (climbers, weak auto). Climb success 75%, auto avg 22 (low)."
export function buildOpponentBriefing(
  opponentTeams: number[],
  allStats: TeamStatistics[],
  allTrends: TeamTrend[],
): { headline: string; bullets: string[] };

// Threats are teams beating us at our own strengths
export function assessThreat(
  homeStats: TeamStatistics,
  candidateStats: TeamStatistics[],
): Array<{ team: number; metric: string; delta: number; danger: 'high' | 'medium' | 'low' }>;

// Top movers in rank over last N matches
export function topMovers(
  trends: TeamTrend[],
  windowMatches: number,
): { climbing: TeamTrend[]; falling: TeamTrend[] };

// "Watch for" bullets per opposing alliance: 4 lines max
export function buildWatchForList(
  redTeams: number[],
  blueTeams: number[],
  allStats: TeamStatistics[],
  allTrends: TeamTrend[],
): string[];
```

Heuristics for `characterizeTeam`:
- Score buckets: > field 75th = "aggressive scorer", < 25th = "low scorer", 25-75 = no mention
- Climb: > 70% climb success → "reliable climber"; < 30% → "rarely climbs"
- Defense: `played_defense` true in > 30% of matches → "plays defense"
- Reliability: lost connection or no_robot_on_field > 15% → "unreliable"
- Trend: delta > +15% → "trending up"; < -15% → "trending down"
- Auto: > field 75th → "strong auto"; < 25th → "weak auto"

Combine 2-3 traits, oxford-comma-separated. Capped at ~50 chars for inline use.

### 1.4 Sparkline helper — `src/components/Sparkline.tsx`

Tiny reusable line chart component. ~60 lines.

```typescript
interface SparklineProps {
  data: number[];          // sequence of match scores
  width?: number;          // default 60
  height?: number;         // default 16
  trendColor?: 'auto' | 'success' | 'danger' | 'neutral';  // 'auto' colors based on slope
}
```

Recharts `<LineChart>` with no axes, no tooltip, just the line. `trendColor='auto'` computes simple linear regression slope and colors green/red/gray.

### File touch list (Phase 1)

- `src/store/useWatchlistStore.ts` (new, ~80 lines)
- `src/utils/lastVisit.ts` (new, ~60 lines)
- `src/utils/strategicInsights.ts` (new, ~200 lines)
- `src/utils/strategicInsights.test.ts` (new, ~150 lines — heuristics need tests)
- `src/components/Sparkline.tsx` (new, ~60 lines)
- `firestore.rules` — allow read/write on `userPrefs/{uid}/watchlist` for owner only

### Acceptance criteria

- Pin a team on phone → unpin on laptop within 1s. Changes reflect across devices for the same user.
- `recordVisit()` followed by `diffSinceLastVisit()` correctly reports matches played, rank deltas, and notable matches.
- `characterizeTeam` produces 2-3 distinct trait phrases for known teams (sample 3-5 from the data and check the output reads correctly).
- `<Sparkline />` renders inline at 60×16px without overflowing the row.
- Tests pass for all heuristic helpers.

---

# Phase 2 — Teams Page Transformation (~5 hrs)

**Why this matters:** The Teams list is glanced at constantly during alliance selection and match prep. Today it's a competent table. After this phase it's a strategy weapon.

### 2.1 Percentile heat-map cells (~75 min)

Every numeric cell in the table tinted by percentile vs the field. Clear visual hierarchy without reading numbers.

**Implementation:**

1. Compute percentile rank per metric across the field, once per render. Add to `metricCache` (already exists in `TeamList.tsx` line 78-80).
2. Map percentile → background color using a 5-stop scale:
   - 0-20%: `#FCEBEB` (red 50 — weak)
   - 20-40%: `#FAEEDA` (amber 50 — below avg)
   - 40-60%: `var(--color-background-secondary)` (gray — average)
   - 60-80%: `#EAF3DE` (green 50 — above avg)
   - 80-100%: `#C0DD97` (green 100 — top)
3. Apply via inline style on each `<td>`. Text stays readable: dark on light backgrounds.

```typescript
function percentileTint(p: number): string {
  if (p < 0.2) return '#FCEBEB';
  if (p < 0.4) return '#FAEEDA';
  if (p < 0.6) return 'var(--surface-elevated)';
  if (p < 0.8) return '#EAF3DE';
  return '#C0DD97';
}

// In the table cell render:
<td style={{ backgroundColor: percentileTint(metricCache[t.teamNumber][col.key].percentile) }}>
  {formatMetricValue(value, col.format)}
</td>
```

4. **Settings toggle:** add a "Color by percentile" toggle in the table toolbar (default on). Some users may prefer the plain numeric view for export purposes.

### 2.2 Inline sparklines per row (~75 min)

A 60×16px sparkline of recent match total points in each row, between team-number and stat columns.

**Implementation:**

1. Add a `<Sparkline />` cell to the table layout (and the card view).
2. Data: take `teamTrends.find(t => t.teamNumber === N).matchResults` (already in store), map to `[totalPoints, totalPoints, ...]`.
3. Color the line:
   - Green if last 3 matches are above the team's overall avg
   - Red if below
   - Gray otherwise
4. Reuse the same `<Sparkline trendColor="auto" />` component from Phase 1.

### 2.3 Smart filter chips (~60 min)

A row of preset filter pills above the table. One click applies a filter+sort combination.

**Chips:**

| Chip | What it does |
|---|---|
| All | Default state, no filter |
| Top scorers | Sort by `avgTotalPoints` desc, no filter |
| Climbers | Filter `climbSuccessRate > 0.7`, sort by `avgEndgamePoints` desc |
| Defenders | Filter `playedDefenseRate > 0.3` |
| Hot streaks | Filter `trend.delta > 5 && matchResults.length >= 6`, sort by `delta` desc |
| Inconsistent | Filter `stdTotalPoints / avgTotalPoints > 0.4` |
| Reliable | Filter `connectionLossRate < 0.05 && noRobotRate < 0.05`, sort by `avgTotalPoints` desc |
| Pinned | Filter to `useWatchlistStore.pinnedTeams` |

Render as horizontal pill buttons. Active chip highlighted. Clicking a chip replaces all current sort criteria with the chip's preset.

### 2.4 Pin teams to top (~45 min)

Star icon in each row toggles team into watchlist. Pinned teams render at the top of the table regardless of sort.

**Implementation:**

1. Star button in the leftmost or rightmost column. Filled = pinned, outline = unpinned.
2. In the rendered row order, sort: pinned teams first (in pin order), then unpinned per active sort criteria.
3. Visual divider line between pinned and unpinned sections.

### 2.5 Quick-add to picklist (~30 min)

Plus icon in each row toggles team into the active picklist tier 1 (or last-edited tier).

**Implementation:**

1. Plus button in row controls.
2. On click, calls `usePickListStore.addToTier(teamNumber, tierKey)`.
3. Toast notification: "1234 added to Round 1 picks" (use a small inline toast, not a global system).

### File touch list (Phase 2)

- `src/pages/TeamList.tsx` — add percentile, sparklines, filter chips, pin column, picklist column
- `src/components/PercentileChip.tsx` (new, optional — if extracting the tinted cell logic)
- `src/components/FilterChips.tsx` (new, ~80 lines)

### Acceptance criteria

- Heat-map cells visibly distinguish top/middle/bottom of field at a glance
- Sparklines render in every row without breaking the row height
- Each filter chip visibly changes the rendered teams within 100ms (no extra fetch)
- Pin a team → it appears at top of list, persists across reloads
- Quick-add to picklist works from any sort state, doesn't require navigation

---

# Phase 3 — Team Detail Transformation (~5 hrs)

**Why this matters:** TeamDetail is where strategists go to research a candidate. Today it shows the data. After this phase it answers questions.

### 3.1 Hero stats with rank badges (~45 min)

Every metric in the page header shows its rank in the field.

**Before:** `Avg score: 142`
**After:** `Avg score: 142  ⓘ #4 of 75`

Rank chip is small, with a colored background based on percentile (top 25% green, middle gray, bottom 25% amber).

**Implementation:**

1. Compute rank-by-metric using `teamStatistics` and the metric being displayed.
2. Render `<RankBadge rank={4} of={75} />` next to each headline number.
3. Reuse percentile tint logic from Phase 2.1.

### 3.2 Match heat-map strip (~75 min)

A horizontal strip of colored cells, one per match the team played. Quick visual season summary.

**Layout:**
```
Q1   Q4   Q11  Q19  Q23  Q28  Q35  Q42  Q47  ...
[██] [██] [██] [▒▒] [██] [██] [██] [▒▒] [██]
```

Colors:
- Green (success-shade) — match scored above team avg
- Gray — within ±15% of avg
- Amber — below avg
- Red 100 — catastrophic (lost connection, no robot, very low score)
- Hover: tooltip with match label, score, climb, notes

**Implementation:**

1. Compute classification per match using `scoutEntries` (filtered to this team) + `estimateMatchPoints()`.
2. Render as a flex row of 12×24px cells with 2px gap.
3. Tooltip on hover with `MatchDetailModal`-style mini summary.
4. Click navigates to `/replay/{matchKey}`.

Use SVG for cleanest rendering.

### 3.3 Trend badges with reasoning (~60 min)

Replace the existing trend indicator with a richer chip that explains the trend.

**Examples:**
- `↑ Improving · +18% over last 5 matches`
- `↓ Declining · lost connection 3/4 recent`
- `→ Consistent · σ/μ < 15%`
- `⚠ Volatile · big swings between strong and weak`

**Implementation:**

1. Add `analyzeTrend(team, scoutEntries, trends)` to `strategicInsights.ts`. Returns `{ direction, magnitude, reasoning }`.
2. Render as a pill at the top of TeamDetail.
3. Click expands to a small chart showing the trend.

### 3.4 Defense effectiveness analysis (~75 min)

For teams that play defense, compute the impact: when this team played defense, what was the opponent score delta vs their non-defended-by-this-team average?

**Implementation:**

1. Filter the team's scout entries to ones where `played_defense === true`.
2. For each such match, find the opposing alliance's per-team scores (from FMS attribution or scout estimates).
3. Compute their delta vs their season average.
4. Aggregate: "When 4400 played defense, opponents scored 23% below their average (n=4 matches)."
5. Render as a callout card in TeamDetail when `playedDefenseRate > 0.2`. Hide for non-defenders.

This is the differentiator between teams who are listed as defenders and teams who are *effective* defenders.

### 3.5 Pre-scout vs Newton delta hero callout (~45 min)

If the team has both pre-scout and live data (i.e., `PRESCOUT_NEWTON_PLAN.md` is implemented and they've played both), surface the delta prominently.

**Examples:**
```
Performing 18% above district level
  Pre-scout (2026mrcmp, 8m): 142 pts/match
  Newton (3m):                168 pts/match
```

**Implementation:**

1. Check if team has both `_source: 'pre-scout'` and `_source: 'live'` entries.
2. Compute average match points for each set.
3. Compute delta as percentage.
4. Render as a banner above the standard hero stats. Color: green if positive delta > 10%, amber if negative delta > 10%, gray otherwise.

This builds on Phase 4 of `PRESCOUT_NEWTON_PLAN.md`.

### 3.6 Compare-to-partners inline callout (~45 min)

When viewing a team, if they have an upcoming match, show their next-match alliance partners' stats inline as a small comparison card.

**Layout:**
```
Next match Q49 · You partner with 3005, 1540
                         148 (you)   3005       1540
  Avg total              168         142        128
  Climb success          80%         60%        85%
  Auto avg               28          24         18
  Reliability            ✓           ✓          ⚠ 2 conn losses
```

Saves jumping between TeamDetail pages to compare prospective partners.

### 3.7 Failure mode breakdown chart (~30 min)

Donut chart on TeamDetail showing the % of matches that went sideways for each failure mode: lost connection, no robot on field, climb failed, did nothing, poor accuracy. Renders only if any failure modes are present.

### 3.8 Auto consistency + climb success mini charts (~45 min)

Two small inline charts:
- **Auto bar chart** — per-match auto score, color-coded (green if above team avg, red below). Shows variance at a glance.
- **Climb success matrix** — small grid: rows are match numbers, cells are colored squares for None/L1/L2/L3 outcomes. Shows trend in climb attempts.

### File touch list (Phase 3)

- `src/pages/TeamDetail.tsx` — add rank badges, heatmap, richer trend, defense callout, prescout delta, partner compare, failure modes, auto/climb charts
- `src/components/RankBadge.tsx` (new, ~30 lines)
- `src/components/MatchHeatmapStrip.tsx` (new, ~120 lines)
- `src/components/TrendChip.tsx` (new, ~60 lines)
- `src/components/DefenseEffectivenessCard.tsx` (new, ~80 lines)
- `src/components/PartnerComparisonCard.tsx` (new, ~80 lines)
- `src/components/FailureModeChart.tsx` (new, ~50 lines)
- `src/components/AutoConsistencyChart.tsx` (new, ~60 lines)
- `src/components/ClimbMatrix.tsx` (new, ~50 lines)
- `src/utils/strategicInsights.ts` — add `analyzeTrend`, `computeDefenseImpact`, `computeFailureBreakdown`

### Acceptance criteria

- Rank badges visible on all hero metrics, color-coded sensibly
- Match heat-map strip shows full season at a glance, hover shows match details
- Trend badge text reads naturally (run on 5 sample teams, verify the reasoning is sensible)
- Defense effectiveness card appears only for defender-type teams, with non-zero impact data
- Pre-scout delta callout appears only when both data sources exist; correctly hides otherwise

---

# Phase 3.5 — Team Detail Reorganization (~3 hrs) 🟡 BETWEEN MATCHES

**Why this exists:** Phase 3 added eight valuable new sections to TeamDetail. Each is good individually. Stacked vertically with no hierarchy, the page became a 12-section endless scroll that reads as a step back from the pre-Phase-3 page. Especially bad with low-data teams (3 matches): half the visualizations render near-empty (3 bars in the auto chart, mostly-empty climb matrix, 3-cell heatmap dwarfed by its legend) and the page looks like a ghost town.

This phase reorganizes — doesn't remove — the Phase 3 features into a tabbed surface, fixes the hero block, and adds proper empty-state handling. **No new features, no removed features. Just structure.**

### 3.5.1 Add tab navigation (~75 min)

Split the current 900-line page into 4 tabs.

```
┌─ Header: 2910 · Jack in the Bot · TrendChip ──────┐
│  Overview │ Performance │ Match History │ Notes   │
└────────────────────────────────────────────────────┘
```

**Overview tab** (default — answers "how good is this team at scoring and passing?"):
- Pre-scout vs Newton delta banner (if applicable)
- Hero block: 3 summary cards (scoring + passing focus) + match heatmap immediately below them as one unit
- **Scoring breakdown panel** — auto vs teleop split for fuel scored and fuel passed, plus endgame distribution. This is the new focal content below the hero.
- Climb summary (small inline strip — None/L1/L2/L3/Failed counts)

**Performance tab** (deeper analytics + match-prep utilities):
- Match performance trend chart (line chart, currently buried at bottom of page)
- Failure mode breakdown (if any failures exist)
- Auto consistency chart
- Climb matrix
- Partner comparison card (if next match exists) — moved from Overview
- Defense effectiveness card (if defender) — moved from Overview
- Scouting totals (raw counts) — collapsed by default

**Match History tab:**
- Live matches table
- Pre-scout matches by event
- DataSourceToggle lives here — naturally belongs since this tab is the one most affected by the toggle

**Notes tab:**
- Pit scout entry
- Ninja notes
- Robot photos

**Why partner comparison + defense effectiveness move to Performance:** They're answers to specific questions ("who am I playing with next match?" and "is this team an effective defender?") that don't apply to every viewer or every visit. Overview should be the universal "what kind of team is this?" surface. Partner comparison especially is a match-prep tool — it lives more naturally next to the failure modes and per-match charts.

**Implementation:** simple tab state in TeamDetail.tsx component. Persist active tab to URL query param (`?tab=performance`) for deep-linking. No external library needed.

```typescript
const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'history' | 'notes'>(
  (searchParams.get('tab') as any) || 'overview'
);
```

Default to Overview. ESC key closes any expanded section. Each tab is keyboard-accessible.

### 3.5.2 Fix the hero block — scoring + passing focus (~45 min)

Current hero: 4 summary cards each with a different `border-l-4` color. One of them ("Total Fuel") renders 3 numbers in a Min-Avg-Max layout that doesn't match the others. Avg Endgame appears as 0.0 for many teams — burns hero real estate on a number that's frequently zero. Avg Auto sits in an orphan card at the bottom of the page (line 484, code comment admits the workaround).

**Changes:**

1. **Drop the 4 `border-l-4` colors.** Pick one accent or none. Recommend none — let the rank badge color do the semantic work.

2. **Replace 4 cards with 3 cards focused on scoring + passing.** Drop "Matches Played" — move that count to a small badge in the header next to the team name (`2910 · 3 matches`). Drop the Min-Avg-Max layout from "Total Fuel" — too busy. Drop "Avg Endgame Pts" from the hero — high zero-rate makes it a wasted slot for many teams; move to scoring breakdown panel below.

3. **New 3-card hero — Scoring, Passing, Auto. Period.** These are the three things that matter for evaluating a robot.

   - **Avg Score** · 367.2 · #2/75 — total points scored per match (headline metric)
   - **Avg Auto** · 81.4 · #2/75 — auto-period points per match (was the orphan card at line 484, now in hero)
   - **Avg Passes** · 38.4 · #6/75 — fuel passed to teammates per match

   Unified card format: label + single big number + `<RankBadge />`. Same chrome on all 3.

4. **Reliability chip prominently in the header.** Reliability is the sniff-test for "is this robot worth talking about at all?" Surface it as a colored chip next to the team name, between the team name and the trend chip:

   ```
   2910 · Jack in the Bot   [✓ Reliable]   [Consistent · σ/μ 13%]
   ```

   States:
   - ✓ Reliable (green) — 0 catastrophic flags across all matches (no_robot_on_field, lost_connection, auton_did_nothing all false)
   - ⚠ 1-2 issues (amber) — small number of disconnects/no-shows, "1 conn loss" or "2 no-shows" etc.
   - ⚠ Unreliable (red) — > 20% of matches had a catastrophic flag

   Tap/click expands a small popover with the breakdown ("3 matches · 0 conn losses · 0 no-shows · 0 did-nothings").

   **Implementation:** new `<ReliabilityChip />` component, ~50 lines. Computes from `teamStats` failure counts. The "if they can't score or pass they aren't useful" gut-check is encoded in this chip.

5. **Below the hero — scoring breakdown panel (the new focal content below hero + heatmap):**

   ```
   ┌─ Scoring breakdown ──────────────────────────────────────────┐
   │                                                                │
   │  AUTO                              TELEOP                      │
   │  Fuel scored    62.4   #2 of 75   Fuel scored   80.2  #3 of 75 │
   │  Fuel passed     8.1   #5 of 75   Fuel passed   30.3  #7 of 75 │
   │  Mid-field      8/12   67%        Bonus +20      2.3/m         │
   │  Bonus +20       1.0/m             ·                           │
   │                                                                │
   │  Endgame · climbs in 0/3 matches · 0.0 pts avg                │
   └────────────────────────────────────────────────────────────────┘
   ```

   - 2-column auto vs teleop layout for fuel scored / passed / bonus buckets — these are the analytical guts of a "good robot"
   - **Mid-field auto rate** is part of the auto detail (uses `teamStats.centerFieldAutoCount` already in store) — crossing to mid-field is a meaningful auto capability signal that distinguishes aggressive autos from stay-in-zone autos
   - Endgame demoted to a single muted line at the bottom (per user direction: climbs aren't important for evaluating robots)
   - Each metric line includes `<RankBadge />` for immediate field context
   - Renders as one bordered card, not as separate cards stacked. Visually distinct unit below the hero.

   **Implementation:** new `<ScoringBreakdownPanel />` component, ~150 lines. Pure presentational, takes `teamStats` as prop. Reads `avgAutoFuelEstimate`, `avgTeleopFuelEstimate`, `avgAutoFuelPass`, `avgTeleopFuelPass`, `centerFieldAutoCount`, the bonus bucket totals, and the climb level counts — all already in `teamStats`.

5. **Promote the match heatmap into the hero block.** Render it directly below the 3 summary cards, above the scoring breakdown. Hero region becomes: `[3 cards] + [heatmap strip]` as one visual unit, scoring breakdown panel sits below as the next section.

6. **Demote DataSourceToggle.** Move it out of the header into the Match History tab where it logically belongs. Header is for identity, not settings.

7. **TrendChip placement.** Currently inline with the team number — fine, but verify it has visual prominence (it's small relative to the team-number text). Consider moving below the team name as a chip with the source-event chip if pre-scout exists.

### 3.5.3 Empty-state handling (~30 min)

The page renders unusable visualizations when the team has < 5 matches. Specifically:
- Auto consistency chart with 3 bars (panel sized for 10+)
- Climb matrix with mostly empty cells
- Match heatmap with 3 cells dwarfed by its legend

**Changes:**

1. **Auto consistency chart:** if `perMatchAuto.length < 5`, hide the chart and render a one-line stat instead: "Avg auto: 81.4 (3 matches, ranked #2/75)". Show the full chart only when there's enough data to read a trend.

2. **Climb matrix:** if 0 climbs across all matches, hide entirely. If some climbs, render only the rows that have data (don't show empty L3 row when no team climbed L3).

3. **Match heatmap:** if `< 5 matches`, render it inline in the hero with the legend dropped — just the cells with hover tooltips. Bring back the legend only when the strip has > 5 cells.

4. **Failure mode chart:** already conditional — verify it hides correctly when there are no failures (currently does, but confirm).

5. **Performance tab as a whole:** if the team has < 3 matches, render a top-of-tab message "Performance analytics need at least 3 matches. Check back after a few rounds." with a small disabled-state preview underneath. Don't pretend to render meaningful charts on near-zero data.

### 3.5.4 Stop the conditional layout shifts (~30 min)

The Phase 3 grid at line 470 (`<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">`) has multiple conditional `lg:col-span-2` and conditional renders that create layout instability. Two adjacent teams will look completely different.

**Fix:**

1. Move all of failure modes / auto consistency / climb matrix into the Performance tab.
2. Use a stable 2-column grid. If only one item has data, it gets the left column at half-width — empty right column is fine, layout stays stable.
3. Drop the `lg:col-span-2` conditionals entirely.
4. Remove the orphan "Avg auto" card on line 484 (it gets folded into the new hero per 3.5.2).

### File touch list (Phase 3.5)

- `src/pages/TeamDetail.tsx` — tab refactor, hero changes, empty-state handling. Net change: ~50 lines added, ~150 lines reorganized into tab containers
- `src/components/TeamDetailTabs.tsx` (new, ~80 lines) — tab navigation + URL sync
- `src/components/ReliabilityChip.tsx` (new, ~50 lines) — header reliability indicator with breakdown popover
- `src/components/ScoringBreakdownPanel.tsx` (new, ~150 lines) — auto/teleop split with mid-field, bonus buckets, demoted endgame
- `src/components/teamDetail/OverviewTab.tsx` (new, ~120 lines) — extracted from current TeamDetail body
- `src/components/teamDetail/PerformanceTab.tsx` (new, ~150 lines) — extracted, with empty-state guards, holds Partner + Defense cards
- `src/components/teamDetail/MatchHistoryTab.tsx` (new, ~100 lines) — extracted, holds DataSourceToggle
- `src/components/teamDetail/NotesTab.tsx` (new, ~80 lines) — extracted

### Acceptance criteria

- TeamDetail loads on Overview tab by default
- All 4 tabs accessible via keyboard, URL query param syncs (`?tab=performance` deep-links)
- 3-card hero with unified format (no `border-l-4` color noise): **Avg Score / Avg Auto / Avg Passes** — these three cards reflect the user's "what makes a good robot" criteria
- Reliability chip in header next to team name shows ✓/⚠/⚠ states correctly based on connection-loss / no-show / did-nothing flag rates
- Scoring breakdown panel renders below the hero+heatmap with auto vs teleop 2-column split, mid-field auto rate visible in auto column, endgame as muted single-line at bottom
- Match heatmap renders directly below hero cards as part of the hero block
- DataSourceToggle no longer in the header — lives in Match History tab
- Partner comparison + defense effectiveness cards moved to Performance tab (out of Overview)
- A team with 3 matches: Overview shows hero + heatmap + scoring breakdown, no empty charts visible. Performance tab shows "needs more matches" message instead of half-empty visualizations
- A team with 12+ matches: full Performance tab with all charts populated correctly
- No layout shifts between teams with different data shapes
- Orphan "Avg auto" card removed (folded into new hero as Card 2)

### Deploy

```bash
npm run build
firebase deploy --only hosting:dev
```

Verify on `dev-data-wrangler.web.app`:
- Visit a team with 3 matches (e.g., 2910 from the screenshot) — Overview tab is dense and readable, no empty visualizations
- Visit a team with 12+ matches — Performance tab fully populated
- Tab through Overview → Performance → Match History → Notes → back to Overview, deep-link by URL
- Switch DataSourceToggle in Match History tab, confirm it affects only that tab's content

Then for prod:

```bash
firebase deploy --only hosting:prod
```

This is 🟡 between matches — it's a UI reorganization with zero analytics changes, contained to one page. Test on dev for a full match cycle, then promote.

### Notes for the implementer

- **Tab implementation can be very simple.** Don't reach for Radix Tabs or another library — a 30-line tab component handles this case. Keep it minimal.
- **The empty-state handling is non-negotiable.** Half-empty charts are the single biggest reason the page reads as cluttered. Don't render them.
- **Don't change Phase 3's components.** RankBadge, MatchHeatmapStrip, TrendChip, DefenseEffectivenessCard, PartnerComparisonCard, FailureModeChart, AutoConsistencyChart, ClimbMatrix all stay. They just get rearranged into tabs.
- **Verify mobile.** Tabs on a 375px viewport — make sure all 4 tab labels fit. If not, abbreviate ("Overview" → "Stats" or use icons + tooltips).

---

# Phase 4 — Dashboard Strategist Console (~6 hrs)

**Why this matters:** Dashboard is the home page. After Phase 3 of UI_CLEANUP_PLAN.md it's mode-aware (quals/playoffs) but the rich match preview card from before that refactor was replaced with a thin `<NextMatchHero />`. Code comment at line 455 of current Dashboard.tsx admits it: `"replaces the rich preview — see /predict for details"`. Phase 4 has two jobs:

1. **Restore the rich preview detail** that got lost in the mode-aware refactor — phase breakdown table, RP predictions per alliance, per-team contribution breakdown, scout notes integration
2. **Add strategist-console ambitions on top** — what-changed greeting, threat assessment, watchlist, top movers, recent picklist activity, plus the "what to expect" content that was originally Phase 6

**Phase 6 is killed.** The user doesn't use Match Schedule tactically. The valuable "what to expect" content (`buildWatchForList`, opponent characterizations) folds into the rich match preview's expandable details — it lives where strategists actually look, not behind a separate route.

### 4.0 Restore the rich match preview card (~150 min)

This is the new centerpiece of Dashboard quals mode (and a slimmer version on playoffs mode). Rebuilds what was lost in the cleanup-Phase-3 refactor, plus adds the "what to expect" content from the killed Phase 6.

**Composition (top to bottom inside the card):**

1. **Header row** — title with mode-aware label
   - Upcoming: `Eye icon · Next Match — Q48`
   - Last completed: `Flag icon (colored by W/L) · Last Match — Q47`

2. **Big predicted scores** — same 2-column layout as the pre-refactor version
   - Per alliance: `Red`/`Blue` eyebrow label, team chips (home team highlighted with ring), large `text-3xl md:text-4xl` predicted total, `Min: X – Max: Y` range below from MC `scorePercentiles.p10/p90`, confidence chip (`high/medium/low confidence` colored by level), `<SourceMixFooter />` showing live + pre-scout match counts contributing
   - Center "vs" divider
   - Bottom: favored line — `→ Red favored by 18.4 pts` / `→ Even matchup`, colored green if home favored, red if not

3. **Actual result strip** (only when match completed) — colored border-l-4 by win/loss, big actual scores, `✓ Prediction correct` / `✗ Prediction wrong` badge

4. **Phase breakdown table** — 4 rows (Auto / Teleop / Endgame / TOTAL) × 4 cols (Phase / Red / Blue / Advantage)
   - Advantage column shows `Red +18.3` / `Blue +5.1` / `Even` colored appropriately
   - TOTAL row bold with `bg-surfaceElevated`

5. **Watch For bullets** *(NEW — folded in from killed Phase 6)* — 3-4 lines auto-generated from `buildWatchForList(redTeams, blueTeams, allStats, allTrends)`:
   - `Watch for: 4400's auto (avg 28, top 10%)`
   - `Watch for: 233 typically defends in late teleop`
   - `Watch for: 1540 has lost connection 3/5 last matches`
   - `Watch for: blue alliance's L2 climb success is only 40%`
   - Render as a compact bulleted list immediately under the phase breakdown table, before the Details collapse — these are the highest-value "what to expect" signals and shouldn't be hidden behind a click

6. **Collapsible "Details & Scout Notes"** — `<details>` element keeping the existing pattern
   - **RP predictions card per alliance** — Win Probability %, Energized %, Traversal %, Expected Total RP
   - **Per-team breakdown table per alliance** — columns: Team, Auto, Tele, End, Total, Reliability%
   - **Scout notes grouped by alliance role** — Alliance Partners (green eyebrow) / Opponents (red eyebrow), 3 most recent notes per team

**Implementation:** lift the entire pre-refactor preview card from git history (`2cc01c6~1:src/pages/Dashboard.tsx` lines 395-690) and refactor into a `<MatchPreviewCard />` component. Pure React, all data already in store. Add `<WatchForBullets />` as a separate sub-component that takes red+blue team numbers and renders 3-4 bullets via `buildWatchForList` (Phase 1 helper).

**Render this card:**
- Quals mode: front and center, replacing/wrapping the current `<NextMatchHero />`
- Playoffs mode: render a slimmer version below the alliance hero — drop the phase breakdown table (less relevant in playoffs since alliances repeat), keep predicted scores + favored line + watch-for bullets + RP predictions

**File touch list addition:**
- `src/components/MatchPreviewCard.tsx` (new, ~350 lines — most lifted from old Dashboard)
- `src/components/WatchForBullets.tsx` (new, ~60 lines)

**Acceptance criteria:**
- Quals mode Dashboard shows the big predicted scores + favored line + phase breakdown table + watch-for bullets without any clicks
- Collapsible Details section reveals RP predictions, per-team breakdown, scout notes — same depth as `/predict` page
- Playoffs mode shows a slimmer version (no phase breakdown) below the alliance hero
- Last-match recap correctly shows actual vs predicted with ✓/✗ correctness label
- `<NextMatchHero />` from the cleanup phase is **replaced**, not stacked alongside

### 4.1 "What changed since last visit" greeting (~45 min)

Small section at the top of Dashboard, above the next-match hero. Renders only if `getLastVisitSnapshot()` returns non-null and there's something to report.

**Implementation:**

1. On Dashboard mount, capture current `AppSnapshot` (homeRank, matchesPlayedCount, topTeamNumbers).
2. Diff against `lastVisit.getLastVisitSnapshot()`.
3. Render a small card with sentence-style summary:
   ```
   Welcome back. 3 matches played · You moved from #5 → #4 · 4400 (your watchlist) lost their first match · Q47 was a 28-point upset.
   ```
4. After rendering, call `lastVisit.recordVisit()` to update the snapshot for next time.
5. If less than 5 minutes since last visit, hide the greeting (no point showing nothing happened).

### 4.2 Upcoming opponents 3-match briefing (~60 min)

Below the next-match hero (quals mode only — playoffs mode has its own structure). Lists the home team's next 3 upcoming matches with auto-generated 1-line opponent characterizations.

**Implementation:**

1. Get the next 3 home matches from `homeMatches.filter(unplayed)`.
2. For each, identify the opposing alliance teams.
3. Use `buildOpponentBriefing(oppTeams, allStats, allTrends)` from Phase 1.
4. Render as a stacked list:
   ```
   Q49  vs A6 (1108, 5414, 8373)        Climbers · weak auto · trending up
   Q52  vs A2 (9128, 1833, 2046)        Strong scorer · defends late · top tier
   Q56  vs A8 (88, 6036, 4099)          Inconsistent · big variance · upset risk
   ```
5. Each row clickable to a per-match prep page (or expand inline).

### 4.3 Threat assessment widget (~60 min)

Shows teams currently beating you at metrics you care about, with one-line reasoning.

**Implementation:**

1. Use `assessThreat(homeStats, allStats)` from Phase 1.
2. Render top 4 threats in a compact card:
   ```
   Top threats
   1796   +28% fuel scoring     hot streak, 220+ in last 3
   2046   +18% climb success    8/9 L2 climbs
   148    your team             —
   9128   +15% auto             strong start, fades late
   ```
3. Sort by danger level (high/medium/low).
4. Each row links to that team's TeamDetail.

### 4.4 Watchlist cards (~45 min)

Pinned teams from `useWatchlistStore.pinnedTeams` shown as small cards on Dashboard with their last-match status.

**Implementation:**

1. For each pinned team, render a card showing:
   - Team number + nickname
   - Last match they played (label + result + score)
   - Trend chip (reuse from Phase 3)
   - One-line `characterizeTeam()` output
2. Layout: 3-column grid below the threat assessment.
3. Empty state: "Pin teams from the Teams page to track them here" with link.

### 4.5 Top movers carousel (~30 min)

Surfaces the `topMovers()` helper from Phase 1. Small horizontal strip showing teams climbing or falling fastest in rank.

**Layout:**
```
Top movers (last 4 matches)
  ↑ 233 +6 ranks    ↑ 4400 +4 ranks    ↓ 1796 -3 ranks    ↓ 5736 -3 ranks
```

Click any team to navigate to its TeamDetail.

### 4.6 Recent picklist activity (~30 min)

Small card showing recent changes to the shared picklist: tier moves, comments, new pins. Helps cross-team awareness during selection.

**Layout:**
```
Picklist activity
  3 min ago — kevin moved 4400 to "must pick"
  12 min ago — sarah commented on 233: "watch their climb"
  28 min ago — kevin pinned 1540
```

Renders only if there's been activity in the last hour.

### 4.7 Match countdown expansion (~30 min)

When the next home match is < 10 minutes away, expand the next-match hero to include a "Watch for" checklist.

**Implementation:**

1. Compute time-to-next-match from `predicted_time` or `time` field on TBA match.
2. If < 10 min: expand the existing `<NextMatchHero />` (Phase 3 of cleanup) to include 4 bullets from `buildWatchForList(redTeams, blueTeams, allStats, allTrends)`.
3. Examples:
   - `Watch for: 4400's auto (avg 28, top 10%)`
   - `Watch for: 233 typically defends in late teleop`
   - `Watch for: 1540 has lost connection 3/5 last matches`
   - `Watch for: blue alliance's L2 climb success is only 40%`
4. Animation: smooth height transition when the threshold crosses.

### File touch list (Phase 4)

- `src/pages/Dashboard.tsx` — orchestrate the new components
- `src/components/dashboard/WhatChangedGreeting.tsx` (new, ~80 lines)
- `src/components/dashboard/UpcomingOpponentsBrief.tsx` (new, ~120 lines)
- `src/components/dashboard/ThreatAssessment.tsx` (new, ~100 lines)
- `src/components/dashboard/WatchlistCards.tsx` (new, ~100 lines)
- `src/components/dashboard/TopMoversStrip.tsx` (new, ~60 lines)
- `src/components/dashboard/PicklistActivityFeed.tsx` (new, ~80 lines)
- Modifications to `src/components/NextMatchHero.tsx` (from cleanup Phase 3) — add the expansion-when-imminent behavior

### Acceptance criteria

- Greeting renders only when there's something meaningful since last visit; otherwise hidden
- Opponent briefings produce sensible 1-line summaries for at least 5 sampled match pairings
- Threat assessment correctly excludes the home team and surfaces actually-beating-us teams
- Watchlist cards reflect pin/unpin within 1s of a change
- Countdown expansion triggers exactly when match is < 10 min, doesn't flicker

---

# Phase 5 — Cross-Cutting Power Features (~5 hrs)

**Why this matters:** These features make the app feel native to a control room. Power users learn them in 10 seconds and never go back.

### 5.1 Cmd+K command palette (~120 min)

Fuzzy-search any team, match, or page from anywhere in the app.

**Implementation:**

1. Global keyboard listener on `cmd+k` / `ctrl+k`. Opens a centered modal with input.
2. Input fuzzy-matches against:
   - Team numbers + nicknames
   - Match labels (Q1, Q12, SF7, etc.)
   - Page names (Dashboard, Teams, Predict, Picklist, Match Prep, Pit Analysis, etc.)
   - Pinned watchlist teams (boosted ranking)
3. Result list keyboard-navigable (↑↓ to move, Enter to navigate).
4. Each result has a small icon (team, match, page) for visual scanning.
5. Search is instant (no debounce — local data only).

**Library:** `cmdk` (https://cmdk.paco.me) — small, well-designed, headless. Or build from scratch with `useState` + filtering — actually simpler than depending on a library. Build it.

```typescript
// src/components/CommandPalette.tsx
function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const tbaData = useAnalyticsStore(s => s.tbaData);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Compose results from teams, matches, pages
  // Render modal with input + result list
}
```

Mount once in `AppLayout.tsx`, alongside the user dropdown.

### 5.2 Hover team-number tooltip (~120 min)

Anywhere a team number appears in the UI, hovering it shows a 280×160 floating popover with key stats.

**Popover content:**
- Team number + nickname
- Avg total points (with rank)
- Last 3 matches as mini sparkline
- One-line `characterizeTeam()` output
- Pin/unpin button

**Implementation:**

1. New `<TeamNumberLink team={N} />` component. Renders the team number as a link to `/teams/N`. On hover (200ms delay), shows the popover.
2. Popover uses Radix UI's `Popover` primitive (already in deps? if not, build with portal + position calc).
3. Replace bare team number renders across the app with `<TeamNumberLink />`. This is mostly mechanical — search for `to={`/teams/${...`}` usages.

Files likely affected: Dashboard, TeamList (numbers in compare badges), MatchSchedule, AlliancePredictor, PlayoffBracket bracket cards, PickList rows.

### 5.3 Keyboard navigation in lists (~60 min)

`j` / `k` moves selection in TeamList rows. `Enter` opens TeamDetail. `Esc` clears selection. `p` pins.

**Implementation:**

1. Add `selectedTeamIndex` state to TeamList.
2. Global keydown listener while TeamList is mounted.
3. Visual focus: outline ring on the focused row.
4. On `Enter`, navigate to TeamDetail.
5. On `p`, toggle pin via watchlist.

Documentation: small `?` button in the bottom right of the page that pops up a keyboard cheatsheet.

### File touch list (Phase 5)

- `src/components/CommandPalette.tsx` (new, ~250 lines)
- `src/components/TeamNumberLink.tsx` (new, ~150 lines)
- `src/components/AppLayout.tsx` — mount CommandPalette
- `src/pages/TeamList.tsx` — add keyboard nav
- Various pages — replace bare team-number renders with TeamNumberLink
- `src/components/KeyboardShortcutsCheatsheet.tsx` (new, ~80 lines, optional)

### Acceptance criteria

- Cmd+K opens from any page, search is instant, results are sensible
- Hover any team number → popover appears within 200ms with correct stats
- TeamList: j/k navigates, Enter opens, p pins, ESC clears
- No regression: clicking team numbers still navigates as expected

---

# Phase 6 — REMOVED

**Killed per user direction.** The Match Schedule page isn't used tactically by this team during the event. The valuable content from the original Phase 6 spec — auto-generated "Watch For" opponent briefings, predicted-score range, on-deck context — has been folded into Phase 4's restored Match Preview card (section 4.0). It lives where strategists actually look.

The `buildOpponentBriefing()` and `buildWatchForList()` helpers from Phase 1 still get built; they're consumed by the dashboard preview card instead of a separate match-prep page.

`<details>`

# Phase 6 (original — for reference, do not implement) — Match Prep Checklist (~3 hrs)

**Why this matters:** Strategy teams' literal job is to prep for upcoming matches. Today they do it manually. This automates 80% of the briefing.

### 6.1 Per-match prep panel (~90 min)

Add to `MatchSchedule.tsx`: each upcoming match, when expanded, shows an auto-generated prep brief.

**Brief structure:**

```
Q49 — vs Red A6 (1108, 5414, 8373)
You're on BLUE bumpers. Predicted: blue 286 / red 311 (40% blue win)

OPPONENTS
  • 1108 — strong climber (90% L2), trending up. Watch for late-match scoring.
  • 5414 — defender. Plays defense in 60% of matches. Block them on offense.
  • 8373 — inconsistent. Big swings.

ALLIES
  • Your auto avg (28) + 3005 auto (24) covers auto.
  • 9408 should focus on fuel scoring; their climb is unreliable (40%).
```

**Implementation:**

1. Use `buildOpponentBriefing()`, `characterizeTeam()`, and a new `buildAllyBriefing()` (similar shape but optimistic framing).
2. Render below each match row when expanded.
3. Cache the briefing per match key in `useMemo`.

### 6.2 Shareable match brief link (~45 min)

Each prep panel has a "Share" button that copies a URL like `/matches/Q49/brief` — a clean printable view of the brief.

**Implementation:**

1. New route `/matches/:matchKey/brief`.
2. New page component renders the brief in a print-friendly layout (no nav, no chrome, just content).
3. Useful for Slack-pasting or printing for drivers/coaches.

### 6.3 Predicted-score range with confidence (~30 min)

Replace single point estimate with a range showing 95% confidence interval from Monte Carlo trials.

**Before:** `Predicted: red 312 / blue 287`
**After:** `Predicted: red 312 ± 38 / blue 287 ± 42 · 64% red win`

When the intervals overlap heavily, render a "low confidence" amber chip. When they're well-separated, render "high confidence" green chip. Helps strategists know when to trust the prediction vs treat it as a coin flip.

**Implementation:** `monteCarloMatchup` already computes per-trial scores in `predictions.ts` — just expose `stdDev` alongside `mean` in the returned `MonteCarloResult`. Render the range everywhere predictions appear.

### 6.4 "On deck" notification (~45 min)

When the next home match transitions from "upcoming" to "on deck" (predicted_time within 5 min), show a persistent toast or inline banner.

**Implementation:**

1. Compute time-to-next-match in `AppLayout.tsx`'s polling loop.
2. When threshold crossed, fire a single toast with the brief headline and a "Open prep" link.
3. Don't re-fire if dismissed.

### File touch list (Phase 6)

- `src/pages/MatchSchedule.tsx` — add prep panels
- `src/components/MatchPrepPanel.tsx` (new, ~150 lines)
- `src/pages/MatchBriefPrintView.tsx` (new, ~100 lines)
- `src/utils/strategicInsights.ts` — add `buildAllyBriefing`
- Router update for `/matches/:matchKey/brief`

### Acceptance criteria

- Each upcoming match has a prep panel that's accurate (manually verify 3 sample matches)
- Shareable brief URL renders cleanly, looks good when pasted into Slack
- "On deck" toast fires once per match, doesn't spam

---

</details>

---

# Phase 7 — PickList Overhaul (~6 hrs)

**Why this matters:** `PickList.tsx` is **2,934 lines** in one file — the largest in the project by 3.4×. It's nearly impossible to iterate on safely. This phase componentizes it without changing user-facing behavior, then layers on tier visualization improvements.

**No multi-round boards.** Out of scope for this plan.

### 7.1 Componentization refactor (~3.5 hrs)

Break the monolithic `PickList.tsx` into focused components. No user-visible changes — pure refactor.

**Target component split:**

```
src/pages/PickList.tsx                                      (~300 lines, orchestrator)
src/components/picklist/
  PicklistToolbar.tsx                                       (~150 lines)
  TierColumn.tsx                                            (~250 lines, one tier section)
  PickListTeamRow.tsx                                       (~200 lines, one team in a tier)
  PickListSearchAndFilter.tsx                               (~180 lines)
  PickListExportPanel.tsx                                   (~120 lines)
  PickListShareLink.tsx                                     (~80 lines)
  PicklistStatsHeader.tsx                                   (~150 lines, top-of-page summary)
  PicklistDragDropContext.tsx                               (~200 lines, dnd wiring)
  PicklistComments.tsx                                      (~250 lines, if comments exist)
```

Approach:
1. Map the existing file. Identify natural boundaries (toolbar, tier columns, individual rows, export, search).
2. Extract one component at a time. Verify nothing changes by running the page side-by-side with the original.
3. Move shared state into the existing `usePickListStore`.
4. Remove inline JSX bloat — anything > 30 lines deep should be its own component.
5. **No behavior changes during the refactor.** Save UX improvements for 7.2.

### 7.2 Tier visualization improvements (~1.5 hrs)

Now that the file is workable, improve the tier hierarchy display.

**Visual changes:**

- **Tier headers as colored bands** with explicit semantic meaning — gold for "Must pick", green for "Strong pick", gray for "Possible", red for "Avoid"
- **Tier count badges** in each header: "Must pick (4)" "Strong pick (12)" etc.
- **Drag-and-drop affordance** — clearer drop targets, ghost preview during drag
- **Tier divider lines** that thicken when an item is being dragged across them

### 7.3 Quick-add from anywhere (~30 min)

Hooks up the "+" button from Phase 2.5 (Teams page quick-add). Make sure it adds to the most recently edited tier and shows an inline toast.

### 7.4 Picklist sharing improvements (~30 min)

If picklist sharing exists in the current code, polish it:
- Generate a clean read-only view at `/picklist/share/{shareId}`
- Copy-link button with one-click
- Print-friendly stylesheet for paper backup

### File touch list (Phase 7)

- `src/pages/PickList.tsx` — orchestrator after refactor (~300 lines, was 2934)
- `src/components/picklist/*.tsx` (new, ~10 files, ~1500 lines total — most lifted from current PickList.tsx)
- `src/store/usePickListStore.ts` — likely modest additions for any extracted state

### Acceptance criteria

- All existing PickList behavior works identically post-refactor (drag-drop, comments, search, export, share)
- No file in `src/components/picklist/` exceeds 300 lines
- Tier headers visually distinct by color and prominence
- Quick-add from Teams page works correctly
- Page loads at least as fast as before (no slower)

---

# Phase 8 — Alliance Simulator (~10 hrs)

**Why this matters:** This is the killer-app feature for alliance selection. The strategist asks "what if we pick this team?" — instead of mentally simulating, they drop the team into a slot and see the predicted matchup change.

**Where it surfaces:**
- TeamList row hover: "If picked, your alliance becomes..." mini preview
- TeamDetail page: full simulator with drag-drop slots
- PickList: per-team "show me the alliance" expansion
- Match Predictor: existing surface gets the simulator inline

### 8.1 Core simulator engine (~2 hrs)

Pure-function simulator that takes any 3-team alliance composition and returns predicted stats vs an opposing alliance.

```typescript
// src/utils/allianceSimulator.ts

interface AllianceSimResult {
  predictedScore: { mean: number; stdDev: number };
  winProbVs: (opponentTeams: number[]) => number;
  rpExpectation: number;
  bottlenecks: string[];   // 'Weak auto', 'Climb risk', 'Defense gaps'
  strengths: string[];     // 'Top-tier scoring', 'Reliable climb', etc.
  comparison: {            // vs the home team's current alliance
    scoreDelta: number;
    winProbDelta: number;
  };
}

export function simulateAlliance(
  teams: number[],                    // 3 team numbers
  predictionInputs: PredictionTeamInput[],
  baseline?: { teams: number[] }      // optional comparison alliance
): AllianceSimResult;
```

Builds on existing `monteCarloMatchup` and `predictionInputs`. The "bottlenecks" / "strengths" come from heuristic analysis of the alliance composition (e.g., "all 3 teams have <40% climb success" → bottleneck).

### 8.2 Shared `<AllianceSimulatorPanel />` component (~3 hrs)

Visual interface around the engine. Renders 3 alliance slots, drag-drop or click-to-fill, displays simulated outcomes against either:
- The home team's next match opponent (default)
- A user-selected opponent alliance

**Layout:**
```
┌─ Alliance simulator ─────────────────────────────────────────┐
│  Slot 1: [148 ✕]   Slot 2: [3005 ✕]   Slot 3: [drag here]   │
│                                                                │
│  vs opponent: [A6 — 1108, 5414, 8373 ▾]                       │
│                                                                │
│  Predicted: 312 ± 38                  Win prob: 64%            │
│  Strengths: top-tier scoring, reliable climb                   │
│  Risks:     weak defense vs A6's late press                    │
│                                                                │
│  vs your current alliance: +24 pts, +18% win prob              │
└────────────────────────────────────────────────────────────────┘
```

### 8.3 Surface in TeamList row hover (~1.5 hrs)

When user hovers a team row with `cmd` held (or via a "preview alliance" button), show a small overlay with "If you pick {team}, your alliance becomes..." 1-line summary.

### 8.4 Surface in TeamDetail (~1.5 hrs)

Full simulator panel embedded in TeamDetail with that team pre-filled in slot 3. Lets the strategist immediately see "what does this team add to my alliance?"

### 8.5 Surface in PickList (~1.5 hrs)

Each team in the picklist has an "alliance preview" expand button that opens the simulator with that team in slot 3.

### 8.6 Mobile-friendly mode (~30 min)

Simulator on phone uses a simpler vertical layout — slot 1 / slot 2 / slot 3 stacked, opponent below, results at the bottom.

### File touch list (Phase 8)

- `src/utils/allianceSimulator.ts` (new, ~250 lines)
- `src/utils/allianceSimulator.test.ts` (new, ~150 lines)
- `src/components/AllianceSimulatorPanel.tsx` (new, ~350 lines)
- `src/components/AllianceSlotPicker.tsx` (new, ~120 lines)
- `src/pages/TeamList.tsx` — add hover preview integration
- `src/pages/TeamDetail.tsx` — embed full simulator
- `src/components/picklist/PickListTeamRow.tsx` — add alliance preview button
- `src/pages/AlliancePredictor.tsx` — possibly use the simulator panel here too

### Acceptance criteria

- Simulator produces correct predictions matching `monteCarloMatchup` for the same 3v3 composition
- Drag-drop slot interaction works on desktop, click-to-fill on mobile
- Bottleneck and strength callouts read sensibly for at least 5 sampled alliance compositions
- Hover preview in TeamList responds within 200ms
- "vs your current alliance" comparison correctly calculates delta when alliance is set

---

# Phase 9 — Polish Layer (~4 hrs)

**Why this matters:** Skeleton loading, toast notifications, freshness indicators, and consistent micro-interactions are what separate "looks decent" from "feels like a real product." None individually is bad-ass; together they are.

### 9.1 Loading skeletons (~90 min)

Replace spinner-based loading states with content-shaped skeleton placeholders.

**Pages affected:**
- Dashboard (skeleton hero + skeleton rank cards)
- TeamList (skeleton rows)
- TeamDetail (skeleton stats grid + skeleton chart)
- PlayoffBracket (skeleton bracket cards)

**Implementation:** Tailwind `animate-pulse` + matching layout shapes. ~1 hour to build a `<Skeleton variant="card|row|chart" />` primitive, then plug in across pages.

### 9.2 Toast notifications (~60 min)

Lightweight in-app toast system for sync events, picklist actions, watchlist changes, errors.

**Use sparingly:**
- Picklist update (with undo)
- Watchlist pin/unpin
- Sync completion (only if manual)
- Errors (always)

**Avoid:**
- Routine auto-syncs (too noisy)
- Navigation events
- Anything more than one toast at a time

**Library:** `sonner` is the cleanest minimal toast lib. Or build a 50-line Zustand-driven toast system — also fine.

### 9.3 Freshness indicators (~45 min)

Small "Updated 12s ago" indicator in the header, near the "Now · Q##" chip. Pulses on update.

**Implementation:**
- Track `lastSyncedAt` in `useAnalyticsStore` (probably already exists — verify).
- Live-update the relative time every second.
- Pulse the indicator green for 1s when sync completes.
- Color amber if last sync > 5 min ago, red if > 15 min.

### 9.4 Optimistic UI for watchlist + picklist (~45 min)

Pin a team → it appears immediately in watchlist UI before the Firestore write returns. Drag a team in picklist → it moves immediately. Errors revert with a toast.

**Implementation:** Wrap watchlist and picklist mutations in optimistic updates via Zustand. Roll back on error and show toast.

### File touch list (Phase 9)

- `src/components/Skeleton.tsx` (new, ~80 lines)
- `src/components/Toast.tsx` and `src/store/useToastStore.ts` (new, ~150 lines combined) — OR install `sonner`
- `src/components/FreshnessIndicator.tsx` (new, ~60 lines)
- Various page-level changes for skeletons and optimistic mutations

### Acceptance criteria

- Initial Dashboard load shows skeleton, not spinner
- Pin/unpin reflects in UI immediately, even on slow network
- Freshness indicator shows accurate time-since-sync, color reflects staleness
- No more than one toast visible at a time, errors always show as toasts

---

# Phase 10 — Live Match Ticker (~6 hrs, OPTIONAL)

**Why optional:** This has different infrastructure needs (faster polling, error handling) and depends on TBA's data freshness during live matches. Skip if the value isn't worth the complexity.

### 7.1 Live polling during matches (~120 min)

When a match is in progress, poll TBA every 15 seconds (instead of 5 minutes) for that specific match.

**Implementation:**

1. Detect "in-progress" state: a match where `predicted_time` < `now` < `predicted_time + 3min`, or a match where `actual_time` is set but score isn't.
2. While in this window, fire a 15s poll cycle on `/api/v3/match/{matchKey}` (specific match endpoint).
3. Stop when score is reported or 5 minutes have elapsed.

### 7.2 Live ticker widget (~90 min)

Small banner at the top of every page when a match is live, showing real-time scores.

**Layout:**
```
LIVE  Q47   RED 142  vs  BLUE 168    1:23 remaining
                                          [details →]
```

**Implementation:**

1. Mounted in `AppLayout.tsx` above main content.
2. Reads from a `liveMatch` field in `useAnalyticsStore`.
3. Pulses with each data update.
4. Auto-hides 30 seconds after the match ends.

### 7.3 Live match modal (~120 min)

Click the ticker to open a full-screen overlay with team breakdowns and per-alliance live stats.

**Implementation:**

1. Modal showing red and blue alliance team-by-team.
2. For each team, show their season averages alongside an empty "this match" column.
3. Update the "this match" column from FMS data as it streams in.
4. Side-by-side comparison with predictions: "predicted 312, actual 280, -10%".

### File touch list (Phase 7)

- `src/store/useAnalyticsStore.ts` — add `liveMatch`, `liveMatchPolling` actions
- `src/components/LiveMatchTicker.tsx` (new, ~100 lines)
- `src/components/LiveMatchModal.tsx` (new, ~250 lines)
- `src/utils/tbaApi.ts` — add `fetchSingleMatch(matchKey)` if not present

### Acceptance criteria

- Ticker appears within 30s of match start
- Scores update at least every 30s during a match
- Ticker auto-hides 30s after match ends
- Polling stops when no match is in progress (no zombie pollers)
- No console errors during the polling lifecycle

---

## Phase ordering

| Order | Phase | Estimated time | Cumulative |
|---|---|---|---|
| 1 | Phase 1 — Foundation infra | 90 min | 1.5 hrs |
| 2 | Phase 2 — Teams page transformation | 5 hrs | 6.5 hrs |
| 3 | Phase 3 — Team Detail transformation | 6.5 hrs | 13 hrs |
| 3.5 | Phase 3.5 — Team Detail reorganization | 3 hrs | 16 hrs |
| 4 | Phase 4 — Dashboard strategist console (incl. restored rich preview + watch-for) | 6 hrs | 22 hrs |
| 5 | Phase 5 — Cross-cutting power features | 5 hrs | 27 hrs |
| ~~6~~ | ~~Phase 6 — Match prep checklist~~ — KILLED, content folded into Phase 4 | — | — |
| 7 | Phase 7 — PickList overhaul | 6 hrs | 33 hrs |
| 8 | Phase 8 — Alliance simulator | 10 hrs | 43 hrs |
| 9 | Phase 9 — Polish layer | 4 hrs | 47 hrs |
| 10 | Phase 10 — Live match ticker (optional) | 6 hrs | 53 hrs |

**Total:** ~53 hours for the full bad-ass treatment. ~47 hours without the live ticker.

**Phase 6 was removed** — the user doesn't use Match Schedule tactically. The valuable "Watch For" briefing content folded into Phase 4's restored match preview card where strategists actually look.

**Recommended split:** Phases 1-6 (~26 hrs) deliver the core strategist experience. Phase 7 unlocks PickList iteration. Phase 8 is the killer-app feature for selection. Phase 9 is the polish that makes everything feel native. Phase 10 is the cherry on top.

---

## Dependencies between phases

```
Phase 1 (foundation)
  ├─ Phase 2 (Teams) — uses Sparkline, watchlist, characterizeTeam
  ├─ Phase 3 (TeamDetail) — uses RankBadge, characterizeTeam, analyzeTrend
  ├─ Phase 4 (Dashboard) — uses everything from Phase 1
  └─ Phase 6 (Match prep) — uses buildOpponentBriefing, characterizeTeam

Phase 2 (Teams)
  ├─ Phase 5 (TeamNumberLink) — replaces bare team renders here
  └─ Phase 8 (Alliance simulator) — embeds simulator in row hover

Phase 3 (TeamDetail)
  ├─ Phase 5 (TeamNumberLink) — same
  └─ Phase 8 (Alliance simulator) — embeds full simulator panel

Phase 4 (Dashboard)
  ├─ Requires UI_CLEANUP_PLAN.md Phase 3 (mode-aware Dashboard) to be in place
  └─ Phase 6 (Match prep) — reuses opponent briefings here

Phase 7 (PickList overhaul)
  └─ Phase 8 (Alliance simulator) — adds preview button to picklist rows

Phase 8 (Alliance simulator)
  └─ Touches TeamList, TeamDetail, PickList, AlliancePredictor

Phase 9 (Polish layer)
  └─ Touches all pages — do last
```

Build Phase 1 first. Phase 7 (PickList refactor) before Phase 8 (alliance simulator) — the simulator surfaces in PickList rows, easier on a clean codebase. Phase 9 (polish) goes last since it touches everything.

---

## Deploy strategy

Same dev-first pattern as other plans:

```bash
npm run build
firebase deploy --only hosting:dev
# verify on dev-data-wrangler.web.app
firebase deploy --only hosting:prod
```

Backend changes (Firestore rules for `userPrefs/{uid}/watchlist`) ship once via:

```bash
firebase deploy --only firestore:rules
```

Phase 7 (live match ticker) requires TBA polling rate changes — verify rate-limit headroom before enabling in prod.

---

## End-to-end test checklist

After all phases (1-9) ship to prod:

- [ ] Pin a team on phone → appears in watchlist on laptop within 1s
- [ ] Open Dashboard → "What changed" greeting reflects accurate diff since last visit
- [ ] Upcoming opponent briefings produce sensible 1-line characterizations
- [ ] Threat assessment correctly identifies teams beating home team at key metrics
- [ ] Top movers strip shows climbing/falling teams correctly
- [ ] Recent picklist activity feed updates within 1s of changes
- [ ] Teams page heat-map cells reflect percentile correctly (top 25% green, bottom 25% red)
- [ ] Sparklines render in every row, color reflects trend
- [ ] Smart filter chips work, "Pinned" chip shows watchlist
- [ ] Pin/unpin from any surface (Teams, TeamDetail, hover popover) — all sync
- [ ] TeamDetail rank badges show correct rank in field
- [ ] Match heat-map strip shows full season, hover details work
- [ ] Trend chip reasoning reads naturally (sample 5 teams)
- [ ] Defense effectiveness card appears for defenders, hides for non-defenders
- [ ] Partner-comparison card shows next-match alliance partners' stats
- [ ] Failure mode chart appears when failures exist
- [ ] Auto consistency + climb matrix render correctly
- [ ] Cmd+K opens from any page, fuzzy-search works, navigation works
- [ ] Hover any team number → popover with stats appears
- [ ] j/k keyboard nav works in TeamList
- [ ] Match prep brief is auto-generated, accurate, shareable
- [ ] Predicted-score range shows ± stdDev, confidence chip shows correctly
- [ ] PickList page works identically to before refactor; no file > 300 lines
- [ ] Tier headers visually distinct by color and prominence
- [ ] Alliance simulator predicts correctly for 5+ sampled compositions
- [ ] Simulator surfaces in TeamList hover, TeamDetail panel, PickList row preview
- [ ] Loading skeletons render before initial data arrives
- [ ] Toast notifications appear for picklist/watchlist actions, errors
- [ ] Freshness indicator updates every second, color reflects staleness

After Phase 10 (if shipping):

- [ ] Live ticker appears within 30s of match start
- [ ] Scores update at least every 30s
- [ ] No polling zombies after match ends

---

## What's NOT included (intentional)

- **No new analytics calculations.** All ambition features synthesize existing data. New calculations belong in their own plan.
- **No mobile-specific overhaul.** Components must work on mobile but no mobile-first redesign here.
- **No theme switcher.** Dark mode only.
- **No real-time multi-user collaboration beyond the existing alliance selection sync.** Watchlist syncs across devices for the same user, not across users.
- **No offline mode.** Online-first, with localStorage fallback for the watchlist only.
- **No analytics dashboard for app usage.** Out of scope.
- **No automatic LLM-driven team summaries.** Heuristics only. AI-driven characterizations are a future enhancement, not this plan.

---

## Notes for the implementer

- **Phase 1 first, always.** Without the foundation helpers, every later phase has to reinvent.
- **Heuristic helpers need tests.** `characterizeTeam`, `buildOpponentBriefing`, `assessThreat` should each have at least 5 test cases sampled from real data. Strategic insights that read wrong cause real-time confusion.
- **The "what changed" greeting is the highest single ROI** — 45 min of work for a feature that fundamentally changes how returning users orient themselves.
- **Cmd+K transforms navigation behavior.** Once the team learns it, they stop clicking nav. Build it well — it's worth the 2 hours.
- **Don't ship Phase 7 unless TBA's match-data freshness is reliably <30s during live matches** — otherwise it'll show stale scores and erode trust. Verify before committing.
- **Match prep briefings are heuristic and will sometimes be wrong.** Frame them as "AI suggestions" not facts. A small "?" icon next to each line that explains the reasoning helps trust.
- **Mobile parity** — every new component must verify on a 375px-wide viewport. Easy to forget when building rich desktop features.
