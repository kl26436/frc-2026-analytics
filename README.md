# Team 148 Robowranglers - FRC 2026 Analytics

**#AllBlackEverything** analytics platform for FIRST Robotics Competition 2026 season (REBUILT).

## Features

### 📊 Analytics Dashboard
- Event-wide statistics and performance metrics
- Top performers across multiple categories
- Real-time team rankings

### 👥 Team Management
- Comprehensive team list with customizable metrics
- Search, filter, and sort capabilities
- Multi-team selection for comparison
- Detailed team profiles with match-by-match breakdown

### 🔄 Team Comparison
- Side-by-side comparison of selected teams
- Color-coded performance indicators
- All game phases: Auto, Teleop, Endgame

### 📋 Alliance Selection Pick List
Our proven 3-tier alliance selection system:
- **Steak** - Elite tier (your top picks)
- **Potatoes** - Definitely getting picked
- **Chicken Nuggets** - Do Not Pick

Features:
- Drag-and-drop team reordering
- Quick-sort buttons per tier (points, climb, auto, team number)
- Team notes, flags, and tags
- Export/import pick lists as JSON
- Customizable tier names per event

### ⚙️ Customizable Metrics
- Configure which columns appear in team views
- Choose aggregation types: avg, max, min, median, sum, rate
- Format as numbers, percentages, or time
- Adjust decimal precision
- Save configurations between sessions

### 🔗 The Blue Alliance Integration
- Import event data via TBA API
- Load team rankings
- Auto-populate pick list from event standings
- Access match videos and schedules

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** for Team 148's dark theme
- **Zustand** for state management with persistence
- **React Router** for navigation
- **@dnd-kit** for drag-and-drop
- **Lucide React** for icons

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd frc-2026-analytics
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## The Blue Alliance API

To use TBA integration:
1. Get an API key from [The Blue Alliance](https://www.thebluealliance.com/account)
2. Navigate to TBA Settings in the app
3. Enter your API key and event code
4. Click "Load Rankings" to import team data

## Mock Data

The app comes pre-loaded with mock data for 24 teams (including Team 148) with 6 qualification matches each. This allows you to explore all features immediately.

Once you connect to TBA or import real scouting data, the mock data will be replaced.

## Project Structure

```
frc-2026-analytics/
├── src/
│   ├── components/      # Reusable UI components
│   ├── data/           # Mock data generators
│   ├── pages/          # Main application pages
│   ├── store/          # Zustand state management
│   ├── types/          # TypeScript type definitions
│   └── utils/          # Helper functions and API wrappers
├── public/             # Static assets (team logo)
└── ...config files
```

## Data Schema

### Match Scouting (56 fields)
- Auto phase: movement, scoring, accuracy
- Teleop phase: cycles, points, accuracy
- Endgame: climb level, time, park
- Performance: driver skill, defense, reliability

### Pit Scouting (33 fields)
- Robot dimensions and weight
- Drivetrain and wheel configuration
- Scoring capabilities and mechanisms
- Autonomous routines
- Team info and strategy

### Calculated Statistics (40+ metrics)
- Points: total, auto, teleop, endgame
- Accuracy: shooting percentages
- Climb: success rates by level, average time
- Reliability: died rate, tippy rating
- Performance: driver skill, defense rating

## Contributing

This is a Team 148 internal tool. If you're on the team and want to contribute:
1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

Team 148 Robowranglers - Internal Tool

---

**Built by Team 148 for Team 148** 🤖⚡
