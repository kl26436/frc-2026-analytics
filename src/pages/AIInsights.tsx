import { useState, useMemo } from 'react';
import {
  Bot, BarChart3, Users, ClipboardList, Swords, AlertTriangle, Sparkles,
} from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import ClaudeChat from '../components/ClaudeChat';
import {
  INSIGHT_TEMPLATES,
  type InsightTemplateId,
  buildEventOverviewPrompt,
  buildTeamDeepDivePrompt,
  buildPickListHelperPrompt,
  buildMatchPreviewPrompt,
  buildDataQualityAuditPrompt,
} from '../utils/insightPrompts';

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  Users,
  ClipboardList,
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

  const [activeTemplate, setActiveTemplate] = useState<InsightTemplateId | null>(null);
  const [teamNumber, setTeamNumber] = useState<string>(String(homeTeamNumber));
  const [redTeams, setRedTeams] = useState<string>('');
  const [blueTeams, setBlueTeams] = useState<string>('');
  const [matchNumber, setMatchNumber] = useState<string>('');

  // Build the prompt based on active template
  const prompt = useMemo(() => {
    if (!activeTemplate) return '';

    switch (activeTemplate) {
      case 'event_overview':
        return buildEventOverviewPrompt(teamStatistics, teamFuelStats, teamTrends, pgTbaMatches, eventCode);

      case 'team_deep_dive': {
        const num = parseInt(teamNumber);
        if (!num) return '';
        return buildTeamDeepDivePrompt(num, teamStatistics, teamFuelStats, teamTrends, scoutEntries, pgTbaMatches);
      }

      case 'pick_list_helper':
        return buildPickListHelperPrompt(teamStatistics, teamFuelStats, teamTrends, predictionInputs, homeTeamNumber);

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
  }, [activeTemplate, teamStatistics, teamFuelStats, teamTrends, scoutEntries, pgTbaMatches, predictionInputs, homeTeamNumber, eventCode, teamNumber, redTeams, blueTeams, matchNumber]);

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
          {eventCode} &middot; {teamStatistics.length} teams &middot; {pgTbaMatches.length} matches
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
      {activeTemplate === 'team_deep_dive' && (
        <div className="bg-surface rounded-lg border border-border p-4">
          <label className="block text-sm font-medium mb-2">Team Number</label>
          <input
            type="number"
            value={teamNumber}
            onChange={e => setTeamNumber(e.target.value)}
            placeholder="e.g. 148"
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-textPrimary w-32 focus:outline-none focus:border-success"
          />
          {teamNumber && !teamStatistics.find(t => t.teamNumber === parseInt(teamNumber)) && (
            <p className="text-xs text-warning mt-1">No data for team {teamNumber}</p>
          )}
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
          key={activeTemplate + teamNumber + redTeams + blueTeams}
          prompt={prompt}
          title={INSIGHT_TEMPLATES.find(t => t.id === activeTemplate)?.label || 'Analysis'}
          description={INSIGHT_TEMPLATES.find(t => t.id === activeTemplate)?.description}
          cacheKey={`${eventCode}_${activeTemplate}_${teamNumber}_${redTeams}_${blueTeams}`}
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
