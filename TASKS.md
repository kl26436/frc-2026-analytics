# FRC 2026 Analytics - Task Tracker

## Completed

- [x] Dashboard with Team 148 status, match schedule, leaderboards
- [x] Team List with sortable columns, search, card/table views
- [x] Team Detail page with full stats, match history, pit data, videos
- [x] Team Comparison page (side-by-side stats from Teams page)
- [x] Pick List with 4 tiers, drag-and-drop, notes, flags
- [x] Pick List compare mode (select 2 teams, pick winner, auto-rank)
- [x] Pick List capability filters (customizable thresholds, match counts, settings panel)
- [x] Pick List tracker (tier1+tier2 count)
- [x] DNP button styling (red, Ban icon)
- [x] Tier button icons (correct chevrons for tier distance)
- [x] Event Setup with TBA integration, auto-refresh
- [x] TBA rankings import to pick list
- [x] Metrics Settings (toggle, reorder, edit, custom columns)
- [x] Simplified nav (Dashboard, Teams, Pick List, Event)
- [x] Mobile responsive throughout
- [x] GitHub Pages deploy

## TODO

### Alliance Matchup Predictor Page
- New page to predict scores for any matchup
- Input: pick 3v3 teams (or pull from upcoming schedule)
- Output: predicted alliance scores based on team stats
- Show breakdown: auto + teleop + endgame predicted contributions
- Highlight which alliance is favored and by how much

### Upcoming Match Predictions
- On Dashboard or separate view, show upcoming matches with predictions
- Score prediction per alliance (sum of avg points, with adjustments)
- Rank point prediction (win/loss, bonus RP thresholds)
- Confidence level based on match count / data quality

### Alliance Selection Mode
- Activate during actual alliance selection at events
- Pull top 24 (districts) or 32 (worlds) teams from pick list
- Track which teams get picked and by which alliance
- Mark teams as taken in real-time
- Show remaining available teams from our list
- Real-time chat so team members can communicate during selection
- WebSocket or Firebase for live sync between devices

### Future Ideas
- OPR/DPR/CCWM calculations from TBA match results
- PWA / offline support for events with bad wifi
- Alliance simulator (build hypothetical 3-team alliances)
