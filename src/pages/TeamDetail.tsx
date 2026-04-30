import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';

import { ArrowLeft, X } from 'lucide-react';
import { estimateMatchPoints, parseClimbLevel, estimateMatchFuel, computeRobotFuelFromActions } from '../types/scouting';
import type { ScoutEntry } from '../types/scouting';
import type { TBAMatch } from '../types/tba';
import { getTeamEventMatches, teamNumberToKey } from '../utils/tbaApi';
import MatchDetailModal from '../components/MatchDetailModal';
import TrendChip from '../components/TrendChip';
import ReliabilityChip from '../components/ReliabilityChip';
import TeamDetailTabs, { type TeamDetailTabId } from '../components/TeamDetailTabs';
import OverviewTab from '../components/teamDetail/OverviewTab';
import PerformanceTab from '../components/teamDetail/PerformanceTab';
import MatchHistoryTab from '../components/teamDetail/MatchHistoryTab';
import NotesTab from '../components/teamDetail/NotesTab';
import {
  analyzeTrend,
  computeDefenseImpact,
  computeFailureBreakdown,
  computeMetricRank,
  computeSourceDelta,
  defenseRateForTeam,
} from '../utils/strategicInsights';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { useNinjaStore } from '../store/useNinjaStore';

// Chart colors — read from CSS design tokens (SVG attributes can't use var())
const getCssHsl = (name: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()})`;
const chartColors = () => ({
  grid: getCssHsl('--border'),
  axis: getCssHsl('--text-muted'),
  tick: getCssHsl('--text-secondary'),
  success: getCssHsl('--success'),
  warning: getCssHsl('--warning'),
  blue: getCssHsl('--blue-alliance'),
  tooltipBg: getCssHsl('--surface-elevated'),
  tooltipBorder: getCssHsl('--border'),
  tooltipText: getCssHsl('--text-primary'),
  tooltipLabel: getCssHsl('--text-secondary'),
});

const VALID_TABS: TeamDetailTabId[] = ['overview', 'performance', 'history', 'notes'];

function TeamDetail() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TeamDetailTabId = (VALID_TABS as string[]).includes(tabParam ?? '')
    ? (tabParam as TeamDetailTabId)
    : 'overview';

  const handleTabChange = (id: TeamDetailTabId) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const preScoutEntries = useAnalyticsStore(s => s.preScoutEntries);
  const scoutActions = useAnalyticsStore(s => s.scoutActions);
  const matchFuelAttribution = useAnalyticsStore(s => s.matchFuelAttribution);
  const teamTrends = useAnalyticsStore(s => s.teamTrends);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const tbaApiKey = useAnalyticsStore(s => s.tbaApiKey);

  const teamNum = parseInt(teamNumber || '0');

  const pitScoutEntry = usePitScoutStore(s => s.getEntryByTeam(teamNum));

  const ninjaNotes = useNinjaStore(s => s.notes);
  const ninjaAssignments = useNinjaStore(s => s.assignments);
  const subscribeToNinjaNotes = useNinjaStore(s => s.subscribeToNotes);
  const subscribeToNinjaAssignments = useNinjaStore(s => s.subscribeToAssignments);
  const unsubscribeNinja = useNinjaStore(s => s.unsubscribeAll);

  const [tbaMatches, setTbaMatches] = useState<TBAMatch[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{ matchNumber: number; videoUrl: string; eventKey?: string } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<ScoutEntry | null>(null);
  const [photoExpanded, setPhotoExpanded] = useState(false);

  // Robot pictures from Postgres (synced via Cloud Function)
  const robotPictures = useAnalyticsStore(s => s.robotPictures);
  const teamRobotPics = useMemo(() => {
    const pics = robotPictures.filter(p => p.team_number === teamNum);
    // Deduplicate by URL
    const seen = new Set<string>();
    return pics.filter(p => {
      if (seen.has(p.robot_image_link)) return false;
      seen.add(p.robot_image_link);
      return true;
    });
  }, [robotPictures, teamNum]);

  // Derive primary photo URL: pit scout photos → robot pictures from DB → null
  const primaryPhotoUrl = useMemo(() => {
    if (pitScoutEntry?.photos?.length) {
      const primary = pitScoutEntry.photos.find(p => p.isPrimary) ?? pitScoutEntry.photos[0];
      return primary?.url ?? null;
    }
    if (pitScoutEntry?.photoUrl) return pitScoutEntry.photoUrl;
    if (teamRobotPics.length > 0) return teamRobotPics[0].robot_image_link;
    return null;
  }, [pitScoutEntry, teamRobotPics]);

  const teamStats = teamStatistics.find(t => t.teamNumber === teamNum);

  // Get real scout entries for this team
  const teamEntries = useMemo(() =>
    scoutEntries
      .filter(e => e.team_number === teamNum)
      .sort((a, b) => a.match_number - b.match_number),
    [scoutEntries, teamNum]
  );

  // Pre-scout entries for this team, grouped by origin event
  const preScoutByEvent = useMemo(() => {
    const teamPreScout = preScoutEntries
      .filter(e => e.team_number === teamNum)
      .sort((a, b) => {
        const evCmp = a.event_key.localeCompare(b.event_key);
        return evCmp !== 0 ? evCmp : a.match_number - b.match_number;
      });
    const groups = new Map<string, typeof teamPreScout>();
    for (const e of teamPreScout) {
      if (!groups.has(e.event_key)) groups.set(e.event_key, []);
      groups.get(e.event_key)!.push(e);
    }
    return Array.from(groups.entries()).map(([eventKey, entries]) => ({ eventKey, entries }));
  }, [preScoutEntries, teamNum]);

  // Fetch TBA matches for each origin event so we can show real video links
  // (origin events aren't in the app's local tbaMatches — that's only the active event)
  const [preScoutTbaMatches, setPreScoutTbaMatches] = useState<Map<string, TBAMatch>>(new Map());

  useEffect(() => {
    if (preScoutByEvent.length === 0) return;
    let cancelled = false;
    (async () => {
      const teamKey = teamNumberToKey(teamNum);
      const allMatches: TBAMatch[] = [];
      for (const { eventKey } of preScoutByEvent) {
        try {
          const matches = await getTeamEventMatches(teamKey, eventKey, tbaApiKey || undefined);
          allMatches.push(...matches);
        } catch (err) {
          console.warn(`[TeamDetail] Failed to fetch TBA matches for ${teamKey} @ ${eventKey}:`, err);
        }
      }
      if (cancelled) return;
      const map = new Map<string, TBAMatch>();
      for (const m of allMatches) map.set(m.key, m);
      setPreScoutTbaMatches(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [preScoutByEvent, teamNum, tbaApiKey]);

  // Calculate per-match data from real entries, with action-derived fuel when available
  const matchData = useMemo(() =>
    teamEntries.map(entry => {
      const actions = scoutActions.find(
        a => a.match_number === entry.match_number && a.team_number === entry.team_number
      );
      const actionFuel = actions ? computeRobotFuelFromActions(actions) : null;
      const fuelAttrib = matchFuelAttribution.find(
        f => f.matchNumber === entry.match_number && f.teamNumber === entry.team_number
      );
      const scoutPoints = estimateMatchPoints(entry);
      // Use FMS-attributed points when available, fall back to scout estimate
      const points = fuelAttrib ? {
        autoPoints: Math.round(fuelAttrib.autoPointsScored + fuelAttrib.autoTowerPoints),
        teleopPoints: Math.round(fuelAttrib.teleopPointsScored),
        endgamePoints: fuelAttrib.endgameTowerPoints,
        total: Math.round(fuelAttrib.totalPointsScored + fuelAttrib.totalTowerPoints),
      } : scoutPoints;
      return {
        entry,
        fuel: estimateMatchFuel(entry),
        points,
        climbLevel: parseClimbLevel(entry.climb_level),
        actions: actions ?? null,
        actionFuel,
        fuelAttrib: fuelAttrib ?? null,
      };
    }),
    [teamEntries, scoutActions, matchFuelAttribution]
  );

  // Subscribe to ninja data
  useEffect(() => {
    if (eventCode) {
      subscribeToNinjaAssignments(eventCode);
      subscribeToNinjaNotes(eventCode);
    }
    return () => unsubscribeNinja();
  }, [eventCode, subscribeToNinjaAssignments, subscribeToNinjaNotes, unsubscribeNinja]);

  // Ninja notes for this team (newest first, already sorted from store)
  const teamNinjaNotes = useMemo(() =>
    ninjaNotes.filter(n => n.teamNumber === teamNum),
    [ninjaNotes, teamNum]
  );

  const ninjaAssignment = ninjaAssignments[String(teamNum)];

  // Fetch TBA match data for videos
  useEffect(() => {
    async function fetchMatches() {
      try {
        const teamKey = teamNumberToKey(teamNum);
        const matches = await getTeamEventMatches(teamKey, eventCode, tbaApiKey);
        setTbaMatches(matches);
      } catch (error) {
        // TBA fetch failed — matches section will be empty
      }
    }
    fetchMatches();
  }, [teamNum, eventCode, tbaApiKey]);

  if (!teamStats) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Team Not Found</h2>
        <button
          onClick={() => navigate(-1)}
          className="text-blueAlliance hover:underline"
        >
          Go Back
        </button>
      </div>
    );
  }

  const n = teamStats.matchesPlayed;

  // Use shared trend analysis
  const teamTrend = teamTrends.find(t => t.teamNumber === teamNum);
  const trendAnalysis = teamTrend
    ? analyzeTrend(teamStats, teamTrend, scoutEntries)
    : null;

  // ─── Strategic-insight derivations (Phase 3) ────────────────────────────
  const allTotalPoints = teamStatistics.map(s => s.avgTotalPoints);
  const allAutoPoints = teamStatistics.map(s => s.avgAutoPoints);
  const allPasses = teamStatistics.map(s => s.avgTotalPass);

  const totalPointsRank = computeMetricRank(teamStats.avgTotalPoints, allTotalPoints);
  const autoPointsRank = computeMetricRank(teamStats.avgAutoPoints, allAutoPoints);
  const passesRank = computeMetricRank(teamStats.avgTotalPass, allPasses);

  const failureSlices = computeFailureBreakdown(teamStats);

  const defenseRate = defenseRateForTeam(teamNum, preScoutEntries);
  const defenseImpact = useMemo(
    () => computeDefenseImpact(teamNum, preScoutEntries, matchFuelAttribution, teamStatistics),
    [teamNum, preScoutEntries, matchFuelAttribution, teamStatistics],
  );

  const sourceDelta = useMemo(
    () => computeSourceDelta(
      teamNum,
      preScoutEntries,
      scoutEntries,
      // Per-entry points source: prefer FMS-attributed totals (what the
      // Match History table shows) so the banner's "live avg" matches
      // what users see row-by-row. Falls back to scout estimate when no
      // FMS attribution exists (always the case for pre-scout entries).
      e => {
        const fa = matchFuelAttribution.find(
          f => f.matchNumber === e.match_number && f.teamNumber === e.team_number,
        );
        if (fa) return fa.totalPointsScored + fa.totalTowerPoints;
        return estimateMatchPoints(e).total;
      },
    ),
    [teamNum, preScoutEntries, scoutEntries, matchFuelAttribution],
  );

  // Per-match auto/climb sequences for mini charts
  const perMatchAuto = useMemo(
    () => teamEntries.map(e => ({
      matchNumber: e.match_number,
      autoPoints: estimateMatchPoints(e).autoPoints,
    })),
    [teamEntries],
  );
  const perMatchClimb = useMemo(
    () => teamEntries.map(e => ({
      matchNumber: e.match_number,
      climbLevel: parseClimbLevel(e.climb_level),
      failed: e.teleop_climb_failed,
    })),
    [teamEntries],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 md:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 bg-surface hover:bg-interactive rounded-lg transition-colors"
          title="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        {primaryPhotoUrl && (
          <button
            onClick={() => setPhotoExpanded(true)}
            className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden border border-border hover:border-blueAlliance transition-colors cursor-pointer"
            title="View robot photos"
          >
            <img
              src={primaryPhotoUrl}
              alt={`Team ${teamNum} robot`}
              className="w-full h-full object-cover"
            />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 md:gap-4 flex-wrap">
            <h1 className="text-3xl md:text-4xl font-bold">{teamStats.teamNumber}</h1>
            <span className="text-sm text-textMuted">
              · {n} match{n === 1 ? '' : 'es'}
            </span>
            <ReliabilityChip stats={teamStats} />
            {trendAnalysis && <TrendChip analysis={trendAnalysis} />}
          </div>
          {teamStats.teamName && (
            <p className="text-xl text-textSecondary mt-1">{teamStats.teamName}</p>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <TeamDetailTabs active={activeTab} onChange={handleTabChange} />

      {/* Active tab body */}
      {activeTab === 'overview' && (
        <OverviewTab
          teamStats={teamStats}
          teamStatistics={teamStatistics}
          teamEntries={teamEntries}
          totalPointsRank={totalPointsRank}
          autoPointsRank={autoPointsRank}
          passesRank={passesRank}
          sourceDelta={sourceDelta}
          liveEventLabel={eventCode || 'Live'}
        />
      )}

      {activeTab === 'performance' && (
        <PerformanceTab
          teamNum={teamNum}
          teamStats={teamStats}
          trendChartData={matchData.map(({ entry, points }) => ({
            match: `Q${entry.match_number}`,
            total: points.total,
            auto: points.autoPoints,
            teleop: points.teleopPoints,
          }))}
          failureSlices={failureSlices}
          perMatchAuto={perMatchAuto}
          perMatchClimb={perMatchClimb}
          autoPointsRank={autoPointsRank}
          chartColors={chartColors()}
          defenseRate={defenseRate}
          defenseImpact={defenseImpact}
        />
      )}

      {activeTab === 'history' && (
        <MatchHistoryTab
          teamNum={teamNum}
          matchData={matchData}
          tbaMatches={tbaMatches}
          preScoutByEvent={preScoutByEvent}
          preScoutTbaMatches={preScoutTbaMatches}
          onSelectMatch={setSelectedMatch}
          onSelectVideo={setSelectedVideo}
        />
      )}

      {activeTab === 'notes' && (
        <NotesTab
          teamNum={teamNum}
          teamNinjaNotes={teamNinjaNotes}
          ninjaAssignment={ninjaAssignment}
          pitScout={{
            primaryPhotoUrl,
            photoCount:
              (pitScoutEntry?.photos?.length ?? (pitScoutEntry?.photoUrl ? 1 : 0)) +
              teamRobotPics.length,
          }}
          onOpenPhotos={() => setPhotoExpanded(true)}
        />
      )}

      {/* Match Detail Modal */}
      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          teamStats={teamStats}
          robotActions={scoutActions.find(
            a => a.match_number === selectedMatch.match_number && a.team_number === selectedMatch.team_number
          )}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="bg-surface rounded-lg max-w-4xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">
                {selectedVideo.eventKey ? `${selectedVideo.eventKey} ` : ''}Match Q{selectedVideo.matchNumber} - Team {teamNum}
              </h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="p-1 hover:bg-interactive rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="aspect-video w-full">
              <iframe
                width="100%"
                height="100%"
                src={selectedVideo.videoUrl.replace('watch?v=', 'embed/')}
                title={`Match Q${selectedVideo.matchNumber}`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
      {/* Robot Photo Gallery Modal */}
      {photoExpanded && (primaryPhotoUrl || teamRobotPics.length > 0) && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPhotoExpanded(false)}
        >
          <div
            className="bg-surface rounded-lg max-w-3xl w-full overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <h3 className="font-bold">Team {teamNum} Robot Photos</h3>
              <button
                onClick={() => setPhotoExpanded(false)}
                className="p-1 hover:bg-interactive rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Pit scout photos */}
              {(pitScoutEntry?.photos?.length
                ? pitScoutEntry.photos
                : pitScoutEntry?.photoUrl
                  ? [{ url: pitScoutEntry.photoUrl, path: '', caption: '', isPrimary: true }]
                  : []
              ).map((photo, idx) => (
                <div key={`pit-${idx}`}>
                  <img
                    src={photo.url}
                    alt={photo.caption || `Team ${teamNum} photo ${idx + 1}`}
                    className="w-full h-auto max-h-[50vh] object-contain rounded"
                  />
                  {photo.caption && (
                    <p className="text-sm text-textSecondary mt-1 text-center">{photo.caption}</p>
                  )}
                </div>
              ))}
              {/* Robot pictures from database */}
              {teamRobotPics.length > 0 && (
                <>
                  {pitScoutEntry?.photos?.length ? (
                    <p className="text-xs text-textSecondary font-semibold uppercase tracking-wide pt-2 border-t border-border">Scouting Database Photos</p>
                  ) : null}
                  {teamRobotPics.map((pic, idx) => (
                    <div key={`db-${idx}`}>
                      <img
                        src={pic.robot_image_link}
                        alt={`Team ${teamNum} robot ${idx + 1}`}
                        className="w-full h-auto max-h-[50vh] object-contain rounded"
                        onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamDetail;
