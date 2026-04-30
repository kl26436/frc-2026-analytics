import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Save, Loader2, CheckCircle, ChevronLeft, Download, Printer, ClipboardCheck, MessageSquare, UserPlus, X, Clipboard, WifiOff, RefreshCw, Binoculars, Search, Pencil, Trash2, Check } from 'lucide-react';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePitScoutStore } from '../store/usePitScoutStore';
import { useFirebaseAuth } from '../hooks/useFirebaseAuth';
import { useAuth } from '../contexts/AuthContext';
import { createEmptyPitScoutEntry } from '../types/pitScouting';
import type { PitScoutEntry, DriveType, ClimbLevel, VibeCheck, ProgrammingLanguage, DriverExperience, DriveTeamRole } from '../types/pitScouting';
import { exportPitScoutCSV, printPitScoutTable } from '../utils/pitExport';
import { useNinjaStore } from '../store/useNinjaStore';
import { useWatchSchedule } from '../hooks/useWatchSchedule';
import { WatchScheduleTable } from './MatchSchedule';
import { NINJA_TAG_LABELS, NINJA_TAG_COLORS } from '../types/ninja';
import type { NinjaTag, NinjaCategory } from '../types/ninja';

function PitScouting() {
  const eventCode = useAnalyticsStore(state => state.eventCode);
  const teamStatistics = useAnalyticsStore(state => state.teamStatistics);
  const robotPictures = useAnalyticsStore(state => state.robotPictures);
  const { entries, offlineQueue, error, lastScoutName, setLastScoutName, addEntry, uploadPhoto, loadEntriesFromFirestore, syncOfflineQueue } = usePitScoutStore();
  const { user, loading: authLoading, signIn } = useFirebaseAuth();
  const { isAdmin, accessConfig, userProfiles } = useAuth();

  // Auto sign-in on mount
  useEffect(() => {
    if (!user && !authLoading) {
      signIn();
    }
  }, [user, authLoading, signIn]);

  const scoutName = user?.displayName || lastScoutName || 'Unknown Scout';
  const userEmail = user?.email?.toLowerCase() ?? '';
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<PitScoutEntry, 'id' | 'timestamp'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formTab, setFormTab] = useState<'pit' | 'inspection' | 'notes'>('pit');
  const [teamSearch, setTeamSearch] = useState('');

  // Auto-select team from URL query param (e.g. /pit-scouting?team=148)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const teamParam = searchParams.get('team');
    const tabParam = searchParams.get('tab');
    if (teamParam) {
      const num = parseInt(teamParam, 10);
      if (!isNaN(num) && num > 0) {
        setSelectedTeam(num);
        if (tabParam === 'pit' || tabParam === 'inspection' || tabParam === 'notes') {
          setFormTab(tabParam);
        }
        // Clear the params so they don't re-trigger
        searchParams.delete('team');
        searchParams.delete('tab');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  // Ninja notes integration
  const ninjaStore = useNinjaStore();
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState<NinjaCategory>('general');
  const [noteTags, setNoteTags] = useState<NinjaTag[]>([]);
  const [noteMatchNum, setNoteMatchNum] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState('');

  // Assignment state
  const [assigningTeam, setAssigningTeam] = useState<number | null>(null);
  const [selectedNinjaEmail, setSelectedNinjaEmail] = useState('');

  // Watch schedule
  const watchSchedule = useWatchSchedule();
  const [watchNinjaFilter, setWatchNinjaFilter] = useState<string>('');
  const [watchPrepFilter, setWatchPrepFilter] = useState<string>('');

  const ninjaByTeam = useMemo(() => {
    const map = new Map<number, { ninjaName: string; ninjaEmail: string }>();
    for (const [teamStr, a] of Object.entries(ninjaStore.assignments)) {
      map.set(Number(teamStr), { ninjaName: a.ninjaName, ninjaEmail: a.ninjaEmail });
    }
    return map;
  }, [ninjaStore.assignments]);

  const watchNinjaOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of Object.values(ninjaStore.assignments)) {
      seen.set(a.ninjaEmail, a.ninjaName);
    }
    return [...seen.entries()].map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [ninjaStore.assignments]);

  const getDriveType = (teamNumber: number) =>
    entries.find(e => e.teamNumber === teamNumber)?.driveType || null;

  const effectiveWatchFilter = isAdmin ? watchNinjaFilter : userEmail;

  const watchPrepOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const entry of watchSchedule) {
      for (const tw of entry.teamsToWatch) labels.add(tw.forMatch);
    }
    return [...labels];
  }, [watchSchedule]);

  // Build allowed users list for assignment dropdown
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

  const handleAssign = async () => {
    if (!assigningTeam || !selectedNinjaEmail || !eventCode) return;
    const ninjaUser = allowedUsers.find(u => u.email === selectedNinjaEmail);
    await ninjaStore.setAssignment(eventCode, assigningTeam, selectedNinjaEmail, ninjaUser?.name ?? selectedNinjaEmail, userEmail);
    setAssigningTeam(null);
    setSelectedNinjaEmail('');
  };

  const handleUnassign = async (teamNumber: number) => {
    if (!eventCode) return;
    await ninjaStore.removeAssignment(eventCode, teamNumber);
  };

  const wiringCameraRef = useRef<HTMLInputElement>(null);
  const complexityCameraRef = useRef<HTMLInputElement>(null);
  const noteCameraInputRef = useRef<HTMLInputElement>(null);

  // Load entries once authenticated
  useEffect(() => {
    if (eventCode && user) {
      loadEntriesFromFirestore(eventCode).catch(() => {});
      ninjaStore.subscribeToNotes(eventCode);
      ninjaStore.subscribeToAssignments(eventCode);
    }
    return () => ninjaStore.unsubscribeAll();
  }, [eventCode, user, loadEntriesFromFirestore]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize form when team is selected — only reset on actual team change,
  // NOT when entries update (which would blow away unsaved edits like coach name).
  const prevTeamRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedTeam && scoutName && selectedTeam !== prevTeamRef.current) {
      prevTeamRef.current = selectedTeam;
      const existing = entries.find(e => e.teamNumber === selectedTeam);
      if (existing) {
        const { id, timestamp, ...rest } = existing;
        setFormData(rest);
      } else {
        const teamStats = teamStatistics.find(t => t.teamNumber === selectedTeam);
        setFormData({
          ...createEmptyPitScoutEntry(eventCode, scoutName),
          teamNumber: selectedTeam,
          teamName: teamStats?.teamName || '',
        });
      }
    }
    if (!selectedTeam) {
      prevTeamRef.current = null;
    }
  }, [selectedTeam, scoutName, eventCode, entries, teamStatistics]);

  const [notePhotos, setNotePhotos] = useState<{ file: File; preview: string }[]>([]);

  const handleNotePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || notePhotos.length >= 3) return;

    const reader = new FileReader();
    reader.onload = () => {
      setNotePhotos(prev => [...prev, {
        file,
        preview: reader.result as string,
      }]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!formData || !selectedTeam) return;

    setSaving(true);
    try {
      await addEntry({
        ...formData,
        scoutName,
      });

      setLastScoutName(scoutName);
      const wasQueued = !navigator.onLine;
      setSaved(true);
      setSavedOffline(wasQueued);
      setTimeout(() => {
        setSaved(false);
        setSavedOffline(false);
        setSelectedTeam(null);
      }, 1200);
    } catch {
      // real error (not network) — setSaving(false) in finally handles UI
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof Omit<PitScoutEntry, 'id' | 'timestamp'>>(
    field: K,
    value: Omit<PitScoutEntry, 'id' | 'timestamp'>[K]
  ) => {
    if (formData) {
      setFormData({ ...formData, [field]: value });
    }
  };

  // Team scout status helper — green = scouted + photos, yellow = one but not both, gray = neither
  const getTeamScoutStatus = (teamNumber: number) => {
    const entry = entries.find(e => e.teamNumber === teamNumber);
    const hasScouted = !!entry;
    const hasPitPhotos = entry?.photos && entry.photos.length > 0;
    const hasDbPhotos = robotPictures.some(p => p.team_number === teamNumber);
    const hasPhotos = hasPitPhotos || hasDbPhotos;

    if (hasScouted && hasPhotos) {
      return { bg: 'bg-success/10', border: 'border-success/30', hover: 'hover:bg-success/20', text: 'text-success', label: null };
    }
    if (hasScouted || hasPhotos) {
      const missing = !hasScouted ? 'needs scout' : 'no photos';
      return { bg: 'bg-warning/15', border: 'border-warning/40', hover: 'hover:bg-warning/25', text: 'text-warning', label: missing };
    }
    return { bg: 'bg-card', border: 'border-border', hover: 'hover:bg-interactive hover:border-success', text: 'text-textPrimary', label: null };
  };

  // Auth loading
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
      </div>
    );
  }

  // Team selection
  if (!selectedTeam) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Ninja Scouting</h1>
            <p className="text-textSecondary mt-1">
              Scout: <span className="text-textPrimary font-semibold">{scoutName}</span>
            </p>
          </div>
          {entries.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => exportPitScoutCSV(entries, eventCode)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surfaceElevated border border-border hover:bg-interactive text-sm font-medium transition-colors"
                title="Export CSV"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                onClick={() => printPitScoutTable(entries, eventCode)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surfaceElevated border border-border hover:bg-interactive text-sm font-medium transition-colors"
                title="Print / PDF"
              >
                <Printer size={16} />
                PDF
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {(offlineQueue.length > 0 || ninjaStore.notesQueue.length > 0) && (
          <div className="flex items-center justify-between gap-3 bg-warning/10 border border-warning/30 text-warning px-4 py-3 rounded-lg">
            <div className="flex items-center gap-2">
              <WifiOff size={16} />
              <span className="text-sm font-medium">
                {[
                  offlineQueue.length > 0 && `${offlineQueue.length} ${offlineQueue.length === 1 ? 'entry' : 'entries'}`,
                  ninjaStore.notesQueue.length > 0 && `${ninjaStore.notesQueue.length} ${ninjaStore.notesQueue.length === 1 ? 'note' : 'notes'}`,
                ].filter(Boolean).join(' · ')} saved offline — will sync when connected
              </span>
            </div>
            <button
              onClick={() => { syncOfflineQueue(); ninjaStore.syncNotesQueue(); }}
              className="flex items-center gap-1 text-sm font-semibold hover:opacity-70 transition-opacity"
            >
              <RefreshCw size={14} />
              Sync now
            </button>
          </div>
        )}

        {/* Progress */}
        <div className="bg-surface p-4 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-textSecondary">Progress</span>
            <span className="font-bold">{entries.length} / {teamStatistics.length}</span>
          </div>
          <div className="w-full bg-card rounded-full h-2">
            <div
              className="bg-success h-2 rounded-full transition-all"
              style={{ width: `${(entries.length / teamStatistics.length) * 100}%` }}
            />
          </div>
          {(() => {
            const needsPhotos = entries.filter(e => {
              const hasPitPhotos = e.photos && e.photos.length > 0;
              const hasDbPhotos = robotPictures.some(p => p.team_number === e.teamNumber);
              return !hasPitPhotos && !hasDbPhotos;
            }).length;
            return needsPhotos > 0 ? (
              <p className="text-xs text-warning mt-2">
                {needsPhotos} scouted team{needsPhotos !== 1 ? 's' : ''} missing photos
              </p>
            ) : null;
          })()}
        </div>

        {/* Quick Team Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" />
          <input
            type="text"
            inputMode="numeric"
            placeholder="Search team number..."
            value={teamSearch}
            onChange={e => setTeamSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
          />
          {teamSearch.trim() && (() => {
            const matches = teamStatistics.filter(t => String(t.teamNumber).includes(teamSearch.trim()));
            return matches.length > 0 ? (
              <div className="absolute z-20 top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {matches.map(team => {
                  const status = getTeamScoutStatus(team.teamNumber);
                  return (
                    <button
                      key={team.teamNumber}
                      onClick={() => { setSelectedTeam(team.teamNumber); setTeamSearch(''); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-interactive transition-colors border-b border-border last:border-b-0"
                    >
                      <span className={`font-bold ${status.text}`}>{team.teamNumber}</span>
                      {status.label && <span className="text-xs text-textMuted">{status.label}</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="absolute z-20 top-full mt-1 w-full bg-surface border border-border rounded-lg shadow-lg px-4 py-3 text-sm text-textMuted">
                No teams found
              </div>
            );
          })()}
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

        {/* Ninja Assignments */}
        {isAdmin && (
          <div className="bg-surface p-4 rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={20} />
              <h2 className="text-lg font-bold">Team Assignments</h2>
              <span className="text-xs text-textMuted bg-card px-2 py-0.5 rounded-full">
                {Object.keys(ninjaStore.assignments).length} / {teamStatistics.length} assigned
              </span>
            </div>

            <div className="space-y-4">
                {/* Coverage bar */}
                <div className="w-full bg-card rounded-full h-2">
                  <div
                    className="bg-blueAlliance h-2 rounded-full transition-all"
                    style={{ width: `${teamStatistics.length > 0 ? (Object.keys(ninjaStore.assignments).length / teamStatistics.length) * 100 : 0}%` }}
                  />
                </div>

                {/* Assigned teams grouped by ninja */}
                {(() => {
                  const grouped: Record<string, { name: string; teams: number[] }> = {};
                  for (const [teamNum, assignment] of Object.entries(ninjaStore.assignments)) {
                    if (!grouped[assignment.ninjaEmail]) {
                      grouped[assignment.ninjaEmail] = { name: assignment.ninjaName, teams: [] };
                    }
                    grouped[assignment.ninjaEmail].teams.push(parseInt(teamNum));
                  }
                  const groups = Object.entries(grouped).sort((a, b) => a[1].name.localeCompare(b[1].name));
                  if (groups.length === 0) return <p className="text-textMuted text-sm text-center py-2">No teams assigned yet.</p>;
                  return groups.map(([email, { name, teams }]) => (
                    <div key={email} className={`bg-card p-3 rounded-lg border ${email === userEmail ? 'border-success/40' : 'border-border'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`font-semibold text-sm ${email === userEmail ? 'text-success' : ''}`}>{name}</span>
                        <span className="text-xs text-textMuted">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {teams.sort((a, b) => a - b).map(num => {
                          const status = getTeamScoutStatus(num);
                          return (
                            <div key={num} className={`flex items-center gap-1 rounded px-2 py-1 text-sm ${status.bg} border ${status.border}`}>
                              <button onClick={() => setSelectedTeam(num)} className={`font-bold ${status.text} hover:opacity-80 transition-colors`}>{num}</button>
                              <button onClick={() => handleUnassign(num)} className="text-textMuted hover:text-danger transition-colors" title="Unassign">
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}

                {/* Unassigned teams */}
                {(() => {
                  const unassigned = teamStatistics.filter(t => !ninjaStore.assignments[String(t.teamNumber)]);
                  if (unassigned.length === 0) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-semibold text-textSecondary mb-2">Unassigned ({unassigned.length})</h3>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                        {unassigned.map(team => {
                          const status = getTeamScoutStatus(team.teamNumber);
                          return (
                            <button
                              key={team.teamNumber}
                              onClick={() => setAssigningTeam(team.teamNumber)}
                              className={`flex flex-col items-center px-2 py-2 border rounded-lg ${status.bg} ${status.border} ${status.hover} transition-colors text-center`}
                            >
                              <span className={`font-bold text-sm ${status.text}`}>{team.teamNumber}</span>
                              <UserPlus size={12} className="text-textMuted mt-0.5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
            </div>
          </div>
        )}

        {/* My Assignments (non-admin) */}
        {!isAdmin && (() => {
          const myTeams = teamStatistics.filter(t => {
            const a = ninjaStore.assignments[String(t.teamNumber)];
            return a && a.ninjaEmail === userEmail;
          });
          if (myTeams.length === 0) return null;
          return (
            <div className="bg-success/5 p-4 rounded-lg border border-success/30">
              <h2 className="text-lg font-bold mb-3 text-success">Your Assigned Teams ({myTeams.length})</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {myTeams.map(team => {
                  const status = getTeamScoutStatus(team.teamNumber);
                  return (
                    <button
                      key={team.teamNumber}
                      onClick={() => setSelectedTeam(team.teamNumber)}
                      className={`px-3 py-2 rounded-lg border transition-colors text-center ${status.bg} ${status.border} ${status.hover}`}
                    >
                      <span className={`font-bold ${status.text}`}>{team.teamNumber}</span>
                      {status.label && <p className="text-[10px] mt-0.5 text-textMuted">{status.label}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-textMuted">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-card border border-border inline-block" /> Neither</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning/15 border border-warning/40 inline-block" /> Partial (scout or photos)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success/10 border border-success/30 inline-block" /> Complete (both)</span>
        </div>

        {/* Watch Schedule */}
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-wrap gap-2">
            <h2 className="font-bold flex items-center gap-2">
              <Binoculars size={16} />
              Watch Schedule
            </h2>
            <div className="flex items-center gap-2">
              {watchPrepOptions.length > 0 && (
                <select
                  value={watchPrepFilter}
                  onChange={e => setWatchPrepFilter(e.target.value)}
                  className="text-xs px-2 py-1 bg-card border border-border rounded text-textPrimary focus:outline-none focus:border-success"
                >
                  <option value="">All Matches</option>
                  {watchPrepOptions.map(label => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </select>
              )}
              {isAdmin && watchNinjaOptions.length > 0 && (
                <select
                  value={watchNinjaFilter}
                  onChange={e => setWatchNinjaFilter(e.target.value)}
                  className="text-xs px-2 py-1 bg-card border border-border rounded text-textPrimary focus:outline-none focus:border-success"
                >
                  <option value="">All Ninjas</option>
                  {watchNinjaOptions.map(n => (
                    <option key={n.email} value={n.email}>{n.name}</option>
                  ))}
                </select>
              )}
              {!isAdmin && (
                <span className="text-xs text-textMuted">Your teams</span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <WatchScheduleTable
              watchSchedule={watchSchedule}
              getDriveType={getDriveType}
              filterNinjaEmail={effectiveWatchFilter || undefined}
              filterPrepFor={watchPrepFilter || undefined}
              ninjaByTeam={ninjaByTeam}
              compact
              onTeamClick={(num) => { setSelectedTeam(num); setFormTab('notes'); }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Form
  if (!formData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-textSecondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSelectedTeam(null)}
          className="p-2 rounded-lg bg-surfaceElevated hover:bg-interactive transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Team {selectedTeam}</h1>
          <p className="text-textSecondary text-sm">{formData.teamName || 'Unknown Team'}</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-surfaceElevated rounded-lg p-1 border border-border">
        {([
          { id: 'pit' as const, label: 'Pit Scout', icon: Clipboard },
          { id: 'inspection' as const, label: 'Inspection', icon: ClipboardCheck },
          { id: 'notes' as const, label: 'Notes', icon: MessageSquare },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setFormTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              formTab === tab.id
                ? 'bg-blueAlliance text-white'
                : 'text-textSecondary hover:text-textPrimary hover:bg-interactive'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.id === 'notes' && (() => {
              const count = ninjaStore.notes.filter(n => n.teamNumber === selectedTeam).length;
              return count > 0 ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-warning/20 text-warning text-xs font-bold">{count}</span> : null;
            })()}
          </button>
        ))}
      </div>

      {offlineQueue.some(e => e.teamNumber === selectedTeam) && (
        <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 text-warning px-4 py-2.5 rounded-lg text-sm">
          <WifiOff size={15} />
          <span>Saved locally — will sync to cloud when reconnected</span>
        </div>
      )}

      {photoError && (
        <div className="flex items-center gap-2 bg-danger/10 border border-danger/30 text-danger px-4 py-2.5 rounded-lg text-sm">
          <WifiOff size={15} />
          <span>{photoError}</span>
        </div>
      )}

      {/* ═══ PIT SCOUT TAB ═══ */}
      {formTab === 'pit' && <>

      {/* Robot Photos (read-only from database) */}
      {(() => {
        const dbPics = robotPictures.filter(p => p.team_number === selectedTeam);
        const seen = new Set<string>();
        const uniquePics = dbPics.filter(p => {
          if (seen.has(p.robot_image_link)) return false;
          seen.add(p.robot_image_link);
          return true;
        });
        if (uniquePics.length === 0) return null;
        return (
          <div className="bg-surface p-4 rounded-lg border border-border">
            <h2 className="font-bold mb-3">Robot Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {uniquePics.map((pic, idx) => (
                <img
                  key={idx}
                  src={pic.robot_image_link}
                  alt={`Team ${selectedTeam} robot ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-lg bg-card border border-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Drive Type */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Drive Type *</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['swerve', 'tank', 'mecanum', 'other'] as DriveType[]).map(type => (
            <button
              key={type}
              onClick={() => updateField('driveType', type)}
              className={`px-4 py-3 rounded-lg border font-semibold capitalize transition-colors ${
                formData.driveType === type
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Programming Language */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Programming Language</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(['java', 'cpp', 'python', 'labview', 'other'] as ProgrammingLanguage[]).map(lang => (
            <button
              key={lang}
              onClick={() => updateField('programmingLanguage', lang)}
              className={`px-4 py-3 rounded-lg border font-semibold transition-colors ${
                formData.programmingLanguage === lang
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              {lang === 'cpp' ? 'C++' : lang.charAt(0).toUpperCase() + lang.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Field Navigation */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Field Navigation</h2>
        <button
          onClick={() => updateField('canGoUnderTrench', !formData.canGoUnderTrench)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
            formData.canGoUnderTrench
              ? 'bg-success/20 border-success'
              : 'bg-card border-border hover:border-textSecondary'
          }`}
        >
          <span>Can Go Under TRENCH</span>
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
            formData.canGoUnderTrench ? 'border-success bg-success' : 'border-textMuted'
          }`}>
            {formData.canGoUnderTrench && <CheckCircle size={14} className="text-background" />}
          </div>
        </button>
      </div>

      {/* Tower Climb */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Tower climb *</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['level3', 'level2', 'level1', 'none'] as ClimbLevel[]).map(value => (
            <button
              key={value}
              onClick={() => updateField('climbLevel', value)}
              className={`px-4 py-3 rounded-lg border font-semibold capitalize transition-colors ${
                formData.climbLevel === value
                  ? 'bg-success/20 border-success text-success'
                  : 'bg-card border-border hover:border-success'
              }`}
            >
              {value === 'level1' ? 'Level 1' : value === 'level2' ? 'Level 2' : value === 'level3' ? 'Level 3' : 'None'}
            </button>
          ))}
        </div>
      </div>

      {/* General Info */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">General Info</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-textSecondary block mb-1">Coach Name *</label>
            <input
              type="text"
              value={formData.coachName}
              onChange={e => updateField('coachName', e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary"
              placeholder="Enter coach name"
            />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Number of Batteries</label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7].map(num => (
                <button
                  key={num}
                  onClick={() => updateField('batteryCount', num)}
                  className={`w-10 h-10 rounded-lg border font-bold transition-colors ${
                    formData.batteryCount === num
                      ? 'bg-success/20 border-success text-success'
                      : 'bg-card border-border hover:border-success'
                  }`}
                >
                  {num}{num === 7 ? '+' : ''}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              const newValue = !formData.rotatesDriveTeam;
              setFormData({
                ...formData,
                rotatesDriveTeam: newValue,
                rotatingRoles: newValue ? formData.rotatingRoles : [],
              });
            }}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
              formData.rotatesDriveTeam
                ? 'bg-success/20 border-success'
                : 'bg-card border-border hover:border-textSecondary'
            }`}
          >
            <span>Rotates Drive Team Members</span>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              formData.rotatesDriveTeam ? 'border-success bg-success' : 'border-textMuted'
            }`}>
              {formData.rotatesDriveTeam && <CheckCircle size={14} className="text-background" />}
            </div>
          </button>

          {formData.rotatesDriveTeam && (
            <div className="ml-4">
              <p className="text-sm text-textSecondary mb-2">Which roles rotate?</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: 'driver' as DriveTeamRole, label: 'Driver' },
                  { value: 'driveCoach' as DriveTeamRole, label: 'Drive Coach' },
                  { value: 'humanPlayer' as DriveTeamRole, label: 'Human Player' },
                ]).map(({ value, label }) => {
                  const selected = formData.rotatingRoles.includes(value);
                  return (
                    <button
                      key={value}
                      onClick={() => {
                        const roles = selected
                          ? formData.rotatingRoles.filter(r => r !== value)
                          : [...formData.rotatingRoles, value];
                        updateField('rotatingRoles', roles);
                      }}
                      className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
                        selected
                          ? 'bg-success/20 border-success text-success'
                          : 'bg-card border-border hover:border-success'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm text-textSecondary block mb-1">Driver Experience</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: '1stYear', label: '1st Year' },
                { value: '2ndYear', label: '2nd Year' },
                { value: '3plusYears', label: '3+ Years' },
              ] as { value: DriverExperience; label: string }[]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => updateField('driverExperience', value)}
                  className={`px-4 py-3 rounded-lg border font-semibold transition-colors ${
                    formData.driverExperience === value
                      ? 'bg-success/20 border-success text-success'
                      : 'bg-card border-border hover:border-success'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Vibe Check */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Vibe Check *</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          {([
            { value: 'good', label: '✓', color: 'success' },
            { value: 'bad', label: '✗', color: 'danger' },
          ] as { value: VibeCheck; label: string; color: string }[]).map(({ value, label, color }) => (
            <button
              key={value}
              onClick={() => updateField('vibeCheck', value)}
              className={`px-6 py-4 rounded-lg border text-3xl font-bold transition-colors ${
                formData.vibeCheck === value
                  ? color === 'success'
                    ? 'bg-success/20 border-success text-success'
                    : 'bg-danger/20 border-danger text-danger'
                  : 'bg-card border-border hover:border-textSecondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-surface p-4 rounded-lg border border-border">
        <h2 className="font-bold mb-3">Additional Notes</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-textSecondary block mb-1">Special Features</label>
            <textarea
              value={formData.specialFeatures}
              onChange={e => updateField('specialFeatures', e.target.value)}
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
              placeholder="Unique capabilities, mechanisms..."
            />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Concerns</label>
            <textarea
              value={formData.concerns}
              onChange={e => updateField('concerns', e.target.value)}
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
              placeholder="Issues observed, reliability concerns..."
            />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Other Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => updateField('notes', e.target.value)}
              rows={2}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
              placeholder="Anything else..."
            />
          </div>
        </div>
      </div>

      </>}

      {/* ═══ INSPECTION TAB ═══ */}
      {formTab === 'inspection' && <>
        {/* ASK Section */}
        <div className="bg-surface p-4 rounded-lg border border-border space-y-4">
          <h2 className="font-bold text-lg">Ask the Team</h2>

          <div>
            <label className="text-sm text-textSecondary block mb-1">What wheels do they use?</label>
            <input type="text" value={formData.wheelsType} onChange={e => updateField('wheelsType', e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary" placeholder="e.g., Colsons, Traction, Omni..." />
          </div>

          {([
            { field: 'batteryStrappedDown' as const, label: 'Is their battery strapped down?' },
            { field: 'mainBreakerProtected' as const, label: 'Is their main breaker protected?' },
            { field: 'functionChecksBetweenMatches' as const, label: 'Do they run function checks between matches?' },
            { field: 'unusedPortsCovered' as const, label: 'Do they cover unused RoboRio ports?' },
            { field: 'ferrulesAndHotGlue' as const, label: 'Do they use ferrules & hot glue on wires?' },
          ]).map(({ field, label }) => (
            <div key={field} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <div className="flex gap-2">
                {([true, false] as const).map(val => (
                  <button key={String(val)} onClick={() => updateField(field, formData[field] === val ? null : val)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      formData[field] === val
                        ? val === true ? 'bg-success/20 border-success text-success'
                        : 'bg-danger/20 border-danger text-danger'
                        : 'bg-card border-border hover:border-textSecondary'
                    }`}
                  >
                    {val === true ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label className="text-sm text-textSecondary block mb-1">Wire connector type (WAGOs preferred)</label>
            <input type="text" value={formData.wireConnectorType} onChange={e => updateField('wireConnectorType', e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary" placeholder="WAGOs, solder, crimps..." />
          </div>

          <div>
            <label className="text-sm text-textSecondary block mb-1">Any fragile mechanisms?</label>
            <textarea value={formData.fragileMechanisms} onChange={e => updateField('fragileMechanisms', e.target.value)}
              rows={2} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none" placeholder="Describe fragile parts..." />
          </div>
        </div>

        {/* OBSERVE Section */}
        <div className="bg-surface p-4 rounded-lg border border-border space-y-4">
          <h2 className="font-bold text-lg">Observe</h2>

          {([
            { field: 'buildQuality' as const, label: 'Build Quality', lowLabel: 'Zip ties/tape', highLabel: 'Bolted/riveted', inverted: false, photoField: null },
            { field: 'wiringQuality' as const, label: 'Wiring Quality', lowLabel: "Rat's nest", highLabel: 'Organized', inverted: false, photoField: 'wiringPhotoUrl' as const },
            { field: 'robotComplexity' as const, label: 'Robot Complexity', lowLabel: 'Very complex (hard to repair)', highLabel: 'Simple (easy to fix)', inverted: false, photoField: 'complexityPhotoUrl' as const },
          ]).map(({ field, label, lowLabel, highLabel, inverted, photoField }) => {
            const val = formData[field];
            const photoUrl = photoField ? formData[photoField] : null;
            const cameraRef = photoField === 'wiringPhotoUrl' ? wiringCameraRef : complexityCameraRef;
            const getColor = (v: number | null) => {
              if (v === null) return { text: 'text-textMuted', bg: 'bg-card', accent: undefined };
              const good = inverted ? v <= 2 : v >= 4;
              const bad = inverted ? v >= 4 : v <= 2;
              if (good) return { text: 'text-success', bg: 'bg-success/10', accent: '#22c55e' };
              if (bad) return { text: 'text-danger', bg: 'bg-danger/10', accent: '#ef4444' };
              return { text: 'text-warning', bg: 'bg-warning/10', accent: '#eab308' };
            };
            const colors = getColor(val);
            return (
              <div key={field} className={`p-3 rounded-lg border border-border ${colors.bg} transition-colors`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{label}</span>
                  <span className={`text-lg font-bold ${colors.text}`}>{val ?? '—'}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={val ?? 3}
                  onChange={e => updateField(field, parseInt(e.target.value))}
                  className="w-full accent-current"
                  style={{ accentColor: colors.accent }}
                />
                <div className="flex justify-between mt-1">
                  <span className={`text-xs ${inverted ? 'text-success' : 'text-danger'}`}>{lowLabel}</span>
                  <span className={`text-xs ${inverted ? 'text-danger' : 'text-success'}`}>{highLabel}</span>
                </div>

                {/* Inline photo for wiring & complexity */}
                {photoField && (
                  <div className="mt-2">
                    {photoUrl ? (
                      <div className="relative inline-block">
                        <img src={photoUrl} alt={`${label} photo`} className="w-full max-w-xs h-32 object-cover rounded-lg bg-card border border-border" />
                        <button
                          onClick={() => updateField(photoField, null)}
                          className="absolute top-1 right-1 p-0.5 bg-danger text-white rounded-full"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => cameraRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-card border border-dashed border-border rounded-lg hover:border-success hover:bg-success/5 transition-colors text-sm text-textSecondary"
                      >
                        <Camera size={16} />
                        Snap a photo
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Hidden camera inputs for wiring & complexity photos */}
          <input ref={wiringCameraRef} type="file" accept="image/*" capture="environment" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !selectedTeam) return;
            try {
              const result = await uploadPhoto(selectedTeam, eventCode, file);
              updateField('wiringPhotoUrl', result.url);
            } catch {
              setPhotoError('Photo upload failed — reconnect and try again.');
              setTimeout(() => setPhotoError(null), 4000);
            }
            e.target.value = '';
          }} className="hidden" />
          <input ref={complexityCameraRef} type="file" accept="image/*" capture="environment" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !selectedTeam) return;
            try {
              const result = await uploadPhoto(selectedTeam, eventCode, file);
              updateField('complexityPhotoUrl', result.url);
            } catch {
              setPhotoError('Photo upload failed — reconnect and try again.');
              setTimeout(() => setPhotoError(null), 4000);
            }
            e.target.value = '';
          }} className="hidden" />
        </div>
      </>}

      {/* ═══ NOTES TAB ═══ */}
      {formTab === 'notes' && selectedTeam && <>
        {ninjaStore.notesQueue.some(op => op.note.teamNumber === selectedTeam) && (
          <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 text-warning px-4 py-2.5 rounded-lg text-sm">
            <WifiOff size={15} />
            <span>Notes saved locally — will sync when reconnected</span>
          </div>
        )}

        {/* Add note form */}
        <div className="bg-surface p-4 rounded-lg border border-border space-y-3">
          <h2 className="font-bold text-lg">Add Note</h2>

          {/* Context first: match # and category */}
          <div className="flex gap-2 items-center">
            <input type="number" value={noteMatchNum} onChange={e => setNoteMatchNum(e.target.value)}
              placeholder="Match #" className="w-24 bg-card border border-border rounded-lg px-3 py-2 text-sm" />
            <select value={noteCategory} onChange={e => setNoteCategory(e.target.value as NinjaCategory)}
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm">
              <option value="general">General</option>
              <option value="fix">Fix / Issue</option>
              <option value="conversation">Conversation</option>
            </select>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(NINJA_TAG_LABELS) as NinjaTag[]).map(tag => (
              <button key={tag} onClick={() => setNoteTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  noteTags.includes(tag) ? `${NINJA_TAG_COLORS[tag]} ring-1 ring-current` : 'bg-surfaceElevated text-textSecondary hover:bg-interactive'
                }`}
              >
                {NINJA_TAG_LABELS[tag]}
              </button>
            ))}
          </div>

          {/* Note text */}
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            rows={3}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-textPrimary resize-none"
            placeholder="What did you observe about this team?"
          />

          {/* Note photos */}
          {notePhotos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {notePhotos.map((photo, idx) => (
                <div key={idx} className="relative">
                  <img src={photo.preview} alt={`Note photo ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg bg-card" />
                  <button
                    onClick={() => setNotePhotos(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1 -right-1 p-0.5 bg-danger text-white rounded-full"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {notePhotos.length < 3 && (
              <button
                onClick={() => noteCameraInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-card border border-dashed border-border rounded-lg hover:border-success hover:bg-success/5 transition-colors text-sm text-textSecondary"
              >
                <Camera size={16} />
                Photo
              </button>
            )}
            <button
              disabled={!noteText.trim()}
              onClick={async () => {
                if (!noteText.trim() || !user?.email) return;
                // Upload note photos — skip if offline (photos require connectivity)
                const uploadedPhotos: { url: string; path: string; caption: string }[] = [];
                if (notePhotos.length > 0) {
                  if (!navigator.onLine) {
                    setPhotoError('Photos require connectivity — note will be saved without them.');
                    setTimeout(() => setPhotoError(null), 4000);
                  } else {
                    for (const photo of notePhotos) {
                      try {
                        const result = await uploadPhoto(selectedTeam, eventCode, photo.file);
                        uploadedPhotos.push({ url: result.url, path: result.path, caption: '' });
                      } catch {
                        setPhotoError('Photo upload failed — note saved without it.');
                        setTimeout(() => setPhotoError(null), 4000);
                      }
                    }
                  }
                }
                await ninjaStore.addNote(eventCode, {
                  teamNumber: selectedTeam,
                  authorEmail: user.email,
                  authorName: user.displayName || user.email,
                  text: noteText.trim(),
                  category: noteCategory,
                  tags: noteTags,
                  matchNumber: noteMatchNum ? parseInt(noteMatchNum) : null,
                  photos: uploadedPhotos,
                });
                setNoteText('');
                setNoteTags([]);
                setNoteMatchNum('');
                setNotePhotos([]);
              }}
              className="flex-1 px-4 py-2 bg-blueAlliance text-white rounded-lg font-medium disabled:opacity-50 hover:bg-blueAlliance/90 transition-colors"
            >
              Add Note
            </button>
          </div>

          <input ref={noteCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleNotePhotoCapture} className="hidden" />
        </div>

        {/* Existing notes */}
        <div className="space-y-2">
          {ninjaStore.notes
            .filter(n => n.teamNumber === selectedTeam)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(note => (
              <div key={note.id} className={`bg-surface p-3 rounded-lg border ${note.id.startsWith('offline_') ? 'border-warning/40' : 'border-border'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-textSecondary">{note.authorName}</span>
                  {note.matchNumber && <span className="text-xs text-blueAlliance font-medium">Q{note.matchNumber}</span>}
                  {note.id.startsWith('offline_') && <WifiOff size={11} className="text-warning" aria-label="Pending sync" />}
                  <span className="text-xs text-textMuted ml-auto">{new Date(note.createdAt).toLocaleString()}</span>
                  {(isAdmin || note.authorEmail === userEmail) && editingNoteId !== note.id && (
                    <div className="flex gap-1 ml-1">
                      <button
                        onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.text); }}
                        className="p-1 text-textMuted hover:text-blueAlliance transition-colors"
                        title="Edit note"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this note?')) ninjaStore.deleteNote(eventCode, note.id); }}
                        className="p-1 text-textMuted hover:text-danger transition-colors"
                        title="Delete note"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editNoteText}
                      onChange={e => setEditNoteText(e.target.value)}
                      rows={3}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-textPrimary resize-none focus:outline-none focus:border-blueAlliance"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (editNoteText.trim()) {
                            await ninjaStore.updateNote(eventCode, note.id, { text: editNoteText.trim() });
                          }
                          setEditingNoteId(null);
                          setEditNoteText('');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-success text-background rounded-lg text-sm font-medium hover:bg-success/90 transition-colors"
                      >
                        <Check size={14} />
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingNoteId(null); setEditNoteText(''); }}
                        className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-textSecondary hover:bg-interactive transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-textPrimary whitespace-pre-wrap">{note.text}</p>
                )}
                {note.photos && note.photos.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {note.photos.map((photo, i) => (
                      <img key={i} src={typeof photo === 'string' ? photo : photo.url} alt={`Note photo ${i + 1}`} className="w-20 h-20 object-cover rounded-lg bg-card border border-border" />
                    ))}
                  </div>
                )}
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {note.tags.map(tag => (
                      <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${NINJA_TAG_COLORS[tag]}`}>
                        {NINJA_TAG_LABELS[tag]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          }
          {ninjaStore.notes.filter(n => n.teamNumber === selectedTeam).length === 0 && (
            <p className="text-textMuted text-center py-6">No notes yet for this team</p>
          )}
        </div>
      </>}

      {/* Submit Button (Fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.coachName.trim()}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 font-bold text-lg rounded-lg transition-colors ${
              saved
                ? savedOffline ? 'bg-warning text-background' : 'bg-success text-background'
                : 'bg-success text-background hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {saving ? (
              <Loader2 size={24} className="animate-spin" />
            ) : saved ? (
              savedOffline ? (
                <>
                  <WifiOff size={24} />
                  Saved offline
                </>
              ) : (
                <>
                  <CheckCircle size={24} />
                  Saved!
                </>
              )
            ) : (
              <>
                <Save size={24} />
                Save Entry
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PitScouting;
