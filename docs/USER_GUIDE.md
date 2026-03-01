# Data Wrangler — User Guide

**FRC Team 148 Robowranglers | 2026 REBUILT Season**

---

## Getting Started

### Logging In

1. Go to the app URL and click **Sign in with Google**
2. If this is your first time, you'll be asked to submit your name for admin approval
3. Once approved, you'll have full access to all scouting and strategy features

### Setting Up an Event (Admin Only)

1. Navigate to **Admin Settings** from the top nav
2. Enter your **event code** (e.g., `2026txda`) — this syncs to all team members
3. Set the **home team number** (148)
4. Paste your **TBA API key** for match schedules, rankings, and video links
5. Add team member emails to the **allowlist** so they can log in

---

## Pages at a Glance

| Page | What It's For |
|------|---------------|
| **Dashboard** | Event overview — home team stats, match predictions, leaderboards |
| **Teams** | Sortable/searchable team table with customizable metrics |
| **Team Detail** | Deep dive on a single team — stats, trends, match history |
| **Pit Scouting** | Record robot capabilities and photos during pit walks |
| **Data Quality** | Validate scout data against FMS actuals |
| **Pick List** | Rank teams into tiers for alliance selection |
| **Alliance Predictor** | Simulate match outcomes with custom alliances |
| **Alliance Selection** | Real-time collaborative picking board |
| **Match Replay** | Visual playback of scouted actions on the field |
| **Metrics Settings** | Customize which stats appear and how they're calculated |
| **Event Setup** | View event schedule, scores, and sync status |

---

## Dashboard

Your event command center:

- **Home team card** — win-loss record, current ranking, next match
- **Match predictions** — predicted vs actual scores for every home team match
- **Leaderboards** — top 5 teams by total points, climbing, auto, and "hot streak" (most-improving teams)
- **Reliability flags** — teams with lost connections, no-shows, or accuracy problems
- **Event rankings** sidebar from TBA

---

## Teams Page

### Viewing Teams

- **Table view** — sortable columns showing all enabled metrics
- **Card view** — compact grid cards for quick scanning
- Click any column header to sort; click again to reverse

### Comparing Teams

1. Click a team row to **select** it (highlighted border appears)
2. Select 2-4 teams (3 max on mobile)
3. The **comparison bar** appears at the bottom — click **Compare** to open side-by-side analysis
4. On mobile, **long-press** a row to enter multi-select mode

### Comparison Modal

- **2-team mode** — shows averages plus last 3 match actuals for each metric
- **3-4 team mode** — averages-only view with best/worst color coding (green = best, red = worst)
- Metrics are grouped by category (overall, auto, fuel, endgame, quality, reliability)
- Match video links when available from TBA

---

## Team Detail

Click any team number to see their full profile:

- **Performance summary** — key metrics at a glance
- **Trend chart** — points per match over time (spot improving or declining teams)
- **Match-by-match breakdown** — fuel scored/passed, climb levels, bonus buckets per match
- **Fuel attribution** — auto vs teleop scoring split (FMS-derived)
- **Pit scouting notes** — robot photo, drive type, capabilities
- **Match schedule** — upcoming and past matches with TBA video links

---

## Pit Scouting

Use this during pit walks to catalog each team's robot:

- **Drive type** (tank, swerve, mecanum, etc.)
- **Fuel intake** methods (ground, chute, outpost)
- **Fuel capacity** and estimated **cycle time**
- **Scoring capabilities** and max **climb level**
- **Auto mobility** — can they move in autonomous?
- **Robot photo** — snap from camera or upload a file
- **Scout name** — tracks who scouted what for accountability

All entries sync in real-time via Firestore — multiple scouters can work simultaneously.

---

## Data Quality

Validates your scout data against official FMS scores:

### Fuel Comparison
- Match-level view: total balls scouted vs FMS actual
- Auto/teleop split so you can see where mismatches occur
- Red flag highlight when delta exceeds 5 balls
- Per-robot attribution breakdown showing who likely scored each ball

### Climb Comparison
- Scout-recorded climb levels vs FMS tower placements
- Quickly spot scouting errors or missed climbs

Click any match to open **Match Replay** for manual verification.

---

## Pick List

Your alliance selection prep tool, organized into 4 customizable tiers:

### Tiers (Default Names)
1. **Steak** — top-tier picks
2. **Potatoes** — solid picks
3. **Chicken Nuggets** — acceptable picks
4. **Do Not Pick** — teams to avoid

Tier names are fully customizable — click the tier header to rename.

### Building Your List

- **Import from TBA** — auto-populate with event rankings as a starting point
- **Drag and drop** teams between tiers and reorder within tiers
- **Add notes** to any team for context during selection
- **Red flags** — auto-detected reliability issues:
  - High lost connection rate
  - Frequent no-shows
  - Climb failures
  - Poor scouting accuracy

### Watchlist

Track teams during the last few qualification matches before alliance selection:

1. Add teams to the watchlist from any tier
2. See their **last 3 matches vs overall average** — are they trending up or down?
3. When ready, click **Finalize** to insert watchlist teams into the Potatoes tier at a specific rank

### Sync & Backup

- **Firestore live sync** — multiple strategists see the same pick list in real-time
- **Export/Import** — save a JSON backup or restore from one

---

## Alliance Predictor

Simulate match outcomes before they happen:

1. Select any 3 teams per alliance (red and blue)
2. View predicted scoring by phase: auto, teleop, endgame
3. See **confidence levels** (high/medium/low) based on data consistency
4. **Ranking point probabilities** — energized, traversal, and win chance
5. Score differential and favored alliance

Also integrated into the Dashboard for automatic home team match predictions.

---

## Alliance Selection

Real-time collaborative picking board for use during the actual alliance selection ceremony.

### Starting a Session (Host)

1. Navigate to **Alliance Selection**
2. Click **Create Session**
3. Share the **6-character session code** or **magic link** with your team
4. Manage participants: accept, promote to editor, demote, or remove

### Joining a Session

- **Team members**: click the join link or enter the session code
- **Guests** (no login needed): use the magic link — can view the board and chat

### During Selection

- **Alliance board** — 8 alliances, each with captain + 3 picks
- Mark teams as **picked** or **declined**
- **Search and filter** teams by tier, flags, or metrics
- **Chat** for real-time discussion
- **Undo** if you make a mistake

### Roles

| Role | Can Do |
|------|--------|
| **Host** | Everything — manage participants, pick teams, control session |
| **Editor** | Pick teams, post in chat, view all data |
| **Viewer** | Read-only — watch the board and chat |
| **Pending** | Waiting for host to approve access |

---

## Match Replay

Visual playback of scouted actions overlaid on the 2026 field:

- **Playback controls** — play/pause, scrub, step through, speed (0.5x-2x)
- **Color-coded dots**: green = fuel score, blue = pass, gold = climb
- **Timeline feed** — phase, action type, timestamp, ball count
- **Per-robot summaries** — auto/teleop shots, passes, totals
- **Alliance totals** vs FMS scored for quick accuracy check

Access from Data Quality page or Team Detail.

---

## Metrics Settings

Customize which statistics appear across the app:

### What You Can Configure

- **Enable/disable** any metric column
- **Reorder** columns via drag-and-drop (affects Teams table)
- **Aggregation method** — average, max, min, median, sum, rate, or percentile
- **Display format** — number, percentage, time, count, or climb level
- **Decimal places** — control precision
- **Category grouping** — overall, auto, teleop, endgame, fuel, quality, reliability

### Fuel Attribution Metrics (Beta)

These use FMS alliance totals + a power curve model to estimate per-robot scoring:

- Avg auto/teleop balls scored
- Scoring accuracy (balls scored / balls shot)
- Avg passes and total balls moved

### Reset

Click **Reset to Defaults** to restore the original metric configuration.

---

## Event Setup

- View the full **match schedule** with scores (auto, teleop, endgame breakdown)
- See **current event rankings** from TBA
- **Auto-refresh** toggle — checks for new data every 10 minutes
- **Sync status** — last sync time, entry counts, event key

---

## Tips & Best Practices

### For Scouters
- Scout **every match** for your assigned teams — gaps reduce data quality
- Use **Pit Scouting** early on Day 1 before pits get busy
- Check **Data Quality** periodically to catch scouting errors while you can still re-watch matches

### For Strategists
- Start building your **Pick List** after qualification round 1 — don't wait until the end
- Use the **Watchlist** for teams you're unsure about in the last few rounds
- Run **Alliance Predictor** scenarios before selection to test "what-if" alliances
- Keep **Metrics Settings** tuned to what matters for your strategy (not every metric is equally useful)

### For Admins
- Set up the **event code** and **TBA API key** before the event starts
- Pre-populate the **allowlist** with all team member emails
- Monitor **Data Quality** to ensure scouters are recording accurately
- Trigger a **manual sync** if data seems stale

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close any modal or overlay |

---

## Glossary

| Term | Meaning |
|------|---------|
| **Fuel** | Game piece for the 2026 REBUILT season |
| **Climb/Tower** | Endgame mechanic with levels 0-3 |
| **FMS** | Field Management System — official match scoring |
| **TBA** | The Blue Alliance — community FRC data source |
| **RP** | Ranking Points — secondary scoring criterion |
| **Red Flag** | Automatic reliability warning on a team |
| **Tier** | Pick list ranking category |
| **Watchlist** | Secondary tracking list for undecided teams |
| **Session Code** | 6-character ID for joining an alliance selection session |
| **Power Curve Attribution** | Statistical model for estimating per-robot scoring from alliance totals |
