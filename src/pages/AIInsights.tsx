import { useState, useMemo } from 'react';
import {
  Bot, BarChart3, ClipboardList, Dices, Swords, AlertTriangle, Sparkles, Trophy,
} from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import ClaudeChat from '../components/ClaudeChat';
import EventName from '../components/EventName';
import {
  INSIGHT_TEMPLATES,
  type InsightTemplateId,
  buildEventOverviewPrompt,
  buildPickListHelperPrompt,
  buildDraftSimulatorPrompt,
  buildPlayoffStrategyPrompt,
  buildMatchPreviewPrompt,
  buildDataQualityAuditPrompt,
} from '../utils/insightPrompts';

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  ClipboardList,
  Dices,
  Trophy,
  Swords,
  AlertTriangle,
};

export default function AIInsights() {
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const teamFuelStats = useAnalyticsStore(s => s.teamFuelStats);
  const teamTrends = useAnalyticsStore(s => s.teamTrends);
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const pgTbaMatches = useAnalyticsStore(s => s.pgTbaMatches);
  const predictionInputs = useAnalyticsStore(s => s.predictionInputs);
  const homeTeamNumber = useAnalyticsStore(s => s.homeTeamNumber);
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const tbaData = useAnalyticsStore(s => s.tbaData);

  const [activeTemplate, setActiveTemplate] = useState<InsightTemplateId | null>(null);
  const [redTeams, setRedTeams] = useState<string>('');
  const [blueTeams, setBlueTeams] = useState<string>('');
  const [matchNumber, setMatchNumber] = useState<string>('');
  const [allianceTeams, setAllianceTeams] = useState<string>(String(homeTeamNumber));
  const [seedNumber, setSeedNumber] = useState<string>('');

  // Build the prompt based on active template
  const prompt = useMemo(() => {
    if (!activeTemplate) return '';

    switch (activeTemplate) {
      case 'event_overview':
        return buildEventOverviewPrompt(teamStatistics, teamFuelStats, teamTrends, pgTbaMatches, eventCode);

      case 'pick_list_helper':
        return buildPickListHelperPrompt(teamStatistics, teamFuelStats, teamTrends, predictionInputs, homeTeamNumber);

      case 'draft_simulator': {
        const seed = seedNumber ? parseInt(seedNumber) : undefined;
        const tbaRankings = tbaData?.rankings?.rankings;
        return buildDraftSimulatorPrompt(teamStatistics, teamFuelStats, teamTrends, predictionInputs, homeTeamNumber, seed, tbaRankings);
      }

      case 'playoff_strategy': {
        const alliance = allianceTeams.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        if (alliance.length < 2) return '';
        return buildPlayoffStrategyPrompt(alliance, teamStatistics, teamFuelStats, teamTrends, predictionInputs, scoutEntries);
      }

      case 'match_preview': {
        const red = redTeams.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        const blue = blueTeams.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
        if (red.length === 0 || blue.length === 0) return '';
        const mn = matchNumber ? parseInt(matchNumber) : undefined;
        return buildMatchPreviewPrompt(red, blue, teamStatistics, teamFuelStats, predictionInputs, mn);
      }

      case 'data_quality_audit':
        return buildDataQualityAuditPrompt(scoutEntries, pgTbaMatches, teamFuelStats, eventCode);

      default:
        return '';
    }
  }, [activeTemplate, teamStatistics, teamFuelStats, teamTrends, scoutEntries, pgTbaMatches, predictionInputs, homeTeamNumber, eventCode, redTeams, blueTeams, matchNumber, allianceTeams, seedNumber, tbaData]);

  const hasData = teamStatistics.length > 0 || scoutEntries.length > 0;

  if (!hasData) {
    return (
      <div className="text-center py-16">
        <Bot size={48} className="mx-auto mb-4 text-textMuted" />
        <h2 className="text-xl font-bold mb-2">No Data Available</h2>
        <p className="text-textSecondary">Waiting for scout entries and TBA data to generate insights.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles size={24} />
          AI Insights
        </h1>
        <p className="text-sm text-textSecondary mt-1">
          <EventName eventKey={eventCode} /> &middot; {teamStatistics.length} teams &middot; {pgTbaMatches.length} matches
        </p>
      </div>

      {/* Template Picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {INSIGHT_TEMPLATES.map(template => {
          const Icon = ICON_MAP[template.icon] || Bot;
          const isActive = activeTemplate === template.id;
          return (
            <button
              key={template.id}
              onClick={() => setActiveTemplate(isActive ? null : template.id)}
              className={`text-left p-4 rounded-lg border transition-all ${
                isActive
                  ? 'bg-success/10 border-success shadow-lg shadow-success/5'
                  : 'bg-surface border-border hover:border-success/50 hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={18} className={isActive ? 'text-success' : 'text-textMuted'} />
                <span className={`font-semibold text-sm ${isActive ? 'text-success' : 'text-textPrimary'}`}>
                  {template.label}
                </span>
              </div>
              <p className="text-xs text-textSecondary leading-relaxed">{template.description}</p>
            </button>
          );
        })}
      </div>

      {/* Template-specific inputs */}
      {activeTemplate === 'draft_simulator' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <label className="block text-sm font-medium mb-2">Your Seed (optional — leave blank to auto-estimate)</label>
          <input
            type="number"
            value={seedNumber}
            onChange={e => setSeedNumber(e.target.value)}
            placeholder="e.g. 3"
            min={1}
            max={40}
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary w-32 focus:outline-none focus:border-success"
          />
          <p className="text-xs text-textSecondary mt-1">If you already know your ranking, enter it for a more accurate simulation</p>
        </div>
      )}

      {activeTemplate === 'playoff_strategy' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <label className="block text-sm font-medium mb-2">Your Alliance Teams (comma-separated)</label>
          <input
            type="text"
            value={allianceTeams}
            onChange={e => setAllianceTeams(e.target.value)}
            placeholder="148, 6328, 1768"
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary w-full max-w-sm focus:outline-none focus:border-success"
          />
          <p className="text-xs text-textSecondary mt-1">Enter 2-4 team numbers for your playoff alliance</p>
        </div>
      )}

      {activeTemplate === 'match_preview' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Match # (optional)</label>
              <input
                type="number"
                value={matchNumber}
                onChange={e => setMatchNumber(e.target.value)}
                placeholder="e.g. 15"
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary w-full focus:outline-none focus:border-success"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-danger">Red Alliance</label>
              <input
                type="text"
                value={redTeams}
                onChange={e => setRedTeams(e.target.value)}
                placeholder="148, 6328, 1768"
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary w-full focus:outline-none focus:border-danger"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-blue-400">Blue Alliance</label>
              <input
                type="text"
                value={blueTeams}
                onChange={e => setBlueTeams(e.target.value)}
                placeholder="4909, 2877, 5000"
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary w-full focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Claude Chat */}
      {activeTemplate && prompt && (
        <ClaudeChat
          key={activeTemplate + redTeams + blueTeams + allianceTeams + seedNumber}
          prompt={prompt}
          title={INSIGHT_TEMPLATES.find(t => t.id === activeTemplate)?.label || 'Analysis'}
          description={INSIGHT_TEMPLATES.find(t => t.id === activeTemplate)?.description}
          cacheKey={`${eventCode}_${activeTemplate}_${redTeams}_${blueTeams}_${allianceTeams}_${seedNumber}`}
        />
      )}

      {activeTemplate && !prompt && (
        <div className="bg-surface rounded-lg border border-border p-8 text-center">
          <p className="text-textMuted text-sm">Fill in the required fields above to generate the analysis prompt.</p>
        </div>
      )}
    </div>
  );
}
