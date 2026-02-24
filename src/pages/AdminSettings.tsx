import { useState } from 'react';
import { Shield, UserPlus, Trash2, Crown, UserCheck, UserX, Clock, Settings, Hash, Pencil, Check, X, Loader, Database, RefreshCw, Play, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { EventConfig } from '../contexts/AuthContext';
import { useAnalyticsStore } from '../store/useAnalyticsStore';
import { usePickListStore } from '../store/usePickListStore';

function AdminSettings() {
  const {
    isAdmin,
    accessConfig,
    accessRequests,
    addAllowedEmail,
    removeAllowedEmail,
    addAdminEmail,
    removeAdminEmail,
    approveRequest,
    denyRequest,
    user,
    eventConfig,
    userProfiles,
    setEventConfig,
    setUserProfile,
  } = useAuth();

  const fetchTBAData = useAnalyticsStore(s => s.fetchTBAData);
  const clearPickList = usePickListStore(s => s.clearPickList);
  const initializePickList = usePickListStore(s => s.initializePickList);
  const importFromTBARankings = usePickListStore(s => s.importFromTBARankings);

  // Scout data state
  const syncMeta = useAnalyticsStore(s => s.syncMeta);
  const scoutEntries = useAnalyticsStore(s => s.scoutEntries);
  const teamStatistics = useAnalyticsStore(s => s.teamStatistics);
  const pgTbaMatches = useAnalyticsStore(s => s.pgTbaMatches);
  const triggerSync = useAnalyticsStore(s => s.triggerSync);

  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Event config form state (seeded from Firestore when available)
  const [eventCodeInput, setEventCodeInput] = useState(eventConfig?.eventCode ?? '');
  const [homeTeamInput, setHomeTeamInput] = useState(String(eventConfig?.homeTeamNumber ?? 148));
  const [eventSaving, setEventSaving] = useState(false);
  const [eventStatusMsg, setEventStatusMsg] = useState<string | null>(null);

  // Inline name editing state
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  if (!isAdmin) {
    return (
      <div className="text-center py-16">
        <Shield size={48} className="mx-auto mb-4 text-textMuted" />
        <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
        <p className="text-textSecondary">Only admins can manage access settings.</p>
      </div>
    );
  }

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  };

  // ── Event Config ──────────────────────────────────────────────────────────

  const handleSaveEventConfig = async () => {
    const code = eventCodeInput.trim().toLowerCase();
    const teamNum = parseInt(homeTeamInput);
    if (!code) { flash('Event code cannot be empty.'); return; }
    if (isNaN(teamNum) || teamNum <= 0) { flash('Home team number must be a positive number.'); return; }

    setEventSaving(true);
    setEventStatusMsg('Saving event config…');

    // 1. Push to Firestore — all users auto-update via onSnapshot
    const config: EventConfig = { eventCode: code, homeTeamNumber: teamNum };
    await setEventConfig(config);

    // 2. Fetch TBA data for the new event
    setEventStatusMsg('Fetching TBA data…');
    const tbaData = await fetchTBAData(code);

    // 3. Reset + re-initialize pick list
    setEventStatusMsg('Resetting pick list…');
    clearPickList();
    initializePickList(code);
    if (tbaData?.rankings && tbaData.rankings.rankings.length > 0) {
      importFromTBARankings(tbaData.rankings);
    }

    setEventSaving(false);
    setEventStatusMsg(null);
    const rankCount = tbaData?.teams?.length ?? 0;
    flash(`Event set to ${code} · ${rankCount} teams loaded · Pick list reset · All users synced.`);
  };

  // ── Users ─────────────────────────────────────────────────────────────────

  const handleAddEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { flash('Please enter a valid email address.'); return; }
    await addAllowedEmail(email);
    setNewEmail('');
    flash(`Added ${email} to allowed users.`);
  };

  const handleApprove = async (email: string) => {
    await approveRequest(email);
    flash(`Approved ${email}.`);
  };

  const handleDeny = async (email: string) => {
    await denyRequest(email);
    flash(`Denied request from ${email}.`);
  };

  const handlePromoteToAdmin = async (email: string) => {
    if (confirm(`Make ${email} an admin? They will be able to manage the access list.`)) {
      await addAdminEmail(email);
      flash(`${email} is now an admin.`);
    }
  };

  const handleDemoteFromAdmin = async (email: string) => {
    if (email.toLowerCase() === user?.email?.toLowerCase()) {
      if (!confirm('Are you sure you want to remove your own admin access?')) return;
    }
    await removeAdminEmail(email);
    flash(`${email} is no longer an admin.`);
  };

  const handleRemoveEmail = async (email: string) => {
    if (confirm(`Remove ${email} from the access list? They will no longer be able to use the app.`)) {
      await removeAllowedEmail(email);
      if (accessConfig?.adminEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
        await removeAdminEmail(email);
      }
      flash(`Removed ${email}.`);
    }
  };

  const startEditing = (email: string) => {
    const profile = userProfiles[email.toLowerCase()];
    setEditFirst(profile?.firstName ?? '');
    setEditLast(profile?.lastName ?? '');
    setEditingEmail(email.toLowerCase());
  };

  const handleSaveName = async () => {
    if (!editingEmail) return;
    setEditSaving(true);
    await setUserProfile(editingEmail, { firstName: editFirst.trim(), lastName: editLast.trim() });
    setEditSaving(false);
    setEditingEmail(null);
    flash(`Updated name for ${editingEmail}.`);
  };

  const allEmails = accessConfig?.allowedEmails ?? [];
  const adminEmails = new Set((accessConfig?.adminEmails ?? []).map(e => e.toLowerCase()));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Admin Settings</h1>
        <p className="text-textSecondary text-sm">Manage event configuration and team access.</p>
      </div>

      {/* ── Event Configuration ────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Settings size={20} />
          Event Configuration
        </h2>
        <p className="text-xs text-textSecondary mb-4">
          Setting a new event here immediately updates all connected users.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-1">Event Code</label>
            <input
              type="text"
              value={eventCodeInput}
              onChange={e => setEventCodeInput(e.target.value.toLowerCase())}
              placeholder="e.g. 2026txcmp1"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success text-sm"
            />
            <p className="text-xs text-textMuted mt-1">
              Find codes on{' '}
              <a href="https://www.thebluealliance.com/events" target="_blank" rel="noopener noreferrer" className="text-blueAlliance hover:underline">
                TBA Events
              </a>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-1 flex items-center gap-1">
              <Hash size={14} />
              Home Team Number
            </label>
            <input
              type="number"
              value={homeTeamInput}
              onChange={e => setHomeTeamInput(e.target.value)}
              placeholder="148"
              min={1}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success text-sm"
            />
            <p className="text-xs text-textMuted mt-1">Highlights your team in match lists and predictions</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleSaveEventConfig}
            disabled={eventSaving}
            className="flex items-center gap-2 px-5 py-2 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm disabled:opacity-60"
          >
            {eventSaving ? <Loader size={16} className="animate-spin" /> : <Settings size={16} />}
            {eventSaving ? (eventStatusMsg ?? 'Working…') : 'Save Event & Initialize'}
          </button>
          {eventConfig && (
            <span className="text-xs text-textMuted">
              Current: <span className="text-textSecondary font-medium">{eventConfig.eventCode}</span>
              {' · '}Team <span className="text-textSecondary font-medium">{eventConfig.homeTeamNumber}</span>
              {eventConfig.updatedBy && (
                <> · by <span className="text-textSecondary">{eventConfig.updatedBy.split('@')[0]}</span></>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Data Sync Status ──────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
          <Database size={20} />
          Scout Data Sync
        </h2>
        <p className="text-xs text-textSecondary mb-4">
          Scouting data synced from Postgres to Firestore via Cloud Function.
        </p>

        {/* Sync status cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">Scout Entries</p>
            <p className="text-xl font-bold">{scoutEntries.length}</p>
            {syncMeta && <p className="text-xs text-textMuted">{syncMeta.scoutEntriesCount} synced</p>}
          </div>
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">Teams</p>
            <p className="text-xl font-bold">{teamStatistics.length}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">TBA Matches</p>
            <p className="text-xl font-bold">{pgTbaMatches.length}</p>
          </div>
          <div className="bg-card rounded-lg p-3 border border-border">
            <p className="text-xs text-textMuted mb-1">Last Sync</p>
            <p className="text-sm font-semibold">
              {syncMeta?.lastSyncAt
                ? new Date(syncMeta.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Never'}
            </p>
            {syncMeta?.syncDurationMs != null && (
              <p className="text-xs text-textMuted">{(syncMeta.syncDurationMs / 1000).toFixed(1)}s · {syncMeta.lastSyncBy}</p>
            )}
          </div>
        </div>

        {/* Sync error display */}
        {(syncMeta?.error || syncError) && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {syncError || `Last sync error: ${syncMeta?.error}`}
          </div>
        )}

        {/* Sync Now button + Auto-sync toggle */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={async () => {
              const code = eventConfig?.eventCode;
              if (!code) { flash('Set an event code first.'); return; }
              setSyncing(true);
              setSyncError(null);
              try {
                const result = await triggerSync(code);
                flash(`Synced ${result.scoutEntriesCount} entries, ${result.tbaMatchesCount} matches in ${(result.syncDurationMs / 1000).toFixed(1)}s`);
              } catch (err: any) {
                setSyncError(err?.message || 'Sync failed');
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing || !eventConfig?.eventCode}
            className="flex items-center gap-2 px-5 py-2 bg-blueAlliance text-white font-semibold rounded-lg hover:bg-blueAlliance/90 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>

          <button
            onClick={async () => {
              if (!eventConfig) return;
              const newVal = !eventConfig.autoSyncEnabled;
              await setEventConfig({ ...eventConfig, autoSyncEnabled: newVal });
              flash(newVal ? 'Auto-sync enabled (every 15 min)' : 'Auto-sync disabled');
            }}
            className="flex items-center gap-2 text-sm text-textSecondary hover:text-textPrimary transition-colors"
          >
            {eventConfig?.autoSyncEnabled ? (
              <ToggleRight size={24} className="text-success" />
            ) : (
              <ToggleLeft size={24} className="text-textMuted" />
            )}
            Auto-sync {eventConfig?.autoSyncEnabled ? 'on' : 'off'}
          </button>
        </div>

        {scoutEntries.length === 0 && !syncing && (
          <div className="flex items-center gap-2 p-3 mt-4 bg-warning/10 rounded-lg border border-warning/30 text-sm text-warning">
            <RefreshCw size={14} />
            No scout data loaded — click Sync Now to pull from Postgres
          </div>
        )}
      </div>

      {/* ── Pending Access Requests ────────────────────────────────────────── */}
      {accessRequests.length > 0 && (
        <div className="bg-warning/10 rounded-lg border-2 border-warning p-4 md:p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-warning">
            <Clock size={20} />
            Pending Requests ({accessRequests.length})
          </h2>
          <div className="space-y-3">
            {accessRequests.map(request => (
              <div key={request.email} className="flex items-center gap-3 px-4 py-3 bg-surface rounded-lg border border-border">
                {request.photoURL ? (
                  <img src={request.photoURL} alt="" className="h-8 w-8 rounded-full flex-shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-surfaceElevated flex items-center justify-center flex-shrink-0 text-sm font-bold text-textSecondary">
                    {(request.firstName?.[0] ?? request.email[0]).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {request.firstName && request.lastName
                      ? `${request.firstName} ${request.lastName}`
                      : request.displayName}
                  </p>
                  <p className="text-xs text-textSecondary truncate">{request.email}</p>
                </div>
                <span className="text-xs text-textMuted hidden sm:block">
                  {new Date(request.requestedAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(request.email)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors text-sm"
                  >
                    <UserCheck size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(request.email)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/10 text-danger font-semibold rounded-lg hover:bg-danger/20 transition-colors text-sm"
                  >
                    <UserX size={14} />
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Status ────────────────────────────────────────────────────────── */}
      {status && (
        <div className="p-3 bg-success/10 border border-success/30 rounded-lg text-success text-sm">
          {status}
        </div>
      )}

      {/* ── Add New User ───────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <UserPlus size={20} />
          Add Team Member
        </h2>
        <div className="flex gap-3">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddEmail()}
            placeholder="teammate@gmail.com"
            className="flex-1 px-4 py-2.5 bg-card border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-success"
          />
          <button
            onClick={handleAddEmail}
            className="flex items-center gap-2 px-6 py-2.5 bg-success text-background font-semibold rounded-lg hover:bg-success/90 transition-colors"
          >
            <UserPlus size={18} />
            Add
          </button>
        </div>
      </div>

      {/* ── Approved Users ─────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-lg border border-border p-4 md:p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Shield size={20} />
          Approved Users ({allEmails.length})
        </h2>

        {allEmails.length === 0 ? (
          <p className="text-textMuted text-center py-8">No users added yet. Add your first team member above.</p>
        ) : (
          <div className="space-y-2">
            {allEmails.map(email => {
              const normalizedEmail = email.toLowerCase();
              const profile = userProfiles[normalizedEmail];
              const isEmailAdmin = adminEmails.has(normalizedEmail);
              const isMe = normalizedEmail === user?.email?.toLowerCase();
              const isEditing = editingEmail === normalizedEmail;
              const initials = profile
                ? `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() || normalizedEmail[0].toUpperCase()
                : normalizedEmail[0].toUpperCase();
              const displayName = profile
                ? `${profile.firstName} ${profile.lastName}`.trim() || profile.displayName
                : null;

              return (
                <div key={email} className="bg-card rounded-lg overflow-hidden">
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Avatar */}
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="" className="h-9 w-9 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-surfaceElevated flex items-center justify-center flex-shrink-0 text-sm font-bold text-textSecondary">
                        {initials}
                      </div>
                    )}

                    {/* Name + email */}
                    <div className="flex-1 min-w-0">
                      {displayName ? (
                        <>
                          <p className="text-sm font-semibold leading-tight">
                            {displayName}
                            {isMe && <span className="text-textMuted font-normal ml-1">(you)</span>}
                          </p>
                          <p className="text-xs text-textSecondary truncate">{email}</p>
                        </>
                      ) : (
                        <p className="text-sm font-medium">
                          {email}
                          {isMe && <span className="text-textMuted ml-1">(you)</span>}
                        </p>
                      )}
                    </div>

                    {isEmailAdmin && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-warning/20 text-warning rounded text-xs font-semibold">
                        <Crown size={12} />
                        admin
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      {/* Edit name */}
                      <button
                        onClick={() => isEditing ? setEditingEmail(null) : startEditing(email)}
                        className={`p-1.5 rounded transition-colors ${isEditing ? 'text-blueAlliance bg-interactive' : 'text-textMuted hover:text-blueAlliance hover:bg-interactive'}`}
                        title="Edit name"
                      >
                        <Pencil size={14} />
                      </button>

                      {!isEmailAdmin ? (
                        <button
                          onClick={() => handlePromoteToAdmin(email)}
                          className="p-1.5 rounded text-textMuted hover:text-warning hover:bg-interactive transition-colors"
                          title="Make admin"
                        >
                          <Crown size={14} />
                        </button>
                      ) : (
                        adminEmails.size > 1 && (
                          <button
                            onClick={() => handleDemoteFromAdmin(email)}
                            className="p-1.5 rounded text-warning hover:text-textMuted hover:bg-interactive transition-colors"
                            title="Remove admin"
                          >
                            <Crown size={14} />
                          </button>
                        )
                      )}
                      <button
                        onClick={() => handleRemoveEmail(email)}
                        className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                        title="Remove access"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <div className="px-4 pb-3 border-t border-border/50 pt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={editFirst}
                        onChange={e => setEditFirst(e.target.value)}
                        placeholder="First name"
                        className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-blueAlliance text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editLast}
                        onChange={e => setEditLast(e.target.value)}
                        placeholder="Last name"
                        className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-textPrimary placeholder-textMuted focus:outline-none focus:border-blueAlliance text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={editSaving}
                        className="p-1.5 rounded bg-success text-background hover:bg-success/90 transition-colors disabled:opacity-60"
                        title="Save name"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingEmail(null)}
                        className="p-1.5 rounded text-textMuted hover:text-danger hover:bg-interactive transition-colors"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Info ──────────────────────────────────────────────────────────── */}
      <div className="bg-surfaceElevated rounded-lg border border-border p-4 text-sm text-textSecondary space-y-2">
        <p><strong>How it works:</strong></p>
        <ul className="list-disc list-inside space-y-1 text-textMuted">
          <li>Event code and home team are pushed to all connected users instantly via Firestore</li>
          <li>Only emails on this list can sign in and use the app</li>
          <li>Team members can request access from the login page</li>
          <li>Alliance selection join links still work for anyone (no account needed)</li>
          <li>The first person to sign in automatically becomes admin</li>
          <li>Click the pencil icon to manually set a name for any user</li>
        </ul>
      </div>
    </div>
  );
}

export default AdminSettings;
