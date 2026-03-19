import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Eye, UserPlus, X, ChevronRight, StickyNote, Clock, Search, Binoculars } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { useNinjaStore } from '../store/useNinjaStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { useWatchSchedule } from '../hooks/useWatchSchedule';
import { WatchScheduleTable } from './MatchSchedule';
import { NINJA_TAG_LABELS, NINJA_TAG_COLORS } from '../types/ninja';
import type { NinjaTag } from '../types/ninja';

function NinjaDashboard() {
  const { isAdmin, user, accessConfig, userProfiles } = useAuth();
  const eventCode = useAnalyticsStore(s => s.eventCode);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const tbaData = useAnalyticsStore(s => s.tbaData);

  const assignments = useNinjaStore(s => s.assignments);
  const notes = useNinjaStore(s => s.notes);
  const subscribeToAssignments = useNinjaStore(s => s.subscribeToAssignments);
  const subscribeToNotes = useNinjaStore(s => s.subscribeToNotes);
  const setAssignment = useNinjaStore(s => s.setAssignment);
  const removeAssignment = useNinjaStore(s => s.removeAssignment);
  const unsubscribeAll = useNinjaStore(s => s.unsubscribeAll);

  const pitEntries = usePitScoutStore(s => s.entries);
  const watchSchedule = useWatchSchedule();

  const [searchQuery, setSearchQuery] = useState('');
  const [assigningTeam, setAssigningTeam] = useState<number | null>(null);
  const [selectedNinjaEmail, setSelectedNinjaEmail] = useState('');
  const [watchNinjaFilter, setWatchNinjaFilter] = useState<string>(''); // '' = all

  // Subscribe to data on mount
  useEffect(() => {
    if (eventCode) {
      subscribeToAssignments(eventCode);
      subscribeToNotes(eventCode);
    }
    return () => unsubscribeAll();
  }, [eventCode, subscribeToAssignments, subscribeToNotes, unsubscribeAll]);

  const userEmail = user?.email?.toLowerCase() ?? '';

  // Build team list from TBA data or team statistics
  const allTeams = useMemo(() => {
    if (tbaData?.teams?.length) {
      return tbaData.teams.map(t => ({
        number: t.team_number,
        name: t.nickname || `Team ${t.team_number}`,
      })).sort((a, b) => a.number - b.number);
    }
    return teamStatistics.map(t => ({
      number: t.teamNumber,
      name: t.teamName || `Team ${t.teamNumber}`,
    })).sort((a, b) => a.number - b.number);
  }, [tbaData, teamStatistics]);

  // Note counts per team
  const noteCountByTeam = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const note of notes) {
      counts[note.teamNumber] = (counts[note.teamNumber] ?? 0) + 1;
    }
    return counts;
  }, [notes]);

  // Latest note per team
  const latestNoteByTeam = useMemo(() => {
    const latest: Record<number, string> = {};
    for (const note of notes) {
      if (!latest[note.teamNumber] || note.createdAt > latest[note.teamNumber]) {
        latest[note.teamNumber] = note.createdAt;
      }
    }
    return latest;
  }, [notes]);

  // Latest tags per team (from most recent note)
  const latestTagsByTeam = useMemo(() => {
    const tags: Record<number, NinjaTag[]> = {};
    // Notes are already sorted newest-first from store
    for (const note of notes) {
      if (!tags[note.teamNumber] && note.tags.length > 0) {
        tags[note.teamNumber] = note.tags;
      }
    }
    return tags;
  }, [notes]);

  // Next match for each team
  const nextMatchByTeam = useMemo(() => {
    const map: Record<number, { label: string; upcoming: boolean }> = {};
    if (!tbaData?.matches) return map;
    const levelOrder: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
    const sorted = [...tbaData.matches].sort((a, b) => {
      const la = levelOrder[a.comp_level] ?? 0, lb = levelOrder[b.comp_level] ?? 0;
      return la !== lb ? la - lb : a.match_number - b.match_number;
    });
    const labelFor = (m: typeof sorted[0]) => {
      if (m.comp_level === 'qm') return `Q${m.match_number}`;
      const prefix = m.comp_level.toUpperCase();
      return m.set_number > 0 ? `${prefix}${m.set_number}-${m.match_number}` : `${prefix}${m.match_number}`;
    };
    for (const m of sorted) {
      if (m.alliances.red.score >= 0) continue;
      const label = labelFor(m);
      for (const k of [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys]) {
        const num = parseInt(k.replace('frc', ''));
        if (!map[num]) map[num] = { label, upcoming: true };
      }
    }
    for (let i = sorted.length - 1; i >= 0; i--) {
      const m = sorted[i];
      if (m.alliances.red.score < 0) continue;
      const label = labelFor(m);
      for (const k of [...m.alliances.red.team_keys, ...m.alliances.blue.team_keys]) {
        const num = parseInt(k.replace('frc', ''));
        if (!map[num]) map[num] = { label, upcoming: false };
      }
    }
    return map;
  }, [tbaData]);

  // Allowed users for assignment dropdown
  const allowedUsers = useMemo(() => {
    const emails = [...(accessConfig?.allowedEmails ?? []), ...(accessConfig?.adminEmails ?? [])];
    const unique = [...new Set(emails.map(e => e.toLowerCase()))];
    return unique.map(email => {
      const profile = userProfiles[email];
      return {
        email,
        name: profile ? `${profile.firstName} ${profile.lastName}`.trim() || profile.displayName : email.split('@')[0],
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [accessConfig, userProfiles]);

  // Filter teams
  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) return allTeams;
    const q = searchQuery.toLowerCase();
    return allTeams.filter(t =>
      String(t.number).includes(q) || t.name.toLowerCase().includes(q)
    );
  }, [allTeams, searchQuery]);

  // Split into assigned / unassigned
  const assignedTeams = filteredTeams.filter(t => assignments[String(t.number)]);
  const unassignedTeams = filteredTeams.filter(t => !assignments[String(t.number)]);

  // My assigned teams (for non-admin ninja view)
  const myTeams = filteredTeams.filter(t => {
    const a = assignments[String(t.number)];
    return a && a.ninjaEmail === userEmail;
  });

  // Group assigned teams by ninja
  const teamsByNinja = useMemo(() => {
    const grouped: Record<string, { name: string; email: string; teams: typeof allTeams }> = {};
    for (const team of assignedTeams) {
      const a = assignments[String(team.number)];
      if (!a) continue;
      if (!grouped[a.ninjaEmail]) {
        grouped[a.ninjaEmail] = { name: a.ninjaName, email: a.ninjaEmail, teams: [] };
      }
      grouped[a.ninjaEmail].teams.push(team);
    }
    return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignedTeams, assignments, allTeams]);

  const handleAssign = async () => {
    if (!assigningTeam || !selectedNinjaEmail || !eventCode) return;
    const ninjaUser = allowedUsers.find(u => u.email === selectedNinjaEmail);
    await setAssignment(eventCode, assigningTeam, selectedNinjaEmail, ninjaUser?.name ?? selectedNinjaEmail, userEmail);
    setAssigningTeam(null);
    setSelectedNinjaEmail('');
  };

  const handleUnassign = async (teamNumber: number) => {
    if (!eventCode) return;
    await removeAssignment(eventCode, teamNumber);
  };

  const totalTeams = allTeams.length;
  const assignedCount = allTeams.filter(t => assignments[String(t.number)]).length;

  // Map teamNumber → ninja assignment (for watch schedule display)
  const ninjaByTeam = useMemo(() => {
    const map = new Map<number, { ninjaName: string; ninjaEmail: string }>();
    for (const [teamStr, a] of Object.entries(assignments)) {
      map.set(Number(teamStr), { ninjaName: a.ninjaName, ninjaEmail: a.ninjaEmail });
    }
    return map;
  }, [assignments]);

  // Drive type lookup
  const getDriveType = (teamNumber: number) =>
    pitEntries.find(e => e.teamNumber === teamNumber)?.driveType || null;

  // Ninja options for the watch schedule filter
  const ninjaOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of Object.values(assignments)) {
      seen.set(a.ninjaEmail, a.ninjaName);
    }
    return [...seen.entries()].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  // Effective filter: admins can pick, non-admins locked to self
  const effectiveWatchFilter = isAdmin ? watchNinjaFilter : userEmail;

  const formatRelativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Eye size={28} />
          Ninja Scouting
        </h1>
        <p className="text-textSecondary mt-1">REBUILT 2026 &bull; {eventCode}</p>
      </div>

      {/* Coverage Overview */}
      {totalTeams > 0 && (
        <div className="bg-surface p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-textSecondary">Assignment Coverage</span>
            <span className="font-bold">{assignedCount} / {totalTeams} teams</span>
          </div>
          <div className="w-full bg-card rounded-full h-2">
            <div
              className="bg-success h-2 rounded-full transition-all"
              style={{ width: `${totalTeams > 0 ? (assignedCount / totalTeams) * 100 : 0}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-textMuted">
            <span>{notes.length} total notes</span>
            <span>{Object.keys(noteCountByTeam).length} teams with notes</span>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search teams..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
        />
      </div>

      {/* Assignment Modal */}
      {assigningTeam !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAssigningTeam(null)}>
          <div className="bg-surface border border-border rounded-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Assign Ninja to Team {assigningTeam}</h3>
              <button onClick={() => setAssigningTeam(null)} className="p-1 rounded hover:bg-interactive">
                <X size={20} />
              </button>
            </div>
            <select
              value={selectedNinjaEmail}
              onChange={e => setSelectedNinjaEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-textPrimary focus:outline-none focus:border-success mb-4"
            >
              <option value="">Select a team member...</option>
              {allowedUsers.map(u => (
                <option key={u.email} value={u.email}>{u.name} ({u.email})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleAssign}
                disabled={!selectedNinjaEmail}
                className="flex-1 px-4 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Assign
              </button>
              <button
                onClick={() => setAssigningTeam(null)}
                className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-interactive transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-admin: My Assigned Teams */}
      {!isAdmin && myTeams.length > 0 && (
        <div className="bg-surface p-4 rounded-lg border border-border">
          <h2 className="text-lg font-bold mb-3">Your Assigned Teams ({myTeams.length})</h2>
          <div className="space-y-2">
            {myTeams.map(team => {
              const count = noteCountByTeam[team.number] ?? 0;
              const lastNote = latestNoteByTeam[team.number];
              const tags = latestTagsByTeam[team.number] ?? [];
              const matchInfo = nextMatchByTeam[team.number];
              return (
                <Link
                  key={team.number}
                  to={`/ninja/${team.number}`}
                  className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg border border-border hover:border-success transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-lg">{team.number}</span>
                        <p className="text-textSecondary text-xs truncate">{team.name}</p>
                      </div>
                      {matchInfo && (
                        <span className="text-sm font-semibold text-textPrimary ml-auto flex-shrink-0">
                          {matchInfo.upcoming ? `Next: ${matchInfo.label}` : `Last: ${matchInfo.label}`}
                        </span>
                      )}
                    </div>
                    {tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {tags.slice(0, 3).map(tag => (
                          <span key={tag} className={`text-xs px-1.5 py-0.5 rounded border ${NINJA_TAG_COLORS[tag]}`}>
                            {NINJA_TAG_LABELS[tag]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-textMuted flex-shrink-0">
                    {count > 0 && (
                      <span className="flex items-center gap-1">
                        <StickyNote size={14} />
                        {count}
                      </span>
                    )}
                    {lastNote && (
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatRelativeTime(lastNote)}
                      </span>
                    )}
                    <ChevronRight size={18} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!isAdmin && myTeams.length === 0 && (
        <div className="bg-surface p-8 rounded-lg border border-border text-center">
          <Eye size={48} className="mx-auto mb-3 text-textMuted" />
          <h2 className="text-xl font-bold mb-1">No Teams Assigned</h2>
          <p className="text-textSecondary">Ask your mentor/admin to assign you teams to scout.</p>
        </div>
      )}

      {/* Teams Grouped by Ninja */}
      {teamsByNinja.length > 0 && (
        <div className="space-y-4">
          {teamsByNinja.map(ninja => {
            const isMe = ninja.email === userEmail;
            const ninjaNotesCount = ninja.teams.reduce((sum, t) => sum + (noteCountByTeam[t.number] ?? 0), 0);
            return (
              <div
                key={ninja.email}
                className={`bg-surface p-4 rounded-lg border transition-colors ${isMe ? 'border-success/40' : 'border-border'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className={`text-lg font-bold ${isMe ? 'text-success' : ''}`}>{ninja.name}</h2>
                    <span className="text-xs text-textMuted bg-card px-2 py-0.5 rounded-full">{ninja.teams.length} team{ninja.teams.length !== 1 ? 's' : ''}</span>
                    {ninjaNotesCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-textMuted">
                        <StickyNote size={12} />
                        {ninjaNotesCount} note{ninjaNotesCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {ninja.teams.map(team => {
                    const count = noteCountByTeam[team.number] ?? 0;
                    const lastNote = latestNoteByTeam[team.number];
                    const tags = latestTagsByTeam[team.number] ?? [];
                    const matchInfo = nextMatchByTeam[team.number];
                    return (
                      <div
                        key={team.number}
                        className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg border border-border"
                      >
                        <Link to={`/ninja/${team.number}`} className="flex-1 min-w-0 hover:opacity-80">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <span className="font-bold text-lg">{team.number}</span>
                              <p className="text-textSecondary text-xs truncate">{team.name}</p>
                            </div>
                            {matchInfo && (
                              <span className="text-sm font-semibold text-textPrimary ml-auto flex-shrink-0">
                                {matchInfo.upcoming ? `Next: ${matchInfo.label}` : `Last: ${matchInfo.label}`}
                              </span>
                            )}
                          </div>
                          {tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {tags.slice(0, 3).map(tag => (
                                <span key={tag} className={`text-xs px-1.5 py-0.5 rounded border ${NINJA_TAG_COLORS[tag]}`}>
                                  {NINJA_TAG_LABELS[tag]}
                                </span>
                              ))}
                            </div>
                          )}
                        </Link>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {count > 0 && (
                            <span className="flex items-center gap-1 text-sm text-textMuted">
                              <StickyNote size={14} />
                              {count}
                            </span>
                          )}
                          {lastNote && (
                            <span className="hidden sm:flex items-center gap-1 text-xs text-textMuted">
                              <Clock size={14} />
                              {formatRelativeTime(lastNote)}
                            </span>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleUnassign(team.number)}
                              className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                              title="Unassign ninja"
                            >
                              <X size={16} />
                            </button>
                          )}
                          <Link to={`/ninja/${team.number}`} className="p-1.5 rounded text-textMuted hover:text-textPrimary hover:bg-interactive transition-colors">
                            <ChevronRight size={18} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(isAdmin || assignedTeams.length > 0) && teamsByNinja.length === 0 && (
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-textMuted text-center py-4">No teams assigned yet.</p>
        </div>
      )}

      {/* Unassigned Teams (admin only) */}
      {isAdmin && unassignedTeams.length > 0 && (
        <div className="bg-surface p-4 rounded-lg border border-border">
          <h2 className="text-lg font-bold mb-3">Unassigned Teams ({unassignedTeams.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {unassignedTeams.map(team => (
              <button
                key={team.number}
                onClick={() => setAssigningTeam(team.number)}
                className="flex flex-col items-center px-3 py-3 bg-card border border-border rounded-lg hover:border-success hover:bg-success/5 transition-colors text-center"
              >
                <span className="font-bold text-lg">{team.number}</span>
                <span className="text-xs text-textMuted truncate w-full">{team.name}</span>
                <UserPlus size={14} className="text-textMuted mt-1" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {allTeams.length === 0 && (
        <div className="bg-surface p-8 rounded-lg border border-border text-center">
          <Eye size={48} className="mx-auto mb-3 text-textMuted" />
          <h2 className="text-xl font-bold mb-1">No Teams Found</h2>
          <p className="text-textSecondary">Set an event code in Admin Settings and sync TBA data to see teams.</p>
        </div>
      )}

      {/* Watch Schedule */}
      {watchSchedule.length > 0 && (
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-bold flex items-center gap-2">
              <Binoculars size={16} />
              Watch Schedule
            </h2>
            {isAdmin && ninjaOptions.length > 0 && (
              <select
                value={watchNinjaFilter}
                onChange={e => setWatchNinjaFilter(e.target.value)}
                className="text-xs px-2 py-1 bg-card border border-border rounded text-textPrimary focus:outline-none focus:border-success"
              >
                <option value="">All Ninjas</option>
                {ninjaOptions.map(n => (
                  <option key={n.email} value={n.email}>{n.name}</option>
                ))}
              </select>
            )}
            {!isAdmin && (
              <span className="text-xs text-textMuted">Showing your teams</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <WatchScheduleTable
              watchSchedule={watchSchedule}
              getDriveType={getDriveType}
              filterNinjaEmail={effectiveWatchFilter || undefined}
              ninjaByTeam={ninjaByTeam}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default NinjaDashboard;
