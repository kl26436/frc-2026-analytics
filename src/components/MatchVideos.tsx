import { useState, useEffect } from 'react';
import { usePickListStore } from '../store/usePickListStore';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { getTeamEventMatches, getMatchVideoUrl, teamNumberToKey } from '../utils/tbaApi';
import { Play, ExternalLink, AlertCircle, Loader } from 'lucide-react';
import type { TBAMatch } from '../types/tba';

interface MatchVideosProps {
  teamNumber: number;
  eventKey?: string; // Optional - uses current event if not provided
}

function MatchVideos({ teamNumber, eventKey: propEventKey }: MatchVideosProps) {
  const tbaApiKey = usePickListStore(state => state.tbaApiKey);
  const currentEventKey = useAnalyticsStore(state => state.eventCode);
  const eventKey = propEventKey || currentEventKey;

  const [matches, setMatches] = useState<TBAMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatches() {
      if (!tbaApiKey) {
        setError('TBA API key not configured. Go to TBA Settings to add your API key.');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const teamKey = teamNumberToKey(teamNumber);
        const teamMatches = await getTeamEventMatches(teamKey, eventKey, tbaApiKey);

        // Sort matches by time (most recent first) and by match type
        const sorted = teamMatches.sort((a, b) => {
          // Sort by comp level (finals > semis > quarters > quals)
          const levelOrder = { f: 5, sf: 4, qf: 3, ef: 2, qm: 1 };
          if (levelOrder[a.comp_level] !== levelOrder[b.comp_level]) {
            return levelOrder[b.comp_level] - levelOrder[a.comp_level];
          }
          // Then by match number
          return b.match_number - a.match_number;
        });

        setMatches(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
      } finally {
        setLoading(false);
      }
    }

    fetchMatches();
  }, [teamNumber, eventKey, tbaApiKey]);

  const getMatchLabel = (match: TBAMatch): string => {
    const labels = {
      qm: 'Qual',
      ef: 'Eighth Final',
      qf: 'Quarter Final',
      sf: 'Semi Final',
      f: 'Final',
    };
    const label = labels[match.comp_level];
    return match.comp_level === 'qm'
      ? `${label} ${match.match_number}`
      : `${label} ${match.set_number}-${match.match_number}`;
  };

  const getAllianceForTeam = (match: TBAMatch): 'red' | 'blue' | null => {
    const teamKey = teamNumberToKey(teamNumber);
    if (match.alliances.red.team_keys.includes(teamKey)) return 'red';
    if (match.alliances.blue.team_keys.includes(teamKey)) return 'blue';
    return null;
  };

  const getMatchResult = (match: TBAMatch): 'win' | 'loss' | 'tie' | null => {
    const alliance = getAllianceForTeam(match);
    if (!alliance) return null;

    const allianceScore = match.alliances[alliance].score;
    const opponentScore = match.alliances[alliance === 'red' ? 'blue' : 'red'].score;

    if (allianceScore > opponentScore) return 'win';
    if (allianceScore < opponentScore) return 'loss';
    return 'tie';
  };

  const getYouTubeEmbedUrl = (videoKey: string): string => {
    return `https://www.youtube.com/embed/${videoKey}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader className="animate-spin text-textMuted" size={32} />
        <span className="ml-3 text-textSecondary">Loading match videos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger/10 border border-danger rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="text-danger flex-shrink-0" size={20} />
        <p className="text-danger text-sm">{error}</p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-8 text-textMuted">
        <Play size={48} className="mx-auto mb-3 opacity-50" />
        <p>No matches found for Team {teamNumber} at this event.</p>
      </div>
    );
  }

  const matchesWithVideos = matches.filter(m => m.videos && m.videos.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Match Videos</h3>
          <p className="text-sm text-textSecondary">
            {matchesWithVideos.length} of {matches.length} matches have videos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {matches.map((match) => {
          const videoUrl = getMatchVideoUrl(match);
          const alliance = getAllianceForTeam(match);
          const result = getMatchResult(match);
          const isExpanded = expandedMatch === match.key;
          const youtubeVideo = match.videos.find(v => v.type === 'youtube');

          return (
            <div
              key={match.key}
              className={`bg-surface border rounded-lg overflow-hidden ${
                alliance === 'red' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-blue-500'
              }`}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{getMatchLabel(match)}</span>
                    {result && (
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          result === 'win'
                            ? 'bg-success/20 text-success'
                            : result === 'loss'
                            ? 'bg-danger/20 text-danger'
                            : 'bg-textMuted/20 text-textMuted'
                        }`}
                      >
                        {result.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-500 font-semibold">
                      {match.alliances.red.score}
                    </span>
                    <span className="text-textMuted">-</span>
                    <span className="text-blue-500 font-semibold">
                      {match.alliances.blue.score}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-textSecondary mb-3">
                  {alliance === 'red' && (
                    <span>
                      Red Alliance: {match.alliances.red.team_keys.map(k => k.replace('frc', '')).join(', ')}
                    </span>
                  )}
                  {alliance === 'blue' && (
                    <span>
                      Blue Alliance: {match.alliances.blue.team_keys.map(k => k.replace('frc', '')).join(', ')}
                    </span>
                  )}
                </div>

                {videoUrl ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExpandedMatch(isExpanded ? null : match.key)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-danger text-white rounded hover:bg-danger/90 transition-colors"
                    >
                      <Play size={16} />
                      {isExpanded ? 'Hide Video' : 'Watch Video'}
                    </button>
                    <a
                      href={videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-surfaceElevated hover:bg-interactive rounded transition-colors"
                      title="Open in YouTube"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                ) : (
                  <div className="text-xs text-textMuted italic text-center py-2">
                    No video available for this match
                  </div>
                )}
              </div>

              {/* Embedded video player */}
              {isExpanded && youtubeVideo && (
                <div className="border-t border-border">
                  <div className="aspect-video w-full">
                    <iframe
                      width="100%"
                      height="100%"
                      src={getYouTubeEmbedUrl(youtubeVideo.key)}
                      title={`${getMatchLabel(match)} - Team ${teamNumber}`}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MatchVideos;
