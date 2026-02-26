# Team 148 Robowranglers — FRC 2026 Analytics

**Data Wrangler** — the #AllBlackEverything scouting analytics platform for FIRST Robotics Competition 2026 season (REBUILT).

Live at: [kl26436.github.io/frc-2026-analytics](https://kl26436.github.io/frc-2026-analytics/)

## Features

### Dashboard
- Home team hero card with record, rank, and next match
- Match preview/recap with predicted vs actual scores
- Leaderboards: top scorers, climbers, auto performers
- Reliability concerns flagging (lost connection, no-shows)
- Event rankings sidebar

### Teams
- Sortable, searchable team list with customizable metric columns
- Card and table view modes
- Click-to-compare: select any two teams to open a side-by-side comparison modal
- Detailed team profiles: match history, performance trend chart, scouting totals, scout notes

### Customizable Metrics
- Drag-and-drop column ordering
- Built-in and custom metrics with configurable aggregation (avg, max, min, median, sum, rate)
- Format as number, percentage, time, or count
- Persisted across sessions via Zustand

### Match Predictions
- Alliance predictor with per-phase scoring breakdowns (auto, teleop, endgame)
- Ranking point probability estimates (energized, traversal, win)
- Confidence levels per alliance
- Quals list and playoffs bracket views

### Pick List
Three-tier alliance selection system:
- **Steak** — elite tier
- **Potatoes** — solid picks
- **Chicken Nuggets** — do not pick

Collaborative features (Firestore-backed):
- Real-time sync across multiple devices
- Drag-and-drop reordering within and between tiers
- Watchlist with trend-aware stats (Overall vs Last 3)
- Quick-sort by points, climb, auto, team number
- Team notes, availability tracking, pick suggestions
- Trend glow highlighting (green = improving, red = declining)

### Alliance Selection
- Real-time collaborative session via Firestore
- Host controls with participant management
- Alliance tracking board with captain/pick slots
- Guest join via magic link
- Integrated chat

### Data Quality
- Action-based fuel comparison: scout data vs FMS actuals
- Per-match discrepancy analysis
- Links to match replay for investigation

### Match Replay
- Timestamped action playback on the 2026 field map
- Play/pause, scrub, step-through controls with speed adjustment
- Color-coded dots for scores, passes, and climbs
- Per-robot fuel summaries with auto/teleop splits
- Alliance totals vs FMS scored comparison

### Fuel Attribution
- Per-robot ball scoring attribution using power curve model (β=0.7)
- Match-level and team-level aggregation
- Surfaced via customizable metrics (avg scored, accuracy, passes, moved)

### Trend Analysis
- Last-3 vs overall average comparison for key metrics
- Trend direction classification (improving / declining / stable)
- Integrated into pick list watchlist cards and tier cards

### Admin
- Event setup: event code, home team number, TBA API key
- User access management with request/approve flow
- Data sync triggers (Postgres → Cloud Functions → Firestore)

## Tech Stack

- **React 19** + TypeScript
- **Vite** for builds
- **Tailwind CSS v3** — custom dark design system with CSS custom properties
- **Zustand** for state management with localStorage persistence
- **React Router v7** for navigation
- **Firebase** — Auth (Google sign-in) + Firestore (real-time sync)
- **Recharts** for charts
- **@dnd-kit** for drag-and-drop
- **Lucide React** for icons

## Setup

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
git clone https://github.com/kl26436/frc-2026-analytics.git
cd frc-2026-analytics
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Build & Deploy

```bash
npm run build
npx gh-pages -d dist
```

## The Blue Alliance Integration

Configured via Admin Settings:
1. Get an API key from [The Blue Alliance](https://www.thebluealliance.com/account)
2. Go to Admin Settings → enter your API key and event code
3. Event data (rankings, matches, scores) loads automatically

## Project Structure

```
src/
├── components/         # Shared UI components
│   └── allianceSelection/  # Alliance selection sub-components
├── config/             # TBA field mapping
├── contexts/           # React contexts (AuthContext)
├── hooks/              # Custom hooks (Firebase auth, Firestore sync)
├── lib/                # Firebase config
├── pages/              # Route pages (15 pages)
├── store/              # Zustand stores (analytics, metrics, pick list)
├── types/              # TypeScript types (scouting, TBA, metrics)
└── utils/              # Utilities (stats, predictions, fuel attribution, trends, formatting)
```

## Data Pipeline

**Scouting tablets** → **Postgres** → **Cloud Functions** → **Firestore** → **React app**

Scout entries include: auto/teleop fuel scoring, bonus buckets, climb levels, flags (lost connection, no robot, poor accuracy), start zones, and free-text notes.

## Technical Documentation

Deep-dive docs on how the analytics systems work:

- **[Prediction & Simulation System](docs/PREDICTION_SYSTEM.md)** — deterministic scoring, Monte Carlo simulation (1,000 trials), RP probability estimation, data source merging (FMS vs scout)
- **[Fuel Attribution Analysis](docs/FUEL_ATTRIBUTION_ANALYSIS.md)** — per-robot ball scoring attribution from alliance-level FMS data using power curve model (β=0.7), Week 0 data validation, model comparison
- **[Trend Analysis](docs/TREND_ANALYSIS.md)** — last-3 vs overall performance comparison, ±10% classification thresholds, best 3 of 4, UI integration

## Contributing

Team 148 internal tool. To contribute:
1. Create a feature branch
2. Make your changes
3. Run `npx tsc --noEmit` to type-check
4. Test thoroughly
5. Submit a pull request

---

**Built by Team 148 for Team 148**
