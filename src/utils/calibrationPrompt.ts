import type { RobotMatchFuel, TeamFuelStats } from './fuelAttribution';
import type { ModelComparisonResult } from './modelComparison';

/**
 * Build a structured prompt for AI-assisted fuel attribution calibration.
 * Packages current attribution data, model comparison results, and quality
 * metrics into a ready-to-paste prompt for Claude or ChatGPT.
 */
export function buildCalibrationPrompt(
  matchFuel: RobotMatchFuel[],
  teamFuel: TeamFuelStats[],
  modelComparison: ModelComparisonResult,
  eventCode: string,
): string {
  const sections: string[] = [];

  // ── System Context ─────────────────────────────────────────────────────────
  sections.push(`# Fuel Attribution Model Calibration — ${eventCode}

## Context

You are helping calibrate a fuel attribution model for FRC (FIRST Robotics Competition) scouting analytics. The 2026 game "Reefscape" has robots shooting balls ("fuel") into a hub. Three robots per alliance work together, but FMS (Field Management System) only reports alliance-level scored totals.

**The problem:** Scouts track per-robot shot attempts, but we only know the alliance total scored from FMS. We need to distribute the FMS total back to individual robots to get per-robot scoring metrics.

**Current model:** Power Curve with β=0.7
  robotScored = (robotShots^0.7 / Σ(allRobotShots^0.7)) × fmsAllianceTotal

This was chosen from Week 0 data (15 matches) as the model with lowest coefficient of variation across teams. We now have ${modelComparison.totalMatches} matches of real event data and need to re-evaluate.

## Models Being Compared

Six attribution model families, each distributing the same FMS alliance total differently:

1. **Equal** — fmsTotal / numActiveRobots (ignores shot data entirely, baseline)
2. **Rank-based** — allocate by ordinal position (most shots = most credit). Immune to shot-count noise, but loses magnitude info.
3. **Power Curve β=0.3 → 1.0** — weight = shots^β. Lower β compresses high-volume estimates. β=1.0 is linear (direct proportional).
4. **Log Curve** — weight = ln(shots + 1). Strongest compression.
5. **Bayesian** — weight = shots × historicalAccuracy. Uses a team's scoring accuracy from prior matches as a prior. Only active when teams have 3+ matches.

**Key metric:** Coefficient of Variation (CV) across matches per team — lower = more stable per-team averages = better model. We want the model that gives the most consistent per-team scoring numbers across different matches.`);

  // ── Model Comparison Results ───────────────────────────────────────────────
  const activeModels = modelComparison.models.filter(m => m.variant.isActive);
  const modelTable = activeModels.map(m => {
    const marker = m.variant.isCurrent ? ' ← CURRENT' : '';
    return `| ${m.variant.label.padEnd(20)} | ${(m.avgCV * 100).toFixed(1).padStart(6)}% | ${m.meanAbsError.toFixed(1).padStart(8)} |${marker}`;
  }).join('\n');

  sections.push(`## Model Comparison Results

| Model                | Avg CV  | Mean Abs Err |
|----------------------|---------|--------------|
${modelTable}

Lower CV = more stable per-team averages across matches.
Mean Abs Error = average |attributed - shots| per robot (how far attribution deviates from scout estimate).`);

  // ── Per-Team Stats (current model) ────────────────────────────────────────
  const currentModel = modelComparison.models.find(m => m.variant.isCurrent);
  if (currentModel && currentModel.perTeamStats.length > 0) {
    const teamTable = currentModel.perTeamStats.map(t =>
      `| ${String(t.teamNumber).padStart(5)} | ${String(t.matchesPlayed).padStart(7)} | ${t.avgScoredPerMatch.toFixed(1).padStart(10)} | ${(t.accuracy * 100).toFixed(0).padStart(8)}% | ${(t.cv * 100).toFixed(0).padStart(5)}% |`
    ).join('\n');

    sections.push(`## Per-Team Statistics (Current Model: Power β=0.7)

| Team  | Matches | Avg Scored | Accuracy | CV    |
|-------|---------|------------|----------|-------|
${teamTable}`);
  }

  // ── Match-Level Summary ────────────────────────────────────────────────────
  // Group by match for a compact summary
  const matchGroups = new Map<number, RobotMatchFuel[]>();
  for (const row of matchFuel) {
    if (!matchGroups.has(row.matchNumber)) matchGroups.set(row.matchNumber, []);
    matchGroups.get(row.matchNumber)!.push(row);
  }

  const matchSummaryRows: string[] = [];
  for (const [matchNum, robots] of Array.from(matchGroups.entries()).sort((a, b) => a[0] - b[0])) {
    // Group by alliance within match
    const red = robots.filter(r => r.alliance === 'red');
    const blue = robots.filter(r => r.alliance === 'blue');

    for (const [alliance, group] of [['RED', red], ['BLUE', blue]] as const) {
      if (group.length === 0) continue;
      const scoutShots = group.reduce((s, r) => s + r.shots, 0);
      const fmsTotal = group[0].fmsAllianceTotal;
      const efficiency = scoutShots > 0 ? ((fmsTotal / scoutShots) * 100).toFixed(0) : 'N/A';
      const flags = group
        .filter(r => r.isRealNoShow || r.isLostConnection || r.isBulldozedOnly)
        .map(r => {
          const f: string[] = [];
          if (r.isRealNoShow) f.push(`${r.teamNumber}:NO-SHOW`);
          if (r.isLostConnection) f.push(`${r.teamNumber}:LOST-CONN`);
          if (r.isBulldozedOnly) f.push(`${r.teamNumber}:BULLDOZED`);
          return f.join(',');
        })
        .filter(Boolean)
        .join(' ');

      matchSummaryRows.push(
        `| Q${String(matchNum).padStart(2)} ${alliance.padEnd(4)} | ${String(scoutShots).padStart(5)} | ${String(fmsTotal).padStart(5)} | ${String(efficiency).padStart(4)}% | ${flags || '-'} |`
      );
    }
  }

  sections.push(`## Match-Level Summary

| Match      | Scout | FMS   | Eff  | Flags |
|------------|-------|-------|------|-------|
${matchSummaryRows.join('\n')}`);

  // ── Data Quality ───────────────────────────────────────────────────────────
  sections.push(`## Data Quality

- Total robot entries: ${modelComparison.totalRobots}
- With action data: ${(modelComparison.actionDataPct * 100).toFixed(0)}%
- Flagged (no-show/lost-connection/bulldozed): ${(modelComparison.flaggedPct * 100).toFixed(0)}%
- Alliance-match groups: ${modelComparison.totalAllianceGroups}
- Bayesian model active: ${modelComparison.models.find(m => m.variant.id === 'bayesian')?.variant.isActive ? 'Yes' : 'No (insufficient match history)'}`);

  // ── Questions ──────────────────────────────────────────────────────────────
  sections.push(`## Analysis Requested

Based on the data above, please analyze:

1. **Optimal Model:** Which model family and parameter gives the best CV? Should we switch from Power β=0.7? If the Bayesian model is active, how does it compare?

2. **Data Quality Red Flags:** Are there matches or teams with suspicious patterns? (e.g., extremely high/low efficiency, potential scout errors, teams with high CV that might indicate inconsistent scouting)

3. **Teams to Watch:** Which teams have the most reliable attribution data? Which teams should we be cautious about?

4. **Calibration Confidence:** On a scale of 1-5, how confident should we be in the current model with this amount of data? What would increase confidence?

5. **Recommendations:** Any specific actions to improve data quality or model accuracy for the remaining matches?

Please be specific and reference actual team numbers and match numbers in your analysis.`);

  return sections.join('\n\n');
}
